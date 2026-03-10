import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { GoogleLogin } from "@react-oauth/google";

export default function Login() {
  const { login, loading, error, googleLogin } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await login(form);

      if (res?.otpRequired) {
        if (res.type === "email_otp") {
          navigate("/verify-otp", { state: { email: form.email } });
        } else if (res.type === "totp") {
          navigate("/verify-2fa", {
            state: { userId: res.userId },
          });
        }
        return;
      }

      if (res.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/");
      }
    } catch { }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex relative items-center justify-center p-4 overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-10 relative z-10">

        {/* Header Section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white tracking-tight">Welcome Back</h2>
          <p className="text-indigo-200 mt-2 font-medium">Sign in to your account</p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Email Address</label>
            <input
              name="email"
              type="email"
              placeholder="name@company.com"
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200 shadow-inner"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition duration-200"
            >
              Forgot Password?
            </button>
          </div>

          <button
            disabled={loading}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all duration-300 uppercase tracking-wide ${loading
              ? "bg-indigo-500/50 cursor-not-allowed"
              : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_50px_-5px_rgba(79,70,229,0.7)] active:scale-[0.98] transform hover:-translate-y-0.5"
              }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center">
          <div className="flex-1 border-t border-slate-700"></div>
          <span className="px-4 text-sm text-slate-500 font-medium">OR</span>
          <div className="flex-1 border-t border-slate-700"></div>
        </div>

        {/* Google Login */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                const res = await googleLogin(credentialResponse.credential);

                if (res?.otpRequired) {
                  if (res.type === "totp") {
                    navigate("/verify-2fa", {
                      state: { userId: res.userId },
                    });
                  }
                  return;
                }

                if (res.role === "admin") {
                  navigate("/admin/dashboard");
                } else {
                  navigate("/");
                }
              } catch { }
            }}
            onError={() => {
              console.log("Google Login Failed");
            }}
          />
        </div>

        {/* Error Handling */}
        {error && (
          <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl backdrop-blur-sm">
            <p className="text-sm text-rose-400 text-center font-medium">
              {typeof error === 'string' ? error : "Invalid credentials. Please try again."}
            </p>
          </div>
        )}

        {/* Footer Link */}
        <p className="mt-8 text-center text-slate-400 text-sm font-medium">
          Don't have an account?{" "}
          <button
            onClick={() => navigate("/register")}
            className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Create one
          </button>
        </p>

      </div>
    </div>
  );
}