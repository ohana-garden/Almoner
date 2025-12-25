import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  falkorDB: {
    url: process.env.FALKORDB_URL, // Optional
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
    password: process.env.FALKORDB_PASSWORD,
    graphName: process.env.FALKORDB_GRAPH || 'AlmonerGraph',
  },
  graphiti: {
    url: process.env.GRAPHITI_URL || 'http://localhost:8000',
    apiKey: process.env.GRAPHITI_API_KEY
  }
};
