import { GraphConnection } from '../src/modules/graph-core/connection';
import { SchemaManager } from '../src/modules/graph-core/schema';

async function main() {
  const conn = new GraphConnection();
  try {
    await conn.connect();
    const schema = new SchemaManager(conn);
    await schema.ensureSchema();
    console.log("�� Schema Initialization Successful");
  } catch (e) {
    console.error("❌ Schema Init Failed:", e);
    process.exit(1);
  } finally {
    await conn.close();
  }
}

main();
