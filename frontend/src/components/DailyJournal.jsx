/**
 * DailyJournal — Единый журнал посещаемости.
 *
 * Объединяет старые вкладки "Күнүмдүк журнал" и "Формат боюнча катышуу"
 * в один компонент с немедленным (авто-) сохранением статуса каждого студента.
 *
 * Статусы: OFFLINE | ONLINE | ABSENT
 * Сохранение: при каждом клике — POST save-bulk + POST save-mode (параллельно)
 * UI: мобайл → карточки, планшет/ПК → таблица
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  LoaderCircle,
  MonitorSmartphone,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserRound,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { fetchAttendance, saveAttendance, saveAttendanceModes } from "../api/attendanceApi";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORANGE = "#FF6B00";
const NAVY   = "#0B192C";

const STATUS = {
  OFFLINE: {
    value: "OFFLINE",
    labelFull: "Оффлайн",
    labelShort: "Офф",
    desc: "Присутствует в аудитории",
    // Tailwind classes kept as full strings so PurgeCSS keeps them
    btnActive: "border-[#2e7d32] bg-[#edf5ee] text-[#2e7d32]",
    dot: "bg-[#43a047]",
    badgeBg: "bg-[#edf5ee] text-[#2e7d32]",
    icon: MonitorSmartphone,
  },
  ONLINE: {
    value: "ONLINE",
    labelFull: "Онлайн",
    labelShort: "Онл",
    desc: "Присутствует удалённо",
    btnActive: "border-[#1565c0] bg-[#e3f0ff] text-[#1565c0]",
    dot: "bg-[#1e88e5]",
    badgeBg: "bg-[#e3f0ff] text-[#1565c0]",
    icon: Wifi,
  },
  ABSENT: {
    value: "ABSENT",
    labelFull: "Келген жок",
    labelShort: "Жок",
    desc: "Пропустил занятие",
    btnActive: "border-[#c62828] bg-[#fff0ed] text-[#c62828]",
    dot: "bg-[#ef5350]",
    badgeBg: "bg-[#fff0ed] text-[#c62828]",
    icon: WifiOff,
  },
};

const STATUS_ORDER = ["OFFLINE", "ONLINE", "ABSENT"];

function getToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function buildStatusMap(records) {
  const map = {};
  for (const r of records) {
    map[r.student_id] = !r.is_present ? "ABSENT" : r.attendance_type === "ONLINE" ? "ONLINE" : "OFFLINE";
  }
  return map;
}

// ─── Segmented control for one student ───────────────────────────────────────

function StatusControl({ studentId, current, saving, saved, canEdit, onChange }) {
  return (
    <div
      className="relative flex overflow-hidden rounded-lg border border-[#d6dfd8] bg-[#f7faf7]"
      role="group"
      aria-label="Статус посещаемости"
    >
      {STATUS_ORDER.map((key) => {
        const s = STATUS[key];
        const Icon = s.icon;
        const active = current === key;
        return (
          <button
            key={key}
            aria-pressed={active}
            disabled={!canEdit}
            onClick={() => onChange(studentId, key)}
            type="button"
            className={[
              "relative flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-extrabold transition-all select-none",
              "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]",
              active
                ? `z-10 ${s.btnActive} shadow-sm`
                : "text-[#8a9a90] hover:bg-white hover:text-[#3a4a40]",
              !canEdit && "cursor-not-allowed opacity-50",
            ].join(" ")}
          >
            <Icon size={13} aria-hidden="true" />
            {/* Full label ≥ sm, short label on xs */}
            <span className="hidden sm:inline">{s.labelFull}</span>
            <span className="sm:hidden">{s.labelShort}</span>
          </button>
        );
      })}

      {/* Per-row save indicator — overlaid top-right */}
      {saving && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow">
          <LoaderCircle className="animate-spin text-[#FF6B00]" size={11} />
        </span>
      )}
      {saved && !saving && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#edf5ee] shadow">
          <CheckCircle2 className="text-[#2e7d32]" size={11} />
        </span>
      )}
    </div>
  );
}

// ─── Counter pills in header ──────────────────────────────────────────────────

function CounterPill({ label, value, total, color }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${color}`}>
      <span className="text-lg font-extrabold leading-none">{value}</span>
      {total != null && (
        <span className="text-xs font-bold opacity-60">/ {total}</span>
      )}
      <span className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</span>
    </div>
  );
}

// ─── Mobile student card ──────────────────────────────────────────────────────

function StudentCard({ student, index, statusMap, savingIds, savedIds, canEdit, canManage, onStatusChange, onEdit, onDelete }) {
  const status = statusMap[student.id] ?? "ABSENT";
  const s = STATUS[status];
  return (
    <article className={`rounded-xl border bg-white p-4 shadow-sm transition ${s.btnActive.replace("border-", "border-l-4 border-l-")} border-[#e6ece8]`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white`}
            style={{ background: NAVY }}>
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-[#0B192C]">{student.full_name}</p>
            {student.group_name && (
              <p className="text-xs text-[#7a8e82]">{student.group_name}</p>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <button
              aria-label={`${student.full_name} өзгөртүү`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#5a7a60] hover:bg-[#edf5ee]"
              onClick={() => onEdit(student)}
              type="button"
            >
              <Pencil size={14} />
            </button>
            <button
              aria-label={`${student.full_name} өчүрүү`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#b9504c] hover:bg-[#fff0ed]"
              onClick={() => onDelete(student)}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      <StatusControl
        studentId={student.id}
        current={status}
        saving={savingIds.has(student.id)}
        saved={savedIds.has(student.id)}
        canEdit={canEdit}
        onChange={onStatusChange}
      />
    </article>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DailyJournal({
  students,          // visible students (already group-filtered by App)
  attendanceRecords, // raw records from last fetch (for initial status)
  canEdit,           // true only for MENTOR on today
  canManageStudents, // true for MENTOR
  selectedDate,
  onDateChange,
  onToday,
  onEdit,            // (student) → open edit modal
  onDelete,          // (student) → open delete confirm
  onAddStudent,      // () → open add modal
  onExportPdf,       // () → download PDF
  onToast,           // ({type, message}) → show toast
  isSaving: isGlobalSaving, // legacy "save all" spinner from parent (unused now but kept for compat)
  isLoading,
}) {
  // Status map: studentId → "OFFLINE" | "ONLINE" | "ABSENT"
  const [statusMap, setStatusMap] = useState({});
  // Per-student save state
  const [savingIds, setSavingIds] = useState(new Set());
  const [savedIds, setSavedIds]   = useState(new Set());
  // Search
  const [search, setSearch] = useState("");
  // Debounce timers: studentId → timeoutId
  const debounceRef = useRef({});
  // Ack timers: studentId → timeoutId
  const ackRef = useRef({});
  // "Save all" button state
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Build statusMap whenever records or students change
  useEffect(() => {
    const map = buildStatusMap(attendanceRecords);
    // Fill any students not in records as ABSENT
    for (const s of students) {
      if (!(s.id in map)) map[s.id] = "ABSENT";
    }
    setStatusMap(map);
  }, [attendanceRecords, students]);

  // ── Auto-save per student on status change ──────────────────────────────────
  const saveStudent = useCallback(async (studentId, newStatus) => {
    setSavingIds((prev) => new Set(prev).add(studentId));
    try {
      const isPresent = newStatus !== "ABSENT";
      // 1) presence
      await saveAttendance(getToday(), [{ student_id: studentId, is_present: isPresent }]);
      // 2) mode (only if present)
      if (isPresent) {
        await saveAttendanceModes(getToday(), [{
          student_id: studentId,
          attendance_type: newStatus,
        }]);
      }
      // Ack: show checkmark for 2 s
      setSavedIds((prev) => new Set(prev).add(studentId));
      clearTimeout(ackRef.current[studentId]);
      ackRef.current[studentId] = window.setTimeout(() => {
        setSavedIds((prev) => { const next = new Set(prev); next.delete(studentId); return next; });
      }, 2000);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Сактоо ишке ашкан жок.";
      onToast?.({ type: "error", message: msg });
    } finally {
      setSavingIds((prev) => { const next = new Set(prev); next.delete(studentId); return next; });
    }
  }, [onToast]);

  const handleStatusChange = useCallback((studentId, newStatus) => {
    if (!canEdit) return;
    // Optimistic UI update
    setStatusMap((prev) => ({ ...prev, [studentId]: newStatus }));
    // Debounce actual save (300 ms — collapses rapid taps)
    clearTimeout(debounceRef.current[studentId]);
    debounceRef.current[studentId] = window.setTimeout(() => {
      saveStudent(studentId, newStatus);
    }, 300);
  }, [canEdit, saveStudent]);

  // ── Bulk actions ────────────────────────────────────────────────────────────
  function applyBulk(status) {
    if (!canEdit) return;
    const next = {};
    for (const s of students) next[s.id] = status;
    setStatusMap((prev) => ({ ...prev, ...next }));
    // Batch save
    const isPresent = status !== "ABSENT";
    const bulkRecords = students.map((s) => ({ student_id: s.id, is_present: isPresent }));
    const today = getToday();
    saveAttendance(today, bulkRecords).then(() => {
      if (isPresent) {
        return saveAttendanceModes(today, students.map((s) => ({ student_id: s.id, attendance_type: status })));
      }
    }).then(() => {
      onToast?.({ type: "success", message: "Бардык окуучулар сакталды." });
    }).catch((err) => {
      onToast?.({ type: "error", message: err?.response?.data?.detail || "Жалпы сактоо ишке ашкан жок." });
    });
  }

  // ── Save all: flush every student's current status at once ─────────────────
  const handleSaveAll = useCallback(async () => {
    if (!canEdit || !students.length || isSavingAll) return;
    setIsSavingAll(true);
    try {
      const today = getToday();
      const bulkRecords = students.map((s) => ({
        student_id: s.id,
        is_present: (statusMap[s.id] ?? "ABSENT") !== "ABSENT",
      }));
      await saveAttendance(today, bulkRecords);

      const presentStudents = students.filter((s) => (statusMap[s.id] ?? "ABSENT") !== "ABSENT");
      if (presentStudents.length) {
        await saveAttendanceModes(
          today,
          presentStudents.map((s) => ({
            student_id: s.id,
            attendance_type: statusMap[s.id],
          })),
        );
      }
      onToast?.({ type: "success", message: "Журнал ийгиликтүү сакталды." });
    } catch (err) {
      onToast?.({ type: "error", message: err?.response?.data?.detail || "Сактоо ишке ашкан жок." });
    } finally {
      setIsSavingAll(false);
    }
  }, [canEdit, isSavingAll, students, statusMap, onToast]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.group_name || "").toLowerCase().includes(q) ||
        (s.phone || "").includes(q),
    );
  }, [students, search]);

  // ── Counters ────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    let offline = 0, online = 0, absent = 0;
    for (const s of students) {
      const v = statusMap[s.id] ?? "ABSENT";
      if (v === "OFFLINE") offline++;
      else if (v === "ONLINE") online++;
      else absent++;
    }
    return { offline, online, present: offline + online, absent, total: students.length };
  }, [students, statusMap]);

  const isToday = selectedDate === getToday();

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <section className="overflow-hidden rounded-xl border border-[#e6ece8] bg-white shadow-sm">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background: NAVY }} className="px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF6B00]">
              КАТЫШУУ ЖУРНАЛЫ
            </p>
            <h2 className="mt-0.5 font-display text-xl font-extrabold text-white sm:text-2xl">
              Күнүмдүк журнал
            </h2>
          </div>

          {/* Date picker */}
          <label className="flex items-center gap-2 text-xs font-bold text-[#a0b8c0]" htmlFor="journal-date">
            <CalendarDays size={15} className="text-[#FF6B00]" />
            <input
              className="h-9 rounded-md border border-[#2a3a4a] bg-[#162232] px-3 text-sm font-semibold text-white outline-none focus:border-[#FF6B00]"
              id="journal-date"
              max={getToday()}
              onChange={(e) => onDateChange(e.target.value)}
              type="date"
              value={selectedDate}
            />
            <button
              className="h-9 rounded-md border border-[#2a3a4a] bg-[#162232] px-3 text-xs font-bold text-[#a0b8c0] transition hover:border-[#FF6B00] hover:text-white"
              onClick={onToday}
              type="button"
            >
              Бүгүн
            </button>
          </label>
        </div>

        {/* Counter pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          <CounterPill label="Жалпы"     value={counts.total}   color="bg-white/10 text-white" />
          <CounterPill label="Оффлайн"   value={counts.offline} color="bg-[#2e7d32]/20 text-[#81c784]" />
          <CounterPill label="Онлайн"    value={counts.online}  color="bg-[#1565c0]/20 text-[#64b5f6]" />
          <CounterPill label="Жок"       value={counts.absent}  color="bg-[#c62828]/20 text-[#ef9a9a]" />
        </div>
      </div>

      {/* ── TOOLBAR ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e6ece8] bg-[#fafcf9] px-5 py-3 sm:px-7">
        {/* Search */}
        <div className="relative mr-auto min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9a90]" size={14} />
          <input
            className="h-9 w-full rounded-md border border-[#d6dfd8] bg-white pl-8 pr-3 text-sm text-[#0B192C] outline-none placeholder:text-[#aabab0] focus:border-[#FF6B00]"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Окуучуну издөө..."
            type="search"
            value={search}
          />
        </div>

        {/* Bulk controls — Mentor only, today only */}
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#c8e6c9] bg-[#edf5ee] px-3 text-[11px] font-extrabold text-[#2e7d32] transition hover:bg-[#d4edda]"
              onClick={() => applyBulk("OFFLINE")}
              title="Бардыгы оффлайн келди деп белгиле"
              type="button"
            >
              <MonitorSmartphone size={13} />
              Баары Офф.
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#bbdefb] bg-[#e3f0ff] px-3 text-[11px] font-extrabold text-[#1565c0] transition hover:bg-[#cce4ff]"
              onClick={() => applyBulk("ONLINE")}
              title="Бардыгы онлайн деп белгиле"
              type="button"
            >
              <Wifi size={13} />
              Баары Онл.
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d6dfd8] bg-white px-3 text-[11px] font-extrabold text-[#6a7a70] transition hover:bg-[#f0f4f1]"
              onClick={() => applyBulk("ABSENT")}
              title="Баарын өчүрүү (сбросить)"
              type="button"
            >
              <RotateCcw size={13} />
              Сбросить
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5">
          {canManageStudents && (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[11px] font-extrabold text-white transition hover:opacity-90"
              style={{ background: NAVY }}
              onClick={onAddStudent}
              type="button"
            >
              <Users size={13} />
              <span className="hidden sm:inline">Окуучу кошуу</span>
            </button>
          )}
          {/* ── Save All button — Mentor only, today only ── */}
          {canEdit && isToday && (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[11px] font-extrabold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSavingAll || !students.length}
              onClick={handleSaveAll}
              style={{ background: "#FF6B00" }}
              title="Бардык статустарды сактоо"
              type="button"
            >
              {isSavingAll
                ? <LoaderCircle className="animate-spin" size={13} />
                : <Save size={13} />}
              <span>Сактоо</span>
            </button>
          )}
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d6dfd8] bg-white px-3 text-[11px] font-extrabold text-[#3a4a40] transition hover:border-[#FF6B00] hover:text-[#FF6B00]"
            onClick={onExportPdf}
            title="PDF жүктөп алуу"
            type="button"
          >
            <Download size={13} />
            PDF
          </button>
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <img alt="Жүктөлүүдө" className="h-14 w-14 animate-pulse rounded-full object-contain" src="/logo.jpg" />
        </div>
      ) : !filtered.length ? (
        <p className="py-14 text-center text-sm text-[#8a9a90]">
          {search ? `"${search}" боюнча окуучу табылган жок.` : "Окуучулар табылган жок."}
        </p>
      ) : (
        <>
          {/* ── Mobile: cards (< md) ──────────────────────────────────────── */}
          <div className="grid gap-3 p-4 sm:p-5 md:hidden">
            {filtered.map((student, i) => (
              <StudentCard
                key={student.id}
                student={student}
                index={i}
                statusMap={statusMap}
                savingIds={savingIds}
                savedIds={savedIds}
                canEdit={canEdit && isToday}
                canManage={canManageStudents}
                onStatusChange={handleStatusChange}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>

          {/* ── Desktop: table (≥ md) ─────────────────────────────────────── */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ background: "#f0f4f1" }}
                  className="text-left text-[11px] font-extrabold uppercase tracking-wider text-[#5a7a60]">
                  <th className="w-14 px-4 py-3 text-center">№</th>
                  <th className="px-4 py-3">Окуучунун аты-жөнү</th>
                  <th className="px-4 py-3">Тайпа</th>
                  <th className="w-72 px-4 py-3 text-center">Статус / Катышуу</th>
                  {canManageStudents && <th className="w-24 px-4 py-3 text-center">Аракет</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((student, i) => {
                  const status  = statusMap[student.id] ?? "ABSENT";
                  const s       = STATUS[status];
                  const saving  = savingIds.has(student.id);
                  const saved   = savedIds.has(student.id);
                  return (
                    <tr
                      key={student.id}
                      className="border-t border-[#e6ece8] transition hover:bg-[#f7faf7]"
                    >
                      <td className="px-4 py-3 text-center text-xs text-[#8a9a90]">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B192C]">{student.full_name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#7a8e82]">{student.group_name || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusControl
                            studentId={student.id}
                            current={status}
                            saving={saving}
                            saved={saved}
                            canEdit={canEdit && isToday}
                            onChange={handleStatusChange}
                          />
                          {/* Status badge to the right of control */}
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${s.badgeBg}`}>
                            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${s.dot}`} />
                            {s.labelFull}
                          </span>
                        </div>
                      </td>
                      {canManageStudents && (
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button
                              aria-label={`${student.full_name} өзгөртүү`}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-[#5a7a60] transition hover:bg-[#edf5ee]"
                              onClick={() => onEdit(student)}
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              aria-label={`${student.full_name} өчүрүү`}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-[#b9504c] transition hover:bg-[#fff0ed]"
                              onClick={() => onDelete(student)}
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── FOOTER: legend + read-only notice ──────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6ece8] bg-[#fafcf9] px-5 py-3 sm:px-7">
        <div className="flex flex-wrap gap-3">
          {STATUS_ORDER.map((key) => {
            const s = STATUS[key];
            const Icon = s.icon;
            return (
              <span key={key} className="flex items-center gap-1 text-[11px] font-bold text-[#7a8e82]">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <Icon size={11} />
                {s.labelFull}
              </span>
            );
          })}
        </div>
        {!canEdit && (
          <span className="rounded-full bg-[#fff4e5] px-2.5 py-1 text-[10px] font-extrabold text-[#b85c00]">
            🔒 Архивделген — өзгөртүүгө жабык
          </span>
        )}
        {canEdit && !isToday && (
          <span className="text-[11px] text-[#8a9a90]">Бүгүнкү күн гана өзгөртүлөт</span>
        )}
        {search && (
          <span className="text-[11px] text-[#8a9a90]">
            {filtered.length} / {students.length} окуучу табылды
          </span>
        )}
      </div>
    </section>
  );
}
