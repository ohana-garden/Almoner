#!/bin/bash
set -e

echo "🛠️  Fixing Entity Resolution Engine..."

cat << 'TS_FIX' > src/modules/entity-resolution/index.ts
import { NodeCrud } from '../graph-core/crud';

interface ResolutionRequest {
  entityType: string;
  properties: Record<string, any>;
}

export class EntityResolutionEngine {
  constructor(private nodeCrud: NodeCrud) {}

  /**
   * Resolves an incoming entity against the graph.
   * Priority:
   * 1. Explicit Stable ID (e.g. Grants.gov ID)
   * 2. Derived Composite ID (Agency + Title)
   * 3. Fallback Random ID
   */
  async resolveEntity(req: ResolutionRequest): Promise<string> {
    const { entityType, properties } = req;

    // ---------------------------------------------------------
    // STRATEGY 1: Explicit Stable ID (Best)
    // ---------------------------------------------------------
    if (properties.opportunityId) {
      const stableId = properties.opportunityId;
      
      // Check if it already exists
      const existing = await this.nodeCrud.getNode(stableId);
      
      if (existing) {
        console.log(`🔄 Updating existing ${entityType}: ${stableId}`);
        await this.nodeCrud.updateNode(stableId, properties);
        return stableId;
      } else {
        console.log(`✨ Creating new ${entityType}: ${stableId}`);
        // Ensure ID is explicitly set in the properties map
        const finalProps = { ...properties, id: stableId };
        return await this.nodeCrud.createNode(entityType, finalProps);
      }
    }

    // ---------------------------------------------------------
    // STRATEGY 2: Derived Composite ID (Good)
    // Prevents duplicates when re-scraping sources without IDs
    // ---------------------------------------------------------
    if (properties.title && properties.agencyName) {
       // Create a deterministic slug: "usda_urban_farming_initiative"
       const safeTitle = properties.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       const safeAgency = properties.agencyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       const compositeId = `${safeAgency}_${safeTitle}`;
       
       const existing = await this.nodeCrud.getNode(compositeId);
       
       if (existing) {
         console.log(`🔄 Updating derived entity: ${compositeId}`);
         await this.nodeCrud.updateNode(compositeId, properties);
         return compositeId;
       } else {
         console.log(`✨ Creating derived entity: ${compositeId}`);
         const finalProps = { ...properties, id: compositeId };
         return await this.nodeCrud.createNode(entityType, finalProps);
       }
    }

    // ---------------------------------------------------------
    // STRATEGY 3: Fallback (Weak)
    // ---------------------------------------------------------
    const newId = `${entityType}_${Date.now()}`;
    console.log(`⚠️  No stable ID found. Creating random ID: ${newId}`);
    await this.nodeCrud.createNode(entityType, { ...properties, id: newId });
    return newId;
  }
}
TS_FIX

echo "✅ Entity Resolution logic fixed."
