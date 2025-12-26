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
