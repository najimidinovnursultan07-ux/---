import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";

export default function AddStudentModal({ defaultGroupId, groups, isOpen, isSubmitting, onClose, onSubmit, student }) {
  const [form, setForm] = useState({ full_name: "", group_id: "" });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setForm({ full_name: student?.full_name || "", group_id: student?.group_id ? String(student.group_id) : defaultGroupId || "" });
    setFormError("");
  }, [defaultGroupId, student, isOpen]);

  if (!isOpen) return null;

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.full_name.trim()) {
      setFormError("Аты-жөнү милдеттүү.");
      return;
    }
    setFormError("");
    try {
      await onSubmit({ ...form, full_name: form.full_name.trim(), group_id: Number(form.group_id) });
      setForm({ full_name: "", group_id: "" });
    } catch (error) {
      setFormError(error.message || "Окуучуну кошуу мүмкүн болгон жок.");
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm" role="presentation">
      <div aria-labelledby="add-student-title" aria-modal="true" className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-coral-dark">{student ? "Маалыматты өзгөртүү" : "Жаңы жазуу"}</p>
            <h2 className="font-display text-lg text-ink" id="add-student-title">{student ? "Окуучуну өзгөртүү" : "Жаңы окуучу кошуу"}</h2>
          </div>
          <button aria-label="Жабуу" className="rounded p-1 text-muted hover:bg-canvas hover:text-ink" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold text-ink">
            Аты-жөнү
            <input autoFocus className="mt-2 h-11 w-full rounded-md border border-[#d6dfd8] px-3 text-sm font-normal outline-none focus:border-forest focus:ring-2 focus:ring-[#dceee1]" name="full_name" onChange={updateField} placeholder="Мисалы: Айтматова Айдана" value={form.full_name} />
          </label>
          <label className="block text-sm font-bold text-ink">
            Тайпасы
            <select className="mt-2 h-11 w-full rounded-md border border-[#d6dfd8] bg-white px-3 text-sm font-normal outline-none focus:border-forest focus:ring-2 focus:ring-[#dceee1]" name="group_id" onChange={updateField} required value={form.group_id}>
              <option value="">Тайпаны тандаңыз</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          {formError && <p className="rounded bg-[#fff4f1] px-3 py-2 text-xs font-semibold text-[#b9504c]">{formError}</p>}
          <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-coral text-sm font-extrabold text-white transition hover:bg-coral-dark disabled:opacity-60" disabled={isSubmitting} type="submit">
            <UserPlus size={17} />
            {isSubmitting ? "Сакталууда..." : student ? "Өзгөртүүнү сактоо" : "Окуучуну кошуу"}
          </button>
        </form>
      </div>
    </div>
  );
}
