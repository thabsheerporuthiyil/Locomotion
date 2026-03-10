import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function ResetPassword() {
  const { resetPassword, loading, error } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [form, setForm] = useState({
    email: location.state?.email || "",
    otp: "",
    new_password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await resetPassword(form);
      navigate("/login", { state: { message: "Password reset successfully! Please login." } });
    } catch {}
  };

  if (!form.email) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <p className="text-rose-600 font-semibold mb-4">Invalid Reset Attempt</p>
          <button onClick={() => navigate("/forgot-password")} className="text-indigo-600 hover:underline font-bold">
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-linear-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6 m-0 overflow-hidden">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md border border-white shadow-2xl rounded-3xl p-10 text-center animate-in fade-in zoom-in duration-300">
        
        {/* Shield/Lock Icon */}
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-100 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.744c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.105-2.591-.307-3.845A11.959 11.959 0 0112 2.714z" />
          </svg>
        </div>

        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
          New Password
        </h2>
        
        <p className="text-slate-500 mb-8 leading-relaxed text-sm">
          Resetting password for <br />
          <span className="font-bold text-slate-700">{form.email}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-5 text-left">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 ml-1">OTP Code</label>
            <input 
              placeholder="Enter 6-digit OTP" 
              value={form.otp}
              onChange={(e) => setForm({...form, otp: e.target.value})} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition duration-200 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 ml-1">New Password</label>
            <input 
              type="password" 
              placeholder="Min. 8 characters" 
              value={form.new_password}
              onChange={(e) => setForm({...form, new_password: e.target.value})} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition duration-200 bg-slate-50/50"
            />
          </div>

          <button 
            disabled={loading} 
            className={`w-full py-4 mt-2 rounded-xl font-bold text-white shadow-lg transition duration-200 transform active:scale-95 ${
              loading 
                ? "bg-slate-400 cursor-not-allowed" 
                : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
            }`}
          >
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-center">
            <p className="text-sm text-rose-600 font-medium">
              {typeof error === 'string' ? error : "Reset failed. Please check the OTP or try again."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}