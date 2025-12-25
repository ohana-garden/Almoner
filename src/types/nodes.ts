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
