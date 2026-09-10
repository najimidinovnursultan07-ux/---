/**
 * DailyJournal — Единый журнал посещаемости.
 *
 * Статусы: OFFLINE | ONLINE | ABSENT
 *
 * Архитектура сохранения:
 *   - Изменения статуса — только локально (optimistic UI).
 *   - Реальная запись в БД — ТОЛЬКО через кнопку "Сактоо" (Save All).
 *   - При загрузке страницы и смене даты — fetchAttendance() из сервера.
 *
 * Это гарантирует единственный источник истины и отсутствие race-conditions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
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
    btnActive: "border-[#2e7d32] bg-[#edf5ee] text-[#2e7d32]",
    dot: "bg-[#43a047]",
    badgeBg: "bg-[#edf5ee] text-[#2e7d32]",
    icon: MonitorSmartphone,
  },
  ONLINE: {
    value: "ONLINE",
    labelFull: "Онлайн",
    labelShort: "Онл",
    btnActive: "border-[#1565c0] bg-[#e3f0ff] text-[#1565c0]",
    dot: "bg-[#1e88e5]",
    badgeBg: "bg-[#e3f0ff] text-[#1565c0]",
    icon: Wifi,
  },
  ABSENT: {
    value: "ABSENT",
    labelFull: "Келген жок",
    labelShort: "Жок",
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
    map[r.student_id] = !r.is_present
      ? "ABSENT"
      : r.attendance_type === "ONLINE"
      ? "ONLINE"
      : "OFFLINE";
  }
  return map;
}

// ─── Segmented control for one student ───────────────────────────────────────

function StatusControl({ studentId, current, canEdit, onChange }) {
  return (
    <div
      aria-label="Катышуу статусу"
      className="flex overflow-hidden rounded-lg border border-[#d6dfd8] bg-[#f7faf7]"
      role="group"
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
              "flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-extrabold transition-all select-none",
              "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]",
              active ? `z-10 ${s.btnActive} shadow-sm` : "text-[#8a9a90] hover:bg-white hover:text-[#3a4a40]",
              !canEdit && "cursor-not-allowed opacity-50",
            ].join(" ")}
          >
            <Icon aria-hidden="true" size={13} />
            <span className="hidden sm:inline">{s.labelFull}</span>
            <span className="sm:hidden">{s.labelShort}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Counter pills ────────────────────────────────────────────────────────────

function CounterPill({ label, value, color }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${color}`}>
      <span className="text-lg font-extrabold leading-none">{value}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</span>
    </div>
  );
}

// ─── Mobile student card ──────────────────────────────────────────────────────

function StudentCard({ student, index, statusMap, canEdit, canManage, onStatusChange, onEdit, onDelete }) {
  const status = statusMap[student.id] ?? "ABSENT";
  const s = STATUS[status];
  return (
    <article className={`rounded-xl border-l-4 border border-[#e6ece8] bg-white p-4 shadow-sm ${s.btnActive.includes("border-[#2e7d32]") ? "border-l-[#43a047]" : s.btnActive.includes("border-[#1565c0]") ? "border-l-[#1e88e5]" : "border-l-[#ef5350]"}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
            style={{ background: NAVY }}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-[#0B192C]">{student.full_name}</p>
            {student.group_name && <p className="text-xs text-[#7a8e82]">{student.group_name}</p>}
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
        canEdit={canEdit}
        current={status}
        onChange={onStatusChange}
        studentId={student.id}
      />
    </article>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DailyJournal({
  students,          // visible students (group-filtered by App)
  canEdit,           // true only for MENTOR on today
  canManageStudents,
  selectedDate,
  onDateChange,
  onToday,
  onEdit,
  onDelete,
  onAddStudent,
  onExportPdf,
  onToast,
  isLoading: isParentLoading,
}) {
  // ── Local state ─────────────────────────────────────────────────────────────
  const [statusMap, setStatusMap]     = useState({});
  const [isFetching, setIsFetching]   = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isDirty, setIsDirty]         = useState(false); // unsaved changes flag
  const [search, setSearch]           = useState("");

  const isToday = selectedDate === getToday();
  const canEditNow = canEdit && isToday;

  // ── Fetch attendance from server whenever date or students change ───────────
  useEffect(() => {
    if (!students.length) return;
    let cancelled = false;
    setIsFetching(true);
    setIsDirty(false);
    fetchAttendance(selectedDate)
      .then((records) => {
        if (cancelled) return;
        const map = buildStatusMap(records);
        // Default to ABSENT for students not in records
        for (const s of students) {
          if (!(s.id in map)) map[s.id] = "ABSENT";
        }
        setStatusMap(map);
      })
      .catch((err) => {
        if (cancelled) return;
        onToast?.({ type: "error", message: err?.response?.data?.detail || "Маалыматтарды жүктөө мүмкүн болгон жок." });
      })
      .finally(() => { if (!cancelled) setIsFetching(false); });
    return () => { cancelled = true; };
  }, [selectedDate, students]);

  // ── Local status change (no network call) ──────────────────────────────────
  const handleStatusChange = useCallback((studentId, newStatus) => {
    if (!canEditNow) return;
    setStatusMap((prev) => ({ ...prev, [studentId]: newStatus }));
    setIsDirty(true);
  }, [canEditNow]);

  // ── Bulk local change ──────────────────────────────────────────────────────
  function applyBulk(status) {
    if (!canEditNow) return;
    const next = {};
    for (const s of students) next[s.id] = status;
    setStatusMap((prev) => ({ ...prev, ...next }));
    setIsDirty(true);
  }

  // ── Save All: single authoritative write to the backend ────────────────────
  const handleSaveAll = useCallback(async () => {
    if (!canEditNow || !students.length || isSavingAll) return;
    setIsSavingAll(true);

    const today = getToday();
    const bulkRecords = students.map((s) => ({
      student_id: s.id,
      is_present: (statusMap[s.id] ?? "ABSENT") !== "ABSENT",
    }));

    try {
      // 1) Save presence (is_present) for every student
      await saveAttendance(today, bulkRecords);

      // 2) Save attendance_type (OFFLINE / ONLINE) for present students only
      const presentStudents = students.filter((s) => (statusMap[s.id] ?? "ABSENT") !== "ABSENT");
      if (presentStudents.length) {
        await saveAttendanceModes(
          today,
          presentStudents.map((s) => ({
            student_id: s.id,
            attendance_type: statusMap[s.id], // "OFFLINE" or "ONLINE"
          })),
        );
      }

      setIsDirty(false);
      onToast?.({ type: "success", message: "Маалыматтар ийгиликтүү сакталды!" });
    } catch (err) {
      const msg = err?.response?.data?.detail || "Сактоо учурунда ката кетти.";
      onToast?.({ type: "error", message: msg });
    } finally {
      setIsSavingAll(false);
    }
  }, [canEditNow, isSavingAll, students, statusMap, onToast]);

  // ── Filtered + counted ─────────────────────────────────────────────────────
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

  const isLoading = isParentLoading || isFetching;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <section className="overflow-hidden rounded-xl border border-[#e6ece8] bg-white shadow-sm">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-5 sm:px-7" style={{ background: NAVY }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF6B00]">
              КАТЫШУУ ЖУРНАЛЫ
            </p>
            <h2 className="mt-0.5 font-display text-xl font-extrabold text-white sm:text-2xl">
              Күнүмдүк журнал
            </h2>
          </div>

          {/* Date + Today */}
          <div className="flex items-center gap-2">
            <CalendarDays className="text-[#FF6B00]" size={15} />
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
          </div>
        </div>

        {/* Counter pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          <CounterPill color="bg-white/10 text-white"            label="Жалпы"   value={counts.total} />
          <CounterPill color="bg-[#2e7d32]/20 text-[#81c784]"   label="Оффлайн" value={counts.offline} />
          <CounterPill color="bg-[#1565c0]/20 text-[#64b5f6]"   label="Онлайн"  value={counts.online} />
          <CounterPill color="bg-[#c62828]/20 text-[#ef9a9a]"   label="Жок"     value={counts.absent} />
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

        {/* Bulk buttons — edit mode only */}
        {canEditNow && (
          <div className="flex flex-wrap gap-1.5">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#c8e6c9] bg-[#edf5ee] px-3 text-[11px] font-extrabold text-[#2e7d32] transition hover:bg-[#d4edda]"
              onClick={() => applyBulk("OFFLINE")}
              type="button"
            >
              <MonitorSmartphone size={13} />
              Баары Офф.
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#bbdefb] bg-[#e3f0ff] px-3 text-[11px] font-extrabold text-[#1565c0] transition hover:bg-[#cce4ff]"
              onClick={() => applyBulk("ONLINE")}
              type="button"
            >
              <Wifi size={13} />
              Баары Онл.
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d6dfd8] bg-white px-3 text-[11px] font-extrabold text-[#6a7a70] transition hover:bg-[#f0f4f1]"
              onClick={() => applyBulk("ABSENT")}
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
              onClick={onAddStudent}
              style={{ background: NAVY }}
              type="button"
            >
              <Users size={13} />
              <span className="hidden sm:inline">Окуучу кошуу</span>
            </button>
          )}

          {/* ── PRIMARY: Save button — always visible in edit mode ── */}
          {canEditNow && (
            <button
              className={[
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[11px] font-extrabold text-white shadow-sm transition",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isDirty ? "ring-2 ring-[#FF6B00] ring-offset-1" : "",
              ].join(" ")}
              disabled={isSavingAll || !students.length}
              onClick={handleSaveAll}
              style={{ background: ORANGE }}
              title="Бардык статустарды сактоо"
              type="button"
            >
              {isSavingAll
                ? <LoaderCircle className="animate-spin" size={13} />
                : isDirty
                ? <CheckCircle2 size={13} />
                : <Save size={13} />}
              <span>{isSavingAll ? "Сакталууда..." : "Сактоо"}</span>
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

      {/* Unsaved changes banner */}
      {canEditNow && isDirty && (
        <div className="flex items-center justify-between bg-[#fff8f0] px-5 py-2.5 text-xs font-bold text-[#b85c00] sm:px-7">
          <span>⚠️ Сакталбаган өзгөртүүлөр бар. "Сактоо" баскычын басыңыз.</span>
        </div>
      )}

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="animate-spin text-[#FF6B00]" size={28} />
        </div>
      ) : !filtered.length ? (
        <p className="py-14 text-center text-sm text-[#8a9a90]">
          {search ? `"${search}" боюнча окуучу табылган жок.` : "Окуучулар табылган жок."}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 p-4 sm:p-5 md:hidden">
            {filtered.map((student, i) => (
              <StudentCard
                canEdit={canEditNow}
                canManage={canManageStudents}
                index={i}
                key={student.id}
                onDelete={onDelete}
                onEdit={onEdit}
                onStatusChange={handleStatusChange}
                statusMap={statusMap}
                student={student}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-[#5a7a60]"
                  style={{ background: "#f0f4f1" }}>
                  <th className="w-14 px-4 py-3 text-center">№</th>
                  <th className="px-4 py-3">Аты-жөнү</th>
                  <th className="px-4 py-3">Тайпа</th>
                  <th className="w-80 px-4 py-3 text-center">Статус</th>
                  {canManageStudents && <th className="w-24 px-4 py-3 text-center">Аракет</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((student, i) => {
                  const status = statusMap[student.id] ?? "ABSENT";
                  const s = STATUS[status];
                  return (
                    <tr className="border-t border-[#e6ece8] transition hover:bg-[#f7faf7]" key={student.id}>
                      <td className="px-4 py-3 text-center text-xs text-[#8a9a90]">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-[#0B192C]">{student.full_name}</td>
                      <td className="px-4 py-3 text-xs text-[#7a8e82]">{student.group_name || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusControl
                            canEdit={canEditNow}
                            current={status}
                            onChange={handleStatusChange}
                            studentId={student.id}
                          />
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

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6ece8] bg-[#fafcf9] px-5 py-3 sm:px-7">
        <div className="flex flex-wrap gap-3">
          {STATUS_ORDER.map((key) => {
            const s = STATUS[key];
            const Icon = s.icon;
            return (
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#7a8e82]" key={key}>
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <Icon size={11} />
                {s.labelFull}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-[#aabab0]">
          {!canEditNow && !isToday && (
            <span className="rounded-full bg-[#fff4e5] px-2.5 py-1 font-extrabold text-[#b85c00]">
              🔒 Архивделген
            </span>
          )}
          {search && (
            <span>{filtered.length} / {students.length} табылды</span>
          )}
        </div>
      </div>
    </section>
  );
}
