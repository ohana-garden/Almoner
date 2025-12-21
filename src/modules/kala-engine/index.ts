/**
 * Kala Engine Module
 *
 * Purpose: Calculate and record Kala from contributions
 * Dependencies: Graph Core
 *
 * Rules: Kala = (duration / 60) * 50, always. Never transfer, never trade.
 *
 * Knows NOTHING about: Grants, matching, funders, ripples
 *
 * First Principle: Kala is contribution pattern, not currency.
 * Non-transferable. 50 per hour regardless of role. Records activity, not value judgments.
 *
 * VIOLATION WARNING:
 * - Kala as transferable or tradeable → WRONG
 * - Any function that moves Kala between people → WRONG
 */

import type { GraphConnection } from '../graph-core';
import type { Contribution, Person } from '../../types/nodes';

/** Kala calculation result */
export interface KalaResult {
  durationMinutes: number;
  kalaGenerated: number;
}

/** Person's Kala summary */
export interface KalaSummary {
  personId: string;
  personName: string;
  totalKala: number;
  totalContributions: number;
  totalMinutes: number;
  firstContribution?: Date;
  lastContribution?: Date;
}

/** Kala by time period */
export interface KalaByPeriod {
  period: string; // ISO date string (day/week/month)
  kala: number;
  contributions: number;
  minutes: number;
}

/**
 * Kala Engine
 *
 * First Principle: Kala is contribution pattern, not currency.
 * - 50 Kala per hour, regardless of role
 * - Non-transferable
 * - Records activity, not value judgments
 */
export class KalaEngine {
  private connection: GraphConnection;

  /** Fixed rate: 50 Kala per hour */
  private static readonly KALA_PER_HOUR = 50;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  /**
   * Calculate Kala from duration.
   *
   * Kala is ALWAYS calculated this way. No exceptions.
   * Kala = (durationMinutes / 60) * 50
   */
  calculateKala(durationMinutes: number): KalaResult {
    if (durationMinutes < 0) {
      throw new Error('Duration cannot be negative');
    }

    const kalaGenerated = (durationMinutes / 60) * KalaEngine.KALA_PER_HOUR;

    return {
      durationMinutes,
      kalaGenerated: Math.round(kalaGenerated * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Record a contribution and calculate its Kala.
   *
   * First Principle: Capture is ritual.
   * Volunteers actively claim their contribution. Not surveillance.
   */
  async recordContribution(
    personId: string,
    durationMinutes: number,
    options: {
      siteId?: string;
      projectId?: string;
      mediaRef?: string;
      timestamp?: Date;
      synced?: boolean;
    } = {}
  ): Promise<Contribution> {
    const { kalaGenerated } = this.calculateKala(durationMinutes);

    const contribution: Contribution = {
      id: crypto.randomUUID(),
      timestamp: options.timestamp || new Date(),
      duration: durationMinutes,
      kalaGenerated,
      mediaRef: options.mediaRef,
      synced: options.synced ?? true,
    };

    // Create the Contribution node
    const createCypher = `
      CREATE (c:Contribution $properties)
      RETURN c
    `;

    await this.connection.mutate(createCypher, {
      properties: {
        id: contribution.id,
        timestamp: contribution.timestamp.toISOString(),
        duration: contribution.duration,
        kalaGenerated: contribution.kalaGenerated,
        mediaRef: contribution.mediaRef || null,
        synced: contribution.synced,
      },
    });

    // Create CONTRIBUTED edge from Person to Contribution
    const personEdgeCypher = `
      MATCH (p:Person {id: $personId})
      MATCH (c:Contribution {id: $contributionId})
      CREATE (p)-[:CONTRIBUTED {id: $edgeId, createdAt: $createdAt}]->(c)
    `;

    await this.connection.mutate(personEdgeCypher, {
      personId,
      contributionId: contribution.id,
      edgeId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });

    // Create AT edge if siteId provided
    if (options.siteId) {
      const siteEdgeCypher = `
        MATCH (c:Contribution {id: $contributionId})
        MATCH (s:Site {id: $siteId})
        CREATE (c)-[:AT {id: $edgeId, createdAt: $createdAt}]->(s)
      `;

      await this.connection.mutate(siteEdgeCypher, {
        contributionId: contribution.id,
        siteId: options.siteId,
        edgeId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    }

    // Create FOR edge if projectId provided
    if (options.projectId) {
      const projectEdgeCypher = `
        MATCH (c:Contribution {id: $contributionId})
        MATCH (p:Project {id: $projectId})
        CREATE (c)-[:FOR {id: $edgeId, createdAt: $createdAt}]->(p)
      `;

      await this.connection.mutate(projectEdgeCypher, {
        contributionId: contribution.id,
        projectId: options.projectId,
        edgeId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    }

    return contribution;
  }

  /**
   * Get total Kala for a person.
   *
   * Kala is queryable but never transferable.
   * "How much Kala has this person generated?" = valid
   * "Transfer 50 Kala to another person" = INVALID, not possible
   */
  async getPersonKala(personId: string): Promise<KalaSummary> {
    const cypher = `
      MATCH (p:Person {id: $personId})-[:CONTRIBUTED]->(c:Contribution)
      RETURN
        p.id as personId,
        p.name as personName,
        sum(c.kalaGenerated) as totalKala,
        count(c) as totalContributions,
        sum(c.duration) as totalMinutes,
        min(c.timestamp) as firstContribution,
        max(c.timestamp) as lastContribution
    `;

    const results = await this.connection.query<{
      personId: string;
      personName: string;
      totalKala: number;
      totalContributions: number;
      totalMinutes: number;
      firstContribution: string;
      lastContribution: string;
    }>(cypher, { personId });

    if (results.length === 0) {
      // Person exists but has no contributions
      const personCypher = `
        MATCH (p:Person {id: $personId})
        RETURN p.name as name
      `;
      const personResult = await this.connection.query<{ name: string }>(personCypher, { personId });

      return {
        personId,
        personName: personResult[0]?.name || 'Unknown',
        totalKala: 0,
        totalContributions: 0,
        totalMinutes: 0,
      };
    }

    const result = results[0];
    return {
      personId: result.personId,
      personName: result.personName,
      totalKala: result.totalKala || 0,
      totalContributions: result.totalContributions || 0,
      totalMinutes: result.totalMinutes || 0,
      firstContribution: result.firstContribution ? new Date(result.firstContribution) : undefined,
      lastContribution: result.lastContribution ? new Date(result.lastContribution) : undefined,
    };
  }

  /**
   * Get Kala for a project.
   */
  async getProjectKala(projectId: string): Promise<{
    projectId: string;
    projectName: string;
    totalKala: number;
    totalContributions: number;
    contributors: number;
  }> {
    const cypher = `
      MATCH (c:Contribution)-[:FOR]->(proj:Project {id: $projectId})
      MATCH (p:Person)-[:CONTRIBUTED]->(c)
      RETURN
        proj.id as projectId,
        proj.name as projectName,
        sum(c.kalaGenerated) as totalKala,
        count(c) as totalContributions,
        count(DISTINCT p) as contributors
    `;

    const results = await this.connection.query<{
      projectId: string;
      projectName: string;
      totalKala: number;
      totalContributions: number;
      contributors: number;
    }>(cypher, { projectId });

    if (results.length === 0) {
      return {
        projectId,
        projectName: 'Unknown',
        totalKala: 0,
        totalContributions: 0,
        contributors: 0,
      };
    }

    return results[0];
  }

  /**
   * Get Kala for a site.
   */
  async getSiteKala(siteId: string): Promise<{
    siteId: string;
    siteName: string;
    totalKala: number;
    totalContributions: number;
    contributors: number;
  }> {
    const cypher = `
      MATCH (c:Contribution)-[:AT]->(s:Site {id: $siteId})
      MATCH (p:Person)-[:CONTRIBUTED]->(c)
      RETURN
        s.id as siteId,
        s.name as siteName,
        sum(c.kalaGenerated) as totalKala,
        count(c) as totalContributions,
        count(DISTINCT p) as contributors
    `;

    const results = await this.connection.query<{
      siteId: string;
      siteName: string;
      totalKala: number;
      totalContributions: number;
      contributors: number;
    }>(cypher, { siteId });

    if (results.length === 0) {
      return {
        siteId,
        siteName: 'Unknown',
        totalKala: 0,
        totalContributions: 0,
        contributors: 0,
      };
    }

    return results[0];
  }

  /**
   * Get Kala breakdown by time period.
   */
  async getKalaByPeriod(
    personId: string,
    granularity: 'day' | 'week' | 'month'
  ): Promise<KalaByPeriod[]> {
    // FalkorDB date functions would be used here
    // This is a simplified implementation
    const cypher = `
      MATCH (p:Person {id: $personId})-[:CONTRIBUTED]->(c:Contribution)
      RETURN c.timestamp as timestamp, c.kalaGenerated as kala, c.duration as minutes
      ORDER BY c.timestamp
    `;

    const results = await this.connection.query<{
      timestamp: string;
      kala: number;
      minutes: number;
    }>(cypher, { personId });

    // Group by period
    const byPeriod = new Map<string, KalaByPeriod>();

    for (const result of results) {
      const date = new Date(result.timestamp);
      let periodKey: string;

      switch (granularity) {
        case 'day':
          periodKey = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      const existing = byPeriod.get(periodKey) || {
        period: periodKey,
        kala: 0,
        contributions: 0,
        minutes: 0,
      };

      existing.kala += result.kala;
      existing.contributions += 1;
      existing.minutes += result.minutes;

      byPeriod.set(periodKey, existing);
    }

    return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Get leaderboard of top Kala generators.
   *
   * Note: This is for visibility and recognition, NOT for competition.
   * Kala is contribution pattern, not a score to maximize.
   */
  async getLeaderboard(limit = 10): Promise<KalaSummary[]> {
    const cypher = `
      MATCH (p:Person)-[:CONTRIBUTED]->(c:Contribution)
      WITH p, sum(c.kalaGenerated) as totalKala, count(c) as totalContributions, sum(c.duration) as totalMinutes
      RETURN
        p.id as personId,
        p.name as personName,
        totalKala,
        totalContributions,
        totalMinutes
      ORDER BY totalKala DESC
      LIMIT $limit
    `;

    const results = await this.connection.query<{
      personId: string;
      personName: string;
      totalKala: number;
      totalContributions: number;
      totalMinutes: number;
    }>(cypher, { limit });

    return results.map((r) => ({
      personId: r.personId,
      personName: r.personName,
      totalKala: r.totalKala,
      totalContributions: r.totalContributions,
      totalMinutes: r.totalMinutes,
    }));
  }

  /**
   * Mark unsynced contributions as synced.
   *
   * First Principle: Offline-first.
   * This is called when contributions captured offline are synchronized.
   */
  async markSynced(contributionIds: string[]): Promise<number> {
    const cypher = `
      MATCH (c:Contribution)
      WHERE c.id IN $ids AND c.synced = false
      SET c.synced = true
      RETURN count(c) as updated
    `;

    const results = await this.connection.query<{ updated: number }>(cypher, { ids: contributionIds });
    return results[0]?.updated ?? 0;
  }

  /**
   * Get unsynced contributions for a person.
   *
   * First Principle: Offline-first.
   * Used to find contributions that need to be synced.
   */
  async getUnsyncedContributions(personId: string): Promise<Contribution[]> {
    const cypher = `
      MATCH (p:Person {id: $personId})-[:CONTRIBUTED]->(c:Contribution)
      WHERE c.synced = false
      RETURN c
      ORDER BY c.timestamp
    `;

    const results = await this.connection.query<{ c: Contribution }>(cypher, { personId });

    return results.map((r) => ({
      ...r.c,
      timestamp: new Date(r.c.timestamp),
    }));
  }
}

/**
 * Create a Kala Engine.
 */
export function createKalaEngine(connection: GraphConnection): KalaEngine {
  return new KalaEngine(connection);
}
