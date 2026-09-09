import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "http://127.0.0.1:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("attendance-token");
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = Boolean(window.localStorage.getItem("attendance-token"));
      window.localStorage.removeItem("attendance-token");
      window.localStorage.removeItem("attendance-role");
      if (hadToken && window.location.pathname !== "/") {
        window.location.replace("/");
      }
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
