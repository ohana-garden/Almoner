/**
 * Phase 1: Foundation - Seed Script
 *
 * Creates sample data for testing:
 * - Funders
 * - Grants
 * - Organizations
 * - Persons
 *
 * Usage: npx ts-node scripts/seed-phase1.ts
 */

import 'dotenv/config';
import { GraphConnection, configFromEnv } from '../src/modules/graph-core/connection';

async function seedPhase1() {
  console.log('🌱 Phase 1: Seeding Foundation Data\n');

  const config = configFromEnv();
  console.log('Connecting to:', config.url || `${config.host}:${config.port}`);
  console.log('Graph:', config.graphName);

  const connection = GraphConnection.getInstance(config);

  try {
    await connection.connect();
    console.log('✓ Connected to FalkorDB\n');

    // 1. Create Focus Areas
    console.log('1. Creating Focus Areas...');
    await connection.mutate(`
      CREATE (:FocusArea {id: 'fa-food', name: 'Food Security', description: 'Access to nutritious food'})
    `);
    await connection.mutate(`
      CREATE (:FocusArea {id: 'fa-edu', name: 'Education', description: 'Educational opportunities'})
    `);
    await connection.mutate(`
      CREATE (:FocusArea {id: 'fa-env', name: 'Environment', description: 'Environmental conservation'})
    `);
    await connection.mutate(`
      CREATE (:FocusArea {id: 'fa-community', name: 'Community Development', description: 'Building strong communities'})
    `);
    console.log('   ✓ Created 4 focus areas\n');

    // 2. Create Funders
    console.log('2. Creating Funders...');
    await connection.mutate(`
      CREATE (:Funder {
        id: 'funder-1',
        name: 'Hawaii Community Foundation',
        type: 'foundation',
        focusAreas: '["food security", "education", "environment"]',
        geoFocus: '["Hawaii"]',
        totalGiving: 50000000,
        source: '["manual"]'
      })
    `);
    await connection.mutate(`
      CREATE (:Funder {
        id: 'funder-2',
        name: 'Atherton Family Foundation',
        type: 'foundation',
        focusAreas: '["education", "community development"]',
        geoFocus: '["Hawaii"]',
        totalGiving: 10000000,
        source: '["manual"]'
      })
    `);
    console.log('   ✓ Created 2 funders\n');

    // 3. Create Grants
    console.log('3. Creating Grants...');
    await connection.mutate(`
      CREATE (:Grant {
        id: 'grant-1',
        title: 'Community Food Security Grant',
        amount: '{"min": 5000, "max": 25000}',
        deadline: '${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()}',
        eligibility: '["501c3", "Hawaii-based"]',
        focusAreas: '["food security"]',
        applicationUrl: 'https://example.com/apply',
        lastUpdated: '${new Date().toISOString()}'
      })
    `);
    await connection.mutate(`
      CREATE (:Grant {
        id: 'grant-2',
        title: 'Environmental Education Initiative',
        amount: '{"min": 10000, "max": 50000}',
        deadline: '${new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()}',
        eligibility: '["501c3", "education-focused"]',
        focusAreas: '["education", "environment"]',
        applicationUrl: 'https://example.com/apply2',
        lastUpdated: '${new Date().toISOString()}'
      })
    `);
    console.log('   ✓ Created 2 grants\n');

    // 4. Create Organizations
    console.log('4. Creating Organizations...');
    await connection.mutate(`
      CREATE (:Org {
        id: 'org-1',
        name: 'Ohana Garden',
        ein: '99-1234567',
        mission: 'Community food security through shared gardens in Lower Puna',
        focusAreas: '["food security", "community development"]',
        geoFocus: '["Lower Puna", "Hawaii"]',
        verified: true
      })
    `);
    await connection.mutate(`
      CREATE (:Org {
        id: 'org-2',
        name: 'Puna Learning Center',
        ein: '99-7654321',
        mission: 'Providing educational opportunities for rural Hawaii',
        focusAreas: '["education"]',
        geoFocus: '["Puna", "Hawaii"]',
        verified: true
      })
    `);
    console.log('   ✓ Created 2 organizations\n');

    // 5. Create Persons
    console.log('5. Creating Persons...');
    await connection.mutate(`
      CREATE (:Person {
        id: 'person-1',
        name: 'Keoni Makoa',
        location: 'Pahoa, HI',
        interests: '["gardening", "food security", "community"]',
        affiliations: '["org-1"]'
      })
    `);
    await connection.mutate(`
      CREATE (:Person {
        id: 'person-2',
        name: 'Leilani Kai',
        location: 'Kapoho, HI',
        interests: '["education", "environment"]',
        affiliations: '["org-2"]'
      })
    `);
    await connection.mutate(`
      CREATE (:Person {
        id: 'person-3',
        name: 'Makani Nui',
        location: 'Pahoa, HI',
        interests: '["farming", "sustainability"]',
        affiliations: '["org-1", "org-2"]'
      })
    `);
    console.log('   ✓ Created 3 persons\n');

    // 6. Create Sites
    console.log('6. Creating Sites...');
    await connection.mutate(`
      CREATE (:Site {
        id: 'site-1',
        name: 'Ohana Garden Main Site',
        location: '{"lat": 19.4937, "lng": -154.8531}',
        nfcTagId: 'NFC-001',
        type: 'garden'
      })
    `);
    await connection.mutate(`
      CREATE (:Site {
        id: 'site-2',
        name: 'Pahoa Distribution Center',
        location: '{"lat": 19.4963, "lng": -154.9453}',
        nfcTagId: 'NFC-002',
        type: 'distribution'
      })
    `);
    console.log('   ✓ Created 2 sites\n');

    // 7. Create Projects
    console.log('7. Creating Projects...');
    await connection.mutate(`
      CREATE (:Project {
        id: 'project-1',
        name: 'Community Garden Initiative',
        description: 'Growing food for the community',
        focusAreas: '["food security"]'
      })
    `);
    console.log('   ✓ Created 1 project\n');

    // 7b. Create Opportunities
    console.log('7b. Creating Opportunities...');
    await connection.mutate(`
      CREATE (:Opportunity {
        id: 'opp-1',
        title: 'Garden Volunteer - Weekly',
        description: 'Help maintain community garden beds, plant seedlings, and harvest produce',
        hoursNeeded: '{"min": 2, "max": 4}',
        schedule: 'weekly',
        siteId: 'site-1',
        skills: '["gardening", "physical labor"]',
        focusAreas: '["food security", "community development"]',
        spotsAvailable: 10,
        lastUpdated: '${new Date().toISOString()}'
      })
    `);
    await connection.mutate(`
      CREATE (:Opportunity {
        id: 'opp-2',
        title: 'Food Distribution Helper',
        description: 'Assist with sorting and distributing fresh produce to community members',
        hoursNeeded: '{"min": 3, "max": 5}',
        schedule: 'weekly',
        siteId: 'site-2',
        skills: '["organization", "customer service"]',
        focusAreas: '["food security"]',
        spotsAvailable: 5,
        lastUpdated: '${new Date().toISOString()}'
      })
    `);
    await connection.mutate(`
      CREATE (:Opportunity {
        id: 'opp-3',
        title: 'Environmental Education Workshop',
        description: 'One-time workshop teaching sustainable gardening practices',
        hoursNeeded: '{"min": 4, "max": 6}',
        schedule: 'one-time',
        skills: '["teaching", "environment"]',
        focusAreas: '["education", "environment"]',
        deadline: '${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()}',
        spotsAvailable: 20,
        lastUpdated: '${new Date().toISOString()}'
      })
    `);
    console.log('   ✓ Created 3 opportunities\n');

    // 8. Create Relationships
    console.log('8. Creating Relationships...');

    // Funder OFFERS Grant
    await connection.mutate(`
      MATCH (f:Funder {id: 'funder-1'}), (g:Grant {id: 'grant-1'})
      CREATE (f)-[:OFFERS {id: 'rel-1', createdAt: '${new Date().toISOString()}'}]->(g)
    `);
    await connection.mutate(`
      MATCH (f:Funder {id: 'funder-2'}), (g:Grant {id: 'grant-2'})
      CREATE (f)-[:OFFERS {id: 'rel-2', createdAt: '${new Date().toISOString()}'}]->(g)
    `);

    // Org RUNS Project
    await connection.mutate(`
      MATCH (o:Org {id: 'org-1'}), (p:Project {id: 'project-1'})
      CREATE (o)-[:RUNS {id: 'rel-3', createdAt: '${new Date().toISOString()}'}]->(p)
    `);

    // Project LOCATED_AT Site
    await connection.mutate(`
      MATCH (p:Project {id: 'project-1'}), (s:Site {id: 'site-1'})
      CREATE (p)-[:LOCATED_AT {id: 'rel-4', createdAt: '${new Date().toISOString()}'}]->(s)
    `);

    // Person MEMBER_OF Org
    await connection.mutate(`
      MATCH (p:Person {id: 'person-1'}), (o:Org {id: 'org-1'})
      CREATE (p)-[:MEMBER_OF {id: 'rel-5', role: 'volunteer', createdAt: '${new Date().toISOString()}'}]->(o)
    `);
    await connection.mutate(`
      MATCH (p:Person {id: 'person-2'}), (o:Org {id: 'org-2'})
      CREATE (p)-[:MEMBER_OF {id: 'rel-6', role: 'educator', createdAt: '${new Date().toISOString()}'}]->(o)
    `);

    // Funder FOCUSES_ON FocusArea
    await connection.mutate(`
      MATCH (f:Funder {id: 'funder-1'}), (fa:FocusArea {id: 'fa-food'})
      CREATE (f)-[:FOCUSES_ON {id: 'rel-7', createdAt: '${new Date().toISOString()}'}]->(fa)
    `);

    // Org OFFERS Opportunity
    await connection.mutate(`
      MATCH (o:Org {id: 'org-1'}), (op:Opportunity {id: 'opp-1'})
      CREATE (o)-[:OFFERS {id: 'rel-8', createdAt: '${new Date().toISOString()}'}]->(op)
    `);
    await connection.mutate(`
      MATCH (o:Org {id: 'org-1'}), (op:Opportunity {id: 'opp-2'})
      CREATE (o)-[:OFFERS {id: 'rel-9', createdAt: '${new Date().toISOString()}'}]->(op)
    `);
    await connection.mutate(`
      MATCH (o:Org {id: 'org-2'}), (op:Opportunity {id: 'opp-3'})
      CREATE (o)-[:OFFERS {id: 'rel-10', createdAt: '${new Date().toISOString()}'}]->(op)
    `);

    console.log('   ✓ Created 10 relationships\n');

    // 9. Verify data
    console.log('9. Verifying data...');
    const counts = await connection.query<{ label: string; count: number }>(`
      CALL {
        MATCH (n:Funder) RETURN 'Funder' as label, count(n) as count
        UNION ALL
        MATCH (n:Grant) RETURN 'Grant' as label, count(n) as count
        UNION ALL
        MATCH (n:Opportunity) RETURN 'Opportunity' as label, count(n) as count
        UNION ALL
        MATCH (n:Org) RETURN 'Org' as label, count(n) as count
        UNION ALL
        MATCH (n:Person) RETURN 'Person' as label, count(n) as count
        UNION ALL
        MATCH (n:Site) RETURN 'Site' as label, count(n) as count
        UNION ALL
        MATCH (n:Project) RETURN 'Project' as label, count(n) as count
        UNION ALL
        MATCH (n:FocusArea) RETURN 'FocusArea' as label, count(n) as count
      }
      RETURN label, count
    `);

    console.log('   Node counts:');
    for (const row of counts) {
      console.log(`     ${row.label}: ${row.count}`);
    }

    const relCount = await connection.query<{ count: number }>(`
      MATCH ()-[r]->() RETURN count(r) as count
    `);
    console.log(`   Relationships: ${relCount[0]?.count || 0}\n`);

    console.log('✅ Phase 1 seed complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
  }
}

seedPhase1();
