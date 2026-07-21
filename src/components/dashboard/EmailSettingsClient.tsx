"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Send, Mail, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { cn } from "@/lib/utils/cn";
import { updateSmtpConfig, sendTestEmail, updateEmailTemplate } from "@/lib/actions/email-settings.actions";
import { SMTP_PRESETS, type EmailTemplateKind } from "@/lib/email/config";
import { TEMPLATE_DEFS, type TemplateDef } from "@/lib/email/templates";

export interface EmailSettingsInitial {
  enabled: boolean; host: string; port: number; secure: boolean;
  user: string; from_email: string; from_name: string; reply_to: string; hasPassword: boolean;
  templates: Partial<Record<EmailTemplateKind, { subject?: string; intro?: string }>>;
}

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function TemplateCard({ businessId, def, initial }: { businessId: string | null; def: TemplateDef; initial: { subject?: string; intro?: string } }) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial.subject ?? def.defaultSubject);
  const [intro, setIntro] = useState(initial.intro ?? def.defaultIntro);
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const customized = !!(initial.subject || initial.intro);

  function save() {
    if (!businessId) return;
    startSave(async () => {
      const res = await updateEmailTemplate(businessId, def.kind, { subject, intro });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Sablon salvat."); router.refresh();
    });
  }

  function reset() {
    if (!businessId) return;
    startSave(async () => {
      const res = await updateEmailTemplate(businessId, def.kind, {});
      if ("error" in res) { toast.error(res.error); return; }
      setSubject(def.defaultSubject); setIntro(def.defaultIntro);
      toast.success("Revenit la sablonul standard."); router.refresh();
    });
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{def.label}</span>
          <span className="block text-xs text-muted-foreground">{def.description}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {customized && <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">Personalizat</span>}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="px-4 py-4 border-t border-border space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Subiect</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={def.defaultSubject} className={inputCls} disabled={!businessId} />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Mesaj</label>
            <RichTextEditor content={intro} onChange={setIntro} disabled={!businessId} placeholder={def.defaultIntro} />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Variabile disponibile (apasa ca sa copiezi):</p>
            <div className="flex flex-wrap gap-1.5">
              {def.variables.map((v) => (
                <button key={v.token} type="button" title={v.label}
                  onClick={() => { navigator.clipboard?.writeText(`{{${v.token}}}`); toast.success(`Copiat {{${v.token}}}`); }}
                  className="text-[11px] font-mono rounded border border-border px-2 py-0.5 text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                  {`{{${v.token}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {customized ? (
              <button type="button" disabled={saving} onClick={reset} className="text-xs text-muted-foreground underline disabled:opacity-50">Reseteaza la standard</button>
            ) : <span />}
            <Button size="sm" disabled={saving || !businessId} onClick={save}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Salveaza sablonul</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmailSettingsClient({ businessId, initial }: { businessId: string | null; initial: EmailSettingsInitial }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [form, setForm] = useState({ ...initial, pass: "" });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function applyPreset(p: (typeof SMTP_PRESETS)[number]) {
    setForm((f) => ({ ...f, host: p.host, port: p.port, secure: p.secure }));
    if (p.hint) toast.message(p.hint);
  }

  function save() {
    if (!businessId) return;
    startSave(async () => {
      const res = await updateSmtpConfig(businessId, {
        enabled: form.enabled, host: form.host, port: form.port, secure: form.secure,
        user: form.user, pass: form.pass, from_email: form.from_email, from_name: form.from_name, reply_to: form.reply_to,
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(form.enabled ? "Email propriu conectat." : "Setari salvate.");
      setForm((f) => ({ ...f, pass: "" }));
      router.refresh();
    });
  }

  function test() {
    if (!businessId) return;
    startTest(async () => {
      const res = await sendTestEmail(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Email de test trimis. Verifica-ti inboxul.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
        <Mail className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Implicit, emailurile catre clienti pleaca de pe Edinio. Conecteaza-ti emailul propriu (SMTP) ca sa se trimita de pe domeniul tau, cu logo-ul si numele magazinului. E optional: daca nu configurezi nimic, ramane exact ca acum.
        </p>
      </div>

      {!businessId && <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>}

      <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Trimite de pe emailul meu</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Cand e activ, emailurile magazinului pleaca prin serverul tau SMTP, nu prin Edinio.</span>
          </span>
          <Switch checked={form.enabled} disabled={!businessId} onCheckedChange={(v) => set("enabled", v)} />
        </label>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Furnizor</label>
          <div className="flex flex-wrap gap-2">
            {SMTP_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => applyPreset(p)}
                className="text-xs font-medium rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Server (host)</label>
            <input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" className={inputCls} disabled={!businessId} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Port</label>
            <input type="number" value={form.port} onChange={(e) => set("port", Number(e.target.value) || 0)} placeholder="465" className={inputCls} disabled={!businessId} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Securitate</label>
            <select value={form.secure ? "ssl" : "starttls"} onChange={(e) => set("secure", e.target.value === "ssl")} className={inputCls} disabled={!businessId}>
              <option value="ssl">SSL / TLS (465)</option>
              <option value="starttls">STARTTLS (587)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Utilizator (email)</label>
            <input value={form.user} onChange={(e) => set("user", e.target.value)} placeholder="comenzi@domeniul-tau.ro" className={inputCls} disabled={!businessId} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Parola</label>
            <input type="password" value={form.pass} onChange={(e) => set("pass", e.target.value)}
              placeholder={initial.hasPassword ? "•••••••• (lasa gol ca sa pastrezi parola actuala)" : "Parola SMTP / App Password"} className={inputCls} disabled={!businessId} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Nume expeditor</label>
            <input value={form.from_name} onChange={(e) => set("from_name", e.target.value)} placeholder="Magazinul meu" className={inputCls} disabled={!businessId} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Email expeditor</label>
            <input value={form.from_email} onChange={(e) => set("from_email", e.target.value)} placeholder="comenzi@domeniul-tau.ro" className={inputCls} disabled={!businessId} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Reply-to (optional)</label>
            <input value={form.reply_to} onChange={(e) => set("reply_to", e.target.value)} placeholder="Adresa la care primesti raspunsurile" className={inputCls} disabled={!businessId} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={testing || !businessId} onClick={test}>
            {testing ? <Loader2 className="animate-spin" /> : <Send />} Trimite email de test
          </Button>
          <Button disabled={saving || !businessId} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} {saving ? "Se salveaza..." : "Salveaza"}
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Sabloane de email</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sabloanele sunt pre-completate cu textul standard (deja cu logo-ul si culorile tale). Modifica ce vrei; tabelul cu produse si butoanele se genereaza automat.</p>
        </div>
        <div className="space-y-2">
          {TEMPLATE_DEFS.map((def) => (
            <TemplateCard key={def.kind} businessId={businessId} def={def} initial={initial.templates[def.kind] ?? {}} />
          ))}
        </div>
      </div>
    </div>
  );
}
