import { FalkorDB } from 'falkordb';

/**
 * GraphConnection - Singleton
 * Hardened to prevent connection exhaustion and handle driver quirks.
 */
export class GraphConnection {
  private static instance: GraphConnection;
  
  // Use 'any' for the client to bypass version-specific type mismatches
  private client: any = null;
  private graph: any = null;
  private isConnected: boolean = false;
  
  private config: { url: string; graphName: string };

  private constructor() {
    const host = process.env.FALKORDB_HOST || 'localhost';
    const port = process.env.FALKORDB_PORT || '6379';
    const pass = process.env.FALKORDB_PASSWORD;
    
    let url = process.env.FALKORDB_URL;
    if (!url) {
      url = pass ? `redis://:${pass}@${host}:${port}` : `redis://${host}:${port}`;
    }
    
    const graphName = process.env.FALKORDB_GRAPH || 'AlmonerGraph';
    this.config = { url, graphName };
  }

  public static getInstance(): GraphConnection {
    if (!GraphConnection.instance) {
      GraphConnection.instance = new GraphConnection();
    }
    return GraphConnection.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;

    try {
      console.log(`🔌 Connecting to FalkorDB at ${this.config.url}...`);

      // Hybrid Detection Strategy for Driver
      if (typeof (FalkorDB as any).connect === 'function') {
        this.client = await (FalkorDB as any).connect({ url: this.config.url });
      } else {
        this.client = new FalkorDB();
        if (typeof this.client.connect === 'function') {
             await this.client.connect({ url: this.config.url });
        }
      }

      // Select Graph
      if (typeof this.client.selectGraph === 'function') {
        this.graph = this.client.selectGraph(this.config.graphName);
      } else {
        throw new Error("Client does not support selectGraph method");
      }
      
      this.isConnected = true;
      console.log(`✅ Connected to Graph: "${this.config.graphName}"`);

    } catch (error) {
      console.error('❌ FalkorDB Connection Failed:', error);
      throw error;
    }
  }

  async execute(query: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.isConnected || !this.graph) {
        await this.connect();
    }

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
      else if (typeof this.client.disconnect === 'function') await this.client.disconnect();
      
      this.isConnected = false;
      this.client = null;
    }
  }
  
  static createNew(): GraphConnection {
      return GraphConnection.getInstance();
  }
}

export const configFromEnv = () => GraphConnection.getInstance()['config'];
