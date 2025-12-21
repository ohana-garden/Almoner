/**
 * Graph Core Module
 *
 * Purpose: FalkorDB connection, schema enforcement, basic CRUD
 * Dependencies: FalkorDB
 *
 * Knows NOTHING about: Kala, matching, ripples, funders, grants
 *
 * First Principle: Graph is source of truth.
 * All entities exist as nodes. All relationships are edges.
 * Nothing exists outside the graph.
 */

export { GraphConnection, configFromEnv } from './connection';
export type { ConnectionConfig } from './connection';

export { SchemaManager, REQUIRED_INDEXES } from './schema';
export type { IndexDefinition } from './schema';

export { NodeCrud, EdgeCrud } from './crud';

// Re-export types for convenience
export type { NodeLabel, NodeType } from '../../types/nodes';
export type { EdgeLabel } from '../../types/edges';

import { GraphConnection, configFromEnv } from './connection';
import { SchemaManager } from './schema';
import { NodeCrud, EdgeCrud } from './crud';
import type {
  Funder,
  Grant,
  Scholarship,
  Org,
  Person,
  Site,
  Project,
  Contribution,
  Activity,
  Output,
  FocusArea,
} from '../../types/nodes';

/**
 * Initialize the graph core module.
 * Returns CRUD instances for all node types.
 */
export async function initGraphCore(config = configFromEnv()): Promise<{
  connection: GraphConnection;
  schema: SchemaManager;
  nodes: {
    funders: NodeCrud<Funder>;
    grants: NodeCrud<Grant>;
    scholarships: NodeCrud<Scholarship>;
    orgs: NodeCrud<Org>;
    persons: NodeCrud<Person>;
    sites: NodeCrud<Site>;
    projects: NodeCrud<Project>;
    contributions: NodeCrud<Contribution>;
    activities: NodeCrud<Activity>;
    outputs: NodeCrud<Output>;
    focusAreas: NodeCrud<FocusArea>;
  };
  edges: EdgeCrud;
}> {
  const connection = GraphConnection.getInstance(config);
  await connection.connect();

  const schema = new SchemaManager(connection);
  await schema.initializeSchema();

  const edges = new EdgeCrud(connection, schema);

  return {
    connection,
    schema,
    nodes: {
      funders: new NodeCrud<Funder>(connection, 'Funder'),
      grants: new NodeCrud<Grant>(connection, 'Grant'),
      scholarships: new NodeCrud<Scholarship>(connection, 'Scholarship'),
      orgs: new NodeCrud<Org>(connection, 'Org'),
      persons: new NodeCrud<Person>(connection, 'Person'),
      sites: new NodeCrud<Site>(connection, 'Site'),
      projects: new NodeCrud<Project>(connection, 'Project'),
      contributions: new NodeCrud<Contribution>(connection, 'Contribution'),
      activities: new NodeCrud<Activity>(connection, 'Activity'),
      outputs: new NodeCrud<Output>(connection, 'Output'),
      focusAreas: new NodeCrud<FocusArea>(connection, 'FocusArea'),
    },
    edges,
  };
}
