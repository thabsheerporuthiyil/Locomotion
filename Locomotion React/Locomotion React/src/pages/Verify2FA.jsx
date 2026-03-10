import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";

export default function Verify2FA() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fetchMe, setAccess } = useAuthStore();

  const userId = location.state?.userId;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const res = await api.post("accounts/2fa/verify-login/", {
        user_id: userId,
        code,
      });

      setAccess(res.data.access);

      await fetchMe();

      navigate("/");
    } catch (err) {
      setError("Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Enter 6-digit Code
        </h2>

        <form onSubmit={handleVerify} className="space-y-4">
          <input
            type="text"
            maxLength="6"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl text-center text-lg tracking-widest"
            placeholder="123456"
            required
          />

          <button
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>

        {error && (
          <p className="text-red-500 text-center mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}