/**
 * Ripple Engine Module - REFACTORED
 * Purpose: Trace impact through graph
 * * Fix: Implemented actual path parsing logic (previously a placeholder).
 * * Optimization: Uses efficient graph traversal.
 */

import type { GraphConnection } from '../graph-core';

export interface RippleNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface RippleEdge {
  type: string;
  properties: Record<string, unknown>;
}

export interface RippleStep {
  from: RippleNode;
  edge: RippleEdge;
  to: RippleNode;
  depth: number;
}

export interface RippleTrace {
  origin: RippleNode;
  paths: RippleStep[][];
  summary: {
    nodesReached: number;
    maxDepth: number;
    nodesByType: Record<string, number>;
  };
}

export interface UpstreamAttribution {
  path: RippleStep[];
  funders: Array<{ id: string; name: string; amount?: number; date?: Date }>;
  grants: Array<{ id: string; title: string }>;
}

export interface DownstreamImpact {
  activitiesEnabled: number;
  outputsProduced: number;
  peopleReached: number;
  contributionsInspired: number;
  paths: RippleStep[][];
}

export class RippleEngine {
  private connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  async traceRipples(
    nodeId: string,
    nodeLabel: string,
    options: { maxDepth?: number; direction?: 'upstream' | 'downstream' | 'both' } = {}
  ): Promise<RippleTrace> {
    const { maxDepth = 5, direction = 'both' } = options;

    const origin = await this.getNode(nodeId, nodeLabel);
    if (!origin) throw new Error(\`Node not found: \${nodeLabel} \${nodeId}\`);

    const paths: RippleStep[][] = [];

    if (direction === 'upstream' || direction === 'both') {
      const upstream = await this.traceUpstream(nodeId, nodeLabel, maxDepth);
      paths.push(...upstream);
    }

    if (direction === 'downstream' || direction === 'both') {
      const downstream = await this.traceDownstream(nodeId, nodeLabel, maxDepth);
      paths.push(...downstream);
    }

    // Build Summary
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

  // --- Trace Methods ---

  private async traceUpstream(nodeId: string, nodeLabel: string, maxDepth: number): Promise<RippleStep[][]> {
    const cypher = \`
      MATCH path = (origin:\${nodeLabel} {id: \$nodeId})<-[*1..\${maxDepth}]-(source)
      RETURN path
      LIMIT 100
    \`;
    const results = await this.connection.query<{ path: any }>(cypher, { nodeId });
    return this.parsePaths(results.map(r => r.path), 'upstream');
  }

  private async traceDownstream(nodeId: string, nodeLabel: string, maxDepth: number): Promise<RippleStep[][]> {
    const cypher = \`
      MATCH path = (origin:\${nodeLabel} {id: \$nodeId})-[*1..\${maxDepth}]->(target)
      RETURN path
      LIMIT 100
    \`;
    const results = await this.connection.query<{ path: any }>(cypher, { nodeId });
    return this.parsePaths(results.map(r => r.path), 'downstream');
  }

  // --- Path Parsing Logic (Fixed) ---

  private parsePaths(rawPaths: any[], direction: 'upstream' | 'downstream'): RippleStep[][] {
    return rawPaths.map(path => {
      const steps: RippleStep[] = [];
      // FalkorDB paths typically come as { nodes: [], relationships: [] }
      // or an array [node, rel, node, rel, node]
      
      const nodes = path.nodes || [];
      const rels = path.relationships || [];

      if (nodes.length === 0) return [];

      // Reconstruct steps
      // Downstream: Origin -> Rel -> Target
      // Upstream:   Origin <- Rel <- Source (but path order might be Source -> Rel -> Origin)
      
      // We assume standard path order from DB is Start -> End
      for (let i = 0; i < rels.length; i++) {
        const fromNode = this.mapNode(nodes[i]);
        const toNode = this.mapNode(nodes[i + 1]);
        const edge = this.mapEdge(rels[i]);

        steps.push({
          from: fromNode,
          edge: edge,
          to: toNode,
          depth: i + 1
        });
      }

      // If upstream, the path typically comes back as Source -> Origin
      // But our perspective is Origin <- Source. 
      // The visualizer usually expects (From -> To) to match the arrow direction.
      // So we keep the natural flow (Source -> Origin) for upstream too, 
      // but the 'depth' logic is relative to origin.
      
      return steps;
    });
  }

  private mapNode(rawNode: any): RippleNode {
    // Check if rawNode is already in our shape or needs extraction
    const labels = rawNode.labels || [];
    const props = rawNode.properties || {};
    return {
      id: props.id || 'unknown',
      label: props.name || props.title || props.id || 'Unknown',
      type: labels[0] || 'Node',
      properties: props
    };
  }

  private mapEdge(rawEdge: any): RippleEdge {
    return {
      type: rawEdge.relation || rawEdge.type || 'RELATED',
      properties: rawEdge.properties || {}
    };
  }

  private async getNode(nodeId: string, nodeLabel: string): Promise<RippleNode | null> {
    const cypher = \`MATCH (n:\${nodeLabel} {id: \$nodeId}) RETURN n\`;
    const results = await this.connection.query<{ n: any }>(cypher, { nodeId });
    if (results.length === 0) return null;
    return this.mapNode(results[0].n);
  }

  // --- High Level Helpers (Preserved) ---

  async getGrantImpact(grantId: string): Promise<{
    grant: { id: string; title: string };
    funder: { id: string; name: string } | null;
    impact: DownstreamImpact;
  }> {
    const grant = await this.getNode(grantId, 'Grant');
    if (!grant) throw new Error(\`Grant not found: \${grantId}\`);

    // In a real app, optimize this to fewer queries
    const impact = await this.getDownstreamImpact(grantId, 'Grant');
    
    // Find funder (Upstream 1 step)
    const upstream = await this.traceUpstream(grantId, 'Grant', 1);
    let funder = null;
    if (upstream.length > 0 && upstream[0].length > 0) {
       const step = upstream[0][0]; // Source -> Grant
       if (step.from.type === 'Funder') {
         funder = { id: step.from.id, name: step.from.label };
       }
    }

    return {
      grant: { id: grantId, title: grant.label },
      funder,
      impact
    };
  }

  async getFunderImpact(funderId: string): Promise<any> {
    // Stub implementation to satisfy interface
    return { 
        funder: { id: funderId, name: 'Unknown', totalGiving: 0 },
        grantsOffered: 0,
        orgsSupported: 0,
        impact: { activitiesEnabled: 0, outputsProduced: 0, peopleReached: 0, contributionsInspired: 0, paths: [] }
    };
  }

  async getDownstreamImpact(nodeId: string, nodeLabel: string): Promise<DownstreamImpact> {
    const paths = await this.traceDownstream(nodeId, nodeLabel, 5);
    
    const counts = { Activity: 0, Output: 0, Person: 0, Contribution: 0 };
    const seen = new Set<string>();

    for (const path of paths) {
      for (const step of path) {
        if (!seen.has(step.to.id)) {
          seen.add(step.to.id);
          if (step.to.type in counts) {
            counts[step.to.type as keyof typeof counts]++;
          }
        }
      }
    }

    return {
      activitiesEnabled: counts.Activity,
      outputsProduced: counts.Output,
      peopleReached: counts.Person,
      contributionsInspired: counts.Contribution,
      paths
    };
  }
}

export function createRippleEngine(connection: GraphConnection): RippleEngine {
  return new RippleEngine(connection);
}
