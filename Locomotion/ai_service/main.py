from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import httpx
import time
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
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
LLM_PROVIDER = (os.environ.get("LLM_PROVIDER") or "gemini").strip().lower()  # "gemini" | "groq"

# Initialize models and clients
encoder = SentenceTransformer('all-MiniLM-L6-v2')
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

# LLM Clients
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

_gemini_llm = None
if GEMINI_API_KEY:
    try:
        _gemini_llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=GEMINI_API_KEY,
            temperature=0.0,
            max_retries=0  # Disable internal retries to trigger fallback immediately
        )
        print("Gemini 2.0 Flash initialized successfully")
    except Exception as e:
        print(f"Gemini initialization failed: {e}")

_groq_llm = None
if GROQ_API_KEY:
    try:
        _groq_llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            groq_api_key=GROQ_API_KEY,
            temperature=0.0,
            max_retries=0  # Disable internal retries
        )
        print("Groq (Llama 3.3 70B) initialized successfully")
    except Exception as e:
        print(f"Groq initialization failed: {e}")


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
    is_available: bool = True
    bio: str
    vehicle_info: str
    reviews_text: str

class MatchRequestPayload(BaseModel):
    query: str


class CoachPlanRequestPayload(BaseModel):
    stats: dict
    goal: str | None = None
    max_hotspots: int = 5
    debug: bool = False


def _safe_json_extract(text: str) -> dict | None:
    if not text:
        return None
    raw = (text or "").strip()
    try:
        if raw.startswith("{") and raw.endswith("}"):
            return json.loads(raw)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    snippet = text[start : end + 1]
    snippet = re.sub(r",\s*([}\]])", r"\1", snippet)
    try:
        return json.loads(snippet)
    except Exception:
        return None


def _build_coach_plan_fallback(stats: dict, max_hotspots: int = 5) -> dict:
    driver_stats = (stats or {}).get("driver_stats") or {}
    global_stats = (stats or {}).get("global_stats") or {}

    by_hour = (global_stats.get("by_hour") or {}) if isinstance(global_stats, dict) else {}
    hour_rows: list[tuple[int, int, float]] = []
    for h_str, bucket in (by_hour or {}).items():
        try:
            h = int(h_str)
        except Exception:
            continue
        if not isinstance(bucket, dict):
            continue
        count = int(bucket.get("count") or 0)
        fare_sum = float(bucket.get("fare_sum") or 0.0)
        hour_rows.append((h, count, fare_sum))
    hour_rows.sort(key=lambda x: (x[1], x[2]), reverse=True)

    best_hours = [
        {
            "start_hour": h,
            "end_hour": (h + 1) % 24,
            "reason": "High demand hour based on recent rides.",
        }
        for (h, _c, _s) in hour_rows[:3]
    ]

    driver_pickups = driver_stats.get("top_pickups") if isinstance(driver_stats, dict) else None
    hotspots: list[str] = []
    if isinstance(driver_pickups, list):
        for row in driver_pickups:
            if not isinstance(row, dict):
                continue
            loc = (row.get("source_location") or "").strip()
            if loc:
                hotspots.append(loc)
            if len(hotspots) >= max_hotspots:
                break

    actions: list[dict] = []
    for slot in best_hours[:2]:
        start_hour = slot.get("start_hour")
        if isinstance(start_hour, int) and 0 <= start_hour <= 23:
            at = f"{start_hour:02d}:00"
            actions.append(
                {
                    "type": "reminder",
                    "at": at,
                    "message": f"Go online around {at} to catch a peak-demand hour.",
                }
            )

    return {
        "best_hours": best_hours,
        "hotspots": hotspots,
        "actions": actions,
        "notes": "Fallback plan generated without LLM.",
    }


def _coach_plan_with_llm(stats: dict, goal: str | None, max_hotspots: int) -> dict | None:
    if not _gemini_llm and not _groq_llm:
        return None

    window = (stats or {}).get("window") or {}
    driver = (stats or {}).get("driver") or {}

    driver_stats = (stats or {}).get("driver_stats") or {}
    global_stats = (stats or {}).get("global_stats") or {}

    compact_stats: dict = {
        "days": window.get("days"),
        "driver_name": driver.get("name"),
        "driver_panchayath": driver.get("panchayath"),
        "driver_recent_rides": driver_stats.get("rides_completed"),
        "driver_by_hour": driver_stats.get("by_hour"),
        "global_demand_by_hour": global_stats.get("by_hour"),
        "top_pickups": driver_stats.get("top_pickups") or [],
    }
    if isinstance(compact_stats.get("top_pickups"), list):
        compact_stats["top_pickups"] = compact_stats["top_pickups"][: max(10, max_hotspots * 2)]

    prompt = (
        "You are a driver earnings coach for a ride-hailing app.\n"
        "Given the stats JSON, produce a concise coaching plan as STRICT JSON (no markdown, no extra text).\n"
        "Return exactly this schema:\n"
        "{\n"
        '  "best_hours": [{"start_hour": 0-23, "end_hour": 0-23, "reason": "string"}],\n'
        f'  "hotspots": ["string", ... max {max_hotspots}],\n'
        '  "actions": [{"type": "reminder", "at": "HH:MM", "message": "string"}]\n'
        "}\n"
        "Rules:\n"
        "- Use only information from the stats; do not invent earnings numbers.\n"
        "- Prefer best_hours based on global demand_by_hour AND driver performance.\n"
        "- hotspots should come from top_pickups (strings) if available.\n"
        "- If you cannot recommend, return empty arrays.\n\n"
        f"Goal: {goal or 'maximize earnings'}\n"
        f"Window: {window}\n"
        f"Driver: {driver}\n"
        f"Stats JSON: {json.dumps(compact_stats, ensure_ascii=False)}\n"
    )

    provider_order: list[str] = []
    if LLM_PROVIDER == "groq":
        if _groq_llm: provider_order.append("groq")
        if _gemini_llm: provider_order.append("gemini")
    else:
        if _gemini_llm: provider_order.append("gemini")
        if _groq_llm: provider_order.append("groq")

    content = ""
    provider_used = None
    last_err: Exception | None = None
    
    print(f"--- AI Coach Plan Request ---\nProvider: {LLM_PROVIDER}\nGoal: {goal}")
    
    for provider in provider_order:
        try:
            print(f"Trying LLM provider: {provider}...")
            if provider == "gemini" and _gemini_llm:
                result = _gemini_llm.invoke(prompt)
                content = (getattr(result, "content", "") or "").strip()
                provider_used = "gemini"
                print(f"Gemini success. Response length: {len(content)}")
                break
            if provider == "groq" and _groq_llm:
                result = _groq_llm.invoke(prompt)
                content = (getattr(result, "content", "") or "").strip()
                provider_used = "groq"
                print(f"Groq success. Response length: {len(content)}")
                break
        except Exception as e:
            print(f"{provider} failed: {str(e)[:100]}")
            last_err = e
            continue

    if not content:
        if last_err:
            raise last_err
        return None
    parsed = _safe_json_extract(content)
    if not isinstance(parsed, dict):
        return None

    parsed.setdefault("best_hours", [])
    parsed.setdefault("hotspots", [])
    parsed.setdefault("actions", [])
    parsed["_llm_provider"] = provider_used
    return parsed


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
                        "is_available": payload.is_available,
                        "bio": payload.bio,
                        "vehicle_info": payload.vehicle_info,
                        "reviews": payload.reviews_text
                    }
                )
            ]
        )
        return {"status": "success", "message": f"Driver {payload.name} (Available: {payload.is_available}) synced to Vector DB."}
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

def _retrieve_and_rank(query: str, limit: int, only_available: bool = False) -> list[tuple[int, float, dict]]:
    query_vector = encoder.encode(query).tolist()
    
    # Optional filter for availability
    filter_obj = None
    if only_available:
        from qdrant_client.http import models as rest
        filter_obj = rest.Filter(
            must=[
                rest.FieldCondition(
                    key="is_available",
                    match=rest.MatchValue(value=True),
                )
            ]
        )

    search_results = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        query_filter=filter_obj,
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

    # Default to only matching available drivers
    candidates = _retrieve_and_rank(query, limit=retrieve_limit, only_available=True)
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

def _summarize_with_llm(user_query: str, recommended_payloads: list[dict]) -> tuple[str, str | None]:
    if not recommended_payloads:
        return ("", None)

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

    provider_order: list[str] = []
    if LLM_PROVIDER == "groq":
        if _groq_llm: provider_order.append("groq")
        if _gemini_llm: provider_order.append("gemini")
    else:
        if _gemini_llm: provider_order.append("gemini")
        if _groq_llm: provider_order.append("groq")

    last_err: Exception | None = None
    for provider in provider_order:
        try:
            if provider == "gemini" and _gemini_llm:
                result = _gemini_llm.invoke(prompt)
                return ((getattr(result, "content", "") or "").strip(), "gemini")
            if provider == "groq" and _groq_llm:
                result = _groq_llm.invoke(prompt)
                return ((getattr(result, "content", "") or "").strip(), "groq")
        except Exception as e:
            last_err = e
            continue

    raise last_err or RuntimeError("No LLM provider configured.")


@app.post("/api/ai/match-drivers")
async def match_drivers(payload: MatchRequestPayload):
    try:
        # Default to only matching available drivers for the rider view
        driver_ids, non_llm_summary, debug_text, recommended_payloads = _match_drivers_retrieval_first(payload.query)
        ai_summary = non_llm_summary
        llm_used = False
        llm_provider = None

        if (_gemini_llm or _groq_llm) and driver_ids:
            try:
                llm_summary, provider_used = _summarize_with_llm(payload.query, recommended_payloads)
                if llm_summary:
                    ai_summary = llm_summary
                    llm_used = True
                    llm_provider = provider_used
            except Exception as llm_err:
                # If the LLM is rate-limited/unavailable, keep the deterministic summary.
                debug_text = f"{debug_text}\nLLM summary failed: {llm_err}"

        return {
            "driver_ids": driver_ids,
            "ai_summary": ai_summary,
            "debug_raw_results": debug_text,
            "fallback_used": not llm_used,
            "llm_used": llm_used,
            "llm_provider": llm_provider,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/coach-plan")
def coach_plan(payload: CoachPlanRequestPayload):
    try:
        stats = payload.stats or {}
        max_hotspots = int(payload.max_hotspots or 5)
        if max_hotspots < 0:
            max_hotspots = 0
        if max_hotspots > 10:
            max_hotspots = 10

        llm_used = False
        plan = None
        debug = ""
        include_debug = bool(getattr(payload, "debug", False))

        if _gemini_llm or _groq_llm:
            try:
                plan = _coach_plan_with_llm(stats, payload.goal, max_hotspots)
                if plan:
                    llm_used = True
            except Exception as llm_err:
                debug = f"LLM coach-plan failed: {str(llm_err)[:200]}" if include_debug else ""

        if not plan:
            plan = _build_coach_plan_fallback(stats, max_hotspots=max_hotspots)

        llm_provider = None
        if llm_used:
            if isinstance(plan, dict):
                llm_provider = plan.get("_llm_provider")
                if "_llm_provider" in plan:
                    plan.pop("_llm_provider", None)

        return {"plan": plan, "llm_used": llm_used, "llm_provider": llm_provider, "debug": debug}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
