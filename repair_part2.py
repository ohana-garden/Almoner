import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content.strip())
    print(f"✅ Fixed: {path}")

# ==============================================================================
# 1. CONFIG
# ==============================================================================
write_file("src/config/index.ts", r"""
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  falkorDB: {
    url: process.env.FALKORDB_URL,
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
    password: process.env.FALKORDB_PASSWORD,
    graphName: process.env.FALKORDB_GRAPH || 'AlmonerGraph',
  },
  graphiti: {
    url: process.env.GRAPHITI_URL || 'http://localhost:8000',
    apiKey: process.env.GRAPHITI_API_KEY
  }
};
""")

# ==============================================================================
# 2. SCHEMA MANAGER
# ==============================================================================
write_file("src/modules/graph-core/schema.ts", r"""
import { GraphConnection } from './connection';

const DESIRED_INDEXES = [
  { label: 'Grant', property: 'id' },
  { label: 'Grant', property: 'status' },
  { label: 'Organization', property: 'id' },
  { label: 'Episode', property: 'id' },
  { label: 'Grant', property: 'amountMin' },
  { label: 'Grant', property: 'closeDate' },
];

const DESIRED_FULLTEXT = [
  { label: 'Grant', property: 'title' },
  { label: 'Grant', property: 'description' },
  { label: 'Organization', property: 'name' }
];

const DESIRED_CONSTRAINTS = [
  { label: 'Grant', property: 'id' },
  { label: 'Organization', property: 'id' },
  { label: 'Episode', property: 'id' }
];

export class SchemaManager {
  constructor(private connection: GraphConnection) {}

  async ensureSchema(): Promise<void> {
    await this.ensureIndexes();
    await this.ensureConstraints();
  }

  private async ensureIndexes(): Promise<void> {
    const existing = await this.connection.execute("CALL db.indexes()");
    const exists = (label: string, prop: string) => {
        return existing.some((idx: any) => 
            (idx.label === label || idx.labelName === label) && 
            (idx.properties || []).includes(prop)
        );
    };

    for (const idx of DESIRED_INDEXES) {
      if (!exists(idx.label, idx.property)) {
        try {
            await this.connection.execute(`CREATE INDEX FOR (n:${idx.label}) ON (n.${idx.property})`);
        } catch (e) { console.warn(e); }
      }
    }

    for (const idx of DESIRED_FULLTEXT) {
      try {
        await this.connection.execute(`CALL db.idx.fulltext.createNodeIndex('${idx.label}', '${idx.property}')`);
      } catch (e: any) { }
    }
  }

  private async ensureConstraints(): Promise<void> {
    let existing: any[] = [];
    try { existing = await this.connection.execute("CALL db.constraints()"); } catch (e) {}

    const exists = (label: string, prop: string) => {
        return existing.some((c: any) => 
            (c.label === label || c.labelName === label) && 
            (c.properties || []).includes(prop) &&
            c.type === 'UNIQUE'
        );
    };

    for (const c of DESIRED_CONSTRAINTS) {
      if (!exists(c.label, c.property)) {
        try {
            await this.connection.execute(`CREATE CONSTRAINT FOR (n:${c.label}) REQUIRE n.${c.property} IS UNIQUE`);
        } catch (e: any) {}
      }
    }
  }
}
""")

print("🎉 ALL FILES RESTORED.")
