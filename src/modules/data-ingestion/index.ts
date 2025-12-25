/**
 * Data Ingestion Module - REFACTORED
 * Purpose: Pull from grant sources, 990s, etc., feed to Entity Resolution
 * * Major Change: IngestionJob state is now persisted to FalkorDB.
 * This ensures job history survives service restarts.
 * * First Principle: Graph is source of truth.
 */

import type { GraphConnection } from '../graph-core';
import type { EntityResolutionEngine } from '../entity-resolution';
import type { Funder, Grant } from '../../types/nodes';
import { parse990ExtractCsv, download990Extract } from './irs990-parser';
import { GrantsGovClient } from './grants-gov-client';

export { parse990ExtractCsv, download990Extract, getAvailable990Years } from './irs990-parser';
export { GrantsGovClient, ELIGIBILITY_CODES, FUNDING_CATEGORIES } from './grants-gov-client';
export { IngestionScheduler, createScheduler, loadSchedulerConfig } from './scheduler';
export type { ScheduleConfig } from './scheduler';

export type IngestionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type DataSourceType = 'irs_990' | 'grants_gov' | 'foundation_website' | 'manual';

export interface IngestionJob {
  id: string;
  source: DataSourceType;
  status: IngestionStatus;
  startedAt: Date;
  completedAt?: Date;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
}

export interface Raw990Record {
  ein: string;
  name: string;
  city: string;
  state: string;
  nteeCode: string;
  totalAssets: number;
  totalRevenue: number;
  totalGiving?: number;
  fiscalYearEnd: string;
}

export interface RawGrantRecord {
  opportunityId: string;
  opportunityTitle: string;
  agencyName: string;
  awardCeiling: number;
  awardFloor: number;
  closeDate: string;
  eligibleApplicants: string[];
  categoryOfFunding: string;
  applicationUrl: string;
}

export class DataIngestionEngine {
  private connection: GraphConnection;
  private entityResolution: EntityResolutionEngine;

  constructor(connection: GraphConnection, entityResolution: EntityResolutionEngine) {
    this.connection = connection;
    this.entityResolution = entityResolution;
  }

  async ingest990Data(filePath: string): Promise<IngestionJob> {
    const job = await this.createJob('irs_990');
    // Process asynchronously but safely
    this.process990File(job, filePath).catch((error) => {
      this.failJob(job.id, error.message);
    });
    return job;
  }

  async ingest990Year(year: number, tempDir = '/tmp/almoner'): Promise<IngestionJob> {
    const job = await this.createJob('irs_990');
    
    (async () => {
      try {
        await this.updateJobStatus(job.id, 'running');
        console.log(\`Downloading 990 data for year \${year}...\`);
        const filePath = await download990Extract(year, tempDir);
        console.log(\`Downloaded to \${filePath}, starting ingestion...\`);
        await this.process990FileStreaming(job, filePath);
      } catch (error) {
        await this.failJob(job.id, error instanceof Error ? error.message : String(error));
      }
    })();

    return job;
  }

  async ingestGrantsGov(options: {
    keyword?: string;
    agency?: string;
    eligibility?: string;
  }): Promise<IngestionJob> {
    const job = await this.createJob('grants_gov');

    this.processGrantsGov(job, options).catch((error) => {
      this.failJob(job.id, error.message);
    });

    return job;
  }

  async getJobStatus(jobId: string): Promise<IngestionJob | undefined> {
    const cypher = \`
      MATCH (j:IngestionJob {id: \$jobId})
      RETURN j
    \`;
    const results = await this.connection.query<{ j: any }>(cypher, { jobId });
    if (results.length === 0) return undefined;
    return this.deserializeJob(results[0].j);
  }

  async listJobs(): Promise<IngestionJob[]> {
    const cypher = \`
      MATCH (j:IngestionJob)
      RETURN j
      ORDER BY j.startedAt DESC
      LIMIT 50
    \`;
    const results = await this.connection.query<{ j: any }>(cypher);
    return results.map(r => this.deserializeJob(r.j));
  }

  // --- Internal Processing ---

  private async process990File(job: IngestionJob, filePath: string): Promise<void> {
    await this.updateJobStatus(job.id, 'running');
    const records = await this.read990File(filePath);
    
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        await this.processOne990Record(record);
        processed++;
      } catch (error) {
        failed++;
        const msg = \`EIN \${record.ein}: \${error instanceof Error ? error.message : String(error)}\`;
        errors.push(msg);
        if (errors.length > 50) errors.pop(); // Keep error log bounded
      }
    }

    await this.completeJob(job.id, processed, failed, errors);
  }

  private async process990FileStreaming(job: IngestionJob, filePath: string): Promise<void> {
    // Note: status is already set to running by caller
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    const result = await parse990ExtractCsv(
      filePath,
      async (record) => {
        try {
          await this.processOne990Record(record);
          processed++;
        } catch (error) {
          failed++;
          const msg = \`EIN \${record.ein}: \${error instanceof Error ? error.message : String(error)}\`;
          if (errors.length < 50) errors.push(msg); 
        }
      },
      {
        onProgress: (count) => {
          if (count % 500 === 0) {
             // Periodically update progress in DB (optional but good for long jobs)
             // For now we just log to console to avoid DB spam
             console.log(\`Job \${job.id}: Processed \${count} records...\`);
          }
        },
      }
    );

    await this.completeJob(job.id, processed, failed, errors);
  }

  private async processGrantsGov(
    job: IngestionJob,
    options: { keyword?: string; agency?: string; eligibility?: string }
  ): Promise<void> {
    await this.updateJobStatus(job.id, 'running');
    
    const grants = await this.fetchGrantsGov(options);
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const grant of grants) {
      try {
        await this.processOneGrantRecord(grant);
        processed++;
      } catch (error) {
        failed++;
        const msg = \`Grant \${grant.opportunityId}: \${error instanceof Error ? error.message : String(error)}\`;
        if (errors.length < 50) errors.push(msg);
      }
    }

    await this.completeJob(job.id, processed, failed, errors);
  }

  // --- Entity Processing Logic (Same as before) ---

  private async processOne990Record(record: Raw990Record): Promise<void> {
    const isFunder = record.totalGiving && record.totalGiving > 0;
    await this.entityResolution.resolveOrg({
      name: record.name,
      ein: record.ein,
      mission: '',
      focusAreas: this.nteeToFocusAreas(record.nteeCode),
      geoFocus: [record.state],
      verified: true,
    });

    if (isFunder) {
      await this.entityResolution.resolveFunder({
        name: record.name,
        type: this.nteeToFunderType(record.nteeCode),
        focusAreas: this.nteeToFocusAreas(record.nteeCode),
        geoFocus: [record.state],
        totalGiving: record.totalGiving!,
        source: ['irs_990'],
      });
    }
  }

  private async processOneGrantRecord(record: RawGrantRecord): Promise<void> {
    if (!record.opportunityId || record.opportunityId === 'unknown') throw new Error('Missing opportunity ID');
    if (!record.opportunityTitle || record.opportunityTitle === 'Untitled') throw new Error('Missing opportunity title');

    const agencyName = record.agencyName || 'Unknown Agency';
    const funderResult = await this.entityResolution.resolveFunder({
      name: agencyName,
      type: 'government',
      focusAreas: [record.categoryOfFunding || 'Other'],
      geoFocus: ['US'],
      totalGiving: 0,
      source: ['grants_gov'],
    });

    let deadline: Date | null = null;
    if (record.closeDate && record.closeDate.trim()) {
      const parsed = new Date(record.closeDate);
      if (!isNaN(parsed.getTime())) deadline = parsed;
    }

    const grantId = crypto.randomUUID();
    const now = new Date();

    const properties: Record<string, string | number> = {
      id: grantId,
      title: record.opportunityTitle,
      opportunityId: record.opportunityId,
      amountMin: record.awardFloor || 0,
      amountMax: record.awardCeiling || 0,
      eligibility: JSON.stringify(record.eligibleApplicants || []),
      focusAreas: JSON.stringify([record.categoryOfFunding || 'Other']),
      applicationUrl: record.applicationUrl || '',
      lastUpdated: now.toISOString(),
    };

    if (deadline) properties.deadline = deadline.toISOString();

    await this.connection.mutate(\`CREATE (g:Grant \$properties) RETURN g\`, { properties });

    await this.connection.mutate(
      \`MATCH (f:Funder {id: \$funderId}) MATCH (g:Grant {id: \$grantId}) CREATE (f)-[:OFFERS {id: \$edgeId, createdAt: \$createdAt}]->(g)\`,
      {
        funderId: funderResult.entity.id,
        grantId,
        edgeId: crypto.randomUUID(),
        createdAt: now.toISOString(),
      }
    );
  }

  // --- DB Persistence Helpers ---

  private async createJob(source: DataSourceType): Promise<IngestionJob> {
    const job: IngestionJob = {
      id: crypto.randomUUID(),
      source,
      status: 'pending',
      startedAt: new Date(),
      recordsProcessed: 0,
      recordsFailed: 0,
      errors: [],
    };

    // Persist to DB
    await this.connection.mutate(
      \`CREATE (:IngestionJob {
        id: \$id,
        source: \$source,
        status: \$status,
        startedAt: \$startedAt,
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: '[]'
      })\`,
      {
        id: job.id,
        source: job.source,
        status: job.status,
        startedAt: job.startedAt.toISOString()
      }
    );

    return job;
  }

  private async updateJobStatus(id: string, status: IngestionStatus): Promise<void> {
    await this.connection.mutate(
      \`MATCH (j:IngestionJob {id: \$id}) SET j.status = \$status\`,
      { id, status }
    );
  }

  private async failJob(id: string, errorMessage: string): Promise<void> {
    const errors = JSON.stringify([errorMessage]);
    await this.connection.mutate(
      \`MATCH (j:IngestionJob {id: \$id}) 
       SET j.status = 'failed', j.completedAt = \$now, j.errors = \$errors\`,
      { id, now: new Date().toISOString(), errors }
    );
  }

  private async completeJob(id: string, processed: number, failed: number, errors: string[]): Promise<void> {
    await this.connection.mutate(
      \`MATCH (j:IngestionJob {id: \$id}) 
       SET j.status = 'completed', 
           j.completedAt = \$now,
           j.recordsProcessed = \$processed,
           j.recordsFailed = \$failed,
           j.errors = \$errors\`,
      { 
        id, 
        now: new Date().toISOString(),
        processed,
        failed,
        errors: JSON.stringify(errors) 
      }
    );
  }

  private deserializeJob(nodeProps: any): IngestionJob {
    return {
      id: nodeProps.id,
      source: nodeProps.source as DataSourceType,
      status: nodeProps.status as IngestionStatus,
      startedAt: new Date(nodeProps.startedAt),
      completedAt: nodeProps.completedAt ? new Date(nodeProps.completedAt) : undefined,
      recordsProcessed: nodeProps.recordsProcessed || 0,
      recordsFailed: nodeProps.recordsFailed || 0,
      errors: typeof nodeProps.errors === 'string' ? JSON.parse(nodeProps.errors) : [],
    };
  }

  // --- Source Helpers ---

  private async read990File(filePath: string): Promise<Raw990Record[]> {
    const records: Raw990Record[] = [];
    await parse990ExtractCsv(
      filePath,
      async (record) => { records.push(record); },
      { onProgress: (count) => { if(count % 5000 === 0) console.log(\`Parsed \${count} 990 records...\`); } }
    );
    return records;
  }

  private async fetchGrantsGov(options: any): Promise<RawGrantRecord[]> {
    const client = new GrantsGovClient(process.env.GRANTS_GOV_API_KEY);
    return client.fetchAll({
      keyword: options.keyword,
      agency: options.agency,
      eligibility: options.eligibility,
      oppStatus: 'posted',
      rows: 100,
    });
  }

  private nteeToFocusAreas(nteeCode: string): string[] {
    const mapping: Record<string, string[]> = {
      A: ['arts', 'culture'], B: ['education'], C: ['environment'],
      D: ['animal welfare'], E: ['health'], F: ['mental health'],
      K: ['food security', 'agriculture'], L: ['housing'],
      S: ['community development'], T: ['philanthropy'],
      Z: ['unknown'],
    };
    const majorCode = nteeCode.charAt(0).toUpperCase();
    return mapping[majorCode] || ['general'];
  }

  private nteeToFunderType(nteeCode: string): Funder['type'] {
    return nteeCode.startsWith('T') ? 'foundation' : 'foundation';
  }
}

export function createDataIngestionEngine(
  connection: GraphConnection,
  entityResolution: EntityResolutionEngine
): DataIngestionEngine {
  return new DataIngestionEngine(connection, entityResolution);
}
