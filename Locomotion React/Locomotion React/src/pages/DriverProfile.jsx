import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/axios";
import { API_BASE } from "../utils/api_base";
import RequestRidePopup from "../components/RequestRidePopup";
import { Star } from "lucide-react";

export default function DriverProfile() {
  const { id } = useParams();
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => {
    api.get(`drivers/${id}/`)
      .then(res => setDriver(res.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-6">Loading profile...</p>;
  if (!driver) return <p className="p-6">Driver not found</p>;

  return (
    <div className="min-h-screen bg-slate-950 p-6 pt-24 relative overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-0 left-[20%] w-[30%] h-[30%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="fixed bottom-0 right-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="max-w-4xl mx-auto bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-8 relative z-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start text-center md:text-left">
          <div className="relative">
            <img
              src={driver.profile_image
                ? (driver.profile_image.startsWith("http")
                  ? driver.profile_image
                  : `${API_BASE}${driver.profile_image}`)
                : "/default-avatar.png"}
              className="w-32 h-32 md:w-40 md:h-40 rounded-3xl object-cover shadow-2xl border border-white/10"
            />
            {/* Overlay Gradient */}
            <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 pointer-events-none"></div>
          </div>

          <div className="flex-1 mt-2">
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">{driver.name}</h1>
            <p className="text-indigo-300 font-medium mt-1"><span className="text-indigo-400 mr-1">📍</span>{driver.district}, {driver.taluk}</p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4">
              <div className="flex items-center gap-1.5 bg-yellow-500/20 px-3 py-1.5 rounded-xl border border-yellow-500/30">
                <Star size={18} className="text-yellow-400 fill-yellow-400" />
                <span className="text-sm font-bold text-yellow-500">
                  {driver?.average_rating > 0 ? driver.average_rating : "New"}
                </span>
                {driver?.total_ratings > 0 && (
                  <span className="text-xs text-yellow-600/70 ml-1 font-bold">({driver.total_ratings} ratings)</span>
                )}
              </div>

              <div className="bg-indigo-500/20 text-indigo-300 text-sm px-4 py-1.5 rounded-xl font-bold border border-indigo-500/30">
                {driver.service_type === "driver_with_vehicle"
                  ? "Driver + Vehicle"
                  : "Driver Only"}
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="grid md:grid-cols-2 gap-6 mt-10">

          <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-700/50 shadow-inner">
            <h3 className="font-semibold text-slate-400 uppercase tracking-wider text-xs mb-3">Service Area</h3>
            <p className="font-bold text-white text-lg">{driver.panchayath_name}</p>
            <p className="text-slate-300">{driver.taluk}, {driver.district}</p>
          </div>

          <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-700/50 shadow-inner">
            <h3 className="font-semibold text-slate-400 uppercase tracking-wider text-xs mb-3">Experience</h3>
            <p className="font-bold text-white text-lg">{driver.experience_years} <span className="text-slate-400 font-medium text-base">Years</span></p>
          </div>

          {driver.all_vehicles && driver.all_vehicles.length > 0 ? (
            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-700/50 shadow-inner md:col-span-2">
              <h3 className="font-semibold text-slate-400 uppercase tracking-wider text-xs mb-5">Registered Vehicles</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {driver.all_vehicles.map((vehicle, index) => (
                  <div key={index} className="bg-white/5 p-4 rounded-xl shadow-sm border border-white/10 flex gap-4 transition-transform hover:-translate-y-1">
                    {vehicle.image ? (
                      <img src={vehicle.image} alt={vehicle.model} className="w-20 h-20 rounded-lg object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-slate-800 flex items-center justify-center text-xs text-slate-500 font-medium ring-1 ring-white/10">No Img</div>
                    )}
                    <div className="flex-1 flex flex-col justify-center">
                      <p className="font-black text-white text-base tracking-tight">{vehicle.model}</p>
                      <p className="text-xs text-indigo-400 font-bold mb-2">{vehicle.category}</p>
                      <p className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded inline-block w-fit ring-1 ring-slate-700">Reg: <span className="font-mono text-slate-300">{vehicle.registration}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            driver.service_type === "driver_with_vehicle" && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-700/50 shadow-inner">
                <h3 className="font-semibold text-slate-400 uppercase tracking-wider text-xs mb-3">Vehicle Details</h3>
                <p className="font-bold text-white text-lg flex items-center"><span className="mr-2">🚙</span> {driver.vehicle_full_name}</p>
                <p className="text-sm text-slate-400 mt-2">
                  Reg: <span className="font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 ml-1">{driver.vehicle_registration_number}</span>
                </p>
              </div>
            )
          )}

        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <button
            onClick={() => setRequestOpen(true)}
            className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-12 py-4 rounded-2xl font-black shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all duration-300 transform hover:shadow-[0_0_50px_-5px_rgba(79,70,229,0.7)] hover:-translate-y-1 active:scale-[0.98] uppercase tracking-wide text-lg"
          >
            Request Ride
          </button>
        </div>

        <RequestRidePopup
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          driver={driver}
        />

      </div>
    </div>
  );
}
