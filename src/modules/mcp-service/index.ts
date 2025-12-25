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
