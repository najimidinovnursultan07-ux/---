/**
 * tokenStorage.js — Single source of truth for auth token management.
 *
 * All reads and writes of the auth token go through this module.
 * No component or API file should use `localStorage` directly.
 *
 * Storage: window.localStorage  (survives page refresh, cleared on logout/401)
 * Token format: Django REST Framework Token ("Token <hex>")
 */

const TOKEN_KEY = "attendance-token";
const ROLE_KEY  = "attendance-role";

/** Read the stored token (null if absent). */
export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY) || null;
}

/** Persist the token after successful login / registration. */
export function setToken(token) {
  if (!token) return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

/** Read the cached role (used to survive a page reload before /api/auth/me/ resolves). */
export function getRole() {
  return window.localStorage.getItem(ROLE_KEY) || null;
}

/** Persist the role after login or role change. */
export function setRole(role) {
  if (!role) return;
  window.localStorage.setItem(ROLE_KEY, role);
}

/**
 * Full logout: wipe token + role from storage.
 * Called on explicit logout AND on 401 responses.
 */
export function clearAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
}

/** True when a token is present in storage (does not validate against server). */
export function isAuthenticated() {
  return Boolean(getToken());
}
