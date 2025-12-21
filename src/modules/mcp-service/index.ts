/**
 * MCP Service Module
 *
 * Purpose: Expose Almoner capabilities to agents and external consumers
 * Dependencies: All engines
 *
 * Knows NOTHING about: UI, capture client internals
 *
 * First Principle: Agents come later.
 * Build infrastructure first. This module exists to serve agents
 * once the graph infrastructure is solid.
 */

import type { GraphConnection } from '../graph-core';
import type { KalaEngine } from '../kala-engine';
import type { RippleEngine } from '../ripple-engine';
import type { MatchingEngine } from '../matching-engine';
import type { EntityResolutionEngine } from '../entity-resolution';
import type { DataIngestionEngine } from '../data-ingestion';

/** MCP Tool definition */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** MCP Resource definition */
export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

/** MCP Message types */
export type McpMessageType =
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'ping';

/** MCP Request */
export interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: McpMessageType;
  params?: Record<string, unknown>;
}

/** MCP Response */
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

/**
 * MCP Service
 *
 * Implements the Model Context Protocol to expose Almoner capabilities
 * to AI agents and other consumers.
 *
 * First Principle: Agents come later.
 * This module provides the interface for agents to interact with Almoner.
 */
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

  /**
   * Handle an MCP request.
   */
  async handleRequest(request: McpRequest): Promise<McpResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);

        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return this.handleToolsCall(request);

        case 'resources/list':
          return this.handleResourcesList(request);

        case 'resources/read':
          return this.handleResourcesRead(request);

        case 'ping':
          return { jsonrpc: '2.0', id: request.id, result: { pong: true } };

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle initialize request.
   */
  private handleInitialize(request: McpRequest): McpResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: 'almoner',
          version: '0.1.0',
        },
      },
    };
  }

  /**
   * Handle tools/list request.
   */
  private handleToolsList(request: McpRequest): McpResponse {
    const tools: McpTool[] = [
      // Matching tools
      {
        name: 'match_grants_for_org',
        description: 'Find matching grants for an organization based on focus areas, geography, and eligibility',
        inputSchema: {
          type: 'object',
          properties: {
            orgId: { type: 'string', description: 'Organization ID' },
            minAmount: { type: 'number', description: 'Minimum grant amount' },
            maxAmount: { type: 'number', description: 'Maximum grant amount' },
            focusAreas: { type: 'array', items: { type: 'string' }, description: 'Filter by focus areas' },
            minScore: { type: 'number', description: 'Minimum match score (0-1)' },
          },
          required: ['orgId'],
        },
      },
      {
        name: 'match_scholarships_for_person',
        description: 'Find matching scholarships for a person based on interests, location, and eligibility',
        inputSchema: {
          type: 'object',
          properties: {
            personId: { type: 'string', description: 'Person ID' },
            minAmount: { type: 'number', description: 'Minimum scholarship amount' },
            maxAmount: { type: 'number', description: 'Maximum scholarship amount' },
            minScore: { type: 'number', description: 'Minimum match score (0-1)' },
          },
          required: ['personId'],
        },
      },
      {
        name: 'get_expiring_grants',
        description: 'Get grants with approaching deadlines',
        inputSchema: {
          type: 'object',
          properties: {
            withinDays: { type: 'number', description: 'Number of days to look ahead', default: 30 },
          },
        },
      },

      // Kala tools
      {
        name: 'get_person_kala',
        description: 'Get total Kala contribution pattern for a person',
        inputSchema: {
          type: 'object',
          properties: {
            personId: { type: 'string', description: 'Person ID' },
          },
          required: ['personId'],
        },
      },
      {
        name: 'get_project_kala',
        description: 'Get total Kala contributions for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Project ID' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'get_site_kala',
        description: 'Get total Kala contributions at a site',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string', description: 'Site ID' },
          },
          required: ['siteId'],
        },
      },
      {
        name: 'get_kala_leaderboard',
        description: 'Get top Kala contributors',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of results', default: 10 },
          },
        },
      },

      // Ripple tools
      {
        name: 'trace_ripples',
        description: 'Trace impact ripples from a node through the graph',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Starting node ID' },
            nodeLabel: { type: 'string', description: 'Node type (Funder, Grant, Org, etc.)' },
            direction: { type: 'string', enum: ['upstream', 'downstream', 'both'], default: 'both' },
            maxDepth: { type: 'number', description: 'Maximum traversal depth', default: 5 },
          },
          required: ['nodeId', 'nodeLabel'],
        },
      },
      {
        name: 'get_grant_impact',
        description: 'Get downstream impact of a grant',
        inputSchema: {
          type: 'object',
          properties: {
            grantId: { type: 'string', description: 'Grant ID' },
          },
          required: ['grantId'],
        },
      },
      {
        name: 'get_funder_impact',
        description: 'Get total impact of a funder',
        inputSchema: {
          type: 'object',
          properties: {
            funderId: { type: 'string', description: 'Funder ID' },
          },
          required: ['funderId'],
        },
      },

      // Graph query tools
      {
        name: 'query_graph',
        description: 'Execute a Cypher query against the Almoner graph',
        inputSchema: {
          type: 'object',
          properties: {
            cypher: { type: 'string', description: 'Cypher query (read-only)' },
            params: { type: 'object', description: 'Query parameters' },
          },
          required: ['cypher'],
        },
      },
      {
        name: 'search_nodes',
        description: 'Search for nodes by type and properties',
        inputSchema: {
          type: 'object',
          properties: {
            nodeType: {
              type: 'string',
              enum: ['Funder', 'Grant', 'Scholarship', 'Org', 'Person', 'Project', 'Site'],
            },
            searchTerm: { type: 'string', description: 'Search term for name/title' },
            limit: { type: 'number', default: 20 },
          },
          required: ['nodeType', 'searchTerm'],
        },
      },
    ];

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools },
    };
  }

  /**
   * Handle tools/call request.
   */
  private async handleToolsCall(request: McpRequest): Promise<McpResponse> {
    const params = request.params as { name: string; arguments?: Record<string, unknown> };
    const toolName = params.name;
    const args = params.arguments || {};

    try {
      let result: unknown;

      switch (toolName) {
        // Matching tools
        case 'match_grants_for_org':
          result = await this.matchingEngine.matchGrantsForOrg(
            args.orgId as string,
            {
              minAmount: args.minAmount as number | undefined,
              maxAmount: args.maxAmount as number | undefined,
              focusAreas: args.focusAreas as string[] | undefined,
              minScore: args.minScore as number | undefined,
            }
          );
          break;

        case 'match_scholarships_for_person':
          result = await this.matchingEngine.matchScholarshipsForPerson(
            args.personId as string,
            {
              minAmount: args.minAmount as number | undefined,
              maxAmount: args.maxAmount as number | undefined,
              minScore: args.minScore as number | undefined,
            }
          );
          break;

        case 'get_expiring_grants':
          result = await this.matchingEngine.getExpiringGrants(
            args.withinDays as number | undefined
          );
          break;

        // Kala tools
        case 'get_person_kala':
          result = await this.kalaEngine.getPersonKala(args.personId as string);
          break;

        case 'get_project_kala':
          result = await this.kalaEngine.getProjectKala(args.projectId as string);
          break;

        case 'get_site_kala':
          result = await this.kalaEngine.getSiteKala(args.siteId as string);
          break;

        case 'get_kala_leaderboard':
          result = await this.kalaEngine.getLeaderboard(args.limit as number | undefined);
          break;

        // Ripple tools
        case 'trace_ripples':
          result = await this.rippleEngine.traceRipples(
            args.nodeId as string,
            args.nodeLabel as string,
            {
              direction: args.direction as 'upstream' | 'downstream' | 'both' | undefined,
              maxDepth: args.maxDepth as number | undefined,
            }
          );
          break;

        case 'get_grant_impact':
          result = await this.rippleEngine.getGrantImpact(args.grantId as string);
          break;

        case 'get_funder_impact':
          result = await this.rippleEngine.getFunderImpact(args.funderId as string);
          break;

        // Graph query tools
        case 'query_graph':
          // Only allow read queries (no MERGE, CREATE, SET, DELETE)
          const cypher = (args.cypher as string).toUpperCase();
          if (
            cypher.includes('CREATE') ||
            cypher.includes('MERGE') ||
            cypher.includes('SET') ||
            cypher.includes('DELETE') ||
            cypher.includes('REMOVE')
          ) {
            throw new Error('Only read queries are allowed through MCP');
          }
          result = await this.connection.query(
            args.cypher as string,
            args.params as Record<string, unknown> | undefined
          );
          break;

        case 'search_nodes':
          const nodeType = args.nodeType as string;
          const searchTerm = args.searchTerm as string;
          const limit = (args.limit as number) || 20;

          const searchCypher = `
            MATCH (n:${nodeType})
            WHERE toLower(n.name) CONTAINS toLower($searchTerm)
               OR toLower(n.title) CONTAINS toLower($searchTerm)
            RETURN n
            LIMIT $limit
          `;
          result = await this.connection.query(searchCypher, { searchTerm, limit });
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32602, message: `Unknown tool: ${toolName}` },
          };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle resources/list request.
   */
  private handleResourcesList(request: McpRequest): McpResponse {
    const resources: McpResource[] = [
      {
        uri: 'almoner://schema',
        name: 'Graph Schema',
        description: 'The Almoner graph schema including node and edge types',
        mimeType: 'application/json',
      },
      {
        uri: 'almoner://stats',
        name: 'Graph Statistics',
        description: 'Current statistics about the Almoner graph',
        mimeType: 'application/json',
      },
      {
        uri: 'almoner://principles',
        name: 'First Principles',
        description: 'The inviolable first principles of Almoner',
        mimeType: 'text/markdown',
      },
    ];

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { resources },
    };
  }

  /**
   * Handle resources/read request.
   */
  private async handleResourcesRead(request: McpRequest): Promise<McpResponse> {
    const params = request.params as { uri: string };
    const uri = params.uri;

    try {
      let content: string;

      switch (uri) {
        case 'almoner://schema':
          content = JSON.stringify(
            {
              nodes: [
                'Funder',
                'Grant',
                'Scholarship',
                'Org',
                'Person',
                'Site',
                'Project',
                'Contribution',
                'Activity',
                'Output',
                'FocusArea',
              ],
              edges: [
                'OFFERS',
                'FUNDED',
                'FOCUSES_ON',
                'APPLIED_TO',
                'RUNS',
                'LOCATED_AT',
                'SPONSORED_BY',
                'MEMBER_OF',
                'CONTRIBUTED',
                'AT',
                'FOR',
                'ENABLED',
                'CONTRIBUTED_BY',
                'PRODUCED',
                'DISTRIBUTED_TO',
                'INSPIRED',
              ],
            },
            null,
            2
          );
          break;

        case 'almoner://stats':
          const nodeCount = await this.connection.query<{ count: number }>(
            'MATCH (n) RETURN count(n) as count'
          );
          const edgeCount = await this.connection.query<{ count: number }>(
            'MATCH ()-[r]->() RETURN count(r) as count'
          );
          content = JSON.stringify(
            {
              nodes: nodeCount[0]?.count ?? 0,
              edges: edgeCount[0]?.count ?? 0,
            },
            null,
            2
          );
          break;

        case 'almoner://principles':
          content = `# Almoner First Principles

1. **Graph is source of truth.** All entities exist as nodes. All relationships are edges. Nothing exists outside the graph.

2. **Kala is contribution pattern, not currency.** Non-transferable. 50 per hour regardless of role. Records activity, not value judgments.

3. **Ripples, not receipts.** Impact is traced through the graph—upstream attribution, downstream effects. Not isolated metrics.

4. **Agents come later.** Build infrastructure first. Agents without graph are just chatbots.

5. **Offline-first.** Lower Puna has crappy connectivity. Everything must work disconnected and sync when able.

6. **Capture is ritual.** Volunteers actively claim their contribution (tap + photo/video). Not surveillance.`;
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32602, message: `Unknown resource: ${uri}` },
          };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          contents: [{ uri, text: content }],
        },
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

/**
 * Create an MCP Service.
 */
export function createMcpService(
  connection: GraphConnection,
  engines: {
    kala: KalaEngine;
    ripple: RippleEngine;
    matching: MatchingEngine;
    entityResolution: EntityResolutionEngine;
    dataIngestion: DataIngestionEngine;
  }
): McpService {
  return new McpService(connection, engines);
}
