import express from 'express';
import { GraphConnection } from './modules/graph-core/connection';
import { createMcpService } from './modules/mcp-service';
import { MatchingEngine } from './modules/matching-engine';
import { DataIngestionEngine } from './modules/data-ingestion';
import { EntityResolutionEngine } from './modules/entity-resolution';
import { NodeCrud } from './modules/graph-core/crud';
import { config } from './config';

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Initialize Core Infrastructure
  const connection = new GraphConnection();
  
  try {
    await connection.connect();
    console.log("✅ Server connected to FalkorDB");
  } catch (e) {
    console.error("❌ Fatal: Could not connect to DB on startup", e);
    process.exit(1); // Fail fast so Railway restarts us
  }

  // 2. Initialize Engines
  const nodeCrud = new NodeCrud(connection);
  const resolution = new EntityResolutionEngine(nodeCrud);
  
  // (Stubbed for MVP)
  const matching = new MatchingEngine(connection);
  const ingestion = new DataIngestionEngine(resolution, nodeCrud);

  // 3. Initialize MCP
  const mcpService = createMcpService(connection, {
    matching,
    dataIngestion: ingestion
  });

  // ---------------------------------------------------------
  // ROUTES
  // ---------------------------------------------------------

  // REAL Health Check
  app.get('/health', async (req, res) => {
    try {
      // Ping Database
      await connection.execute("RETURN 1");
      
      // (Optional) Ping Graphiti if critical
      // await axios.get(...) 

      res.json({ 
        status: 'healthy', 
        services: {
          database: 'connected',
          mcp: 'active'
        },
        uptime: process.uptime()
      });
    } catch (e) {
      console.error("Health Check Failed:", e);
      res.status(503).json({ 
        status: 'unhealthy', 
        error: String(e) 
      });
    }
  });

  // MCP Entrypoint
  app.post('/mcp', async (req, res) => {
    try {
      const response = await mcpService.handleRequest(req.body);
      res.json(response);
    } catch (e) {
      console.error("MCP Error:", e);
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(e) }, id: req.body.id });
    }
  });

  // Start Listener
  app.listen(config.port, () => {
    console.log(`🚀 Almoner Platform running on port ${config.port}`);
    console.log(`👉 Health: http://localhost:${config.port}/health`);
    console.log(`👉 MCP:    http://localhost:${config.port}/mcp`);
  });
}

startServer();
