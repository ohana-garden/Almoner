import { FalkorDB } from 'falkordb';

interface KnowledgeGraphConfig {
  url: string;
  graphName: string;
}

export class KalaKnowledgeEngine {
  private client: any; 
  private graphName: string;
  private url: string;

  constructor(config: KnowledgeGraphConfig) {
    this.url = config.url;
    this.graphName = config.graphName;
  }

  async connect() {
    if (!this.client) {
      try {
        // FalkorDB 3.x+ uses a static connect method that accepts an options object
        this.client = await FalkorDB.connect({ 
            url: this.url 
        });
        console.log(`[Kala] Connected to FalkorDB: ${this.graphName}`);
      } catch (error) {
        console.error('[Kala] Connection failed:', error);
      }
    }
  }

  // Ingest unstructured text into the graph
  async ingestKnowledge(entity: string, relation: string, target: string, metadata: any = {}) {
    await this.connect();
    if (!this.client) return { error: 'Database not connected' };

    const query = `
      MERGE (e:Entity {name: $entity})
      MERGE (t:Entity {name: $target})
      MERGE (e)-[r:${relation}]->(t)
      SET r += $metadata, e.lastUpdated = timestamp()
    `;
    
    const graph = this.client.selectGraph(this.graphName);
    await graph.query(query, { params: { entity, target, metadata } });
    
    return { status: 'ingested', entity, relation, target };
  }

  // Semantic search over the graph
  async findRelatedEntities(entityName: string, depth: number = 2) {
    await this.connect();
    if (!this.client) return [];

    const query = `
      MATCH (source:Entity {name: $entityName})-[r*1..${depth}]-(target:Entity)
      RETURN source, r, target
      LIMIT 20
    `;
    
    const graph = this.client.selectGraph(this.graphName);
    const result = await graph.query(query, { params: { entityName } });
    
    return result;
  }
}