import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, QrCode, Shield, Sparkles } from "lucide-react";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";

export default function Setup2FA() {
  const navigate = useNavigate();
  const { fetchMe } = useAuthStore();

  const [qr, setQr] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const codeClean = useMemo(() => code.replace(/\s+/g, ""), [code]);
  const codeValid = useMemo(() => /^\d{6}$/.test(codeClean), [codeClean]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    api
      .post("accounts/2fa/setup/")
      .then((res) => {
        if (!mounted) return;
        setQr(res.data.qr_code);
      })
      .catch((err) => {
        console.error(err);
        if (!mounted) return;
        setError("Failed to generate QR code. Please try again.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const confirm = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.post("accounts/2fa/confirm/", { code: codeClean });
      await fetchMe();
      navigate("/profile", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || "Invalid code. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pt-28 pb-16 px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="max-w-3xl mx-auto space-y-6 relative z-10">
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-400/20 text-indigo-200 flex items-center justify-center">
                <Shield size={20} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Enable 2FA
                </h1>
                <p className="text-slate-300 mt-1 text-sm leading-relaxed">
                  Scan the QR code in Microsoft Authenticator (or any compatible app),
                  then confirm with the 6-digit code.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={18} />
              Back
            </button>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
            <div className="flex items-center gap-2 text-slate-100 font-black">
              <QrCode size={18} className="text-indigo-300" />
              QR code
            </div>
            <p className="text-slate-300 text-sm mt-1">
              Open your authenticator app and add a new account by scanning.
            </p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-center min-h-[240px]">
              {loading ? (
                <div className="w-full">
                  <div className="h-6 w-40 bg-white/10 rounded-lg mb-4" />
                  <div className="aspect-square w-full max-w-[240px] bg-white/10 rounded-2xl mx-auto" />
                </div>
              ) : qr ? (
                <img
                  src={qr}
                  alt="2FA QR Code"
                  className="w-full max-w-[240px] rounded-2xl bg-white p-4"
                />
              ) : (
                <div className="text-slate-300 text-sm text-center">
                  Failed to load QR code.
                </div>
              )}
            </div>

            <div className="mt-4 text-[11px] text-slate-400 leading-relaxed">
              Tip: If codes keep failing, make sure your device time is set to automatic.
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
            <div className="flex items-center gap-2 text-slate-100 font-black">
              <KeyRound size={18} className="text-indigo-300" />
              Confirm
            </div>
            <p className="text-slate-300 text-sm mt-1">
              Enter the 6-digit code generated by your authenticator app.
            </p>

            <div className="mt-5">
              <label className="block text-xs font-bold text-slate-300 mb-2 ml-1">
                6-digit code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner tracking-[0.25em] text-center font-bold"
              />
              <div className="mt-2 text-[11px] text-slate-400">
                Spaces are ignored (e.g. “123 456” works).
              </div>
            </div>

            <button
              onClick={confirm}
              disabled={saving || loading || !codeValid}
              className={`mt-5 w-full py-3 rounded-xl font-black text-white transition-all duration-300 ${
                saving || loading || !codeValid
                  ? "bg-indigo-500/40 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_40px_-10px_rgba(99,102,241,0.7)] active:scale-[0.99]"
              }`}
            >
              {saving ? "Confirming..." : "Confirm 2FA"}
            </button>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-slate-100 font-black">
                <Sparkles size={18} className="text-purple-300" />
                What happens next?
              </div>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                After enabling 2FA, you’ll be asked for a code when signing in.
                You can disable it later from your Profile page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

