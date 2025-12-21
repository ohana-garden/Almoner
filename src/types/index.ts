/**
 * Almoner Type Definitions
 *
 * Central export point for all graph schema types.
 *
 * First Principle: Graph is source of truth.
 * All entities exist as nodes. All relationships are edges.
 * Nothing exists outside the graph.
 */

// Node types
export * from './nodes';

// Edge types
export * from './edges';

// Re-export common types for convenience
export type {
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
  NodeType,
  NodeLabel,
} from './nodes';

export type {
  EdgeType,
  EdgeLabel,
  ApplicationStatus,
} from './edges';
