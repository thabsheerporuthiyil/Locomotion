import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function ForgotPassword() {
  const { forgotPassword, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await forgotPassword(email);
      navigate("/reset-password", { state: { email } });
    } catch {}
  };

  return (
    <div className="h-screen w-screen bg-linear-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6 m-0 overflow-hidden">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md border border-white shadow-2xl rounded-3xl p-10 text-center animate-in fade-in zoom-in duration-300">
        
        {/* Key Icon Container */}
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500 shadow-lg shadow-amber-100 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>

        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
          Forgot Password?
        </h2>
        
        <p className="text-slate-500 mb-8 leading-relaxed">
          No worries! Enter your email below and we'll send you an OTP to reset your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-left">
            <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">
              Email Address
            </label>
            <input 
              type="email" 
              placeholder="name@company.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 bg-slate-50/50"
            />
          </div>

          <button 
            disabled={loading} 
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition duration-200 transform active:scale-95 ${
              loading 
                ? "bg-slate-400 cursor-not-allowed" 
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending...
              </span>
            ) : (
              "Send OTP"
            )}
          </button>
        </form>

        {/* Dynamic Error Message */}
        {error && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl">
            <p className="text-sm text-rose-600 font-medium italic">
              {typeof error === 'string' ? error : "Something went wrong. Please check the email address."}
            </p>
          </div>
        )}

        <div className="mt-8">
          <button 
            onClick={() => navigate("/login")}
            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}