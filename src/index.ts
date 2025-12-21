/**
 * Almoner
 *
 * A graph-native platform facilitating the flow of resources—grants, scholarships—
 * to those who can use them, with impact made visible through contribution patterns.
 *
 * First Principles:
 * 1. Graph is source of truth.
 * 2. Kala is contribution pattern, not currency.
 * 3. Ripples, not receipts.
 * 4. Agents come later.
 * 5. Offline-first.
 * 6. Capture is ritual.
 */

// Types
export * from './types';

// Configuration
export { config, loadConfig } from './config';
export type { AlmonerConfig } from './config';

// Graph Core (Module 1)
export {
  GraphConnection,
  configFromEnv,
  SchemaManager,
  NodeCrud,
  EdgeCrud,
  initGraphCore,
} from './modules/graph-core';

// Entity Resolution (Module 2)
export {
  EntityResolutionEngine,
  createEntityResolutionEngine,
} from './modules/entity-resolution';
export type { MatchConfidence, EntityMatch, ExtractedEntity } from './modules/entity-resolution';

// Data Ingestion (Module 3)
export {
  DataIngestionEngine,
  createDataIngestionEngine,
} from './modules/data-ingestion';
export type {
  IngestionJob,
  IngestionStatus,
  DataSourceType,
  Raw990Record,
  RawGrantRecord,
} from './modules/data-ingestion';

// Kala Engine (Module 4)
export { KalaEngine, createKalaEngine } from './modules/kala-engine';
export type { KalaResult, KalaSummary, KalaByPeriod } from './modules/kala-engine';

// Ripple Engine (Module 5)
export { RippleEngine, createRippleEngine } from './modules/ripple-engine';
export type {
  RippleNode,
  RippleEdge,
  RippleStep,
  RippleTrace,
  UpstreamAttribution,
  DownstreamImpact,
} from './modules/ripple-engine';

// Matching Engine (Module 6)
export { MatchingEngine, createMatchingEngine } from './modules/matching-engine';
export type {
  MatchScore,
  GrantMatch,
  ScholarshipMatch,
  MatchFilters,
} from './modules/matching-engine';

// Capture (Module 7)
export {
  CaptureManager,
  createCaptureManager,
  SyncService,
  createSyncService,
} from './modules/capture';
export type {
  LocalContribution,
  CaptureStatus,
  NfcTapEvent,
  CaptureSession,
  SyncResult,
} from './modules/capture';

// MCP Service (Module 8)
export { McpService, createMcpService } from './modules/mcp-service';
export type {
  McpTool,
  McpResource,
  McpRequest,
  McpResponse,
} from './modules/mcp-service';

// Initialize all modules
import { initGraphCore } from './modules/graph-core';
import { createEntityResolutionEngine } from './modules/entity-resolution';
import { createDataIngestionEngine } from './modules/data-ingestion';
import { createKalaEngine } from './modules/kala-engine';
import { createRippleEngine } from './modules/ripple-engine';
import { createMatchingEngine } from './modules/matching-engine';
import { createMcpService } from './modules/mcp-service';
import { loadConfig } from './config';

/**
 * Initialize the complete Almoner system.
 *
 * Pre-Task Checklist:
 * 1. Which module does this belong to? → System initialization
 * 2. What are that module's dependencies? → All modules
 * 3. Does this implementation honor the First Principles? → Yes
 * 4. Am I introducing any Violations? → No
 * 5. Am I staying within module boundaries? → This is the integration point
 */
export async function initAlmoner() {
  const config = loadConfig();

  // Initialize Graph Core first (Module 1)
  const graphCore = await initGraphCore({
    host: config.falkordb.host,
    port: config.falkordb.port,
    password: config.falkordb.password,
    graphName: config.falkordb.graphName,
  });

  // Initialize Entity Resolution (Module 2)
  const entityResolution = createEntityResolutionEngine(graphCore.connection);

  // Initialize Data Ingestion (Module 3)
  const dataIngestion = createDataIngestionEngine(graphCore.connection, entityResolution);

  // Initialize Kala Engine (Module 4)
  const kalaEngine = createKalaEngine(graphCore.connection);

  // Initialize Ripple Engine (Module 5)
  const rippleEngine = createRippleEngine(graphCore.connection);

  // Initialize Matching Engine (Module 6)
  const matchingEngine = createMatchingEngine(graphCore.connection);

  // Initialize MCP Service (Module 8)
  const mcpService = createMcpService(graphCore.connection, {
    kala: kalaEngine,
    ripple: rippleEngine,
    matching: matchingEngine,
    entityResolution,
    dataIngestion,
  });

  return {
    config,
    graphCore,
    entityResolution,
    dataIngestion,
    kalaEngine,
    rippleEngine,
    matchingEngine,
    mcpService,

    // Convenience accessors
    nodes: graphCore.nodes,
    edges: graphCore.edges,
    connection: graphCore.connection,
    schema: graphCore.schema,
  };
}

export type Almoner = Awaited<ReturnType<typeof initAlmoner>>;
