// Local dev defaults:
// - Django/ASGI web: http://localhost:8000
// - FastAPI AI service: http://localhost:8001 (docker-compose maps 8001 -> 8000 in the container)
//
// Override in `Locomotion React/Locomotion React/.env`:
//   VITE_API_ORIGIN=http://localhost
//   VITE_AI_ORIGIN=http://localhost
// (use the above if you run nginx on port 80)

export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://localhost:8000";
export const AI_ORIGIN = import.meta.env.VITE_AI_ORIGIN || "http://localhost:8001";

// Backwards-compatible export used by some components to build absolute media URLs.
export const API_BASE = API_ORIGIN.replace(/\/+$/, "");

export const API_BASE_URL = `${API_ORIGIN.replace(/\/+$/, "")}/api/`;
export const AI_BASE_URL = `${AI_ORIGIN.replace(/\/+$/, "")}/api/ai/`;
