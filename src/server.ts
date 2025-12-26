/**
 * Almoner API Server - HARDENED
 * Uses singleton connection and strict initialization order.
 */
import 'dotenv/config';
import * as http from 'http';
import { initAlmoner } from './index';
import { GraphConnection } from './modules/graph-core/connection';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  console.log('🔄 Booting Almoner Engines...');
  const app = await initAlmoner();
  
  await GraphConnection.getInstance().connect();
  console.log('✅ Database connected & Schema verified.');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', \`http://localhost:\${PORT}\`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
        if (url.pathname === '/mcp' && req.method === 'POST') {
            const body = await readBody(req);
            const result = await app.mcpService.handleRequest(body);
            res.writeHead(200);
            res.end(JSON.stringify(result));
            return;
        }
        
        if (url.pathname === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                status: 'ok', 
                uptime: process.uptime(),
                database: 'connected'
            }));
            return;
        }
        
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
        
    } catch (e) {
        console.error(e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(e) }));
    }
  });

  server.listen(PORT, () => {
    console.log(\`🚀 Almoner Server running on port \${PORT}\`);
  });
}

function readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

startServer();
