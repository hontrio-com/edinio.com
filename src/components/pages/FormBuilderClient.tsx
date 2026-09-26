"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { updateForm } from "@/lib/actions/form.actions";
import { CU_OPTIUNI, createFormField, FORM_FIELD_TYPES, MAX_CAMPURI, MAX_OPTIUNI, type FormField, type FormFieldType } from "@/lib/pages/forms.types";

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function FormBuilderClient({
  formId, initialName, initialFields, initialSubmitLabel, initialSuccessMessage, initialEmailEnabled, initialEmailTo, initialMailchimpEnabled, initialBrevoEnabled, initialKlaviyoEnabled,
  statistica, initialVersiune,
}: {
  /** `updated_at` la incarcare: salvarea trece numai daca formularul n-a fost salvat intre timp din alt tab. */
  initialVersiune: string;
  /** Statisticile formularului, randate pe server (vezi `PanouStatistica`). */
  statistica?: React.ReactNode;
  formId: string; initialName: string; initialFields: FormField[];
  initialSubmitLabel: string; initialSuccessMessage: string; initialEmailEnabled: boolean; initialEmailTo: string; initialMailchimpEnabled: boolean; initialBrevoEnabled: boolean; initialKlaviyoEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [submitLabel, setSubmitLabel] = useState(initialSubmitLabel);
  const [successMessage, setSuccessMessage] = useState(initialSuccessMessage);
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [emailTo, setEmailTo] = useState(initialEmailTo);
  const [mailchimpEnabled, setMailchimpEnabled] = useState(initialMailchimpEnabled);
  const [brevoEnabled, setBrevoEnabled] = useState(initialBrevoEnabled);
  const [klaviyoEnabled, setKlaviyoEnabled] = useState(initialKlaviyoEnabled);
  const [dirty, setDirty] = useState(false);
  const [isSaving, startSave] = useTransition();
  const versiune = useRef(initialVersiune);
  /* Textul optiunilor, asa cum il scrie omul (26.09.2026): parsat la fiecare tasta,
     spatiul de la capat si randul nou erau mancate pe loc, deci „Foarte bine” sau o
     optiune noua la sfarsit nu se puteau scrie decat lipite. */
  const [ciorneOptiuni, setCiorneOptiuni] = useState<Record<string, string>>({});

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
    // ⚠ Limita si aici, pe loc, nu doar pe server: altfel omul afla abia la salvare.
    if (fields.length >= MAX_CAMPURI) { toast.error(`Un formular poate avea cel mult ${MAX_CAMPURI} de câmpuri.`); return; }
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
      if (CU_OPTIUNI.includes(type) && (!f.options || f.options.length === 0)) next.options = ["Opțiunea 1", "Opțiunea 2"];
      return next;
    }));
    mark();
  }

  function save() {
    if (name.trim().length < 2) { toast.error("Numele formularului e prea scurt."); return; }
    if (fields.some((f) => !f.label.trim())) { toast.error("Toate câmpurile trebuie să aibă o etichetă."); return; }
    const farOptiuni = fields.find((f) => f.required && CU_OPTIUNI.includes(f.type) && (f.options ?? []).length === 0);
    if (farOptiuni) { toast.error(`Câmpul „${farOptiuni.label}” e obligatoriu, dar nu are nicio opțiune.`); return; }
    startSave(async () => {
      let res: Awaited<ReturnType<typeof updateForm>>;
      try {
        res = await updateForm(formId, {
          name, fields, submit_label: submitLabel, success_message: successMessage,
          email_enabled: emailEnabled, email_to: emailTo, mailchimp_enabled: mailchimpEnabled, brevo_enabled: brevoEnabled, klaviyo_enabled: klaviyoEnabled,
          versiune: versiune.current,
        });
      } catch {
        /* ⚠ MESAJUL NU CERE REINCARCAREA PAGINII, si nu din scapare: omul are aici modificari
           nesalvate, iar o reincarcare i le-ar sterge pe toate. `setDirty(false)` a ramas DUPA
           `try`, deci formularul ramane marcat ca nesalvat, iar salvarea trimite tot continutul,
           deci o a doua apasare nu strica nimic. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă formularul s-a salvat. A rămas marcat ca nesalvat: apasă din nou "
          + "pe salvare și nu închide pagina până nu reușește.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error, res.conflict ? { duration: 12000 } : undefined); return; }
      versiune.current = res.versiune;
      setDirty(false);
      toast.success("Formular salvat.");
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {/* `beforeunload` nu prinde navigarea din aplicatie: sageata intreaba ea, cand sunt modificari nesalvate. */}
        <Link href="/dashboard/pages/forms" aria-label="Înapoi la formulare"
          onClick={(e) => { if (dirty && !window.confirm("Ai modificări nesalvate. Pleci fără să le salvezi?")) e.preventDefault(); }}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input value={name} onChange={(e) => { setName(e.target.value); mark(); }}
          className="flex-1 min-w-0 text-lg font-bold text-foreground bg-transparent focus:outline-none focus:bg-muted rounded px-2 py-1" />
        <button type="button" onClick={save} disabled={isSaving || !dirty}
          className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? "Salvează" : "Salvat"}
        </button>
      </div>

      {statistica}

      {/* Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Câmpuri</p>
          <span className={`text-[11px] tabular-nums ${fields.length >= MAX_CAMPURI ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{fields.length} / {MAX_CAMPURI}</span>
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="bg-surface border border-border rounded-xl p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-2.5 shrink-0 hidden sm:block" />
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="flex gap-2">
                  <input value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value })} placeholder="Eticheta câmpului" className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
                  <select value={f.type} onChange={(e) => changeType(f.id, e.target.value as FormFieldType)} className="w-32 sm:w-36 shrink-0 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" aria-label="Tipul câmpului">
                    {FORM_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {/* Numai unde pagina il foloseste: la alegeri, bife si date nu apare nicaieri. */}
                {["text", "textarea", "email", "phone", "number"].includes(f.type) && (
                  <input value={f.placeholder ?? ""} onChange={(e) => patchField(f.id, { placeholder: e.target.value })} placeholder="Text exemplu (placeholder)" className={inputCls} />
                )}
                {CU_OPTIUNI.includes(f.type) && (
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Opțiuni (una pe linie, cel mult {MAX_OPTIUNI})</label>
                    <textarea value={ciorneOptiuni[f.id] ?? (f.options ?? []).join("\n")}
                      onChange={(e) => {
                        const text = e.target.value;
                        setCiorneOptiuni((c) => ({ ...c, [f.id]: text }));
                        patchField(f.id, { options: text.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, MAX_OPTIUNI) });
                      }}
                      rows={3} className={`${inputCls} resize-none`} placeholder={"Opțiunea 1\nOpțiunea 2"} />
                  </div>
                )}
                {/* Nota campului (26.09.2026): apare sub camp, pe pagina. */}
                <input value={f.helpText ?? ""} maxLength={200} onChange={(e) => patchField(f.id, { helpText: e.target.value || undefined })}
                  placeholder="Notă sau sfat sub câmp (opțional). Ex: Îl găsești în emailul de confirmare." className={`${inputCls} text-xs`} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={f.required} onChange={(e) => patchField(f.id, { required: e.target.checked })} className="w-4 h-4 rounded accent-green-600" />
                    Obligatoriu
                  </label>
                  {/* Latimea conteaza cand blocul de pe pagina are „doua coloane”. */}
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none" title="Pe ecrane late, doua campuri de jumatate stau alaturi (cand blocul are doua coloane).">
                    <input type="checkbox" checked={f.width === "half"} onChange={(e) => patchField(f.id, { width: e.target.checked ? "half" : undefined })} className="w-4 h-4 rounded accent-green-600" />
                    Jumătate de rând
                  </label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label="Mută câmpul mai sus" title="Mută mai sus" className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} aria-label="Mută câmpul mai jos" title="Mută mai jos" className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => removeField(f.id)} aria-label="Șterge câmpul" title="Șterge" className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">Niciun câmp. Adaugă primul câmp.</p>
        )}
        <button type="button" onClick={addField} disabled={fields.length >= MAX_CAMPURI} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-40">
          <Plus className="h-4 w-4" /> Adaugă câmp
        </button>
        {fields.length >= MAX_CAMPURI && <p className="text-[11px] text-muted-foreground">Ai ajuns la limita de {MAX_CAMPURI} de câmpuri. Un formular lung e completat de mai puțini oameni.</p>}
      </div>

      {/* Settings */}
      <div className="mt-8 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setări</p>
        <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Textul butonului de trimitere</label>
            <input value={submitLabel} onChange={(e) => { setSubmitLabel(e.target.value); mark(); }} placeholder="Trimite" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Mesajul de după trimitere</label>
            <textarea value={successMessage} onChange={(e) => { setSuccessMessage(e.target.value); mark(); }} rows={2} placeholder="Mulțumim! Mesajul a fost trimis." className={`${inputCls} resize-none`} />
          </div>
          <div className="pt-3 border-t border-border">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={mailchimpEnabled} onChange={(e) => { setMailchimpEnabled(e.target.checked); mark(); }} className="w-4 h-4 rounded accent-green-600" />
              Adaugă abonații în Mailchimp
            </label>
            <p className="text-[11px] text-muted-foreground mt-1">Cine completează formularul (cu email) intră în audiența ta Mailchimp. Folosește-l pentru formulare de abonare, cu acordul lor.</p>
          </div>
          <div className="pt-3 border-t border-border">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={brevoEnabled} onChange={(e) => { setBrevoEnabled(e.target.checked); mark(); }} className="w-4 h-4 rounded accent-green-600" />
              Adaugă contactele în Brevo
            </label>
            <p className="text-[11px] text-muted-foreground mt-1">Cine completează formularul (cu email) intră în lista ta Brevo. Folosește-l pentru formulare de abonare, cu acordul lor.</p>
          </div>
          <div className="pt-3 border-t border-border">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={klaviyoEnabled} onChange={(e) => { setKlaviyoEnabled(e.target.checked); mark(); }} className="w-4 h-4 rounded accent-green-600" />
              Adaugă contactele în Klaviyo
            </label>
            <p className="text-[11px] text-muted-foreground mt-1">Cine completează formularul (cu email) intră în lista ta Klaviyo, cu acordul lor. Folosește-l pentru formulare de abonare.</p>
          </div>
          <div className="pt-3 border-t border-border">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={emailEnabled} onChange={(e) => { setEmailEnabled(e.target.checked); mark(); }} className="w-4 h-4 rounded accent-green-600" />
              Trimite-mi completările și pe email
            </label>
            {emailEnabled && (
              <div className="mt-2.5">
                <input value={emailTo} onChange={(e) => { setEmailTo(e.target.value); mark(); }} type="email"
                  placeholder="Adresa de email (gol = emailul magazinului)" className={inputCls} />
                <p className="text-[11px] text-muted-foreground mt-1">Poate fi emailul magazinului sau cel al contului tău. Completările apar oricum în secțiunea „Mesaje”.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
