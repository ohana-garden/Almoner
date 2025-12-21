/**
 * Matching Engine Module
 *
 * Purpose: Match orgs/people to grants/scholarships
 * Dependencies: Graph Core
 *
 * Knows NOTHING about: Capture, ripples, ingestion
 *
 * First Principle: Graph is source of truth.
 * All matching is based on graph relationships and properties.
 */

import type { GraphConnection } from '../graph-core';
import type { Grant, Scholarship, Org, Person } from '../../types/nodes';

/** Match quality score */
export interface MatchScore {
  overall: number; // 0.0 to 1.0
  factors: {
    focusAreaMatch: number;
    geoMatch: number;
    eligibilityMatch: number;
    amountFit?: number;
  };
  explanation: string[];
}

/** Grant match result */
export interface GrantMatch {
  grant: Grant;
  score: MatchScore;
  deadline: Date;
  funderId?: string;
  funderName?: string;
}

/** Scholarship match result */
export interface ScholarshipMatch {
  scholarship: Scholarship;
  score: MatchScore;
  deadline: Date;
  funderId?: string;
  funderName?: string;
}

/** Match filters */
export interface MatchFilters {
  minAmount?: number;
  maxAmount?: number;
  focusAreas?: string[];
  geoFocus?: string[];
  deadlineAfter?: Date;
  deadlineBefore?: Date;
  minScore?: number;
}

/**
 * Matching Engine
 *
 * Matches organizations and people to relevant grants and scholarships
 * based on focus areas, geography, eligibility, and other criteria.
 */
export class MatchingEngine {
  private connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  /**
   * Find matching grants for an organization.
   */
  async matchGrantsForOrg(
    orgId: string,
    filters: MatchFilters = {}
  ): Promise<GrantMatch[]> {
    // Get the organization's profile
    const org = await this.getOrg(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    // Build the matching query
    const cypher = this.buildGrantMatchQuery(filters);

    const results = await this.connection.query<{
      g: Grant;
      funderId?: string;
      funderName?: string;
    }>(cypher, {
      orgId,
      deadlineAfter: filters.deadlineAfter?.toISOString() || new Date().toISOString(),
      deadlineBefore: filters.deadlineBefore?.toISOString(),
      focusAreas: filters.focusAreas || org.focusAreas,
      geoFocus: filters.geoFocus || org.geoFocus,
    });

    // Score each match
    const matches: GrantMatch[] = [];
    for (const result of results) {
      const grant = this.parseGrant(result.g);
      const score = this.scoreGrantMatch(org, grant, filters);

      // Apply minimum score filter
      if (filters.minScore && score.overall < filters.minScore) {
        continue;
      }

      // Apply amount filters
      if (filters.minAmount && grant.amount.max < filters.minAmount) {
        continue;
      }
      if (filters.maxAmount && grant.amount.min > filters.maxAmount) {
        continue;
      }

      matches.push({
        grant,
        score,
        deadline: grant.deadline,
        funderId: result.funderId,
        funderName: result.funderName,
      });
    }

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score.overall - a.score.overall);
  }

  /**
   * Find matching scholarships for a person.
   */
  async matchScholarshipsForPerson(
    personId: string,
    filters: MatchFilters = {}
  ): Promise<ScholarshipMatch[]> {
    // Get the person's profile
    const person = await this.getPerson(personId);
    if (!person) {
      throw new Error(`Person not found: ${personId}`);
    }

    // Build the matching query
    const cypher = this.buildScholarshipMatchQuery(filters);

    const results = await this.connection.query<{
      s: Scholarship;
      funderId?: string;
      funderName?: string;
    }>(cypher, {
      personId,
      deadlineAfter: filters.deadlineAfter?.toISOString() || new Date().toISOString(),
      deadlineBefore: filters.deadlineBefore?.toISOString(),
      interests: filters.focusAreas || person.interests,
      location: person.location,
    });

    // Score each match
    const matches: ScholarshipMatch[] = [];
    for (const result of results) {
      const scholarship = this.parseScholarship(result.s);
      const score = this.scoreScholarshipMatch(person, scholarship, filters);

      // Apply minimum score filter
      if (filters.minScore && score.overall < filters.minScore) {
        continue;
      }

      // Apply amount filters
      if (filters.minAmount && scholarship.amount.max < filters.minAmount) {
        continue;
      }
      if (filters.maxAmount && scholarship.amount.min > filters.maxAmount) {
        continue;
      }

      matches.push({
        scholarship,
        score,
        deadline: scholarship.deadline,
        funderId: result.funderId,
        funderName: result.funderName,
      });
    }

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score.overall - a.score.overall);
  }

  /**
   * Find organizations that might be good fits for a grant.
   * Useful for funders looking to promote their grants.
   */
  async findOrgsForGrant(
    grantId: string,
    limit = 20
  ): Promise<Array<{ org: Org; score: MatchScore }>> {
    const grant = await this.getGrant(grantId);
    if (!grant) {
      throw new Error(`Grant not found: ${grantId}`);
    }

    const cypher = `
      MATCH (o:Org)
      WHERE o.verified = true
      RETURN o
      LIMIT ${limit * 2}
    `;

    const results = await this.connection.query<{ o: Org }>(cypher);

    const matches: Array<{ org: Org; score: MatchScore }> = [];
    for (const result of results) {
      const org = this.parseOrg(result.o);
      const score = this.scoreGrantMatch(org, grant, {});

      matches.push({ org, score });
    }

    return matches.sort((a, b) => b.score.overall - a.score.overall).slice(0, limit);
  }

  /**
   * Get grants expiring soon.
   */
  async getExpiringGrants(
    withinDays: number = 30
  ): Promise<Array<{ grant: Grant; daysRemaining: number }>> {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + withinDays);

    const cypher = `
      MATCH (g:Grant)
      WHERE g.deadline >= $now AND g.deadline <= $deadline
      RETURN g
      ORDER BY g.deadline ASC
    `;

    const results = await this.connection.query<{ g: Grant }>(cypher, {
      now: new Date().toISOString(),
      deadline: deadline.toISOString(),
    });

    return results.map((result) => {
      const grant = this.parseGrant(result.g);
      const daysRemaining = Math.ceil(
        (grant.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return { grant, daysRemaining };
    });
  }

  /**
   * Get recommended grants for an org based on their past applications.
   */
  async getRecommendationsForOrg(orgId: string, limit = 10): Promise<GrantMatch[]> {
    // Get successful applications to understand what works
    const pastCypher = `
      MATCH (o:Org {id: $orgId})-[a:APPLIED_TO]->(g:Grant)
      WHERE a.status = 'approved'
      RETURN g.focusAreas as focusAreas, g.eligibility as eligibility
    `;

    const pastResults = await this.connection.query<{
      focusAreas: string;
      eligibility: string;
    }>(pastCypher, { orgId });

    // Build profile from past successes
    const successFocusAreas = new Set<string>();
    for (const past of pastResults) {
      const areas = JSON.parse(past.focusAreas || '[]');
      for (const area of areas) {
        successFocusAreas.add(area);
      }
    }

    // Match new grants based on success profile
    return this.matchGrantsForOrg(orgId, {
      focusAreas: Array.from(successFocusAreas),
      minScore: 0.6,
    });
  }

  /**
   * Build Cypher query for grant matching.
   */
  private buildGrantMatchQuery(filters: MatchFilters): string {
    let query = `
      MATCH (g:Grant)
      OPTIONAL MATCH (f:Funder)-[:OFFERS]->(g)
      WHERE g.deadline >= $deadlineAfter
    `;

    if (filters.deadlineBefore) {
      query += ` AND g.deadline <= $deadlineBefore`;
    }

    query += `
      RETURN g, f.id as funderId, f.name as funderName
      LIMIT 100
    `;

    return query;
  }

  /**
   * Build Cypher query for scholarship matching.
   */
  private buildScholarshipMatchQuery(filters: MatchFilters): string {
    let query = `
      MATCH (s:Scholarship)
      OPTIONAL MATCH (f:Funder)-[:OFFERS]->(s)
      WHERE s.deadline >= $deadlineAfter
    `;

    if (filters.deadlineBefore) {
      query += ` AND s.deadline <= $deadlineBefore`;
    }

    query += `
      RETURN s, f.id as funderId, f.name as funderName
      LIMIT 100
    `;

    return query;
  }

  /**
   * Score a grant match for an organization.
   */
  private scoreGrantMatch(org: Org, grant: Grant, filters: MatchFilters): MatchScore {
    const explanation: string[] = [];
    let focusAreaMatch = 0;
    let geoMatch = 0;
    let eligibilityMatch = 0;

    // Focus area matching
    const orgAreas = new Set(org.focusAreas.map((a) => a.toLowerCase()));
    const grantAreas = grant.focusAreas.map((a) => a.toLowerCase());
    let focusMatches = 0;

    for (const area of grantAreas) {
      if (orgAreas.has(area)) {
        focusMatches++;
      }
    }

    if (grantAreas.length > 0) {
      focusAreaMatch = focusMatches / grantAreas.length;
      if (focusAreaMatch > 0) {
        explanation.push(`${Math.round(focusAreaMatch * 100)}% focus area overlap`);
      }
    } else {
      focusAreaMatch = 0.5; // No focus areas specified = neutral
    }

    // Geographic matching (simplified)
    // In production, this would handle region hierarchies (city in state in country)
    const orgGeo = new Set(org.geoFocus.map((g) => g.toLowerCase()));
    for (const eligibility of grant.eligibility) {
      if (orgGeo.has(eligibility.toLowerCase())) {
        geoMatch = 1;
        explanation.push('Geographic eligibility match');
        break;
      }
    }

    // If no geo restriction, assume eligible
    if (grant.eligibility.length === 0) {
      geoMatch = 0.8;
    }

    // Eligibility matching (simplified)
    // Check if org type matches grant eligibility requirements
    if (org.verified) {
      eligibilityMatch = 0.8;
      explanation.push('Verified organization');
    } else {
      eligibilityMatch = 0.5;
      explanation.push('Unverified organization (reduced score)');
    }

    // Calculate overall score (weighted average)
    const overall =
      focusAreaMatch * 0.4 + geoMatch * 0.3 + eligibilityMatch * 0.3;

    return {
      overall,
      factors: {
        focusAreaMatch,
        geoMatch,
        eligibilityMatch,
      },
      explanation,
    };
  }

  /**
   * Score a scholarship match for a person.
   */
  private scoreScholarshipMatch(
    person: Person,
    scholarship: Scholarship,
    filters: MatchFilters
  ): MatchScore {
    const explanation: string[] = [];
    let focusAreaMatch = 0;
    let geoMatch = 0;
    let eligibilityMatch = 0;

    // Interest/field matching
    const personInterests = new Set(person.interests.map((i) => i.toLowerCase()));
    const scholarshipFields = scholarship.eligibility.fieldOfStudy.map((f) => f.toLowerCase());
    let fieldMatches = 0;

    for (const field of scholarshipFields) {
      if (personInterests.has(field)) {
        fieldMatches++;
      }
    }

    if (scholarshipFields.length > 0) {
      focusAreaMatch = fieldMatches / scholarshipFields.length;
      if (focusAreaMatch > 0) {
        explanation.push(`${Math.round(focusAreaMatch * 100)}% field of study match`);
      }
    } else {
      focusAreaMatch = 0.7; // No field restriction = mostly eligible
    }

    // Geographic matching
    if (person.location && scholarship.eligibility.geoRestriction.length > 0) {
      const personLoc = person.location.toLowerCase();
      for (const geo of scholarship.eligibility.geoRestriction) {
        if (personLoc.includes(geo.toLowerCase()) || geo.toLowerCase().includes(personLoc)) {
          geoMatch = 1;
          explanation.push('Geographic eligibility confirmed');
          break;
        }
      }
    } else if (scholarship.eligibility.geoRestriction.length === 0) {
      geoMatch = 0.9; // No geo restriction
    }

    // Demographic eligibility (simplified)
    // In production, would check demographic criteria against person profile
    if (scholarship.eligibility.demographics.length === 0) {
      eligibilityMatch = 0.8;
    } else {
      eligibilityMatch = 0.5; // Unknown eligibility without more person data
      explanation.push('Demographic eligibility needs verification');
    }

    // Calculate overall score (weighted average)
    const overall =
      focusAreaMatch * 0.35 + geoMatch * 0.35 + eligibilityMatch * 0.3;

    return {
      overall,
      factors: {
        focusAreaMatch,
        geoMatch,
        eligibilityMatch,
      },
      explanation,
    };
  }

  /**
   * Get organization by ID.
   */
  private async getOrg(orgId: string): Promise<Org | null> {
    const cypher = `MATCH (o:Org {id: $orgId}) RETURN o`;
    const results = await this.connection.query<{ o: Org }>(cypher, { orgId });
    return results.length > 0 ? this.parseOrg(results[0].o) : null;
  }

  /**
   * Get person by ID.
   */
  private async getPerson(personId: string): Promise<Person | null> {
    const cypher = `MATCH (p:Person {id: $personId}) RETURN p`;
    const results = await this.connection.query<{ p: Person }>(cypher, { personId });
    return results.length > 0 ? this.parsePerson(results[0].p) : null;
  }

  /**
   * Get grant by ID.
   */
  private async getGrant(grantId: string): Promise<Grant | null> {
    const cypher = `MATCH (g:Grant {id: $grantId}) RETURN g`;
    const results = await this.connection.query<{ g: Grant }>(cypher, { grantId });
    return results.length > 0 ? this.parseGrant(results[0].g) : null;
  }

  /**
   * Parse grant from database result.
   */
  private parseGrant(raw: Record<string, unknown>): Grant {
    return {
      id: raw.id as string,
      title: raw.title as string,
      amount: typeof raw.amount === 'string' ? JSON.parse(raw.amount) : raw.amount,
      deadline: new Date(raw.deadline as string),
      eligibility: typeof raw.eligibility === 'string' ? JSON.parse(raw.eligibility) : raw.eligibility || [],
      focusAreas: typeof raw.focusAreas === 'string' ? JSON.parse(raw.focusAreas) : raw.focusAreas || [],
      applicationUrl: raw.applicationUrl as string,
      lastUpdated: new Date(raw.lastUpdated as string),
    } as Grant;
  }

  /**
   * Parse scholarship from database result.
   */
  private parseScholarship(raw: Record<string, unknown>): Scholarship {
    return {
      id: raw.id as string,
      title: raw.title as string,
      amount: typeof raw.amount === 'string' ? JSON.parse(raw.amount) : raw.amount,
      deadline: new Date(raw.deadline as string),
      eligibility: typeof raw.eligibility === 'string' ? JSON.parse(raw.eligibility) : raw.eligibility,
      applicationUrl: raw.applicationUrl as string,
      renewable: raw.renewable as boolean,
      lastUpdated: new Date(raw.lastUpdated as string),
    } as Scholarship;
  }

  /**
   * Parse org from database result.
   */
  private parseOrg(raw: Record<string, unknown>): Org {
    return {
      id: raw.id as string,
      name: raw.name as string,
      ein: raw.ein as string | undefined,
      fiscalSponsor: raw.fiscalSponsor as string | undefined,
      mission: raw.mission as string,
      focusAreas: typeof raw.focusAreas === 'string' ? JSON.parse(raw.focusAreas) : raw.focusAreas || [],
      geoFocus: typeof raw.geoFocus === 'string' ? JSON.parse(raw.geoFocus) : raw.geoFocus || [],
      verified: raw.verified as boolean,
    };
  }

  /**
   * Parse person from database result.
   */
  private parsePerson(raw: Record<string, unknown>): Person {
    return {
      id: raw.id as string,
      name: raw.name as string,
      location: raw.location as string | undefined,
      interests: typeof raw.interests === 'string' ? JSON.parse(raw.interests) : raw.interests || [],
      affiliations: typeof raw.affiliations === 'string' ? JSON.parse(raw.affiliations) : raw.affiliations || [],
    };
  }
}

/**
 * Create a Matching Engine.
 */
export function createMatchingEngine(connection: GraphConnection): MatchingEngine {
  return new MatchingEngine(connection);
}
