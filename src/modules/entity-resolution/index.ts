import { NodeCrud } from '../graph-core/crud';
import { config } from '../../config';
import axios from 'axios';

interface ResolutionRequest {
  entityType: string;
  properties: Record<string, any>;
}

export class EntityResolutionEngine {
  constructor(private nodeCrud: NodeCrud) {}

  /**
   * Resolves an incoming entity.
   * Note: This class handles local graph checks. 
   * If we need semantic search, we call the Python Graphiti Service.
   */
  async resolveEntity(req: ResolutionRequest): Promise<string> {
    const { entityType, properties } = req;
    
    // 1. STABLE ID CHECK (Fastest)
    if (properties.opportunityId) {
      const stableId = properties.opportunityId;
      const existing = await this.nodeCrud.getNode(stableId);
      if (existing) {
        await this.nodeCrud.updateNode(stableId, properties);
        return stableId;
      }
      const finalProps = { ...properties, id: stableId };
      return await this.nodeCrud.createNode(entityType, finalProps);
    }

    // 2. COMPOSITE ID CHECK (Deterministic)
    if (properties.title && properties.agencyName) {
       const safeTitle = properties.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       const safeAgency = properties.agencyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       const compositeId = \`\${safeAgency}_\${safeTitle}\`;
       
       const existing = await this.nodeCrud.getNode(compositeId);
       if (existing) {
         await this.nodeCrud.updateNode(compositeId, properties);
         return compositeId;
       }
       const finalProps = { ...properties, id: compositeId };
       return await this.nodeCrud.createNode(entityType, finalProps);
    }

    // 3. SEMANTIC CHECK (Optional - Calls Python Service)
    // If we wanted to check "Is this similar to existing grants?", we would call:
    // await this.callGraphitiSearch(properties.description);
    
    // Fallback
    const newId = \`\${entityType}_\${Date.now()}\`;
    await this.nodeCrud.createNode(entityType, { ...properties, id: newId });
    return newId;
  }

  /**
   * Helper to call the Python Graphiti Service securely
   */
  private async callGraphitiSearch(query: string) {
    if (!config.graphiti.url) return [];
    try {
      const response = await axios.get(\`\${config.graphiti.url}/search\`, {
        params: { query },
        headers: {
          'X-API-Key': config.graphiti.apiKey || ''
        }
      });
      return response.data;
    } catch (error) {
      console.error("Graphiti Search Failed:", error);
      return [];
    }
  }
}
