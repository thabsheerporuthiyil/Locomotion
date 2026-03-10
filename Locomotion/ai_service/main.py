from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import google.generativeai as genai
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer

from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage

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
    genai.configure(api_key=GEMINI_API_KEY)
    
    # Initialize Langchain Chat Model for the Agent
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=GEMINI_API_KEY,
        temperature=0.0
    )

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
                        "vehicle_info": payload.vehicle_info
                    }
                )
            ]
        )
        return {"status": "success", "message": f"Driver {payload.name} synced to Vector DB."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- AGENT TOOLS ---
@tool
def search_vector_db(query: str, limit: int = 3) -> str:
    """Useful for finding drivers based on a user's semantic request. 
    Pass the user's description of preferred drivers as the query.
    Returns a list of driver profiles including their IDs, names, bios, and vehicle details.
    """
    query_vector = encoder.encode(query).tolist()
    search_results = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=limit
    )
    
    if not search_results:
        return "No matching drivers found in the database."
        
    results_str = ""
    for match in search_results:
        p = match.payload
        score = match.score
        results_str += f"[ID: {p['driver_id']}] {p['name']} (Score: {score:.2f}): {p['bio']}. Vehicle: {p['vehicle_info']}\n"
        
    return results_str

# --- COMPILE AGENT ---
def get_agent():
    tools = [search_vector_db]
    
    system_prompt = """You are an expert ride-matching concierge. 
    A rider is looking for a specific type of driver. 
    1. Use the `search_vector_db` tool to find drivers that match their request.
    2. Analyze the results carefully. If NONE of the returned drivers seem relevant to the specific request (for example, no one mentions 'pets' when asked for pets), do NOT force a recommendation. 
    3. Output your final response in EXACTLY this format, do not include any other text:
    
    IDS: [comma separated list of driver IDs you recommend. Leave completely blank if none match.]
    SUMMARY: [A short, 1-3 sentence engaging paragraph explaining why you recommend these specific drivers. If none matched, say so politely.]
    """
    
    # Create the ReAct agent graph
    agent_executor = create_react_agent(llm, tools, prompt=system_prompt)
    return agent_executor


@app.post("/api/ai/match-drivers")
async def match_drivers(payload: MatchRequestPayload):
    try:
        if not GEMINI_API_KEY:
            raise HTTPException(status_code=500, detail="Gemini API Key is not configured.")

        agent = get_agent()
        
        # Invoke the agent graph
        inputs = {"messages": [HumanMessage(content=f"Rider Request: {payload.query}")]}
        response = agent.invoke(inputs)
        
        final_message = response["messages"][-1].content
        
        # Parse output format robustly
        driver_ids = []
        ai_summary = ""
        
        parsing_summary = False
        for line in final_message.split("\n"):
            line = line.strip()
            if not line:
                continue
                
            if line.startswith("IDS:"):
                parsing_summary = False
                ids_str = line.replace("IDS:", "").strip().strip("[]")
                if ids_str:
                    try:
                        driver_ids = [int(id_part.strip()) for id_part in ids_str.split(",") if id_part.strip()]
                    except ValueError:
                        pass # Handle cases where agent hallucinated non-integers
            elif line.startswith("SUMMARY:"):
                parsing_summary = True
                ai_summary += line.replace("SUMMARY:", "").strip() + " "
            elif parsing_summary:
                ai_summary += line + " "
                
        ai_summary = ai_summary.strip() or "No matches found."

        return {
            "driver_ids": driver_ids,
            "ai_summary": ai_summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
