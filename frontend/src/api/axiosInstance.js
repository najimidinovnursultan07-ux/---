import axios from "axios";
import { clearAuth, getToken, isAuthenticated } from "./tokenStorage";

const API_URL = (import.meta.env.VITE_API_URL || "https://mentor-0qlv.onrender.com")
  .replace(/^\[|\]$/g, "")
  .replace(/\/+$/, "");

const axiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request: attach token from storage (never hardcoded) ─────────────────────
axiosInstance.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

// ── Response: on 401, clear credentials and redirect to login ────────────────
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const wasAuthenticated = isAuthenticated();
      clearAuth();
      if (wasAuthenticated && window.location.pathname !== "/") {
        window.location.replace("/");
      }
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
