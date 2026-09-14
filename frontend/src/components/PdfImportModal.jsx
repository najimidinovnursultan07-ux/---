/**
 * PdfImportModal — Upload a PDF file to bulk-import students.
 *
 * Props:
 *   groups    : [{id, name}]          available groups to assign students to
 *   onClose   : () => void
 *   onImported: (createdStudents[]) => void  called after successful import
 */

import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { importStudentsFromPdf } from "../api/attendanceApi";

export default function PdfImportModal({ groups, onClose, onImported }) {
  const [file, setFile]         = useState(null);
  const [groupId, setGroupId]   = useState(groups[0]?.id?.toString() ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult]     = useState(null);   // import result
  const [error, setError]       = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef                = useRef(null);

  function pickFile(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Файл .pdf форматында болушу керек.");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function handleImport() {
    if (!file) { setError("PDF файлды тандаңыз."); return; }
    setIsLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await importStudentsFromPdf(file, groupId || undefined);
      setResult(data);
      if (data.total_created > 0) {
        onImported(data.created);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Импорт учурунда ката кетти.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6B00]/10">
              <FileText className="text-[#FF6B00]" size={18} />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF6B00]">
                ИМПОРТ
              </p>
              <h2 className="font-bold text-[#0B192C]">Студенттерди PDF-ден жүктөө</h2>
            </div>
          </div>
          <button
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Group selector */}
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              Тайпа (группа) тандаңыз
            </span>
            <select
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-[#0B192C] focus:border-[#FF6B00] focus:outline-none"
              onChange={(e) => setGroupId(e.target.value)}
              value={groupId}
            >
              <option value="">— Тайпасыз (кийин кошсо болот) —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          {/* Drop zone */}
          <div
            className={[
              "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition cursor-pointer",
              dragOver
                ? "border-[#FF6B00] bg-[#fff4eb]"
                : file
                ? "border-green-400 bg-green-50"
                : "border-slate-300 bg-slate-50 hover:border-[#FF6B00] hover:bg-[#fff8f4]",
            ].join(" ")}
            onClick={() => inputRef.current?.click()}
            onDragLeave={() => setDragOver(false)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDrop={handleDrop}
          >
            <input
              accept=".pdf"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
              ref={inputRef}
              type="file"
            />
            {file ? (
              <>
                <CheckCircle2 className="text-green-500" size={32} />
                <p className="text-sm font-bold text-green-700">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB · башка файл тандоо үчүн басыңыз
                </p>
              </>
            ) : (
              <>
                <Upload className="text-slate-400" size={32} />
                <p className="text-sm font-bold text-slate-600">
                  PDF файлды жерге таштаңыз же тандаңыз
                </p>
                <p className="text-xs text-slate-400">
                  Студенттердин тизмеси бар PDF файл (таблица же тизме форматы)
                </p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <XCircle className="mt-0.5 shrink-0" size={15} />
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Импорт жыйынтыгы
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  Табылды: {result.total_parsed}
                </span>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                  Кошулду: {result.total_created}
                </span>
                {result.total_skipped > 0 && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    Өткөрүлдү (дубликат): {result.total_skipped}
                  </span>
                )}
              </div>

              {result.total_created > 0 && (
                <div className="mt-3 max-h-36 overflow-y-auto">
                  <p className="mb-1 text-[11px] font-bold text-slate-400">Кошулган студенттер:</p>
                  {result.created.map((s) => (
                    <p className="text-xs text-slate-700" key={s.id}>
                      ✓ {s.full_name}
                    </p>
                  ))}
                </div>
              )}

              {result.total_created === 0 && result.total_skipped > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Бардык студенттер мурун базада катталган.
                </p>
              )}

              {result.total_parsed === 0 && (
                <p className="mt-2 text-xs text-red-600">
                  PDF-де студент аттары табылган жок. Файл таблица же тизме форматында болушу керек.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <p className="text-[11px] text-slate-400">
            PDF-де ФИО тизмеси же таблица болушу керек
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              {result ? "Жабуу" : "Жокко чыгаруу"}
            </button>
            {!result && (
              <button
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                disabled={!file || isLoading}
                onClick={handleImport}
                style={{ background: "#FF6B00" }}
                type="button"
              >
                {isLoading
                  ? <><LoaderCircle className="animate-spin" size={15} />Жүктөлүүдө...</>
                  : <><Upload size={15} />Импорттоо</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
