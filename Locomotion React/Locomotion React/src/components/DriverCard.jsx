import { useNavigate } from "react-router-dom";
import { API_BASE } from "../utils/api_base";
import { Star } from "lucide-react";


export default function DriverCard({ driver }) {
  const navigate = useNavigate();


  const imageUrl = driver?.profile_image
    ? (driver.profile_image.startsWith("http")
      ? driver.profile_image
      : `${API_BASE}${driver.profile_image}`)
    : "/default-avatar.png";

  return (
    <div
      onClick={() => navigate(`/drivers/${driver.id}`)}
      className="group relative bg-slate-900/60 backdrop-blur-xl rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 border border-white/10 hover:border-indigo-500/50 max-w-sm cursor-pointer flex flex-col h-full transform hover:-translate-y-1"
    >
      {/* Header Image */}
      <div className="relative h-56 w-full overflow-hidden">
        <img
          src={imageUrl}
          alt={driver?.name || "Driver"}
          onError={(e) => (e.target.src = "/default-avatar.png")}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Subtle overlay gradient on image */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent pointer-events-none"></div>

        {/* Service Badge */}
        <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full text-xs font-bold text-white shadow-lg">
          {Array.isArray(driver?.vehicle_category_name) ? (
            driver.vehicle_category_name.join(", ")
          ) : (
            driver?.vehicle_category_name || (
              driver?.service_type === "driver_with_vehicle"
                ? "Driver + Vehicle"
                : "Driver Only"
            )
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-1 relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-white leading-tight">
                {driver?.name || "Unnamed Driver"}
              </h2>
              {driver?.is_available && (
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-bold border border-emerald-500/30">
                  Available
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-sm font-semibold text-indigo-400">
                {driver?.district ? `${driver.district} District` : "Location not set"}
              </p>

              {/* Rating Display */}
              <div className="flex items-center gap-1.5 bg-yellow-500/20 px-2 py-1 rounded-lg border border-yellow-500/30">
                <Star size={12} className="text-yellow-400 fill-yellow-400" />
                <span className="text-xs font-bold text-yellow-500">
                  {driver?.average_rating > 0 ? driver.average_rating : "New"}
                </span>
                {driver?.total_ratings > 0 && (
                  <span className="text-[10px] text-yellow-600/70 ml-0.5 font-bold">({driver.total_ratings})</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4 border-slate-700/50">
          <div className="flex items-center text-slate-400 text-sm font-medium">
            <span className="text-indigo-400 mr-2">📍</span> {driver?.panchayath_name}, {driver?.taluk}
          </div>

          {/* Vehicle shown only if service type is driver_with_vehicle */}
          {driver?.service_type === "driver_with_vehicle" && (
            <div className="mt-4 bg-white/5 border border-white/5 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                Vehicle Details
              </p>
              <p className="text-sm font-semibold text-slate-300">
                {driver.all_vehicles && driver.all_vehicles.length > 0
                  ? driver.all_vehicles.map(v => v.model).join(", ")
                  : driver.vehicle_full_name}
              </p>
            </div>
          )}
        </div>

        <button className="w-full mt-6 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl font-bold transition-all duration-300 group-hover:bg-indigo-600 group-hover:border-indigo-500 shadow-sm">
          View Full Profile &rarr;
        </button>
      </div>
    </div>
  );
}
