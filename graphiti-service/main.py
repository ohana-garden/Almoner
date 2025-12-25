import os
import logging
from urllib.parse import urlparse
from fastapi import FastAPI, Request, HTTPException, Security
from fastapi.security import APIKeyHeader
from graphiti_core import Graphiti
from graphiti_core.nodes import EntityNode, EpisodeNode

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("graphiti-service")

app = FastAPI(title="Almoner Graphiti Service")

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------
FALKORDB_URL = os.getenv("FALKORDB_URL", "redis://localhost:6379")
FALKORDB_GRAPH = os.getenv("FALKORDB_GRAPH", "AlmonerGraph")
API_KEY = os.getenv("GRAPHITI_API_KEY")

# ---------------------------------------------------------
# CONNECTION LOGIC
# ---------------------------------------------------------
def get_connection_params(url_str):
    """
    Robust parsing for Redis/FalkorDB URLs.
    Handles: redis://:pass@host:port or falkor://user:pass@host:port
    """
    try:
        parsed = urlparse(url_str)
        return {
            "host": parsed.hostname or "localhost",
            "port": parsed.port or 6379,
            "password": parsed.password, # Can be None
            "username": parsed.username  # Can be None
        }
    except Exception as e:
        logger.error(f"Failed to parse URL: {e}")
        return {"host": "localhost", "port": 6379}

# Initialize Client
# Note: Actual Graphiti init depends on library version. 
# We assume it takes host/port/credentials or a client.
conn_params = get_connection_params(FALKORDB_URL)
logger.info(f"Connecting to Graphiti at {conn_params['host']}:{conn_params['port']}...")

# We initialize Graphiti with the specific graph name
client = Graphiti(
    host=conn_params['host'],
    port=conn_params['port'],
    password=conn_params['password'],
    username=conn_params['username'],
    graph_name=FALKORDB_GRAPH
)

# ---------------------------------------------------------
# SECURITY MIDDLEWARE
# ---------------------------------------------------------
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(request: Request):
    if not API_KEY:
        return # Auth disabled if no key set (Dev mode)
    
    # Allow Health Checks without Auth
    if request.url.path == "/health":
        return

    client_key = request.headers.get("X-API-Key")
    if client_key != API_KEY:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=403, detail="Invalid API Key")

# ---------------------------------------------------------
# ROUTES
# ---------------------------------------------------------

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    try:
        await verify_api_key(request)
    except HTTPException as exc:
        return exc
    response = await call_next(request)
    return response

@app.get("/health")
async def health_check():
    return {"status": "ok", "graph": FALKORDB_GRAPH}

@app.post("/episodes")
async def add_episode(data: dict):
    """
    Add a new episode to the graph.
    """
    try:
        # Pass data to Graphiti library
        # This is a placeholder for the actual library call
        await client.add_episode(
            name=data.get("name"),
            description=data.get("description"),
            created_at=data.get("created_at"),
            source=data.get("source"),
            source_url=data.get("source_url")
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error adding episode: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
async def search(query: str):
    results = await client.search(query)
    return {"results": results}
