import { useEffect, useState } from "react";
import { CalendarDays, Check, Cloud, RefreshCw, Save, UserRound } from "lucide-react";
import { fetchAttendance, saveAttendanceModes } from "../api/attendanceApi";

function getToday() {
  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export default function AttendanceModeSection({ initialDate = getToday(), students, canEdit, onSaved }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [records, setRecords] = useState([]);
  const [modeMap, setModeMap] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const presentRecords = records.filter((record) => record.is_present);
  const presentStudents = presentRecords.map((record) => ({
    id: record.student_id,
    full_name: record.full_name || students.find((student) => student.id === record.student_id)?.full_name || "",
    group_name: record.group_name || students.find((student) => student.id === record.student_id)?.group_name || "",
  }));
  const canEditDate = canEdit && selectedDate === getToday();

  useEffect(() => {
    let isMounted = true;

    async function loadDateAttendance() {
      setIsLoading(true);
      setError("");
      try {
        const dateRecords = await fetchAttendance(selectedDate);
        if (isMounted) setRecords(dateRecords);
      } catch (loadError) {
        if (isMounted) setError(loadError.response?.data?.detail || "Катышуу маалыматтарын жүктөө мүмкүн болгон жок.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDateAttendance();
    return () => {
      isMounted = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    const nextModes = {};
    presentRecords.forEach((record) => {
      nextModes[record.student_id] = record.attendance_type || "OFFLINE";
    });
    setModeMap(nextModes);
  }, [records]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveAttendanceModes(selectedDate, presentStudents.map((student) => ({
        student_id: student.id,
        attendance_type: modeMap[student.id] || "OFFLINE",
      })));
      onSaved("Формат боюнча катышуу сакталды.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#e6ece8] bg-white shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6ece8] px-5 py-5 sm:px-7">
        <div className="w-full">
          <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-coral-dark">ФОРМАТ БОЮНЧА КАТЫШУУ</p>
          <h1 className="font-display text-2xl text-ink sm:text-3xl">Онлайн / Оффлайн</h1>
          <label className="mt-4 flex max-w-xs items-center gap-2 text-xs font-extrabold text-muted" htmlFor="attendance-mode-date"><CalendarDays size={16} className="text-forest" />Дата
            <input className="h-10 flex-1 rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-bold text-ink outline-none focus:border-forest" id="attendance-mode-date" onChange={(event) => setSelectedDate(event.target.value)} type="date" value={selectedDate} />
          </label>
          <p className="mt-2 text-sm text-muted">{selectedDate} · келген {presentStudents.length} окуучу</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-xs font-extrabold text-white transition hover:bg-[#2b3a40] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canEditDate || !presentStudents.length || isSaving} onClick={handleSave} type="button">
          <Save size={16} />{isSaving ? "Сакталууда..." : "Баарын сактоо"}
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center px-5 py-12"><RefreshCw className="animate-spin text-forest" size={24} /></div>
      ) : error ? (
        <div className="px-5 py-12 text-center text-sm text-[#b9504c] sm:px-7">{error}</div>
      ) : !presentStudents.length ? (
        <div className="px-5 py-12 text-center text-sm text-muted sm:px-7">Бул күнү келген окуучулар табылган жок.</div>
      ) : (
        <div className="divide-y divide-[#e6ece8]">
          {presentStudents.map((student) => (
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={student.id}>
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf5ee] text-forest"><UserRound size={17} /></span><div><p className="font-bold text-ink">{student.full_name}</p><p className="text-xs text-muted">{student.group_name}</p></div></div>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Катышуу форматы: ${student.full_name}`}>
                <button className={`inline-flex min-w-[124px] items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-extrabold transition ${modeMap[student.id] === "OFFLINE" ? "border-forest bg-[#edf5ee] text-forest" : "border-[#d6dfd8] text-muted"}`} disabled={!canEdit} onClick={() => setModeMap((current) => ({ ...current, [student.id]: "OFFLINE" }))} type="button"><Check className={modeMap[student.id] === "OFFLINE" ? "opacity-100" : "opacity-0"} size={15} />Оффлайн</button>
                <button className={`inline-flex min-w-[124px] items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-extrabold transition ${modeMap[student.id] === "ONLINE" ? "border-[#4e8c9b] bg-[#edf7f8] text-[#367585]" : "border-[#d6dfd8] text-muted"}`} disabled={!canEdit} onClick={() => setModeMap((current) => ({ ...current, [student.id]: "ONLINE" }))} type="button"><Cloud size={15} />Онлайн</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}