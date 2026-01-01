import os
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.security import APIKeyHeader
from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.nodes import EpisodeType

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("graphiti-service")

FALKORDB_HOST = os.getenv("FALKORDB_HOST", "falkordb.railway.internal")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6379"))
FALKORDB_PASSWORD = os.getenv("FALKORDB_PASSWORD", "")
FALKORDB_GRAPH = os.getenv("FALKORDB_GRAPH", "telepathy")
API_KEY = os.getenv("GRAPHITI_API_KEY")

graphiti = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global graphiti
    logger.info(f"Connecting to FalkorDB at {FALKORDB_HOST}:{FALKORDB_PORT}")
    driver = FalkorDriver(
        host=FALKORDB_HOST,
        port=FALKORDB_PORT,
        password=FALKORDB_PASSWORD if FALKORDB_PASSWORD else None,
        database=FALKORDB_GRAPH
    )
    graphiti = Graphiti(graph_driver=driver)
    await graphiti.build_indices_and_constraints()
    logger.info("Graphiti connected!")
    yield

app = FastAPI(title="Telepathy Service", lifespan=lifespan)

@app.get("/health")
async def health_check():
    return {"status": "ok", "graphiti_connected": graphiti is not None, "graph": FALKORDB_GRAPH}

@app.post("/episodes")
async def add_episode(data: dict):
    try:
        await graphiti.add_episode(
            name=data.get("name", "episode"),
            episode_body=data.get("content", ""),
            source=EpisodeType.text,
            source_description=data.get("source", "agent"),
            reference_time=datetime.now(),
            group_id=data.get("namespace", "global")
        )
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search(data: dict):
    try:
        results = await graphiti.search(
            query=data.get("query", ""),
            group_ids=data.get("namespaces", ["global"]),
            num_results=data.get("limit", 10)
        )
        return {"results": [{"content": r.fact, "score": r.score} for r in results]}
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
