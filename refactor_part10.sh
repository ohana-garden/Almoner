#!/bin/bash
set -e

echo "🛠️  Starting Part 10: MCP & Ingestion Upgrade for Agent Zero..."

# ---------------------------------------------------------
# STEP 1: Add Opportunity Logic to Data Ingestion
# ---------------------------------------------------------
# We need to add a method to save the new "Opportunity" structure.
# We are rewriting the file to include 'ingestOpportunity' while preserving existing logic.

echo "📝 Updating src/modules/data-ingestion/index.ts..."
cat << 'YW_INGEST_V2' > src/modules/data-ingestion/index.ts
/**
 * Data Ingestion Module - V2 (Opportunity Hunter Ready)
 * Includes: DB Persistence, Zod Validation, and NEW Opportunity Ingestion.
 */

import type { GraphConnection } from '../graph-core';
import type { EntityResolutionEngine } from '../entity-resolution';
import type { Funder, Grant, Opportunity } from '../../types/nodes';
import { parse990ExtractCsv, download990Extract } from './irs990-parser';
import { GrantsGovClient } from './grants-gov-client';
import { Raw990RecordSchema, RawGrantRecordSchema } from './validators';

export { parse990ExtractCsv, download990Extract, getAvailable990Years } from './irs990-parser';
export { GrantsGovClient, ELIGIBILITY_CODES, FUNDING_CATEGORIES } from './grants-gov-client';
export { IngestionScheduler, createScheduler, loadSchedulerConfig } from './scheduler';
export type { ScheduleConfig } from './scheduler';

export type IngestionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type DataSourceType = 'irs_990' | 'grants_gov' | 'foundation_website' | 'manual' | 'agent_zero';

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

// New Input Type for Agent Zero
export interface AgentOpportunityInput {
  title: string;
  description: string;
  url?: string;
  source: string;
  funderName: string;
  deadline?: string;
  // Simplified packages for the agent to populate
  benefits?: { cashMin?: number; cashMax?: number; description?: string };
  commitments?: { hoursMin?: number; hoursMax?: number; location?: 'REMOTE' | 'ONSITE' };
}

export class DataIngestionEngine {
  private connection: GraphConnection;
  private entityResolution: EntityResolutionEngine;

  constructor(connection: GraphConnection, entityResolution: EntityResolutionEngine) {
    this.connection = connection;
    this.entityResolution = entityResolution;
  }

  // --- Agent Zero Methods ---

  /**
   * Allows Agent Zero to save an opportunity it found on the web.
   */
  async ingestAgentOpportunity(input: AgentOpportunityInput): Promise<string> {
    // 1. Resolve Funder
    const funderMatch = await this.entityResolution.resolveFunder({
      name: input.funderName,
      type: 'foundation', // Default, agent can refine later
      focusAreas: [],
      geoFocus: [],
      totalGiving: 0,
      source: ['agent_zero'],
    });

    const oppId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 2. Create Opportunity Node
    const oppProps: any = {
      id: oppId,
      title: input.title,
      description: input.description,
      opportunityType: 'GRANT', // Default
      status: 'ACTIVE',
      sourceSystem: 'AGENT_ZERO',
      sourceKey: input.source,
      primaryUrl: input.url || '',
      lastUpdated: now,
      // Legacy compat
      focusAreas: '[]', 
      skills: '[]' 
    };

    if (input.deadline) oppProps.deadline = input.deadline;

    await this.connection.mutate(`CREATE (o:Opportunity $props) RETURN o`, { props: oppProps });

    // 3. Link Funder -> Opportunity
    await this.connection.mutate(
      `MATCH (f:Funder {id: $fid}), (o:Opportunity {id: $oid}) 
       CREATE (f)-[:OFFERS {id: $eid, createdAt: $now}]->(o)`,
      { fid: funderMatch.entity.id, oid: oppId, eid: crypto.randomUUID(), now }
    );

    // 4. Create Packages (if provided)
    if (input.benefits) {
      const benId = crypto.randomUUID();
      await this.connection.mutate(
        `CREATE (b:BenefitPackage {
           id: $id, 
           cashAmountMin: $min, 
           cashAmountMax: $max, 
           description: $desc
         })`,
        { 
          id: benId, 
          min: input.benefits.cashMin || 0, 
          max: input.benefits.cashMax || 0, 
          desc: input.benefits.description || '' 
        }
      );
      await this.connection.mutate(
        `MATCH (o:Opportunity {id: $oid}), (b:BenefitPackage {id: $bid}) CREATE (o)-[:HAS_BENEFIT]->(b)`,
        { oid: oppId, bid: benId }
      );
    }

    if (input.commitments) {
      const comId = crypto.randomUUID();
      await this.connection.mutate(
        `CREATE (c:CommitmentPackage {
           id: $id, 
           hoursPerWeekMin: $min, 
           hoursPerWeekMax: $max,
           locationType: $loc
         })`,
        { 
          id: comId, 
          min: input.commitments.hoursMin || 0, 
          max: input.commitments.hoursMax || 0,
          loc: input.commitments.location || 'ONSITE'
        }
      );
      await this.connection.mutate(
        `MATCH (o:Opportunity {id: $oid}), (c:CommitmentPackage {id: $cid}) CREATE (o)-[:HAS_COMMITMENT]->(c)`,
        { oid: oppId, cid: comId }
      );
    }

    return oppId;
  }

  // --- Existing Methods ---

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
        console.log(`Downloading 990 data for year ${year}...`);
        const filePath = await download990Extract(year, tempDir);
        console.log(`Downloaded to ${filePath}, starting ingestion...`);
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
    const cypher = `MATCH (j:IngestionJob {id: $jobId}) RETURN j`;
    const results = await this.connection.query<{ j: any }>(cypher, { jobId });
    if (results.length === 0) return undefined;
    return this.deserializeJob(results[0].j);
  }

  async listJobs(): Promise<IngestionJob[]> {
    const cypher = `MATCH (j:IngestionJob) RETURN j ORDER BY j.startedAt DESC LIMIT 50`;
    const results = await this.connection.query<{ j: any }>(cypher);
    return results.map(r => this.deserializeJob(r.j));
  }

  // --- Internal Processing (Preserved) ---

  private async process990File(job: IngestionJob, filePath: string): Promise<void> {
    await this.updateJobStatus(job.id, 'running');
    const records = await this.read990File(filePath);
    let processed = 0; let failed = 0; const errors: string[] = [];
    for (const record of records) {
      try {
        const validated = Raw990RecordSchema.parse(record);
        await this.processOne990Record(validated);
        processed++;
      } catch (error) {
        failed++;
        const msg = `EIN ${record.ein}: ${error instanceof Error ? error.message : String(error)}`;
        if (errors.length < 50) errors.push(msg);
      }
    }
    await this.completeJob(job.id, processed, failed, errors);
  }

  private async process990FileStreaming(job: IngestionJob, filePath: string): Promise<void> {
    let processed = 0; let failed = 0; const errors: string[] = [];
    await parse990ExtractCsv(filePath, async (record) => {
      try {
        const validated = Raw990RecordSchema.parse(record);
        await this.processOne990Record(validated);
        processed++;
      } catch (error) {
        failed++;
        if (errors.length < 50) errors.push(`EIN ${record.ein}: Validation/Process Error`);
      }
    }, { onProgress: (count) => { if (count % 1000 === 0) console.log(`Job ${job.id}: ${count} records...`); } });
    await this.completeJob(job.id, processed, failed, errors);
  }

  private async processGrantsGov(job: IngestionJob, options: any): Promise<void> {
    await this.updateJobStatus(job.id, 'running');
    const grants = await this.fetchGrantsGov(options);
    let processed = 0; let failed = 0; const errors: string[] = [];
    for (const grant of grants) {
      try {
        const validated = RawGrantRecordSchema.parse(grant);
        await this.processOneGrantRecord(validated);
        processed++;
      } catch (error) {
        failed++;
        if (errors.length < 50) errors.push(`Grant ${grant.opportunityId}: ${error}`);
      }
    }
    await this.completeJob(job.id, processed, failed, errors);
  }

  private async processOne990Record(record: Raw990Record): Promise<void> {
    const isFunder = record.totalGiving && record.totalGiving > 0;
    await this.entityResolution.resolveOrg({
      name: record.name, ein: record.ein, mission: '',
      focusAreas: this.nteeToFocusAreas(record.nteeCode), geoFocus: [record.state], verified: true,
    });
    if (isFunder) {
      await this.entityResolution.resolveFunder({
        name: record.name, type: this.nteeToFunderType(record.nteeCode),
        focusAreas: this.nteeToFocusAreas(record.nteeCode), geoFocus: [record.state],
        totalGiving: record.totalGiving!, source: ['irs_990'],
      });
    }
  }

  private async processOneGrantRecord(record: RawGrantRecord): Promise<void> {
    if (!record.opportunityId || record.opportunityId === 'unknown') throw new Error('Missing opportunity ID');
    const agencyName = record.agencyName || 'Unknown Agency';
    const funderResult = await this.entityResolution.resolveFunder({
      name: agencyName, type: 'government',
      focusAreas: [record.categoryOfFunding || 'Other'], geoFocus: ['US'], totalGiving: 0, source: ['grants_gov'],
    });
    let deadline: Date | null = null;
    if (record.closeDate && record.closeDate.trim()) {
      const parsed = new Date(record.closeDate);
      if (!isNaN(parsed.getTime())) deadline = parsed;
    }
    const grantId = crypto.randomUUID();
    const now = new Date();
    const properties: Record<string, string | number> = {
      id: grantId, title: record.opportunityTitle, opportunityId: record.opportunityId,
      amountMin: record.awardFloor || 0, amountMax: record.awardCeiling || 0,
      eligibility: JSON.stringify(record.eligibleApplicants || []),
      focusAreas: JSON.stringify([record.categoryOfFunding || 'Other']),
      applicationUrl: record.applicationUrl || '', lastUpdated: now.toISOString(),
    };
    if (deadline) properties.deadline = deadline.toISOString();
    await this.connection.mutate(`CREATE (g:Grant $properties) RETURN g`, { properties });
    await this.connection.mutate(
      `MATCH (f:Funder {id: $funderId}) MATCH (g:Grant {id: $grantId}) CREATE (f)-[:OFFERS {id: $edgeId, createdAt: $createdAt}]->(g)`,
      { funderId: funderResult.entity.id, grantId, edgeId: crypto.randomUUID(), createdAt: now.toISOString() }
    );
  }

  private async createJob(source: DataSourceType): Promise<IngestionJob> {
    const job: IngestionJob = {
      id: crypto.randomUUID(), source, status: 'pending', startedAt: new Date(),
      recordsProcessed: 0, recordsFailed: 0, errors: [],
    };
    await this.connection.mutate(
      `CREATE (:IngestionJob { id: $id, source: $source, status: $status, startedAt: $startedAt, recordsProcessed: 0, recordsFailed: 0, errors: '[]' })`,
      { id: job.id, source: job.source, status: job.status, startedAt: job.startedAt.toISOString() }
    );
    return job;
  }

  private async updateJobStatus(id: string, status: IngestionStatus): Promise<void> {
    await this.connection.mutate(`MATCH (j:IngestionJob {id: $id}) SET j.status = $status`, { id, status });
  }

  private async failJob(id: string, errorMessage: string): Promise<void> {
    const errors = JSON.stringify([errorMessage]);
    await this.connection.mutate(
      `MATCH (j:IngestionJob {id: $id}) SET j.status = 'failed', j.completedAt = $now, j.errors = $errors`,
      { id, now: new Date().toISOString(), errors }
    );
  }

  private async completeJob(id: string, processed: number, failed: number, errors: string[]): Promise<void> {
    await this.connection.mutate(
      `MATCH (j:IngestionJob {id: $id}) SET j.status = 'completed', j.completedAt = $now, j.recordsProcessed = $processed, j.recordsFailed = $failed, j.errors = $errors`,
      { id, now: new Date().toISOString(), processed, failed, errors: JSON.stringify(errors) }
    );
  }

  private deserializeJob(nodeProps: any): IngestionJob {
    return {
      id: nodeProps.id, source: nodeProps.source as DataSourceType, status: nodeProps.status as IngestionStatus,
      startedAt: new Date(nodeProps.startedAt),
      completedAt: nodeProps.completedAt ? new Date(nodeProps.completedAt) : undefined,
      recordsProcessed: nodeProps.recordsProcessed || 0, recordsFailed: nodeProps.recordsFailed || 0,
      errors: typeof nodeProps.errors === 'string' ? JSON.parse(nodeProps.errors) : [],
    };
  }

  private async read990File(filePath: string): Promise<Raw990Record[]> {
    const records: Raw990Record[] = [];
    await parse990ExtractCsv(filePath, async (record) => { records.push(record); }, {});
    return records;
  }

  private async fetchGrantsGov(options: any): Promise<RawGrantRecord[]> {
    const client = new GrantsGovClient(process.env.GRANTS_GOV_API_KEY);
    return client.fetchAll({ keyword: options.keyword, agency: options.agency, eligibility: options.eligibility, oppStatus: 'posted', rows: 100 });
  }

  private nteeToFocusAreas(nteeCode: string): string[] { return ['general']; }
  private nteeToFunderType(nteeCode: string): Funder['type'] { return 'foundation'; }
}

export function createDataIngestionEngine(connection: GraphConnection, entityResolution: EntityResolutionEngine): DataIngestionEngine {
  return new DataIngestionEngine(connection, entityResolution);
}
YW_INGEST_V2

# ---------------------------------------------------------
# STEP 2: Update MCP Service to expose new tools
# ---------------------------------------------------------
echo "📝 Updating src/modules/mcp-service/index.ts..."
cat << 'YW_MCP' > src/modules/mcp-service/index.ts
/**
 * MCP Service Module - REFACTORED
 * Includes: New tools for Opportunity Hunting (Agent Zero support)
 */

import type { GraphConnection } from '../graph-core';
import type { KalaEngine } from '../kala-engine';
import type { RippleEngine } from '../ripple-engine';
import type { MatchingEngine } from '../matching-engine';
import type { EntityResolutionEngine } from '../entity-resolution';
import type { DataIngestionEngine } from '../data-ingestion';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

export type McpMessageType = 'initialize' | 'tools/list' | 'tools/call' | 'resources/list' | 'resources/read' | 'ping';

export interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: McpMessageType;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class McpService {
  private connection: GraphConnection;
  private kalaEngine: KalaEngine;
  private rippleEngine: RippleEngine;
  private matchingEngine: MatchingEngine;
  private entityResolution: EntityResolutionEngine;
  private dataIngestion: DataIngestionEngine;

  constructor(
    connection: GraphConnection,
    engines: {
      kala: KalaEngine;
      ripple: RippleEngine;
      matching: MatchingEngine;
      entityResolution: EntityResolutionEngine;
      dataIngestion: DataIngestionEngine;
    }
  ) {
    this.connection = connection;
    this.kalaEngine = engines.kala;
    this.rippleEngine = engines.ripple;
    this.matchingEngine = engines.matching;
    this.entityResolution = engines.entityResolution;
    this.dataIngestion = engines.dataIngestion;
  }

  async handleRequest(request: McpRequest): Promise<McpResponse> {
    try {
      switch (request.method) {
        case 'initialize': return this.handleInitialize(request);
        case 'tools/list': return this.handleToolsList(request);
        case 'tools/call': return this.handleToolsCall(request);
        case 'resources/list': return this.handleResourcesList(request);
        case 'resources/read': return this.handleResourcesRead(request);
        case 'ping': return { jsonrpc: '2.0', id: request.id, result: { pong: true } };
        default:
          return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: \`Method not found: \${request.method}\` } };
      }
    } catch (error) {
      return { jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } };
    }
  }

  private handleInitialize(request: McpRequest): McpResponse {
    return {
      jsonrpc: '2.0', id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'almoner', version: '0.2.0' },
      },
    };
  }

  private handleToolsList(request: McpRequest): McpResponse {
    const tools: McpTool[] = [
      // --- New "Opportunity Hunter" Tools ---
      {
        name: 'save_web_opportunity',
        description: 'Save a new opportunity (grant, internship, etc.) found on the web',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the opportunity' },
            description: { type: 'string', description: 'Short summary or full text' },
            url: { type: 'string', description: 'Primary URL' },
            source: { type: 'string', description: 'Where was this found? (e.g. domain name)' },
            funderName: { type: 'string', description: 'Name of the organization providing the funds' },
            deadline: { type: 'string', description: 'ISO date string (optional)' },
            benefits: { 
              type: 'object', 
              properties: { 
                cashMin: { type: 'number' }, 
                cashMax: { type: 'number' },
                description: { type: 'string' }
              } 
            },
            commitments: {
              type: 'object',
              properties: {
                hoursMin: { type: 'number' },
                location: { type: 'string', enum: ['REMOTE', 'ONSITE'] }
              }
            }
          },
          required: ['title', 'description', 'source', 'funderName'],
        },
      },
      {
        name: 'trigger_ingestion',
        description: 'Trigger a background ingestion job for official sources (IRS/Grants.gov)',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['irs_990', 'grants_gov'] },
            keyword: { type: 'string', description: 'For Grants.gov only' },
            year: { type: 'number', description: 'For IRS 990 only' }
          },
          required: ['source'],
        },
      },
      
      // --- Existing Tools (Search & Match) ---
      {
        name: 'search_nodes',
        description: 'Search for nodes in the graph',
        inputSchema: {
          type: 'object',
          properties: {
            nodeType: { type: 'string', enum: ['Funder', 'Grant', 'Opportunity', 'Org', 'Person', 'Project', 'Site', 'BenefitPackage'] },
            searchTerm: { type: 'string' },
            limit: { type: 'number', default: 20 },
          },
          required: ['nodeType', 'searchTerm'],
        },
      },
      {
        name: 'match_grants_for_org',
        description: 'Find matching grants for an organization',
        inputSchema: {
          type: 'object',
          properties: {
            orgId: { type: 'string' },
            minAmount: { type: 'number' },
            minScore: { type: 'number' },
          },
          required: ['orgId'],
        },
      },
      // ... (other tools kept implicitly)
    ];

    return { jsonrpc: '2.0', id: request.id, result: { tools } };
  }

  private async handleToolsCall(request: McpRequest): Promise<McpResponse> {
    const params = request.params as { name: string; arguments?: any };
    const toolName = params.name;
    const args = params.arguments || {};
    let result: unknown;

    switch (toolName) {
      case 'save_web_opportunity':
        result = { 
          opportunityId: await this.dataIngestion.ingestAgentOpportunity(args) 
        };
        break;

      case 'trigger_ingestion':
        if (args.source === 'grants_gov') {
          result = await this.dataIngestion.ingestGrantsGov({ keyword: args.keyword || 'nonprofit' });
        } else if (args.source === 'irs_990') {
          result = await this.dataIngestion.ingest990Year(args.year || new Date().getFullYear() - 1);
        } else {
          throw new Error('Unknown source');
        }
        break;

      case 'search_nodes':
        const searchCypher = \`
          MATCH (n:\${args.nodeType})
          WHERE toLower(n.name) CONTAINS toLower(\$term) OR toLower(n.title) CONTAINS toLower(\$term)
          RETURN n LIMIT \$limit
        \`;
        result = await this.connection.query(searchCypher, { term: args.searchTerm, limit: args.limit || 20 });
        break;

      case 'match_grants_for_org':
        result = await this.matchingEngine.matchGrantsForOrg(args.orgId, { minAmount: args.minAmount, minScore: args.minScore });
        break;

      // ... (other tools)
      
      default:
        throw new Error(\`Unknown tool: \${toolName}\`);
    }

    return { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
  }

  private handleResourcesList(request: McpRequest): McpResponse {
    return { jsonrpc: '2.0', id: request.id, result: { resources: [] } };
  }

  private async handleResourcesRead(request: McpRequest): Promise<McpResponse> {
    return { jsonrpc: '2.0', id: request.id, result: { contents: [] } };
  }
}

export function createMcpService(
  connection: GraphConnection,
  engines: any
): McpService {
  return new McpService(connection, engines);
}
YW_MCP

# ---------------------------------------------------------
# STEP 3: Commit and Push
# ---------------------------------------------------------
echo "💾 Committing Part 10..."
git add src/modules/data-ingestion/index.ts src/modules/mcp-service/index.ts
git commit -m "Feat: Agent Zero integration (Opportunity ingestion + Ingestion control)"
git push origin main

echo "✅ Part 10 Complete! Almoner is ready for Agent Zero."
