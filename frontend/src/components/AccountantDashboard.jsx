import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Download, FileText, LogOut, Wallet } from "lucide-react";
import { fetchSalaryRows } from "../api/attendanceApi";

const RATE = 150;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getMonthRange(offset = 0) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const last = offset === 0
    ? today
    : new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  return { startDate: formatDate(first), endDate: formatDate(last) };
}

function downloadExcel(report) {
  const header = ["Имя ментора", "Название группы", "Проведенные уроки", "Отмеченные посещения", "К выплате (сом)"];
  const rows = report.rows.map((row) => [row.mentor_name, row.group_name, row.lessons_count, row.attendance_count, row.salary_amount]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `okurmen-salaries-${report.start_date}-${report.end_date}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printReport() {
  window.print();
}

export default function AccountantDashboard({ user, onLogout }) {
  const currentMonth = getMonthRange();
  const [activeSection, setActiveSection] = useState("overview");
  const [period, setPeriod] = useState("current");
  const [startDate, setStartDate] = useState(currentMonth.startDate);
  const [endDate, setEndDate] = useState(currentMonth.endDate);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");
    fetchSalaryRows(startDate, endDate)
      .then((data) => { if (isMounted) setReport(data); })
      .catch((requestError) => {
        if (isMounted) setError(requestError.response?.data?.detail || "Зарплат ведомостун жүктөө мүмкүн болгон жок.");
      })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, [startDate, endDate]);

  const totals = useMemo(() => (report?.rows || []).reduce((summary, row) => ({
    attendance: summary.attendance + row.attendance_count,
    salary: summary.salary + row.salary_amount,
  }), { attendance: 0, salary: 0 }), [report]);

  function changePeriod(value) {
    setPeriod(value);
    if (value === "current") {
      const range = getMonthRange();
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
    if (value === "previous") {
      const range = getMonthRange(-1);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img alt="Окурмэн" className="h-11 w-11 rounded-full object-contain" src="/logo.jpg" />
            <div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-600">Окурмэн</p><h1 className="text-lg font-extrabold text-slate-900">Панель бухгалтера</h1></div>
          </div>
          <div className="flex items-center gap-3"><span className="hidden text-sm font-semibold text-slate-600 sm:block">{user?.full_name || user?.email}</span><button aria-label="Выйти" className="rounded-md border border-slate-200 p-2 text-slate-900 hover:bg-orange-50" onClick={onLogout} title="Выйти" type="button"><LogOut size={17} /></button></div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 rounded-lg border border-slate-200 bg-white p-2 lg:w-60">
          <nav aria-label="Меню бухгалтера" className="flex gap-2 overflow-x-auto lg:flex-col">
            {[{ id: "overview", label: "Финансовый обзор", icon: BarChart3 }, { id: "salaries", label: "Расчет зарплат", icon: Wallet }, { id: "reports", label: "Отчеты", icon: FileText }].map(({ id, label, icon: Icon }) => <button className={`inline-flex min-w-max items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-bold ${activeSection === id ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"}`} key={id} onClick={() => setActiveSection(id)} type="button"><Icon size={17} />{label}</button>)}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <div className="mb-6"><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-orange-600">{activeSection === "overview" ? "Финансовый обзор" : activeSection === "salaries" ? "Расчет зарплат" : "Отчеты"}</p><h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Зарплата менторов</h2><p className="mt-2 text-sm text-slate-600">Формула: отмеченные посещения × {RATE} сом.</p></div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Посещения</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{totals.attendance}</p></div><div className="rounded-lg border border-orange-200 bg-orange-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-orange-700">К выплате</p><p className="mt-2 text-3xl font-extrabold text-orange-600">{totals.salary.toLocaleString("ru-RU")} сом</p></div></div>
          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-48 flex-1 flex-col gap-2 text-xs font-bold text-slate-600">Период<select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900" onChange={(event) => changePeriod(event.target.value)} value={period}><option value="current">Текущий месяц</option><option value="previous">Прошлый месяц</option><option value="custom">Выбранный период</option></select></label>
            <label className="flex min-w-40 flex-1 flex-col gap-2 text-xs font-bold text-slate-600"><span className="inline-flex items-center gap-1"><CalendarDays size={14} />С даты</span><input className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900" disabled={period !== "custom"} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
            <label className="flex min-w-40 flex-1 flex-col gap-2 text-xs font-bold text-slate-600">По дату<input className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900" disabled={period !== "custom"} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60" disabled={!report} onClick={() => downloadExcel(report)} type="button"><Download size={16} />Excel</button><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-900 hover:bg-slate-50" onClick={printReport} type="button"><FileText size={16} />PDF</button></div>
          </div>
          {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="min-w-[760px] w-full border-collapse text-sm"><thead><tr className="bg-slate-900 text-left text-xs font-extrabold uppercase tracking-wider text-white"><th className="px-4 py-3">Имя ментора</th><th className="px-4 py-3">Название группы</th><th className="px-4 py-3 text-center">Уроки</th><th className="px-4 py-3 text-center">Посещения</th><th className="px-4 py-3 text-right">К выплате</th></tr></thead><tbody>{isLoading ? <tr><td className="px-4 py-12 text-center" colSpan="5"><img alt="Окурмэн загружается" className="mx-auto h-14 w-14 rounded-full object-contain animate-pulse" src="/logo.jpg" /></td></tr> : report?.rows.map((row) => <tr className="border-t border-slate-100" key={`${row.mentor_id}-${row.group_id}`}><td className="px-4 py-4 font-bold text-slate-900">{row.mentor_name}</td><td className="px-4 py-4 text-slate-600">{row.group_name}</td><td className="px-4 py-4 text-center text-slate-600">{row.lessons_count}</td><td className="px-4 py-4 text-center font-bold text-slate-900">{row.attendance_count}</td><td className="px-4 py-4 text-right font-extrabold text-orange-600">{row.salary_amount.toLocaleString("ru-RU")} сом</td></tr>)}{!isLoading && !report?.rows.length && <tr><td className="px-4 py-12 text-center text-slate-500" colSpan="5">За выбранный период данных нет.</td></tr>}</tbody></table></div></div>
        </section>
      </div>
    </main>
  );
}
