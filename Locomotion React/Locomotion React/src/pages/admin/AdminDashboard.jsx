import { useAuthStore } from "../../store/authStore";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../../api/axios";

export default function AdminDashboard() {
  const { logout, name } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  /* =========================
     LOAD DATA
  ========================== */
  const [vehicles, setVehicles] = useState([]);

  const refreshApplications = async () => {
    try {
      const res = await api.get("drivers/admin/applications/");
      setApplications(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshVehicles = async () => {
    try {
      const res = await api.get("drivers/admin/vehicles/");
      setVehicles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      if (activeTab === "drivers") {
        await refreshApplications();
      } else if (activeTab === "vehicles") {
        await refreshVehicles();
      }
      setLoading(false);
    };
    fetchData();
  }, [activeTab]);

  /* =========================
     HANDLERS
  ========================== */
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

  const handleVehicleAction = async (id, action) => {
    try {
      setActionLoading(id);
      await api.post(`drivers/admin/vehicles/${id}/action/`, {
        action,
      });
      await refreshVehicles();
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
      await api.post(
        `drivers/admin/applications/${rejectingId}/action/`,
        { action: "reject", reason: rejectReason }
      );

      setRejectingId(null);
      setRejectReason("");
      await refreshApplications();
    } catch (err) {
      console.log(err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-64 bg-indigo-900 text-white flex flex-col shadow-xl">
        <div className="p-8">
          <h2 className="text-2xl font-extrabold tracking-tight">
            LOCO <span className="text-indigo-400">ADMIN</span>
          </h2>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full p-3 rounded-xl text-left font-semibold transition ${activeTab === "dashboard"
              ? "bg-indigo-800"
              : "hover:bg-indigo-800 text-indigo-200 hover:text-white"
              }`}
          >
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab("drivers")}
            className={`w-full p-3 rounded-xl text-left font-semibold transition ${activeTab === "drivers"
              ? "bg-indigo-800"
              : "hover:bg-indigo-800 text-indigo-200 hover:text-white"
              }`}
          >
            Driver Applications
          </button>

          <button
            onClick={() => setActiveTab("vehicles")}
            className={`w-full p-3 rounded-xl text-left font-semibold transition ${activeTab === "vehicles"
              ? "bg-indigo-800"
              : "hover:bg-indigo-800 text-indigo-200 hover:text-white"
              }`}
          >
            Vehicle Requests
          </button>
        </nav>

        <div className="p-4 border-t border-indigo-800">
          <button
            onClick={handleLogout}
            className="w-full bg-indigo-800 hover:bg-rose-600 p-3 rounded-xl font-bold transition"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto">

        <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-800 capitalize">
            {activeTab}
          </h1>
          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold uppercase">
            {name || "Admin"}
          </span>
        </header>

        <div className="p-8">

          {/* Dashboard */}
          {activeTab === "dashboard" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
              <h2 className="text-xl font-bold text-slate-800">
                Welcome to Admin Panel
              </h2>
              <p className="text-slate-500 mt-2">
                Manage driver applications from sidebar.
              </p>
            </div>
          )}

          {/* Driver Applications */}
          {activeTab === "drivers" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">

              {loading ? (
                <p className="text-slate-500">Loading applications...</p>
              ) : applications.length === 0 ? (
                <p className="text-slate-500">No applications found.</p>
              ) : (
                <div className="overflow-x-auto">
                  {/* ... (existing applications table) ... */}
                  <table className="w-full text-sm">
                    <thead className="border-b text-left">
                      <tr>
                        <th className="py-3">Email</th>
                        <th>Phone</th>
                        <th>Service</th>
                        <th>Vehicle</th>
                        <th>Location</th>
                        <th>Documents</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {applications.map(app => (
                        <tr key={app.id} className="border-b hover:bg-slate-50">
                          <td className="py-3">{app.email}</td>
                          <td>{app.phone_number}</td>
                          <td className="capitalize">{app.service_type}</td>

                          <td>
                            {app.vehicle_model_name ||
                              app.vehicle_category_name ||
                              "-"}
                          </td>

                          <td>
                            {app.panchayath_name}, {app.taluk_name}, {app.district_name}
                          </td>

                          <td>
                            <div className="flex flex-col space-y-1 text-xs">
                              {app.license_document && (
                                <a href={app.license_document} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  License
                                </a>
                              )}
                              {app.rc_document && (
                                <a href={app.rc_document} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  RC
                                </a>
                              )}
                              {app.insurance_document && (
                                <a href={app.insurance_document} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  Insurance
                                </a>
                              )}
                              {app.vehicle_image && (
                                <a href={app.vehicle_image} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  Vehicle Img
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${app.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : app.status === "rejected"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-yellow-100 text-yellow-700"
                              }`}>
                              {app.status}
                            </span>
                          </td>

                          <td className="space-x-2">
                            {app.status === "pending" && (
                              <>
                                <button
                                  disabled={actionLoading === app.id}
                                  onClick={() => handleApprove(app.id)}
                                  className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                                >
                                  Approve
                                </button>

                                <button
                                  disabled={actionLoading === app.id}
                                  onClick={() => setRejectingId(app.id)}
                                  className="bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Vehicle Requests */}
          {activeTab === "vehicles" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              {loading ? (
                <p className="text-slate-500">Loading vehicles...</p>
              ) : vehicles.length === 0 ? (
                <p className="text-slate-500">No pending vehicles found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left">
                      <tr>
                        <th className="py-3">Vehicle</th>
                        <th>Category</th>
                        <th>Reg Number</th>
                        <th>Documents</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map(vehicle => (
                        <tr key={vehicle.id} className="border-b hover:bg-slate-50">
                          <td className="py-3">
                            <div className="font-semibold">{vehicle.vehicle_brand_name} {vehicle.vehicle_model_name}</div>
                          </td>
                          <td>{vehicle.vehicle_category_name}</td>
                          <td className="font-mono">{vehicle.registration_number}</td>
                          <td>
                            <div className="flex flex-col space-y-1 text-xs">
                              {vehicle.rc_document && (
                                <a href={vehicle.rc_document} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  RC
                                </a>
                              )}
                              {vehicle.insurance_document && (
                                <a href={vehicle.insurance_document} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  Insurance
                                </a>
                              )}
                              {vehicle.vehicle_image && (
                                <a href={vehicle.vehicle_image} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                  Photo
                                </a>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${vehicle.status === "approved" ? "bg-green-100 text-green-700" :
                              vehicle.status === "rejected" ? "bg-rose-100 text-rose-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>
                              {vehicle.status}
                            </span>
                          </td>
                          <td className="space-x-2">
                            {vehicle.status === "pending" && (
                              <>
                                <button
                                  disabled={actionLoading === vehicle.id}
                                  onClick={() => handleVehicleAction(vehicle.id, 'approve')}
                                  className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={actionLoading === vehicle.id}
                                  onClick={() => handleVehicleAction(vehicle.id, 'reject')}
                                  className="bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl w-96 space-y-4">
            <h3 className="font-bold text-lg">Reject Application</h3>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border rounded-lg p-2"
              placeholder="Enter rejection reason..."
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                className="px-3 py-1 bg-gray-200 rounded"
              >
                Cancel
              </button>

              <button
                onClick={confirmReject}
                className="px-3 py-1 bg-rose-600 text-white rounded"
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
