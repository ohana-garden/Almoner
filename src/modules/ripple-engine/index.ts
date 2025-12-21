/**
 * Ripple Engine Module
 *
 * Purpose: Trace impact through graph, generate ripple visualizations
 * Dependencies: Graph Core
 *
 * Knows NOTHING about: Ingestion, matching, capture UI
 *
 * First Principle: Ripples, not receipts.
 * Impact is traced through the graph—upstream attribution, downstream effects.
 * Not isolated metrics.
 *
 * VIOLATION WARNING:
 * - Impact metrics that don't trace through graph relationships → WRONG
 */

import type { GraphConnection } from '../graph-core';

/** A single node in a ripple path */
export interface RippleNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

/** An edge in a ripple path */
export interface RippleEdge {
  type: string;
  properties: Record<string, unknown>;
}

/** A step in the ripple path */
export interface RippleStep {
  from: RippleNode;
  edge: RippleEdge;
  to: RippleNode;
  depth: number;
}

/** Complete ripple trace */
export interface RippleTrace {
  origin: RippleNode;
  paths: RippleStep[][];
  summary: {
    nodesReached: number;
    maxDepth: number;
    nodesByType: Record<string, number>;
  };
}

/** Upstream attribution showing where resources came from */
export interface UpstreamAttribution {
  path: RippleStep[];
  funders: Array<{
    id: string;
    name: string;
    amount?: number;
    date?: Date;
  }>;
  grants: Array<{
    id: string;
    title: string;
  }>;
}

/** Downstream impact showing where resources went */
export interface DownstreamImpact {
  activitiesEnabled: number;
  outputsProduced: number;
  peopleReached: number;
  contributionsInspired: number;
  paths: RippleStep[][];
}

/**
 * Ripple Engine
 *
 * First Principle: Ripples, not receipts.
 * Traces impact through the graph to show upstream attribution
 * and downstream effects.
 */
export class RippleEngine {
  private connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  /**
   * Trace ripples from a starting node in both directions.
   */
  async traceRipples(
    nodeId: string,
    nodeLabel: string,
    options: {
      maxDepth?: number;
      direction?: 'upstream' | 'downstream' | 'both';
    } = {}
  ): Promise<RippleTrace> {
    const { maxDepth = 5, direction = 'both' } = options;

    const origin = await this.getNode(nodeId, nodeLabel);
    if (!origin) {
      throw new Error(`Node not found: ${nodeLabel} ${nodeId}`);
    }

    const paths: RippleStep[][] = [];

    // Trace upstream (incoming edges)
    if (direction === 'upstream' || direction === 'both') {
      const upstreamPaths = await this.traceUpstream(nodeId, nodeLabel, maxDepth);
      paths.push(...upstreamPaths);
    }

    // Trace downstream (outgoing edges)
    if (direction === 'downstream' || direction === 'both') {
      const downstreamPaths = await this.traceDownstream(nodeId, nodeLabel, maxDepth);
      paths.push(...downstreamPaths);
    }

    // Build summary
    const allNodes = new Set<string>();
    const nodesByType: Record<string, Set<string>> = {};
    let maxPathDepth = 0;

    for (const path of paths) {
      for (const step of path) {
        allNodes.add(step.from.id);
        allNodes.add(step.to.id);

        if (!nodesByType[step.from.type]) nodesByType[step.from.type] = new Set();
        if (!nodesByType[step.to.type]) nodesByType[step.to.type] = new Set();

        nodesByType[step.from.type].add(step.from.id);
        nodesByType[step.to.type].add(step.to.id);

        maxPathDepth = Math.max(maxPathDepth, step.depth);
      }
    }

    return {
      origin,
      paths,
      summary: {
        nodesReached: allNodes.size,
        maxDepth: maxPathDepth,
        nodesByType: Object.fromEntries(
          Object.entries(nodesByType).map(([type, ids]) => [type, ids.size])
        ),
      },
    };
  }

  /**
   * Get upstream attribution for a node.
   * Shows funders and grants that enabled this node's existence.
   */
  async getUpstreamAttribution(
    nodeId: string,
    nodeLabel: string
  ): Promise<UpstreamAttribution> {
    // Trace back to find funders
    const cypher = `
      MATCH path = (origin:${nodeLabel} {id: $nodeId})<-[*1..5]-(source)
      WHERE source:Funder OR source:Grant
      UNWIND relationships(path) as rel
      UNWIND nodes(path) as node
      RETURN DISTINCT
        labels(node)[0] as nodeType,
        node.id as nodeId,
        node.name as nodeName,
        node.title as nodeTitle,
        type(rel) as relType,
        rel.amount as relAmount,
        rel.date as relDate
    `;

    const results = await this.connection.query<{
      nodeType: string;
      nodeId: string;
      nodeName?: string;
      nodeTitle?: string;
      relType: string;
      relAmount?: number;
      relDate?: string;
    }>(cypher, { nodeId });

    const funders: UpstreamAttribution['funders'] = [];
    const grants: UpstreamAttribution['grants'] = [];

    for (const row of results) {
      if (row.nodeType === 'Funder' && row.nodeName) {
        funders.push({
          id: row.nodeId,
          name: row.nodeName,
          amount: row.relAmount,
          date: row.relDate ? new Date(row.relDate) : undefined,
        });
      } else if (row.nodeType === 'Grant' && row.nodeTitle) {
        grants.push({
          id: row.nodeId,
          title: row.nodeTitle,
        });
      }
    }

    // Get the full path
    const paths = await this.traceUpstream(nodeId, nodeLabel, 5);

    return {
      path: paths.flat(),
      funders: [...new Map(funders.map((f) => [f.id, f])).values()],
      grants: [...new Map(grants.map((g) => [g.id, g])).values()],
    };
  }

  /**
   * Get downstream impact from a node.
   * Shows activities enabled, outputs produced, and people reached.
   */
  async getDownstreamImpact(
    nodeId: string,
    nodeLabel: string
  ): Promise<DownstreamImpact> {
    // Count downstream impact by type
    const countCypher = `
      MATCH (origin:${nodeLabel} {id: $nodeId})-[*1..5]->(target)
      RETURN
        labels(target)[0] as targetType,
        count(DISTINCT target) as count
    `;

    const countResults = await this.connection.query<{
      targetType: string;
      count: number;
    }>(countCypher, { nodeId });

    const counts: Record<string, number> = {};
    for (const row of countResults) {
      counts[row.targetType] = row.count;
    }

    // Get the full paths
    const paths = await this.traceDownstream(nodeId, nodeLabel, 5);

    return {
      activitiesEnabled: counts['Activity'] || 0,
      outputsProduced: counts['Output'] || 0,
      peopleReached: counts['Person'] || 0,
      contributionsInspired: counts['Contribution'] || 0,
      paths,
    };
  }

  /**
   * Generate a ripple visualization data structure.
   * Returns nodes and edges in a format suitable for graph visualization libraries.
   */
  async generateVisualization(
    nodeId: string,
    nodeLabel: string,
    maxDepth = 3
  ): Promise<{
    nodes: Array<{ id: string; label: string; type: string; depth: number }>;
    edges: Array<{ source: string; target: string; type: string }>;
  }> {
    const trace = await this.traceRipples(nodeId, nodeLabel, {
      maxDepth,
      direction: 'both',
    });

    const nodes = new Map<string, { id: string; label: string; type: string; depth: number }>();
    const edges: Array<{ source: string; target: string; type: string }> = [];

    // Add origin
    nodes.set(trace.origin.id, {
      id: trace.origin.id,
      label: trace.origin.label,
      type: trace.origin.type,
      depth: 0,
    });

    // Add all nodes and edges from paths
    for (const path of trace.paths) {
      for (const step of path) {
        if (!nodes.has(step.from.id)) {
          nodes.set(step.from.id, {
            id: step.from.id,
            label: step.from.label,
            type: step.from.type,
            depth: step.depth,
          });
        }
        if (!nodes.has(step.to.id)) {
          nodes.set(step.to.id, {
            id: step.to.id,
            label: step.to.label,
            type: step.to.type,
            depth: step.depth,
          });
        }

        edges.push({
          source: step.from.id,
          target: step.to.id,
          type: step.edge.type,
        });
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  /**
   * Get impact summary for a grant.
   * Traces how the grant's funding rippled through the system.
   */
  async getGrantImpact(grantId: string): Promise<{
    grant: { id: string; title: string };
    funder: { id: string; name: string } | null;
    impact: DownstreamImpact;
  }> {
    // Get grant details
    const grantCypher = `
      MATCH (g:Grant {id: $grantId})
      OPTIONAL MATCH (f:Funder)-[:OFFERS]->(g)
      RETURN g.title as title, f.id as funderId, f.name as funderName
    `;

    const grantResults = await this.connection.query<{
      title: string;
      funderId?: string;
      funderName?: string;
    }>(grantCypher, { grantId });

    if (grantResults.length === 0) {
      throw new Error(`Grant not found: ${grantId}`);
    }

    const grantData = grantResults[0];

    // Get downstream impact
    const impact = await this.getDownstreamImpact(grantId, 'Grant');

    return {
      grant: { id: grantId, title: grantData.title },
      funder: grantData.funderId
        ? { id: grantData.funderId, name: grantData.funderName! }
        : null,
      impact,
    };
  }

  /**
   * Get impact summary for a funder.
   */
  async getFunderImpact(funderId: string): Promise<{
    funder: { id: string; name: string; totalGiving: number };
    grantsOffered: number;
    orgsSupported: number;
    impact: DownstreamImpact;
  }> {
    // Get funder details and counts
    const funderCypher = `
      MATCH (f:Funder {id: $funderId})
      OPTIONAL MATCH (f)-[:OFFERS]->(g:Grant)
      OPTIONAL MATCH (f)-[:FUNDED]->(o:Org)
      RETURN
        f.name as name,
        f.totalGiving as totalGiving,
        count(DISTINCT g) as grantsOffered,
        count(DISTINCT o) as orgsSupported
    `;

    const funderResults = await this.connection.query<{
      name: string;
      totalGiving: number;
      grantsOffered: number;
      orgsSupported: number;
    }>(funderCypher, { funderId });

    if (funderResults.length === 0) {
      throw new Error(`Funder not found: ${funderId}`);
    }

    const funderData = funderResults[0];

    // Get downstream impact
    const impact = await this.getDownstreamImpact(funderId, 'Funder');

    return {
      funder: {
        id: funderId,
        name: funderData.name,
        totalGiving: funderData.totalGiving || 0,
      },
      grantsOffered: funderData.grantsOffered,
      orgsSupported: funderData.orgsSupported,
      impact,
    };
  }

  /**
   * Trace upstream paths (incoming edges).
   */
  private async traceUpstream(
    nodeId: string,
    nodeLabel: string,
    maxDepth: number
  ): Promise<RippleStep[][]> {
    const cypher = `
      MATCH path = (origin:${nodeLabel} {id: $nodeId})<-[*1..${maxDepth}]-(source)
      RETURN path
      LIMIT 100
    `;

    const results = await this.connection.query<{ path: unknown }>(cypher, { nodeId });

    return this.parsePaths(results.map((r) => r.path), 'upstream');
  }

  /**
   * Trace downstream paths (outgoing edges).
   */
  private async traceDownstream(
    nodeId: string,
    nodeLabel: string,
    maxDepth: number
  ): Promise<RippleStep[][]> {
    const cypher = `
      MATCH path = (origin:${nodeLabel} {id: $nodeId})-[*1..${maxDepth}]->(target)
      RETURN path
      LIMIT 100
    `;

    const results = await this.connection.query<{ path: unknown }>(cypher, { nodeId });

    return this.parsePaths(results.map((r) => r.path), 'downstream');
  }

  /**
   * Get a single node by ID.
   */
  private async getNode(nodeId: string, nodeLabel: string): Promise<RippleNode | null> {
    const cypher = `
      MATCH (n:${nodeLabel} {id: $nodeId})
      RETURN n, labels(n)[0] as nodeType
    `;

    const results = await this.connection.query<{
      n: Record<string, unknown>;
      nodeType: string;
    }>(cypher, { nodeId });

    if (results.length === 0) {
      return null;
    }

    const node = results[0].n;
    return {
      id: node.id as string,
      label: (node.name || node.title || node.id) as string,
      type: results[0].nodeType,
      properties: node,
    };
  }

  /**
   * Parse raw paths from Cypher results.
   * This is a simplified implementation - actual parsing depends on FalkorDB's path format.
   */
  private parsePaths(rawPaths: unknown[], direction: 'upstream' | 'downstream'): RippleStep[][] {
    // Placeholder: In production, parse FalkorDB's path objects
    // Each path contains nodes and relationships
    return [];
  }
}

/**
 * Create a Ripple Engine.
 */
export function createRippleEngine(connection: GraphConnection): RippleEngine {
  return new RippleEngine(connection);
}
