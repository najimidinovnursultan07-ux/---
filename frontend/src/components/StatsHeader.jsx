import { CalendarDays, ClipboardCheck, Users } from "lucide-react";

export default function StatsHeader({ selectedDate, presentCount, totalCount }) {
  return (
    <header className="mb-8 flex items-start justify-between gap-5">
      <div>
        <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-coral-dark">
          КҮНҮМДҮК БАШКАРУУ
        </p>
        <h1 className="font-display text-3xl leading-tight tracking-normal text-ink sm:text-5xl">
          Окуучулардын катышуу журналы
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Күнүмдүк катышууну белгилеп, журналды бир жерден башкарыңыз.
        </p>
      </div>
      <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#c6ddc8] bg-[#dceee1] text-forest sm:flex">
        <ClipboardCheck size={22} strokeWidth={1.8} />
      </div>
      <div className="sr-only" aria-live="polite">
        {selectedDate}: {presentCount} / {totalCount} окуучу келди
      </div>
    </header>
  );
}

export function StatsSummary({ presentCount, totalCount }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#d6e6d9] bg-[#f1f9f2] px-4 py-3">
      <Users className="text-forest" size={20} />
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
          Келгендер
        </p>
        <p className="text-2xl font-extrabold leading-none text-forest">
          {presentCount} <span className="text-sm font-semibold text-muted">/ {totalCount}</span>
        </p>
      </div>
    </div>
  );
}

export function DateSummary({ selectedDate }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-muted">
      <CalendarDays size={17} />
      <span>{selectedDate}</span>
    </div>
  );
}
