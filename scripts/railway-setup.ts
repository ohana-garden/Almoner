#!/usr/bin/env npx ts-node
/**
 * Railway Project Setup Script
 *
 * Creates and configures all services via Railway GraphQL API.
 *
 * Usage:
 *   export RAILWAY_API_TOKEN="your-token"  # From https://railway.com/account/tokens
 *   npx ts-node scripts/railway-setup.ts
 */

const API_URL = 'https://backboard.railway.com/graphql/v2';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    throw new Error('RAILWAY_API_TOKEN not set. Get one from https://railway.com/account/tokens');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json() as GraphQLResponse<T>;

  if (json.errors) {
    throw new Error(json.errors.map(e => e.message).join(', '));
  }

  return json.data as T;
}

async function prompt(question: string): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Railway Project Setup for Almoner');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get projects
  console.log('📂 Fetching your Railway projects...\n');
  const projectsData = await gql<{
    me: { projects: { edges: Array<{ node: { id: string; name: string } }> } }
  }>(`
    query {
      me {
        projects {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `);

  const projects = projectsData.me.projects.edges.map(e => e.node);
  projects.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (${p.id})`));

  const projectIndex = parseInt(await prompt('\nSelect project number: ')) - 1;
  const project = projects[projectIndex];
  if (!project) throw new Error('Invalid selection');

  console.log(`\n✓ Selected: ${project.name}\n`);

  // Get environments
  console.log('🌍 Fetching environments...\n');
  const envsData = await gql<{
    project: { environments: { edges: Array<{ node: { id: string; name: string } }> } }
  }>(`
    query($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `, { projectId: project.id });

  const environments = envsData.project.environments.edges.map(e => e.node);
  environments.forEach((e, i) => console.log(`  ${i + 1}. ${e.name} (${e.id})`));

  const envIndex = parseInt(await prompt('\nSelect environment number: ')) - 1;
  const environment = environments[envIndex];
  if (!environment) throw new Error('Invalid selection');

  console.log(`\n✓ Selected: ${environment.name}\n`);

  // Get services
  console.log('🔧 Fetching services...\n');
  const servicesData = await gql<{
    project: { services: { edges: Array<{ node: { id: string; name: string } }> } }
  }>(`
    query($projectId: String!) {
      project(id: $projectId) {
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `, { projectId: project.id });

  const services = servicesData.project.services.edges.map(e => e.node);
  services.forEach((s, i) => console.log(`  ${i + 1}. ${s.name} (${s.id})`));

  const findService = (name: string) => services.find(s =>
    s.name.toLowerCase().includes(name.toLowerCase())
  );

  // Auto-detect or prompt for services
  let almoner = findService('almoner');
  let graphiti = findService('graphiti');
  let falkordb = findService('falkordb') || findService('redis');

  if (!almoner) {
    const idx = parseInt(await prompt('\nSelect Almoner service number: ')) - 1;
    almoner = services[idx];
  }
  if (!graphiti) {
    const idx = parseInt(await prompt('Select Graphiti service number: ')) - 1;
    graphiti = services[idx];
  }
  if (!falkordb) {
    const idx = parseInt(await prompt('Select FalkorDB service number: ')) - 1;
    falkordb = services[idx];
  }

  console.log(`\n✓ Almoner:  ${almoner?.name}`);
  console.log(`✓ Graphiti: ${graphiti?.name}`);
  console.log(`✓ FalkorDB: ${falkordb?.name}\n`);

  if (!almoner || !graphiti || !falkordb) {
    throw new Error('All services must be selected');
  }

  // Configure Graphiti service
  console.log('⚙️  Configuring Graphiti service...');
  await gql(`
    mutation($serviceId: String!, $input: ServiceUpdateInput!) {
      serviceUpdate(id: $serviceId, input: $input) {
        id
      }
    }
  `, {
    serviceId: graphiti.id,
    input: {
      rootDirectory: 'graphiti-service',
    }
  });
  console.log('  ✓ Root directory set to graphiti-service\n');

  // Set variables helper
  const setVar = async (serviceId: string, name: string, value: string) => {
    await gql(`
      mutation($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `, {
      input: {
        projectId: project.id,
        environmentId: environment.id,
        serviceId,
        name,
        value,
      }
    });
    console.log(`  ✓ ${name}`);
  };

  // Set Almoner variables
  console.log('📝 Setting Almoner environment variables...');
  await setVar(almoner.id, 'FALKORDB_URL', `\${{${falkordb.name}.REDIS_URL}}`);
  await setVar(almoner.id, 'FALKORDB_GRAPH', 'almoner');
  await setVar(almoner.id, 'GRAPHITI_ENDPOINT', `http://\${{${graphiti.name}.RAILWAY_PRIVATE_DOMAIN}}:8000`);
  console.log('');

  // Set Graphiti variables
  console.log('📝 Setting Graphiti environment variables...');
  await setVar(graphiti.id, 'FALKORDB_URL', `\${{${falkordb.name}.REDIS_URL}}`);
  await setVar(graphiti.id, 'FALKORDB_GRAPH', 'almoner');

  const openaiKey = await prompt('Enter your OpenAI API Key: ');
  await setVar(graphiti.id, 'OPENAI_API_KEY', openaiKey);
  console.log('');

  // Trigger redeploys
  console.log('🚀 Triggering redeploys...');

  await gql(`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  `, { environmentId: environment.id, serviceId: almoner.id });
  console.log(`  ✓ ${almoner.name} redeploying`);

  await gql(`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  `, { environmentId: environment.id, serviceId: graphiti.id });
  console.log(`  ✓ ${graphiti.name} redeploying`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ Setup Complete!');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Check status at: https://railway.com/project/${project.id}\n`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
