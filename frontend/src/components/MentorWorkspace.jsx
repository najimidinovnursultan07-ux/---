import { useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Users } from "lucide-react";
import { fetchAttendance, fetchGroups, fetchStudents } from "../api/attendanceApi";
import { fetchUsers } from "../api/authApi";
import GroupTabs from "./GroupTabs";

function getToday() {
  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export default function MentorWorkspace({ role }) {
  const [mentors, setMentors] = useState([]);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [activeGroupId, setActiveGroupId] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetchUsers()
      .then((users) => {
        if (!isMounted) return;
        const mentorUsers = users.filter((user) => user.role === "MENTOR");
        setMentors(mentorUsers);
        setSelectedMentorId((current) => current || String(mentorUsers[0]?.id || ""));
      })
      .catch((requestError) => {
        if (isMounted) setError(requestError.response?.data?.detail || "Менторлорду жүктөө мүмкүн болгон жок.");
      });
    return () => { isMounted = false; };
  }, [role]);

  useEffect(() => {
    if (!selectedMentorId) {
      setGroups([]);
      setStudents([]);
      setAttendance([]);
      setIsLoading(false);
      return undefined;
    }
    let isMounted = true;
    setIsLoading(true);
    setError("");
    Promise.all([
      fetchGroups(selectedMentorId),
      fetchStudents(undefined, selectedMentorId),
      fetchAttendance(selectedDate, selectedMentorId),
    ])
      .then(([loadedGroups, loadedStudents, records]) => {
        if (!isMounted) return;
        setGroups(loadedGroups);
        setStudents(loadedStudents);
        setAttendance(records);
        setActiveGroupId("all");
      })
      .catch((requestError) => {
        if (isMounted) setError(requestError.response?.data?.detail || "Ментордун жумуш мейкиндигин жүктөө мүмкүн болгон жок.");
      })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, [selectedDate, selectedMentorId]);

  const visibleStudents = useMemo(
    () => activeGroupId === "all" ? students : students.filter((student) => String(student.group_id) === activeGroupId),
    [activeGroupId, students],
  );
  const presentIds = useMemo(() => new Set(attendance.filter((record) => record.is_present).map((record) => record.student_id)), [attendance]);
  const selectedMentor = mentors.find((mentor) => String(mentor.id) === selectedMentorId);

  return (
    <section className="mb-6 min-w-0 rounded-lg border border-[#dfe8df] bg-white p-4 shadow-panel sm:p-5">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-coral-dark">МОНИТОРИНГ</p>
          <h2 className="font-display text-xl font-bold text-ink">Менторлор жана Тайпалар</h2>
        </div>
        <label className="flex w-full min-w-0 items-center gap-2 text-xs font-extrabold text-muted sm:w-auto sm:min-w-60">
          <Users size={16} className="text-forest" />
          <select className="h-10 flex-1 rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-bold text-ink" onChange={(event) => setSelectedMentorId(event.target.value)} value={selectedMentorId}>
            <option value="">Менторду тандаңыз</option>
            {mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name || mentor.email}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="mb-4 rounded-md bg-[#fff4f1] px-3 py-2 text-sm text-[#b9504c]">{error}</p>}
      {isLoading ? <div className="flex justify-center py-10"><RefreshCw className="animate-spin text-forest" size={24} /></div> : selectedMentor ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#f7faf7] px-4 py-3">
            <div><p className="font-bold text-ink">{selectedMentor.full_name || selectedMentor.email}</p><p className="text-xs text-muted">{groups.length} тайпа · {students.length} активдүү окуучу</p></div>
            <label className="flex items-center gap-2 text-xs font-bold text-muted"><CalendarDays size={16} /><input className="h-9 rounded-md border border-[#d6dfd8] bg-white px-2 text-sm font-bold text-ink" onChange={(event) => setSelectedDate(event.target.value)} type="date" value={selectedDate} /></label>
          </div>
          <GroupTabs activeGroupId={activeGroupId} canDelete={false} groups={groups} onGroupChange={setActiveGroupId} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead><tr className="bg-[#fafcf9] text-left text-[11px] font-extrabold uppercase tracking-wider text-muted"><th className="px-4 py-3">Окуучу</th><th className="px-4 py-3">Тайпа</th><th className="px-4 py-3 text-center">Катышты</th><th className="px-4 py-3">Формат</th></tr></thead>
              <tbody>{visibleStudents.map((student) => { const record = attendance.find((item) => item.student_id === student.id); return <tr className="border-t border-[#e6ece8]" key={student.id}><td className="px-4 py-3 text-sm font-semibold text-ink">{student.full_name}</td><td className="px-4 py-3 text-sm text-muted">{student.group_name}</td><td className="px-4 py-3 text-center text-sm font-bold">{presentIds.has(student.id) ? "Келди" : "Келген жок"}</td><td className="px-4 py-3 text-sm text-muted">{record?.attendance_type === "ONLINE" ? "Онлайн" : "Оффлайн"}</td></tr>; })}</tbody>
            </table>
            {!visibleStudents.length && <p className="py-8 text-center text-sm text-muted">Бул ментордо окуучулар жок.</p>}
          </div>
        </>
      ) : <p className="py-8 text-center text-sm text-muted">Катталган менторлор табылган жок.</p>}
    </section>
  );
}
