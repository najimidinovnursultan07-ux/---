import { Check, CircleX, Pencil, Trash2 } from "lucide-react";

export default function AttendanceTable({ students, attendanceMap, onDelete, onEdit, onToggle, selectedDate, canEdit, canManageStudents }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e6ece8] bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-[#e6ece8] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <h2 className="font-display text-base text-ink sm:text-lg">Окуучулар</h2>
          <p className="mt-1 text-xs text-muted">{canEdit ? "Ар бир окуучунун статусун белгилеңиз" : "Бул күн архивделген жана өзгөртүүгө жабык"}</p>
        </div>
        <span className="text-xs font-bold text-muted">{selectedDate}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse">
          <thead>
            <tr className="bg-[#fafcf9] text-left text-[11px] font-extrabold uppercase tracking-wider text-muted">
              <th className="w-[72px] px-4 py-4 text-center">№</th>
              <th className="px-4 py-4">Окуучунун аты-жөнү</th>
              <th className="w-[140px] px-4 py-4 text-center">Катышты</th>
              <th className="w-[180px] px-4 py-4">Статус</th>
              {canManageStudents && <th className="w-[110px] px-4 py-4 text-center">Аракет</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => {
              const isPresent = Boolean(attendanceMap[student.id]);
              return (
                <tr className="border-t border-[#e6ece8] transition hover:bg-[#fcfdfb]" key={student.id}>
                  <td className="px-4 py-4 text-center text-xs text-muted">{index + 1}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-ink">{student.full_name}</td>
                  <td className="px-4 py-4 text-center">
                    <input
                      aria-label={`${student.full_name} катышты`}
                      checked={isPresent}
                      disabled={!canEdit}
                      className="h-5 w-5 cursor-pointer accent-forest disabled:cursor-not-allowed disabled:opacity-50"
                      onChange={() => onToggle(student.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex min-w-[102px] items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-extrabold ${isPresent ? "bg-forest-soft text-forest" : "bg-[#f8e8e5] text-[#b9504c]"}`}>
                      {isPresent ? <Check size={14} /> : <CircleX size={14} />}
                      {isPresent ? "Келди" : "Келген жок"}
                    </span>
                  </td>
                  {canManageStudents && (
                    <td className="px-4 py-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button aria-label={`${student.full_name} өзгөртүү`} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-forest transition hover:bg-[#f1f9f2]" onClick={() => onEdit(student)} title="Өзгөртүү" type="button"><Pencil size={16} /></button>
                        <button aria-label={`${student.full_name} өчүрүү`} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#b9504c] transition hover:bg-[#fff0ed]" onClick={() => onDelete(student)} title="Өчүрүү" type="button"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {!students.length && (
              <tr>
                <td className="px-5 py-12 text-center text-sm text-muted" colSpan={canManageStudents ? 5 : 4}>Окуучулар табылган жок.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
