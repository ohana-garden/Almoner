/**
 * Almoner API Server - FINAL REFACTOR
 *
 * Serves:
 * 1. Health & Stats endpoints (for monitoring)
 * 2. Ingestion Triggers (for cron jobs)
 * 3. MCP Endpoint (for Agent Zero)
 *
 * Architecture: Uses initAlmoner() to boot the full graph application.
 */

import 'dotenv/config';
import * as http from 'http';
import { initAlmoner } from './index';
import type { Almoner } from './index';
import type { McpRequest } from './modules/mcp-service';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Singleton instance
let almoner: Almoner | null = null;

/**
 * Get or initialize the full Almoner application.
 */
async function getApp(): Promise<Almoner> {
  if (!almoner) {
    console.log('🔄 Initializing Almoner engines...');
    almoner = await initAlmoner();
    console.log('✅ Almoner initialized');
  }
  return almoner;
}

/**
 * Helper to read JSON body from request
 */
function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', \`http://localhost:\${PORT}\`);
  res.setHeader('Content-Type', 'application/json');

  // CORS support for local agent testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Lazy load app
    const app = await getApp();

    switch (url.pathname) {
      // --- System Endpoints ---
      case '/':
      case '/health':
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'ok',
          service: 'almoner',
          database: app.graphCore.connection.isConnected() ? 'connected' : 'disconnected',
          timestamp: new Date().toISOString(),
        }));
        break;

      case '/stats':
        const stats = await app.graphCore.schema.getStats();
        res.writeHead(200);
        res.end(JSON.stringify(stats));
        break;

      // --- MCP Endpoint (For Agent Zero) ---
      case '/mcp':
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          break;
        }
        const mcpBody = await readBody(req);
        // Pass directly to McpService
        const mcpResponse = await app.mcpService.handleRequest(mcpBody as McpRequest);
        res.writeHead(200);
        res.end(JSON.stringify(mcpResponse));
        break;

      // --- Ingestion Endpoints (For Cron/Scripts) ---
      case '/ingest/990':
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'POST required' }));
          break;
        }
        const year = url.searchParams.get('year')
          ? parseInt(url.searchParams.get('year')!, 10)
          : new Date().getFullYear() - 1;
        const job990 = await app.dataIngestion.ingest990Year(year);
        res.writeHead(200);
        res.end(JSON.stringify({ jobId: job990.id, message: 'Ingestion started' }));
        break;

      case '/ingest/grants':
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'POST required' }));
          break;
        }
        const keyword = url.searchParams.get('keyword') || 'nonprofit';
        const jobGrants = await app.dataIngestion.ingestGrantsGov({ keyword });
        res.writeHead(200);
        res.end(JSON.stringify({ jobId: jobGrants.id, message: 'Ingestion started' }));
        break;

      case '/ingest/status':
        const jobId = url.searchParams.get('id');
        if (!jobId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing id param' }));
          break;
        }
        const status = await app.dataIngestion.getJobStatus(jobId);
        if (!status) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Job not found' }));
          break;
        }
        res.writeHead(200);
        res.end(JSON.stringify(status));
        break;

      // --- Dev/Test Utils ---
      case '/seed':
        if (req.method !== 'POST') {
           res.writeHead(405);
           res.end(JSON.stringify({ error: 'POST required' })); 
           break; 
        }
        // (Simplified seed logic - normally we'd move seed script logic here or keep it external)
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Use npm run seed:phase1 locally' }));
        break;

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error('Server Error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }));
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(\`🚀 Almoner server running on port \${PORT}\`);
  console.log(\`   Health: http://localhost:\${PORT}/health\`);
  console.log(\`   MCP:    http://localhost:\${PORT}/mcp\`);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (almoner) {
    await almoner.connection.disconnect();
  }
  server.close();
  process.exit(0);
});
