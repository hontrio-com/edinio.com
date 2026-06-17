"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { updateForm } from "@/lib/actions/form.actions";
import { createFormField, FORM_FIELD_TYPES, type FormField, type FormFieldType } from "@/lib/pages/forms.types";

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function FormBuilderClient({
  formId, initialName, initialFields, initialSubmitLabel, initialSuccessMessage, initialEmailEnabled, initialEmailTo,
}: {
  formId: string; initialName: string; initialFields: FormField[];
  initialSubmitLabel: string; initialSuccessMessage: string; initialEmailEnabled: boolean; initialEmailTo: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [submitLabel, setSubmitLabel] = useState(initialSubmitLabel);
  const [successMessage, setSuccessMessage] = useState(initialSuccessMessage);
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [emailTo, setEmailTo] = useState(initialEmailTo);
  const [dirty, setDirty] = useState(false);
  const [isSaving, startSave] = useTransition();

  const mark = () => setDirty(true);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function patchField(id: string, patch: Partial<FormField>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    mark();
  }
  function addField() {
    setFields((fs) => [...fs, createFormField("text")]);
    mark();
  }
  function removeField(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id));
    mark();
  }
  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    setFields((fs) => { const n = [...fs]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    mark();
  }
  function changeType(id: string, type: FormFieldType) {
    setFields((fs) => fs.map((f) => {
      if (f.id !== id) return f;
      const next: FormField = { ...f, type };
      if (type === "select" && (!f.options || f.options.length === 0)) next.options = ["Optiunea 1", "Optiunea 2"];
      return next;
    }));
    mark();
  }

  function save() {
    if (name.trim().length < 2) { toast.error("Numele formularului e prea scurt."); return; }
    if (fields.some((f) => !f.label.trim())) { toast.error("Toate campurile trebuie sa aiba o eticheta."); return; }
    startSave(async () => {
      const res = await updateForm(formId, {
        name, fields, submit_label: submitLabel, success_message: successMessage,
        email_enabled: emailEnabled, email_to: emailTo,
      });
      if ("error" in res) { toast.error(res.error); return; }
      setDirty(false);
      toast.success("Formular salvat.");
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/pages/forms" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input value={name} onChange={(e) => { setName(e.target.value); mark(); }}
          className="flex-1 min-w-0 text-lg font-bold text-foreground bg-transparent focus:outline-none focus:bg-muted rounded px-2 py-1" />
        <button type="button" onClick={save} disabled={isSaving || !dirty}
          className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? "Salveaza" : "Salvat"}
        </button>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campuri</p>
        {fields.map((f, i) => (
          <div key={f.id} className="bg-surface border border-border rounded-xl p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-2.5 shrink-0 hidden sm:block" />
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="flex gap-2">
                  <input value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value })} placeholder="Eticheta campului" className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
                  <select value={f.type} onChange={(e) => changeType(f.id, e.target.value as FormFieldType)} className="w-32 sm:w-36 shrink-0 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" aria-label="Tip camp">
                    {FORM_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {f.type !== "checkbox" && (
                  <input value={f.placeholder ?? ""} onChange={(e) => patchField(f.id, { placeholder: e.target.value })} placeholder="Text exemplu (placeholder)" className={inputCls} />
                )}
                {f.type === "select" && (
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Optiuni (una pe linie)</label>
                    <textarea value={(f.options ?? []).join("\n")} onChange={(e) => patchField(f.id, { options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
                      rows={3} className={`${inputCls} resize-none`} placeholder={"Optiunea 1\nOptiunea 2"} />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={f.required} onChange={(e) => patchField(f.id, { required: e.target.checked })} className="w-4 h-4 rounded accent-green-600" />
                    Obligatoriu
                  </label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0} className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => removeField(f.id)} className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">Niciun camp. Adauga primul camp.</p>
        )}
        <button type="button" onClick={addField} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
          <Plus className="h-4 w-4" /> Adauga camp
        </button>
      </div>

      {/* Settings */}
      <div className="mt-8 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setari</p>
        <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Text buton trimitere</label>
            <input value={submitLabel} onChange={(e) => { setSubmitLabel(e.target.value); mark(); }} placeholder="Trimite" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Mesaj dupa trimitere (raspunsul formularului)</label>
            <textarea value={successMessage} onChange={(e) => { setSuccessMessage(e.target.value); mark(); }} rows={2} placeholder="Multumim! Mesajul a fost trimis." className={`${inputCls} resize-none`} />
          </div>
          <div className="pt-3 border-t border-border">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={emailEnabled} onChange={(e) => { setEmailEnabled(e.target.checked); mark(); }} className="w-4 h-4 rounded accent-green-600" />
              Trimite-mi completarile si pe email
            </label>
            {emailEnabled && (
              <div className="mt-2.5">
                <input value={emailTo} onChange={(e) => { setEmailTo(e.target.value); mark(); }} type="email"
                  placeholder="Adresa de email (gol = emailul magazinului)" className={inputCls} />
                <p className="text-[11px] text-muted-foreground mt-1">Completarile apar oricum in sectiunea „Mesaje”.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
