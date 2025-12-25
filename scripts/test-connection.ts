import { GraphConnection } from '../src/modules/graph-core/connection';
import { NodeCrud } from '../src/modules/graph-core/crud';

async function main() {
  console.log("🧪 STARTING INTEGRATION TEST...");

  const conn = new GraphConnection();
  
  try {
    await conn.connect();
    
    const crud = new NodeCrud(conn);
    const testId = `TestNode_${Date.now()}`;
    const properties = {
      id: testId,
      name: "Integration Test Node",
      tags: ["array_fix", "verified", "falkordb"],
      metadata: { "status": "active" } 
    };

    console.log(`📝 Creating node: ${testId}...`);
    await crud.createNode("TestLabel", properties);

    console.log("📖 Reading node back...");
    const node = await crud.getNode(testId);

    // FIX: Explicit Null Check required for TypeScript
    if (!node) {
      console.error("❌ FAILURE: Node not found (returned null).");
      process.exit(1);
    }

    console.log("---------------------------------------------------");
    console.log("RESULTS:");
    console.log("ID:", node.id);
    console.log("Tags:", node.tags);
    console.log("Type of Tags:", Array.isArray(node.tags) ? "✅ Array" : "❌ Not Array");
    console.log("---------------------------------------------------");

    if (Array.isArray(node.tags) && node.tags.includes("verified")) {
      console.log("🎉 SUCCESS: Arrays are storing correctly!");
    } else {
      console.error("❌ FAILURE: Data mismatch.");
      process.exit(1);
    }

  } catch (err) {
    console.error("❌ CRITICAL ERROR:", err);
    process.exit(1);
  } finally {
    await conn.close();
  }
}

main();
