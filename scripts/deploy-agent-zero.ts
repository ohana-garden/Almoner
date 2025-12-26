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
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as any;
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function getValidatedToken(): Promise<string> {
  console.log("\n⚠️  Railway API Token required.");
  while (true) {
    const token = await prompt("Paste your Railway API Token: ");
    if (!token) continue;
    try {
      const data = await gqlRequest(`query { me { email } }`, {}, token);
      console.log(`✅ Authenticated as ${data.me.email}\n`);
      return token;
    } catch (e) { console.error(`❌ Authorization failed. Try again.`); }
  }
}

async function main() {
  const token = await getValidatedToken();
  console.log('🚀 Starting Deployment...');

  // 1. Get Project ID
  let projectId = '';
  console.log('🔍 Scanning projects...');
  const data = await gqlRequest(`query { projects { edges { node { id name services { edges { node { id name } } } } } } }`, {}, token);
  
  const allProjects = data.projects.edges.map((e: any) => e.node);
  const almonerProject = allProjects.find((p: any) => p.services.edges.some((s: any) => s.node.name.toLowerCase().includes('almoner')));

  if (almonerProject) {
    console.log(`✅ Auto-detected Project: ${almonerProject.name}`);
    projectId = almonerProject.id;
  } else {
    console.log(`⚠️  Could not auto-detect project.`);
    console.log(`ℹ️  Paste the ID from your URL: railway.com/project/<UUID>`);
    while (!projectId) projectId = await prompt("Enter Project ID: ");
  }

  // 2. Check/Create Agent Zero Service
  console.log(`\nUsing Project ID: ${projectId}`);
  const projectDetails = await gqlRequest(`query($id: String!) { project(id: $id) { services { edges { node { id name } } } } }`, { id: projectId }, token);
  let serviceId = projectDetails.project.services.edges.find((s: any) => s.node.name === 'Agent Zero')?.node?.id;
  
  if (serviceId) {
    console.log(`ℹ️  Agent Zero service found (${serviceId})`);
  } else {
    console.log('✨ Creating new Agent Zero service...');
    const createRes = await gqlRequest(`
      mutation($projectId: String!, $repo: String!, $branch: String!) {
        serviceCreate(input: { projectId: $projectId, name: "Agent Zero", source: { repo: $repo }, branch: $branch }) { id }
      }
    `, { projectId, repo: GITHUB_REPO, branch: BRANCH }, token);
    serviceId = createRes.serviceCreate.id;
    console.log(`✅ Service Created: ${serviceId}`);
  }

  // 3. Inject Variables (OpenAI Key + Root Directory)
  console.log('🔐 Configuring Environment Variables...');
  const envRes = await gqlRequest(`query($projectId: String!) { project(id: $projectId) { environments { edges { node { id name } } } } }`, { projectId }, token);
  const envId = envRes.project.environments.edges[0].node.id;

  const vars = {
    "OPENAI_API_KEY": process.env.OPENAI_API_KEY || "",
    "RAILWAY_ROOT": "agent-zero-service" // Sets root directory via Env Var to avoid Schema issues
  };

  for (const [key, val] of Object.entries(vars)) {
    if (!val) {
        console.warn(`⚠️  Skipping ${key} (Not found in local env)`);
        continue;
    }
    await gqlRequest(`
      mutation($projectId: String!, $environmentId: String!, $serviceId: String!, $key: String!, $val: String!) {
        variableUpsert(input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, name: $key, value: $val })
      }
    `, { projectId, environmentId: envId, serviceId, key, val }, token);
    console.log(`   ✅ Set ${key}`);
  }

  // 4. Deploy
  console.log('🚀 Triggering Deployment...');
  await gqlRequest(`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  `, { environmentId: envId, serviceId }, token);

  // 5. Domain
  try {
    const domainRes = await gqlRequest(`
      mutation($environmentId: String!, $serviceId: String!) {
        serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId }) { domain }
      }
    `, { environmentId: envId, serviceId }, token);
    console.log(`\n🎉 Success! Agent Zero is deploying.`);
    console.log(`👉 URL: https://${domainRes.serviceDomainCreate.domain}`);
  } catch (e) {
    console.log(`\n🎉 Success! Agent Zero is deploying.`);
    console.log(`ℹ️  (Check Railway Dashboard for URL)`);
  }
}

main().catch((e) => { console.error(`\n❌ Script Failed: ${e.message}`); process.exit(1); });