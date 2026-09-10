import { LogOut } from "lucide-react";

const roles = {
  ADMIN: { label: "Главный (Admin)", note: "Толук башкаруу", color: "border-[#f1c8bc] bg-[#fff4f1] text-coral-dark" },
  MENTOR: { label: "Ментор", note: "Катышууну белгилөө", color: "border-[#c7e3ce] bg-[#f1f9f2] text-forest" },
  CURATOR: { label: "Куратор", note: "Көзөмөл жана отчет", color: "border-[#cbdbea] bg-[#f1f6fb] text-[#3d6384]" },
  USER: { label: "Колдонуучу", note: "Уруксат күтүлүүдө", color: "border-[#eadcc3] bg-[#fffaf0] text-[#765f38]" },
};

export default function RoleHeader({ activeRole, user, onLogout }) {
  const role = roles[activeRole];
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e6ece8] bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <img alt="Окурмэн" className="h-10 w-10 rounded-full object-contain" src="/logo.jpg" />
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">Активдүү роль</p>
          <p className="text-sm font-extrabold text-ink">{role.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`rounded-md border px-3 py-2 text-xs font-bold ${role.color}`}>
          {role.note}
        </div>
        <div className="hidden text-right sm:block"><p className="text-xs font-bold text-ink">{user?.full_name || user?.email}</p><p className="text-[11px] text-muted">{user?.email}</p></div>
        <button aria-label="Чыгуу" className="rounded-md border border-slate-200 p-2 text-slate-900 hover:bg-orange-50" onClick={onLogout} title="Чыгуу" type="button"><LogOut size={16} /></button>
      </div>
    </div>
  );
}
