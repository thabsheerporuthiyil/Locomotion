import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Register() {
  const { register, loading, error } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm_password: "",
  });

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await register(form);
      navigate("/verify-otp", { state: { email: form.email } });
    } catch (registerError) {
      console.error("Registration failed:", registerError);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex relative items-center justify-center p-4 overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-10 relative z-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white tracking-tight">Create Account</h2>
          <p className="text-indigo-200 mt-2 font-medium">Join us to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Full Name</label>
            <input name="name" type="text" placeholder="John Doe" onChange={handleChange} className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner" required />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Email Address</label>
            <input name="email" type="email" placeholder="you@example.com" onChange={handleChange} className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner" required />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Password</label>
            <input name="password" type="password" placeholder="••••••••" onChange={handleChange} className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner" required />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Confirm Password</label>
            <input name="confirm_password" type="password" placeholder="••••••••" onChange={handleChange} className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner" required />
          </div>

          <button
            disabled={loading}
            className={`w-full py-4 mt-2 rounded-xl font-bold text-white shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all duration-300 uppercase tracking-wide ${loading ? "bg-indigo-500/50 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_50px_-5px_rgba(79,70,229,0.7)] active:scale-[0.98] transform hover:-translate-y-0.5"}`}
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl backdrop-blur-sm">
            <p className="text-sm text-rose-400 font-medium text-center">
              {error.password || error.error || "Registration failed. Please check your details."}
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-slate-400 text-sm font-medium">
          Already have an account? <button onClick={() => navigate("/login")} className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Sign In</button>
        </p>
      </div>
    </div>
  );
}
