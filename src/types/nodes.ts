/**
 * Node Type Definitions for Almoner Graph Schema
 *
 * First Principle: Graph is source of truth.
 * All entities exist as nodes. Nothing exists outside the graph.
 */

/** Funder types supported by the system */
export type FunderType = 'foundation' | 'corporate' | 'government' | 'daf' | 'individual';

/** Site types for contribution locations */
export type SiteType = 'garden' | 'distribution' | 'event' | 'other';

/** Amount range for grants and scholarships */
export interface AmountRange {
  min: number;
  max: number;
}

/** Geographic coordinates */
export interface GeoLocation {
  lat: number;
  lng: number;
}

/** Scholarship eligibility criteria */
export interface ScholarshipEligibility {
  geoRestriction: string[];
  fieldOfStudy: string[];
  demographics: string[];
  gpaMin?: number;
  otherCriteria: string[];
}

/** Hours range for opportunities */
export interface HoursRange {
  min: number;
  max: number;
}

/** Opportunity schedule type */
export type OpportunitySchedule = 'weekly' | 'one-time' | 'flexible';

/**
 * Funder Node
 * Represents foundations, corporations, government entities, DAFs, or individuals
 * that provide funding for grants or scholarships.
 */
export interface Funder {
  id: string;
  name: string;
  type: FunderType;
  focusAreas: string[];
  geoFocus: string[];
  totalGiving: number;
  source: string[];
}

/**
 * Grant Node
 * Represents a funding opportunity offered by a Funder to Organizations.
 */
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

/**
 * Scholarship Node
 * Represents a funding opportunity offered by a Funder to Persons.
 */
export interface Scholarship {
  id: string;
  title: string;
  amount: AmountRange;
  deadline: Date;
  eligibility: ScholarshipEligibility;
  applicationUrl: string;
  renewable: boolean;
  lastUpdated: Date;
}

/**
 * Opportunity Node
 * Represents a volunteer opportunity offered by an Org.
 * Unlike Grants/Scholarships, opportunities are measured in hours, not money.
 */
export interface Opportunity {
  id: string;
  title: string;
  description: string;
  hoursNeeded: HoursRange;
  schedule: OpportunitySchedule;
  siteId?: string;
  skills: string[];
  focusAreas: string[];
  deadline?: Date;
  spotsAvailable: number;
  lastUpdated: Date;
}

/**
 * Organization Node
 * Represents a non-profit, fiscal sponsor, or other organizational entity.
 */
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

/**
 * Person Node
 * Represents an individual—volunteer, applicant, or beneficiary.
 */
export interface Person {
  id: string;
  name: string;
  location?: string;
  interests: string[];
  affiliations: string[]; // orgId references
}

/**
 * Site Node
 * Represents a physical location where contributions occur.
 * Used for NFC-based check-in during capture.
 */
export interface Site {
  id: string;
  name: string;
  location: GeoLocation;
  nfcTagId?: string;
  type: SiteType;
}

/**
 * Project Node
 * Represents a specific initiative run by an Organization.
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  focusAreas: string[];
}

/**
 * Contribution Node
 * Records a volunteer's contribution—the core unit of Kala generation.
 *
 * First Principle: Capture is ritual.
 * Volunteers actively claim their contribution. Not surveillance.
 *
 * First Principle: Offline-first.
 * synced=false until successfully synchronized with FalkorDB.
 */
export interface Contribution {
  id: string;
  timestamp: Date;
  duration: number; // minutes
  kalaGenerated: number;
  mediaRef?: string; // reference to photo/video
  synced: boolean;
}

/**
 * Activity Node
 * Represents an action or event enabled by funding.
 * Used for tracing ripple effects.
 */
export interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
}

/**
 * Output Node
 * Represents a tangible result of an Activity (e.g., produce distributed).
 * Used for downstream impact tracing.
 */
export interface Output {
  id: string;
  type: string;
  description: string;
  quantity?: number;
  unit?: string;
  timestamp: Date;
}

/**
 * FocusArea Node
 * Represents a domain or category of work (e.g., "food security", "education").
 * Used for matching and filtering.
 */
export interface FocusArea {
  id: string;
  name: string;
  description?: string;
}

/** Union type of all node types */
export type NodeType =
  | Funder
  | Grant
  | Scholarship
  | Opportunity
  | Org
  | Person
  | Site
  | Project
  | Contribution
  | Activity
  | Output
  | FocusArea;

/** Node type labels for Cypher queries */
export type NodeLabel =
  | 'Funder'
  | 'Grant'
  | 'Scholarship'
  | 'Opportunity'
  | 'Org'
  | 'Person'
  | 'Site'
  | 'Project'
  | 'Contribution'
  | 'Activity'
  | 'Output'
  | 'FocusArea';
