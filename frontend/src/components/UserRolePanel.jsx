import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, ShieldAlert, Trash2, UserRound, XCircle } from "lucide-react";
import { changeUserRole, deleteUser, fetchUsers } from "../api/authApi";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_ROLES = [
  { value: "ADMIN",      label: "Администратор",  color: "text-[#FF6B00]",  bg: "bg-[#fff4eb]" },
  { value: "CURATOR",    label: "Куратор",         color: "text-[#1565c0]",  bg: "bg-[#e3f0ff]" },
  { value: "MENTOR",     label: "Ментор",          color: "text-[#2e7d32]",  bg: "bg-[#edf5ee]" },
  { value: "ACCOUNTANT", label: "Бухгалтер",       color: "text-[#6a1b9a]",  bg: "bg-[#f3e5f5]" },
  { value: "USER",       label: "Колдонуучу",      color: "text-[#5a6a7a]",  bg: "bg-[#f0f4f8]" },
];

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map((r) => [r.value, r]));

function roleBadge(role) {
  const r = ROLE_MAP[role] || ROLE_MAP.USER;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${r.bg} ${r.color}`}>
      {r.label}
    </span>
  );
}

// Roles a given actor may assign
function allowedRoles(actorRole, actorIsSuper, targetIsSuper) {
  if (targetIsSuper) return [];                        // nobody touches a superuser
  if (actorIsSuper) return ALL_ROLES;                  // superadmin: all roles
  if (actorRole === "ADMIN") return ALL_ROLES.filter((r) => r.value !== "ADMIN"); // admin: all except ADMIN
  if (actorRole === "CURATOR") return ALL_ROLES.filter((r) => r.value === "MENTOR"); // curator: MENTOR only
  return [];
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null;
  const isOk = toast.type === "success";
  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex max-w-xs items-center gap-3 rounded-lg border px-4 py-3 text-sm font-bold shadow-lg transition-all ${
        isOk ? "border-[#c7e3ce] bg-[#f1f9f2] text-[#2e7d32]" : "border-[#f0c8c1] bg-[#fff4f1] text-[#b9504c]"
      }`}
      role="status"
    >
      {isOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{toast.message}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UserRolePanel({ role: actorRole, user: actorUser }) {
  const actorIsSuper = Boolean(actorUser?.is_superuser);

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);   // userId currently being saved
  const [toast, setToast] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const toastTimer = useRef(null);

  function showToast(type, message) {
    clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchUsers()
      .then((data) => { if (mounted) setUsers(data); })
      .catch((err) => { if (mounted) setError(err.response?.data?.detail || "Колдонуучуларды жүктөө мүмкүн болгон жок."); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [actorRole]);

  async function handleRoleChange(userId, nextRole) {
    setSavingId(userId);
    try {
      const updated = await changeUserRole(userId, nextRole);
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      showToast("success", "Роль успешно обновлена.");
    } catch (err) {
      const msg = err.response?.data?.detail || "Ролду өзгөртүү мүмкүн болгон жок.";
      showToast("error", msg);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await deleteUser(userToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setUserToDelete(null);
      showToast("success", `${userToDelete.full_name || userToDelete.email} өчүрүлдү.`);
    } catch (err) {
      showToast("error", err.response?.data?.detail || err.response?.data?.error || "Колдонуучуну өчүрүү мүмкүн болгон жок.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Filter / search
  const filtered = users.filter((u) => {
    // Never show the actor themselves
    if (actorUser && u.id === actorUser.id) return false;
    // Search
    const q = search.trim().toLowerCase();
    if (q && !u.full_name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
    return true;
  });

  const canDelete = (u) => {
    if (u.is_superuser) return false;
    if (actorIsSuper) return true;
    return actorRole === "ADMIN" && ["CURATOR", "MENTOR"].includes(u.role);
  };

  return (
    <>
      <section className="mb-5 overflow-hidden rounded-xl border border-[#dfe8df] bg-white shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ece8] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff4eb]">
              <ShieldCheck className="text-[#FF6B00]" size={18} />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-[#0B192C] sm:text-lg">
                Колдонуучулар жана Ролдор
              </h2>
              <p className="text-xs text-[#7a8e82]">
                {actorIsSuper
                  ? "Суперадмин — бардык аккаунттарды башкарасыз"
                  : actorRole === "ADMIN"
                  ? "Кураторлорду, менторлорду жана бухгалтерлерди бекитиңиз"
                  : "Менторлорду бекитиңиз"}
              </p>
            </div>
          </div>

          {/* Search */}
          <input
            className="h-9 w-full rounded-md border border-[#d6dfd8] bg-[#f7faf7] px-3 text-sm text-[#0B192C] outline-none placeholder:text-[#aabab0] focus:border-[#FF6B00] sm:w-56"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Издөө (аты, email)..."
            type="search"
            value={search}
          />
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="animate-spin text-[#FF6B00]" size={22} />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-[#b9504c]">{error}</p>
        ) : !filtered.length ? (
          <p className="py-8 text-center text-sm text-[#8a9a90]">
            {search ? "Издөө боюнча колдонуучу табылган жок." : "Колдонуучулар табылган жок."}
          </p>
        ) : (
          <div className="divide-y divide-[#f0f4f0]">
            {filtered.map((u) => {
              const roles = allowedRoles(actorRole, actorIsSuper, u.is_superuser);
              const isSaving = savingId === u.id;
              return (
                <div
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-[#fafcf9] sm:flex-nowrap sm:px-6"
                  key={u.id}
                >
                  {/* Avatar */}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f4f8] text-[#5a6a7a]">
                    {u.is_superuser
                      ? <ShieldAlert size={17} className="text-[#FF6B00]" />
                      : <UserRound size={17} />}
                  </span>

                  {/* Name + email */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-bold text-[#0B192C]">
                        {u.full_name || "—"}
                      </p>
                      {u.is_superuser && (
                        <span className="rounded-full bg-[#fff4eb] px-2 py-0.5 text-[10px] font-extrabold text-[#FF6B00]">
                          SUPERADMIN
                        </span>
                      )}
                      {roleBadge(u.role)}
                    </div>
                    <p className="truncate text-xs text-[#8a9a90]">
                      {u.email}
                      {u.is_approved
                        ? <span className="ml-2 text-[#2e7d32]">✓ Бекитилген</span>
                        : <span className="ml-2 text-[#b9504c]">· Күтүп жатат</span>}
                    </p>
                  </div>

                  {/* Role selector */}
                  {roles.length > 0 ? (
                    <div className="relative">
                      {isSaving && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow">
                          <RefreshCw className="animate-spin text-[#FF6B00]" size={10} />
                        </span>
                      )}
                      <select
                        className="h-9 min-w-[150px] rounded-md border border-[#d6dfd8] bg-white px-2 text-xs font-bold text-[#0B192C] outline-none focus:border-[#FF6B00] disabled:opacity-50"
                        disabled={isSaving}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        value={u.role || "USER"}
                      >
                        {roles.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-xs text-[#aabab0]">Ролду өзгөртүүгө болбойт</span>
                  )}

                  {/* Delete button */}
                  {canDelete(u) && (
                    <button
                      aria-label={`${u.full_name || u.email} өчүрүү`}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#fff4f1] px-3 text-xs font-extrabold text-[#b9504c] transition hover:bg-[#fce3de]"
                      onClick={() => setUserToDelete(u)}
                      type="button"
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline">Өчүрүү</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {!isLoading && !error && (
          <div className="border-t border-[#f0f4f0] px-5 py-2.5 sm:px-6">
            <p className="text-xs text-[#aabab0]">
              {filtered.length} колдонуучу көрсөтүлдү
              {search && ` · "${search}" издөө боюнча`}
            </p>
          </div>
        )}
      </section>

      {/* Delete confirm modal */}
      {userToDelete && (
        <div
          aria-labelledby="del-user-title"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B192C]/50 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="font-display text-lg font-bold text-[#0B192C]" id="del-user-title">
              Колдонуучуну өчүрүү
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#5a6a7a]">
              Чын эле{" "}
              <strong>{userToDelete.full_name || userToDelete.email}</strong>{" "}
              аккаунтун биротоло өчүрүүнү каалайсызбы? Бул аракетти кайтарып болбойт.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-[#d6dfd8] px-4 py-2 text-sm font-bold text-[#0B192C] transition hover:bg-[#f7faf7]"
                disabled={isDeleting}
                onClick={() => setUserToDelete(null)}
                type="button"
              >
                Жок / Жабуу
              </button>
              <button
                className="rounded-md bg-[#b9504c] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                type="button"
              >
                {isDeleting ? "Өчүрүлүүдө..." : "Ооба, өчүрүү"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast toast={toast} />
    </>
  );
}
