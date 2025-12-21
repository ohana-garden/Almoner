/**
 * Almoner API Server
 *
 * Simple HTTP server for Railway deployment.
 * Exposes health check and basic graph operations.
 */

import 'dotenv/config';
import * as http from 'http';
import { GraphConnection, configFromEnv } from './modules/graph-core/connection';

const PORT = parseInt(process.env.PORT || '3000', 10);

let connection: GraphConnection | null = null;

async function getConnection(): Promise<GraphConnection> {
  if (!connection) {
    const config = configFromEnv();
    connection = GraphConnection.getInstance(config);
    await connection.connect();
  }
  return connection;
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

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
        const counts = await conn.query<{ label: string; count: number }>(`
          CALL {
            MATCH (n:Funder) RETURN 'Funder' as label, count(n) as count
            UNION ALL
            MATCH (n:Grant) RETURN 'Grant' as label, count(n) as count
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
          }
          RETURN label, count
        `);

        const result: Record<string, number> = {};
        for (const row of counts) {
          result[row.label] = row.count;
        }

        res.writeHead(200);
        res.end(JSON.stringify(result));
        break;
      }

      case '/test': {
        // Test connection and basic operations
        const conn = await getConnection();

        // Create test node
        const testId = `test-${Date.now()}`;
        await conn.mutate(`
          CREATE (t:TestNode {id: $id, timestamp: $ts})
        `, { id: testId, ts: new Date().toISOString() });

        // Query it back
        const result = await conn.query<{ t: { id: string } }>(`
          MATCH (t:TestNode {id: $id}) RETURN t
        `, { id: testId });

        // Delete it
        await conn.mutate(`
          MATCH (t:TestNode {id: $id}) DELETE t
        `, { id: testId });

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          testId,
          found: result.length > 0,
          message: 'Connection test passed!',
        }));
        break;
      }

      default: {
        res.writeHead(404);
        res.end(JSON.stringify({
          error: 'Not found',
          endpoints: ['/', '/health', '/stats', '/nodes', '/test'],
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
  console.log(`🚀 Almoner server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Stats:  http://localhost:${PORT}/stats`);
  console.log(`   Nodes:  http://localhost:${PORT}/nodes`);
  console.log(`   Test:   http://localhost:${PORT}/test`);

  // Connect to FalkorDB on startup
  getConnection()
    .then(() => console.log('✓ Connected to FalkorDB'))
    .catch((err) => console.error('✗ FalkorDB connection error:', err.message));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (connection) {
    await connection.disconnect();
  }
  server.close();
  process.exit(0);
});
