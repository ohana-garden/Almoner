#!/bin/bash
set -e

echo "🛠️  Fixing Connection Class Syntax..."

# We use 'TS_CONTENT' (quoted) to ensure the shell writes EXACTLY what is below.
cat << 'TS_CONTENT' > src/modules/graph-core/connection.ts
import { FalkorDB, Graph } from 'falkordb';

export class GraphConnection {
  private client: FalkorDB;
  private graph: Graph;
  private isConnected: boolean = false;

  constructor() {
    // 1. Robust Configuration
    const url = process.env.FALKORDB_URL || `redis://${process.env.FALKORDB_HOST || 'localhost'}:${process.env.FALKORDB_PORT || 6379}`;
    const password = process.env.FALKORDB_PASSWORD;
    
    // Initialize the client
    this.client = this.initClient(url, password);
    
    // 2. Select the Graph
    const graphName = process.env.FALKORDB_GRAPH || 'AlmonerGraph';
    this.graph = this.client.selectGraph(graphName);
  }

  private initClient(url: string, password?: string): any {
    try {
        // Pass url/password structure supported by the driver
        return new FalkorDB({ url, password });
    } catch (e) {
        console.error("Failed to initialize FalkorDB client:", e);
        throw e;
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    try {
      await this.graph.query("RETURN 1");
      this.isConnected = true;
      console.log(`✅ Connected to FalkorDB graph: ${this.graph.graphId}`);
    } catch (error) {
      console.error("❌ FalkorDB Connection Failed:", error);
      throw error;
    }
  }

  /**
   * EXECUTE CYPHER QUERY
   */
  async execute(query: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.isConnected) await this.connect();

    try {
      const result = await this.graph.query(query, { params });
      
      // Normalize output
      if (result && Array.isArray(result.data)) {
        return result.data;
      }
      return []; 
    } catch (error) {
      // Simplified logging to avoid shell script escaping issues
      console.error('❌ Query Failed:', { query, params, error });
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
    }
  }
}
TS_CONTENT

# ---------------------------------------------------------
# Verify Compilation immediately
# ---------------------------------------------------------
echo "🔍 Verifying compilation..."
npx tsc src/modules/graph-core/crud.ts src/modules/graph-core/connection.ts --noEmit --esModuleInterop --skipLibCheck --target es2020 --moduleResolution node

if [ $? -eq 0 ]; then
  echo "✅ PASS: Connection class is valid and compiles."
else
  echo "❌ FAIL: Compilation errors persist."
  exit 1
fi
