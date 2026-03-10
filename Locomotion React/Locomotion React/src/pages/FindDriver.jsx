import { useEffect, useState } from "react";
import { useDriverStore } from "../store/driverStore";
import DriverCard from "../components/DriverCard";
import LocationFilter from "../components/LocationFilter";
import axios from "axios";

export default function FindDriver() {
  const filteredDrivers = useDriverStore((state) => state.filteredDrivers || []);
  const fetchDrivers = useDriverStore((state) => state.fetchDrivers);
  const loading = useDriverStore((state) => state.loading);

  const [aiQuery, setAiQuery] = useState("");
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiMatchedIds, setAiMatchedIds] = useState([]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleAiSearch = async (e) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;

    setIsAiSearching(true);
    setAiSummary(null);
    setAiMatchedIds([]);

    try {
      const response = await axios.post("http://localhost:80/api/ai/match-drivers", {
        query: aiQuery
      });

      setAiMatchedIds(response.data.driver_ids || []);
      setAiSummary(response.data.ai_summary);
    } catch (error) {
      console.error("AI Search Error:", error);
      setAiSummary("Sorry, the AI matchmaker is currently unavailable.");
    } finally {
      setIsAiSearching(false);
    }
  };

  const displayedDrivers = aiMatchedIds.length > 0
    ? filteredDrivers.filter(d => aiMatchedIds.map(String).includes(String(d.id)))
    : filteredDrivers;

  return (
    <div className="min-h-screen bg-slate-950 p-6 pt-24 relative overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-0 left-[20%] w-[30%] h-[30%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="fixed bottom-0 right-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">Find a Ride</h1>
          <p className="text-indigo-200 font-medium mb-8">Connect with verified drivers in your area.</p>

          {/* AI Matchmaker Input */}
          <div className="max-w-2xl mx-auto bg-slate-900/60 p-6 rounded-3xl border border-indigo-500/30 shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)] backdrop-blur-xl">
            <h3 className="text-white font-bold text-lg mb-2 flex items-center justify-center gap-2">
              <span className="text-2xl">✨</span> AI Matchmaker
            </h3>
            <p className="text-slate-400 text-sm mb-4">Describe your perfect ride (e.g. "Polite driver with a large SUV for a hiking trip")</p>

            <form onSubmit={handleAiSearch} className="flex gap-2">
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="What kind of driver are you looking for?"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={isAiSearching || !aiQuery.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isAiSearching ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : "Match"}
              </button>
            </form>
          </div>
        </div>

        <LocationFilter />

        {/* AI Summary Block */}
        {aiSummary && (
          <div className="mb-8 p-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-2xl relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
            <p className="text-indigo-100 font-medium leading-relaxed italic pr-4 pl-2">
              "{aiSummary}"
            </p>
            <button
              onClick={() => { setAiMatchedIds([]); setAiSummary(null); setAiQuery(""); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              title="Clear AI Filters"
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-slate-400 font-medium tracking-wide">Scanning for nearby drivers...</p>
          </div>
        ) : displayedDrivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 mx-auto max-w-2xl">
            <span className="text-6xl mb-4 opacity-50">🧭</span>
            <p className="text-slate-300 text-lg font-medium">{aiMatchedIds.length > 0 ? "No specific drivers matched offline." : "No drivers found matching your search."}</p>
            <p className="text-slate-500 mt-2">Try adjusting your location filters or AI prompt.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {displayedDrivers.map((driver) => (
              <div key={driver.id} className="relative">
                {aiMatchedIds.length > 0 && (
                  <div className="absolute -top-3 -right-3 z-20 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border border-purple-400/50 flex items-center gap-1">
                    <span>✨</span> Top Match
                  </div>
                )}
                <DriverCard driver={driver} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
