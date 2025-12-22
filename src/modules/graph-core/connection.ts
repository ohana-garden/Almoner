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
  /** Redis URL (e.g., redis://host:port or redis://:password@host:port) */
  url?: string;
  /** Host (used if url is not provided) */
  host?: string;
  /** Port (used if url is not provided) */
  port?: number;
  /** Password (used if url is not provided) */
  password?: string;
  /** Graph name */
  graphName: string;
}

/** Mutation statistics */
export interface MutationStats {
  nodesCreated: number;
  nodesDeleted: number;
  relationshipsCreated: number;
  relationshipsDeleted: number;
  propertiesSet: number;
}

/**
 * Parse a Redis URL into connection components.
 */
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
  };
}

/**
 * Parse metadata array from FalkorDB into stats object.
 * Metadata format: ["Nodes created: 1", "Properties set: 2", ...]
 */
function parseMetadata(metadata: string[]): MutationStats {
  const stats: MutationStats = {
    nodesCreated: 0,
    nodesDeleted: 0,
    relationshipsCreated: 0,
    relationshipsDeleted: 0,
    propertiesSet: 0,
  };

  for (const line of metadata) {
    const [key, value] = line.split(':').map((s) => s.trim());
    const numValue = parseInt(value, 10) || 0;

    switch (key.toLowerCase()) {
      case 'nodes created':
        stats.nodesCreated = numValue;
        break;
      case 'nodes deleted':
        stats.nodesDeleted = numValue;
        break;
      case 'relationships created':
        stats.relationshipsCreated = numValue;
        break;
      case 'relationships deleted':
        stats.relationshipsDeleted = numValue;
        break;
      case 'properties set':
        stats.propertiesSet = numValue;
        break;
    }
  }

  return stats;
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

    let host: string;
    let port: number;
    let password: string | undefined;

    // Parse URL if provided, otherwise use individual components
    if (this.config.url) {
      const parsed = parseRedisUrl(this.config.url);
      host = parsed.host;
      port = parsed.port;
      password = parsed.password;
    } else {
      host = this.config.host || 'localhost';
      port = this.config.port || 6379;
      password = this.config.password;
    }

    this.client = await FalkorDB.connect({
      socket: {
        host,
        port,
      },
      password,
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
    const result = await graph.query<T>(cypher, params ? { params: params as Record<string, string | number | boolean | null> } : undefined);
    return (result.data || []) as T[];
  }

  /**
   * Execute a Cypher query that modifies the graph.
   * Returns statistics about the modification.
   */
  async mutate(cypher: string, params?: Record<string, unknown>): Promise<MutationStats> {
    const graph = this.getGraph();
    const result = await graph.query(cypher, params ? { params: params as Record<string, string | number | boolean | null> } : undefined);
    return parseMetadata(result.metadata);
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
 * Supports both URL format (FALKORDB_URL) and individual components.
 */
export function configFromEnv(): ConnectionConfig {
  const url = process.env.FALKORDB_URL;

  if (url) {
    return {
      url,
      graphName: process.env.FALKORDB_GRAPH_NAME || 'almoner',
    };
  }

  return {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
    password: process.env.FALKORDB_PASSWORD || undefined,
    graphName: process.env.FALKORDB_GRAPH_NAME || 'almoner',
  };
}
