import axios from "axios";
import { useAuthStore } from "../store/authStore";
import { API_BASE_URL } from "../utils/api_base";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const isAuthRequest = config.url.includes("accounts/token/refresh") || config.url.includes("accounts/login");
  const access = useAuthStore.getState().access;
  
  if (access && !isAuthRequest) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});


api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (
      originalRequest.url.includes("accounts/token/refresh") ||
      originalRequest.url.includes("accounts/logout")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const res = await api.post("accounts/token/refresh/");
        const newAccess = res.data.access;

        useAuthStore.getState().setAccess(newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;

        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
      }
    }

    return Promise.reject(error);
  }
);




export default api;
