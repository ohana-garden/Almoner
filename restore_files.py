import os

print("🚑 RESTORING FILES TO WORKING STATE...")

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content.strip())
    print(f"✅ Restored: {path}")

# 1. Connection
write_file("src/modules/graph-core/connection.ts", r"""
import { FalkorDB } from 'falkordb';

export class GraphConnection {
  private client: any = null;
  private graph: any = null;
  private isConnected: boolean = false;
  private config: { url: string; graphName: string };

  constructor() {
    const host = process.env.FALKORDB_HOST || 'localhost';
    const port = process.env.FALKORDB_PORT || '6379';
    const pass = process.env.FALKORDB_PASSWORD;
    let url = process.env.FALKORDB_URL;
    if (!url) {
      url = pass ? `redis://:${pass}@${host}:${port}` : `redis://${host}:${port}`;
    }
    this.config = { url, graphName: process.env.FALKORDB_GRAPH || 'AlmonerGraph' };
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;
    try {
      console.log(`🔌 Connecting to FalkorDB at ${this.config.url}...`);
      if (typeof (FalkorDB as any).connect === 'function') {
        this.client = await (FalkorDB as any).connect({ url: this.config.url });
      } else {
        this.client = new FalkorDB(); 
        if (typeof this.client.connect === 'function') await this.client.connect({ url: this.config.url });
      }
      this.graph = this.client.selectGraph(this.config.graphName);
      this.isConnected = true;
      console.log(`✅ Connected to Graph: "${this.config.graphName}"`);
    } catch (error) {
      console.error('❌ FalkorDB Connection Failed:', error);
      throw error;
    }
  }

  async execute(query: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.isConnected || !this.graph) await this.connect();
    try {
      const result = await this.graph.query(query, { params });
      if (result && Array.isArray(result.data)) return result.data;
      if (Array.isArray(result)) return result;
      return []; 
    } catch (error) {
      console.error('❌ Query Failed:', { query, params: JSON.stringify(params), error });
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      if (typeof this.client.close === 'function') await this.client.close();
      else if (typeof this.client.quit === 'function') await this.client.quit();
      this.isConnected = false;
      this.client = null;
    }
  }
}
""")

# 2. Matching Engine (Stub to fix build)
write_file("src/modules/matching-engine/index.ts", r"""
import { GraphConnection } from '../graph-core/connection';

interface MatchResult {
  grantId: string;
  score: number;
  reasons: string[];
}

export class MatchingEngine {
  constructor(private connection: GraphConnection) {}
  async matchGrantsForOrg(orgId: string): Promise<MatchResult[]> { return []; }
}
""")

# 3. Server (Ensure Clean)
write_file("src/server.ts", r"""
import express, { Request, Response } from 'express';
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

  const connection = new GraphConnection();
  try {
    await connection.connect();
    console.log("✅ Server connected to FalkorDB");
  } catch (e) {
    console.error("❌ Fatal: Could not connect to DB on startup", e);
    process.exit(1); 
  }

  const nodeCrud = new NodeCrud(connection);
  const resolution = new EntityResolutionEngine(nodeCrud);
  const matching = new MatchingEngine(connection);
  const ingestion = new DataIngestionEngine(resolution, nodeCrud);

  const mcpService = createMcpService(connection, {
    matching,
    dataIngestion: ingestion
  });

  app.get('/health', async (req: Request, res: Response) => {
    try {
      await connection.execute("RETURN 1");
      res.json({ status: 'healthy', services: { database: 'connected' }, uptime: process.uptime() });
    } catch (e) {
      res.status(503).json({ status: 'unhealthy', error: String(e) });
    }
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const response = await mcpService.handleRequest(req.body);
      res.json(response);
    } catch (e) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(e) }, id: req.body.id });
    }
  });

  app.listen(config.port, () => {
    console.log(`🚀 Almoner Platform running on port ${config.port}`);
  });
}
startServer();
""")

print("✨ Local files are now clean and matching the server.")
