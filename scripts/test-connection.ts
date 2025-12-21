/**
 * Test script to verify FalkorDB connection
 *
 * Usage: npx ts-node scripts/test-connection.ts
 */

import 'dotenv/config';
import { GraphConnection, configFromEnv } from '../src/modules/graph-core/connection';

async function main() {
  console.log('Testing FalkorDB connection...\n');

  const config = configFromEnv();
  console.log('Config:', {
    url: config.url ? config.url.replace(/\/\/.*@/, '//<redacted>@') : undefined,
    host: config.host,
    port: config.port,
    graphName: config.graphName,
  });

  const connection = GraphConnection.getInstance(config);

  try {
    // Connect
    console.log('\n1. Connecting to FalkorDB...');
    await connection.connect();
    console.log('   ✓ Connected successfully');

    // Create a test node
    console.log('\n2. Creating test node...');
    const createResult = await connection.mutate(`
      CREATE (t:TestNode {
        id: $id,
        message: $message,
        createdAt: $createdAt
      })
      RETURN t
    `, {
      id: 'test-' + Date.now(),
      message: 'Hello from Almoner!',
      createdAt: new Date().toISOString(),
    });
    console.log('   ✓ Node created:', createResult);

    // Query the node back
    console.log('\n3. Querying test nodes...');
    const queryResult = await connection.query<{ t: { id: string; message: string } }>(`
      MATCH (t:TestNode)
      RETURN t
      ORDER BY t.createdAt DESC
      LIMIT 5
    `);
    console.log('   ✓ Found', queryResult.length, 'test node(s)');
    for (const row of queryResult) {
      console.log('     -', row.t);
    }

    // Clean up test nodes
    console.log('\n4. Cleaning up test nodes...');
    const deleteResult = await connection.mutate(`
      MATCH (t:TestNode)
      DELETE t
    `);
    console.log('   ✓ Deleted', deleteResult.nodesDeleted, 'test node(s)');

    console.log('\n✅ All tests passed! FalkorDB connection is working.\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
  }
}

main();
