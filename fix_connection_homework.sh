#!/bin/bash
set -e

echo "🛠️  Applying Definitive Connection Fix..."

cat << 'TS_FIX' > src/modules/graph-core/connection.ts
import { FalkorDB } from 'falkordb';

export class GraphConnection {
  // Use 'any' for the client to bypass version-specific type mismatches
  private client: any = null;
  private graph: any = null;
  private isConnected: boolean = false;
  
  private config: { url: string; graphName: string };

  constructor() {
    // 1. Build Config
    const host = process.env.FALKORDB_HOST || 'localhost';
    const port = process.env.FALKORDB_PORT || '6379';
    const pass = process.env.FALKORDB_PASSWORD;
    
    // Construct URL if not provided explicitly
    let url = process.env.FALKORDB_URL;
    if (!url) {
      if (pass) {
        url = `redis://:${pass}@${host}:${port}`;
      } else {
        url = `redis://${host}:${port}`;
      }
    }
    
    const graphName = process.env.FALKORDB_GRAPH || 'AlmonerGraph';
    this.config = { url, graphName };
  }

  /**
   * ESTABLISH CONNECTION
   * Tries Static Factory first (modern), then Constructor+Connect (legacy).
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;

    try {
      console.log(`🔌 Connecting to FalkorDB at ${this.config.url}...`);

      // ---------------------------------------------------------
      // STRATEGY: Hybrid Detection
      // ---------------------------------------------------------
      // Check if static connect exists (Modern FalkorDB-TS)
      if (typeof (FalkorDB as any).connect === 'function') {
        this.client = await (FalkorDB as any).connect({
          url: this.config.url
        });
      } 
      // Fallback: Constructor + .connect() (Legacy/Redis-style)
      else {
        this.client = new FalkorDB(); // No args to constructor (EventEmitter)
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

  /**
   * EXECUTE CYPHER QUERY
   */
  async execute(query: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.isConnected || !this.graph) {
        await this.connect();
    }

    try {
      // Execute query
      const result = await this.graph.query(query, { params });
      
      // Normalize output based on driver version
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
}
TS_FIX

# ---------------------------------------------------------
# Verify Compilation
# ---------------------------------------------------------
echo "🔍 Verifying compilation..."
npx tsc src/modules/graph-core/crud.ts src/modules/graph-core/connection.ts --noEmit --esModuleInterop --skipLibCheck --target es2020 --moduleResolution node

if [ $? -eq 0 ]; then
  echo "✅ PASS: Connection class compiled successfully."
else
  echo "❌ FAIL: Compilation failed."
  exit 1
fi
