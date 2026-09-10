import { useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { login, register } from "../api/authApi";

export default function AuthPanel({ onAuthenticated }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const result = isRegistering
        ? await register(form.fullName, form.email, form.password)
        : await login(form.email, form.password);
      window.localStorage.setItem("attendance-token", result.token);
      onAuthenticated(result.user);
    } catch (requestError) {
      const detail = requestError.response?.data;
      if (isRegistering && detail && typeof detail === "object") {
        setFieldErrors({
          fullName: detail.full_name?.[0] || "",
          email: detail.email?.[0] || "",
          password: detail.password?.[0] || "",
        });
      }
      setError(detail?.detail || detail?.non_field_errors?.[0] || (!isRegistering ? "Email же сырсөз туура эмес." : "Маалыматтарды текшериңиз."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setIsRegistering((value) => !value);
    setError("");
    setFieldErrors({});
  }

  const inputClass = (field) => `h-11 w-full rounded-md border px-3 text-sm outline-none focus:border-forest ${fieldErrors[field] ? "border-[#d77c71] bg-[#fff9f7]" : "border-[#d6dfd8]"}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-xl" onSubmit={handleSubmit}>
        <img alt="Окурмэн" className="mb-7 h-16 w-16 rounded-full object-contain" src="/logo.jpg" />
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted">Катышуу платформасы</p>
        <h1 className="mb-6 font-display text-2xl font-bold text-ink">{isRegistering ? "Аккаунт түзүү" : "Кош келиңиз"}</h1>
        {isRegistering && <div className="mb-3"><input aria-describedby={fieldErrors.fullName ? "full-name-error" : undefined} aria-invalid={Boolean(fieldErrors.fullName)} className={inputClass("fullName")} name="fullName" onChange={updateField} placeholder="Толук аты-жөнү" required value={form.fullName} />{fieldErrors.fullName && <p className="mt-1 text-xs font-semibold text-[#b9504c]" id="full-name-error">{fieldErrors.fullName}</p>}</div>}
        <div className="mb-3"><input aria-describedby={fieldErrors.email ? "email-error" : undefined} aria-invalid={Boolean(fieldErrors.email)} className={inputClass("email")} name="email" onChange={updateField} placeholder="Email" required type="email" value={form.email} />{fieldErrors.email && <p className="mt-1 text-xs font-semibold text-[#b9504c]" id="email-error">{fieldErrors.email}</p>}</div>
        <div className="mb-4">
          <div className="relative">
            <input aria-describedby={fieldErrors.password ? "password-error" : undefined} aria-invalid={Boolean(fieldErrors.password)} className={`${inputClass("password")} pr-11`} name="password" onChange={updateField} placeholder="Сырсөз" required type={isPasswordVisible ? "text" : "password"} value={form.password} />
            <button aria-label={isPasswordVisible ? "Сырсөздү жашыруу" : "Сырсөздү көрсөтүү"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:bg-canvas hover:text-ink" onClick={() => setIsPasswordVisible((visible) => !visible)} type="button">
              {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1 text-xs font-semibold text-[#b9504c]" id="password-error">{fieldErrors.password}</p>}
        </div>
        {error && <p className="mb-4 rounded-md bg-[#fff4f1] px-3 py-2 text-sm text-[#b9504c]">{error}</p>}
        <button className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-600 disabled:opacity-60" disabled={isSubmitting} type="submit">
          {isRegistering ? <UserPlus size={17} /> : <LogIn size={17} />}{isSubmitting ? "Күтүңүз..." : isRegistering ? "Катталуу" : "Кирүү"}
        </button>
        <button className="mt-4 w-full text-sm font-bold text-orange-600" onClick={toggleMode} type="button">
          {isRegistering ? "Аккаунтуңуз барбы? Кирүү" : "Жаңы аккаунт түзүү"}
        </button>
      </form>
    </main>
  );
}
