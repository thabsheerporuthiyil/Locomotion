import axios from "axios";
import { useAuthStore } from "../store/authStore";
import { API_BASE_URL } from "../utils/api_base";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  const isAuthRequest = config.url.includes("accounts/token/refresh") || config.url.includes("accounts/login");
  const access = useAuthStore.getState().access;
  config._accessAtRequest = access || null;

  // Let the browser set the correct multipart boundary for FormData.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  
  if (access && !isAuthRequest) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});


api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    const accessAtRequest = originalRequest?._accessAtRequest || null;

    if (
      originalRequest.url.includes("accounts/token/refresh") ||
      originalRequest.url.includes("accounts/logout")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (!accessAtRequest) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const res = await api.post("accounts/token/refresh/");
        const newAccess = res.data.access;
        const currentAccess = useAuthStore.getState().access;

        if (currentAccess && currentAccess !== accessAtRequest) {
          return Promise.reject(error);
        }

        useAuthStore.getState().setAccess(newAccess);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;

        return api(originalRequest);
      } catch {
        if (useAuthStore.getState().access === accessAtRequest) {
          useAuthStore.getState().clearAuth("Session expired");
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);




export default api;
