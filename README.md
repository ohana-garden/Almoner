# Almoner: Opportunity Hunter Platform

Almoner is a graph-based agentic platform that hunts for opportunities (grants, scholarships, jobs) and matches them to users. It uses **FalkorDB** as the system of record and **Agent Zero** as the control plane.

## 🏗️ Architecture

| Component | Tech | Purpose |
|---|---|---|
| **Data Plane** | FalkorDB + Graphiti | Stores the Knowledge Graph (Nodes + Vectors). |
| **Ingestion Plane** | Node.js + Cron | Deterministically fetches data from Grants.gov, etc. |
| **Control Plane** | Agent Zero | AI Agent that orchestrates repairs and high-level logic. |
| **Interface** | MCP (Model Context Protocol) | Standardized API for Agents to talk to the Graph. |

## 🚀 Getting Started

### 1. Environment Setup
Copy \`.env.example\` to \`.env\`:
\`\`\`bash
FALKORDB_URL=redis://localhost:6379
FALKORDB_GRAPH=AlmonerGraph
GRAPHITI_API_KEY=dev_key_123
\`\`\`

### 2. Run Infrastructure (Docker)
\`\`\`bash
docker run -d -p 6379:6379 --name falkordb falkordb/falkordb:latest
\`\`\`

### 3. Initialize Schema (Crucial!)
Sets up Indexes and Unique Constraints.
\`\`\`bash
npm run schema:init
\`\`\`

### 4. Start Server
\`\`\`bash
npm run build
npm start
\`\`\`

## 🛠️ Key Scripts

- \`npm run schema:init\` : Idempotent schema setup (safe to run anytime).
- \`npm run migrate:arrays\` : Fixes legacy data where arrays were stored as strings.
- \`npm test\` : Runs connection and logic tests.

## 🔌 MCP Integration
Agent Zero can connect to this server via:
- **URL:** \`http://your-server-url/mcp\`
- **Tools:**
  - \`grants_gov_search\`: Deterministic search of federal grants.
  - \`match_grants_for_org\`: AI matching logic.

