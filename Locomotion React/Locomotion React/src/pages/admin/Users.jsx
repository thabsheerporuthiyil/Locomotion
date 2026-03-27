import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { RefreshCw, Search, ShieldBan, ShieldCheck } from "lucide-react";

export default function Users() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("active"); // active | blocked | all

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [data, setData] = useState({ total: 0, results: [] });

  const params = useMemo(() => {
    const p = { limit: 100 };
    if (q.trim()) p.q = q.trim();
    if (role) p.role = role;
    if (status === "active") p.is_active = true;
    if (status === "blocked") p.is_active = false;
    return p;
  }, [q, role, status]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("accounts/admin/users/", { params });
      setData(res.data || { total: 0, results: [] });
    } catch (e) {
      console.error(e);
      setData({ total: 0, results: [] });
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setBlocked = async (id, isActive) => {
    try {
      setActionLoading(id);
      await api.post(`accounts/admin/users/${id}/block/`, { is_active: isActive });
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email / name / phone…"
              className="pl-10 pr-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-full sm:w-80"
            />
          </div>

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All roles</option>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </select>

          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            {[
              ["active", "Active"],
              ["blocked", "Blocked"],
              ["all", "All"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setStatus(k)}
                className={[
                  "px-3 py-1.5 rounded-lg text-xs font-black transition",
                  status === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={refresh}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="text-xs font-bold text-slate-600">
        Showing <span className="text-slate-900">{data.results.length}</span> of{" "}
        <span className="text-slate-900">{data.total}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-500">Loading users…</div>
        ) : data.results.length === 0 ? (
          <div className="p-6 text-slate-500">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left bg-slate-50">
                <tr className="text-slate-600">
                  <th className="py-3 px-4">User</th>
                  <th className="px-4">Role</th>
                  <th className="px-4">Driver</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-slate-50">
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-slate-500 text-xs">{u.email}</div>
                      {u.phone_number && (
                        <div className="text-slate-500 text-xs">{u.phone_number}</div>
                      )}
                    </td>
                    <td className="py-4 px-4 capitalize">{u.role}</td>
                    <td className="py-4 px-4">
                      {u.is_driver ? (
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                          Driver
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                          <ShieldCheck size={14} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 ring-1 ring-rose-100">
                          <ShieldBan size={14} /> Blocked
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {u.is_active ? (
                        <button
                          disabled={actionLoading === u.id}
                          onClick={() => setBlocked(u.id, false)}
                          className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50"
                        >
                          Block
                        </button>
                      ) : (
                        <button
                          disabled={actionLoading === u.id}
                          onClick={() => setBlocked(u.id, true)}
                          className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50"
                        >
                          Unblock
                        </button>
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
