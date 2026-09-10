import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  LogOut,
  Pencil,
  RefreshCw,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { fetchPayroll, fetchPayrollRates, upsertMentorRate, deleteMentorRate } from "../api/attendanceApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function monthRange(year, month) {
  const last = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
}

function fmt(n) {
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function downloadCsv(payroll) {
  const rows = [];
  rows.push(["Ментор", "Группа", "Уроков", "Офф.", "Онл.", "Всего", "К выплате (сом)"]);
  for (const m of payroll.mentors) {
    for (const g of m.groups) {
      rows.push([m.mentor_name, g.group_name, g.lessons_count, g.offline_count, g.online_count, g.present_count, g.total_salary]);
    }
    rows.push([m.mentor_name, "ИТОГО", m.totals.lessons_count, m.totals.offline_count, m.totals.online_count, m.totals.present_count, m.totals.total_salary]);
    rows.push([]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = `okurmen-payroll-${payroll.start_date}-${payroll.end_date}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${accent ? "text-orange-600" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function BreakdownBadge({ label, value, color }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-3 py-2 ${color}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      <span className="mt-0.5 text-sm font-extrabold">{value}</span>
    </div>
  );
}

function MentorRow({ mentor, expanded, onToggle }) {
  const t = mentor.totals;
  const rateHasBonus = mentor.online_bonus > 0 || mentor.offline_bonus > 0;

  return (
    <div className="border-b border-slate-100 last:border-0">
      {/* Mentor header row */}
      <button
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50"
        onClick={onToggle}
        type="button"
      >
        <span className="shrink-0 text-slate-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="flex-1 font-bold text-slate-900">{mentor.mentor_name}</span>

        {/* Compact breakdown badges */}
        <div className="hidden items-center gap-2 sm:flex">
          <BreakdownBadge label="Уроков" value={t.lessons_count} color="bg-slate-100 text-slate-700" />
          <BreakdownBadge label="Офф." value={t.offline_count} color="bg-green-50 text-green-700" />
          <BreakdownBadge label="Онл." value={t.online_count} color="bg-blue-50 text-blue-700" />
          <BreakdownBadge label="Посещ." value={t.present_count} color="bg-slate-100 text-slate-700" />
        </div>

        <div className="ml-4 text-right">
          <p className="text-lg font-extrabold text-orange-600">{fmt(t.total_salary)} сом</p>
          <p className="text-[11px] text-slate-400">
            {fmt(mentor.base_rate)} сом/посещ.{rateHasBonus ? " + бонусы" : ""}
          </p>
        </div>
      </button>

      {/* Expanded: per-group breakdown */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 pb-4 pt-3">
          {/* Rate info */}
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
              Базовая ставка: {fmt(mentor.base_rate)} сом
            </span>
            {mentor.online_bonus > 0 && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                Онлайн-бонус: +{fmt(mentor.online_bonus)} сом
              </span>
            )}
            {mentor.offline_bonus > 0 && (
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                Оффлайн-бонус: +{fmt(mentor.offline_bonus)} сом
              </span>
            )}
            {mentor.notes && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                📝 {mentor.notes}
              </span>
            )}
          </div>

          {/* Groups table */}
          {mentor.groups.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-900 text-left text-[11px] font-extrabold uppercase tracking-wider text-white">
                    <th className="px-3 py-2.5">Группа</th>
                    <th className="px-3 py-2.5 text-center">Уроков</th>
                    <th className="px-3 py-2.5 text-center">Оффлайн</th>
                    <th className="px-3 py-2.5 text-center">Онлайн</th>
                    <th className="px-3 py-2.5 text-center">Всего</th>
                    <th className="px-3 py-2.5 text-right">Офф. доход</th>
                    <th className="px-3 py-2.5 text-right">Онл. доход</th>
                    <th className="px-3 py-2.5 text-right font-extrabold text-orange-300">К выплате</th>
                  </tr>
                </thead>
                <tbody>
                  {mentor.groups.map((g) => (
                    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50" key={g.group_id}>
                      <td className="px-3 py-3 font-semibold text-slate-800">{g.group_name}</td>
                      <td className="px-3 py-3 text-center text-slate-500">{g.lessons_count}</td>
                      <td className="px-3 py-3 text-center font-medium text-green-700">{g.offline_count}</td>
                      <td className="px-3 py-3 text-center font-medium text-blue-700">{g.online_count}</td>
                      <td className="px-3 py-3 text-center font-bold text-slate-700">{g.present_count}</td>
                      <td className="px-3 py-3 text-right text-slate-600">{fmt(g.offline_earnings)}</td>
                      <td className="px-3 py-3 text-right text-slate-600">{fmt(g.online_earnings)}</td>
                      <td className="px-3 py-3 text-right font-extrabold text-orange-600">{fmt(g.total_salary)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-orange-50">
                    <td className="px-3 py-3 font-extrabold text-slate-800">Итого</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-700">{t.lessons_count}</td>
                    <td className="px-3 py-3 text-center font-bold text-green-700">{t.offline_count}</td>
                    <td className="px-3 py-3 text-center font-bold text-blue-700">{t.online_count}</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-800">{t.present_count}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{fmt(t.offline_earnings)}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{fmt(t.online_earnings)}</td>
                    <td className="px-3 py-3 text-right text-lg font-extrabold text-orange-600">{fmt(t.total_salary)} сом</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">За период нет данных по группам.</p>
          )}
        </div>
      )}
    </div>
  );
}

function RateEditorModal({ mentor, onClose, onSaved }) {
  const [baseRate, setBaseRate] = useState(String(mentor.base_rate));
  const [onlineBonus, setOnlineBonus] = useState(String(mentor.online_bonus));
  const [offlineBonus, setOfflineBonus] = useState(String(mentor.offline_bonus));
  const [notes, setNotes] = useState(mentor.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const updated = await upsertMentorRate(mentor.mentor_id, {
        base_rate: baseRate,
        online_bonus: onlineBonus,
        offline_bonus: offlineBonus,
        notes,
      });
      onSaved(updated);
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await deleteMentorRate(mentor.mentor_id);
      onSaved({ ...mentor, base_rate: 150, online_bonus: 0, offline_bonus: 0, notes: "", is_custom: false });
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сброса.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-orange-600">Ставка ментора</p>
            <h3 className="font-bold text-slate-900">{mentor.mentor_name}</h3>
          </div>
          <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            Базовая ставка (сом / посещение)
            <input
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 focus:border-orange-400 focus:outline-none"
              min="0"
              onChange={(e) => setBaseRate(e.target.value)}
              step="0.01"
              type="number"
              value={baseRate}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
              Онлайн-бонус (+сом)
              <input
                className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-blue-700 focus:border-blue-400 focus:outline-none"
                min="0"
                onChange={(e) => setOnlineBonus(e.target.value)}
                step="0.01"
                type="number"
                value={onlineBonus}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
              Оффлайн-бонус (+сом)
              <input
                className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-green-700 focus:border-green-400 focus:outline-none"
                min="0"
                onChange={(e) => setOfflineBonus(e.target.value)}
                step="0.01"
                type="number"
                value={offlineBonus}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            Примечание (контракт, условия)
            <textarea
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: договор №123, испытательный срок..."
              rows={2}
              value={notes}
            />
          </label>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{error}</p>}

          {/* Preview */}
          <div className="rounded-lg bg-orange-50 px-4 py-3">
            <p className="text-xs font-bold text-orange-700">Предпросмотр формулы:</p>
            <p className="mt-1 text-xs text-slate-600">
              Офф.: {baseRate || 0} + {offlineBonus || 0} = {(Number(baseRate) || 0) + (Number(offlineBonus) || 0)} сом/посещ.
              &nbsp;|&nbsp;
              Онл.: {baseRate || 0} + {onlineBonus || 0} = {(Number(baseRate) || 0) + (Number(onlineBonus) || 0)} сом/посещ.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <button
            className="text-xs font-bold text-slate-400 hover:text-red-500 disabled:opacity-50"
            disabled={saving || !mentor.is_custom}
            onClick={handleReset}
            title="Сбросить до глобальных настроек"
            type="button"
          >
            Сбросить до стандарта
          </button>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              Отмена
            </button>
            <button
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RatesPanel({ rates, onEdit, isLoading }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-xs font-extrabold uppercase tracking-wider text-orange-600">Настройки ставок</p>
        <h3 className="font-bold text-slate-900">Индивидуальные ставки менторов</h3>
        <p className="mt-1 text-xs text-slate-500">
          Если ставка не задана — применяется глобальный стандарт (150 сом / посещение).
        </p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <img alt="Загрузка" className="h-12 w-12 animate-pulse rounded-full" src="/logo.jpg" />
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rates.map((r) => (
            <div className="flex items-center gap-3 px-5 py-3.5" key={r.mentor_id}>
              <div className="flex-1">
                <p className="font-semibold text-slate-800">{r.mentor_name}</p>
                <p className="text-xs text-slate-400">
                  База: {fmt(r.base_rate)} сом
                  {r.online_bonus > 0 ? ` · Онл. +${fmt(r.online_bonus)}` : ""}
                  {r.offline_bonus > 0 ? ` · Офф. +${fmt(r.offline_bonus)}` : ""}
                  {r.notes ? ` · ${r.notes}` : ""}
                </p>
              </div>
              {r.is_custom && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-extrabold text-orange-700">
                  Индивид.
                </span>
              )}
              <button
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-orange-600"
                onClick={() => onEdit(r)}
                title="Редактировать ставку"
                type="button"
              >
                <Pencil size={15} />
              </button>
            </div>
          ))}
          {!rates.length && (
            <p className="py-8 text-center text-sm text-slate-400">Менторов не найдено.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountantDashboard({ user, onLogout }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeSection, setActiveSection] = useState("payroll");
  const [filterMentor, setFilterMentor] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  const [payroll, setPayroll] = useState(null);
  const [rates, setRates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRatesLoading, setIsRatesLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedMentors, setExpandedMentors] = useState({});
  const [editingRate, setEditingRate] = useState(null);

  const { startDate, endDate } = monthRange(year, month);

  // Load payroll data
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");
    fetchPayroll(startDate, endDate)
      .then((data) => { if (mounted) setPayroll(data); })
      .catch((err) => { if (mounted) setError(err.response?.data?.detail || "Ошибка загрузки ведомости."); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [startDate, endDate]);

  // Load rates when switching to rates section
  useEffect(() => {
    if (activeSection !== "rates") return;
    let mounted = true;
    setIsRatesLoading(true);
    fetchPayrollRates()
      .then((data) => { if (mounted) setRates(data.rates || []); })
      .catch(() => {})
      .finally(() => { if (mounted) setIsRatesLoading(false); });
    return () => { mounted = false; };
  }, [activeSection]);

  const allGroupNames = useMemo(() => {
    if (!payroll) return [];
    const names = new Set();
    for (const m of payroll.mentors) {
      for (const g of m.groups) names.add(g.group_name);
    }
    return [...names].sort();
  }, [payroll]);

  const filteredMentors = useMemo(() => {
    if (!payroll) return [];
    return payroll.mentors.filter((m) => {
      const mentorMatch = !filterMentor || m.mentor_name.toLowerCase().includes(filterMentor.toLowerCase());
      const groupMatch = !filterGroup || m.groups.some((g) => g.group_name === filterGroup);
      return mentorMatch && groupMatch;
    });
  }, [payroll, filterMentor, filterGroup]);

  const totals = useMemo(() => {
    return filteredMentors.reduce(
      (acc, m) => ({
        salary: acc.salary + m.totals.total_salary,
        present: acc.present + m.totals.present_count,
        lessons: acc.lessons + m.totals.lessons_count,
        online: acc.online + m.totals.online_count,
        offline: acc.offline + m.totals.offline_count,
      }),
      { salary: 0, present: 0, lessons: 0, online: 0, offline: 0 },
    );
  }, [filteredMentors]);

  function toggleMentor(id) {
    setExpandedMentors((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll() {
    const next = {};
    for (const m of filteredMentors) next[m.mentor_id] = true;
    setExpandedMentors(next);
  }

  function collapseAll() {
    setExpandedMentors({});
  }

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  const NAV = [
    { id: "payroll", label: "Расчёт зарплат", icon: Wallet },
    { id: "rates", label: "Ставки менторов", icon: Settings },
    { id: "reports", label: "Отчёты", icon: FileText },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img alt="Окурмэн" className="h-11 w-11 rounded-full object-contain" src="/logo.jpg" />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-orange-600">Окурмэн</p>
              <h1 className="text-lg font-extrabold text-slate-900">Панель бухгалтера</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-slate-500 sm:block">{user?.full_name || user?.email}</span>
            <button
              aria-label="Выйти"
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-orange-50 hover:text-orange-600"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Sidebar nav */}
        <aside className="w-full shrink-0 lg:w-56">
          <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 lg:flex-col">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                className={`inline-flex min-w-max items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition ${
                  activeSection === id
                    ? "bg-orange-500 text-white"
                    : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                }`}
                key={id}
                onClick={() => setActiveSection(id)}
                type="button"
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <section className="min-w-0 flex-1">

          {/* ── Payroll section ── */}
          {activeSection === "payroll" && (
            <>
              {/* Period selector */}
              <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                  Месяц
                  <select
                    className="h-10 min-w-[140px] rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 focus:border-orange-400 focus:outline-none"
                    onChange={(e) => setMonth(Number(e.target.value))}
                    value={month}
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                  Год
                  <select
                    className="h-10 min-w-[90px] rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 focus:border-orange-400 focus:outline-none"
                    onChange={(e) => setYear(Number(e.target.value))}
                    value={year}
                  >
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                  Ментор
                  <input
                    className="h-10 min-w-[160px] rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus:border-orange-400 focus:outline-none"
                    onChange={(e) => setFilterMentor(e.target.value)}
                    placeholder="Поиск по имени..."
                    type="search"
                    value={filterMentor}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                  Группа
                  <select
                    className="h-10 min-w-[140px] rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 focus:border-orange-400 focus:outline-none"
                    onChange={(e) => setFilterGroup(e.target.value)}
                    value={filterGroup}
                  >
                    <option value="">Все группы</option>
                    {allGroupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    disabled={!payroll}
                    onClick={() => payroll && downloadCsv(payroll)}
                    type="button"
                  >
                    <Download size={15} />CSV
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    disabled={isLoading}
                    onClick={() => { setPayroll(null); setIsLoading(true); fetchPayroll(startDate, endDate).then(setPayroll).catch(() => {}).finally(() => setIsLoading(false)); }}
                    type="button"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>

              {/* Summary stat cards */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard label="К выплате" value={`${fmt(totals.salary)} сом`} accent />
                <StatCard label="Посещений" value={totals.present} />
                <StatCard label="Уроков" value={totals.lessons} />
                <StatCard label="Оффлайн" value={totals.offline} />
                <StatCard label="Онлайн" value={totals.online} />
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}

              {/* Payroll table */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-bold text-slate-700">
                    {MONTH_NAMES[month - 1]} {year} · {filteredMentors.length} ментор(ов)
                  </p>
                  <div className="flex gap-2">
                    <button className="text-xs font-bold text-slate-400 hover:text-slate-700" onClick={expandAll} type="button">
                      Развернуть все
                    </button>
                    <span className="text-slate-300">|</span>
                    <button className="text-xs font-bold text-slate-400 hover:text-slate-700" onClick={collapseAll} type="button">
                      Свернуть
                    </button>
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <img alt="Загрузка" className="h-14 w-14 animate-pulse rounded-full" src="/logo.jpg" />
                  </div>
                ) : !filteredMentors.length ? (
                  <p className="py-12 text-center text-sm text-slate-400">
                    За выбранный период данных нет.
                  </p>
                ) : (
                  filteredMentors.map((mentor) => (
                    <MentorRow
                      expanded={!!expandedMentors[mentor.mentor_id]}
                      key={mentor.mentor_id}
                      mentor={mentor}
                      onToggle={() => toggleMentor(mentor.mentor_id)}
                    />
                  ))
                )}

                {/* Grand total footer */}
                {!isLoading && filteredMentors.length > 0 && (
                  <div className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-extrabold text-slate-800">
                      Итого к выплате ({filteredMentors.length} ментор(ов)):
                    </span>
                    <span className="text-xl font-extrabold text-orange-600">
                      {fmt(totals.salary)} сом
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Rates section ── */}
          {activeSection === "rates" && (
            <RatesPanel
              isLoading={isRatesLoading}
              onEdit={(r) => setEditingRate(r)}
              rates={rates}
            />
          )}

          {/* ── Reports section ── */}
          {activeSection === "reports" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-orange-600">Отчёты</p>
              <h3 className="mb-4 text-lg font-bold text-slate-900">Экспорт данных</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100">
                      <Download className="text-orange-600" size={18} />
                    </span>
                    <div>
                      <p className="font-bold text-slate-800">CSV (Excel)</p>
                      <p className="text-xs text-slate-400">Ведомость по менторам за период</p>
                    </div>
                  </div>
                  <button
                    className="w-full rounded-md bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
                    disabled={!payroll}
                    onClick={() => payroll && downloadCsv(payroll)}
                    type="button"
                  >
                    Скачать CSV — {MONTH_NAMES[month - 1]} {year}
                  </button>
                </div>
                <div className="rounded-lg border border-slate-200 p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                      <FileText className="text-slate-600" size={18} />
                    </span>
                    <div>
                      <p className="font-bold text-slate-800">Печать</p>
                      <p className="text-xs text-slate-400">Распечатать текущую ведомость</p>
                    </div>
                  </div>
                  <button
                    className="w-full rounded-md border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    onClick={() => window.print()}
                    type="button"
                  >
                    Открыть диалог печати
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Rate editor modal */}
      {editingRate && (
        <RateEditorModal
          mentor={editingRate}
          onClose={() => setEditingRate(null)}
          onSaved={(updated) => {
            setRates((prev) => prev.map((r) => r.mentor_id === updated.mentor_id ? { ...r, ...updated } : r));
            setEditingRate(null);
          }}
        />
      )}
    </main>
  );
}
