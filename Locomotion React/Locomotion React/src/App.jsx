import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore";

import Register from "./pages/Register";
import Login from "./pages/Login";
import VerifyOTP from "./pages/VerifyOTP";
import Home from "./pages/Home";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminLayout from "./pages/admin/AdminLayout";
import Users from "./pages/admin/Users";
import DriverApplications from "./pages/admin/DriverApplications";
import VehicleRequests from "./pages/admin/VehicleRequests";
import RideLocationHistory from "./pages/admin/RideLocationHistory";
import ProtectedRoute from "./components/ProtectedRoute";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Navbar from "./components/Navbar";
import JoinDriver from "./pages/JoinDriver";
import Verify2FA from "./pages/Verify2FA";
import Setup2FA from "./pages/Setup2FA";
import Profile from "./pages/Profile";
import FindDriver from "./pages/FindDriver";
import DriverProfile from "./pages/DriverProfile";
import DriverDashboard from "./pages/DriverDashboard";
import MyRides from "./pages/MyRides";


export default function App() {
  const rehydrate = useAuthStore((s) => s.rehydrateAuth);
  const [ready, setReady] = useState(false);

  const location = useLocation();
  const noNavbarPaths = ["/login", "/register", "/verify-otp", "/forgot-password", "/reset-password"];
  const hideNavbar = location.pathname.startsWith("/admin") || noNavbarPaths.includes(location.pathname);

  useEffect(() => {
    rehydrate().finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {!hideNavbar && <Navbar />}

      <div className={!hideNavbar ? "pt-20 flex-1" : "flex-1"}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-2fa" element={<Verify2FA />} />
          <Route path="/setup-2fa" element={<Setup2FA />} />
          <Route path="/find-driver" element={<FindDriver />} />
          <Route path="/drivers/:id" element={
            <ProtectedRoute>
              <DriverProfile />
            </ProtectedRoute>
          } />
          <Route
            path="/join-driver"
            element={
              <ProtectedRoute>
                <JoinDriver />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-rides"
            element={
              <ProtectedRoute>
                <MyRides />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="drivers" element={<DriverApplications />} />
            <Route path="vehicles" element={<VehicleRequests />} />
            <Route path="location-history" element={<RideLocationHistory />} />
          </Route>

          <Route
            path="/driver/dashboard"
            element={
              <ProtectedRoute driverOnly>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
}
