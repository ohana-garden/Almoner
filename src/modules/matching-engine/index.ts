import { KalaKnowledgeEngine } from '../kala-engine';

interface Opportunity {
  id: string;
  title: string;
  description: string;
  vectors?: number[];
}

export class MatchingEngine {
  private kala: KalaKnowledgeEngine;

  constructor(kala: KalaKnowledgeEngine) {
    this.kala = kala;
  }

  // Calculate compatibility score between a user profile and an opportunity
  async calculateMatchScore(userProfile: any, opportunity: Opportunity): Promise<number> {
    // 1. Keyword Overlap
    const keywords = userProfile.interests || [];
    const text = (opportunity.title + ' ' + opportunity.description).toLowerCase();
    
    let matchCount = 0;
    for (const word of keywords) {
      if (text.includes(word.toLowerCase())) {
        matchCount++;
      }
    }
    
    // Simple heuristic score (0.0 to 1.0)
    const baseScore = Math.min(matchCount * 0.2, 1.0);
    return baseScore;
  }

  // Find opportunities relevant to a specific non-profit organization
  async findMatchesForOrganization(orgId: string) {
    // In a real system, we'd fetch the org profile first
    // For now, we simulate a graph lookup
    const graphResults = await this.kala.findRelatedEntities(orgId, 1);
    
    return {
      orgId,
      matches: [],
      graphContext: graphResults
    };
  }
}