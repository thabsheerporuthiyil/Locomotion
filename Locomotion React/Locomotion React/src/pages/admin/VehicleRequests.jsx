import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { RefreshCw } from "lucide-react";

export default function VehicleRequests() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [pendingOnly, setPendingOnly] = useState(true);

  const refreshVehicles = async () => {
    setLoading(true);
    try {
      const res = await api.get("drivers/admin/vehicles/");
      setVehicles(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshVehicles();
  }, []);

  const handleVehicleAction = async (id, action) => {
    try {
      setActionLoading(id);
      await api.post(`drivers/admin/vehicles/${id}/action/`, { action });
      await refreshVehicles();
    } catch (err) {
      console.log(err);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = useMemo(
    () => vehicles.filter((v) => v.status === "pending").length,
    [vehicles],
  );

  const rows = useMemo(() => {
    if (!pendingOnly) return vehicles;
    return vehicles.filter((v) => v.status === "pending");
  }, [vehicles, pendingOnly]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm text-slate-500">
            Approve or reject vehicle verification requests.
          </div>
          <div className="text-xs font-bold text-slate-600">
            Pending: <span className="text-amber-700">{pendingCount}</span> • Total:{" "}
            <span className="text-slate-900">{vehicles.length}</span>
          </div>
        </div>
        <button
          onClick={refreshVehicles}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="font-black text-slate-900">Requests</div>
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setPendingOnly(true)}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-black transition",
                pendingOnly ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              Pending
            </button>
            <button
              onClick={() => setPendingOnly(false)}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-black transition",
                !pendingOnly ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              All
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-6 text-slate-500">Loading vehicles…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No vehicles found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left bg-slate-50">
                <tr className="text-slate-600">
                  <th className="py-3 px-4">Vehicle</th>
                  <th className="px-4">Category</th>
                  <th className="px-4">Reg Number</th>
                  <th className="px-4">Documents</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b hover:bg-slate-50 align-top">
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900">
                        {vehicle.vehicle_brand_name} {vehicle.vehicle_model_name}
                      </div>
                    </td>
                    <td className="py-4 px-4">{vehicle.vehicle_category_name}</td>
                    <td className="py-4 px-4 font-mono">{vehicle.registration_number}</td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {vehicle.rc_document && (
                          <a
                            href={vehicle.rc_document}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            RC
                          </a>
                        )}
                        {vehicle.insurance_document && (
                          <a
                            href={vehicle.insurance_document}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            Insurance
                          </a>
                        )}
                        {vehicle.vehicle_image && (
                          <a
                            href={vehicle.vehicle_image}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            Photo
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={[
                          "px-3 py-1 rounded-full text-xs font-black ring-1",
                          vehicle.status === "approved"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : vehicle.status === "rejected"
                              ? "bg-rose-50 text-rose-700 ring-rose-100"
                              : "bg-amber-50 text-amber-700 ring-amber-100",
                        ].join(" ")}
                      >
                        {vehicle.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {vehicle.status === "pending" ? (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={actionLoading === vehicle.id}
                            onClick={() => handleVehicleAction(vehicle.id, "approve")}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={actionLoading === vehicle.id}
                            onClick={() => handleVehicleAction(vehicle.id, "reject")}
                            className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
