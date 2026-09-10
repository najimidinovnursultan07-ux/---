import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Archive, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { fetchMe } from "./api/authApi";
import AuthPanel from "./components/AuthPanel";
import UserRolePanel from "./components/UserRolePanel";
import AddStudentModal from "./components/AddStudentModal";
import RoleHeader from "./components/RoleHeader";
import StatsHeader from "./components/StatsHeader";
import {
  createStudent,
  deleteGroup,
  deleteStudent,
  downloadAttendancePdf,
  fetchAttendance,
  fetchStudents,
  updateStudent,
} from "./api/attendanceApi";
import AttendanceHistory from "./components/AttendanceHistory";
import DailyJournal from "./components/DailyJournal";
import GroupManagementPanel from "./components/GroupManagementPanel";
import GroupTabs from "./components/GroupTabs";
import MentorWorkspace from "./components/MentorWorkspace";
import AccountantDashboard from "./components/AccountantDashboard";
import MonthlyReportPanel from "./components/MonthlyReportPanel";
import { fetchGroups } from "./api/attendanceApi";

function getToday() {
  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function getErrorMessage(error, fallback) {
  if (error?.response?.data?.detail) return error.response.data.detail;
  if (error?.request) return "Django сервери жеткиликсиз. Сервердин иштеп жатканын текшериңиз.";
  return fallback;
}

export default function App() {
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState("all");
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [activeRole, setActiveRole] = useState(() => window.localStorage.getItem("attendance-role") || "ADMIN");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [deletedGroupId, setDeletedGroupId] = useState(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeView, setActiveView] = useState("daily");

  // ── Derived ────────────────────────────────────────────────────────────────
  const canEditAttendance = activeRole === "MENTOR" && selectedDate === getToday();
  const canManageStudents = activeRole === "MENTOR";

  const visibleStudents = useMemo(
    () =>
      activeGroupId === "all"
        ? students
        : students.filter((s) => String(s.group_id) === activeGroupId),
    [activeGroupId, students],
  );

  // presentCount still used by StatsHeader (page title area)
  const presentCount = useMemo(
    () =>
      attendanceRecords.reduce(
        (n, r) => n + (r.is_present && visibleStudents.some((s) => s.id === r.student_id) ? 1 : 0),
        0,
      ),
    [attendanceRecords, visibleStudents],
  );

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadAttendance = useCallback(
    async (date, currentStudents = students) => {
      if (!currentStudents.length) return;
      setError("");
      setIsLoading(true);
      try {
        const records = await fetchAttendance(date);
        setAttendanceRecords(records);
      } catch (loadError) {
        console.error("Attendance request failed", loadError);
        setError(getErrorMessage(loadError, "Катышуу маалыматтарын жүктөө мүмкүн болгон жок."));
      } finally {
        setIsLoading(false);
      }
    },
    [students],
  );

  const handleDateChange = useCallback(
    async (date) => {
      setSelectedDate(date);
      await loadAttendance(date);
    },
    [loadAttendance],
  );

  const handleToday = useCallback(() => {
    const today = getToday();
    setSelectedDate(today);
    loadAttendance(today);
  }, [loadAttendance]);

  // ── Student CRUD ──────────────────────────────────────────────────────────
  const handleAuthenticated = useCallback(() => {
    window.location.reload();
  }, []);

  const showToast = useCallback((t) => {
    setToast(typeof t === "string" ? { type: "success", message: t } : t);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const handleAddStudent = useCallback(async (studentDetails) => {
    setIsAddingStudent(true);
    try {
      const student = await createStudent(studentDetails);
      setStudents((prev) =>
        [...prev, student].sort((a, b) => a.full_name.localeCompare(b.full_name, "ky")),
      );
      setIsAddModalOpen(false);
      showToast("Жаңы окуучу кошулду.");
    } catch (createError) {
      throw new Error(getErrorMessage(createError, "Окуучуну кошуу мүмкүн болгон жок."));
    } finally {
      setIsAddingStudent(false);
    }
  }, [showToast]);

  const handleUpdateStudent = useCallback(async (studentDetails) => {
    if (!studentToEdit) return;
    setIsAddingStudent(true);
    try {
      const updated = await updateStudent(studentToEdit.id, studentDetails);
      setStudents((prev) =>
        prev
          .map((s) => (s.id === updated.id ? updated : s))
          .sort((a, b) => a.full_name.localeCompare(b.full_name, "ky")),
      );
      setStudentToEdit(null);
      setIsAddModalOpen(false);
      showToast("Окуучунун маалыматтары өзгөртүлдү.");
    } catch (updateError) {
      throw new Error(getErrorMessage(updateError, "Окуучунун маалыматтарын өзгөртүү мүмкүн болгон жок."));
    } finally {
      setIsAddingStudent(false);
    }
  }, [studentToEdit, showToast]);

  const handleDeleteStudent = useCallback(async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    setError("");
    try {
      await deleteStudent(studentToDelete.id);
      setStudents((prev) => prev.filter((s) => s.id !== studentToDelete.id));
      setAttendanceRecords((prev) => prev.filter((r) => r.student_id !== studentToDelete.id));
      setStudentToDelete(null);
      showToast("Окуучу ийгиликтүү өчүрүлдү.");
    } catch (deleteError) {
      showToast({ type: "error", message: getErrorMessage(deleteError, "Окуучуну өчүрүү мүмкүн болгон жок.") });
    } finally {
      setIsDeletingStudent(false);
    }
  }, [studentToDelete, showToast]);

  const handleDeleteGroup = useCallback(async () => {
    if (!groupToDelete) return;
    setIsDeletingGroup(true);
    try {
      await deleteGroup(groupToDelete.id);
      setDeletedGroupId(groupToDelete.id);
      setGroups((prev) => prev.filter((g) => g.id !== groupToDelete.id));
      setStudents((prev) => prev.filter((s) => s.group_id !== groupToDelete.id));
      if (activeGroupId === String(groupToDelete.id)) setActiveGroupId("all");
      setGroupToDelete(null);
      showToast("Тайпа жана анын окуучулары өчүрүлдү.");
    } catch (deleteError) {
      showToast({ type: "error", message: getErrorMessage(deleteError, "Тайпаны өчүрүү мүмкүн болгон жок.") });
    } finally {
      setIsDeletingGroup(false);
    }
  }, [activeGroupId, groupToDelete, showToast]);

  const handleExportPdf = useCallback(async () => {
    try {
      const blob = await downloadAttendancePdf(selectedDate);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Kelgender_Otchet_${selectedDate}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast("PDF отчет жүктөлдү.");
    } catch (reportError) {
      setError(getErrorMessage(reportError, "Отчетту жүктөө мүмкүн болгон жок."));
    }
  }, [selectedDate, showToast]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      setIsLoading(true);
      try {
        const currentUser = await fetchMe();
        if (!isMounted) return;
        setUser(currentUser);
        const role = currentUser.effective_role || currentUser.role || "USER";
        setActiveRole(role);
        if (role === "ACCOUNTANT") {
          if (window.location.pathname !== "/accountant/dashboard")
            window.history.replaceState({}, "", "/accountant/dashboard");
          return;
        }
        const loadedGroups = ["ADMIN", "CURATOR", "MENTOR"].includes(role)
          ? await fetchGroups()
          : [];
        if (!isMounted) return;
        setGroups(loadedGroups);
        const loadedStudents = await fetchStudents();
        if (!isMounted) return;
        setStudents(loadedStudents);
        const today = getToday();
        const records = await fetchAttendance(today);
        if (isMounted) setAttendanceRecords(records);
      } catch (loadError) {
        console.error("Bootstrap failed", loadError);
        if (isMounted) setError(getErrorMessage(loadError, "Окуучуларды жүктөө мүмкүн болгон жок."));
      } finally {
        setIsAuthLoading(false);
        if (isMounted) setIsLoading(false);
      }
    }

    bootstrap();
    return () => { isMounted = false; };
  }, []);

  // ── Auth guards ────────────────────────────────────────────────────────────
  if (isAuthLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <img
          alt="Окурмэн жүктөлүүдө"
          className="h-24 w-24 animate-pulse rounded-full object-contain"
          src="/logo.jpg"
        />
      </div>
    );

  if (!user) return <AuthPanel onAuthenticated={handleAuthenticated} />;

  if (activeRole === "ACCOUNTANT")
    return (
      <AccountantDashboard
        user={user}
        onLogout={() => {
          window.localStorage.removeItem("attendance-token");
          window.location.replace("/");
        }}
      />
    );

  if (!user.is_approved && user.role !== "ADMIN")
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="max-w-lg rounded-lg border border-[#eadcc3] bg-[#fffaf0] p-8 text-center shadow-sm">
          <h1 className="mb-3 font-display text-xl font-bold text-ink">Аккаунт күтүп жатат</h1>
          <p className="text-sm leading-6 text-[#765f38]">
            Аккаунтуңузга уруксат бериле элек. Администратор же Куратор ролуңузду бекитишин күтүңүз.
          </p>
          <button
            className="mt-6 rounded-md bg-ink px-4 py-2 text-sm font-bold text-white"
            onClick={() => {
              window.localStorage.removeItem("attendance-token");
              window.location.reload();
            }}
            type="button"
          >
            Чыгуу
          </button>
        </div>
      </main>
    );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen px-3 py-8 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-[1160px]">

        <RoleHeader
          activeRole={activeRole}
          user={user}
          onLogout={() => {
            window.localStorage.removeItem("attendance-token");
            window.location.reload();
          }}
        />

        {activeRole === "ADMIN" && (
          <div
            className="mb-5 rounded-md border border-[#c6ddc8] bg-[#edf5ee] px-4 py-3 text-sm font-extrabold text-forest"
            role="status"
          >
            Режим наблюдения (Администратор)
          </div>
        )}

        {(activeRole === "ADMIN" || activeRole === "CURATOR") && (
          <UserRolePanel role={activeRole} />
        )}
        {(activeRole === "ADMIN" || activeRole === "CURATOR") && (
          <MentorWorkspace role={activeRole} />
        )}
        {(activeRole === "ADMIN" || activeRole === "CURATOR" || activeRole === "MENTOR") && (
          <GroupManagementPanel
            canManage={activeRole === "MENTOR"}
            deletedGroupId={deletedGroupId}
            onGroupCreated={(group) => {
              setGroups((prev) => [...prev, group]);
              setActiveGroupId(String(group.id));
            }}
            role={activeRole}
          />
        )}

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200">
          {[
            { id: "daily", label: "Журнал", icon: null },
            ...(activeRole === "ADMIN" || activeRole === "CURATOR"
              ? [{ id: "history", label: "3 айлык архив", icon: Archive }]
              : []),
            { id: "monthly-report", label: "Айлык PDF", icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-extrabold transition ${
                activeView === id
                  ? "border-[#FF6B00] text-[#FF6B00]"
                  : "border-transparent text-muted hover:text-ink"
              }`}
              onClick={() => setActiveView(id)}
              type="button"
            >
              {Icon && <Icon size={15} />}
              {label}
            </button>
          ))}
        </div>

        {/* ── View routing ─────────────────────────────────────────────────── */}

        {activeView === "history" && <AttendanceHistory />}

        {activeView === "monthly-report" && (
          <MonthlyReportPanel
            role={activeRole}
            onToast={showToast}
          />
        )}

        {activeView === "daily" && (
          <>
            {/* Group filter tabs */}
            <GroupTabs
              activeGroupId={activeGroupId}
              canDelete={canManageStudents}
              groups={groups}
              onAddGroup={
                canManageStudents
                  ? () =>
                      document
                        .getElementById("group-management-panel")
                        ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  : undefined
              }
              onDeleteGroup={setGroupToDelete}
              onGroupChange={setActiveGroupId}
            />

            {/* Page title */}
            <StatsHeader
              presentCount={presentCount}
              selectedDate={selectedDate}
              totalCount={visibleStudents.length}
            />

            {/* Error banner */}
            {error && (
              <div
                className="mb-5 flex items-start gap-3 rounded-md border border-[#f0c8c1] bg-[#fff4f1] px-4 py-3 text-sm text-[#b9504c]"
                role="alert"
              >
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Loading overlay (initial load only) */}
            <div className="relative">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/75 backdrop-blur-[1px]">
                  <RefreshCw className="animate-spin text-[#FF6B00]" size={26} />
                  <span className="sr-only">Маалымат жүктөлүүдө</span>
                </div>
              )}

              {/* ── The unified daily journal ─────────────────────────── */}
              <DailyJournal
                students={visibleStudents}
                attendanceRecords={attendanceRecords}
                canEdit={canEditAttendance}
                canManageStudents={canManageStudents}
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                onToday={handleToday}
                onEdit={(student) => {
                  setStudentToEdit(student);
                  setIsAddModalOpen(true);
                }}
                onDelete={setStudentToDelete}
                onAddStudent={() => {
                  setStudentToEdit(null);
                  setIsAddModalOpen(true);
                }}
                onExportPdf={handleExportPdf}
                onToast={showToast}
                isLoading={isLoading}
              />
            </div>
          </>
        )}

      </div>

      {/* ── Modals & overlays ──────────────────────────────────────────────── */}

      <AddStudentModal
        defaultGroupId={activeGroupId === "all" ? "" : activeGroupId}
        groups={groups}
        isOpen={isAddModalOpen}
        isSubmitting={isAddingStudent}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={studentToEdit ? handleUpdateStudent : handleAddStudent}
        student={studentToEdit}
      />

      {studentToDelete && (
        <div
          aria-labelledby="delete-student-title"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink" id="delete-student-title">
              Окуучуну өчүрүү
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Чын эле <strong>{studentToDelete.full_name}</strong> тизмеден өчүрүүнү каалайсызбы?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-[#d6dfd8] px-4 py-2 text-sm font-bold text-ink transition hover:bg-[#f7faf7]"
                disabled={isDeletingStudent}
                onClick={() => setStudentToDelete(null)}
                type="button"
              >
                Жок / Жабуу
              </button>
              <button
                className="rounded-md bg-[#b9504c] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeletingStudent}
                onClick={handleDeleteStudent}
                type="button"
              >
                {isDeletingStudent ? "Өчүрүлүүдө..." : "Ооба, өчүрүү"}
              </button>
            </div>
          </div>
        </div>
      )}

      {groupToDelete && (
        <div
          aria-labelledby="delete-group-title"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink" id="delete-group-title">
              Тайпаны өчүрүү
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Чын эле бул тайпаны жана анын ичиндеги окуучуларды өчүрүүнү каалайсызбы?
            </p>
            <p className="mt-2 text-sm font-bold text-ink">{groupToDelete.name}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-[#d6dfd8] px-4 py-2 text-sm font-bold text-ink transition hover:bg-[#f7faf7]"
                disabled={isDeletingGroup}
                onClick={() => setGroupToDelete(null)}
                type="button"
              >
                Жок / Жабуу
              </button>
              <button
                className="rounded-md bg-[#b9504c] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeletingGroup}
                onClick={handleDeleteGroup}
                type="button"
              >
                {isDeletingGroup ? "Өчүрүлүүдө..." : "Ооба, өчүрүү"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-20 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-md border px-4 py-3 text-sm font-bold shadow-lg ${
            toast.type === "success"
              ? "border-[#c7e3ce] bg-[#f1f9f2] text-forest"
              : "border-[#f0c8c1] bg-[#fff4f1] text-[#b9504c]"
          }`}
          role="status"
        >
          <CheckCircle2 size={18} />
          <span>{toast.message}</span>
        </div>
      )}
    </main>
  );
}
