import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function VerifyOTP() {
  const { verifyOTP, resendSignupOTP, loading, error } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const email = useMemo(
    () => location.state?.email || sessionStorage.getItem("pendingSignupEmail"),
    [location.state]
  );
  const isRegisterFlow = location.state?.flow === "register" || sessionStorage.getItem("pendingSignupEmail") === email;
  const [otp, setOtp] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  
  if (!email) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <p className="text-rose-600 font-semibold text-lg mb-4">Invalid Access</p>
          <button 
            onClick={() => navigate("/login")}
            className="text-indigo-600 hover:underline font-bold"
          >
            Go back to Login
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await verifyOTP({ email, otp });
      if (res?.role === "admin") {
        setTimeout(() => {
          navigate("/admin/dashboard", { replace: true });
        }, 100);
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      console.error("Verification failed", err);
    }
  };

  const handleResend = async () => {
    try {
      const res = await resendSignupOTP(email);
      setInfoMessage(res?.message || "OTP sent again.");
    } catch (err) {
      console.error("Resend failed", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-10 text-center">
        
        {/* Security Icon */}
        <div className="mx-auto w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Verify OTP</h2>
        <p className="text-slate-500 mb-8">
          We sent a code to <br />
          <span className="font-semibold text-slate-800">{email}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="text"
            maxLength="6"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full text-center text-3xl tracking-[1em] font-mono px-4 py-4 rounded-xl border-2 border-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 bg-slate-50"
            required
          />

          <button
            disabled={loading || otp.length !== 6}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition duration-200 ${
              loading || otp.length !== 6
                ? "bg-slate-300 cursor-not-allowed shadow-none" 
                : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]"
            }`}
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </form>

        {isRegisterFlow && (
          <div className="mt-5 text-sm text-slate-500">
            Didn&apos;t get the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-slate-400"
            >
              Resend OTP
            </button>
          </div>
        )}

        {infoMessage && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
            <p className="text-sm text-emerald-700 font-medium text-center">{infoMessage}</p>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl">
            <p className="text-sm text-rose-600 font-medium text-center">
              {typeof error === 'string' ? error : "Verification failed. Please check the code."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
