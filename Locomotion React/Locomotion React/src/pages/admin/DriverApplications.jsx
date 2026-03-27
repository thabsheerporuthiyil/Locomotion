import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { RefreshCw } from "lucide-react";

export default function DriverApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [pendingOnly, setPendingOnly] = useState(true);

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const refreshApplications = async () => {
    setLoading(true);
    try {
      const res = await api.get("drivers/admin/applications/");
      setApplications(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshApplications();
  }, []);

  const handleApprove = async (id) => {
    try {
      setActionLoading(id);
      await api.post(`drivers/admin/applications/${id}/action/`, {
        action: "approve",
      });
      await refreshApplications();
    } catch (err) {
      console.log(err);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectReason) return;
    try {
      setActionLoading(rejectingId);
      await api.post(`drivers/admin/applications/${rejectingId}/action/`, {
        action: "reject",
        reason: rejectReason,
      });
      setRejectingId(null);
      setRejectReason("");
      await refreshApplications();
    } catch (err) {
      console.log(err);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = useMemo(
    () => applications.filter((a) => a.status === "pending").length,
    [applications],
  );

  const rows = useMemo(() => {
    if (!pendingOnly) return applications;
    return applications.filter((a) => a.status === "pending");
  }, [applications, pendingOnly]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm text-slate-500">
            Review, approve or reject driver onboarding requests.
          </div>
          <div className="text-xs font-bold text-slate-600">
            Pending: <span className="text-amber-700">{pendingCount}</span> • Total:{" "}
            <span className="text-slate-900">{applications.length}</span>
          </div>
        </div>
        <button
          onClick={refreshApplications}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="font-black text-slate-900">Applications</div>
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
          <div className="p-6 text-slate-500">Loading applications…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No applications found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left bg-slate-50">
                <tr className="text-slate-600">
                  <th className="py-3 px-4">Email</th>
                  <th className="px-4">Phone</th>
                  <th className="px-4">Service</th>
                  <th className="px-4">Vehicle</th>
                  <th className="px-4">Location</th>
                  <th className="px-4">Documents</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => (
                  <tr key={app.id} className="border-b hover:bg-slate-50 align-top">
                    <td className="py-4 px-4 font-semibold text-slate-900">
                      {app.email}
                    </td>
                    <td className="py-4 px-4">{app.phone_number}</td>
                    <td className="py-4 px-4 capitalize">{app.service_type}</td>
                    <td className="py-4 px-4">
                      {app.vehicle_model_name || app.vehicle_category_name || "-"}
                    </td>
                    <td className="py-4 px-4">
                      {app.panchayath_name}, {app.taluk_name}, {app.district_name}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {app.license_document && (
                          <a
                            href={app.license_document}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            License
                          </a>
                        )}
                        {app.rc_document && (
                          <a
                            href={app.rc_document}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            RC
                          </a>
                        )}
                        {app.insurance_document && (
                          <a
                            href={app.insurance_document}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            Insurance
                          </a>
                        )}
                        {app.vehicle_image && (
                          <a
                            href={app.vehicle_image}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-700 hover:underline font-semibold"
                          >
                            Vehicle Image
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={[
                          "px-3 py-1 rounded-full text-xs font-black ring-1",
                          app.status === "approved"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : app.status === "rejected"
                              ? "bg-rose-50 text-rose-700 ring-rose-100"
                              : "bg-amber-50 text-amber-700 ring-amber-100",
                        ].join(" ")}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {app.status === "pending" ? (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={actionLoading === app.id}
                            onClick={() => handleApprove(app.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={actionLoading === app.id}
                            onClick={() => setRejectingId(app.id)}
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

      {rejectingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4 border border-slate-200 shadow-2xl">
            <h3 className="font-black text-lg text-slate-900">
              Reject Application
            </h3>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Enter rejection reason…"
              rows={4}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
              >
                Cancel
              </button>

              <button
                disabled={!rejectReason || actionLoading === rejectingId}
                onClick={confirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-black"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
