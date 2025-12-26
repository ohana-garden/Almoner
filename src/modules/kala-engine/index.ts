import { Client } from 'falkordb';

interface KnowledgeGraphConfig {
  url: string;
  graphName: string;
}

export class KalaKnowledgeEngine {
  private client: Client;
  private graphName: string;
  private isConnected: boolean = false;

  constructor(config: KnowledgeGraphConfig) {
    this.client = new Client({ url: config.url });
    this.graphName = config.graphName;
  }

  async connect() {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
        console.log(`[Kala] Connected to FalkorDB: ${this.graphName}`);
      } catch (error) {
        console.error('[Kala] Connection failed:', error);
        throw error;
      }
    }
  }

  // Ingest unstructured text into the graph
  async ingestKnowledge(entity: string, relation: string, target: string, metadata: any = {}) {
    await this.connect();
    const query = `
      MERGE (e:Entity {name: $entity})
      MERGE (t:Entity {name: $target})
      MERGE (e)-[r:${relation}]->(t)
      SET r += $metadata, e.lastUpdated = timestamp()
    `;
    
    await this.client.query(query, { 
      params: { entity, target, metadata } 
    });
    
    return { status: 'ingested', entity, relation, target };
  }

  // Semantic search over the graph
  async findRelatedEntities(entityName: string, depth: number = 2) {
    await this.connect();
    const query = `
      MATCH (source:Entity {name: $entityName})-[r*1..${depth}]-(target:Entity)
      RETURN source, r, target
      LIMIT 20
    `;
    
    const result = await this.client.query(query, { 
      params: { entityName } 
    });
    
    return result;
  }
}