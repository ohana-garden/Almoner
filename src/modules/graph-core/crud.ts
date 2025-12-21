/**
 * Graph Core: CRUD Operations
 *
 * First Principle: Graph is source of truth.
 * All entities exist as nodes. All relationships are edges.
 * Nothing exists outside the graph.
 *
 * Module boundary: This module knows NOTHING about:
 * - Kala, matching, ripples
 * - Business logic (validation beyond schema)
 * - UI or capture mechanisms
 */

import { v4 as uuidv4 } from 'uuid';
import type { NodeLabel, NodeType } from '../../types/nodes';
import type { EdgeLabel } from '../../types/edges';
import { GraphConnection } from './connection';
import { SchemaManager } from './schema';

/**
 * Generic CRUD operations for graph nodes.
 */
export class NodeCrud<T extends NodeType> {
  private connection: GraphConnection;
  private label: NodeLabel;

  constructor(connection: GraphConnection, label: NodeLabel) {
    this.connection = connection;
    this.label = label;
  }

  /**
   * Create a new node.
   * Generates UUID if id not provided.
   */
  async create(data: Omit<T, 'id'> & { id?: string }): Promise<T> {
    const id = data.id || uuidv4();
    const nodeData = { ...data, id };

    // Convert dates to ISO strings for storage
    const properties = this.serializeProperties(nodeData);

    const cypher = `
      CREATE (n:${this.label} $properties)
      RETURN n
    `;

    await this.connection.mutate(cypher, { properties });
    return nodeData as T;
  }

  /**
   * Find a node by ID.
   */
  async findById(id: string): Promise<T | null> {
    const cypher = `
      MATCH (n:${this.label} {id: $id})
      RETURN n
    `;

    const results = await this.connection.query<{ n: T }>(cypher, { id });
    if (results.length === 0) {
      return null;
    }

    return this.deserializeProperties(results[0].n);
  }

  /**
   * Find nodes by property value.
   */
  async findBy(property: keyof T, value: unknown): Promise<T[]> {
    const cypher = `
      MATCH (n:${this.label})
      WHERE n.${String(property)} = $value
      RETURN n
    `;

    const results = await this.connection.query<{ n: T }>(cypher, { value });
    return results.map((r) => this.deserializeProperties(r.n));
  }

  /**
   * Find all nodes of this type.
   */
  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const cypher = `
      MATCH (n:${this.label})
      RETURN n
      SKIP $offset
      LIMIT $limit
    `;

    const results = await this.connection.query<{ n: T }>(cypher, { limit, offset });
    return results.map((r) => this.deserializeProperties(r.n));
  }

  /**
   * Update a node by ID.
   * Only updates provided properties.
   */
  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const properties = this.serializeProperties(data);

    // Build SET clause dynamically
    const setClause = Object.keys(properties)
      .map((key) => `n.${key} = $properties.${key}`)
      .join(', ');

    if (!setClause) {
      return existing;
    }

    const cypher = `
      MATCH (n:${this.label} {id: $id})
      SET ${setClause}
      RETURN n
    `;

    await this.connection.mutate(cypher, { id, properties });
    return { ...existing, ...data };
  }

  /**
   * Delete a node by ID.
   * Also removes all edges connected to this node.
   */
  async delete(id: string): Promise<boolean> {
    const cypher = `
      MATCH (n:${this.label} {id: $id})
      DETACH DELETE n
    `;

    const result = await this.connection.mutate(cypher, { id });
    return result.nodesDeleted > 0;
  }

  /**
   * Check if a node exists by ID.
   */
  async exists(id: string): Promise<boolean> {
    const cypher = `
      MATCH (n:${this.label} {id: $id})
      RETURN count(n) > 0 as exists
    `;

    const results = await this.connection.query<{ exists: boolean }>(cypher, { id });
    return results[0]?.exists ?? false;
  }

  /**
   * Count all nodes of this type.
   */
  async count(): Promise<number> {
    const cypher = `
      MATCH (n:${this.label})
      RETURN count(n) as count
    `;

    const results = await this.connection.query<{ count: number }>(cypher);
    return results[0]?.count ?? 0;
  }

  /**
   * Full-text search on a property.
   */
  async search(property: keyof T, searchTerm: string, limit = 20): Promise<T[]> {
    // Using CONTAINS for basic search; production might use dedicated fulltext index
    const cypher = `
      MATCH (n:${this.label})
      WHERE toLower(n.${String(property)}) CONTAINS toLower($searchTerm)
      RETURN n
      LIMIT $limit
    `;

    const results = await this.connection.query<{ n: T }>(cypher, { searchTerm, limit });
    return results.map((r) => this.deserializeProperties(r.n));
  }

  /**
   * Serialize properties for storage (convert Dates to ISO strings).
   */
  private serializeProperties(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === 'object' && value !== null) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Deserialize properties from storage (parse ISO strings to Dates).
   */
  private deserializeProperties(data: T): T {
    const result = { ...data } as Record<string, unknown>;

    // Known date fields
    const dateFields = ['deadline', 'timestamp', 'lastUpdated', 'date', 'startDate', 'endDate', 'createdAt'];

    for (const field of dateFields) {
      if (field in result && typeof result[field] === 'string') {
        result[field] = new Date(result[field] as string);
      }
    }

    // Known object fields
    const objectFields = ['amount', 'eligibility', 'location'];

    for (const field of objectFields) {
      if (field in result && typeof result[field] === 'string') {
        try {
          result[field] = JSON.parse(result[field] as string);
        } catch {
          // Keep as string if not valid JSON
        }
      }
    }

    return result as T;
  }
}

/**
 * CRUD operations for graph edges.
 */
export class EdgeCrud {
  private connection: GraphConnection;
  private schema: SchemaManager;

  constructor(connection: GraphConnection, schema: SchemaManager) {
    this.connection = connection;
    this.schema = schema;
  }

  /**
   * Create an edge between two nodes.
   */
  async create(
    edgeType: EdgeLabel,
    fromLabel: NodeLabel,
    fromId: string,
    toLabel: NodeLabel,
    toId: string,
    properties: Record<string, unknown> = {}
  ): Promise<{ id: string }> {
    // Validate edge type is allowed
    if (!this.schema.validateEdge(edgeType, fromLabel, toLabel)) {
      throw new Error(
        `Invalid edge: ${edgeType} from ${fromLabel} to ${toLabel} is not allowed by schema`
      );
    }

    const id = uuidv4();
    const edgeProperties = { ...properties, id, createdAt: new Date().toISOString() };

    const cypher = `
      MATCH (from:${fromLabel} {id: $fromId})
      MATCH (to:${toLabel} {id: $toId})
      CREATE (from)-[r:${edgeType} $properties]->(to)
      RETURN r
    `;

    const result = await this.connection.mutate(cypher, {
      fromId,
      toId,
      properties: edgeProperties,
    });

    if (result.relationshipsCreated === 0) {
      throw new Error(`Failed to create edge: source or target node not found`);
    }

    return { id };
  }

  /**
   * Find edges of a type from a node.
   */
  async findFrom(
    edgeType: EdgeLabel,
    fromLabel: NodeLabel,
    fromId: string
  ): Promise<Array<{ edge: Record<string, unknown>; targetId: string }>> {
    const cypher = `
      MATCH (from:${fromLabel} {id: $fromId})-[r:${edgeType}]->(to)
      RETURN r, to.id as targetId
    `;

    const results = await this.connection.query<{ r: Record<string, unknown>; targetId: string }>(
      cypher,
      { fromId }
    );

    return results.map((row) => ({
      edge: row.r,
      targetId: row.targetId,
    }));
  }

  /**
   * Find edges of a type to a node.
   */
  async findTo(
    edgeType: EdgeLabel,
    toLabel: NodeLabel,
    toId: string
  ): Promise<Array<{ edge: Record<string, unknown>; sourceId: string }>> {
    const cypher = `
      MATCH (from)-[r:${edgeType}]->(to:${toLabel} {id: $toId})
      RETURN r, from.id as sourceId
    `;

    const results = await this.connection.query<{ r: Record<string, unknown>; sourceId: string }>(
      cypher,
      { toId }
    );

    return results.map((row) => ({
      edge: row.r,
      sourceId: row.sourceId,
    }));
  }

  /**
   * Delete an edge by ID.
   */
  async delete(edgeType: EdgeLabel, edgeId: string): Promise<boolean> {
    const cypher = `
      MATCH ()-[r:${edgeType} {id: $edgeId}]->()
      DELETE r
    `;

    const result = await this.connection.mutate(cypher, { edgeId });
    return result.relationshipsDeleted > 0;
  }

  /**
   * Delete all edges of a type between two nodes.
   */
  async deleteBetween(
    edgeType: EdgeLabel,
    fromLabel: NodeLabel,
    fromId: string,
    toLabel: NodeLabel,
    toId: string
  ): Promise<number> {
    const cypher = `
      MATCH (from:${fromLabel} {id: $fromId})-[r:${edgeType}]->(to:${toLabel} {id: $toId})
      DELETE r
    `;

    const result = await this.connection.mutate(cypher, { fromId, toId });
    return result.relationshipsDeleted;
  }

  /**
   * Check if an edge exists between two nodes.
   */
  async exists(
    edgeType: EdgeLabel,
    fromLabel: NodeLabel,
    fromId: string,
    toLabel: NodeLabel,
    toId: string
  ): Promise<boolean> {
    const cypher = `
      MATCH (from:${fromLabel} {id: $fromId})-[r:${edgeType}]->(to:${toLabel} {id: $toId})
      RETURN count(r) > 0 as exists
    `;

    const results = await this.connection.query<{ exists: boolean }>(cypher, { fromId, toId });
    return results[0]?.exists ?? false;
  }
}
