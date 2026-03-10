import { useDriverStore } from "../store/driverStore";
import { Search } from "lucide-react";

export default function LocationFilter() {
  const { locationFilter, setLocationFilter } = useDriverStore();

  return (
    <div className="mb-8 relative max-w-2xl mx-auto">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-slate-500" />
      </div>
      <input
        type="text"
        placeholder="Search by district, taluk, or panchayath..."
        value={locationFilter}
        onChange={(e) => setLocationFilter(e.target.value)}
        className="w-full pl-11 pr-4 py-4 bg-slate-900/60 backdrop-blur-xl border border-slate-700 text-white placeholder-slate-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner transition-all duration-300"
      />
    </div>
  );
}