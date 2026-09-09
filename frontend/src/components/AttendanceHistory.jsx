import { useEffect, useState } from "react";
import { Archive, Download, RefreshCw } from "lucide-react";
import { fetchAttendanceHistory } from "../api/attendanceApi";

function downloadHistory(history) {
  const header = ["Окуучу", ...history.dates, "Катышуу %"];
  const rows = history.students.map((student) => [
    student.full_name,
    ...student.days.map((present) => (present ? "Келди" : "Келген жок")),
    student.attendance_rate,
  ]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `attendance-history-${history.start_date}-${history.end_date}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function AttendanceHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [months, setMonths] = useState(3);

  useEffect(() => {
    setHistory(null);
    fetchAttendanceHistory(months).then(setHistory).catch((requestError) => setError(requestError.response?.data?.detail || "Архивди жүктөө мүмкүн болгон жок."));
  }, [months]);

  if (error) return <div className="rounded-lg border border-[#f0c8c1] bg-[#fff4f1] p-5 text-sm text-[#b9504c]">{error}</div>;
  if (!history) return <div className="flex justify-center rounded-lg border border-[#e6ece8] bg-white p-12"><RefreshCw className="animate-spin text-forest" size={24} /></div>;

  return (
    <section className="rounded-lg border border-[#e6ece8] bg-white shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ece8] px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3"><Archive className="text-forest" size={20} /><div><h2 className="font-display text-base text-ink sm:text-lg">3 айлык журнал</h2><p className="mt-1 text-xs text-muted">{history.start_date} - {history.end_date} · {history.months} ай, 90 күн</p></div></div>
        <div className="flex items-center gap-2">
          <select className="h-10 rounded-md border border-[#d6dfd8] bg-white px-3 text-xs font-bold text-ink" onChange={(event) => setMonths(Number(event.target.value))} value={months}>
            <option value="1">Акыркы 1 ай</option>
            <option value="2">2-ай</option>
            <option value="3">3-ай</option>
          </select>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-[#d6dfd8] bg-white px-4 text-xs font-extrabold text-ink hover:border-forest hover:bg-[#f1f9f2]" onClick={() => downloadHistory(history)} type="button"><Download size={16} />Экспорт</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1450px] w-full border-collapse text-xs">
          <thead><tr className="bg-[#fafcf9] text-left font-extrabold text-muted"><th className="sticky left-0 z-10 min-w-[210px] bg-[#fafcf9] px-4 py-3">Окуучунун аты-жөнү</th>{history.dates.map((date, index) => <th className="min-w-[42px] px-1 py-3 text-center" key={date}>{index + 1}</th>)}<th className="sticky right-0 min-w-[90px] bg-[#fafcf9] px-3 py-3 text-center">Жалпы %</th></tr></thead>
          <tbody>{history.students.map((student) => <tr className="border-t border-[#e6ece8]" key={student.student_id}><td className="sticky left-0 bg-white px-4 py-3 font-semibold text-ink">{student.full_name}</td>{student.days.map((present, index) => <td className={`px-1 py-3 text-center font-bold ${present ? "text-forest" : "text-[#c5cfca]"}`} key={`${student.student_id}-${index}`}>{present ? "+" : "-"}</td>)}<td className="sticky right-0 bg-white px-3 py-3 text-center font-extrabold text-forest">{student.attendance_rate}%</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
