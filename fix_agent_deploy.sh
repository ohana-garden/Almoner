#!/bin/bash
set -e

echo "🛠️  Fixing Deployment Script Syntax..."

# Rewrite the file with CLEAN syntax (no extra backslashes)
# We use 'TS_CLEAN' in single quotes so the shell writes exactly what matches the TS code.
cat << 'TS_CLEAN' > scripts/deploy-agent-zero.ts
/**
 * Script to deploy Agent Zero to the existing Railway project
 */
import 'dotenv/config';

// Ensure fetch is available (Node 18+)
const fetch = globalThis.fetch;

const API_URL = 'https://backboard.railway.com/graphql/v2';
const GITHUB_REPO = process.env.GITHUB_REPO || 'ohana-garden/Almoner';
const BRANCH = process.env.RAILWAY_BRANCH || 'main';

async function gqlRequest(query: string, variables?: any) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    console.error('❌ Error: RAILWAY_API_TOKEN is missing from .env file.');
    process.exit(1);
  }
  
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ query, variables }),
  });
  
  const json = await res.json() as any;
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function main() {
  console.log('🚀 Deploying Agent Zero to Railway...');

  // 1. Get Project ID (assume the one with Almoner)
  const me = await gqlRequest(`query { me { projects { edges { node { id name services { edges { node { id name } } } } } } } }`);
  
  // Find the project containing 'Almoner' service
  const project = me.me.projects.edges.find((p: any) => 
    p.node.services.edges.some((s: any) => s.node.name.toLowerCase().includes('almoner'))
  )?.node;

  if (!project) throw new Error('Could not find Railway project with Almoner service');
  console.log(`✅ Found Project: ${project.name} (${project.id})`);

  // 2. Check if Agent Zero exists
  const existingService = project.services.edges.find((s: any) => s.node.name === 'Agent Zero')?.node;
  
  if (existingService) {
    console.log(`ℹ️  Agent Zero service already exists (${existingService.id})`);
    return;
  }

  // 3. Create Service
  console.log('Creating new Agent Zero service...');
  const createRes = await gqlRequest(`
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
  `, { projectId: project.id, repo: GITHUB_REPO, branch: BRANCH });
  
  const serviceId = createRes.serviceCreate.id;
  console.log(`✅ Created Service: ${serviceId}`);

  // 4. Configure Service (Root Directory)
  console.log('Configuring Root Directory...');
  await gqlRequest(`
    mutation($serviceId: String!) {
      serviceUpdate(id: $serviceId, input: { rootDirectory: "agent-zero-service" }) {
        id
      }
    }
  `, { serviceId });

  // 5. Add Domain
  console.log('Generating public domain...');
  const envRes = await gqlRequest(`query($projectId: String!) { project(id: $projectId) { environments { edges { node { id name } } } } }`, { projectId: project.id });
  const envId = envRes.project.environments.edges[0].node.id;

  try {
    const domainRes = await gqlRequest(`
      mutation($environmentId: String!, $serviceId: String!) {
        serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId }) {
          domain
        }
      }
    `, { environmentId: envId, serviceId });
    console.log(`✅ Public Domain: https://${domainRes.serviceDomainCreate.domain}`);
  } catch (e) {
    console.log('ℹ️  Domain creation note:', e);
  }

  // 6. Deploy
  console.log('Triggering deployment...');
  await gqlRequest(`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  `, { environmentId: envId, serviceId });

  console.log('🎉 Agent Zero is deploying! Check Railway dashboard.');
}

main().catch(console.error);
TS_CLEAN

# Commit the fixed script so git is clean
echo "💾 Committing Fixed Script..."
git add scripts/deploy-agent-zero.ts
git commit -m "Fix: Corrected syntax in Agent Zero deployment script"
git push origin main

echo "🚀 Retrying Deployment..."
npx ts-node scripts/deploy-agent-zero.ts
