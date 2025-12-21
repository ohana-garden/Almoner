/**
 * Edge Type Definitions for Almoner Graph Schema
 *
 * First Principle: Graph is source of truth.
 * All relationships are edges. Nothing exists outside the graph.
 *
 * First Principle: Ripples, not receipts.
 * Impact is traced through the graph—upstream attribution, downstream effects.
 */

import type { NodeLabel } from './nodes';

/** Application status for grants and scholarships */
export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';

/**
 * Base edge interface
 * All edges connect a source node to a target node.
 */
export interface BaseEdge {
  id: string;
  sourceId: string;
  targetId: string;
  createdAt: Date;
}

// ============================================
// Funding Flow Edges
// ============================================

/**
 * OFFERS Edge
 * Connects Funder to Grant or Scholarship
 */
export interface OffersEdge extends BaseEdge {
  type: 'OFFERS';
  sourceLabel: 'Funder';
  targetLabel: 'Grant' | 'Scholarship';
}

/**
 * FUNDED Edge
 * Records actual funding provided by Funder to Org or Person
 */
export interface FundedEdge extends BaseEdge {
  type: 'FUNDED';
  sourceLabel: 'Funder';
  targetLabel: 'Org' | 'Person';
  amount: number;
  date: Date;
  grantId?: string; // reference to the Grant that enabled this funding
}

/**
 * FOCUSES_ON Edge
 * Connects Funder to FocusArea
 */
export interface FocusesOnEdge extends BaseEdge {
  type: 'FOCUSES_ON';
  sourceLabel: 'Funder';
  targetLabel: 'FocusArea';
}

// ============================================
// Application Edges
// ============================================

/**
 * APPLIED_TO Edge
 * Records application from Org to Grant or Person to Scholarship
 */
export interface AppliedToEdge extends BaseEdge {
  type: 'APPLIED_TO';
  sourceLabel: 'Org' | 'Person';
  targetLabel: 'Grant' | 'Scholarship';
  status: ApplicationStatus;
  date: Date;
  notes?: string;
}

// ============================================
// Organizational Edges
// ============================================

/**
 * RUNS Edge
 * Connects Org to Project
 */
export interface RunsEdge extends BaseEdge {
  type: 'RUNS';
  sourceLabel: 'Org';
  targetLabel: 'Project';
  startDate?: Date;
  endDate?: Date;
}

/**
 * LOCATED_AT Edge
 * Connects Project to Site
 */
export interface LocatedAtEdge extends BaseEdge {
  type: 'LOCATED_AT';
  sourceLabel: 'Project';
  targetLabel: 'Site';
}

/**
 * SPONSORED_BY Edge
 * Fiscal sponsorship relationship between Orgs
 */
export interface SponsoredByEdge extends BaseEdge {
  type: 'SPONSORED_BY';
  sourceLabel: 'Org';
  targetLabel: 'Org';
  startDate?: Date;
}

// ============================================
// People Edges
// ============================================

/**
 * MEMBER_OF Edge
 * Connects Person to Org
 */
export interface MemberOfEdge extends BaseEdge {
  type: 'MEMBER_OF';
  sourceLabel: 'Person';
  targetLabel: 'Org';
  role?: string;
  startDate?: Date;
}

/**
 * CONTRIBUTED Edge
 * Connects Person to Contribution
 *
 * First Principle: Kala is contribution pattern, not currency.
 * This edge records WHO made the contribution.
 */
export interface ContributedEdge extends BaseEdge {
  type: 'CONTRIBUTED';
  sourceLabel: 'Person';
  targetLabel: 'Contribution';
}

/**
 * AT Edge
 * Connects Contribution to Site
 * Records WHERE the contribution occurred.
 */
export interface AtEdge extends BaseEdge {
  type: 'AT';
  sourceLabel: 'Contribution';
  targetLabel: 'Site';
}

/**
 * FOR Edge
 * Connects Contribution to Project
 * Records WHAT PROJECT the contribution supported.
 */
export interface ForEdge extends BaseEdge {
  type: 'FOR';
  sourceLabel: 'Contribution';
  targetLabel: 'Project';
}

// ============================================
// Impact Ripple Edges
// ============================================

/**
 * ENABLED Edge
 * Connects Grant to Activity
 * Records that funding enabled an activity.
 *
 * First Principle: Ripples, not receipts.
 */
export interface EnabledEdge extends BaseEdge {
  type: 'ENABLED';
  sourceLabel: 'Grant';
  targetLabel: 'Activity';
}

/**
 * CONTRIBUTED_BY Edge
 * Connects Activity to Person
 * Records who performed the activity.
 */
export interface ContributedByEdge extends BaseEdge {
  type: 'CONTRIBUTED_BY';
  sourceLabel: 'Activity';
  targetLabel: 'Person';
}

/**
 * PRODUCED Edge
 * Connects Activity to Output
 * Records tangible results of an activity.
 */
export interface ProducedEdge extends BaseEdge {
  type: 'PRODUCED';
  sourceLabel: 'Activity';
  targetLabel: 'Output';
}

/**
 * DISTRIBUTED_TO Edge
 * Connects Output to Person
 * Records who received the output (downstream impact).
 */
export interface DistributedToEdge extends BaseEdge {
  type: 'DISTRIBUTED_TO';
  sourceLabel: 'Output';
  targetLabel: 'Person';
}

/**
 * INSPIRED Edge
 * Connects Person to Contribution
 * Records when receiving impact inspired further contribution.
 */
export interface InspiredEdge extends BaseEdge {
  type: 'INSPIRED';
  sourceLabel: 'Person';
  targetLabel: 'Contribution';
  story?: string;
}

/** Union type of all edge types */
export type EdgeType =
  | OffersEdge
  | FundedEdge
  | FocusesOnEdge
  | AppliedToEdge
  | RunsEdge
  | LocatedAtEdge
  | SponsoredByEdge
  | MemberOfEdge
  | ContributedEdge
  | AtEdge
  | ForEdge
  | EnabledEdge
  | ContributedByEdge
  | ProducedEdge
  | DistributedToEdge
  | InspiredEdge;

/** Edge type labels for Cypher queries */
export type EdgeLabel =
  | 'OFFERS'
  | 'FUNDED'
  | 'FOCUSES_ON'
  | 'APPLIED_TO'
  | 'RUNS'
  | 'LOCATED_AT'
  | 'SPONSORED_BY'
  | 'MEMBER_OF'
  | 'CONTRIBUTED'
  | 'AT'
  | 'FOR'
  | 'ENABLED'
  | 'CONTRIBUTED_BY'
  | 'PRODUCED'
  | 'DISTRIBUTED_TO'
  | 'INSPIRED';

/** Edge definition for schema enforcement */
export interface EdgeDefinition {
  type: EdgeLabel;
  fromLabel: NodeLabel;
  toLabel: NodeLabel;
  properties: string[];
}

/** Complete edge schema definitions */
export const EDGE_SCHEMA: EdgeDefinition[] = [
  { type: 'OFFERS', fromLabel: 'Funder', toLabel: 'Grant', properties: [] },
  { type: 'OFFERS', fromLabel: 'Funder', toLabel: 'Scholarship', properties: [] },
  { type: 'FUNDED', fromLabel: 'Funder', toLabel: 'Org', properties: ['amount', 'date'] },
  { type: 'FUNDED', fromLabel: 'Funder', toLabel: 'Person', properties: ['amount', 'date'] },
  { type: 'FOCUSES_ON', fromLabel: 'Funder', toLabel: 'FocusArea', properties: [] },
  { type: 'APPLIED_TO', fromLabel: 'Org', toLabel: 'Grant', properties: ['status', 'date'] },
  { type: 'APPLIED_TO', fromLabel: 'Person', toLabel: 'Scholarship', properties: ['status', 'date'] },
  { type: 'RUNS', fromLabel: 'Org', toLabel: 'Project', properties: [] },
  { type: 'LOCATED_AT', fromLabel: 'Project', toLabel: 'Site', properties: [] },
  { type: 'SPONSORED_BY', fromLabel: 'Org', toLabel: 'Org', properties: [] },
  { type: 'MEMBER_OF', fromLabel: 'Person', toLabel: 'Org', properties: ['role'] },
  { type: 'CONTRIBUTED', fromLabel: 'Person', toLabel: 'Contribution', properties: [] },
  { type: 'AT', fromLabel: 'Contribution', toLabel: 'Site', properties: [] },
  { type: 'FOR', fromLabel: 'Contribution', toLabel: 'Project', properties: [] },
  { type: 'ENABLED', fromLabel: 'Grant', toLabel: 'Activity', properties: [] },
  { type: 'CONTRIBUTED_BY', fromLabel: 'Activity', toLabel: 'Person', properties: [] },
  { type: 'PRODUCED', fromLabel: 'Activity', toLabel: 'Output', properties: [] },
  { type: 'DISTRIBUTED_TO', fromLabel: 'Output', toLabel: 'Person', properties: [] },
  { type: 'INSPIRED', fromLabel: 'Person', toLabel: 'Contribution', properties: ['story'] },
];
