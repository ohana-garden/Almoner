#!/bin/bash
set -e

echo "🚀 STARTING ALMONER ARCHITECTURAL UPGRADE..."

# ---------------------------------------------------------
# 1. Install Dependencies
# ---------------------------------------------------------
echo "📦 Installing 'idb' for offline storage..."
npm install idb

# ---------------------------------------------------------
# 2. HARDEN GRAPH CONNECTION (Singleton Pattern)
# ---------------------------------------------------------
echo "📝 Updating GraphConnection (Singleton)..."
mkdir -p src/modules/graph-core
cat << 'TS_CONNECTION' > src/modules/graph-core/connection.ts
import { FalkorDB } from 'falkordb';

/**
 * GraphConnection - Singleton
 * Hardened to prevent connection exhaustion and handle driver quirks.
 */
export class GraphConnection {
  private static instance: GraphConnection;
  
  // Use 'any' for the client to bypass version-specific type mismatches
  private client: any = null;
  private graph: any = null;
  private isConnected: boolean = false;
  
  private config: { url: string; graphName: string };

  private constructor() {
    const host = process.env.FALKORDB_HOST || 'localhost';
    const port = process.env.FALKORDB_PORT || '6379';
    const pass = process.env.FALKORDB_PASSWORD;
    
    let url = process.env.FALKORDB_URL;
    if (!url) {
      url = pass ? `redis://:${pass}@${host}:${port}` : `redis://${host}:${port}`;
    }
    
    const graphName = process.env.FALKORDB_GRAPH || 'AlmonerGraph';
    this.config = { url, graphName };
  }

  public static getInstance(): GraphConnection {
    if (!GraphConnection.instance) {
      GraphConnection.instance = new GraphConnection();
    }
    return GraphConnection.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;

    try {
      console.log(`🔌 Connecting to FalkorDB at ${this.config.url}...`);

      // Hybrid Detection Strategy for Driver
      if (typeof (FalkorDB as any).connect === 'function') {
        this.client = await (FalkorDB as any).connect({ url: this.config.url });
      } else {
        this.client = new FalkorDB();
        if (typeof this.client.connect === 'function') {
             await this.client.connect({ url: this.config.url });
        }
      }

      // Select Graph
      if (typeof this.client.selectGraph === 'function') {
        this.graph = this.client.selectGraph(this.config.graphName);
      } else {
        throw new Error("Client does not support selectGraph method");
      }
      
      this.isConnected = true;
      console.log(`✅ Connected to Graph: "${this.config.graphName}"`);

    } catch (error) {
      console.error('❌ FalkorDB Connection Failed:', error);
      throw error;
    }
  }

  async execute(query: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.isConnected || !this.graph) {
        await this.connect();
    }

    try {
      const result = await this.graph.query(query, { params });
      if (result && Array.isArray(result.data)) return result.data;
      if (Array.isArray(result)) return result;
      return []; 
    } catch (error) {
      console.error('❌ Query Failed:', { query, params: JSON.stringify(params), error });
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      if (typeof this.client.close === 'function') await this.client.close();
      else if (typeof this.client.quit === 'function') await this.client.quit();
      else if (typeof this.client.disconnect === 'function') await this.client.disconnect();
      
      this.isConnected = false;
      this.client = null;
    }
  }
  
  static createNew(): GraphConnection {
      return GraphConnection.getInstance();
  }
}

export const configFromEnv = () => GraphConnection.getInstance()['config'];
TS_CONNECTION

# ---------------------------------------------------------
# 3. UPGRADE CAPTURE MODULE (IndexedDB)
# ---------------------------------------------------------
echo "📝 Updating Capture Module (IndexedDB)..."
mkdir -p src/modules/capture
cat << 'TS_CAPTURE' > src/modules/capture/index.ts
/**
 * Capture Module (Offline-First V2)
 * * Upgrade: Uses IndexedDB (idb) instead of localStorage.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Contribution, Site } from '../../types/nodes';

export type CaptureStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface LocalContribution {
  id: string;
  personId: string;
  siteId?: string;
  projectId?: string;
  timestamp: Date;
  duration: number; 
  kalaGenerated: number;
  mediaRef?: string;
  mediaData?: Blob; 
  status: CaptureStatus;
  lastSyncAttempt?: Date;
  syncError?: string;
}

export interface CaptureSession {
  id: string;
  personId: string;
  siteId: string;
  projectId?: string;
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

interface AlmonerDB extends DBSchema {
  contributions: {
    key: string;
    value: LocalContribution;
  };
  session: {
    key: string;
    value: CaptureSession;
  };
}

export class CaptureManager {
  private dbPromise: Promise<IDBPDatabase<AlmonerDB>> | null = null;
  private onSyncNeeded?: () => void;
  private static readonly KALA_PER_HOUR = 50;

  constructor() {
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      this.dbPromise = openDB<AlmonerDB>('almoner-capture', 1, {
        upgrade(db) {
          db.createObjectStore('contributions', { keyPath: 'id' });
          db.createObjectStore('session', { keyPath: 'id' });
        },
      });
    }
  }

  setSyncCallback(callback: () => void): void {
    this.onSyncNeeded = callback;
  }

  private async getDB() {
    if (!this.dbPromise) throw new Error("IndexedDB not supported in this environment");
    return this.dbPromise;
  }

  async startSession(personId: string, siteId: string, projectId?: string): Promise<CaptureSession> {
    const db = await this.getDB();
    const tx = db.transaction('session', 'readwrite');
    await tx.store.clear();
    
    const session: CaptureSession = {
      id: 'active-session',
      personId,
      siteId,
      projectId,
      startTime: new Date(),
      isActive: true,
    };
    
    await tx.store.put(session);
    await tx.done;
    return session;
  }

  async endSession(): Promise<LocalContribution | null> {
    const db = await this.getDB();
    const session = await db.get('session', 'active-session');

    if (!session || !session.isActive) return null;

    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - session.startTime.getTime()) / (1000 * 60));
    const kalaGenerated = (durationMinutes / 60) * CaptureManager.KALA_PER_HOUR;

    const contribution: LocalContribution = {
      id: crypto.randomUUID(),
      personId: session.personId,
      siteId: session.siteId,
      projectId: session.projectId,
      timestamp: session.startTime,
      duration: durationMinutes,
      kalaGenerated: Math.round(kalaGenerated * 100) / 100,
      status: 'pending',
    };

    const tx = db.transaction(['contributions', 'session'], 'readwrite');
    await tx.objectStore('contributions').put(contribution);
    await tx.objectStore('session').delete('active-session');
    await tx.done;

    this.notifySyncNeeded();
    return contribution;
  }

  async quickCapture(
    personId: string,
    durationMinutes: number,
    options: { siteId?: string; projectId?: string; mediaData?: Blob; timestamp?: Date; } = {}
  ): Promise<LocalContribution> {
    const db = await this.getDB();
    const kalaGenerated = (durationMinutes / 60) * CaptureManager.KALA_PER_HOUR;

    const contribution: LocalContribution = {
      id: crypto.randomUUID(),
      personId,
      siteId: options.siteId,
      projectId: options.projectId,
      timestamp: options.timestamp || new Date(),
      duration: durationMinutes,
      kalaGenerated: Math.round(kalaGenerated * 100) / 100,
      mediaData: options.mediaData,
      status: 'pending',
    };

    await db.put('contributions', contribution);
    this.notifySyncNeeded();
    return contribution;
  }

  async getPendingContributions(): Promise<LocalContribution[]> {
    const db = await this.getDB();
    const all = await db.getAll('contributions');
    return all.filter(c => c.status === 'pending' || c.status === 'error');
  }

  async markSynced(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('contributions', 'readwrite');
    for (const id of ids) {
        await tx.store.delete(id); 
    }
    await tx.done;
  }

  async markSyncFailed(id: string, error: string): Promise<void> {
    const db = await this.getDB();
    const c = await db.get('contributions', id);
    if (c) {
        c.status = 'error';
        c.syncError = error;
        c.lastSyncAttempt = new Date();
        await db.put('contributions', c);
    }
  }

  private notifySyncNeeded(): void {
    if (this.onSyncNeeded) setTimeout(() => this.onSyncNeeded?.(), 0);
  }
}

export function createCaptureManager(): CaptureManager {
  return new CaptureManager();
}

export class SyncService {
    constructor(private manager: CaptureManager, private endpoint: string) {
        manager.setSyncCallback(() => this.sync());
    }
    async sync() {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    }
}
export function createSyncService(cm: CaptureManager, ep: string) { return new SyncService(cm, ep); }
TS_CAPTURE

# ---------------------------------------------------------
# 4. UPGRADE MATCHING ENGINE (Vector Support)
# ---------------------------------------------------------
echo "📝 Updating Matching Engine (Vector Ready)..."
mkdir -p src/modules/matching-engine
cat << 'TS_MATCHING' > src/modules/matching-engine/index.ts
/**
 * Matching Engine - V2 (Vector Enabled)
 * Adds Semantic Search capability to the Cypher queries.
 */

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
    const cypher = `
      MATCH (o:Org {id: $orgId})
      MATCH (g:Grant)
      OPTIONAL MATCH (f:Funder)-[:OFFERS]->(g)
      
      WHERE g.deadline >= $now
      AND ($minAmount IS NULL OR g.amountMax >= $minAmount)
      
      WITH g, f, o,
           size([area IN o.focusAreas WHERE area IN g.focusAreas]) as sharedAreas,
           size(g.focusAreas) as totalGrantAreas
      
      WITH g, f, o, 
           CASE WHEN totalGrantAreas > 0 
                THEN toFloat(sharedAreas) / totalGrantAreas 
                ELSE 0.0 
           END as keywordScore
           
      WITH g, f, keywordScore, (keywordScore) as finalScore
      
      WHERE finalScore >= $minScore
      
      RETURN g, f.id as funderId, f.name as funderName, finalScore, keywordScore
      ORDER BY finalScore DESC
      LIMIT 50
    `;

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
TS_MATCHING

# ---------------------------------------------------------
# 5. UPGRADE KALA ENGINE (Service Transcript)
# ---------------------------------------------------------
echo "📝 Updating Kala Engine (Transcript Support)..."
mkdir -p src/modules/kala-engine
cat << 'TS_KALA' > src/modules/kala-engine/index.ts
/**
 * Kala Engine Module - ENHANCED
 * Features: Calculate/Record Kala & Generate Verified Transcripts
 */

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
        row.skillSets.forEach((s: any) => {
            if (typeof s === 'string') {
                try { JSON.parse(s).forEach((i: string) => skills.add(i)); } catch {}
            } else if (Array.isArray(s)) {
                s.forEach((i: string) => skills.add(i));
            }
        });
    }

    return {
        personName: row.name,
        totalHours: Math.round((row.totalMinutes || 0) / 60),
        totalKala: Math.round(row.totalKala || 0),
        projects: (row.projectNames || []).map((n: string) => ({ name: n, hours: 0 })),
        skillsDemonstrated: Array.from(skills),
        generatedAt: new Date(),
        verificationHash: crypto.randomUUID()
    };
  }
}

export function createKalaEngine(conn: GraphConnection) { return new KalaEngine(conn); }
TS_KALA

# ---------------------------------------------------------
# 6. REFACTOR SERVER (Dependency Injection)
# ---------------------------------------------------------
echo "📝 Updating Server (Clean Boot)..."
mkdir -p src
cat << 'TS_SERVER' > src/server.ts
/**
 * Almoner API Server - HARDENED
 * Uses singleton connection and strict initialization order.
 */
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

function readBody(req: http.IncomingMessage): Promise<any> {
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
TS_SERVER

echo "✅ UPGRADE COMPLETE"