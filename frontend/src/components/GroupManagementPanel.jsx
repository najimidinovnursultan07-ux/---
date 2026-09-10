import { useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { createGroup, fetchGroups } from "../api/attendanceApi";
import { fetchUsers } from "../api/authApi";

export default function GroupManagementPanel({ canManage, deletedGroupId, onGroupCreated, role }) {
  const [groups, setGroups] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [name, setName] = useState("");
  const [mentorId, setMentorId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchGroups(), role === "ADMIN" ? fetchUsers() : Promise.resolve([])])
      .then(([loadedGroups, users]) => {
        setGroups(loadedGroups);
        setMentors(users.filter((user) => user.role === "MENTOR"));
      })
      .catch((requestError) => setError(requestError.response?.data?.detail || "Тайпаларды жүктөө мүмкүн болгон жок."));
  }, [role]);

  useEffect(() => {
    if (deletedGroupId) setGroups((current) => current.filter((group) => group.id !== deletedGroupId));
  }, [deletedGroupId]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      const group = await createGroup({ name: name.trim(), ...(role === "ADMIN" && mentorId ? { mentor_id: Number(mentorId) } : {}) });
      setGroups((current) => [...current, group].sort((first, second) => first.name.localeCompare(second.name, "ky")));
      onGroupCreated(group);
      setName("");
      setMentorId("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Тайпа түзүү мүмкүн болгон жок.");
    }
  }

  return (
    <section className="mb-5 rounded-lg border border-[#dfe8df] bg-white p-5 shadow-sm" id="group-management-panel">
      <div className="mb-4 flex items-center gap-3"><Layers className="text-forest" size={20} /><div><h2 className="font-display text-lg font-bold text-ink">Тайпалар жана менторлор</h2><p className="text-xs text-muted">Бир ментор бир нече тайпаны башкара алат.</p></div></div>
      {canManage && <form className="mb-4 flex flex-wrap gap-2" onSubmit={handleSubmit}>
        <input className="h-10 w-full min-w-0 flex-1 rounded-md border border-[#d6dfd8] px-3 text-sm outline-none focus:border-forest sm:min-w-44 sm:w-auto" onChange={(event) => setName(event.target.value)} placeholder="Тайпанын аты" required value={name} />
        {role === "ADMIN" && <select className="h-10 w-full min-w-0 rounded-md border border-[#d6dfd8] bg-white px-3 text-sm outline-none focus:border-forest sm:min-w-44 sm:w-auto" onChange={(event) => setMentorId(event.target.value)} value={mentorId}><option value="">Менторду тандаңыз</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name || mentor.email}</option>)}</select>}
        <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-xs font-extrabold text-white hover:bg-[#2b3a40] sm:w-auto" type="submit"><Plus size={16} />Кошуу</button>
      </form>}
      {error && <p className="mb-3 text-sm text-[#b9504c]">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">{groups.map((group) => <div className="flex items-center justify-between rounded-md border border-[#edf1ed] px-3 py-2" key={group.id}><span className="text-sm font-bold text-ink">{group.name}</span><span className="text-xs text-muted">{group.student_count} окуучу</span></div>)}</div>
    </section>
  );
}
