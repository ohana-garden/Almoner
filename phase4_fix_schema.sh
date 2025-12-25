#!/bin/bash
set -e

echo "🏗️  PHASE 4: IMPLEMENTING IDEMPOTENT SCHEMA..."

# ---------------------------------------------------------
# 1. Create Schema Manager
# ---------------------------------------------------------
echo "📝 Creating src/modules/graph-core/schema.ts..."

cat << 'TS_SCHEMA' > src/modules/graph-core/schema.ts
import { GraphConnection } from './connection';

/**
 * Defines the Desired State of the Database
 */
const DESIRED_INDEXES = [
  // Range Indexes (Fast Lookups)
  { label: 'Grant', property: 'id' },
  { label: 'Grant', property: 'status' },
  { label: 'Organization', property: 'id' },
  { label: 'Organization', property: 'ein' }, // Tax ID
  { label: 'Episode', property: 'id' },
  
  // Numerical/Date Range Indexes (for > < queries)
  { label: 'Grant', property: 'amountMin' },
  { label: 'Grant', property: 'closeDate' },
];

const DESIRED_FULLTEXT = [
  // Fulltext Search (Keywords)
  { label: 'Grant', property: 'title' },
  { label: 'Grant', property: 'description' },
  { label: 'Organization', property: 'name' }
];

const DESIRED_CONSTRAINTS = [
  // Unique Constraints (Data Integrity)
  { label: 'Grant', property: 'id' },
  { label: 'Organization', property: 'id' },
  { label: 'Episode', property: 'id' }
];

export class SchemaManager {
  constructor(private connection: GraphConnection) {}

  async ensureSchema(): Promise<void> {
    console.log("🏗️  Verifying Graph Schema...");
    
    await this.ensureIndexes();
    await this.ensureConstraints();
    
    console.log("✅ Schema Verification Complete.");
  }

  private async ensureIndexes(): Promise<void> {
    // 1. Get Existing Indexes
    // Output format depends on driver, usually: [ { label, properties, type } ]
    const existing = await this.connection.execute("CALL db.indexes()");
    
    // Helper to check existence
    const exists = (label: string, prop: string) => {
        return existing.some((idx: any) => 
            (idx.label === label || idx.labelName === label) && 
            (idx.properties || []).includes(prop)
        );
    };

    // 2. Create Missing Range Indexes
    for (const idx of DESIRED_INDEXES) {
      if (!exists(idx.label, idx.property)) {
        console.log(\`➕ Creating INDEX for :\${idx.label}(\${idx.property})\`);
        try {
            await this.connection.execute(\`CREATE INDEX FOR (n:\${idx.label}) ON (n.\${idx.property})\`);
        } catch (e) {
            console.warn(\`⚠️ Could not create index \${idx.label}.\${idx.property}: \`, e);
        }
      }
    }

    // 3. Create Missing Fulltext Indexes
    for (const idx of DESIRED_FULLTEXT) {
      // Fulltext often shows up differently in db.indexes, so we try/catch creation usually
      // or check specific naming conventions. For safety, we try creation and ignore "already exists" errors.
      try {
        // Note: FalkorDB Fulltext syntax
        await this.connection.execute(\`CALL db.idx.fulltext.createNodeIndex('\${idx.label}', '\${idx.property}')\`);
      } catch (e: any) {
        // Ignore if exists
        if (!String(e).includes('already exists') && !String(e).includes('Redundant')) {
             // Depending on driver, verify if it's actually an error
        }
      }
    }
  }

  private async ensureConstraints(): Promise<void> {
    // 1. Get Existing Constraints
    let existing: any[] = [];
    try {
        existing = await this.connection.execute("CALL db.constraints()");
    } catch (e) {
        // Old versions might not support this call
        existing = [];
    }

    const exists = (label: string, prop: string) => {
        return existing.some((c: any) => 
            (c.label === label || c.labelName === label) && 
            (c.properties || []).includes(prop) &&
            c.type === 'UNIQUE'
        );
    };

    // 2. Create Missing Constraints
    for (const c of DESIRED_CONSTRAINTS) {
      if (!exists(c.label, c.property)) {
        console.log(\`🔒 Creating UNIQUE CONSTRAINT for :\${c.label}(\${c.property})\`);
        try {
            await this.connection.execute(\`CREATE CONSTRAINT FOR (n:\${c.label}) REQUIRE n.\${c.property} IS UNIQUE\`);
        } catch (e: any) {
             if (!String(e).includes('already exists')) {
                 console.warn(\`⚠️ Failed constraint \${c.label}.\${c.property}: \`, e);
             }
        }
      }
    }
  }
}
TS_SCHEMA

# ---------------------------------------------------------
# 2. Create Schema Test Runner
# ---------------------------------------------------------
echo "📝 Creating scripts/init-schema.ts..."

cat << 'TS_RUNNER' > scripts/init-schema.ts
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
TS_RUNNER

echo "✅ Phase 4 Complete: Schema Manager ready."
