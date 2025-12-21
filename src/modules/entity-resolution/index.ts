/**
 * Entity Resolution Module (Graphiti Integration)
 *
 * Purpose: Deduplicate funders/orgs from multiple sources, extract entities from text
 * Dependencies: Graphiti, Graph Core
 *
 * Knows NOTHING about: Kala, matching, UI, volunteers
 *
 * First Principle: Graph is source of truth.
 * Entity resolution ensures the graph contains canonical, deduplicated entities.
 *
 * This module can operate in two modes:
 * 1. With Graphiti service - Full ML-based entity extraction and deduplication
 * 2. Fallback mode - Local fuzzy matching when Graphiti is unavailable
 */

import type { GraphConnection } from '../graph-core';
import type { Funder, Org, Person } from '../../types/nodes';

/** Graphiti API response types */
interface GraphitiEntityResult {
  id: string;
  name: string;
  entity_type: string;
  is_new: boolean;
  confidence: number;
  properties: Record<string, unknown>;
}

interface GraphitiHealthResponse {
  status: string;
  graphiti_connected: boolean;
  falkordb_url: string;
  graph_name: string;
}

/** Confidence score for entity matches */
export interface MatchConfidence {
  score: number; // 0.0 to 1.0
  factors: string[];
}

/** Entity match result */
export interface EntityMatch<T> {
  entity: T;
  confidence: MatchConfidence;
  isNew: boolean;
}

/** Extracted entity from text */
export interface ExtractedEntity {
  type: 'Funder' | 'Org' | 'Person' | 'FocusArea';
  name: string;
  properties: Record<string, unknown>;
  sourceText: string;
  position: { start: number; end: number };
}

/**
 * Entity Resolution Engine
 *
 * Uses Graphiti for:
 * - Entity extraction from unstructured text
 * - Deduplication across data sources
 * - Entity linking and coreference resolution
 *
 * Falls back to local fuzzy matching when Graphiti is unavailable.
 */
export class EntityResolutionEngine {
  private connection: GraphConnection;
  private graphitiEndpoint: string;
  private graphitiAvailable: boolean | null = null;

  constructor(
    connection: GraphConnection,
    graphitiEndpoint: string,
    _graphitiApiKey?: string // Kept for backwards compatibility
  ) {
    this.connection = connection;
    this.graphitiEndpoint = graphitiEndpoint;
  }

  /**
   * Check if Graphiti service is available.
   */
  async isGraphitiAvailable(): Promise<boolean> {
    if (this.graphitiAvailable !== null) {
      return this.graphitiAvailable;
    }

    if (!this.graphitiEndpoint) {
      this.graphitiAvailable = false;
      return false;
    }

    try {
      const response = await fetch(`${this.graphitiEndpoint}/health`);
      if (response.ok) {
        const data = (await response.json()) as GraphitiHealthResponse;
        this.graphitiAvailable = data.graphiti_connected;
        return this.graphitiAvailable;
      }
    } catch {
      // Graphiti not available
    }

    this.graphitiAvailable = false;
    return false;
  }

  /**
   * Call Graphiti API endpoint.
   */
  private async callGraphiti<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T | null> {
    if (!(await this.isGraphitiAvailable())) {
      return null;
    }

    try {
      const response = await fetch(`${this.graphitiEndpoint}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return (await response.json()) as T;
      }
    } catch {
      // API call failed
    }

    return null;
  }

  /**
   * Extract entities from unstructured text.
   *
   * Uses Graphiti for ML-based NER when available,
   * falls back to pattern matching otherwise.
   */
  async extractEntities(text: string, source = 'manual'): Promise<ExtractedEntity[]> {
    // Try Graphiti first
    const graphitiResult = await this.callGraphiti<GraphitiEntityResult[]>(
      '/extract',
      { text, source }
    );

    if (graphitiResult) {
      return graphitiResult.map((entity) => ({
        type: entity.entity_type as ExtractedEntity['type'],
        name: entity.name,
        properties: entity.properties,
        sourceText: text.substring(0, 100),
        position: { start: 0, end: 0 },
      }));
    }

    // Fallback: Basic pattern matching
    const entities: ExtractedEntity[] = [];

    const orgPatterns = [
      /(?:Foundation|Trust|Fund|Institute|Association|Society)\s+(?:of\s+)?[\w\s]+/gi,
    ];

    for (const pattern of orgPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type: 'Org',
          name: match[0].trim(),
          properties: {},
          sourceText: text.substring(
            Math.max(0, match.index - 50),
            Math.min(text.length, match.index + match[0].length + 50)
          ),
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Find or create a Funder, deduplicating against existing entries.
   * Tries Graphiti API first, falls back to local matching.
   */
  async resolveFunder(
    candidate: Omit<Funder, 'id'>
  ): Promise<EntityMatch<Funder>> {
    // Try Graphiti first for ML-based resolution
    const graphitiResult = await this.callGraphiti<GraphitiEntityResult>(
      '/resolve/funder',
      {
        name: candidate.name,
        type: candidate.type || 'foundation',
        focus_areas: candidate.focusAreas || [],
        geo_focus: candidate.geoFocus || [],
        total_giving: candidate.totalGiving,
        source: candidate.source?.[0] || 'manual',
      }
    );

    if (graphitiResult && graphitiResult.id !== 'unknown') {
      // Use Graphiti's resolved entity
      const funder: Funder = {
        id: graphitiResult.id,
        name: graphitiResult.name,
        type: (graphitiResult.properties.type as Funder['type']) || candidate.type,
        focusAreas: (graphitiResult.properties.focus_areas as string[]) || candidate.focusAreas,
        geoFocus: (graphitiResult.properties.geo_focus as string[]) || candidate.geoFocus,
        totalGiving: (graphitiResult.properties.total_giving as number) ?? candidate.totalGiving,
        source: candidate.source,
      };
      return {
        entity: funder,
        confidence: { score: graphitiResult.confidence, factors: ['graphiti_resolution'] },
        isNew: graphitiResult.is_new,
      };
    }

    // Fallback to local matching
    const existing = await this.findSimilarFunders(candidate.name);

    if (existing.length > 0 && existing[0].confidence.score >= 0.9) {
      return {
        entity: existing[0].entity,
        confidence: existing[0].confidence,
        isNew: false,
      };
    }

    // No confident match found - create new entity
    const newFunder = await this.createFunder(candidate);
    return {
      entity: newFunder,
      confidence: { score: 1.0, factors: ['new_entity'] },
      isNew: true,
    };
  }

  /**
   * Find or create an Organization, deduplicating against existing entries.
   * Tries Graphiti API first, falls back to local matching.
   */
  async resolveOrg(candidate: Omit<Org, 'id'>): Promise<EntityMatch<Org>> {
    // Try Graphiti first for ML-based resolution
    const graphitiResult = await this.callGraphiti<GraphitiEntityResult>(
      '/resolve/org',
      {
        name: candidate.name,
        ein: candidate.ein,
        mission: candidate.mission,
        focus_areas: candidate.focusAreas || [],
        geo_focus: candidate.geoFocus || [],
        source: 'manual',
      }
    );

    if (graphitiResult && graphitiResult.id !== 'unknown') {
      // Use Graphiti's resolved entity
      const org: Org = {
        id: graphitiResult.id,
        name: graphitiResult.name,
        ein: (graphitiResult.properties.ein as string) || candidate.ein,
        fiscalSponsor: candidate.fiscalSponsor,
        mission: (graphitiResult.properties.mission as string) || candidate.mission,
        focusAreas: (graphitiResult.properties.focus_areas as string[]) || candidate.focusAreas,
        geoFocus: (graphitiResult.properties.geo_focus as string[]) || candidate.geoFocus,
        verified: candidate.verified ?? false,
      };
      return {
        entity: org,
        confidence: { score: graphitiResult.confidence, factors: ['graphiti_resolution'] },
        isNew: graphitiResult.is_new,
      };
    }

    // Fallback to local matching
    // If EIN is provided, use it for exact matching
    if (candidate.ein) {
      const byEin = await this.findOrgByEin(candidate.ein);
      if (byEin) {
        return {
          entity: byEin,
          confidence: { score: 1.0, factors: ['ein_match'] },
          isNew: false,
        };
      }
    }

    // Search by name similarity
    const existing = await this.findSimilarOrgs(candidate.name);

    if (existing.length > 0 && existing[0].confidence.score >= 0.9) {
      return {
        entity: existing[0].entity,
        confidence: existing[0].confidence,
        isNew: false,
      };
    }

    // No confident match found - create new entity
    const newOrg = await this.createOrg(candidate);
    return {
      entity: newOrg,
      confidence: { score: 1.0, factors: ['new_entity'] },
      isNew: true,
    };
  }

  /**
   * Find or create a Person, deduplicating against existing entries.
   * Tries Graphiti API first, falls back to local matching.
   */
  async resolvePerson(
    candidate: Omit<Person, 'id'>
  ): Promise<EntityMatch<Person>> {
    // Try Graphiti first for ML-based resolution
    const graphitiResult = await this.callGraphiti<GraphitiEntityResult>(
      '/resolve/person',
      {
        name: candidate.name,
        location: candidate.location,
        interests: candidate.interests || [],
        source: 'manual',
      }
    );

    if (graphitiResult && graphitiResult.id !== 'unknown') {
      // Use Graphiti's resolved entity
      const person: Person = {
        id: graphitiResult.id,
        name: graphitiResult.name,
        location: (graphitiResult.properties.location as string) || candidate.location,
        interests: (graphitiResult.properties.interests as string[]) || candidate.interests,
        affiliations: candidate.affiliations || [],
      };
      return {
        entity: person,
        confidence: { score: graphitiResult.confidence, factors: ['graphiti_resolution'] },
        isNew: graphitiResult.is_new,
      };
    }

    // Fallback to local matching
    const existing = await this.findSimilarPersons(candidate.name);

    if (existing.length > 0 && existing[0].confidence.score >= 0.9) {
      return {
        entity: existing[0].entity,
        confidence: existing[0].confidence,
        isNew: false,
      };
    }

    // No confident match found - create new entity
    const newPerson = await this.createPerson(candidate);
    return {
      entity: newPerson,
      confidence: { score: 1.0, factors: ['new_entity'] },
      isNew: true,
    };
  }

  /**
   * Find funders similar to the given name.
   */
  private async findSimilarFunders(
    name: string
  ): Promise<Array<{ entity: Funder; confidence: MatchConfidence }>> {
    const normalizedName = this.normalizeName(name);

    const cypher = `
      MATCH (f:Funder)
      WHERE toLower(f.name) CONTAINS toLower($searchTerm)
      RETURN f
      LIMIT 10
    `;

    const results = await this.connection.query<{ f: Funder }>(cypher, {
      searchTerm: normalizedName,
    });

    return results.map((r) => ({
      entity: r.f,
      confidence: this.calculateNameSimilarity(name, r.f.name),
    }));
  }

  /**
   * Find organizations similar to the given name.
   */
  private async findSimilarOrgs(
    name: string
  ): Promise<Array<{ entity: Org; confidence: MatchConfidence }>> {
    const normalizedName = this.normalizeName(name);

    const cypher = `
      MATCH (o:Org)
      WHERE toLower(o.name) CONTAINS toLower($searchTerm)
      RETURN o
      LIMIT 10
    `;

    const results = await this.connection.query<{ o: Org }>(cypher, {
      searchTerm: normalizedName,
    });

    return results.map((r) => ({
      entity: r.o,
      confidence: this.calculateNameSimilarity(name, r.o.name),
    }));
  }

  /**
   * Find organization by EIN (exact match).
   */
  private async findOrgByEin(ein: string): Promise<Org | null> {
    const cypher = `
      MATCH (o:Org {ein: $ein})
      RETURN o
    `;

    const results = await this.connection.query<{ o: Org }>(cypher, { ein });
    return results.length > 0 ? results[0].o : null;
  }

  /**
   * Create a new Funder in the graph.
   */
  private async createFunder(data: Omit<Funder, 'id'>): Promise<Funder> {
    const id = crypto.randomUUID();
    const funder: Funder = { ...data, id };

    const cypher = `
      CREATE (f:Funder $properties)
      RETURN f
    `;

    await this.connection.mutate(cypher, {
      properties: {
        ...funder,
        focusAreas: JSON.stringify(funder.focusAreas),
        geoFocus: JSON.stringify(funder.geoFocus),
        source: JSON.stringify(funder.source),
      },
    });

    return funder;
  }

  /**
   * Create a new Organization in the graph.
   */
  private async createOrg(data: Omit<Org, 'id'>): Promise<Org> {
    const id = crypto.randomUUID();
    const org: Org = { ...data, id };

    const cypher = `
      CREATE (o:Org $properties)
      RETURN o
    `;

    await this.connection.mutate(cypher, {
      properties: {
        ...org,
        focusAreas: JSON.stringify(org.focusAreas),
        geoFocus: JSON.stringify(org.geoFocus),
      },
    });

    return org;
  }

  /**
   * Find persons similar to the given name.
   */
  private async findSimilarPersons(
    name: string
  ): Promise<Array<{ entity: Person; confidence: MatchConfidence }>> {
    const normalizedName = this.normalizeName(name);

    const cypher = `
      MATCH (p:Person)
      WHERE toLower(p.name) CONTAINS toLower($searchTerm)
      RETURN p
      LIMIT 10
    `;

    const results = await this.connection.query<{ p: Person }>(cypher, {
      searchTerm: normalizedName,
    });

    return results.map((r) => ({
      entity: r.p,
      confidence: this.calculateNameSimilarity(name, r.p.name),
    }));
  }

  /**
   * Create a new Person in the graph.
   */
  private async createPerson(data: Omit<Person, 'id'>): Promise<Person> {
    const id = crypto.randomUUID();
    const person: Person = { ...data, id };

    const cypher = `
      CREATE (p:Person $properties)
      RETURN p
    `;

    await this.connection.mutate(cypher, {
      properties: {
        ...person,
        interests: JSON.stringify(person.interests),
        affiliations: JSON.stringify(person.affiliations),
      },
    });

    return person;
  }

  /**
   * Normalize a name for comparison.
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate similarity between two names.
   */
  private calculateNameSimilarity(name1: string, name2: string): MatchConfidence {
    const norm1 = this.normalizeName(name1);
    const norm2 = this.normalizeName(name2);

    const factors: string[] = [];

    // Exact match
    if (norm1 === norm2) {
      return { score: 1.0, factors: ['exact_match'] };
    }

    // Contains check
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      factors.push('substring_match');
    }

    // Word overlap
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccard = intersection.size / union.size;

    if (jaccard > 0.5) {
      factors.push('high_word_overlap');
    }

    // Levenshtein distance (simplified)
    const maxLen = Math.max(norm1.length, norm2.length);
    const distance = this.levenshteinDistance(norm1, norm2);
    const similarity = 1 - distance / maxLen;

    factors.push(`levenshtein_${Math.round(similarity * 100)}`);

    return {
      score: Math.max(jaccard, similarity),
      factors,
    };
  }

  /**
   * Calculate Levenshtein distance between two strings.
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }
}

/**
 * Create an Entity Resolution Engine from environment configuration.
 */
export function createEntityResolutionEngine(
  connection: GraphConnection
): EntityResolutionEngine {
  return new EntityResolutionEngine(
    connection,
    process.env.GRAPHITI_ENDPOINT || '',
    process.env.GRAPHITI_API_KEY || ''
  );
}
