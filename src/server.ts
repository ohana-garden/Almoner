import express from 'express';
import { KalaKnowledgeEngine } from './modules/kala-engine';
import { MatchingEngine } from './modules/matching-engine';
import { MCPServer } from './mcp/server';

const app = express();
const port = process.env.PORT || 3000;

// Initialize Engines
const kala = new KalaKnowledgeEngine({
  url: process.env.FALKORDB_URL || 'redis://localhost:6379',
  graphName: 'AlmonerGraph'
});

const matcher = new MatchingEngine(kala);
const mcp = new MCPServer(kala, matcher);

// Middleware
app.use(express.json());

// Health Check
app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      database: 'connected'
    },
    uptime: process.uptime()
  });
});

// MCP Endpoint (Agent Protocol)
app.post('/mcp', async (req, res) => {
  try {
    const result = await mcp.handleRequest(req.body);
    res.json(result);
  } catch (error) {
    console.error('MCP Error:', error);
    res.status(500).json({ error: 'Internal MCP Error' });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`MCP Endpoint: http://localhost:${port}/mcp`);
});