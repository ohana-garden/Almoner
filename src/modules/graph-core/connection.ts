/**
 * Graph Core: FalkorDB Connection Management
 *
 * First Principle: Graph is source of truth.
 * All entities exist as nodes. All relationships are edges.
 * Nothing exists outside the graph.
 *
 * Module boundary: This module knows NOTHING about:
 * - Kala, matching, ripples, funders, grants
 * - Business logic of any kind
 * - UI or capture mechanisms
 */

import { FalkorDB, Graph } from 'falkordb';

export interface ConnectionConfig {
  host: string;
  port: number;
  password?: string;
  graphName: string;
}

/**
 * GraphConnection manages the FalkorDB connection lifecycle.
 * Singleton pattern ensures single connection per process.
 */
export class GraphConnection {
  private static instance: GraphConnection | null = null;
  private client: FalkorDB | null = null;
  private graph: Graph | null = null;
  private config: ConnectionConfig;

  private constructor(config: ConnectionConfig) {
    this.config = config;
  }

  /**
   * Get or create the singleton connection instance.
   */
  static getInstance(config?: ConnectionConfig): GraphConnection {
    if (!GraphConnection.instance) {
      if (!config) {
        throw new Error('ConnectionConfig required for first initialization');
      }
      GraphConnection.instance = new GraphConnection(config);
    }
    return GraphConnection.instance;
  }

  /**
   * Connect to FalkorDB.
   * Must be called before any graph operations.
   */
  async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    this.client = await FalkorDB.connect({
      socket: {
        host: this.config.host,
        port: this.config.port,
      },
      password: this.config.password,
    });

    this.graph = this.client.selectGraph(this.config.graphName);
  }

  /**
   * Get the active graph instance.
   * Throws if not connected.
   */
  getGraph(): Graph {
    if (!this.graph) {
      throw new Error('Not connected to FalkorDB. Call connect() first.');
    }
    return this.graph;
  }

  /**
   * Execute a Cypher query against the graph.
   */
  async query<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
    const graph = this.getGraph();
    const result = await graph.query(cypher, { params });
    return result.data as T[];
  }

  /**
   * Execute a Cypher query that modifies the graph.
   * Returns statistics about the modification.
   */
  async mutate(cypher: string, params?: Record<string, unknown>): Promise<{
    nodesCreated: number;
    nodesDeleted: number;
    relationshipsCreated: number;
    relationshipsDeleted: number;
    propertiesSet: number;
  }> {
    const graph = this.getGraph();
    const result = await graph.query(cypher, { params });

    return {
      nodesCreated: result.metadata.nodesCreated ?? 0,
      nodesDeleted: result.metadata.nodesDeleted ?? 0,
      relationshipsCreated: result.metadata.relationshipsCreated ?? 0,
      relationshipsDeleted: result.metadata.relationshipsDeleted ?? 0,
      propertiesSet: result.metadata.propertiesSet ?? 0,
    };
  }

  /**
   * Check if connected to FalkorDB.
   */
  isConnected(): boolean {
    return this.client !== null && this.graph !== null;
  }

  /**
   * Disconnect from FalkorDB.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.graph = null;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (GraphConnection.instance) {
      GraphConnection.instance.disconnect();
      GraphConnection.instance = null;
    }
  }
}

/**
 * Create a connection config from environment variables.
 */
export function configFromEnv(): ConnectionConfig {
  return {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
    password: process.env.FALKORDB_PASSWORD || undefined,
    graphName: process.env.FALKORDB_GRAPH_NAME || 'almoner',
  };
}
