import axiosInstance from "./axiosInstance";

export async function login(email, password) {
  const { data } = await axiosInstance.post("/auth/login/", { email, password });
  return data;
}

export async function register(fullName, email, password) {
  const { data } = await axiosInstance.post("/auth/register/", {
    full_name: fullName,
    email,
    password,
  });
  return data;
}

export async function fetchMe() {
  const { data } = await axiosInstance.get("/auth/me/");
  return data;
}

export async function updateProfile(fullName) {
  const { data } = await axiosInstance.patch("/auth/me/", { full_name: fullName });
  return data;
}

export async function fetchUsers() {
  const { data } = await axiosInstance.get("/users/");
  return data;
}

export async function changeUserRole(userId, role) {
  const { data } = await axiosInstance.patch(`/users/${userId}/change-role/`, { role });
  return data;
}

export async function deleteUser(userId) {
  await axiosInstance.delete(`/users/${userId}/`);
}
