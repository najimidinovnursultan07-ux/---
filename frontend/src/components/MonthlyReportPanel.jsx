import { useEffect, useState } from "react";
import { Download, FileText, Users } from "lucide-react";
import { downloadCuratorMonthlyPdf, downloadMentorMonthlyPdf } from "../api/attendanceApi";
import { fetchUsers } from "../api/authApi";

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function getDefaultPeriod() {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MonthlyReportPanel({ role, onToast }) {
  const { year: defaultYear, month: defaultMonth } = getDefaultPeriod();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [mentors, setMentors] = useState([]);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [loadingMentors, setLoadingMentors] = useState(false);
  const [downloading, setDownloading] = useState(""); // "mentor" | "curator" | ""

  const isMentor = role === "MENTOR";
  const isAdminOrCurator = role === "ADMIN" || role === "CURATOR";

  // Load mentor list for Admin/Curator
  useEffect(() => {
    if (!isAdminOrCurator) return;
    setLoadingMentors(true);
    fetchUsers()
      .then((users) => {
        const mentorList = users.filter((u) => u.role === "MENTOR");
        setMentors(mentorList);
      })
      .catch(() => {})
      .finally(() => setLoadingMentors(false));
  }, [isAdminOrCurator]);

  async function handleDownload(type) {
    setDownloading(type);
    try {
      const mentorIdParam = isAdminOrCurator ? selectedMentorId || undefined : undefined;
      let blob;
      let filename;
      if (type === "mentor") {
        blob = await downloadMentorMonthlyPdf(year, month, mentorIdParam);
        const mentorSuffix = mentorIdParam
          ? mentors.find((m) => String(m.id) === String(mentorIdParam))?.full_name?.replace(/\s+/g, "_") || mentorIdParam
          : "Мой_Отчет";
        filename = `Mentor_Report_${mentorSuffix}_${year}_${String(month).padStart(2, "0")}.pdf`;
      } else {
        blob = await downloadCuratorMonthlyPdf(year, month, mentorIdParam);
        filename = `Curator_Report_${year}_${String(month).padStart(2, "0")}.pdf`;
      }
      triggerBlobDownload(blob, filename);
      onToast?.({ type: "success", message: "PDF отчет жүктөлдү." });
    } catch (err) {
      const detail = err.response?.data?.detail;
      let errorMsg = detail || "PDF жүктөөдө ката кетти.";
      // If blob response, try to parse error text
      if (!detail && err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          errorMsg = parsed.detail || errorMsg;
        } catch (_) {}
      }
      onToast?.({ type: "error", message: errorMsg });
    } finally {
      setDownloading("");
    }
  }

  // Build year options: current year and 2 previous
  const years = [defaultYear - 2, defaultYear - 1, defaultYear];

  return (
    <section className="rounded-lg border border-[#e6ece8] bg-white shadow-panel">
      {/* Header */}
      <div className="border-b border-[#e6ece8] px-5 py-5 sm:px-7">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-coral-dark">
          АЙЛЫК ОТЧЕТ
        </p>
        <h1 className="font-display text-2xl text-ink sm:text-3xl">PDF Отчеттор</h1>
        <p className="mt-1 text-sm text-muted">
          Айлык жыйынтыкты PDF форматында жүктөп алыңыз
        </p>
      </div>

      <div className="px-5 py-6 sm:px-7">
        {/* Period selector */}
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-extrabold text-muted">
            Ай
            <select
              className="h-10 min-w-[140px] rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-bold text-ink outline-none focus:border-forest"
              onChange={(e) => setMonth(Number(e.target.value))}
              value={month}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-extrabold text-muted">
            Жыл
            <select
              className="h-10 min-w-[100px] rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-bold text-ink outline-none focus:border-forest"
              onChange={(e) => setYear(Number(e.target.value))}
              value={year}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          {/* Mentor filter for Admin/Curator */}
          {isAdminOrCurator && (
            <label className="flex flex-col gap-1 text-xs font-extrabold text-muted">
              <span className="flex items-center gap-1">
                <Users size={13} /> Ментор (фильтр)
              </span>
              <select
                className="h-10 min-w-[200px] rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-bold text-ink outline-none focus:border-forest disabled:opacity-50"
                disabled={loadingMentors}
                onChange={(e) => setSelectedMentorId(e.target.value)}
                value={selectedMentorId}
              >
                <option value="">Бардык менторлор</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Selected period display */}
        <p className="mb-6 text-sm font-bold text-ink">
          Тандалган мезгил:{" "}
          <span className="text-[#FF6B00]">
            {MONTH_NAMES[month - 1]} {year}
          </span>
        </p>

        {/* Report cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Mentor report — available to MENTOR and ADMIN */}
          {(isMentor || role === "ADMIN") && (
            <div className="rounded-lg border border-[#e6ece8] bg-[#fafcf9] p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6B00]/10">
                  <FileText className="text-[#FF6B00]" size={20} />
                </span>
                <div>
                  <p className="font-bold text-ink">Менторлук отчет</p>
                  <p className="text-xs text-muted">Тайпалар, сабак, зарплата</p>
                </div>
              </div>
              <ul className="mb-4 space-y-1 text-xs text-muted">
                <li>• Тайпалар боюнча катышуу таблицасы</li>
                <li>• Өткөрүлгөн сабак саны</li>
                <li>• Келген студенттер саны</li>
                <li>• Зарплата эсеби (150 KGS × катышуу)</li>
              </ul>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#FF6B00] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#e55f00] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={downloading === "mentor"}
                onClick={() => handleDownload("mentor")}
                type="button"
              >
                <Download size={16} />
                {downloading === "mentor" ? "Жүктөлүүдө..." : "Менторлук PDF жүктөө"}
              </button>
            </div>
          )}

          {/* Curator report — available to CURATOR and ADMIN */}
          {(role === "CURATOR" || role === "ADMIN") && (
            <div className="rounded-lg border border-[#e6ece8] bg-[#fafcf9] p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B192C]/10">
                  <FileText className="text-[#0B192C]" size={20} />
                </span>
                <div>
                  <p className="font-bold text-ink">Куратордук отчет</p>
                  <p className="text-xs text-muted">Студенттер, статистика, байланыш</p>
                </div>
              </div>
              <ul className="mb-4 space-y-1 text-xs text-muted">
                <li>• Студенттер тизмеси тайпалар боюнча</li>
                <li>• Айлык катышуу % статистикасы</li>
                <li>• Онлайн / Оффлайн активдүүлүк</li>
                <li>• Байланыш маалыматтары (телефон)</li>
              </ul>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0B192C] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#162232] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={downloading === "curator"}
                onClick={() => handleDownload("curator")}
                type="button"
              >
                <Download size={16} />
                {downloading === "curator" ? "Жүктөлүүдө..." : "Куратордук PDF жүктөө"}
              </button>
            </div>
          )}

          {/* Mentor role: only sees their own mentor report — show curator card as info */}
          {isMentor && (
            <div className="rounded-lg border border-dashed border-[#e6ece8] bg-[#f5f7f5] p-5 opacity-60">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B192C]/5">
                  <FileText className="text-muted" size={20} />
                </span>
                <div>
                  <p className="font-bold text-muted">Куратордук отчет</p>
                  <p className="text-xs text-muted">Куратор же Администратор гана</p>
                </div>
              </div>
              <p className="text-xs text-muted">
                Бул отчетту жүктөп алуу үчүн Куратор же Администратор болушуңуз керек.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
