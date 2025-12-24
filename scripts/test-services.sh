#!/bin/bash
# Test all Almoner services on Railway

echo "=== Testing Almoner Services ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Service URLs
ALMONER_URL="https://almoner-production.up.railway.app"
GRAPHITI_URL="https://graphiti-production-e498.up.railway.app"

echo "1. Testing Graphiti health..."
GRAPHITI_HEALTH=$(curl -s "$GRAPHITI_URL/health")
echo "   Response: $GRAPHITI_HEALTH"
if echo "$GRAPHITI_HEALTH" | grep -q '"graphiti_connected":true'; then
    echo -e "   ${GREEN}✓ Graphiti connected to FalkorDB${NC}"
else
    echo -e "   ${RED}✗ Graphiti NOT connected${NC}"
fi
echo ""

echo "2. Testing Almoner health..."
ALMONER_HEALTH=$(curl -s "$ALMONER_URL/health")
echo "   Response: $ALMONER_HEALTH"
if echo "$ALMONER_HEALTH" | grep -q '"database":"connected"'; then
    echo -e "   ${GREEN}✓ Almoner connected to FalkorDB${NC}"
else
    echo -e "   ${RED}✗ Almoner NOT connected${NC}"
fi
echo ""

echo "3. Testing Almoner graph operations..."
TEST_RESULT=$(curl -s "$ALMONER_URL/test")
echo "   Response: $TEST_RESULT"
if echo "$TEST_RESULT" | grep -q '"success":true'; then
    echo -e "   ${GREEN}✓ Graph operations working${NC}"
else
    echo -e "   ${RED}✗ Graph operations failed${NC}"
fi
echo ""

echo "4. Checking graph stats..."
STATS=$(curl -s "$ALMONER_URL/stats")
echo "   Response: $STATS"
echo ""

echo "5. Checking node counts..."
NODES=$(curl -s "$ALMONER_URL/nodes")
echo "   Response: $NODES"
echo ""

echo "6. Testing Grants.gov ingestion..."
GRANTS_JOB=$(curl -s -X POST "$ALMONER_URL/ingest/grants?keyword=nonprofit")
echo "   Response: $GRANTS_JOB"
if echo "$GRANTS_JOB" | grep -q '"success":true'; then
    echo -e "   ${GREEN}✓ Grants ingestion started${NC}"
else
    echo -e "   ${RED}✗ Grants ingestion failed${NC}"
fi
echo ""

echo "7. Testing 990 ingestion..."
IRS_JOB=$(curl -s -X POST "$ALMONER_URL/ingest/990?year=2023")
echo "   Response: $IRS_JOB"
if echo "$IRS_JOB" | grep -q '"success":true'; then
    echo -e "   ${GREEN}✓ 990 ingestion started${NC}"
else
    echo -e "   ${RED}✗ 990 ingestion failed${NC}"
fi
echo ""

echo "8. Listing ingestion jobs..."
JOBS=$(curl -s "$ALMONER_URL/ingest/jobs")
echo "   Response: $JOBS"
echo ""

echo "=== Tests Complete ==="
