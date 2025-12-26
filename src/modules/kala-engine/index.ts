import { FalkorDB } from 'falkordb';

interface KnowledgeGraphConfig {
  url: string;
  graphName: string;
}

export class KalaKnowledgeEngine {
  private client: FalkorDB;
  private graphName: string;
  private isConnected: boolean = false;

  constructor(config: KnowledgeGraphConfig) {
    this.client = new FalkorDB(config.url);
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
        // We do not throw here to allow the server to start even if DB is temporarily down
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
    
    // Select the graph before querying
    const graph = this.client.selectGraph(this.graphName);
    await graph.query(query, { params: { entity, target, metadata } });
    
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
    
    const graph = this.client.selectGraph(this.graphName);
    const result = await graph.query(query, { params: { entityName } });
    
    return result;
  }
}