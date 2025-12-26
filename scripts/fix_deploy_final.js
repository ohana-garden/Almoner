const fs = require('fs');

const deployScript = `
import 'dotenv/config';
import * as readline from 'readline';

const fetch = globalThis.fetch;
const API_URL = 'https://backboard.railway.com/graphql/v2';
const GITHUB_REPO = process.env.GITHUB_REPO || 'ohana-garden/Almoner';
const BRANCH = process.env.RAILWAY_BRANCH || 'main';

function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function gqlRequest(query: string, variables: any = {}, token: string) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as any;
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function getValidatedToken(): Promise<string> {
  let token = process.env.RAILWAY_API_TOKEN;
  if (token) {
    try {
      const data = await gqlRequest(\`query { me { email } }\`, {}, token);
      console.log(\`✅ Authenticated as \${data.me.email}\`);
      return token;
    } catch (e) { console.log(\`❌ Environment token invalid.\`); }
  }
  console.log("\\n⚠️  Valid Railway API Token required.");
  while (true) {
    token = await prompt("Paste your Railway API Token: ");
    if (!token) continue;
    try {
      const data = await gqlRequest(\`query { me { email } }\`, {}, token);
      console.log(\`✅ Authenticated as \${data.me.email}\\n\`);
      return token;
    } catch (e) { console.error(\`❌ Authorization failed. Try again.\`); }
  }
}

async function main() {
  const token = await getValidatedToken();
  console.log('🚀 Starting Deployment...');

  // 1. Get ALL Projects (Personal + Teams)
  console.log('🔍 Scanning Personal and Team projects...');
  const data = await gqlRequest(\`
    query { 
      me { 
        projects { edges { node { id name services { edges { node { id name } } } } } }
        teams { edges { node { id name projects { edges { node { id name services { edges { node { id name } } } } } } } } }
      } 
    }
  \`, {}, token);
  
  let allProjects: any[] = [];
  
  // Add Personal Projects
  if (data.me.projects) {
    allProjects = allProjects.concat(data.me.projects.edges.map((e: any) => ({ ...e.node, source: 'Personal' })));
  }

  // Add Team Projects
  if (data.me.teams) {
    data.me.teams.edges.forEach((t: any) => {
        if (t.node.projects) {
            allProjects = allProjects.concat(t.node.projects.edges.map((p: any) => ({ ...p.node, source: \`Team: \${t.node.name}\` })));
        }
    });
  }

  console.log(\`   Found \${allProjects.length} total projects.\`);

  // 2. Select Project
  let project = allProjects.find((p: any) => p.services.edges.some((s: any) => s.node.name.toLowerCase().includes('almoner')));

  if (project) {
    console.log(\`✅ Auto-detected Project: \${project.name} (\${project.source})\`);
  } else {
    console.log("\\n⚠️  No 'Almoner' service found automatically. Select target project:");
    allProjects.forEach((p: any, i: number) => console.log(\`   \${i + 1}) \${p.name} [\${p.source}] (\${p.id})\`));
    
    while (!project) {
      const choice = await prompt("\\nEnter number: ");
      const idx = parseInt(choice);
      if (allProjects[idx - 1]) {
          project = allProjects[idx - 1];
      } else {
          console.log("❌ Invalid selection.");
      }
    }
  }
  
  console.log(\`✅ Using Project: \${project.name} (\${project.id})\`);

  // 3. Check/Create Agent Zero Service
  let serviceId;
  const existingService = project.services?.edges?.find((s: any) => s.node.name === 'Agent Zero')?.node;
  
  if (existingService) {
    console.log(\`ℹ️  Agent Zero service found (\${existingService.id})\`);
    serviceId = existingService.id;
  } else {
    console.log('✨ Creating Agent Zero service...');
    const createRes = await gqlRequest(\`
      mutation($projectId: String!, $repo: String!, $branch: String!) {
        serviceCreate(input: { projectId: $projectId, name: "Agent Zero", source: { repo: $repo }, branch: $branch }) { id }
      }
    \`, { projectId: project.id, repo: GITHUB_REPO, branch: BRANCH }, token);
    serviceId = createRes.serviceCreate.id;
  }

  // 4. Configure Root Directory
  console.log('📂 Configuring Root Directory...');
  await gqlRequest(\`
    mutation($serviceId: String!) {
      serviceUpdate(id: $serviceId, input: { rootDirectory: "agent-zero-service" }) { id }
    }
  \`, { serviceId }, token);

  // 5. Inject Secrets
  const envRes = await gqlRequest(\`query($projectId: String!) { project(id: $projectId) { environments { edges { node { id name } } } } }\`, { projectId: project.id }, token);
  const envId = envRes.project.environments.edges[0].node.id;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    console.log('🔐 Injecting OPENAI_API_KEY...');
    await gqlRequest(\`
      mutation($projectId: String!, $environmentId: String!, $serviceId: String!, $value: String!) {
        variableUpsert(input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, name: "OPENAI_API_KEY", value: $value })
      }
    \`, { projectId: project.id, environmentId: envId, serviceId, value: openaiKey }, token);
  } else {
    console.warn('⚠️  OPENAI_API_KEY not found. Please set it in Railway manually.');
  }

  // 6. Deploy
  console.log('🚀 Triggering Deployment...');
  await gqlRequest(\`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  \`, { environmentId: envId, serviceId }, token);

  // 7. Domain
  try {
    const domainRes = await gqlRequest(\`
      mutation($environmentId: String!, $serviceId: String!) {
        serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId }) { domain }
      }
    \`, { environmentId: envId, serviceId }, token);
    console.log(\`\\n🎉 Success! Agent Zero is deploying.\`);
    console.log(\`👉 URL: https://\${domainRes.serviceDomainCreate.domain}\`);
  } catch (e) {
    console.log(\`\\n🎉 Success! Agent Zero is deploying.\`);
    console.log(\`ℹ️  (Check dashboard for URL)\`);
  }
}

main().catch((e) => { console.error(\`\\n❌ Script Failed: \${e.message}\`); process.exit(1); });
`;

fs.writeFileSync('scripts/deploy-agent-zero.ts', deployScript.trim());
console.log("✅ Fixed deploy script written to scripts/deploy-agent-zero.ts");