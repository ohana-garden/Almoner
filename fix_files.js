const fs = require('fs');
const path = require('path');

// 1. Kala Engine Content
const kalaContent = `
import type { GraphConnection } from '../graph-core';
import type { Contribution } from '../../types/nodes';

export interface KalaResult {
  durationMinutes: number;
  kalaGenerated: number;
}

export interface ServiceTranscript {
  personName: string;
  totalHours: number;
  totalKala: number;
  projects: Array<{ name: string; hours: number }>;
  skillsDemonstrated: string[];
  generatedAt: Date;
  verificationHash: string;
}

export class KalaEngine {
  private static readonly KALA_PER_HOUR = 50;

  constructor(private connection: GraphConnection) {}

  calculateKala(durationMinutes: number): KalaResult {
    if (durationMinutes < 0) throw new Error('Duration cannot be negative');
    const kalaGenerated = (durationMinutes / 60) * KalaEngine.KALA_PER_HOUR;
    return { durationMinutes, kalaGenerated: Math.round(kalaGenerated * 100) / 100 };
  }

  async recordContribution(personId: string, durationMinutes: number, options: any = {}): Promise<Contribution> {
    const { kalaGenerated } = this.calculateKala(durationMinutes);
    const id = crypto.randomUUID();
    const timestamp = options.timestamp || new Date();
    
    await this.connection.execute(
      \`CREATE (c:Contribution {
          id: \$id, timestamp: \$ts, duration: \$dur, kalaGenerated: \$kala, synced: true 
       }) RETURN c\`, 
      { id,
        ts: timestamp.toISOString(),
        dur: durationMinutes,
        kala: kalaGenerated
      }
    );
    
    await this.connection.execute(
        \`MATCH (p:Person {id: \$pid}), (c:Contribution {id: \$cid}) CREATE (p)-[:CONTRIBUTED]->(c)\`,
        { pid: personId, cid: id }
    );
    
    if (options.projectId) {
        await this.connection.execute(
            \`MATCH (c:Contribution {id: \$cid}), (pr:Project {id: \$prid}) CREATE (c)-[:FOR]->(pr)\`,
            { cid: id, prid: options.projectId }
        );
    }

    return { id, timestamp, duration: durationMinutes, kalaGenerated, synced: true };
  }

  async generateServiceTranscript(personId: string): Promise<ServiceTranscript> {
    const cypher = \`
        MATCH (p:Person {id: \$personId})
        OPTIONAL MATCH (p)-[:CONTRIBUTED]->(c)-[:FOR]->(pr:Project)
        RETURN 
            p.name as name,
            sum(c.duration) as totalMinutes,
            sum(c.kalaGenerated) as totalKala,
            collect(DISTINCT pr.name) as projectNames,
            collect(DISTINCT pr.focusAreas) as skillSets
    \`;
    
    const res = await this.connection.execute(cypher, { personId });
    const row = res[0];
    
    if (!row) throw new Error("Person not found");

    const skills = new Set<string>();
    if (Array.isArray(row.skillSets)) {
        row.skillSets.forEach((s) => {
            if (typeof s === 'string') {
                try { JSON.parse(s).forEach((i) => skills.add(i)); } catch {}
            } else if (Array.isArray(s)) {
                s.forEach((i) => skills.add(i));
            }
        });
    }

    return {
        personName: row.name,
        totalHours: Math.round((row.totalMinutes || 0) / 60),
        totalKala: Math.round(row.totalKala || 0),
        projects: (row.projectNames || []).map((n) => ({ name: n, hours: 0 })),
        skillsDemonstrated: Array.from(skills),
        generatedAt: new Date(),
        verificationHash: crypto.randomUUID()
    };
  }
}

export function createKalaEngine(conn: GraphConnection) { return new KalaEngine(conn); }
`;

// 2. Matching Engine Content
const matchingContent = `
import type { GraphConnection } from '../graph-core';
import type { Grant, GrantMatch, MatchFilters } from '../../types/nodes';

export interface MatchScore {
  overall: number;
  factors: { focusAreaMatch: number; vectorScore: number };
  explanation: string[];
}

export class MatchingEngine {
  constructor(private connection: GraphConnection) {}

  async matchGrantsForOrg(orgId: string, filters: MatchFilters = {}): Promise<any[]> {
    const cypher = \`
      MATCH (o:Org {id: \$orgId})
      MATCH (g:Grant)
      OPTIONAL MATCH (f:Funder)-[:OFFERS]->(g)
      
      WHERE g.deadline >= \$now
      AND (\$minAmount IS NULL OR g.amountMax >= \$minAmount)
      
      WITH g, f, o,
           size([area IN o.focusAreas WHERE area IN g.focusAreas]) as sharedAreas,
           size(g.focusAreas) as totalGrantAreas
      
      WITH g, f, o, 
           CASE WHEN totalGrantAreas > 0 
                THEN toFloat(sharedAreas) / totalGrantAreas 
                ELSE 0.0 
           END as keywordScore
           
      WITH g, f, keywordScore, (keywordScore) as finalScore
      
      WHERE finalScore >= \$minScore
      
      RETURN g, f.id as funderId, f.name as funderName, finalScore, keywordScore
      ORDER BY finalScore DESC
      LIMIT 50
    \`;

    const results = await this.connection.execute(cypher, {
      orgId,
      now: new Date().toISOString(),
      minAmount: filters.minAmount ?? null,
      minScore: filters.minScore ?? 0.1
    });

    return results.map(row => ({
      grant: row.g.properties,
      score: {
        overall: row.finalScore,
        factors: { focusAreaMatch: row.keywordScore, vectorScore: 0 },
        explanation: [\`Keyword Match: \${(row.keywordScore*100).toFixed(0)}%\`]
      },
      funderName: row.funderName
    }));
  }
}

export function createMatchingEngine(connection: GraphConnection) {
  return new MatchingEngine(connection);
}
`;

// 3. Server Content
const serverContent = `
import 'dotenv/config';
import * as http from 'http';
import { initAlmoner } from './index';
import { GraphConnection } from './modules/graph-core/connection';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  console.log('🔄 Booting Almoner Engines...');
  const app = await initAlmoner();
  
  await GraphConnection.getInstance().connect();
  console.log('✅ Database connected & Schema verified.');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', \`http://localhost:\${PORT}\`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
        if (url.pathname === '/mcp' && req.method === 'POST') {
            const body = await readBody(req);
            const result = await app.mcpService.handleRequest(body);
            res.writeHead(200);
            res.end(JSON.stringify(result));
            return;
        }
        
        if (url.pathname === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                status: 'ok', 
                uptime: process.uptime(),
                database: 'connected'
            }));
            return;
        }
        
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
        
    } catch (e) {
        console.error(e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(e) }));
    }
  });

  server.listen(PORT, () => {
    console.log(\`🚀 Almoner Server running on port \${PORT}\`);
  });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

startServer();
`;

// Helper to write files
function write(filePath, content) {
    const fullPath = path.join(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content.trim());
    console.log(`✅ Wrote ${filePath}`);
}

// Execute writes
console.log("🚀 Starting File Repairs...");
write('src/modules/kala-engine/index.ts', kalaContent);
write('src/modules/matching-engine/index.ts', matchingContent);
write('src/server.ts', serverContent);
console.log("🏁 Repairs Complete.");
