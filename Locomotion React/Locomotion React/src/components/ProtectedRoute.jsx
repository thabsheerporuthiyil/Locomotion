import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function ProtectedRoute({ children, role, driverOnly }) {
  const { access, role: userRole, isDriver } = useAuthStore();

  if (!access) {
    return <Navigate to="/login" replace />;
  }

  // Role-based restriction
  if (role && userRole !== role) {
    return <Navigate to="/" replace />;
  }

  // Driver restriction
  if (driverOnly && !isDriver) {
    return <Navigate to="/" replace />;
  }

  return children;
}