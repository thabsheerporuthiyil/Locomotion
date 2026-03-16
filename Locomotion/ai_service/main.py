from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer

from langchain_google_genai import ChatGoogleGenerativeAI
import re

app = FastAPI(title="Locomotion AI Matchmaker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
QDRANT_HOST = os.environ.get("QDRANT_HOST", "qdrant")
QDRANT_PORT = int(os.environ.get("QDRANT_PORT", 6333))
COLLECTION_NAME = "drivers"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Initialize models and clients
encoder = SentenceTransformer('all-MiniLM-L6-v2')
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

if GEMINI_API_KEY:
    # Optional LLM used only for summarization (retrieval always happens first).
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=GEMINI_API_KEY,
        temperature=0.0
    )
    print(f"Gemini initialized successfully with model: gemini-2.0-flash")

# Ensure Qdrant collection exists on startup
@app.on_event("startup")
def startup_event():
    try:
        if not qdrant.collection_exists(COLLECTION_NAME):
            qdrant.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )
            print(f"Created Qdrant collection: {COLLECTION_NAME}")
    except Exception as e:
        print(f"Error connecting to Qdrant: {e}")

# Data Models
class DriverSyncPayload(BaseModel):
    driver_id: int
    name: str
    bio: str
    vehicle_info: str
    reviews_text: str

class MatchRequestPayload(BaseModel):
    query: str

@app.get("/")
def read_root():
    return {"status": "AI Service is running"}

@app.post("/api/ai/sync-driver")
def sync_driver(payload: DriverSyncPayload):
    try:
        # Create a rich text document describing the driver
        combined_text = f"Driver Name: {payload.name}. Bio: {payload.bio}. Vehicle: {payload.vehicle_info}. Past Reviews: {payload.reviews_text}"
        
        # Convert text to vector embedding
        vector = encoder.encode(combined_text).tolist()
        
        # Upsert to Qdrant Vector DB
        qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=payload.driver_id, # Using int representation
                    vector=vector,
                    payload={
                        "driver_id": payload.driver_id,
                        "name": payload.name,
                        "bio": payload.bio,
                        "vehicle_info": payload.vehicle_info,
                        "reviews": payload.reviews_text
                    }
                )
            ]
        )
        return {"status": "success", "message": f"Driver {payload.name} synced to Vector DB."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- RETRIEVAL-FIRST MATCHING (LLM OPTIONAL) ---
_PET_QUERY_RE = re.compile(r"\b(pet|pets|pet[- ]?friendly|dog|dogs|cat|cats|animal|animals)\b", re.IGNORECASE)
_LONG_TRIP_QUERY_RE = re.compile(r"\b(long[- ]?trip|long[- ]?drive|road[- ]?trip|outstation|intercity|long distance)\b", re.IGNORECASE)
_LONG_TRIP_PAYLOAD_RE = re.compile(r"\b(long[- ]?trip|long[- ]?drive|road[- ]?trip|outstation|intercity|long distance)\b", re.IGNORECASE)

def _query_wants_pets(query: str) -> bool:
    return bool(_PET_QUERY_RE.search(query or ""))

def _query_wants_long_trip(query: str) -> bool:
    return bool(_LONG_TRIP_QUERY_RE.search(query or ""))

def _payload_text(payload: dict) -> str:
    if not payload:
        return ""
    parts = [
        payload.get("name", ""),
        payload.get("bio", ""),
        payload.get("vehicle_info", ""),
        payload.get("reviews", ""),
    ]
    return " ".join([p for p in parts if p]).strip()

def _retrieve_and_rank(query: str, limit: int) -> list[tuple[int, float, dict]]:
    query_vector = encoder.encode(query).tolist()
    search_results = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=limit,
    )

    ranked: list[tuple[int, float, dict]] = []
    for match in search_results or []:
        payload = match.payload or {}
        driver_id = payload.get("driver_id")
        if driver_id is None:
            continue
        ranked.append((int(driver_id), float(match.score), payload))
    return ranked

def _match_drivers_retrieval_first(query: str, retrieve_limit: int = 20, recommend_limit: int = 3) -> tuple[list[int], str, str, list[dict]]:
    """
    Returns (driver_ids, non_llm_summary, debug_text, recommended_payloads).
    Always retrieves from Qdrant first; applies lightweight keyword constraints when present.
    """
    wants_pets = _query_wants_pets(query)
    wants_long_trip = _query_wants_long_trip(query)
    retrieve_limit = max(retrieve_limit, 50) if (wants_pets or wants_long_trip) else retrieve_limit

    candidates = _retrieve_and_rank(query, limit=retrieve_limit)
    debug_lines: list[str] = [
        f"[ID: {driver_id}] score={score:.3f} name={(payload or {}).get('name', '')}"
        for (driver_id, score, payload) in candidates
    ]

    if not candidates:
        return ([], "No matching drivers found.", "\n".join(debug_lines) or "No candidates", [])

    filtered = candidates
    long_trip_explicit = False

    if wants_pets:
        filtered = [
            (driver_id, score, payload)
            for (driver_id, score, payload) in candidates
            if _PET_QUERY_RE.search(_payload_text(payload))
        ]

        # If semantic search misses, do a lightweight full scan for pet keywords in payload text.
        if not filtered:
            try:
                scroll_limit = 256
                offset = None
                scanned = 0
                pet_hits: list[tuple[int, float, dict]] = []
                while scanned < 5000 and len(pet_hits) < recommend_limit:
                    points, offset = qdrant.scroll(
                        collection_name=COLLECTION_NAME,
                        limit=scroll_limit,
                        offset=offset,
                        with_payload=True,
                        with_vectors=False,
                    )
                    if not points:
                        break
                    scanned += len(points)
                    for point in points:
                        payload = point.payload or {}
                        driver_id = payload.get("driver_id")
                        if driver_id is None:
                            continue
                        if _PET_QUERY_RE.search(_payload_text(payload)):
                            pet_hits.append((int(driver_id), 0.0, payload))
                            if len(pet_hits) >= recommend_limit:
                                break
                    if offset is None:
                        break

                if pet_hits:
                    filtered = pet_hits
                    debug_lines.append(f"Scroll used; scanned={scanned} pet_hits={len(pet_hits)}")
            except Exception as scroll_err:
                debug_lines.append(f"Scroll failed: {scroll_err}")

    if wants_long_trip:
        long_trip_filtered = [
            (driver_id, score, payload)
            for (driver_id, score, payload) in (filtered or candidates)
            if _LONG_TRIP_PAYLOAD_RE.search(_payload_text(payload))
        ]
        if long_trip_filtered:
            filtered = long_trip_filtered
            long_trip_explicit = True

    recommended = filtered[:recommend_limit]
    driver_ids = [driver_id for (driver_id, _score, _payload) in recommended]
    recommended_payloads = [payload for (_driver_id, _score, payload) in recommended]

    if wants_pets and not driver_ids:
        return ([], "No drivers in your area mention being pet-friendly.", "\n".join(debug_lines), [])

    if driver_ids:
        if wants_pets:
            summary = "Here are drivers whose profiles or reviews mention being pet-friendly."
        elif wants_long_trip and long_trip_explicit:
            summary = "Here are drivers whose profiles or reviews explicitly mention long trips."
        elif wants_long_trip and not long_trip_explicit:
            summary = "No drivers explicitly mention long trips; showing closest matches instead."
        else:
            summary = "Here are the closest matches based on driver profiles and reviews."
    else:
        summary = "No matches found."

    return (driver_ids, summary, "\n".join(debug_lines), recommended_payloads)

def _summarize_with_llm(user_query: str, recommended_payloads: list[dict]) -> str:
    if not recommended_payloads:
        return ""

    snippets: list[str] = []
    for p in recommended_payloads[:5]:
        snippets.append(
            f"- ID {p.get('driver_id')}: {p.get('name', 'Unknown')}. "
            f"Bio: {p.get('bio', '')}. Vehicle: {p.get('vehicle_info', '')}. Reviews: {p.get('reviews', '')}"
        )

    prompt = (
        "You are a ride-matching assistant. Write a short 1-3 sentence summary explaining why the listed drivers match the rider request. "
        "Only use facts present in the driver snippets. Do not invent details.\n\n"
        f"Rider request: {user_query}\n\n"
        "Driver snippets:\n"
        + "\n".join(snippets)
    )

    # ChatGoogleGenerativeAI returns an AIMessage with `.content`.
    result = llm.invoke(prompt)  # type: ignore[name-defined]
    return (getattr(result, "content", "") or "").strip()


@app.post("/api/ai/match-drivers")
async def match_drivers(payload: MatchRequestPayload):
    try:
        driver_ids, non_llm_summary, debug_text, recommended_payloads = _match_drivers_retrieval_first(payload.query)
        ai_summary = non_llm_summary
        llm_used = False

        if GEMINI_API_KEY and driver_ids:
            try:
                llm_summary = _summarize_with_llm(payload.query, recommended_payloads)
                if llm_summary:
                    ai_summary = llm_summary
                    llm_used = True
            except Exception as llm_err:
                # If the LLM is rate-limited/unavailable, keep the deterministic summary.
                debug_text = f"{debug_text}\nLLM summary failed: {llm_err}"

        return {
            "driver_ids": driver_ids,
            "ai_summary": ai_summary,
            "debug_raw_results": debug_text,
            "fallback_used": not llm_used,
            "llm_used": llm_used,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
