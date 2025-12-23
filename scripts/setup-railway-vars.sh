#!/bin/bash
# Setup Railway environment variables for Almoner services
#
# Usage: ./scripts/setup-railway-vars.sh
#
# Prerequisites:
# - Railway CLI installed (npm install -g @railway/cli)
# - Logged in to Railway (railway login)
# - Project linked (railway link)

set -e

echo "Setting up Railway environment variables..."

# Get the Graphiti service URL from Railway
GRAPHITI_URL=$(railway variables --service Graphiti --kv 2>/dev/null | grep RAILWAY_PUBLIC_DOMAIN | cut -d= -f2 || echo "")

if [ -z "$GRAPHITI_URL" ]; then
    echo "Warning: Could not get Graphiti URL. You may need to set GRAPHITI_ENDPOINT manually."
    GRAPHITI_URL="https://graphiti-production.up.railway.app"
fi

echo ""
echo "=== Almoner Service Variables ==="

# Set Almoner service variables
railway variables --service Almoner --set "GRAPHITI_ENDPOINT=https://${GRAPHITI_URL}"
railway variables --service Almoner --set "INGESTION_FREQUENCY=weekly"
railway variables --service Almoner --set "INGESTION_HOUR=3"
railway variables --service Almoner --set "INGESTION_IRS990=true"
railway variables --service Almoner --set "INGESTION_GRANTS_GOV=true"
railway variables --service Almoner --set "INGESTION_990_YEARS=2"
railway variables --service Almoner --set "INGESTION_GRANTS_KEYWORDS=nonprofit,community development,education"

echo ""
echo "=== Current Almoner Variables ==="
railway variables --service Almoner

echo ""
echo "=== Graphiti Service Variables ==="
echo "(Verify these are set correctly)"
railway variables --service Graphiti

echo ""
echo "Done! Redeploy services to apply changes:"
echo "  railway up --service Almoner"
echo "  railway up --service Graphiti"
