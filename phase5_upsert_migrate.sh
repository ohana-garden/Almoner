#!/bin/bash
set -e

echo "🔄 PHASE 5: UPSERTS & MIGRATION..."

# ---------------------------------------------------------
# 1. Upgrade NodeCrud with Upsert
# ---------------------------------------------------------
echo "📝 Upgrading src/modules/graph-core/crud.ts..."

cat << 'TS_CRUD_UPGRADE' > src/modules/graph-core/crud.ts
import { GraphConnection } from './connection';
import { CodecRegistry } from './property-codecs';

export class NodeCrud {
  constructor(private connection: GraphConnection) {}

  /**
   * SERIALIZATION PIPELINE (From Phase 2)
   */
  private serializeProperties(label: string, props: Record<string, any>): Record<string, any> {
    const codec = CodecRegistry.getCodec(label);
    const flattened = codec.encode(props);
    const serialized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(flattened)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        serialized[key] = value;
      } else if (value instanceof Date) {
        serialized[key] = value.toISOString();
      } else if (typeof value === 'object') {
        serialized[key] = JSON.stringify(value);
      } else {
        serialized[key] = value;
      }
    }
    return serialized;
  }

  /**
   * CREATE (Fail if exists)
   */
  async createNode(label: string, properties: Record<string, any>): Promise<string> {
    const query = \`CREATE (n:\${label}) SET n = \$props RETURN n.id as id\`;
    const params = { props: this.serializeProperties(label, properties) };
    const result = await this.connection.execute(query, params);
    return result[0]['id']; 
  }

  /**
   * UPDATE (Fail if missing)
   */
  async updateNode(id: string, properties: Record<string, any>): Promise<void> {
    const params = { 
      id, 
      props: this.serializeProperties('Generic', properties) 
    };
    // += operator updates only provided fields, leaving others alone
    const query = \`MATCH (n) WHERE n.id = \$id SET n += \$props\`;
    await this.connection.execute(query, params);
  }

  /**
   * UPSERT (Create or Update Atomic)
   * This is the safest way to ingest data.
   */
  async upsertNode(label: string, id: string, properties: Record<string, any>): Promise<string> {
    // MERGE matches on the 'id' (assumed unique from Phase 4)
    // ON CREATE SET sets everything
    // ON MATCH SET updates everything provided
    
    const safeProps = this.serializeProperties(label, { ...properties, id });
    
    const query = \`
      MERGE (n:\${label} {id: \$id})
      ON CREATE SET n = \$props
      ON MATCH SET n += \$props
      RETURN n.id as id
    \`;
    
    const params = { id, props: safeProps };
    const result = await this.connection.execute(query, params);
    return result[0]['id'];
  }

  async getNode(id: string): Promise<Record<string, any> | null> {
    const query = \`MATCH (n) WHERE n.id = \$id RETURN n\`;
    const result = await this.connection.execute(query, { id });
    if (result.length === 0) return null;
    
    // Deserialize
    const rawProps = result[0]['n'].properties;
    const deserialized: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawProps)) {
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        try { deserialized[key] = JSON.parse(value); } catch { deserialized[key] = value; }
      } else {
        deserialized[key] = value;
      }
    }
    return CodecRegistry.getCodec('Generic').decode(deserialized);
  }
}
TS_CRUD_UPGRADE

# ---------------------------------------------------------
# 2. Create Migration Script (Fix Old Arrays)
# ---------------------------------------------------------
echo "📝 Creating scripts/migrate-array-props.ts..."

cat << 'TS_MIGRATE' > scripts/migrate-array-props.ts
import { GraphConnection } from '../src/modules/graph-core/connection';

/**
 * MIGRATION: Fix Stringified Arrays
 * Scans for properties that look like "['a','b']" and converts them to real arrays.
 */
async function main() {
  console.log("🧹 STARTING DATA MIGRATION...");
  
  const conn = new GraphConnection();
  await conn.connect();

  try {
    // 1. Get all nodes (Batching omitted for MVP, but recommended for Prod)
    // We explicitly look for strings starting with [
    const query = \`
      MATCH (n)
      RETURN n.id as id, labels(n) as labels, n
    \`;
    
    const nodes = await conn.execute(query);
    console.log(\`🔍 Scanning \${nodes.length} nodes for corruption...\`);

    let fixedCount = 0;

    for (const row of nodes) {
      const props = row['n'].properties;
      const updates: Record<string, any> = {};
      let needsUpdate = false;

      for (const [key, val] of Object.entries(props)) {
        // Check if it's a string that looks like an array
        if (typeof val === 'string' && val.trim().startsWith('[') && val.trim().endsWith(']')) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              updates[key] = parsed; // Convert to real array
              needsUpdate = true;
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
      }

      if (needsUpdate) {
        // Write back
        const updateQuery = \`MATCH (n) WHERE n.id = \$id SET n += \$props\`;
        await conn.execute(updateQuery, { id: row['id'], props: updates });
        fixedCount++;
        process.stdout.write('.');
      }
    }

    console.log(\`\n✅ Migration Complete. Fixed \${fixedCount} nodes.\`);

  } catch (e) {
    console.error("❌ Migration Failed:", e);
  } finally {
    await conn.close();
  }
}

main();
TS_MIGRATE

echo "✅ Phase 5 Complete: Upserts active, Migration script ready."
