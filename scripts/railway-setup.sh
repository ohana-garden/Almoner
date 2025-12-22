#!/bin/bash
# Railway Project Setup Script
# Uses Railway GraphQL API to configure all services
#
# Prerequisites:
# 1. Get API token from https://railway.com/account/tokens
# 2. Export it: export RAILWAY_API_TOKEN="your-token"
# 3. Run: ./scripts/railway-setup.sh

set -e

API_URL="https://backboard.railway.com/graphql/v2"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Check for required env vars
[[ -z "$RAILWAY_API_TOKEN" ]] && error "RAILWAY_API_TOKEN not set. Get one from https://railway.com/account/tokens"

# GraphQL query helper
gql() {
    local query="$1"
    curl -s -X POST "$API_URL" \
        -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"$query\"}"
}

echo "═══════════════════════════════════════════════════════"
echo "  Railway Project Setup for Almoner"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Get projects
log "Fetching your Railway projects..."
PROJECTS=$(gql "query { me { projects { edges { node { id name } } } } }")
echo "$PROJECTS" | jq -r '.data.me.projects.edges[] | "\(.node.id): \(.node.name)"'
echo ""

read -p "Enter the Project ID for Almoner: " PROJECT_ID
[[ -z "$PROJECT_ID" ]] && error "Project ID required"

# Step 2: Get environments
log "Fetching environments..."
ENVS=$(gql "query { project(id: \\\"$PROJECT_ID\\\") { environments { edges { node { id name } } } } }")
echo "$ENVS" | jq -r '.data.project.environments.edges[] | "\(.node.id): \(.node.name)"'
echo ""

read -p "Enter the Environment ID (usually production): " ENV_ID
[[ -z "$ENV_ID" ]] && error "Environment ID required"

# Step 3: Get services
log "Fetching services..."
SERVICES=$(gql "query { project(id: \\\"$PROJECT_ID\\\") { services { edges { node { id name } } } } }")
echo "$SERVICES" | jq -r '.data.project.services.edges[] | "\(.node.id): \(.node.name)"'
echo ""

read -p "Enter Almoner Service ID: " ALMONER_SERVICE_ID
read -p "Enter Graphiti Service ID: " GRAPHITI_SERVICE_ID
read -p "Enter FalkorDB Service ID: " FALKORDB_SERVICE_ID

# Step 4: Configure Graphiti service source
log "Configuring Graphiti service root directory..."
RESULT=$(gql "mutation { serviceUpdate(id: \\\"$GRAPHITI_SERVICE_ID\\\", input: { rootDirectory: \\\"graphiti-service\\\" }) { id } }")
echo "$RESULT" | jq .

# Step 5: Set environment variables for Almoner
log "Setting Almoner environment variables..."

# FALKORDB_URL
gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$ALMONER_SERVICE_ID\\\", name: \\\"FALKORDB_URL\\\", value: \\\"\\\${{FalkorDB.REDIS_URL}}\\\" }) }" > /dev/null
log "  → FALKORDB_URL"

# FALKORDB_GRAPH
gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$ALMONER_SERVICE_ID\\\", name: \\\"FALKORDB_GRAPH\\\", value: \\\"almoner\\\" }) }" > /dev/null
log "  → FALKORDB_GRAPH"

# GRAPHITI_ENDPOINT
gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$ALMONER_SERVICE_ID\\\", name: \\\"GRAPHITI_ENDPOINT\\\", value: \\\"http://\\\${{graphiti.RAILWAY_PRIVATE_DOMAIN}}:8000\\\" }) }" > /dev/null
log "  → GRAPHITI_ENDPOINT"

# Step 6: Set environment variables for Graphiti
log "Setting Graphiti environment variables..."

# FALKORDB_URL
gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$GRAPHITI_SERVICE_ID\\\", name: \\\"FALKORDB_URL\\\", value: \\\"\\\${{FalkorDB.REDIS_URL}}\\\" }) }" > /dev/null
log "  → FALKORDB_URL"

# FALKORDB_GRAPH
gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$GRAPHITI_SERVICE_ID\\\", name: \\\"FALKORDB_GRAPH\\\", value: \\\"almoner\\\" }) }" > /dev/null
log "  → FALKORDB_GRAPH"

# OpenAI key
read -sp "Enter your OpenAI API Key: " OPENAI_KEY
echo ""
gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$GRAPHITI_SERVICE_ID\\\", name: \\\"OPENAI_API_KEY\\\", value: \\\"$OPENAI_KEY\\\" }) }" > /dev/null
log "  → OPENAI_API_KEY"

# Step 7: Trigger redeploy
log "Triggering redeploys..."
gql "mutation { serviceInstanceRedeploy(environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$ALMONER_SERVICE_ID\\\") }" > /dev/null
log "  → Almoner redeploying"

gql "mutation { serviceInstanceRedeploy(environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$GRAPHITI_SERVICE_ID\\\") }" > /dev/null
log "  → Graphiti redeploying"

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Services will redeploy automatically. Check status at:"
echo "  https://railway.com/project/$PROJECT_ID"
echo ""
