import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserRound } from "lucide-react";
import { changeUserRole, deleteUser, fetchUsers } from "../api/authApi";

const roleLabels = { ADMIN: "Админ", CURATOR: "Куратор", MENTOR: "Ментор", USER: "Колдонуучу" };

export default function UserRolePanel({ role }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [userToDelete, setUserToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchUsers().then(setUsers).catch((requestError) => setError(requestError.response?.data?.detail || "Колдонуучуларды жүктөө мүмкүн болгон жок."));
  }, [role]);

  async function handleRoleChange(userId, nextRole) {
    try {
      const updated = await changeUserRole(userId, nextRole);
      setUsers((current) => current.map((user) => user.id === updated.id ? updated : user));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Ролду өзгөртүү мүмкүн болгон жок.");
    }
  }

  async function handleDeleteUser() {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await deleteUser(userToDelete.id);
      setUsers((current) => current.filter((user) => user.id !== userToDelete.id));
      setUserToDelete(null);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.response?.data?.error || "Колдонуучуну өчүрүү мүмкүн болгон жок.");
    } finally {
      setIsDeleting(false);
    }
  }

  const visibleUsers = role === "ADMIN"
    ? users.filter((user) => user.role !== "ADMIN")
    : users.filter((user) => ["USER", "MENTOR"].includes(user.role));

  return (
    <section className="mb-5 rounded-lg border border-[#dfe8df] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3"><ShieldCheck className="text-forest" size={20} /><div><h2 className="font-display text-lg font-bold text-ink">Колдонуучулар жана Ролдор</h2><p className="text-xs text-muted">{role === "ADMIN" ? "Кураторлорду жана менторлорду бекитиңиз" : "Менторлорду бекитиңиз"}</p></div></div>
      {error && <p className="mb-3 text-sm text-[#b9504c]">{error}</p>}
      <div className="divide-y divide-[#edf1ed]">
        {visibleUsers.map((user) => (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={user.id}>
            <div className="flex items-center gap-3"><UserRound className="text-muted" size={18} /><div><p className="text-sm font-bold text-ink">{user.full_name || "Аты көрсөтүлгөн эмес"}</p><p className="text-xs text-muted">{user.email} · {user.is_approved ? "Бекитилген" : "Жаңы катталган"}</p></div></div>
            <select className="h-9 rounded-md border border-[#d6dfd8] bg-white px-2 text-xs font-bold text-ink" disabled={role === "CURATOR" && user.role === "ADMIN"} onChange={(event) => handleRoleChange(user.id, event.target.value)} value={user.role || "USER"}>
              {role === "CURATOR" && user.role !== "MENTOR" && <option value={user.role || "USER"}>{roleLabels[user.role] || roleLabels.USER}</option>}
              <option value="USER">{roleLabels.USER}</option>
              {role === "ADMIN" && <>
                <option value="ADMIN">{roleLabels.ADMIN}</option>
                <option value="CURATOR">{roleLabels.CURATOR}</option>
              </>}
              <option value="MENTOR">{roleLabels.MENTOR}</option>
            </select>
            {role === "ADMIN" && <button aria-label={`${user.full_name || user.email} өчүрүү`} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#fff4f1] px-3 text-xs font-extrabold text-[#b9504c] transition hover:bg-[#fce3de]" onClick={() => setUserToDelete(user)} title="Өчүрүү" type="button"><Trash2 size={15} />Өчүрүү</button>}
          </div>
        ))}
      </div>
      {!visibleUsers.length && <p className="py-6 text-center text-sm text-muted">Кураторлор жана менторлор табылган жок.</p>}
      {userToDelete && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink" id="delete-user-title">Колдонуучуну өчүрүү</h2>
            <p className="mt-3 text-sm leading-6 text-muted">Чын эле бул {roleLabels[userToDelete.role] || "колдонуучу"} аккаунтун жана анын даpoint'терин өчүрүүнү каалайсызбы?</p>
            <p className="mt-2 text-sm font-bold text-ink">{userToDelete.full_name || userToDelete.email}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-md border border-[#d6dfd8] px-4 py-2 text-sm font-bold text-ink transition hover:bg-[#f7faf7]" disabled={isDeleting} onClick={() => setUserToDelete(null)} type="button">Жок / Жабуу</button>
              <button className="rounded-md bg-[#b9504c] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60" disabled={isDeleting} onClick={handleDeleteUser} type="button">{isDeleting ? "Өчүрүлүүдө..." : "Ооба, өчүрүү"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
