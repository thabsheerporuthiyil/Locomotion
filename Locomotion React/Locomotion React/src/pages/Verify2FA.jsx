import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
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

  const codeClean = useMemo(() => code.replace(/\s+/g, ""), [code]);
  const codeValid = useMemo(() => /^\d{6}$/.test(codeClean), [codeClean]);

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!userId) {
      setError("Session expired. Please sign in again.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await api.post("accounts/2fa/verify-login/", {
        user_id: userId,
        code: codeClean,
      });

      setAccess(res.data.access);

      await fetchMe();

      const nextRole = useAuthStore.getState().role;
      navigate(nextRole === "admin" ? "/admin/dashboard" : "/", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex relative items-center justify-center p-4 overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-10 relative z-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-400/20 text-indigo-200 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Verify 2FA
              </h2>
              <p className="text-indigo-200 mt-1 text-sm font-medium">
                Enter the 6-digit code from your authenticator app.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm font-semibold">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">
              6-digit code
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <KeyRound size={18} />
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner tracking-[0.25em] text-center font-black"
                placeholder="123456"
                required
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Spaces are ignored (e.g. “123 456” works).
            </p>
          </div>

          <button
            disabled={loading || !codeValid || !userId}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all duration-300 uppercase tracking-wide ${
              loading || !codeValid || !userId
                ? "bg-indigo-500/50 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_50px_-5px_rgba(79,70,229,0.7)] active:scale-[0.98] transform hover:-translate-y-0.5"
            }`}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}

