/**
 * Data Ingestion Module
 *
 * Purpose: Pull from grant sources, 990s, etc., feed to Entity Resolution
 * Dependencies: Entity Resolution, Graph Core
 * Sources: IRS 990 bulk data, Grants.gov API, Foundation websites
 *
 * Knows NOTHING about: Kala, volunteers, UI, matching logic
 *
 * First Principle: Graph is source of truth.
 * All ingested data must flow into the graph through Entity Resolution.
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

/** Status of an ingestion job */
export type IngestionStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Data source types */
export type DataSourceType = 'irs_990' | 'grants_gov' | 'foundation_website' | 'manual';

/** Ingestion job record */
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

/** Raw 990 record from IRS bulk data */
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

/** Raw grant record from Grants.gov */
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

/**
 * Data Ingestion Engine
 *
 * Handles bulk data imports from external sources.
 * All data flows through Entity Resolution before entering the graph.
 */
export class DataIngestionEngine {
  private connection: GraphConnection;
  private entityResolution: EntityResolutionEngine;
  private activeJobs: Map<string, IngestionJob> = new Map();

  constructor(connection: GraphConnection, entityResolution: EntityResolutionEngine) {
    this.connection = connection;
    this.entityResolution = entityResolution;
  }

  /**
   * Start ingestion from IRS 990 bulk data file.
   */
  async ingest990Data(filePath: string): Promise<IngestionJob> {
    const job = this.createJob('irs_990');

    // Process asynchronously
    this.process990File(job, filePath).catch((error) => {
      job.status = 'failed';
      job.errors.push(error.message);
    });

    return job;
  }

  /**
   * Download and ingest 990 data for a specific year.
   */
  async ingest990Year(year: number, tempDir = '/tmp/almoner'): Promise<IngestionJob> {
    const job = this.createJob('irs_990');

    // Download and process asynchronously
    (async () => {
      try {
        console.log(`Downloading 990 data for year ${year}...`);
        const filePath = await download990Extract(year, tempDir);
        console.log(`Downloaded to ${filePath}, starting ingestion...`);
        await this.process990FileStreaming(job, filePath);
      } catch (error) {
        job.status = 'failed';
        job.errors.push(error instanceof Error ? error.message : String(error));
      }
    })();

    return job;
  }

  /**
   * Start ingestion from Grants.gov API.
   */
  async ingestGrantsGov(options: {
    keyword?: string;
    agency?: string;
    eligibility?: string;
  }): Promise<IngestionJob> {
    const job = this.createJob('grants_gov');

    // Process asynchronously
    this.processGrantsGov(job, options).catch((error) => {
      job.status = 'failed';
      job.errors.push(error.message);
    });

    return job;
  }

  /**
   * Get status of an ingestion job.
   */
  getJobStatus(jobId: string): IngestionJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * List all ingestion jobs.
   */
  listJobs(): IngestionJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Process a 990 data file (loads all records into memory).
   */
  private async process990File(job: IngestionJob, filePath: string): Promise<void> {
    job.status = 'running';

    const records = await this.read990File(filePath);

    for (const record of records) {
      try {
        await this.processOne990Record(record);
        job.recordsProcessed++;
      } catch (error) {
        job.recordsFailed++;
        job.errors.push(`EIN ${record.ein}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    job.status = 'completed';
    job.completedAt = new Date();
  }

  /**
   * Process a 990 data file with streaming (memory efficient).
   */
  private async process990FileStreaming(job: IngestionJob, filePath: string): Promise<void> {
    job.status = 'running';

    const result = await parse990ExtractCsv(
      filePath,
      async (record) => {
        try {
          await this.processOne990Record(record);
          job.recordsProcessed++;
        } catch (error) {
          job.recordsFailed++;
          job.errors.push(`EIN ${record.ein}: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      {
        onProgress: (count) => {
          console.log(`Processed ${count} 990 records...`);
        },
      }
    );

    if (result.errors.length > 0) {
      job.errors.push(...result.errors);
    }

    job.status = 'completed';
    job.completedAt = new Date();
  }

  /**
   * Process a single 990 record.
   */
  private async processOne990Record(record: Raw990Record): Promise<void> {
    // Determine if this is a funder (gives grants) or just an org
    const isFunder = record.totalGiving && record.totalGiving > 0;

    // Resolve the organization through Entity Resolution
    const orgResult = await this.entityResolution.resolveOrg({
      name: record.name,
      ein: record.ein,
      mission: '', // 990 doesn't provide this
      focusAreas: this.nteeToFocusAreas(record.nteeCode),
      geoFocus: [record.state],
      verified: true, // IRS data is verified
    });

    // If this org is also a funder, create a Funder node
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

  /**
   * Process Grants.gov data.
   */
  private async processGrantsGov(
    job: IngestionJob,
    options: { keyword?: string; agency?: string; eligibility?: string }
  ): Promise<void> {
    job.status = 'running';

    // In production, this would:
    // 1. Call Grants.gov API with filters
    // 2. Parse each grant opportunity
    // 3. Create Grant and Funder nodes

    const grants = await this.fetchGrantsGov(options);

    for (const grant of grants) {
      try {
        await this.processOneGrantRecord(grant);
        job.recordsProcessed++;
      } catch (error) {
        job.recordsFailed++;
        job.errors.push(`Grant ${grant.opportunityId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    job.status = 'completed';
    job.completedAt = new Date();
  }

  /**
   * Process a single grant record.
   */
  private async processOneGrantRecord(record: RawGrantRecord): Promise<void> {
    // First, resolve the funding agency
    const funderResult = await this.entityResolution.resolveFunder({
      name: record.agencyName,
      type: 'government',
      focusAreas: [record.categoryOfFunding],
      geoFocus: ['US'],
      totalGiving: 0, // Unknown from grants.gov data
      source: ['grants_gov'],
    });

    // Create the Grant node
    const grant: Omit<Grant, 'id'> = {
      title: record.opportunityTitle,
      amount: { min: record.awardFloor, max: record.awardCeiling },
      deadline: new Date(record.closeDate),
      eligibility: record.eligibleApplicants,
      focusAreas: [record.categoryOfFunding],
      applicationUrl: record.applicationUrl,
      lastUpdated: new Date(),
    };

    const grantId = crypto.randomUUID();

    const cypher = `
      CREATE (g:Grant $properties)
      RETURN g
    `;

    await this.connection.mutate(cypher, {
      properties: {
        id: grantId,
        title: grant.title,
        amount: JSON.stringify(grant.amount),
        deadline: grant.deadline.toISOString(),
        eligibility: JSON.stringify(grant.eligibility),
        focusAreas: JSON.stringify(grant.focusAreas),
        applicationUrl: grant.applicationUrl,
        lastUpdated: grant.lastUpdated.toISOString(),
      },
    });

    // Create OFFERS edge from Funder to Grant
    const edgeCypher = `
      MATCH (f:Funder {id: $funderId})
      MATCH (g:Grant {id: $grantId})
      CREATE (f)-[:OFFERS {id: $edgeId, createdAt: $createdAt}]->(g)
    `;

    await this.connection.mutate(edgeCypher, {
      funderId: funderResult.entity.id,
      grantId,
      edgeId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Create a new ingestion job.
   */
  private createJob(source: DataSourceType): IngestionJob {
    const job: IngestionJob = {
      id: crypto.randomUUID(),
      source,
      status: 'pending',
      startedAt: new Date(),
      recordsProcessed: 0,
      recordsFailed: 0,
      errors: [],
    };

    this.activeJobs.set(job.id, job);
    return job;
  }

  /**
   * Read 990 file using the CSV parser.
   */
  private async read990File(filePath: string): Promise<Raw990Record[]> {
    const records: Raw990Record[] = [];

    await parse990ExtractCsv(
      filePath,
      async (record) => {
        records.push(record);
      },
      {
        onProgress: (count) => {
          console.log(`Parsed ${count} 990 records...`);
        },
      }
    );

    return records;
  }

  /**
   * Fetch from Grants.gov API.
   */
  private async fetchGrantsGov(
    options: { keyword?: string; agency?: string; eligibility?: string }
  ): Promise<RawGrantRecord[]> {
    const client = new GrantsGovClient(process.env.GRANTS_GOV_API_KEY);

    return client.fetchAll(
      {
        keyword: options.keyword,
        agency: options.agency,
        eligibility: options.eligibility,
        oppStatus: 'posted',
        rows: 100,
      },
      (fetched, total) => {
        console.log(`Fetched ${fetched}/${total} grants...`);
      }
    );
  }

  /**
   * Convert NTEE code to focus areas.
   */
  private nteeToFocusAreas(nteeCode: string): string[] {
    const mapping: Record<string, string[]> = {
      A: ['arts', 'culture', 'humanities'],
      B: ['education'],
      C: ['environment'],
      D: ['animal welfare'],
      E: ['health'],
      F: ['mental health'],
      G: ['disease research'],
      H: ['medical research'],
      I: ['crime prevention', 'public safety'],
      J: ['employment', 'job training'],
      K: ['food security', 'agriculture', 'nutrition'],
      L: ['housing', 'shelter'],
      M: ['public safety', 'disaster relief'],
      N: ['recreation', 'sports'],
      O: ['youth development'],
      P: ['human services'],
      Q: ['international affairs'],
      R: ['civil rights', 'social action'],
      S: ['community development'],
      T: ['philanthropy', 'voluntarism'],
      U: ['science', 'technology'],
      V: ['social science'],
      W: ['public policy', 'advocacy'],
      X: ['religion'],
      Y: ['mutual benefit'],
      Z: ['unknown'],
    };

    const majorCode = nteeCode.charAt(0).toUpperCase();
    return mapping[majorCode] || ['general'];
  }

  /**
   * Convert NTEE code to funder type.
   */
  private nteeToFunderType(nteeCode: string): Funder['type'] {
    // NTEE codes starting with T are typically foundations
    if (nteeCode.startsWith('T')) {
      return 'foundation';
    }
    // Most 990 filers that give grants are foundations
    return 'foundation';
  }
}

/**
 * Create a Data Ingestion Engine.
 */
export function createDataIngestionEngine(
  connection: GraphConnection,
  entityResolution: EntityResolutionEngine
): DataIngestionEngine {
  return new DataIngestionEngine(connection, entityResolution);
}
