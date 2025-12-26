import { KalaKnowledgeEngine } from '../modules/kala-engine';
import { MatchingEngine } from '../modules/matching-engine';

export class MCPServer {
  private kala: KalaKnowledgeEngine;
  private matcher: MatchingEngine;

  constructor(kala: KalaKnowledgeEngine, matcher: MatchingEngine) {
    this.kala = kala;
    this.matcher = matcher;
  }

  async handleRequest(body: any) {
    const { tool, params } = body;

    switch (tool) {
      case 'ingest_knowledge':
        return await this.kala.ingestKnowledge(
          params.entity, 
          params.relation, 
          params.target, 
          params.metadata
        );
      
      case 'find_related':
        return await this.kala.findRelatedEntities(params.entityName);
        
      case 'match_opportunity':
        const opp = { 
            id: 'mock-1', 
            title: params.title || 'Untitled', 
            description: params.description || '' 
        };
        const score = await this.matcher.calculateMatchScore(params.userProfile, opp);
        return { matchScore: score, opportunityId: opp.id };

      default:
        return { error: `Tool '${tool}' not found` };
    }
  }
}