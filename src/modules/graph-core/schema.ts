/**
 * Graph Core: Schema Enforcement
 * Refactored to include new Opportunity Hunter indexes.
 */

import type { NodeLabel } from '../../types/nodes';
import type { EdgeLabel } from '../../types/edges';
import { EDGE_SCHEMA } from '../../types/edges';
import { GraphConnection } from './connection';

export interface IndexDefinition {
  label: NodeLabel | 'IngestionJob';
  property: string;
  type: 'exact' | 'fulltext';
}

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
  { label: 'IngestionJob', property: 'id', type: 'exact' },
  
  // New Package IDs
  { label: 'BenefitPackage', property: 'id', type: 'exact' },
  { label: 'CommitmentPackage', property: 'id', type: 'exact' },
  { label: 'EligibilityConstraint', property: 'id', type: 'exact' },
  { label: 'Deadline', property: 'id', type: 'exact' },
  { label: 'Opportunity', property: 'id', type: 'exact' },

  // Search indexes
  { label: 'Funder', property: 'name', type: 'fulltext' },
  { label: 'Grant', property: 'title', type: 'fulltext' },
  { label: 'Scholarship', property: 'title', type: 'fulltext' },
  { label: 'Opportunity', property: 'title', type: 'fulltext' }, // New
  { label: 'Org', property: 'name', type: 'fulltext' },
  { label: 'Org', property: 'ein', type: 'exact' },
  { label: 'Person', property: 'name', type: 'fulltext' },
  { label: 'Site', property: 'name', type: 'fulltext' },
  { label: 'Site', property: 'nfcTagId', type: 'exact' },
  { label: 'Project', property: 'name', type: 'fulltext' },
  { label: 'FocusArea', property: 'name', type: 'fulltext' },

  // Temporal & Filtering
  { label: 'Grant', property: 'deadline', type: 'exact' },
  { label: 'Grant', property: 'amountMin', type: 'exact' },
  { label: 'Grant', property: 'amountMax', type: 'exact' },
  { label: 'Scholarship', property: 'deadline', type: 'exact' },
  { label: 'Contribution', property: 'timestamp', type: 'exact' },
  { label: 'Contribution', property: 'synced', type: 'exact' },
  // New Filtering
  { label: 'Opportunity', property: 'status', type: 'exact' },
  { label: 'Opportunity', property: 'opportunityType', type: 'exact' },
];

export class SchemaManager {
  private connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  async initializeSchema(): Promise<void> {
    for (const index of REQUIRED_INDEXES) {
      await this.createIndex(index);
    }
  }

  async createIndex(index: IndexDefinition): Promise<void> {
    const { label, property, type } = index;
    const cypher =
      type === 'exact'
        ? \`CREATE INDEX FOR (n:\${label}) ON (n.\${property})\`
        : \`CREATE INDEX FOR (n:\${label}) ON (n.\${property})\`;

    try {
      await this.connection.mutate(cypher);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }

  validateEdge(edgeType: EdgeLabel, fromLabel: NodeLabel, toLabel: NodeLabel): boolean {
    return EDGE_SCHEMA.some(
      (def) =>
        def.type === edgeType && def.fromLabel === fromLabel && def.toLabel === toLabel
    );
  }

  getValidEdgesFrom(fromLabel: NodeLabel): EdgeLabel[] {
    return EDGE_SCHEMA.filter((def) => def.fromLabel === fromLabel).map((def) => def.type);
  }

  getValidEdgesTo(toLabel: NodeLabel): EdgeLabel[] {
    return EDGE_SCHEMA.filter((def) => def.toLabel === toLabel).map((def) => def.type);
  }

  async dropAll(): Promise<void> {
    await this.connection.mutate('MATCH (n) DETACH DELETE n');
  }

  async getStats(): Promise<any> {
    const nodeCount = await this.connection.query<{ count: number }>('MATCH (n) RETURN count(n) as count');
    const edgeCount = await this.connection.query<{ count: number }>('MATCH ()-[r]->() RETURN count(r) as count');
    return { nodeCount: nodeCount[0]?.count ?? 0, edgeCount: edgeCount[0]?.count ?? 0 };
  }
}
