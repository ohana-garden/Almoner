/**
 * Graph Core: Schema Enforcement
 *
 * First Principle: Graph is source of truth.
 * This module enforces the graph schema defined in types.
 *
 * Module boundary: This module knows NOTHING about:
 * - Kala, matching, ripples
 * - Business logic
 * - UI or capture mechanisms
 */

import type { NodeLabel } from '../../types/nodes';
import type { EdgeLabel } from '../../types/edges';
import { EDGE_SCHEMA } from '../../types/edges';
import { GraphConnection } from './connection';

/** Index definition for a node property */
export interface IndexDefinition {
  label: NodeLabel;
  property: string;
  type: 'exact' | 'fulltext';
}

/** Required indexes for efficient queries */
export const REQUIRED_INDEXES: IndexDefinition[] = [
  // Primary keys
  { label: 'Funder', property: 'id', type: 'exact' },
  { label: 'Grant', property: 'id', type: 'exact' },
  { label: 'Scholarship', property: 'id', type: 'exact' },
  { label: 'Org', property: 'id', type: 'exact' },
  { label: 'Person', property: 'id', type: 'exact' },
  { label: 'Site', property: 'id', type: 'exact' },
  { label: 'Project', property: 'id', type: 'exact' },
  { label: 'Contribution', property: 'id', type: 'exact' },
  { label: 'Activity', property: 'id', type: 'exact' },
  { label: 'Output', property: 'id', type: 'exact' },
  { label: 'FocusArea', property: 'id', type: 'exact' },

  // Search indexes
  { label: 'Funder', property: 'name', type: 'fulltext' },
  { label: 'Grant', property: 'title', type: 'fulltext' },
  { label: 'Scholarship', property: 'title', type: 'fulltext' },
  { label: 'Org', property: 'name', type: 'fulltext' },
  { label: 'Org', property: 'ein', type: 'exact' },
  { label: 'Person', property: 'name', type: 'fulltext' },
  { label: 'Site', property: 'name', type: 'fulltext' },
  { label: 'Site', property: 'nfcTagId', type: 'exact' },
  { label: 'Project', property: 'name', type: 'fulltext' },
  { label: 'FocusArea', property: 'name', type: 'fulltext' },

  // Temporal indexes
  { label: 'Grant', property: 'deadline', type: 'exact' },
  { label: 'Scholarship', property: 'deadline', type: 'exact' },
  { label: 'Contribution', property: 'timestamp', type: 'exact' },
  { label: 'Contribution', property: 'synced', type: 'exact' },
];

/**
 * Schema manager for FalkorDB graph.
 */
export class SchemaManager {
  private connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  /**
   * Initialize schema: create all required indexes.
   */
  async initializeSchema(): Promise<void> {
    for (const index of REQUIRED_INDEXES) {
      await this.createIndex(index);
    }
  }

  /**
   * Create an index on a node property.
   */
  async createIndex(index: IndexDefinition): Promise<void> {
    const { label, property, type } = index;

    // FalkorDB uses CREATE INDEX syntax
    // For fulltext, we'd use a different approach in production
    const cypher =
      type === 'exact'
        ? `CREATE INDEX FOR (n:${label}) ON (n.${property})`
        : `CREATE INDEX FOR (n:${label}) ON (n.${property})`;

    try {
      await this.connection.mutate(cypher);
    } catch (error) {
      // Index might already exist - that's okay
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Validate that an edge type is allowed between two node labels.
   */
  validateEdge(edgeType: EdgeLabel, fromLabel: NodeLabel, toLabel: NodeLabel): boolean {
    return EDGE_SCHEMA.some(
      (def) =>
        def.type === edgeType && def.fromLabel === fromLabel && def.toLabel === toLabel
    );
  }

  /**
   * Get all valid edge types for a source node label.
   */
  getValidEdgesFrom(fromLabel: NodeLabel): EdgeLabel[] {
    return EDGE_SCHEMA.filter((def) => def.fromLabel === fromLabel).map((def) => def.type);
  }

  /**
   * Get all valid edge types for a target node label.
   */
  getValidEdgesTo(toLabel: NodeLabel): EdgeLabel[] {
    return EDGE_SCHEMA.filter((def) => def.toLabel === toLabel).map((def) => def.type);
  }

  /**
   * Drop all data from the graph (use with caution!).
   * Primarily for testing.
   */
  async dropAll(): Promise<void> {
    await this.connection.mutate('MATCH (n) DETACH DELETE n');
  }

  /**
   * Get schema statistics.
   */
  async getStats(): Promise<{
    nodeCount: number;
    edgeCount: number;
    labelCounts: Record<string, number>;
  }> {
    const nodeCountResult = await this.connection.query<{ count: number }>(
      'MATCH (n) RETURN count(n) as count'
    );
    const edgeCountResult = await this.connection.query<{ count: number }>(
      'MATCH ()-[r]->() RETURN count(r) as count'
    );

    const nodeCount = nodeCountResult[0]?.count ?? 0;
    const edgeCount = edgeCountResult[0]?.count ?? 0;

    // Get counts per label
    const labelCounts: Record<string, number> = {};
    const labels: NodeLabel[] = [
      'Funder',
      'Grant',
      'Scholarship',
      'Org',
      'Person',
      'Site',
      'Project',
      'Contribution',
      'Activity',
      'Output',
      'FocusArea',
    ];

    for (const label of labels) {
      const result = await this.connection.query<{ count: number }>(
        `MATCH (n:${label}) RETURN count(n) as count`
      );
      labelCounts[label] = result[0]?.count ?? 0;
    }

    return { nodeCount, edgeCount, labelCounts };
  }
}
