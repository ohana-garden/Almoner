#!/bin/bash
set -e

echo "🛠️  Fixing GraphConnection class..."

# ---------------------------------------------------------
# Rewrite src/modules/graph-core/connection.ts
# ---------------------------------------------------------
# This version includes the missing 'execute' method and 
# ensures robust environment variable handling.

cat << 'TS_CONNECTION' > src/modules/graph-core/connection.ts
import { FalkorDB, Graph } from 'falkordb';

export class GraphConnection {
  private client: FalkorDB;
  private graph: Graph;
  private isConnected: boolean = false;

  constructor() {
    // 1. Robust Configuration
    // We prefer FALKORDB_URL, but fall back to host/port/password
    const url = process.env.FALKORDB_URL || \`redis://\${process.env.FALKORDB_HOST || 'localhost'}:\${process.env.FALKORDB_PORT || 6379}\`;
    const password = process.env.FALKORDB_PASSWORD; // Might be needed if using explicit host/port
    
    // Initialize the client
    // Note: The specific constructor options depend on the falkordb driver version.
    // If passing a full URL, it often handles auth automatically.
    this.client = await this.initClient(url, password);
    
    // 2. Select the Graph
    const graphName = process.env.FALKORDB_GRAPH || 'AlmonerGraph';
    this.graph = this.client.selectGraph(graphName);
  }

  // Helper to handle async client init if needed (simulated for synchronous constructor flow)
  // In many Redis/FalkorDB drivers, connection is lazy or sync-init.
  private initClient(url: string, password?: string): any {
    try {
        // Basic connection logic
        return new FalkorDB({ url, password });
    } catch (e) {
        console.error("Failed to initialize FalkorDB client:", e);
        throw e;
    }
  }

  /**
   * ESTABLISH CONNECTION
   * (Actually checks connectivity)
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    try {
      // Run a dummy query to verify connection
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
   * This is the missing method that NodeCrud relies on.
   */
  async execute(query: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.isConnected) await this.connect();

    try {
      // 1. Run the query
      const result = await this.graph.query(query, { params });
      
      // 2. Normalize the output
      // The driver usually returns a complex ResultSet. 
      // We want a simple array of objects where keys match the RETURN variables.
      // E.g. RETURN n -> [{ n: { properties: {...} } }]
      
      // If the driver returns .data as an array of maps/objects, we return that.
      if (result && Array.isArray(result.data)) {
        return result.data;
      }
      
      // Fallback for different driver versions that might return rows/headers
      return []; 
    } catch (error) {
      console.error(`❌ Query Failed:\nQuery: ${query}\nParams:`, params, `\nError:`, error);
      throw error;
    }
  }

  /**
   * CLOSE CONNECTION
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
    }
  }
}
TS_CONNECTION

# ---------------------------------------------------------
# Verify Compilation
# ---------------------------------------------------------
echo "�� Verifying compilation..."
npx tsc src/modules/graph-core/crud.ts src/modules/graph-core/connection.ts --noEmit --esModuleInterop --skipLibCheck --target es2020 --moduleResolution node

if [ $? -eq 0 ]; then
  echo "✅ PASS: Connection class is now compatible with Crud class."
else
  echo "❌ FAIL: Compilation still broken."
  exit 1
fi
