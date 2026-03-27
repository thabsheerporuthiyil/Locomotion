import { createElement, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Car, FileText, RefreshCw, Users } from "lucide-react";
import api from "../../api/axios";

const DASHBOARD_CACHE_KEY = "admin_dashboard_cache_v1";

function StatCard({ icon, label, value, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
      <div>
        <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
          {label}
        </div>
        <div className="text-3xl font-black text-slate-900 mt-2">
          {value === null || value === undefined ? (
            <div className="h-8 w-16 rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            value
          )}
        </div>
      </div>
      <div
        className={`w-12 h-12 rounded-2xl ring-1 flex items-center justify-center ${tones[tone]}`}
      >
        {icon ? createElement(icon, { size: 20 }) : null}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [applications, setApplications] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState({
    users_total: null,
    drivers_total: null,
    drivers_active: null,
    pending_driver_applications: null,
    pending_vehicle_requests: null,
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyDashboardPayload = (payload) => {
    if (!payload) return;
    setStats(
      payload.stats || {
        users_total: 0,
        drivers_total: 0,
        drivers_active: 0,
        pending_driver_applications: 0,
        pending_vehicle_requests: 0,
      },
    );
    setApplications(payload.recent_driver_applications || []);
    setVehicles(payload.recent_vehicle_requests || []);
  };

  const refresh = async ({ force = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("drivers/admin/dashboard/", {
        params: force ? { force: 1 } : undefined,
      });
      applyDashboardPayload(res.data);
      localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(res.data));
    } catch (e) {
      setError("Failed to load admin data. Please refresh.");
      console.error(e);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    try {
      const cachedRaw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        applyDashboardPayload(cached);
        setInitialLoading(false);
      }
    } catch {
      // ignore
    }

    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingApps = useMemo(
    () => applications.filter((a) => !a.status || a.status === "pending"),
    [applications],
  );
  const pendingVehicles = useMemo(
    () => vehicles.filter((v) => !v.status || v.status === "pending"),
    [vehicles],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">
            Review pending items and take action quickly.
          </div>
        </div>
        <button
          onClick={() => refresh({ force: true })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Total Users" value={stats.users_total} tone="indigo" />
        <StatCard
          icon={Users}
          label="Total Drivers"
          value={stats.drivers_total}
          tone="emerald"
        />
        <StatCard
          icon={FileText}
          label="Pending Driver Applications"
          value={stats.pending_driver_applications}
          tone="amber"
        />
        <StatCard
          icon={Car}
          label="Pending Vehicle Requests"
          value={stats.pending_vehicle_requests}
          tone="indigo"
        />
        <StatCard
          icon={RefreshCw}
          label="Total Pending Actions"
          value={
            stats.pending_driver_applications === null ||
            stats.pending_vehicle_requests === null
              ? null
              : stats.pending_driver_applications + stats.pending_vehicle_requests
          }
          tone="emerald"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="font-black text-slate-900">Recent Driver Applications</div>
            <Link to="/admin/drivers" className="text-sm font-bold text-indigo-700 hover:text-indigo-800">
              View all
            </Link>
          </div>

          {initialLoading ? (
            <div className="p-5 text-slate-500">Loading...</div>
          ) : pendingApps.length === 0 ? (
            <div className="p-5 text-slate-500">No pending applications.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingApps.map((app) => (
                <div key={app.id} className="p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{app.email}</div>
                    <div className="text-sm text-slate-500 truncate">
                      {app.panchayath_name}, {app.taluk_name}, {app.district_name}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 ring-1 ring-amber-100 shrink-0">
                    pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="font-black text-slate-900">Recent Vehicle Requests</div>
            <Link to="/admin/vehicles" className="text-sm font-bold text-indigo-700 hover:text-indigo-800">
              View all
            </Link>
          </div>

          {initialLoading ? (
            <div className="p-5 text-slate-500">Loading...</div>
          ) : pendingVehicles.length === 0 ? (
            <div className="p-5 text-slate-500">No pending vehicles.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingVehicles.map((v) => (
                <div key={v.id} className="p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">
                      {v.vehicle_brand_name} {v.vehicle_model_name}
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {v.vehicle_category_name} •{" "}
                      <span className="font-mono">{v.registration_number}</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 shrink-0">
                    pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

