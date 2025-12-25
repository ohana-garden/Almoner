#!/bin/bash
set -e

echo "🛠️  Starting Part 5: Validation & Indexing..."

# 1. Install Zod for runtime validation
if ! grep -q "zod" package.json; then
    echo "📦 Installing zod..."
    npm install zod
fi

# 2. Update Schema with missing indexes for Matching Engine
echo "📝 Updating src/modules/graph-core/schema.ts..."
cat << 'YW_SCHEMA' > src/modules/graph-core/schema.ts
/**
 * Graph Core: Schema Enforcement
 *
 * First Principle: Graph is source of truth.
 * This module enforces the graph schema defined in types.
 */

import type { NodeLabel } from '../../types/nodes';
import type { EdgeLabel } from '../../types/edges';
import { EDGE_SCHEMA } from '../../types/edges';
import { GraphConnection } from './connection';

export interface IndexDefinition {
  label: NodeLabel | 'IngestionJob';
  property: string;
  type: 'exact' | 'fulltext';
}

export const REQUIRED_INDEXES: IndexDefinition[] = [
  // Primary keys
  { label: 'Funder', property: 'id', type: 'exact' },
  { label: 'Grant', property: 'id', type: 'exact' },
  { label: 'Scholarship', property: 'id', type: 'exact' },
  { label: 'Org', property: 'id', type: 'exact' },
  { label: 'Person', property: 'id', type: 'exact' },
  { label: 'Site', property: 'id', type: 'exact' },
  { label: 'Project', property: 'id', type: 'exact' },
  { label: 'Contribution', property: 'id', type: 'exact' },
  { label: 'Activity', property: 'id', type: 'exact' },
  { label: 'Output', property: 'id', type: 'exact' },
  { label: 'FocusArea', property: 'id', type: 'exact' },
  
  // Operational nodes
  { label: 'IngestionJob', property: 'id', type: 'exact' },

  // Search indexes
  { label: 'Funder', property: 'name', type: 'fulltext' },
  { label: 'Grant', property: 'title', type: 'fulltext' },
  { label: 'Scholarship', property: 'title', type: 'fulltext' },
  { label: 'Org', property: 'name', type: 'fulltext' },
  { label: 'Org', property: 'ein', type: 'exact' },
  { label: 'Person', property: 'name', type: 'fulltext' },
  { label: 'Site', property: 'name', type: 'fulltext' },
  { label: 'Site', property: 'nfcTagId', type: 'exact' },
  { label: 'Project', property: 'name', type: 'fulltext' },
  { label: 'FocusArea', property: 'name', type: 'fulltext' },

  // Temporal & Filtering indexes (Critical for Matching Engine)
  { label: 'Grant', property: 'deadline', type: 'exact' },
  { label: 'Grant', property: 'amountMin', type: 'exact' },
  { label: 'Grant', property: 'amountMax', type: 'exact' },
  { label: 'Scholarship', property: 'deadline', type: 'exact' },
  { label: 'Contribution', property: 'timestamp', type: 'exact' },
  { label: 'Contribution', property: 'synced', type: 'exact' },
];

export class SchemaManager {
  private connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  async initializeSchema(): Promise<void> {
    for (const index of REQUIRED_INDEXES) {
      await this.createIndex(index);
    }
  }

  async createIndex(index: IndexDefinition): Promise<void> {
    const { label, property, type } = index;
    const cypher =
      type === 'exact'
        ? \`CREATE INDEX FOR (n:\${label}) ON (n.\${property})\`
        : \`CREATE INDEX FOR (n:\${label}) ON (n.\${property})\`;

    try {
      await this.connection.mutate(cypher);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }

  validateEdge(edgeType: EdgeLabel, fromLabel: NodeLabel, toLabel: NodeLabel): boolean {
    return EDGE_SCHEMA.some(
      (def) =>
        def.type === edgeType && def.fromLabel === fromLabel && def.toLabel === toLabel
    );
  }

  getValidEdgesFrom(fromLabel: NodeLabel): EdgeLabel[] {
    return EDGE_SCHEMA.filter((def) => def.fromLabel === fromLabel).map((def) => def.type);
  }

  getValidEdgesTo(toLabel: NodeLabel): EdgeLabel[] {
    return EDGE_SCHEMA.filter((def) => def.toLabel === toLabel).map((def) => def.type);
  }

  async dropAll(): Promise<void> {
    await this.connection.mutate('MATCH (n) DETACH DELETE n');
  }

  async getStats(): Promise<any> {
    const nodeCount = await this.connection.query<{ count: number }>('MATCH (n) RETURN count(n) as count');
    const edgeCount = await this.connection.query<{ count: number }>('MATCH ()-[r]->() RETURN count(r) as count');
    return { nodeCount: nodeCount[0]?.count ?? 0, edgeCount: edgeCount[0]?.count ?? 0 };
  }
}
YW_SCHEMA

# 3. Create Validator definitions
echo "📝 Creating src/modules/data-ingestion/validators.ts..."
cat << 'YW_VALIDATORS' > src/modules/data-ingestion/validators.ts
import { z } from 'zod';

export const Raw990RecordSchema = z.object({
  ein: z.string().min(9),
  name: z.string().min(1),
  city: z.string(),
  state: z.string(),
  nteeCode: z.string(),
  totalAssets: z.number().default(0),
  totalRevenue: z.number().default(0),
  totalGiving: z.number().optional(),
  fiscalYearEnd: z.string()
});

export const RawGrantRecordSchema = z.object({
  opportunityId: z.string().min(1),
  opportunityTitle: z.string().min(1),
  agencyName: z.string(),
  awardCeiling: z.number().default(0),
  awardFloor: z.number().default(0),
  closeDate: z.string(),
  eligibleApplicants: z.array(z.string()).default([]),
  categoryOfFunding: z.string().default('Other'),
  applicationUrl: z.string().url().optional()
});
YW_VALIDATORS

# 4. Integrate Validators into Data Ingestion
# We read the existing file and inject the import and validation logic
echo "📝 Updating src/modules/data-ingestion/index.ts to use Zod..."

# Note: Rewriting the whole file to ensure clean integration with Part 2's changes
cat << 'YW_INGEST_FINAL' > src/modules/data-ingestion/index.ts
/**
 * Data Ingestion Module - FINAL REFACTOR
 * Includes: DB Persistence (Part 2) + Zod Validation (Part 5)
 */

import type { GraphConnection } from '../graph-core';
import type { EntityResolutionEngine } from '../entity-resolution';
import type { Funder, Grant } from '../../types/nodes';
import { parse990ExtractCsv, download990Extract } from './irs990-parser';
import { GrantsGovClient } from './grants-gov-client';
import { Raw990RecordSchema, RawGrantRecordSchema } from './validators';

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
    const cypher = \`MATCH (j:IngestionJob {id: \$jobId}) RETURN j\`;
    const results = await this.connection.query<{ j: any }>(cypher, { jobId });
    if (results.length === 0) return undefined;
    return this.deserializeJob(results[0].j);
  }

  async listJobs(): Promise<IngestionJob[]> {
    const cypher = \`MATCH (j:IngestionJob) RETURN j ORDER BY j.startedAt DESC LIMIT 50\`;
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
        // ZOD VALIDATION
        const validated = Raw990RecordSchema.parse(record);
        await this.processOne990Record(validated);
        processed++;
      } catch (error) {
        failed++;
        const msg = \`EIN \${record.ein}: \${error instanceof Error ? error.message : String(error)}\`;
        if (errors.length < 50) errors.push(msg);
      }
    }

    await this.completeJob(job.id, processed, failed, errors);
  }

  private async process990FileStreaming(job: IngestionJob, filePath: string): Promise<void> {
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    await parse990ExtractCsv(
      filePath,
      async (record) => {
        try {
          // ZOD VALIDATION
          const validated = Raw990RecordSchema.parse(record);
          await this.processOne990Record(validated);
          processed++;
        } catch (error) {
          failed++;
          // Simplified error log
          if (errors.length < 50) errors.push(\`EIN \${record.ein}: Validation/Process Error\`);
        }
      },
      {
        onProgress: (count) => {
          if (count % 1000 === 0) console.log(\`Job \${job.id}: \${count} records...\`);
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
        // ZOD VALIDATION
        const validated = RawGrantRecordSchema.parse(grant);
        await this.processOneGrantRecord(validated);
        processed++;
      } catch (error) {
        failed++;
        if (errors.length < 50) errors.push(\`Grant \${grant.opportunityId}: \${error}\`);
      }
    }

    await this.completeJob(job.id, processed, failed, errors);
  }

  // --- Entity Processing Logic ---

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
YW_INGEST_FINAL

# 5. Commit and Push
echo "💾 Committing Part 5..."
git add package.json package-lock.json src/modules/graph-core/schema.ts src/modules/data-ingestion/validators.ts src/modules/data-ingestion/index.ts
git commit -m "Refactor: Added Zod Validation and Performance Indexes"
git push origin main

echo "✅ Part 5 Complete! System is now robust and optimized."
