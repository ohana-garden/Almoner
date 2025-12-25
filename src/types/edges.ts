/**
 * Edge Type Definitions - EVOLVED
 * Added relationships for Opportunity Packages.
 */

import type { NodeLabel } from './nodes';

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';

export interface BaseEdge {
  id: string;
  sourceId: string;
  targetId: string;
  createdAt: Date;
}

// --- New Package Relationships ---

export interface HasBenefitEdge extends BaseEdge {
  type: 'HAS_BENEFIT';
  sourceLabel: 'Opportunity' | 'Grant' | 'Scholarship';
  targetLabel: 'BenefitPackage';
}

export interface HasCommitmentEdge extends BaseEdge {
  type: 'HAS_COMMITMENT';
  sourceLabel: 'Opportunity' | 'Grant' | 'Scholarship';
  targetLabel: 'CommitmentPackage';
}

export interface HasEligibilityEdge extends BaseEdge {
  type: 'HAS_ELIGIBILITY';
  sourceLabel: 'Opportunity' | 'Grant' | 'Scholarship';
  targetLabel: 'EligibilityConstraint';
}

export interface HasDeadlineEdge extends BaseEdge {
  type: 'HAS_DEADLINE';
  sourceLabel: 'Opportunity' | 'Grant' | 'Scholarship';
  targetLabel: 'Deadline';
}

// --- Existing Relationships (Preserved) ---

export interface OffersEdge extends BaseEdge {
  type: 'OFFERS';
  sourceLabel: 'Funder' | 'Org';
  targetLabel: 'Grant' | 'Scholarship' | 'Opportunity';
}

export interface FundedEdge extends BaseEdge {
  type: 'FUNDED';
  sourceLabel: 'Funder';
  targetLabel: 'Org' | 'Person';
  amount: number;
  date: Date;
  grantId?: string;
}

export interface FocusesOnEdge extends BaseEdge {
  type: 'FOCUSES_ON';
  sourceLabel: 'Funder';
  targetLabel: 'FocusArea';
}

export interface AppliedToEdge extends BaseEdge {
  type: 'APPLIED_TO';
  sourceLabel: 'Org' | 'Person';
  targetLabel: 'Grant' | 'Scholarship' | 'Opportunity';
  status: ApplicationStatus;
  date: Date;
  notes?: string;
}

export interface RunsEdge extends BaseEdge {
  type: 'RUNS';
  sourceLabel: 'Org';
  targetLabel: 'Project';
  startDate?: Date;
  endDate?: Date;
}

export interface LocatedAtEdge extends BaseEdge {
  type: 'LOCATED_AT';
  sourceLabel: 'Project';
  targetLabel: 'Site';
}

export interface SponsoredByEdge extends BaseEdge {
  type: 'SPONSORED_BY';
  sourceLabel: 'Org';
  targetLabel: 'Org';
  startDate?: Date;
}

export interface MemberOfEdge extends BaseEdge {
  type: 'MEMBER_OF';
  sourceLabel: 'Person';
  targetLabel: 'Org';
  role?: string;
  startDate?: Date;
}

export interface ContributedEdge extends BaseEdge {
  type: 'CONTRIBUTED';
  sourceLabel: 'Person';
  targetLabel: 'Contribution';
}

export interface AtEdge extends BaseEdge {
  type: 'AT';
  sourceLabel: 'Contribution';
  targetLabel: 'Site';
}

export interface ForEdge extends BaseEdge {
  type: 'FOR';
  sourceLabel: 'Contribution';
  targetLabel: 'Project' | 'Opportunity';
}

export interface EnabledEdge extends BaseEdge {
  type: 'ENABLED';
  sourceLabel: 'Grant';
  targetLabel: 'Activity';
}

export interface ContributedByEdge extends BaseEdge {
  type: 'CONTRIBUTED_BY';
  sourceLabel: 'Activity';
  targetLabel: 'Person';
}

export interface ProducedEdge extends BaseEdge {
  type: 'PRODUCED';
  sourceLabel: 'Activity';
  targetLabel: 'Output';
}

export interface DistributedToEdge extends BaseEdge {
  type: 'DISTRIBUTED_TO';
  sourceLabel: 'Output';
  targetLabel: 'Person';
}

export interface InspiredEdge extends BaseEdge {
  type: 'INSPIRED';
  sourceLabel: 'Person';
  targetLabel: 'Contribution';
  story?: string;
}

export type EdgeType =
  | HasBenefitEdge | HasCommitmentEdge | HasEligibilityEdge | HasDeadlineEdge // New
  | OffersEdge | FundedEdge | FocusesOnEdge | AppliedToEdge | RunsEdge
  | LocatedAtEdge | SponsoredByEdge | MemberOfEdge | ContributedEdge
  | AtEdge | ForEdge | EnabledEdge | ContributedByEdge | ProducedEdge
  | DistributedToEdge | InspiredEdge;

export type EdgeLabel =
  | 'HAS_BENEFIT' | 'HAS_COMMITMENT' | 'HAS_ELIGIBILITY' | 'HAS_DEADLINE' // New
  | 'OFFERS' | 'FUNDED' | 'FOCUSES_ON' | 'APPLIED_TO' | 'RUNS'
  | 'LOCATED_AT' | 'SPONSORED_BY' | 'MEMBER_OF' | 'CONTRIBUTED'
  | 'AT' | 'FOR' | 'ENABLED' | 'CONTRIBUTED_BY' | 'PRODUCED'
  | 'DISTRIBUTED_TO' | 'INSPIRED';

export interface EdgeDefinition {
  type: EdgeLabel;
  fromLabel: NodeLabel;
  toLabel: NodeLabel;
  properties: string[];
}

export const EDGE_SCHEMA: EdgeDefinition[] = [
  // New Package Connections
  { type: 'HAS_BENEFIT', fromLabel: 'Opportunity', toLabel: 'BenefitPackage', properties: [] },
  { type: 'HAS_COMMITMENT', fromLabel: 'Opportunity', toLabel: 'CommitmentPackage', properties: [] },
  { type: 'HAS_ELIGIBILITY', fromLabel: 'Opportunity', toLabel: 'EligibilityConstraint', properties: [] },
  { type: 'HAS_DEADLINE', fromLabel: 'Opportunity', toLabel: 'Deadline', properties: [] },
  // Back-compat for legacy nodes if needed
  { type: 'HAS_BENEFIT', fromLabel: 'Grant', toLabel: 'BenefitPackage', properties: [] },
  { type: 'HAS_BENEFIT', fromLabel: 'Scholarship', toLabel: 'BenefitPackage', properties: [] },

  // Existing
  { type: 'OFFERS', fromLabel: 'Funder', toLabel: 'Grant', properties: [] },
  { type: 'OFFERS', fromLabel: 'Funder', toLabel: 'Scholarship', properties: [] },
  { type: 'OFFERS', fromLabel: 'Org', toLabel: 'Opportunity', properties: [] },
  { type: 'FUNDED', fromLabel: 'Funder', toLabel: 'Org', properties: ['amount', 'date'] },
  { type: 'FUNDED', fromLabel: 'Funder', toLabel: 'Person', properties: ['amount', 'date'] },
  { type: 'FOCUSES_ON', fromLabel: 'Funder', toLabel: 'FocusArea', properties: [] },
  { type: 'APPLIED_TO', fromLabel: 'Org', toLabel: 'Grant', properties: ['status', 'date'] },
  { type: 'APPLIED_TO', fromLabel: 'Person', toLabel: 'Scholarship', properties: ['status', 'date'] },
  { type: 'APPLIED_TO', fromLabel: 'Person', toLabel: 'Opportunity', properties: ['status', 'date'] },
  { type: 'RUNS', fromLabel: 'Org', toLabel: 'Project', properties: [] },
  { type: 'LOCATED_AT', fromLabel: 'Project', toLabel: 'Site', properties: [] },
  { type: 'SPONSORED_BY', fromLabel: 'Org', toLabel: 'Org', properties: [] },
  { type: 'MEMBER_OF', fromLabel: 'Person', toLabel: 'Org', properties: ['role'] },
  { type: 'CONTRIBUTED', fromLabel: 'Person', toLabel: 'Contribution', properties: [] },
  { type: 'AT', fromLabel: 'Contribution', toLabel: 'Site', properties: [] },
  { type: 'FOR', fromLabel: 'Contribution', toLabel: 'Project', properties: [] },
  { type: 'FOR', fromLabel: 'Contribution', toLabel: 'Opportunity', properties: [] },
  { type: 'ENABLED', fromLabel: 'Grant', toLabel: 'Activity', properties: [] },
  { type: 'CONTRIBUTED_BY', fromLabel: 'Activity', toLabel: 'Person', properties: [] },
  { type: 'PRODUCED', fromLabel: 'Activity', toLabel: 'Output', properties: [] },
  { type: 'DISTRIBUTED_TO', fromLabel: 'Output', toLabel: 'Person', properties: [] },
  { type: 'INSPIRED', fromLabel: 'Person', toLabel: 'Contribution', properties: ['story'] },
];
