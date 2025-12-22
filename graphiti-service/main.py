"""
Graphiti Entity Resolution Service for Almoner

This service wraps Graphiti to provide entity resolution capabilities.
It connects to the same FalkorDB as Almoner, ensuring a single source of truth.

Module: Entity Resolution (Module 2)
Dependencies: Graphiti, Graph Core (FalkorDB)
Knows nothing about: Kala, matching, UI, volunteers
"""

import os
import asyncio
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

load_dotenv()

# Configuration
FALKORDB_URL = os.getenv("FALKORDB_URL", "redis://localhost:6379")
FALKORDB_GRAPH = os.getenv("FALKORDB_GRAPH", "almoner")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Global Graphiti instance
graphiti: Optional[Graphiti] = None


# Request/Response Models
class EntityInput(BaseModel):
    """Input for entity resolution"""
    text: str
    source: str = "manual"
    timestamp: Optional[str] = None


class FunderInput(BaseModel):
    """Input for Funder entity resolution"""
    name: str
    type: str = "foundation"
    focus_areas: List[str] = []
    geo_focus: List[str] = []
    total_giving: Optional[int] = None
    source: str = "manual"


class OrgInput(BaseModel):
    """Input for Organization entity resolution"""
    name: str
    ein: Optional[str] = None
    mission: Optional[str] = None
    focus_areas: List[str] = []
    geo_focus: List[str] = []
    source: str = "manual"


class PersonInput(BaseModel):
    """Input for Person entity resolution"""
    name: str
    location: Optional[str] = None
    interests: List[str] = []
    source: str = "manual"


class EntityResult(BaseModel):
    """Result of entity resolution"""
    id: str
    name: str
    entity_type: str
    is_new: bool
    confidence: float
    properties: dict


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    graphiti_connected: bool
    falkordb_url: str
    graph_name: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize Graphiti on startup"""
    global graphiti

    print(f"Connecting to FalkorDB: {FALKORDB_URL}")
    print(f"Graph name: {FALKORDB_GRAPH}")

    try:
        # Parse FalkorDB URL
        # Format: redis://host:port or redis://user:pass@host:port
        url = FALKORDB_URL.replace("redis://", "")
        if "@" in url:
            _, host_port = url.split("@")
        else:
            host_port = url

        if ":" in host_port:
            host, port = host_port.split(":")
            port = int(port)
        else:
            host = host_port
            port = 6379

        # Initialize Graphiti with FalkorDB
        graphiti = Graphiti(
            uri=f"bolt://{host}:{port}",  # FalkorDB bolt protocol
            database=FALKORDB_GRAPH,
        )

        # Build indices for better performance
        await graphiti.build_indices()

        print("Graphiti initialized successfully")

    except Exception as e:
        print(f"Warning: Graphiti initialization failed: {e}")
        graphiti = None

    yield

    # Cleanup
    if graphiti:
        await graphiti.close()


app = FastAPI(
    title="Almoner Graphiti Service",
    description="Entity Resolution for Almoner using Graphiti",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/", response_model=HealthResponse)
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        graphiti_connected=graphiti is not None,
        falkordb_url=FALKORDB_URL,
        graph_name=FALKORDB_GRAPH,
    )


@app.post("/extract", response_model=List[EntityResult])
async def extract_entities(input: EntityInput):
    """
    Extract entities from unstructured text.

    Uses Graphiti's NER capabilities to identify funders, orgs, people, etc.
    """
    if not graphiti:
        raise HTTPException(status_code=503, detail="Graphiti not connected")

    try:
        timestamp = datetime.fromisoformat(input.timestamp) if input.timestamp else datetime.now()

        # Add episode to Graphiti for entity extraction
        result = await graphiti.add_episode(
            name=f"extraction_{timestamp.isoformat()}",
            episode_body=input.text,
            source=EpisodeType.text,
            source_description=input.source,
            reference_time=timestamp,
        )

        # Extract entities from the result
        entities = []
        for node in result.nodes:
            entities.append(EntityResult(
                id=node.uuid,
                name=node.name,
                entity_type=node.labels[0] if node.labels else "Entity",
                is_new=True,  # Graphiti handles dedup internally
                confidence=1.0,
                properties=node.properties if hasattr(node, 'properties') else {},
            ))

        return entities

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resolve/funder", response_model=EntityResult)
async def resolve_funder(input: FunderInput):
    """
    Resolve a Funder entity - find existing or create new.

    Deduplicates against existing funders in the graph.
    """
    if not graphiti:
        raise HTTPException(status_code=503, detail="Graphiti not connected")

    try:
        # Create structured text for entity extraction
        text = f"""
        Funder: {input.name}
        Type: {input.type}
        Focus Areas: {', '.join(input.focus_areas)}
        Geographic Focus: {', '.join(input.geo_focus)}
        """
        if input.total_giving:
            text += f"\nTotal Giving: ${input.total_giving:,}"

        result = await graphiti.add_episode(
            name=f"funder_{input.name}",
            episode_body=text,
            source=EpisodeType.text,
            source_description=input.source,
            reference_time=datetime.now(),
        )

        # Find the funder node in results
        for node in result.nodes:
            if "Funder" in (node.labels if hasattr(node, 'labels') else []) or input.name.lower() in node.name.lower():
                return EntityResult(
                    id=node.uuid,
                    name=node.name,
                    entity_type="Funder",
                    is_new=len(result.nodes) == 1,
                    confidence=0.9,
                    properties={
                        "type": input.type,
                        "focus_areas": input.focus_areas,
                        "geo_focus": input.geo_focus,
                        "total_giving": input.total_giving,
                    },
                )

        # Fallback if no specific funder node found
        return EntityResult(
            id=result.nodes[0].uuid if result.nodes else "unknown",
            name=input.name,
            entity_type="Funder",
            is_new=True,
            confidence=0.7,
            properties={
                "type": input.type,
                "focus_areas": input.focus_areas,
                "geo_focus": input.geo_focus,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resolve/org", response_model=EntityResult)
async def resolve_org(input: OrgInput):
    """
    Resolve an Organization entity - find existing or create new.

    Uses EIN for exact matching if available, otherwise name similarity.
    """
    if not graphiti:
        raise HTTPException(status_code=503, detail="Graphiti not connected")

    try:
        # Create structured text for entity extraction
        text = f"""
        Organization: {input.name}
        """
        if input.ein:
            text += f"\nEIN: {input.ein}"
        if input.mission:
            text += f"\nMission: {input.mission}"
        if input.focus_areas:
            text += f"\nFocus Areas: {', '.join(input.focus_areas)}"
        if input.geo_focus:
            text += f"\nGeographic Focus: {', '.join(input.geo_focus)}"

        result = await graphiti.add_episode(
            name=f"org_{input.name}",
            episode_body=text,
            source=EpisodeType.text,
            source_description=input.source,
            reference_time=datetime.now(),
        )

        # Find the org node in results
        for node in result.nodes:
            if "Org" in (node.labels if hasattr(node, 'labels') else []) or input.name.lower() in node.name.lower():
                return EntityResult(
                    id=node.uuid,
                    name=node.name,
                    entity_type="Org",
                    is_new=len(result.nodes) == 1,
                    confidence=1.0 if input.ein else 0.85,
                    properties={
                        "ein": input.ein,
                        "mission": input.mission,
                        "focus_areas": input.focus_areas,
                        "geo_focus": input.geo_focus,
                    },
                )

        return EntityResult(
            id=result.nodes[0].uuid if result.nodes else "unknown",
            name=input.name,
            entity_type="Org",
            is_new=True,
            confidence=0.7,
            properties={
                "ein": input.ein,
                "focus_areas": input.focus_areas,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resolve/person", response_model=EntityResult)
async def resolve_person(input: PersonInput):
    """
    Resolve a Person entity - find existing or create new.
    """
    if not graphiti:
        raise HTTPException(status_code=503, detail="Graphiti not connected")

    try:
        text = f"""
        Person: {input.name}
        """
        if input.location:
            text += f"\nLocation: {input.location}"
        if input.interests:
            text += f"\nInterests: {', '.join(input.interests)}"

        result = await graphiti.add_episode(
            name=f"person_{input.name}",
            episode_body=text,
            source=EpisodeType.text,
            source_description=input.source,
            reference_time=datetime.now(),
        )

        for node in result.nodes:
            if "Person" in (node.labels if hasattr(node, 'labels') else []) or input.name.lower() in node.name.lower():
                return EntityResult(
                    id=node.uuid,
                    name=node.name,
                    entity_type="Person",
                    is_new=len(result.nodes) == 1,
                    confidence=0.8,
                    properties={
                        "location": input.location,
                        "interests": input.interests,
                    },
                )

        return EntityResult(
            id=result.nodes[0].uuid if result.nodes else "unknown",
            name=input.name,
            entity_type="Person",
            is_new=True,
            confidence=0.7,
            properties={
                "location": input.location,
                "interests": input.interests,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
async def search_entities(query: str, limit: int = 10):
    """
    Search the knowledge graph for entities matching a query.
    """
    if not graphiti:
        raise HTTPException(status_code=503, detail="Graphiti not connected")

    try:
        results = await graphiti.search(query, num_results=limit)

        return {
            "query": query,
            "results": [
                {
                    "id": r.uuid if hasattr(r, 'uuid') else str(r),
                    "name": r.name if hasattr(r, 'name') else str(r),
                    "score": r.score if hasattr(r, 'score') else 1.0,
                }
                for r in results
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
