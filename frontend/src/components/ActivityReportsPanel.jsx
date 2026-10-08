import { useEffect, useState } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createActivityReport,
  deleteActivityReport,
  fetchActivityReports,
  updateActivityReport,
} from "../api/attendanceApi";

function createEmptyForm(reportDate, reportType = "LIVE_STREAM") {
  return {
    report_type: reportType,
    report_date: reportDate,
    topic: "",
    event_datetime: `${reportDate}T19:00`,
    summary: "",
    first_place: "",
    second_place: "",
    third_place: "",
  };
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getErrorMessage(error, action = "сактоодо") {
  if (!error.response) {
    return "Серверге туташуу мүмкүн болбой жатат. Интернет байланышын текшерип, кайра аракет кылыңыз.";
  }

  const status = error.response.status;
  if (status === 401) return "Сеансыңыз бүткөн. Аккаунтка кайра кириңиз.";
  if (status === 403) return "Бул аракетти аткарууга уруксатыңыз жок.";
  if (status === 404) {
    return "Отчет сакталган жок: серверде отчет кызматы табылган жок. Серверге акыркы backend версиясын жайгаштырып, маалымат базасынын миграциясын жүргүзүү керек.";
  }
  if (status >= 500) {
    return "Серверде ката чыкты. Отчет сакталган жок. Сервердин жаңыртылганын жана отчеттор үчүн маалымат базасы даяр экенин текшерип, кайра аракет кылыңыз.";
  }

  const data = error.response?.data;
  if (status === 400 || status === 422) {
    const fieldMessages = {
      report_type: "Отчеттун түрүн кайра тандаңыз.",
      report_date: "Отчеттун күнүн текшериңиз.",
      topic: "Теманы толтуруп, кайра аракет кылыңыз.",
      event_datetime: "Эфирдин күнүн жана убактысын туура көрсөтүңүз.",
      summary: "Кыскача маалыматты толтуруңуз.",
      first_place: "1-орундун жеңүүчүсүнүн атын текшериңиз.",
      second_place: "2-орундун жеңүүчүсүнүн атын текшериңиз.",
      third_place: "3-орундун жеңүүчүсүнүн атын текшериңиз.",
    };
    if (data?.detail && /[А-Яа-яЁёӨөҮүҢң]/.test(data.detail)) return data.detail;
    if (data && typeof data === "object") {
      for (const [field, messages] of Object.entries(data)) {
        const firstMessage = Array.isArray(messages) ? messages[0] : messages;
        if (typeof firstMessage === "string" && /[А-Яа-яЁёӨөҮүҢң]/.test(firstMessage)) return firstMessage;
        if (fieldMessages[field]) return fieldMessages[field];
      }
    }
    return "Киргизилген маалыматтарды текшериңиз. Тема, убакыт жана жыйынтык талааларын туура толтуруңуз.";
  }
  if (data?.detail && /[А-Яа-яЁёӨөҮүҢң]/.test(data.detail)) return data.detail;
  return `Отчетту ${action} ката кетти. Кайра аракет кылыңыз.`;
}

export default function ActivityReportsPanel({ reportDate, reportType, onReportDateChange, onToast }) {
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm(reportDate, reportType));
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");
    fetchActivityReports(reportDate)
      .then((loadedReports) => {
        if (isMounted) setReports(loadedReports);
      })
      .catch((loadError) => {
        if (isMounted) setError(getErrorMessage(loadError, "жүктөөдө"));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [reportDate]);

  useEffect(() => {
    setEditingId(null);
    setForm(createEmptyForm(reportDate, reportType));
  }, [reportDate, reportType]);

  function startNewReport() {
    setEditingId(null);
    setForm(createEmptyForm(reportDate, reportType));
    setError("");
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEventTime(time) {
    setForm((current) => ({ ...current, event_datetime: `${reportDate}T${time}` }));
  }

  function startEditing(report) {
    setEditingId(report.id);
    setForm({
      ...createEmptyForm(report.report_date, report.report_type),
      topic: report.topic,
      event_datetime: toLocalDateTime(report.event_datetime),
      summary: report.summary,
      first_place: report.first_place || "",
      second_place: report.second_place || "",
      third_place: report.third_place || "",
    });
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const eventDate = reportType === "LIVE_STREAM"
      ? new Date(`${reportDate}T${form.event_datetime.slice(11, 16)}`)
      : null;
    if (eventDate && Number.isNaN(eventDate.getTime())) {
      setError("Эфирдин күнүн жана убактысын туура көрсөтүңүз.");
      return;
    }
    setIsSaving(true);
    const payload = {
      ...form,
      report_type: reportType,
      report_date: reportDate,
      event_datetime: eventDate ? eventDate.toISOString() : null,
      topic: form.topic.trim(),
      summary: form.summary.trim(),
      first_place: reportType === "KAHOOT" ? form.first_place : "",
      second_place: reportType === "KAHOOT" ? form.second_place : "",
      third_place: reportType === "KAHOOT" ? form.third_place : "",
    };
    try {
      const savedReport = editingId
        ? await updateActivityReport(editingId, payload)
        : await createActivityReport(payload);
      setReports((current) => editingId
        ? current.map((report) => report.id === savedReport.id ? savedReport : report)
        : [...current, savedReport]);
      startNewReport(reportType);
      onToast?.({ type: "success", message: "Отчет ийгиликтүү сакталды." });
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(report) {
    if (!window.confirm("Бул отчетту өчүрүүнү каалайсызбы?")) return;
    setError("");
    try {
      await deleteActivityReport(report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
      if (editingId === report.id) startNewReport();
      onToast?.({ type: "success", message: "Отчет өчүрүлдү." });
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "өчүрүүдө"));
    }
  }

  const visibleReports = reports.filter((report) => report.report_type === reportType);
  const isLiveStream = reportType === "LIVE_STREAM";
  const reportTitle = isLiveStream ? "Түз эфир отчету" : "Каахут отчету";
  const fieldClassName = "mt-1 w-full min-w-0 rounded-xl border border-[#d6dfd8] bg-white px-3 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/15";

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[#e2e9e3] bg-white shadow-[0_14px_40px_-26px_rgba(11,25,44,0.35)]">
      <header className="relative overflow-hidden bg-[#0B192C] px-4 py-6 text-white sm:px-7 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border-[36px] border-white/5" />
        <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF6B00] shadow-lg shadow-[#FF6B00]/20 sm:h-14 sm:w-14">
              <FileText size={24} />
            </span>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#ffb27a] sm:text-xs">
                {reportDate}
              </p>
              <h2 className="font-display text-lg font-bold leading-tight sm:text-2xl">{reportTitle}</h2>
              <p className="mt-1 hidden text-sm text-slate-300 sm:block">
                {isLiveStream ? "Түз эфирдин убактысын жана кыскача мазмунун киргизиңиз." : "Каахуттун жыйынтыгын жана жеңүүчүлөрдү каттаңыз."}
              </p>
            </div>
          </div>
          <label className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:w-auto sm:justify-start">
            <span>Отчеттун күнү</span>
            <input
              aria-label="Отчеттун күнүн тандоо"
              className="min-w-0 rounded-lg border border-white/20 bg-[#0B192C] px-2 py-1.5 text-sm font-bold text-white outline-none [color-scheme:dark] focus:border-[#FF6B00]"
              onChange={(event) => onReportDateChange(event.target.value)}
              required
              type="date"
              value={reportDate}
            />
          </label>
        </div>
      </header>

      <div className="bg-[#fafcf9] p-4 sm:p-6 lg:p-7">
      <form className="grid min-w-0 gap-4 rounded-2xl border border-[#e6ece8] bg-white p-4 shadow-sm sm:grid-cols-2 sm:gap-5 sm:p-6" id="activity-report-form" onSubmit={handleSubmit}>
        <label className="min-w-0 text-sm font-bold text-ink">
          {isLiveStream ? "Эфирдин темасы" : "Темасы"}
          <input
            className={fieldClassName}
            maxLength={255}
            onChange={(event) => updateField("topic", event.target.value)}
            placeholder={isLiveStream ? "Эфирдин темасын жазыңыз" : "Каахуттун темасын жазыңыз"}
            required
            value={form.topic}
          />
        </label>

        {isLiveStream && (
          <label className="min-w-0 text-sm font-bold text-ink">
            Убактысы
            <input
              className={fieldClassName}
              onChange={(event) => updateEventTime(event.target.value)}
              required
              type="time"
              value={form.event_datetime.slice(11, 16)}
            />
          </label>
        )}

        {!isLiveStream && (
          <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["first_place", "Жеңүүчү — 1-орун"],
              ["second_place", "Жеңүүчү — 2-орун"],
              ["third_place", "Жеңүүчү — 3-орун"],
            ].map(([field, label]) => (
              <label className="min-w-0 text-sm font-bold text-ink" key={field}>
                {label}
                <input
                  className={fieldClassName}
                  maxLength={255}
                  onChange={(event) => updateField(field, event.target.value)}
                  placeholder="Окуучунун аты-жөнү"
                  value={form[field]}
                />
              </label>
            ))}
          </div>
        )}

        <label className="min-w-0 text-sm font-bold text-ink sm:col-span-2">
          {isLiveStream ? "Кыскача мазмуну" : "Жыйынтык тууралуу маалымат"}
          <textarea
            className={fieldClassName}
            onChange={(event) => updateField("summary", event.target.value)}
            placeholder="Кыскача маалыматты жазыңыз"
            required
            rows={4}
            value={form.summary}
          />
        </label>

        {error && (
          <p className="rounded-xl border border-[#f0c8c1] bg-[#fff4f1] px-4 py-3 text-sm leading-6 text-[#9f403d] sm:col-span-2" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#e55f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            disabled={isSaving}
            type="submit"
          >
            {editingId ? <Pencil size={15} /> : <Plus size={15} />}
            {isSaving ? "Сакталууда..." : editingId ? "Өзгөртүүлөрдү сактоо" : "Отчетту сактоо"}
          </button>
          {editingId && (
            <button
              className="min-h-12 rounded-xl border border-[#d6dfd8] px-5 py-3 text-sm font-bold text-ink transition hover:bg-[#f7faf7]"
              onClick={() => startNewReport()}
              type="button"
            >
              Жокко чыгаруу
            </button>
          )}
        </div>
      </form>

      <div className="mt-7 scroll-mt-6 border-t border-[#e6ece8] pt-5 sm:mt-8" id="activity-report-list">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Бул күндөгү отчеттор</h3>
            <p className="mt-1 text-xs text-muted">{reportDate} · {visibleReports.length} отчет</p>
          </div>
          {!isLoading && reports.length > 0 && (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#d6dfd8] px-3 text-xs font-extrabold text-ink transition hover:bg-white"
              onClick={startNewReport}
              type="button"
            >
              <Plus size={14} />
              Жаңы отчет
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="rounded-xl border border-[#e6ece8] bg-white px-4 py-8 text-center text-sm text-muted">Отчеттор жүктөлүүдө...</div>
        ) : !visibleReports.length ? (
          <div className="rounded-xl border border-dashed border-[#d6dfd8] bg-white px-4 py-8 text-center">
            <FileText className="mx-auto mb-2 text-[#aab8ae]" size={24} />
            <p className="text-sm font-bold text-ink">Азырынча отчет кошула элек.</p>
            <p className="mt-1 text-xs text-muted">Жаңы отчет түзүү үчүн жогорудагы форманы толтуруңуз.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleReports.map((report) => (
              <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-[#e6ece8] bg-white p-4 transition hover:border-[#cbd9cd] sm:flex-row sm:items-start sm:justify-between sm:p-5" key={report.id}>
                <div className="min-w-0">
                  <span className="inline-flex rounded-full bg-[#fff4eb] px-2.5 py-1 text-[11px] font-extrabold text-[#c85300]">
                    {report.report_type === "LIVE_STREAM" ? "Түз эфир отчету" : "Каахут отчету"}
                  </span>
                  <h4 className="mt-2 break-words font-bold text-ink">{report.topic}</h4>
                  {report.report_type === "LIVE_STREAM" && report.event_datetime && (
                    <p className="mt-1 text-xs text-muted">
                      Убактысы: {new Date(report.event_datetime).toLocaleString("ky-KG")}
                    </p>
                  )}
                  {report.report_type === "KAHOOT" && (
                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted sm:grid-cols-3">
                      {[report.first_place, report.second_place, report.third_place].map((winner, index) => (
                        <p className="min-w-0 rounded-lg bg-[#f7faf7] px-3 py-2 break-words" key={index}>
                          <span className="font-extrabold text-[#FF6B00]">{index + 1}-орун:</span> {winner || "—"}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{report.summary}</p>
                </div>
                <div className="flex shrink-0 gap-2 border-t border-[#e6ece8] pt-3 sm:border-0 sm:pt-0">
                  <button
                    aria-label="Отчетту өзгөртүү"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#d6dfd8] text-ink transition hover:bg-[#f7faf7]"
                    onClick={() => startEditing(report)}
                    type="button"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label="Отчетту өчүрүү"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#f0c8c1] text-[#b9504c] transition hover:bg-[#fff4f1]"
                    onClick={() => handleDelete(report)}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
