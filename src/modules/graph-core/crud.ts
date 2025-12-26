import { GraphConnection } from './connection';
import { CodecRegistry } from './property-codecs';

export class NodeCrud {
  constructor(private connection: GraphConnection) {}

  private serializeProperties(label: string, props: Record<string, any>): Record<string, any> {
    const codec = CodecRegistry.getCodec(label);
    const flattened = codec.encode(props);
    const serialized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(flattened)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        // Native Array Support (Fixed)
        serialized[key] = value;
      } else if (value instanceof Date) {
        serialized[key] = value.toISOString();
      } else if (typeof value === 'object') {
        // Maps must be stringified
        serialized[key] = JSON.stringify(value);
      } else {
        serialized[key] = value;
      }
    }
    return serialized;
  }

  async createNode(label: string, properties: Record<string, any>): Promise<string> {
    const query = `CREATE (n:${label}) SET n = $props RETURN n.id as id`;
    const params = { props: this.serializeProperties(label, properties) };
    const result = await this.connection.execute(query, params);
    return result[0]['id']; 
  }

  async updateNode(id: string, properties: Record<string, any>): Promise<void> {
    const params = { 
      id, 
      props: this.serializeProperties('Generic', properties) 
    };
    const query = `MATCH (n) WHERE n.id = $id SET n += $props`;
    await this.connection.execute(query, params);
  }

  async upsertNode(label: string, id: string, properties: Record<string, any>): Promise<string> {
    const safeProps = this.serializeProperties(label, { ...properties, id });
    
    const query = `
      MERGE (n:${label} {id: $id})
      ON CREATE SET n = $props
      ON MATCH SET n += $props
      RETURN n.id as id
    `;
    
    const params = { id, props: safeProps };
    const result = await this.connection.execute(query, params);
    return result[0]['id'];
  }

  async getNode(id: string): Promise<Record<string, any> | null> {
    const query = `MATCH (n) WHERE n.id = $id RETURN n`;
    const result = await this.connection.execute(query, { id });
    if (result.length === 0) return null;
    
    const rawProps = result[0]['n'].properties;
    const deserialized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(rawProps)) {
      // Decode fallback JSON strings
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        try { deserialized[key] = JSON.parse(value); } catch { deserialized[key] = value; }
      } else {
        deserialized[key] = value;
      }
    }
    return CodecRegistry.getCodec('Generic').decode(deserialized);
  }
}