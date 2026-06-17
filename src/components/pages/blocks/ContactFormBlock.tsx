"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { submitPageForm } from "@/lib/actions/page.actions";
import type { ContactBlock } from "@/lib/pages/blocks.types";

const inputCls = "w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 transition-colors";

export function ContactFormBlockView({ block, businessId, pageId, color, disabled }: {
  block: ContactBlock; businessId: string; pageId?: string; color: string; disabled?: boolean;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [hp, setHp] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showPhone = block.showPhone !== false;
  const showMessage = block.showMessage !== false;

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = "Introdu numele";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Email invalid";
    if (showMessage && form.message.trim().length < 3) e.message = "Scrie un mesaj";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (disabled) return;
    if (!validate()) return;
    const fields = [
      { label: "Nume", value: form.name.trim() },
      { label: "Email", value: form.email.trim() },
      ...(showPhone && form.phone.trim() ? [{ label: "Telefon", value: form.phone.trim() }] : []),
      ...(showMessage ? [{ label: "Mesaj", value: form.message.trim() }] : []),
    ];
    startTransition(async () => {
      const res = await submitPageForm({ businessId, pageId, blockId: undefined, fields, honeypot: hp });
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
          <p className="text-base font-semibold text-foreground">{block.successMessage || "Mesajul tau a fost trimis."}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5 text-left max-w-lg mx-auto">
          {/* honeypot — hidden from real users */}
          <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)}
            className="hidden" aria-hidden style={{ display: "none" }} />
          <div>
            <input className={inputCls} placeholder="Numele tau *" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <input className={inputCls} placeholder="Email *" type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
          {showPhone && (
            <input className={inputCls} placeholder="Telefon (optional)" type="tel" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          )}
          {showMessage && (
            <div>
              <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Mesajul tau *" value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
              {errors.message && <p className="text-xs text-red-500 mt-1">{errors.message}</p>}
            </div>
          )}
          {serverError && <p className="text-sm text-red-500 text-center">{serverError}</p>}
          <button type="submit" disabled={isPending || disabled}
            className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: color, boxShadow: `0 4px 16px ${color}44` }}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {disabled ? "Previzualizare" : (block.buttonLabel || "Trimite mesajul")}
          </button>
        </form>
      )}
    </BlockShell>
  );
}
