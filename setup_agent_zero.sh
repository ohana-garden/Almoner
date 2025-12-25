#!/bin/bash
set -e

echo "🤖 Setting up Agent Zero Service..."

# ---------------------------------------------------------
# STEP 1: Create Service Directory & Configuration
# ---------------------------------------------------------
mkdir -p agent-zero-service/tools

# Create the Tool Definition (Connects Agent Zero to Almoner)
echo "📝 Creating agent-zero-service/tools/almoner.json..."
cat << 'JSON' > agent-zero-service/tools/almoner.json
{
  "name": "almoner",
  "type": "mcp",
  "url": "https://almoner-production.up.railway.app/mcp"
}
JSON

# Create the Dockerfile
# We extend the official image and bake in our configuration
echo "📝 Creating agent-zero-service/Dockerfile..."
cat << 'DOCKER' > agent-zero-service/Dockerfile
FROM agent0ai/agent-zero:latest

# Copy our Almoner tool configuration into the agent's tools directory
# The base image uses /app as the working directory
COPY tools/almoner.json /app/tools/almoner.json

# Expose the web UI port
EXPOSE 80

# Start the agent (inherited from base image)
CMD ["python", "main.py"]
DOCKER

# ---------------------------------------------------------
# STEP 2: Create the Deployment Script
# ---------------------------------------------------------
echo "📝 Creating scripts/deploy-agent-zero.ts..."
cat << 'TS_DEPLOY' > scripts/deploy-agent-zero.ts
/**
 * Script to deploy Agent Zero to the existing Railway project
 */
import 'dotenv/config';

const API_URL = 'https://backboard.railway.com/graphql/v2';
const GITHUB_REPO = process.env.GITHUB_REPO || 'ohana-garden/Almoner';
const BRANCH = process.env.RAILWAY_BRANCH || 'main';

async function gqlRequest(query: string, variables?: any) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('RAILWAY_API_TOKEN is required');
  
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function main() {
  console.log('🚀 Deploying Agent Zero to Railway...');

  // 1. Get Project ID (assume the one with Almoner)
  const me = await gqlRequest(\`query { me { projects { edges { node { id name services { edges { node { id name } } } } } } } }\`);
  
  // Find the project containing 'Almoner' service
  const project = me.me.projects.edges.find((p: any) => 
    p.node.services.edges.some((s: any) => s.node.name.toLowerCase().includes('almoner'))
  )?.node;

  if (!project) throw new Error('Could not find Railway project with Almoner service');
  console.log(\`✅ Found Project: \${project.name} (\${project.id})\`);

  // 2. Check if Agent Zero exists
  const existingService = project.services.edges.find((s: any) => s.node.name === 'Agent Zero')?.node;
  
  if (existingService) {
    console.log(\`ℹ️  Agent Zero service already exists (\${existingService.id})\`);
    // Trigger redeploy if needed, or just exit
    return;
  }

  // 3. Create Service
  console.log('Creating new Agent Zero service...');
  const createRes = await gqlRequest(\`
    mutation($projectId: String!, $repo: String!, $branch: String!) {
      serviceCreate(input: {
        projectId: $projectId
        name: "Agent Zero"
        source: {
          repo: $repo
        }
        branch: $branch
      }) {
        id
      }
    }
  \`, { projectId: project.id, repo: GITHUB_REPO, branch: BRANCH });
  
  const serviceId = createRes.serviceCreate.id;
  console.log(\`✅ Created Service: \${serviceId}\`);

  // 4. Configure Service (Root Directory)
  console.log('Configuring Root Directory...');
  await gqlRequest(\`
    mutation($serviceId: String!) {
      serviceUpdate(id: $serviceId, input: { rootDirectory: "agent-zero-service" }) {
        id
      }
    }
  \`, { serviceId });

  // 5. Add Domain
  console.log('Generating public domain...');
  // Need environment ID first
  const envRes = await gqlRequest(\`query($projectId: String!) { project(id: $projectId) { environments { edges { node { id name } } } } }\`, { projectId: project.id });
  const envId = envRes.project.environments.edges[0].node.id;

  try {
    const domainRes = await gqlRequest(\`
      mutation($environmentId: String!, $serviceId: String!) {
        serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId }) {
          domain
        }
      }
    \`, { environmentId: envId, serviceId });
    console.log(\`✅ Public Domain: https://\${domainRes.serviceDomainCreate.domain}\`);
  } catch (e) {
    console.log('ℹ️  Domain might already exist or creation failed:', e);
  }

  // 6. Deploy
  console.log('Triggering deployment...');
  await gqlRequest(\`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  \`, { environmentId: envId, serviceId });

  console.log('🎉 Agent Zero is deploying! Check Railway dashboard.');
}

main().catch(console.error);
TS_DEPLOY

# ---------------------------------------------------------
# STEP 3: Commit and Deploy
# ---------------------------------------------------------
echo "�� Committing Agent Zero Service..."
git add agent-zero-service/
git add scripts/deploy-agent-zero.ts
git commit -m "Feat: Added Agent Zero container service configuration"
git push origin main

echo "🚀 Triggering Railway Service Creation..."
# We use ts-node to run the script we just made
npx ts-node scripts/deploy-agent-zero.ts

echo "✅ Done! Agent Zero is being deployed."
