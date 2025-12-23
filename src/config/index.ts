/**
 * Almoner Configuration
 *
 * Loads configuration from environment variables.
 */

export interface AlmonerConfig {
  /** FalkorDB connection settings */
  falkordb: {
    host: string;
    port: number;
    password?: string;
    graphName: string;
  };

  /** Graphiti settings for Entity Resolution */
  graphiti: {
    endpoint: string;
    apiKey: string;
  };

  /** Data source settings */
  dataSources: {
    irs990BulkDataPath?: string;
    grantsGovApiKey?: string;
  };

  /** MCP Service settings */
  mcp: {
    port: number;
    host: string;
  };

  /** Environment */
  env: 'development' | 'production' | 'test';
}

/**
 * Load configuration from environment variables.
 */
export function loadConfig(): AlmonerConfig {
  return {
    falkordb: {
      host: process.env.FALKORDB_HOST || 'localhost',
      port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
      password: process.env.FALKORDB_PASSWORD || undefined,
      graphName: process.env.FALKORDB_GRAPH || 'almoner',
    },
    graphiti: {
      endpoint: process.env.GRAPHITI_ENDPOINT || '',
      apiKey: process.env.GRAPHITI_API_KEY || '',
    },
    dataSources: {
      irs990BulkDataPath: process.env.IRS_990_BULK_DATA_PATH,
      grantsGovApiKey: process.env.GRANTS_GOV_API_KEY,
    },
    mcp: {
      port: parseInt(process.env.MCP_PORT || '3000', 10),
      host: process.env.MCP_HOST || '0.0.0.0',
    },
    env: (process.env.NODE_ENV as AlmonerConfig['env']) || 'development',
  };
}

/** Current configuration (lazy loaded) */
let _config: AlmonerConfig | null = null;

/**
 * Get the current configuration.
 * Loads from environment on first access.
 */
export function getConfig(): AlmonerConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/** Alias for backwards compatibility */
export const config = {
  get falkordb() { return getConfig().falkordb; },
  get graphiti() { return getConfig().graphiti; },
  get dataSources() { return getConfig().dataSources; },
  get mcp() { return getConfig().mcp; },
  get env() { return getConfig().env; },
};
