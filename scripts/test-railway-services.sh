#!/bin/bash
# Test Railway Services - Self-executing with timeout handling
# Usage: ./scripts/test-railway-services.sh

set -e

BASE_URL="https://almoner-production.up.railway.app"
TIMEOUT=15
LOG_FILE="/tmp/almoner-test-$(date +%Y%m%d-%H%M%S).log"

echo "=== Almoner Railway Services Test ===" | tee "$LOG_FILE"
echo "Timestamp: $(date)" | tee -a "$LOG_FILE"
echo "Base URL: $BASE_URL" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Function to run a test with timeout
run_test() {
    local name="$1"
    local method="$2"
    local endpoint="$3"

    echo "--- Test: $name ---" | tee -a "$LOG_FILE"
    echo "Request: $method $endpoint" | tee -a "$LOG_FILE"

    local start_time=$(date +%s)
    local response=""
    local status=0

    if [ "$method" = "GET" ]; then
        response=$(timeout $TIMEOUT curl -s -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL$endpoint" 2>&1) || status=$?
    else
        response=$(timeout $TIMEOUT curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL$endpoint" 2>&1) || status=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $status -eq 124 ]; then
        echo "Result: TIMEOUT after ${TIMEOUT}s" | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
        return 1
    elif [ $status -ne 0 ]; then
        echo "Result: ERROR (exit code: $status)" | tee -a "$LOG_FILE"
        echo "Response: $response" | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
        return 1
    fi

    # Extract HTTP status and body
    local http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    local body=$(echo "$response" | sed '/HTTP_STATUS:/d')

    echo "HTTP Status: $http_status" | tee -a "$LOG_FILE"
    echo "Duration: ${duration}s" | tee -a "$LOG_FILE"
    echo "Response: $body" | tee -a "$LOG_FILE"

    # Check for success
    if [[ "$http_status" =~ ^2 ]]; then
        echo "Result: PASS ✓" | tee -a "$LOG_FILE"
    else
        echo "Result: FAIL ✗" | tee -a "$LOG_FILE"
    fi

    echo "" | tee -a "$LOG_FILE"

    # Return the body for further processing
    echo "$body"
}

# Track results
PASSED=0
FAILED=0

test_and_count() {
    local name="$1"
    local method="$2"
    local endpoint="$3"

    if run_test "$name" "$method" "$endpoint" > /dev/null 2>&1; then
        ((PASSED++)) || true
    else
        ((FAILED++)) || true
    fi
}

echo "=== Running Tests ===" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Test 1: Health Check
echo "1. Health Check" | tee -a "$LOG_FILE"
HEALTH=$(run_test "Health Check" "GET" "/health")
if echo "$HEALTH" | grep -q '"database":"connected"'; then
    echo "   Database: CONNECTED ✓" | tee -a "$LOG_FILE"
    ((PASSED++)) || true
else
    echo "   Database: DISCONNECTED ✗" | tee -a "$LOG_FILE"
    ((FAILED++)) || true
fi
echo "" | tee -a "$LOG_FILE"

# Test 2: Graph Stats
echo "2. Graph Stats" | tee -a "$LOG_FILE"
STATS=$(run_test "Graph Stats" "GET" "/stats")
if echo "$STATS" | grep -q '"nodes"'; then
    NODES=$(echo "$STATS" | grep -o '"nodes":[0-9]*' | cut -d: -f2)
    EDGES=$(echo "$STATS" | grep -o '"edges":[0-9]*' | cut -d: -f2)
    echo "   Nodes: $NODES, Edges: $EDGES" | tee -a "$LOG_FILE"
    ((PASSED++)) || true
else
    ((FAILED++)) || true
fi
echo "" | tee -a "$LOG_FILE"

# Test 3: Node Counts
echo "3. Node Counts" | tee -a "$LOG_FILE"
NODES_RESULT=$(run_test "Node Counts" "GET" "/nodes")
if echo "$NODES_RESULT" | grep -q '"Funder"'; then
    echo "   Entity types found ✓" | tee -a "$LOG_FILE"
    ((PASSED++)) || true
else
    ((FAILED++)) || true
fi
echo "" | tee -a "$LOG_FILE"

# Test 4: Connection Test
echo "4. Connection Test" | tee -a "$LOG_FILE"
TEST_RESULT=$(run_test "Connection Test" "GET" "/test")
if echo "$TEST_RESULT" | grep -q '"success":true'; then
    echo "   Graph operations working ✓" | tee -a "$LOG_FILE"
    ((PASSED++)) || true
else
    ((FAILED++)) || true
fi
echo "" | tee -a "$LOG_FILE"

# Test 5: Grants Ingestion
echo "5. Grants.gov Ingestion" | tee -a "$LOG_FILE"
INGEST_RESULT=$(run_test "Grants Ingestion" "POST" "/ingest/grants?keyword=nonprofit")
JOB_ID=""
if echo "$INGEST_RESULT" | grep -q '"jobId"'; then
    JOB_ID=$(echo "$INGEST_RESULT" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
    echo "   Job started: $JOB_ID ✓" | tee -a "$LOG_FILE"
    ((PASSED++)) || true
else
    echo "   Failed to start job ✗" | tee -a "$LOG_FILE"
    ((FAILED++)) || true
fi
echo "" | tee -a "$LOG_FILE"

# Test 6: Wait and check job status
if [ -n "$JOB_ID" ]; then
    echo "6. Checking Job Status (waiting 5s)..." | tee -a "$LOG_FILE"
    sleep 5
    STATUS_RESULT=$(run_test "Job Status" "GET" "/ingest/status/$JOB_ID")

    JOB_STATUS=$(echo "$STATUS_RESULT" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    RECORDS=$(echo "$STATUS_RESULT" | grep -o '"recordsProcessed":[0-9]*' | cut -d: -f2)
    ERRORS=$(echo "$STATUS_RESULT" | grep -o '"totalErrors":[0-9]*' | cut -d: -f2)

    echo "   Job Status: $JOB_STATUS" | tee -a "$LOG_FILE"
    echo "   Records Processed: $RECORDS" | tee -a "$LOG_FILE"
    echo "   Total Errors: $ERRORS" | tee -a "$LOG_FILE"

    if [ "$JOB_STATUS" = "completed" ] || [ "$JOB_STATUS" = "running" ]; then
        ((PASSED++)) || true
    else
        # Log the errors if failed
        if echo "$STATUS_RESULT" | grep -q '"errors":\['; then
            ERROR_MSG=$(echo "$STATUS_RESULT" | grep -o '"errors":\[[^]]*\]')
            echo "   Error details: $ERROR_MSG" | tee -a "$LOG_FILE"
        fi
        ((FAILED++)) || true
    fi
    echo "" | tee -a "$LOG_FILE"
fi

# Test 7: List Jobs
echo "7. List Ingestion Jobs" | tee -a "$LOG_FILE"
JOBS_RESULT=$(run_test "List Jobs" "GET" "/ingest/jobs")
if echo "$JOBS_RESULT" | grep -q '"jobs"'; then
    JOB_COUNT=$(echo "$JOBS_RESULT" | grep -o '"id"' | wc -l)
    echo "   Active jobs: $JOB_COUNT" | tee -a "$LOG_FILE"
    ((PASSED++)) || true
else
    ((FAILED++)) || true
fi
echo "" | tee -a "$LOG_FILE"

# Summary
echo "=== Test Summary ===" | tee -a "$LOG_FILE"
echo "Passed: $PASSED" | tee -a "$LOG_FILE"
echo "Failed: $FAILED" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [ $FAILED -eq 0 ]; then
    echo "All tests passed! ✓" | tee -a "$LOG_FILE"
    exit 0
else
    echo "Some tests failed. Check log for details." | tee -a "$LOG_FILE"
    exit 1
fi
