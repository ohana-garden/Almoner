#!/bin/bash
set -e

echo "🛠️  Implementing 'Opportunity Hunter' Data Model..."

# ---------------------------------------------------------
# STEP 1: Update Node Types
# ---------------------------------------------------------
echo "📝 Updating src/types/nodes.ts..."
cat << 'YW_NODES' > src/types/nodes.ts
/**
 * Node Type Definitions - EVOLVED (Opportunity Hunter Model)
 * Includes richer 'Package' nodes for complex matching.
 */

export type FunderType = 'foundation' | 'corporate' | 'government' | 'daf' | 'individual';
export type SiteType = 'garden' | 'distribution' | 'event' | 'other';
export type OpportunityType = 'GRANT' | 'SCHOLARSHIP' | 'INTERNSHIP' | 'VOLUNTEER' | 'FELLOWSHIP' | 'SERVICE_ROLE';
export type OpportunityStatus = 'ACTIVE' | 'MODIFIED' | 'CLOSED' | 'CANCELLED' | 'ARCHIVED';

// --- Legacy Interfaces (kept for backward compatibility) ---
export interface AmountRange { min: number; max: number; }
export interface GeoLocation { lat: number; lng: number; }
export interface HoursRange { min: number; max: number; }

// --- New "Hunter" Primitives ---

/**
 * BenefitPackage Node
 * Captures what the opportunity *gives* to the recipient.
 */
export interface BenefitPackage {
  id: string;
  // Cash
  cashAmountMin?: number;
  cashAmountMax?: number;
  currency?: string;
  // Wage
  wageHourlyMin?: number;
  wageHourlyMax?: number;
  // In-Kind / Other
  tuitionCovered?: boolean;
  housing?: boolean;
  meals?: boolean;
  travel?: boolean;
  training?: boolean;
  equipment?: boolean;
  credential?: string; // 'certificate', 'degree', 'reference'
  description?: string;
}

/**
 * CommitmentPackage Node
 * Captures what the opportunity *takes* from the recipient (time/effort).
 */
export interface CommitmentPackage {
  id: string;
  hoursPerWeekMin?: number;
  hoursPerWeekMax?: number;
  durationWeeks?: number;
  startDate?: Date;
  endDate?: Date;
  locationType?: 'REMOTE' | 'ONSITE' | 'HYBRID' | 'FIELD';
  duties?: string[]; // JSON array string
  description?: string;
}

/**
 * EligibilityConstraint Node
 * Explicit rules for who can apply.
 */
export interface EligibilityConstraint {
  id: string;
  applicantType?: 'individual' | 'org';
  citizenship?: string[];
  minAge?: number;
  maxAge?: number;
  degreeLevel?: string;
  enrollmentStatus?: string;
  geoResidency?: string[];
  keywordsInclude?: string[];
  keywordsExclude?: string[];
}

/**
 * Deadline Node
 * Specific timing constraints.
 */
export interface Deadline {
  id: string;
  type: 'ROLLING' | 'FIXED' | 'LOI' | 'INTERNAL';
  date?: Date;
  timezone?: string;
}

// --- Core Entities ---

export interface Funder {
  id: string;
  name: string;
  type: FunderType;
  focusAreas: string[];
  geoFocus: string[];
  totalGiving: number;
  source: string[];
}

export interface Org {
  id: string;
  name: string;
  ein?: string;
  fiscalSponsor?: string;
  mission: string;
  focusAreas: string[];
  geoFocus: string[];
  verified: boolean;
}

export interface Person {
  id: string;
  name: string;
  location?: string;
  interests: string[];
  affiliations: string[]; 
}

export interface Site {
  id: string;
  name: string;
  location: GeoLocation;
  nfcTagId?: string;
  type: SiteType;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  focusAreas: string[];
}

/**
 * Opportunity Node (Unified)
 * Represents Grants, Scholarships, Internships, etc.
 * Now links to Benefit/Commitment packages via edges.
 */
export interface Opportunity {
  id: string;
  title: string;
  // Standard fields
  summary?: string;
  description: string; // legacy support
  opportunityType: OpportunityType; 
  status: OpportunityStatus;
  
  // Source tracking
  sourceSystem?: string; // 'GRANTS_GOV', 'USAJOBS', etc.
  sourceKey?: string;
  primaryUrl?: string;
  
  // Legacy fields (maintained for Phase 1 code)
  hoursNeeded?: HoursRange; 
  schedule?: 'weekly' | 'one-time' | 'flexible';
  siteId?: string;
  skills?: string[];
  focusAreas: string[];
  deadline?: Date; // direct property for simple querying
  spotsAvailable?: number;
  lastUpdated: Date;
}

// Legacy Grant/Scholarship (can eventually be merged into Opportunity)
export interface Grant {
  id: string;
  title: string;
  amount: AmountRange;
  deadline: Date;
  eligibility: string[];
  focusAreas: string[];
  applicationUrl: string;
  lastUpdated: Date;
}

export interface Scholarship {
  id: string;
  title: string;
  amount: AmountRange;
  deadline: Date;
  eligibility: any;
  applicationUrl: string;
  renewable: boolean;
  lastUpdated: Date;
}

export interface Contribution {
  id: string;
  timestamp: Date;
  duration: number;
  kalaGenerated: number;
  mediaRef?: string;
  synced: boolean;
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
}

export interface Output {
  id: string;
  type: string;
  description: string;
  quantity?: number;
  unit?: string;
  timestamp: Date;
}

export interface FocusArea {
  id: string;
  name: string;
  description?: string;
}

export type NodeType =
  | Funder | Grant | Scholarship | Opportunity | Org | Person
  | Site | Project | Contribution | Activity | Output | FocusArea
  | BenefitPackage | CommitmentPackage | EligibilityConstraint | Deadline; // New

export type NodeLabel =
  | 'Funder' | 'Grant' | 'Scholarship' | 'Opportunity' | 'Org' | 'Person'
  | 'Site' | 'Project' | 'Contribution' | 'Activity' | 'Output' | 'FocusArea'
  | 'BenefitPackage' | 'CommitmentPackage' | 'EligibilityConstraint' | 'Deadline'; // New
YW_NODES

# ---------------------------------------------------------
# STEP 2: Update Edge Types
# ---------------------------------------------------------
echo "📝 Updating src/types/edges.ts..."
cat << 'YW_EDGES' > src/types/edges.ts
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
YW_EDGES

# ---------------------------------------------------------
# STEP 3: Update Schema (Indexes)
# ---------------------------------------------------------
echo "📝 Updating src/modules/graph-core/schema.ts..."
cat << 'YW_SCHEMA' > src/modules/graph-core/schema.ts
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
YW_SCHEMA

# ---------------------------------------------------------
# STEP 4: Commit
# ---------------------------------------------------------
echo "💾 Committing Data Model Updates..."
git add src/types/nodes.ts src/types/edges.ts src/modules/graph-core/schema.ts
git commit -m "Feat: Implemented Opportunity Hunter data model (Benefit/Commitment packages)"
git push origin main

echo "✅ Data Model Implemented! ready for Agent Zero."
