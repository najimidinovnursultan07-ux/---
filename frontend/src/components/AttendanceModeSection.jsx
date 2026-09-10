import { useEffect, useMemo, useState } from "react";
import { CalendarDays, MonitorSmartphone, Save, Search, UserRound, Wifi, WifiOff } from "lucide-react";
import { fetchAttendance, saveAttendance, saveAttendanceModes } from "../api/attendanceApi";

function getToday() {
  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

// Three-way status per student: "OFFLINE" | "ONLINE" | "ABSENT"
function buildStatusMap(records) {
  const map = {};
  for (const rec of records) {
    if (!rec.is_present) {
      map[rec.student_id] = "ABSENT";
    } else {
      map[rec.student_id] = rec.attendance_type === "ONLINE" ? "ONLINE" : "OFFLINE";
    }
  }
  return map;
}

const STATUS_OPTIONS = [
  {
    value: "OFFLINE",
    label: "Келди (Оффлайн)",
    activeClass: "border-forest bg-[#edf5ee] text-forest",
    icon: <MonitorSmartphone size={14} />,
  },
  {
    value: "ONLINE",
    label: "Келди (Онлайн)",
    activeClass: "border-[#4e8c9b] bg-[#edf7f8] text-[#367585]",
    icon: <Wifi size={14} />,
  },
  {
    value: "ABSENT",
    label: "Келген жок",
    activeClass: "border-[#c0392b] bg-[#fff0ed] text-[#b9504c]",
    icon: <WifiOff size={14} />,
  },
];

export default function AttendanceModeSection({ initialDate = getToday(), students, canEdit, onSaved }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [records, setRecords] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const canEditDate = canEdit && selectedDate === getToday();

  // Load attendance records for the selected date
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");
    fetchAttendance(selectedDate)
      .then((dateRecords) => {
        if (!isMounted) return;
        setRecords(dateRecords);
        setStatusMap(buildStatusMap(dateRecords));
      })
      .catch((err) => {
        if (isMounted) setError(err.response?.data?.detail || "Катышуу маалыматтарын жүктөө мүмкүн болгон жок.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, [selectedDate]);

  // Enrich students with record lookup for display
  const displayStudents = useMemo(() => {
    const recordMap = new Map(records.map((r) => [r.student_id, r]));
    // Use students prop as the source of truth for the list; fall back to records
    const base = students.length
      ? students
      : records.map((r) => ({ id: r.student_id, full_name: r.full_name || "", group_name: r.group_name || "" }));
    return base.map((s) => ({
      ...s,
      group_name: s.group_name || recordMap.get(s.id)?.group_name || "",
    }));
  }, [students, records]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayStudents;
    return displayStudents.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.group_name || "").toLowerCase().includes(q) ||
        (s.phone || "").includes(q),
    );
  }, [displayStudents, search]);

  const presentCount = useMemo(
    () => Object.values(statusMap).filter((v) => v !== "ABSENT").length,
    [statusMap],
  );

  function setStatus(studentId, value) {
    if (!canEditDate) return;
    setStatusMap((prev) => ({ ...prev, [studentId]: value }));
  }

  async function handleSave() {
    if (!canEditDate) return;
    setIsSaving(true);
    try {
      // 1) Save is_present via save-bulk
      const bulkRecords = displayStudents.map((s) => ({
        student_id: s.id,
        is_present: statusMap[s.id] !== "ABSENT",
      }));
      await saveAttendance(selectedDate, bulkRecords);

      // 2) Save attendance_type for present students via save-mode
      const presentStudents = displayStudents.filter((s) => statusMap[s.id] !== "ABSENT");
      if (presentStudents.length) {
        await saveAttendanceModes(
          selectedDate,
          presentStudents.map((s) => ({
            student_id: s.id,
            attendance_type: statusMap[s.id] === "ONLINE" ? "ONLINE" : "OFFLINE",
          })),
        );
      }
      onSaved?.("Катышуу ийгиликтүү сакталды.");
    } catch (err) {
      onSaved?.({ type: "error", message: err.response?.data?.detail || "Сактоо ишке ашкан жок." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#e6ece8] bg-white shadow-panel">
      {/* Header */}
      <div className="border-b border-[#e6ece8] px-5 py-5 sm:px-7">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-coral-dark">
          КАТЫШУУ ЖУРНАЛЫ
        </p>
        <h1 className="font-display text-2xl text-ink sm:text-3xl">Келди / Онлайн / Жок</h1>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-xs font-extrabold text-muted" htmlFor="mode-date">
            <CalendarDays size={16} className="text-forest" />
            Дата
            <input
              className="h-10 rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-bold text-ink outline-none focus:border-forest"
              id="mode-date"
              onChange={(e) => setSelectedDate(e.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <p className="text-sm text-muted">
            {selectedDate} · {presentCount} окуучу келди
          </p>
          <button
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-xs font-extrabold text-white transition hover:bg-[#2b3a40] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canEditDate || !displayStudents.length || isSaving}
            onClick={handleSave}
            type="button"
          >
            <Save size={16} />
            {isSaving ? "Сакталууда..." : "Баарын сактоо"}
          </button>
        </div>
        {/* Search */}
        {displayStudents.length > 0 && (
          <div className="relative mt-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
            <input
              className="h-10 w-full rounded-md border border-[#d6dfd8] bg-[#f7faf7] pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-forest focus:bg-white"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Окуучуну издөө..."
              type="search"
              value={search}
            />
          </div>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex justify-center px-5 py-12">
          <img alt="Жүктөлүүдө" className="h-14 w-14 animate-pulse rounded-full object-contain" src="/logo.jpg" />
        </div>
      ) : error ? (
        <div className="px-5 py-12 text-center text-sm text-[#b9504c] sm:px-7">{error}</div>
      ) : !filteredStudents.length ? (
        <div className="px-5 py-12 text-center text-sm text-muted sm:px-7">
          {search ? "Издөө боюнча окуучу табылган жок." : "Бул күнү окуучулар табылган жок."}
        </div>
      ) : (
        <div className="divide-y divide-[#e6ece8]">
          {filteredStudents.map((student) => {
            const current = statusMap[student.id] ?? "ABSENT";
            return (
              <div
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-0 sm:px-7"
                key={student.id}
              >
                {/* Student info */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf5ee] text-forest">
                    <UserRound size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{student.full_name}</p>
                    <p className="text-xs text-muted">{student.group_name}</p>
                  </div>
                </div>

                {/* Three-way toggle */}
                <div
                  className="grid grid-cols-3 gap-1.5 sm:gap-2"
                  role="group"
                  aria-label={`Катышуу статусу: ${student.full_name}`}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      aria-pressed={current === opt.value}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-[11px] font-extrabold transition sm:min-w-[130px] sm:px-3 ${
                        current === opt.value
                          ? opt.activeClass
                          : "border-[#d6dfd8] text-muted hover:border-[#b0bdb5]"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      disabled={!canEditDate}
                      onClick={() => setStatus(student.id, opt.value)}
                      type="button"
                    >
                      {opt.icon}
                      <span className="hidden sm:inline">{opt.label}</span>
                      <span className="sm:hidden">
                        {opt.value === "OFFLINE" ? "Офф" : opt.value === "ONLINE" ? "Онл" : "Жок"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!isLoading && !error && (
        <div className="flex flex-wrap gap-4 border-t border-[#e6ece8] px-5 py-3 sm:px-7">
          {STATUS_OPTIONS.map((opt) => (
            <span key={opt.value} className="flex items-center gap-1.5 text-[11px] font-extrabold text-muted">
              {opt.icon}
              {opt.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
