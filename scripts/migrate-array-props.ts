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
