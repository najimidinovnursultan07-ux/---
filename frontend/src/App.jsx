import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Archive, CheckCircle2, Download, FileText, Plus, RefreshCw, Wifi } from "lucide-react";
import { fetchMe } from "./api/authApi";
import AuthPanel from "./components/AuthPanel";
import UserRolePanel from "./components/UserRolePanel";
import AttendanceTable from "./components/AttendanceTable";
import AddStudentModal from "./components/AddStudentModal";
import DateSelector from "./components/DateSelector";
import RoleHeader from "./components/RoleHeader";
import StatsHeader, { DateSummary, StatsSummary } from "./components/StatsHeader";
import { createStudent, deleteGroup, deleteStudent, downloadAttendancePdf, fetchAttendance, fetchStudents, saveAttendance, updateStudent } from "./api/attendanceApi";
import AttendanceHistory from "./components/AttendanceHistory";
import AttendanceModeSection from "./components/AttendanceModeSection";
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

function createAttendanceMap(students, records = []) {
  const recordsByStudent = new Map(records.map((record) => [record.student_id, record.is_present]));
  return students.reduce((map, student) => {
    map[student.id] = Boolean(recordsByStudent.get(student.id));
    return map;
  }, {});
}

function createAttendanceRecords(records = []) {
  return records;
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
  const [attendanceMap, setAttendanceMap] = useState({});
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

  const handleAuthenticated = useCallback(() => {
    window.location.reload();
  }, []);

  const canEditAttendance = activeRole === "MENTOR" && selectedDate === getToday();
  const canManageStudents = activeRole === "MENTOR";
  const visibleStudents = useMemo(
    () => activeGroupId === "all" ? students : students.filter((student) => String(student.group_id) === activeGroupId),
    [activeGroupId, students],
  );

  const presentCount = useMemo(
    () => visibleStudents.reduce((count, student) => count + (attendanceMap[student.id] ? 1 : 0), 0),
    [attendanceMap, visibleStudents],
  );

  const loadAttendance = useCallback(async (date, currentStudents = students) => {
    if (!currentStudents.length) return;
    setError("");
    setIsLoading(true);
    try {
      const records = await fetchAttendance(date);
      setAttendanceMap(createAttendanceMap(currentStudents, records));
      setAttendanceRecords(createAttendanceRecords(records));
    } catch (loadError) {
      console.error("Attendance request failed", loadError);
      setError(getErrorMessage(loadError, "Катышуу маалыматтарын жүктөө мүмкүн болгон жок."));
    } finally {
      setIsLoading(false);
    }
  }, [students]);

  const handleDateChange = useCallback(async (date) => {
    setSelectedDate(date);
    await loadAttendance(date);
  }, [loadAttendance]);

  const handleToday = useCallback(() => {
    const today = getToday();
    setSelectedDate(today);
    loadAttendance(today);
  }, [loadAttendance]);

  const handleToggle = useCallback((studentId) => {
    if (!canEditAttendance) return;
    setAttendanceMap((currentMap) => ({
      ...currentMap,
      [studentId]: !currentMap[studentId],
    }));
  }, [canEditAttendance]);

  const handleSave = useCallback(async () => {
    if (!canEditAttendance) return;
    setIsSaving(true);
    setToast(null);
    setError("");
    const records = students.map((student) => ({
      student_id: student.id,
      is_present: Boolean(attendanceMap[student.id]),
    }));

    try {
      await saveAttendance(selectedDate, records);
      setToast({ type: "success", message: "Катышуу ийгиликтүү сакталды." });
    } catch (saveError) {
      console.error("Attendance save failed", saveError);
      setToast({ type: "error", message: getErrorMessage(saveError, "Сактоо ишке ашкан жок.") });
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setToast(null), 3500);
    }
  }, [attendanceMap, canEditAttendance, selectedDate, students]);

  const handleAddStudent = useCallback(async (studentDetails) => {
    setIsAddingStudent(true);
    try {
      const student = await createStudent(studentDetails);
      setStudents((currentStudents) => [...currentStudents, student].sort((first, second) => first.full_name.localeCompare(second.full_name, "ky")));
      setAttendanceMap((currentMap) => ({ ...currentMap, [student.id]: false }));
      setIsAddModalOpen(false);
      setToast({ type: "success", message: "Жаңы окуучу кошулду." });
      window.setTimeout(() => setToast(null), 3000);
    } catch (createError) {
      throw new Error(getErrorMessage(createError, "Окуучуну кошуу мүмкүн болгон жок."));
    } finally {
      setIsAddingStudent(false);
    }
  }, []);

  const handleUpdateStudent = useCallback(async (studentDetails) => {
    if (!studentToEdit) return;
    setIsAddingStudent(true);
    try {
      const updatedStudent = await updateStudent(studentToEdit.id, studentDetails);
      setStudents((currentStudents) => currentStudents.map((student) => student.id === updatedStudent.id ? updatedStudent : student).sort((first, second) => first.full_name.localeCompare(second.full_name, "ky")));
      setStudentToEdit(null);
      setIsAddModalOpen(false);
      setToast({ type: "success", message: "Окуучунун маалыматтары өзгөртүлдү." });
      window.setTimeout(() => setToast(null), 3000);
    } catch (updateError) {
      throw new Error(getErrorMessage(updateError, "Окуучунун маалыматтарын өзгөртүү мүмкүн болгон жок."));
    } finally {
      setIsAddingStudent(false);
    }
  }, [studentToEdit]);

  const handleDeleteStudent = useCallback(async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    setError("");
    try {
      await deleteStudent(studentToDelete.id);
      setStudents((currentStudents) => currentStudents.filter((student) => student.id !== studentToDelete.id));
      setAttendanceMap((currentMap) => {
        const nextMap = { ...currentMap };
        delete nextMap[studentToDelete.id];
        return nextMap;
      });
      setAttendanceRecords((currentRecords) => currentRecords.filter((record) => record.student_id !== studentToDelete.id));
      setStudentToDelete(null);
      setToast({ type: "success", message: "Окуучу ийгиликтүү өчүрүлдү." });
      window.setTimeout(() => setToast(null), 3000);
    } catch (deleteError) {
      setToast({ type: "error", message: getErrorMessage(deleteError, "Окуучуну өчүрүү мүмкүн болгон жок.") });
    } finally {
      setIsDeletingStudent(false);
    }
  }, [studentToDelete]);

  const handleDeleteGroup = useCallback(async () => {
    if (!groupToDelete) return;
    setIsDeletingGroup(true);
    try {
      await deleteGroup(groupToDelete.id);
      setDeletedGroupId(groupToDelete.id);
      setGroups((currentGroups) => currentGroups.filter((group) => group.id !== groupToDelete.id));
      setStudents((currentStudents) => currentStudents.filter((student) => student.group_id !== groupToDelete.id));
      if (activeGroupId === String(groupToDelete.id)) setActiveGroupId("all");
      setGroupToDelete(null);
      setToast({ type: "success", message: "Тайпа жана анын окуучулары өчүрүлдү." });
      window.setTimeout(() => setToast(null), 3000);
    } catch (deleteError) {
      setToast({ type: "error", message: getErrorMessage(deleteError, "Тайпаны өчүрүү мүмкүн болгон жок.") });
    } finally {
      setIsDeletingGroup(false);
    }
  }, [activeGroupId, groupToDelete]);

  const handleExportReport = useCallback(async () => {
    try {
      const blob = await downloadAttendancePdf(selectedDate);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Kelgender_Otchet_${selectedDate}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      setToast({ type: "success", message: "PDF отчет жүктөлдү." });
    } catch (reportError) {
      setError(getErrorMessage(reportError, "Отчетту жүктөө мүмкүн болгон жок."));
    }
  }, [selectedDate]);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);
      try {
        const currentUser = await fetchMe();
        if (!isMounted) return;
        setUser(currentUser);
        setActiveRole(currentUser.effective_role || currentUser.role || "USER");
        if ((currentUser.effective_role || currentUser.role) === "ACCOUNTANT") {
          if (window.location.pathname !== "/accountant/dashboard") window.history.replaceState({}, "", "/accountant/dashboard");
          return;
        }
        const loadedGroups = ["ADMIN", "CURATOR", "MENTOR"].includes(currentUser.effective_role || currentUser.role)
          ? await fetchGroups()
          : [];
        if (!isMounted) return;
        setGroups(loadedGroups);
        const loadedStudents = await fetchStudents();
        if (!isMounted) return;
        setStudents(loadedStudents);
        const records = await fetchAttendance(selectedDate);
        if (isMounted) {
          setAttendanceMap(createAttendanceMap(loadedStudents, records));
          setAttendanceRecords(records);
        }
      } catch (loadError) {
        console.error("Student request failed", loadError);
        if (isMounted) setError(getErrorMessage(loadError, "Окуучуларды жүктөө мүмкүн болгон жок."));
      } finally {
        setIsAuthLoading(false);
        if (isMounted) setIsLoading(false);
      }
    }

    loadStudents();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isAuthLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><img alt="Окурмэн жүктөлүүдө" className="h-24 w-24 rounded-full object-contain animate-pulse" src="/logo.jpg" /></div>;
  if (!user) return <AuthPanel onAuthenticated={handleAuthenticated} />;
  if (activeRole === "ACCOUNTANT") return <AccountantDashboard user={user} onLogout={() => { window.localStorage.removeItem("attendance-token"); window.location.replace("/"); }} />;
  if (!user.is_approved && user.role !== "ADMIN") {
    return <main className="flex min-h-screen items-center justify-center px-5"><div className="max-w-lg rounded-lg border border-[#eadcc3] bg-[#fffaf0] p-8 text-center shadow-sm"><h1 className="mb-3 font-display text-xl font-bold text-ink">Аккаунт күтүп жатат</h1><p className="text-sm leading-6 text-[#765f38]">Аккаунтуңузга уруксат бериле элек. Администратор же Куратор ролуңузду бекитишин күтүңүз.</p><button className="mt-6 rounded-md bg-ink px-4 py-2 text-sm font-bold text-white" onClick={() => { window.localStorage.removeItem("attendance-token"); window.location.reload(); }} type="button">Чыгуу</button></div></main>;
  }

  return (
    <main className="min-h-screen px-3 py-8 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-[1160px]">
        <RoleHeader activeRole={activeRole} user={user} onLogout={() => { window.localStorage.removeItem("attendance-token"); window.location.reload(); }} />
        {activeRole === "ADMIN" && <div className="mb-5 rounded-md border border-[#c6ddc8] bg-[#edf5ee] px-4 py-3 text-sm font-extrabold text-forest" role="status">Режим наблюдения (Администратор)</div>}
        {(activeRole === "ADMIN" || activeRole === "CURATOR") && <UserRolePanel role={activeRole} />}
        {(activeRole === "ADMIN" || activeRole === "CURATOR") && <MentorWorkspace role={activeRole} />}
        {(activeRole === "ADMIN" || activeRole === "CURATOR" || activeRole === "MENTOR") && <GroupManagementPanel canManage={activeRole === "MENTOR"} deletedGroupId={deletedGroupId} onGroupCreated={(group) => { setGroups((current) => [...current, group]); setActiveGroupId(String(group.id)); }} role={activeRole} />}
        <div className="mb-5 flex min-w-0 gap-2 overflow-x-auto border-b border-slate-200">
          <button className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-extrabold ${activeView === "daily" ? "border-orange-500 text-orange-600" : "border-transparent text-muted"}`} onClick={() => setActiveView("daily")} type="button">Күнүмдүк журнал</button>
          <button className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-extrabold ${activeView === "modes" ? "border-orange-500 text-orange-600" : "border-transparent text-muted"}`} onClick={() => setActiveView("modes")} type="button"><Wifi size={16} />Келди / Онлайн / Жок</button>
          {(activeRole === "ADMIN" || activeRole === "CURATOR") && <button className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-extrabold ${activeView === "history" ? "border-orange-500 text-orange-600" : "border-transparent text-muted"}`} onClick={() => setActiveView("history")} type="button"><Archive size={16} />3 айлык архив</button>}
          <button className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-extrabold ${activeView === "monthly-report" ? "border-orange-500 text-orange-600" : "border-transparent text-muted"}`} onClick={() => setActiveView("monthly-report")} type="button"><FileText size={16} />Айлык PDF</button>
        </div>
        {activeView === "history" ? <AttendanceHistory /> : activeView === "modes" ? <AttendanceModeSection canEdit={activeRole === "MENTOR"} initialDate={getToday()} onSaved={(msg) => typeof msg === "string" ? setToast({ type: "success", message: msg }) : setToast(msg)} students={visibleStudents} /> : activeView === "monthly-report" ? <MonthlyReportPanel role={activeRole} onToast={(t) => { setToast(t); window.setTimeout(() => setToast(null), 3500); }} /> : <>
        <GroupTabs
          activeGroupId={activeGroupId}
          canDelete={canManageStudents}
          groups={groups}
          onAddGroup={canManageStudents ? () => document.getElementById("group-management-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
          onDeleteGroup={setGroupToDelete}
          onGroupChange={setActiveGroupId}
        />
        <StatsHeader
          presentCount={presentCount}
          selectedDate={selectedDate}
          totalCount={visibleStudents.length}
        />

        <div className="mb-5 flex flex-col gap-4">
          <DateSelector
            canEdit={canEditAttendance}
            isSaving={isSaving}
            onDateChange={handleDateChange}
            onSave={handleSave}
            onToday={handleToday}
            selectedDate={selectedDate}
          />
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              {canManageStudents && <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-xs font-extrabold text-white transition hover:bg-[#2b3a40] sm:w-auto" onClick={() => { setStudentToEdit(null); setIsAddModalOpen(true); }} type="button"><Plus size={16} />Окуучу кошуу</button>}
              {(activeRole === "ADMIN" || activeRole === "CURATOR" || activeRole === "MENTOR") && <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#d6dfd8] bg-white px-4 text-xs font-extrabold text-ink transition hover:border-forest hover:bg-[#f1f9f2] sm:w-auto" onClick={handleExportReport} type="button"><Download size={16} />PDF Отчет</button>}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <DateSummary selectedDate={selectedDate} />
            <StatsSummary presentCount={presentCount} totalCount={visibleStudents.length} />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-md border border-[#f0c8c1] bg-[#fff4f1] px-4 py-3 text-sm text-[#b9504c]" role="alert">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/75 backdrop-blur-[1px]">
              <RefreshCw className="animate-spin text-forest" size={26} />
              <span className="sr-only">Маалымат жүктөлүүдө</span>
            </div>
          )}
          <AttendanceTable
            attendanceMap={attendanceMap}
            onToggle={handleToggle}
            selectedDate={selectedDate}
            students={visibleStudents}
            canEdit={canEditAttendance}
            canManageStudents={canManageStudents}
            onDelete={setStudentToDelete}
            onEdit={(student) => { setStudentToEdit(student); setIsAddModalOpen(true); }}
          />
        </div>
        </>}
      </div>

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
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="delete-student-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink" id="delete-student-title">Окуучуну өчүрүү</h2>
            <p className="mt-3 text-sm leading-6 text-muted">Чын эле {studentToDelete.full_name} тизмеден өчүрүүнү каалайсызбы?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-md border border-[#d6dfd8] px-4 py-2 text-sm font-bold text-ink transition hover:bg-[#f7faf7]" disabled={isDeletingStudent} onClick={() => setStudentToDelete(null)} type="button">Жок / Жабуу</button>
              <button className="rounded-md bg-[#b9504c] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60" disabled={isDeletingStudent} onClick={handleDeleteStudent} type="button">{isDeletingStudent ? "Өчүрүлүүдө..." : "Ооба, өчүрүү"}</button>
            </div>
          </div>
        </div>
      )}

      {groupToDelete && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink" id="delete-group-title">Тайпаны өчүрүү</h2>
            <p className="mt-3 text-sm leading-6 text-muted">Чын эле бул тайпаны жана анын ичиндеги окуучуларды өчүрүүнү каалайсызбы?</p>
            <p className="mt-2 text-sm font-bold text-ink">{groupToDelete.name}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-md border border-[#d6dfd8] px-4 py-2 text-sm font-bold text-ink transition hover:bg-[#f7faf7]" disabled={isDeletingGroup} onClick={() => setGroupToDelete(null)} type="button">Жок / Жабуу</button>
              <button className="rounded-md bg-[#b9504c] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60" disabled={isDeletingGroup} onClick={handleDeleteGroup} type="button">{isDeletingGroup ? "Өчүрүлүүдө..." : "Ооба, өчүрүү"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-20 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-md border px-4 py-3 text-sm font-bold shadow-lg ${toast.type === "success" ? "border-[#c7e3ce] bg-[#f1f9f2] text-forest" : "border-[#f0c8c1] bg-[#fff4f1] text-[#b9504c]"}`} role="status">
          <CheckCircle2 size={18} />
          <span>{toast.message}</span>
        </div>
      )}
    </main>
  );
}
