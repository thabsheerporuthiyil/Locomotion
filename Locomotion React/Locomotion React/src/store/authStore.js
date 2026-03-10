import { create } from "zustand";
import api from "../api/axios";

export const useAuthStore = create((set, get) => ({
  access: null,
  role: null,
  name: null,
  email: null,
  isDriver: false,
  hasApplied: false,
  loading: false,
  error: null,
  is2FAEnabled: false,
  phoneNumber: null,
  driverApplication: null,

  setAccess: (access) => set({ access }),

  // ---------------- FETCH ME ----------------
  fetchMe: async () => {
    try {
      const res = await api.get("accounts/me/");
      set({
        role: res.data.role,
        name: res.data.name,
        email: res.data.email,
        isDriver: res.data.is_driver,
        hasApplied: res.data.has_applied,
        is2FAEnabled: res.data.is_2fa_enabled,
        phoneNumber: res.data.phone_number,
        driverApplication: res.data.driver_application || null,
      });
    } catch (err) {
      console.error("Me fetch failed", err);
      get().logout();
    }
  },

  // ---------------- REHYDRATE ----------------
  rehydrateAuth: async () => {
    try {
      const res = await api.post("accounts/token/refresh/");
      set({ access: res.data.access });

      await get().fetchMe();

      return true;
    } catch {
      set({
        access: null,
        role: null,
        name: null,
        email: null,
        isDriver: false,
        hasApplied: false,
        phoneNumber: null,
      });
      return false;
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
        loading: false,
      });

      await get().fetchMe();

      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: err.response?.data || "Login failed",
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
        loading: false,
      });

      await get().fetchMe();

      return res.data;
    } catch (err) {
      set({
        loading: false,
        error: err.response?.data || "Google login failed",
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
        error: err.response?.data || "OTP verification failed",
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
        error: err.response?.data || "Failed to send OTP",
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
        error: err.response?.data || "Reset password failed",
      });
      throw err;
    }
  },

  // ---------------- LOGOUT ----------------
  logout: async () => {
    try {
      await api.post("accounts/logout/");
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      set({
        access: null,
        role: null,
        name: null,
        email: null,
        isDriver: false,
        hasApplied: false,
        is2FAEnabled: false,
        phoneNumber: null,
        driverApplication: null,
      });
    }
  },
}));