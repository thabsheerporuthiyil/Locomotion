import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  Phone,
  Shield,
  User2,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import api from "../api/axios";

export default function Profile() {
  const {
    name,
    email,
    role,
    phoneNumber,
    isDriver,
    is2FAEnabled,
    fetchMe,
    driverApplication,
  } = useAuthStore();

  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!email) fetchMe();
  }, [email, fetchMe]);

  const firstLetter = useMemo(() => {
    const value = name || email || "U";
    return String(value).trim().charAt(0).toUpperCase() || "U";
  }, [name, email]);

  const disable2FA = async () => {
    try {
      setBusy(true);
      setBanner(null);
      await api.post("accounts/2fa/disable/");
      await fetchMe();
      setBanner({ type: "success", text: "2FA disabled successfully." });
    } catch (err) {
      console.error(err);
      setBanner({
        type: "error",
        text: err?.response?.data?.error || "Failed to disable 2FA.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pt-28 pb-16 px-4 sm:px-6 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        {/* Header */}
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-400/20 text-indigo-200 font-black flex items-center justify-center text-2xl overflow-hidden">
                {firstLetter}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {name || "Profile"}
                  </h1>
                  {role ? (
                    <span className="text-xs font-bold px-3 py-1 rounded-full border border-white/10 bg-white/5 text-slate-200 capitalize">
                      {role}
                    </span>
                  ) : null}
                  {isDriver ? (
                    <span className="text-xs font-bold px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
                      Driver
                    </span>
                  ) : null}
                </div>
                <p className="text-slate-300 mt-1">{email || ""}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors"
              >
                <ArrowLeft size={18} />
                Back
              </button>

              {is2FAEnabled ? (
                <button
                  onClick={disable2FA}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15 transition-colors disabled:opacity-60"
                >
                  <XCircle size={18} />
                  Disable 2FA
                </button>
              ) : (
                <button
                  onClick={() => navigate("/setup-2fa")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-[0_0_30px_-8px_rgba(99,102,241,0.6)] transition-all active:scale-[0.99]"
                >
                  <Shield size={18} />
                  Enable 2FA
                </button>
              )}
            </div>
          </div>

          {banner ? (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                banner.type === "success"
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/20 bg-rose-500/10 text-rose-200"
              }`}
            >
              {banner.text}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Account */}
          <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
            <h2 className="text-white font-black text-lg">Profile details</h2>
            <p className="text-slate-300 text-sm mt-1">
              Your basic account information.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                  <User2 size={18} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    Name
                  </p>
                  <p className="text-slate-100 font-semibold mt-1">
                    {name || "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                  <Mail size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    Email
                  </p>
                  <p className="text-slate-100 font-semibold mt-1 truncate">
                    {email || "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    Phone
                  </p>
                  <p className="text-slate-100 font-semibold mt-1">
                    {phoneNumber || "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                  <Shield size={18} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    Sign-in protection
                  </p>
                  <p className="text-slate-100 font-semibold mt-1 flex items-center gap-2">
                    {is2FAEnabled ? (
                      <>
                        <CheckCircle2 size={16} className="text-emerald-300" />
                        2FA enabled
                      </>
                    ) : (
                      <>
                        <XCircle size={16} className="text-rose-300" />
                        2FA not enabled
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
            <h2 className="text-white font-black text-lg">Security</h2>
            <p className="text-slate-300 text-sm mt-1">
              Secure your account with a one-time code from an authenticator app.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 text-slate-100 font-bold">
                <Shield size={18} className="text-indigo-300" />
                Two-factor authentication
              </div>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                {is2FAEnabled
                  ? "2FA is active. You’ll be asked for a 6-digit code at login."
                  : "Enable 2FA to add an extra layer of protection."}
              </p>
              <div className="mt-4">
                {is2FAEnabled ? (
                  <button
                    onClick={disable2FA}
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15 transition-colors disabled:opacity-60"
                  >
                    <XCircle size={18} />
                    Disable 2FA
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/setup-2fa")}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all"
                  >
                    <Shield size={18} />
                    Enable 2FA
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">
                Tip: If codes keep failing, make sure your device time is set to automatic.
              </p>
            </div>
          </div>
        </div>

        {/* Driver application */}
        {driverApplication ? (
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-white font-black text-lg">Driver application</h2>
                <p className="text-slate-300 text-sm mt-1">
                  Track your driver onboarding status.
                </p>
              </div>
              {driverApplication?.status ? (
                <span
                  className={`text-xs font-black px-3 py-1.5 rounded-full border ${
                    driverApplication.status === "approved"
                      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                      : driverApplication.status === "rejected"
                        ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
                        : "border-amber-400/20 bg-amber-500/10 text-amber-200"
                  } capitalize`}
                >
                  {driverApplication.status}
                </span>
              ) : null}
            </div>

            {driverApplication.reviews?.length > 0 ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {driverApplication.reviews.slice(0, 4).map((review, index) => (
                  <div
                    key={index}
                    className={`rounded-2xl border bg-white/5 p-5 ${
                      review.status === "rejected"
                        ? "border-rose-400/20"
                        : "border-emerald-400/20"
                    }`}
                  >
                    <p className="text-slate-100 font-black capitalize">
                      {review.status}
                    </p>
                    {review.reason ? (
                      <p className="text-slate-300 text-sm mt-2 whitespace-pre-line">
                        {review.reason}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-slate-400 mt-3">
                      Reviewed by {review.reviewed_by} on{" "}
                      {new Date(review.reviewed_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300 text-sm">
                No review history yet.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
