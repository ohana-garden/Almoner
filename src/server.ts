/**
 * Almoner API Server
 *
 * Simple HTTP server for Railway deployment.
 * Exposes health check and basic graph operations.
 *
 * REFACTORED: Now correctly awaits Async Engine calls.
 */

import 'dotenv/config';
import * as http from 'http';
import { GraphConnection, configFromEnv } from './modules/graph-core/connection';
import { createEntityResolutionEngine } from './modules/entity-resolution';
import { createDataIngestionEngine, IngestionJob } from './modules/data-ingestion';

const PORT = parseInt(process.env.PORT || '3000', 10);

let connection: GraphConnection | null = null;
let dataIngestion: ReturnType<typeof createDataIngestionEngine> | null = null;

async function getConnection(): Promise<GraphConnection> {
  if (!connection) {
    const config = configFromEnv();
    connection = GraphConnection.getInstance(config);
    await connection.connect();
  }
  return connection;
}

async function getDataIngestion() {
  if (!dataIngestion) {
    const conn = await getConnection();
    const entityResolution = createEntityResolutionEngine(conn);
    dataIngestion = createDataIngestionEngine(conn, entityResolution);
  }
  return dataIngestion;
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', \`http://localhost:\${PORT}\`);

  // Set JSON content type for all responses
  res.setHeader('Content-Type', 'application/json');

  try {
    switch (url.pathname) {
      case '/':
      case '/health': {
        // Health check
        let dbStatus = 'disconnected';
        try {
          const conn = await getConnection();
          if (conn.isConnected()) {
            dbStatus = 'connected';
          }
        } catch {
          dbStatus = 'error';
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'ok',
          service: 'almoner',
          database: dbStatus,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case '/stats': {
        // Get graph statistics
        const conn = await getConnection();
        const nodeCount = await conn.query<{ count: number }>('MATCH (n) RETURN count(n) as count');
        const edgeCount = await conn.query<{ count: number }>('MATCH ()-[r]->() RETURN count(r) as count');

        res.writeHead(200);
        res.end(JSON.stringify({
          nodes: nodeCount[0]?.count || 0,
          edges: edgeCount[0]?.count || 0,
        }));
        break;
      }

      case '/nodes': {
        // Get node counts by type
        const conn = await getConnection();
        const counts = await conn.query<{ label: string; count: number }>(\`
          CALL {
            MATCH (n:Funder) RETURN 'Funder' as label, count(n) as count
            UNION ALL
            MATCH (n:Grant) RETURN 'Grant' as label, count(n) as count
            UNION ALL
            MATCH (n:Opportunity) RETURN 'Opportunity' as label, count(n) as count
            UNION ALL
            MATCH (n:Org) RETURN 'Org' as label, count(n) as count
            UNION ALL
            MATCH (n:Person) RETURN 'Person' as label, count(n) as count
            UNION ALL
            MATCH (n:Site) RETURN 'Site' as label, count(n) as count
            UNION ALL
            MATCH (n:Project) RETURN 'Project' as label, count(n) as count
            UNION ALL
            MATCH (n:Contribution) RETURN 'Contribution' as label, count(n) as count
            UNION ALL
            MATCH (n:FocusArea) RETURN 'FocusArea' as label, count(n) as count
          }
          RETURN label, count
        \`);

        const result: Record<string, number> = {};
        for (const row of counts) {
          result[row.label] = row.count;
        }

        res.writeHead(200);
        res.end(JSON.stringify(result));
        break;
      }

      case '/seed': {
        // Seed the database with Phase 1 test data
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Use POST to seed' }));
          break;
        }

        const conn = await getConnection();
        const seeded: string[] = [];

        // 1. Create Focus Areas
        await conn.mutate(\`MERGE (:FocusArea {id: 'fa-food', name: 'Food Security', description: 'Access to nutritious food'})\`);
        await conn.mutate(\`MERGE (:FocusArea {id: 'fa-edu', name: 'Education', description: 'Educational opportunities'})\`);
        await conn.mutate(\`MERGE (:FocusArea {id: 'fa-env', name: 'Environment', description: 'Environmental conservation'})\`);
        await conn.mutate(\`MERGE (:FocusArea {id: 'fa-community', name: 'Community Development', description: 'Building strong communities'})\`);
        seeded.push('4 FocusAreas');

        // 2. Create Funders
        await conn.mutate(\`MERGE (:Funder {id: 'funder-1', name: 'Hawaii Community Foundation', type: 'foundation', focusAreas: '["food security", "education", "environment"]', geoFocus: '["Hawaii"]', totalGiving: 50000000, source: '["manual"]'})\`);
        await conn.mutate(\`MERGE (:Funder {id: 'funder-2', name: 'Atherton Family Foundation', type: 'foundation', focusAreas: '["education", "community development"]', geoFocus: '["Hawaii"]', totalGiving: 10000000, source: '["manual"]'})\`);
        seeded.push('2 Funders');

        // 3. Create Grants
        const deadline90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        const deadline60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();
        await conn.mutate(\`MERGE (:Grant {id: 'grant-1', title: 'Community Food Security Grant', amount: '{"min": 5000, "max": 25000}', deadline: '\${deadline90}', eligibility: '["501c3", "Hawaii-based"]', focusAreas: '["food security"]', applicationUrl: 'https://example.com/apply', lastUpdated: '\${now}'})\`);
        await conn.mutate(\`MERGE (:Grant {id: 'grant-2', title: 'Environmental Education Initiative', amount: '{"min": 10000, "max": 50000}', deadline: '\${deadline60}', eligibility: '["501c3", "education-focused"]', focusAreas: '["education", "environment"]', applicationUrl: 'https://example.com/apply2', lastUpdated: '\${now}'})\`);
        seeded.push('2 Grants');

        // 4. Create Organizations
        await conn.mutate(\`MERGE (:Org {id: 'org-1', name: 'Ohana Garden', ein: '99-1234567', mission: 'Community food security through shared gardens in Lower Puna', focusAreas: '["food security", "community development"]', geoFocus: '["Lower Puna", "Hawaii"]', verified: true})\`);
        await conn.mutate(\`MERGE (:Org {id: 'org-2', name: 'Puna Learning Center', ein: '99-7654321', mission: 'Providing educational opportunities for rural Hawaii', focusAreas: '["education"]', geoFocus: '["Puna", "Hawaii"]', verified: true})\`);
        seeded.push('2 Orgs');

        // 5. Create Persons
        await conn.mutate(\`MERGE (:Person {id: 'person-1', name: 'Keoni Makoa', location: 'Pahoa, HI', interests: '["gardening", "food security", "community"]', affiliations: '["org-1"]'})\`);
        await conn.mutate(\`MERGE (:Person {id: 'person-2', name: 'Leilani Kai', location: 'Kapoho, HI', interests: '["education", "environment"]', affiliations: '["org-2"]'})\`);
        await conn.mutate(\`MERGE (:Person {id: 'person-3', name: 'Makani Nui', location: 'Pahoa, HI', interests: '["farming", "sustainability"]', affiliations: '["org-1", "org-2"]'})\`);
        seeded.push('3 Persons');

        // 6. Create Sites
        await conn.mutate(\`MERGE (:Site {id: 'site-1', name: 'Ohana Garden Main Site', location: '{"lat": 19.4937, "lng": -154.8531}', nfcTagId: 'NFC-001', type: 'garden'})\`);
        await conn.mutate(\`MERGE (:Site {id: 'site-2', name: 'Pahoa Distribution Center', location: '{"lat": 19.4963, "lng": -154.9453}', nfcTagId: 'NFC-002', type: 'distribution'})\`);
        seeded.push('2 Sites');

        // 7. Create Projects
        await conn.mutate(\`MERGE (:Project {id: 'project-1', name: 'Community Garden Initiative', description: 'Growing food for the community', focusAreas: '["food security"]'})\`);
        seeded.push('1 Project');

        // 8. Create Opportunities
        const deadline30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await conn.mutate(\`MERGE (:Opportunity {id: 'opp-1', title: 'Garden Volunteer - Weekly', description: 'Help maintain community garden beds, plant seedlings, and harvest produce', hoursNeeded: '{"min": 2, "max": 4}', schedule: 'weekly', siteId: 'site-1', skills: '["gardening", "physical labor"]', focusAreas: '["food security", "community development"]', spotsAvailable: 10, lastUpdated: '\${now}'})\`);
        await conn.mutate(\`MERGE (:Opportunity {id: 'opp-2', title: 'Food Distribution Helper', description: 'Assist with sorting and distributing fresh produce to community members', hoursNeeded: '{"min": 3, "max": 5}', schedule: 'weekly', siteId: 'site-2', skills: '["organization", "customer service"]', focusAreas: '["food security"]', spotsAvailable: 5, lastUpdated: '\${now}'})\`);
        await conn.mutate(\`MERGE (:Opportunity {id: 'opp-3', title: 'Environmental Education Workshop', description: 'One-time workshop teaching sustainable gardening practices', hoursNeeded: '{"min": 4, "max": 6}', schedule: 'one-time', skills: '["teaching", "environment"]', focusAreas: '["education", "environment"]', deadline: '\${deadline30}', spotsAvailable: 20, lastUpdated: '\${now}'})\`);
        seeded.push('3 Opportunities');

        // 9. Create Relationships (using MERGE to avoid duplicates)
        await conn.mutate(\`MATCH (f:Funder {id: 'funder-1'}), (g:Grant {id: 'grant-1'}) MERGE (f)-[:OFFERS]->(g)\`);
        await conn.mutate(\`MATCH (f:Funder {id: 'funder-2'}), (g:Grant {id: 'grant-2'}) MERGE (f)-[:OFFERS]->(g)\`);
        await conn.mutate(\`MATCH (o:Org {id: 'org-1'}), (p:Project {id: 'project-1'}) MERGE (o)-[:RUNS]->(p)\`);
        await conn.mutate(\`MATCH (p:Project {id: 'project-1'}), (s:Site {id: 'site-1'}) MERGE (p)-[:LOCATED_AT]->(s)\`);
        await conn.mutate(\`MATCH (p:Person {id: 'person-1'}), (o:Org {id: 'org-1'}) MERGE (p)-[:MEMBER_OF {role: 'volunteer'}]->(o)\`);
        await conn.mutate(\`MATCH (p:Person {id: 'person-2'}), (o:Org {id: 'org-2'}) MERGE (p)-[:MEMBER_OF {role: 'educator'}]->(o)\`);
        await conn.mutate(\`MATCH (f:Funder {id: 'funder-1'}), (fa:FocusArea {id: 'fa-food'}) MERGE (f)-[:FOCUSES_ON]->(fa)\`);
        await conn.mutate(\`MATCH (o:Org {id: 'org-1'}), (op:Opportunity {id: 'opp-1'}) MERGE (o)-[:OFFERS]->(op)\`);
        await conn.mutate(\`MATCH (o:Org {id: 'org-1'}), (op:Opportunity {id: 'opp-2'}) MERGE (o)-[:OFFERS]->(op)\`);
        await conn.mutate(\`MATCH (o:Org {id: 'org-2'}), (op:Opportunity {id: 'opp-3'}) MERGE (o)-[:OFFERS]->(op)\`);
        seeded.push('10 Relationships');

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          seeded,
          message: 'Phase 1 seed complete!',
        }));
        break;
      }

      case '/test': {
        // Test connection and basic operations
        const conn = await getConnection();

        // Create test node
        const testId = \`test-\${Date.now()}\`;
        await conn.mutate(\`
          CREATE (t:TestNode {id: \$id, timestamp: \$ts})
        \`, { id: testId, ts: new Date().toISOString() });

        // Query it back
        const result = await conn.query<{ t: { id: string } }>(\`
          MATCH (t:TestNode {id: \$id}) RETURN t
        \`, { id: testId });

        // Delete it
        await conn.mutate(\`
          MATCH (t:TestNode {id: \$id}) DELETE t
        \`, { id: testId });

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          testId,
          found: result.length > 0,
          message: 'Connection test passed!',
        }));
        break;
      }

      case '/ingest/990': {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Use POST to trigger ingestion' }));
          break;
        }

        const ingestion = await getDataIngestion();
        const year = url.searchParams.get('year')
          ? parseInt(url.searchParams.get('year')!, 10)
          : new Date().getFullYear() - 1;

        // FIXED: Await the promise
        const job = await ingestion.ingest990Year(year);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          jobId: job.id,
          year,
          message: \`Started 990 ingestion for year \${year}. Check /ingest/status/\${job.id} for progress.\`,
        }));
        break;
      }

      case '/ingest/grants': {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Use POST to trigger ingestion' }));
          break;
        }

        const ingestion = await getDataIngestion();
        const keyword = url.searchParams.get('keyword') || 'nonprofit';

        // FIXED: Await the promise
        const job = await ingestion.ingestGrantsGov({ keyword });

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          jobId: job.id,
          keyword,
          message: \`Started Grants.gov ingestion for "\${keyword}". Check /ingest/status/\${job.id} for progress.\`,
        }));
        break;
      }

      case '/ingest/jobs': {
        const ingestion = await getDataIngestion();
        // FIXED: Await the promise
        const jobs = await ingestion.listJobs();

        res.writeHead(200);
        res.end(JSON.stringify({
          jobs: jobs.map(j => ({
            id: j.id,
            source: j.source,
            status: j.status,
            recordsProcessed: j.recordsProcessed,
            recordsFailed: j.recordsFailed,
            startedAt: j.startedAt,
            completedAt: j.completedAt,
            errorCount: j.errors.length,
          })),
        }));
        break;
      }

      default: {
        if (url.pathname.startsWith('/ingest/status/')) {
          const jobId = url.pathname.replace('/ingest/status/', '');
          const ingestion = await getDataIngestion();
          // FIXED: Await the promise
          const job = await ingestion.getJobStatus(jobId);

          if (!job) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Job not found' }));
            break;
          }

          res.writeHead(200);
          res.end(JSON.stringify({
            id: job.id,
            source: job.source,
            status: job.status,
            recordsProcessed: job.recordsProcessed,
            recordsFailed: job.recordsFailed,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            errors: job.errors.slice(0, 10),
            totalErrors: job.errors.length,
          }));
          break;
        }

        res.writeHead(404);
        res.end(JSON.stringify({
          error: 'Not found',
          endpoints: [
            '/', '/health', '/stats', '/nodes', '/seed (POST)', '/test',
            '/ingest/990 (POST)', '/ingest/grants (POST)', '/ingest/jobs', '/ingest/status/:jobId'
          ],
        }));
      }
    }
  } catch (error) {
    console.error('Request error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }));
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(\`🚀 Almoner server running on port \${PORT}\`);
  getConnection()
    .then(() => console.log('✓ Connected to FalkorDB'))
    .catch((err) => console.error('✗ FalkorDB connection error:', err.message));
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (connection) {
    await connection.disconnect();
  }
  server.close();
  process.exit(0);
});
