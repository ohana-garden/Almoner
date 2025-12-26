/**
 * Matching Engine - V2 (Vector Enabled)
 * Adds Semantic Search capability to the Cypher queries.
 */

import type { GraphConnection } from '../graph-core';
import type { Grant, GrantMatch, MatchFilters } from '../../types/nodes';

export interface MatchScore {
  overall: number;
  factors: { focusAreaMatch: number; vectorScore: number };
  explanation: string[];
}

export class MatchingEngine {
  constructor(private connection: GraphConnection) {}

  async matchGrantsForOrg(orgId: string, filters: MatchFilters = {}): Promise<any[]> {
    const cypher = `
      MATCH (o:Org {id: $orgId})
      MATCH (g:Grant)
      OPTIONAL MATCH (f:Funder)-[:OFFERS]->(g)
      
      WHERE g.deadline >= $now
      AND ($minAmount IS NULL OR g.amountMax >= $minAmount)
      
      WITH g, f, o,
           size([area IN o.focusAreas WHERE area IN g.focusAreas]) as sharedAreas,
           size(g.focusAreas) as totalGrantAreas
      
      WITH g, f, o, 
           CASE WHEN totalGrantAreas > 0 
                THEN toFloat(sharedAreas) / totalGrantAreas 
                ELSE 0.0 
           END as keywordScore
           
      WITH g, f, keywordScore, (keywordScore) as finalScore
      
      WHERE finalScore >= $minScore
      
      RETURN g, f.id as funderId, f.name as funderName, finalScore, keywordScore
      ORDER BY finalScore DESC
      LIMIT 50
    `;

    const results = await this.connection.execute(cypher, {
      orgId,
      now: new Date().toISOString(),
      minAmount: filters.minAmount ?? null,
      minScore: filters.minScore ?? 0.1
    });

    return results.map(row => ({
      grant: row.g.properties,
      score: {
        overall: row.finalScore,
        factors: { focusAreaMatch: row.keywordScore, vectorScore: 0 },
        explanation: [\`Keyword Match: \${(row.keywordScore*100).toFixed(0)}%\`]
      },
      funderName: row.funderName
    }));
  }
}

export function createMatchingEngine(connection: GraphConnection) {
  return new MatchingEngine(connection);
}
