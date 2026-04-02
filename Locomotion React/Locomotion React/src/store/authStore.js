import { create } from "zustand";
import api from "../api/axios";

const normalizeApiError = (err, fallback) => {
  const data = err?.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    return data.error || data.detail || fallback;
  }
  return fallback;
};

const emptyAuthState = {
  access: null,
  role: null,
  name: null,
  email: null,
  profileImageUrl: null,
  isDriver: false,
  hasApplied: false,
  is2FAEnabled: false,
  phoneNumber: null,
  driverApplication: null,
};

export const useAuthStore = create((set, get) => ({
  ...emptyAuthState,
  loading: false,
  error: null,

  setAccess: (access) => set({ access }),
  setUserData: (data = {}) =>
    set((state) => ({
      ...state,
      role: data.role ?? state.role,
      name: data.name ?? state.name,
      email: data.email ?? state.email,
      profileImageUrl: data.profile_image_url ?? state.profileImageUrl,
      isDriver: data.is_driver ?? state.isDriver,
      hasApplied: data.has_applied ?? state.hasApplied,
      is2FAEnabled: data.is_2fa_enabled ?? state.is2FAEnabled,
      phoneNumber: data.phone_number ?? state.phoneNumber,
      driverApplication: data.driver_application ?? state.driverApplication,
    })),
  clearAuth: (error = null) =>
    set({
      ...emptyAuthState,
      loading: false,
      error,
    }),

  // ---------------- FETCH ME ----------------
  fetchMe: async () => {
    try {
      const res = await api.get("accounts/me/", {
        params: { _: Date.now() },
      });
      get().setUserData(res.data);
      return res.data;
    } catch (err) {
      console.error("Me fetch failed", err);
      const statusCode = err?.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        get().clearAuth(normalizeApiError(err, "Session expired"));
      }
      throw err;
    }
  },

  // ---------------- REHYDRATE ----------------
  rehydrateAuth: async () => {
    const accessAtStart = get().access;
    try {
      const res = await api.post("accounts/token/refresh/");
      set({ access: res.data.access });

      await get().fetchMe();

      return true;
    } catch {
      // If a fresh login completed while this old refresh request was still in flight,
      // do not wipe the newer auth state.
      if (get().access === accessAtStart) {
        get().clearAuth();
        return false;
      }
      return true;
    }
  },

  // ---------------- REGISTER ----------------
  register: async (data) => {
    try {
      set({ loading: true, error: null });
      const res = await api.post("accounts/register/", data);
      set({ loading: false });
      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: err.response?.data || "Registration failed",
      });
      throw err;
    }
  },

  // ---------------- LOGIN ----------------
  login: async (data) => {
    try {
      set({ loading: true, error: null });
      const res = await api.post("accounts/login/", data);

      if (res.data.otp_required) {
        set({ loading: false });

        return {
          otpRequired: true,
          type: res.data.type,
          userId: res.data.user_id,
        };
      }

      set({
        access: res.data.access,
        role: res.data.role || null,
        name: res.data.name || null,
        loading: false,
      });

      await get().fetchMe();

      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: normalizeApiError(err, "Login failed"),
      });
      throw err;
    }
  },

  // ---------------- GOOGLE LOGIN ----------------
  googleLogin: async (credential) => {
    try {
      set({ loading: true, error: null });

      const res = await api.post("accounts/auth/google/", {
        token: credential,
      });

      if (res.data.otp_required) {
        set({ loading: false });

        return {
          otpRequired: true,
          type: res.data.type,
          userId: res.data.user_id,
        };
      }

      set({
        access: res.data.access,
        role: res.data.role || null,
        name: res.data.name || null,
        loading: false,
      });

      await get().fetchMe();

      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: normalizeApiError(err, "Google login failed"),
      });
      throw err;
    }
  },

  // ---------------- VERIFY OTP ----------------
  verifyOTP: async (data) => {
    try {
      set({ loading: true, error: null });
      const res = await api.post("accounts/verify-otp/", data);

      set({
        access: res.data.access,
        loading: false,
      });

      await get().fetchMe();

      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: normalizeApiError(err, "OTP verification failed"),
      });
      throw err;
    }
  },

  // ---------------- FORGOT PASSWORD ----------------
  forgotPassword: async (email) => {
    try {
      set({ loading: true, error: null });
      const res = await api.post("accounts/forgot-password/", { email });
      set({ loading: false });
      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: normalizeApiError(err, "Failed to send OTP"),
      });
      throw err;
    }
  },

  // ---------------- RESET PASSWORD ----------------
  resetPassword: async (data) => {
    try {
      set({ loading: true, error: null });
      const res = await api.post("accounts/reset-password/", data);
      set({ loading: false });
      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: normalizeApiError(err, "Reset password failed"),
      });
      throw err;
    }
  },

  updateProfile: async (payload) => {
    const res = await api.patch("accounts/me/", payload);
    get().setUserData(res.data);
    return res.data;
  },

  // ---------------- LOGOUT ----------------
  logout: async () => {
    try {
      await api.post("accounts/logout/");
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      get().clearAuth();
    }
  },
}));
