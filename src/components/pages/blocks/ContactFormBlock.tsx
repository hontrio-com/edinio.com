"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { submitPageForm } from "@/lib/actions/page.actions";
import type { ContactBlock } from "@/lib/pages/blocks.types";
import type { FormField, PublicForm } from "@/lib/pages/forms.types";

const inputCls = "w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 transition-colors";

/** The built-in contact form fields when the block isn't bound to a custom form. */
function builtinFields(block: ContactBlock): FormField[] {
  const fields: FormField[] = [
    { id: "name", label: "Nume", type: "text", required: true, placeholder: "Numele tau" },
    { id: "email", label: "Email", type: "email", required: true, placeholder: "adresa@email.ro" },
  ];
  if (block.showPhone !== false) fields.push({ id: "phone", label: "Telefon", type: "phone", required: false, placeholder: "Telefon (optional)" });
  if (block.showMessage !== false) fields.push({ id: "message", label: "Mesaj", type: "textarea", required: true, placeholder: "Mesajul tau" });
  return fields;
}

function FieldInput({ field, value, error, onChange }: {
  field: FormField; value: string; error?: string; onChange: (v: string) => void;
}) {
  const req = field.required ? <span className="text-red-500"> *</span> : null;
  const label = (
    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}{req}</label>
  );

  if (field.type === "checkbox") {
    return (
      <div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={value === "da"} onChange={(e) => onChange(e.target.checked ? "da" : "")}
            className="w-4 h-4 rounded accent-green-600 mt-0.5" />
          <span className="text-sm text-gray-700">{field.label}{req}</span>
        </label>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea className={`${inputCls} resize-none`} rows={4} placeholder={field.placeholder} value={value}
          onChange={(e) => onChange(e.target.value)} />
        {field.helpText && <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div>
        {label}
        <select className={`${inputCls} bg-white`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Alege...</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
  const htmlType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return (
    <div>
      {label}
      <input type={htmlType} className={inputCls} placeholder={field.placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} />
      {field.helpText && <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function ContactFormBlockView({ block, form, businessId, pageId, color, disabled }: {
  block: ContactBlock; form?: PublicForm; businessId: string; pageId?: string; color: string; disabled?: boolean;
}) {
  const fields = form ? form.fields : builtinFields(block);
  const [values, setValues] = useState<Record<string, string>>({});
  const [hp, setHp] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const successMessage = form?.success_message || block.successMessage || "Multumim! Mesajul a fost trimis.";
  const submitLabel = form?.submit_label || block.buttonLabel || "Trimite";

  function validate() {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.id] ?? "").trim();
      if (f.required) {
        if (f.type === "checkbox" && v !== "da") e[f.id] = "Bifeaza pentru a continua";
        else if (f.type !== "checkbox" && !v) e[f.id] = "Camp obligatoriu";
      }
      if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e[f.id] = "Email invalid";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (disabled) return;
    if (!validate()) return;
    const payload = fields.map((f) => ({
      label: f.label,
      value: f.type === "checkbox" ? (values[f.id] === "da" ? "Da" : "Nu") : (values[f.id] ?? "").trim(),
    }));
    startTransition(async () => {
      const res = await submitPageForm({
        businessId, formId: form?.id ?? null, pageId, blockId: block.id, fields: payload, honeypot: hp,
      });
      if ("error" in res) { setServerError(res.error); return; }
      setDone(true);
    });
  }

  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      {block.title && (
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground text-center mb-6">{block.title}</h2>
      )}
      {done ? (
        <div className="flex flex-col items-center text-center gap-3 py-10">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}18`, color }}>
            <Check className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold text-foreground">{successMessage}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5 text-left max-w-lg mx-auto">
          {/* honeypot — hidden from real users */}
          <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)}
            className="hidden" aria-hidden style={{ display: "none" }} />
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Acest formular nu are niciun camp inca.</p>
          ) : (
            fields.map((f) => (
              <FieldInput key={f.id} field={f} value={values[f.id] ?? ""} error={errors[f.id]} onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))} />
            ))
          )}
          {serverError && <p className="text-sm text-red-500 text-center">{serverError}</p>}
          <button type="submit" disabled={isPending || disabled || fields.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: color, boxShadow: `0 4px 16px ${color}44` }}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {disabled ? "Previzualizare" : submitLabel}
          </button>
        </form>
      )}
    </BlockShell>
  );
}
