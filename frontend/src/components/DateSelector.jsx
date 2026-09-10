import { CalendarDays, Save, LoaderCircle } from "lucide-react";

export default function DateSelector({ selectedDate, onDateChange, onToday, onSave, isSaving, canEdit = true }) {
  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-lg border border-[#e6ece8] bg-white/90 p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex w-full flex-col gap-2 sm:w-auto" htmlFor="attendance-date">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Күн</span>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
            <input
              className="h-11 w-full rounded-md border border-[#d6dfd8] bg-[#fbfdfb] pl-10 pr-3 text-sm text-ink outline-none transition focus:border-forest focus:ring-2 focus:ring-[#dceee1] sm:w-auto"
              id="attendance-date"
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => onDateChange(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </span>
        </label>
        <button
          className="h-11 w-full rounded-md border border-[#d6dfd8] px-4 text-sm font-bold text-ink transition hover:border-forest hover:bg-[#f1f9f2] sm:w-auto"
          onClick={onToday}
          type="button"
        >
          Бүгүн
        </button>
      </div>
      {canEdit && <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-coral px-5 text-sm font-extrabold text-white shadow-[0_7px_16px_rgba(232,111,81,0.24)] transition hover:bg-coral-dark disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        disabled={isSaving}
        onClick={onSave}
        type="button"
      >
        {isSaving ? <LoaderCircle className="animate-spin" size={18} /> : <Save size={18} />}
        {isSaving ? "Сакталууда..." : "Сактоо"}
      </button>}
    </section>
  );
}
