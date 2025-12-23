#!/usr/bin/env npx ts-node
/**
 * Railway Full Deployment Script
 *
 * Deploys all Almoner services to Railway using the GraphQL API:
 * - FalkorDB (from template)
 * - Almoner (Node.js service)
 * - Graphiti (Python service)
 *
 * Prerequisites:
 * 1. Get API token from https://railway.com/account/tokens
 * 2. Set environment variables:
 *    - RAILWAY_API_TOKEN (required)
 *    - RAILWAY_PROJECT_ID (optional - creates new project if not set)
 *    - GITHUB_REPO (optional - defaults to ohana-garden/Almoner)
 *    - OPENAI_API_KEY (optional - for Graphiti service)
 *
 * Usage:
 *   export RAILWAY_API_TOKEN="your-token"
 *   npx ts-node scripts/deploy-railway.ts
 */

const API_URL = 'https://backboard.railway.com/graphql/v2';

// Default configuration
const DEFAULT_GITHUB_REPO = 'ohana-garden/Almoner';
const FALKORDB_TEMPLATE_CODE = 'falkordb'; // Railway template code
const GRAPH_NAME = 'almoner';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

interface Service {
  id: string;
  name: string;
}

interface Environment {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  environments: { edges: Array<{ node: Environment }> };
  services: { edges: Array<{ node: Service }> };
}

// Retry configuration
const MAX_RETRIES = 4;
const INITIAL_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gqlWithRetry<T>(
  query: string,
  variables?: Record<string, unknown>,
  retries = 0
): Promise<T> {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    throw new Error('RAILWAY_API_TOKEN not set. Get one from https://railway.com/account/tokens');
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json() as GraphQLResponse<T>;

    if (!response.ok) {
      const errorDetail = json.errors?.map(e => e.message).join(', ') || JSON.stringify(json);
      throw new Error(`HTTP ${response.status}: ${errorDetail}`);
    }

    if (json.errors) {
      const errorMsg = json.errors.map(e => e.message).join(', ');
      throw new Error(errorMsg);
    }

    return json.data as T;
  } catch (error) {
    if (retries < MAX_RETRIES && error instanceof Error &&
        (error.message.includes('network') ||
         error.message.includes('ECONNRESET') ||
         error.message.includes('timeout'))) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, retries);
      console.log(`  ⏳ Retrying in ${delay / 1000}s... (attempt ${retries + 2}/${MAX_RETRIES + 1})`);
      await sleep(delay);
      return gqlWithRetry(query, variables, retries + 1);
    }
    throw error;
  }
}

async function getMe(): Promise<{ id: string; email: string; teams: Array<{ id: string; name: string }> }> {
  const data = await gqlWithRetry<{
    me: { id: string; email: string; teams: { edges: Array<{ node: { id: string; name: string } }> } }
  }>(`
    query {
      me {
        id
        email
        teams {
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
  return {
    id: data.me.id,
    email: data.me.email,
    teams: data.me.teams.edges.map(e => e.node),
  };
}

async function getProject(projectId: string): Promise<Project | null> {
  try {
    const data = await gqlWithRetry<{ project: Project }>(`
      query($projectId: String!) {
        project(id: $projectId) {
          id
          name
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
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
    `, { projectId });
    return data.project;
  } catch {
    return null;
  }
}

async function createProject(name: string, teamId?: string): Promise<Project> {
  const input: Record<string, string> = { name };
  if (teamId) {
    input.teamId = teamId;
  }

  const data = await gqlWithRetry<{ projectCreate: Project }>(`
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
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
  `, { input });
  return data.projectCreate;
}

async function getTemplateDetails(code: string): Promise<{ id: string; serializedConfig: string } | null> {
  try {
    const data = await gqlWithRetry<{
      template: { id: string; serializedConfig: string }
    }>(`
      query($code: String!) {
        template(code: $code) {
          id
          serializedConfig
        }
      }
    `, { code });
    return data.template;
  } catch {
    return null;
  }
}

async function deployTemplate(
  templateId: string,
  projectId: string,
  environmentId: string,
  serializedConfig: string
): Promise<{ projectId: string; workflowId: string }> {
  const data = await gqlWithRetry<{
    templateDeployV2: { projectId: string; workflowId: string }
  }>(`
    mutation($input: TemplateDeployV2Input!) {
      templateDeployV2(input: $input) {
        projectId
        workflowId
      }
    }
  `, {
    input: {
      templateId,
      projectId,
      environmentId,
      serializedConfig,
    }
  });
  return data.templateDeployV2;
}

async function createService(
  projectId: string,
  name: string,
  repo: string,
  branch?: string,
  rootDirectory?: string
): Promise<Service> {
  const source: Record<string, string> = { repo };

  const data = await gqlWithRetry<{ serviceCreate: Service }>(`
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `, {
    input: {
      projectId,
      name,
      source,
      branch,
    }
  });

  // If rootDirectory is specified, update the service
  if (rootDirectory) {
    await gqlWithRetry(`
      mutation($id: String!, $input: ServiceUpdateInput!) {
        serviceUpdate(id: $id, input: $input) {
          id
        }
      }
    `, {
      id: data.serviceCreate.id,
      input: { rootDirectory }
    });
  }

  return data.serviceCreate;
}

async function createServiceFromImage(
  projectId: string,
  name: string,
  image: string
): Promise<Service> {
  const data = await gqlWithRetry<{ serviceCreate: Service }>(`
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `, {
    input: {
      projectId,
      name,
      source: { image },
    }
  });
  return data.serviceCreate;
}

async function setVariable(
  projectId: string,
  environmentId: string,
  serviceId: string,
  name: string,
  value: string
): Promise<void> {
  await gqlWithRetry(`
    mutation($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `, {
    input: {
      projectId,
      environmentId,
      serviceId,
      name,
      value,
    }
  });
}

async function createDomain(
  environmentId: string,
  serviceId: string
): Promise<string> {
  const data = await gqlWithRetry<{
    serviceDomainCreate: { domain: string }
  }>(`
    mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        domain
      }
    }
  `, {
    input: {
      environmentId,
      serviceId,
    }
  });
  return data.serviceDomainCreate.domain;
}

async function redeployService(
  environmentId: string,
  serviceId: string
): Promise<void> {
  await gqlWithRetry(`
    mutation($environmentId: String!, $serviceId: String!) {
      serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
    }
  `, { environmentId, serviceId });
}

async function waitForServiceReady(
  projectId: string,
  serviceName: string,
  maxWaitMs = 60000
): Promise<Service | undefined> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const project = await getProject(projectId);
    if (project) {
      const service = project.services.edges.find(
        e => e.node.name.toLowerCase().includes(serviceName.toLowerCase())
      );
      if (service) {
        return service.node;
      }
    }
    await sleep(3000);
  }
  return undefined;
}

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Railway Full Deployment - Almoner Platform          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Verify authentication
  console.log('🔐 Verifying Railway authentication...');
  const me = await getMe();
  console.log(`   ✓ Authenticated as: ${me.email}`);
  if (me.teams.length > 0) {
    console.log(`   ✓ Teams: ${me.teams.map(t => t.name).join(', ')}`);
  }
  console.log('');

  // Step 2: Get or create project
  let projectId = process.env.RAILWAY_PROJECT_ID;
  let project: Project;

  if (projectId) {
    console.log(`📂 Using existing project: ${projectId}`);
    const existing = await getProject(projectId);
    if (!existing) {
      throw new Error(`Project ${projectId} not found`);
    }
    project = existing;
    console.log(`   ✓ Project: ${project.name}`);
  } else {
    console.log('📂 Creating new Railway project...');
    const teamId = me.teams.length > 0 ? me.teams[0].id : undefined;
    project = await createProject('Almoner', teamId);
    projectId = project.id;
    console.log(`   ✓ Created project: ${project.name} (${projectId})`);
  }
  console.log('');

  // Get production environment
  const environment = project.environments.edges.find(
    e => e.node.name.toLowerCase() === 'production'
  )?.node || project.environments.edges[0]?.node;

  if (!environment) {
    throw new Error('No environment found in project');
  }
  console.log(`🌍 Using environment: ${environment.name} (${environment.id})`);
  console.log('');

  // Check existing services
  const existingServices = project.services.edges.map(e => e.node);
  const findExisting = (name: string) => existingServices.find(
    s => s.name.toLowerCase().includes(name.toLowerCase())
  );

  let falkorService = findExisting('falkor') || findExisting('redis');
  let almonerService = findExisting('almoner');
  let graphitiService = findExisting('graphiti');

  const repo = process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO;
  const branch = process.env.RAILWAY_BRANCH || 'main';

  // Step 3: Deploy FalkorDB
  console.log('🗄️  Setting up FalkorDB...');
  if (falkorService) {
    console.log(`   ✓ FalkorDB already exists: ${falkorService.name}`);
  } else {
    // Try deploying from template
    const template = await getTemplateDetails(FALKORDB_TEMPLATE_CODE);
    if (template) {
      console.log('   Deploying FalkorDB from template...');
      try {
        await deployTemplate(template.id, projectId, environment.id, template.serializedConfig);
        console.log('   ⏳ Waiting for FalkorDB service to be created...');
        falkorService = await waitForServiceReady(projectId, 'falkor', 90000);
        if (falkorService) {
          console.log(`   ✓ FalkorDB deployed: ${falkorService.name}`);
        }
      } catch (err) {
        console.log(`   ⚠️  Template deploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Fallback: Create from Docker image
    if (!falkorService) {
      console.log('   Creating FalkorDB from Docker image...');
      falkorService = await createServiceFromImage(projectId, 'FalkorDB', 'falkordb/falkordb:latest');
      console.log(`   ✓ FalkorDB service created: ${falkorService.name}`);
    }
  }
  console.log('');

  // Step 4: Create Almoner service
  console.log('🚀 Setting up Almoner service...');
  if (almonerService) {
    console.log(`   ✓ Almoner already exists: ${almonerService.name}`);
  } else {
    almonerService = await createService(projectId, 'Almoner', repo, branch);
    console.log(`   ✓ Almoner service created: ${almonerService.name}`);
  }
  console.log('');

  // Step 5: Create Graphiti service
  console.log('🧠 Setting up Graphiti service...');
  if (graphitiService) {
    console.log(`   ✓ Graphiti already exists: ${graphitiService.name}`);
  } else {
    graphitiService = await createService(projectId, 'Graphiti', repo, branch, 'graphiti-service');
    console.log(`   ✓ Graphiti service created: ${graphitiService.name}`);
  }
  console.log('');

  // Step 6: Configure environment variables
  console.log('📝 Configuring environment variables...');

  const falkorName = falkorService?.name || 'FalkorDB';
  const graphitiName = graphitiService?.name || 'Graphiti';

  // Almoner variables
  if (almonerService) {
    console.log('   Almoner:');
    await setVariable(projectId, environment.id, almonerService.id, 'FALKORDB_URL', `\${{${falkorName}.REDIS_URL}}`);
    console.log('     ✓ FALKORDB_URL');
    await setVariable(projectId, environment.id, almonerService.id, 'FALKORDB_GRAPH', GRAPH_NAME);
    console.log('     ✓ FALKORDB_GRAPH');
    await setVariable(projectId, environment.id, almonerService.id, 'GRAPHITI_ENDPOINT', `http://\${{${graphitiName}.RAILWAY_PRIVATE_DOMAIN}}:8000`);
    console.log('     ✓ GRAPHITI_ENDPOINT');
  }

  // Graphiti variables
  if (graphitiService) {
    console.log('   Graphiti:');
    await setVariable(projectId, environment.id, graphitiService.id, 'FALKORDB_URL', `\${{${falkorName}.REDIS_URL}}`);
    console.log('     ✓ FALKORDB_URL');
    await setVariable(projectId, environment.id, graphitiService.id, 'FALKORDB_GRAPH', GRAPH_NAME);
    console.log('     ✓ FALKORDB_GRAPH');

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      await setVariable(projectId, environment.id, graphitiService.id, 'OPENAI_API_KEY', openaiKey);
      console.log('     ✓ OPENAI_API_KEY');
    } else {
      console.log('     ⚠️  OPENAI_API_KEY not set (set OPENAI_API_KEY env var)');
    }
  }
  console.log('');

  // Step 7: Create public domains
  console.log('🌐 Creating public domains...');
  try {
    if (almonerService) {
      const almonerDomain = await createDomain(environment.id, almonerService.id);
      console.log(`   ✓ Almoner: https://${almonerDomain}`);
    }
    if (graphitiService) {
      const graphitiDomain = await createDomain(environment.id, graphitiService.id);
      console.log(`   ✓ Graphiti: https://${graphitiDomain}`);
    }
  } catch (err) {
    console.log(`   ⚠️  Domain creation: ${err instanceof Error ? err.message : 'Already exists or error'}`);
  }
  console.log('');

  // Step 8: Trigger redeployments
  console.log('🔄 Triggering redeployments...');
  if (almonerService) {
    await redeployService(environment.id, almonerService.id);
    console.log(`   ✓ ${almonerService.name} redeploying`);
  }
  if (graphitiService) {
    await redeployService(environment.id, graphitiService.id);
    console.log(`   ✓ ${graphitiService.name} redeploying`);
  }
  console.log('');

  // Summary
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    Deployment Complete!                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Project URL: https://railway.com/project/${projectId}`);
  console.log('');
  console.log('Services deployed:');
  if (falkorService) console.log(`  • FalkorDB:  ${falkorService.id}`);
  if (almonerService) console.log(`  • Almoner:   ${almonerService.id}`);
  if (graphitiService) console.log(`  • Graphiti:  ${graphitiService.id}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Wait for services to build and deploy (~2-5 minutes)');
  console.log('  2. Check service health: curl https://<almoner-domain>/health');
  console.log('  3. Seed database: curl -X POST https://<almoner-domain>/seed');
  console.log('');
}

main().catch(err => {
  console.error('');
  console.error('❌ Deployment failed:', err.message);
  if (err.message.includes('unauthorized') || err.message.includes('Unauthorized')) {
    console.error('');
    console.error('   Make sure RAILWAY_API_TOKEN is set correctly.');
    console.error('   Get a token from: https://railway.com/account/tokens');
  }
  process.exit(1);
});
