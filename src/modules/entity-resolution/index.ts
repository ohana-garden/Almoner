import { NodeCrud } from '../graph-core/crud';

interface ResolutionRequest {
  entityType: string;
  properties: Record<string, any>;
}

export class EntityResolutionEngine {
  constructor(private nodeCrud: NodeCrud) {}

  async resolveEntity(req: ResolutionRequest): Promise<string> {
    const { entityType, properties } = req;
    
    // 1. Stable ID
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

    // 2. Composite ID (Agency + Title)
    if (properties.title && properties.agencyName) {
       const safeTitle = properties.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       const safeAgency = properties.agencyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       const compositeId = `${safeAgency}_${safeTitle}`;
       
       const existing = await this.nodeCrud.getNode(compositeId);
       if (existing) {
         await this.nodeCrud.updateNode(compositeId, properties);
         return compositeId;
       }
       const finalProps = { ...properties, id: compositeId };
       return await this.nodeCrud.createNode(entityType, finalProps);
    }

    // 3. Fallback
    const newId = `${entityType}_${Date.now()}`;
    await this.nodeCrud.createNode(entityType, { ...properties, id: newId });
    return newId;
  }
}