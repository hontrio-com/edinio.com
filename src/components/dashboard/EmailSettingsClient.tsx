"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Send, Mail, ChevronDown, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { MediaPicker } from "@/components/media/MediaPicker";
import { cn } from "@/lib/utils/cn";
import { updateSmtpConfig, sendTestEmail, updateEmailTemplate, updateEmailBranding } from "@/lib/actions/email-settings.actions";
import { SMTP_PRESETS, type EmailTemplateKind, type EmailBranding } from "@/lib/email/config";
import { TEMPLATE_DEFS, type TemplateDef } from "@/lib/email/templates";
import { buildEditableEmail } from "@/lib/email/preview";

export type TemplateOverride = { subject?: string; heading?: string; intro?: string; button?: string };

export interface EmailSettingsInitial {
  enabled: boolean; host: string; port: number; secure: boolean;
  user: string; from_email: string; from_name: string; reply_to: string; hasPassword: boolean;
  templates: Partial<Record<EmailTemplateKind, TemplateOverride>>;
  branding: EmailBranding;                          // store fallback (name/url/logo/color)
  emailBranding: { logo: string | null; color: string | null };  // email-only override
}

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function normalizeHex(c: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#1AB554";
}

function TemplateCard({ businessId, def, initial, branding, onEditLogo }: {
  businessId: string | null; def: TemplateDef; initial: TemplateOverride; branding: EmailBranding; onEditLogo: () => void;
}) {
  const router = useRouter();
  const hasHeading = def.defaultHeading !== undefined;
  const hasButton = def.defaultButton !== undefined;
  const [subject, setSubject] = useState(initial.subject ?? def.defaultSubject);
  const [heading, setHeading] = useState(initial.heading ?? def.defaultHeading ?? "");
  const [intro, setIntro] = useState(initial.intro ?? def.defaultIntro);
  const [button, setButton] = useState(initial.button ?? def.defaultButton ?? "");
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const customized = !!(initial.subject || initial.heading || initial.intro || initial.button);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [rev, setRev] = useState(0);

  // Built during render, but recomputed ONLY on structural changes (open / logo /
  // color / reset) — deliberately not on text edits, which live in the iframe DOM
  // and sync back via onInput, so the iframe is never reloaded while typing.
  const html = useMemo(
    () => (open ? buildEditableEmail(def.kind, branding, {
      subject: "",
      heading: hasHeading ? heading : undefined,
      intro,
      button: hasButton ? button : undefined,
    }, true).html : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, def.kind, branding.logoUrl, branding.color, hasHeading, hasButton, rev],
  );

  // Wire the same-origin iframe: text regions sync back on input, links never
  // navigate, and a click on the logo opens the media picker.
  function attach() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.addEventListener("input", (e) => {
      const host = (e.target as HTMLElement)?.closest?.("[data-field]") as HTMLElement | null;
      const f = host?.getAttribute("data-field");
      if (f === "heading") setHeading(host!.innerText);
      else if (f === "intro") setIntro(host!.innerText);
      else if (f === "button") setButton(host!.innerText);
    });
    doc.addEventListener("keydown", (e) => {
      const host = (e.target as HTMLElement)?.closest?.("[data-field]") as HTMLElement | null;
      const f = host?.getAttribute("data-field");
      if ((f === "heading" || f === "button") && (e as KeyboardEvent).key === "Enter") e.preventDefault();
    });
    doc.addEventListener("click", (e) => {
      const el = e.target as HTMLElement;
      if (el.closest?.("a")) e.preventDefault();
      if (el.closest?.("[data-edit='logo']")) { e.preventDefault(); onEditLogo(); }
    });
  }

  function overridePayload(): TemplateOverride {
    return {
      subject: subject.trim() && subject !== def.defaultSubject ? subject : undefined,
      heading: hasHeading && heading.trim() && heading !== def.defaultHeading ? heading : undefined,
      intro: intro.trim() && intro !== def.defaultIntro ? intro : undefined,
      button: hasButton && button.trim() && button !== def.defaultButton ? button : undefined,
    };
  }

  function save() {
    if (!businessId) return;
    startSave(async () => {
      const res = await updateEmailTemplate(businessId, def.kind, overridePayload());
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Sablon salvat."); router.refresh();
    });
  }

  function reset() {
    if (!businessId) return;
    startSave(async () => {
      const res = await updateEmailTemplate(businessId, def.kind, {});
      if ("error" in res) { toast.error(res.error); return; }
      setSubject(def.defaultSubject); setHeading(def.defaultHeading ?? ""); setIntro(def.defaultIntro); setButton(def.defaultButton ?? "");
      setRev((r) => r + 1);
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
            <p className="text-[11px] font-medium text-foreground mb-1.5">
              Editeaza direct pe email {hasButton ? "(apasa pe titlu, text, buton sau logo)" : "(apasa pe titlu, text sau logo)"}
            </p>
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <iframe ref={iframeRef} srcDoc={html} onLoad={attach} title="Editor email" className="w-full h-[460px] border-0 bg-white" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Textele cu <span className="font-mono">{"{{...}}"}</span> se inlocuiesc automat cu datele clientului la trimitere. Produsele si numarul comenzii afisate sunt doar un exemplu.
            </p>
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

  // Email-only branding override (shared by every template). Persists immediately;
  // the previews update live.
  const [emailLogo, setEmailLogo] = useState<string | null>(initial.emailBranding.logo);
  const [emailColor, setEmailColor] = useState<string | null>(initial.emailBranding.color);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingBrand, startBrand] = useTransition();

  const effectiveBranding: EmailBranding = {
    storeName: initial.branding.storeName,
    logoUrl: emailLogo ?? initial.branding.logoUrl,
    color: emailColor ?? initial.branding.color,
    storeUrl: initial.branding.storeUrl,
  };

  function persistBranding(next: { logo?: string | null; color?: string }) {
    if (!businessId) return;
    startBrand(async () => {
      const res = await updateEmailBranding(businessId, next);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Branding email salvat."); router.refresh();
    });
  }
  function pickLogo(urls: string[]) {
    const url = urls[0];
    if (!url) return;
    setEmailLogo(url); persistBranding({ logo: url });
  }
  function removeLogo() { setEmailLogo(null); persistBranding({ logo: null }); }
  function commitColor(c: string) { setEmailColor(c); persistBranding({ color: c }); }
  function resetColor() { setEmailColor(null); persistBranding({ color: "" }); }

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
          <p className="text-sm font-semibold text-foreground">Brandingul emailurilor</p>
          <p className="text-xs text-muted-foreground mt-0.5">Logo-ul si culoarea din emailuri. Implicit sunt cele ale magazinului; schimba-le aici doar pentru emailuri (nu afecteaza magazinul online). Poti da click pe logo si direct in preview-ul de mai jos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
              {effectiveBranding.logoUrl
                ? <Image src={effectiveBranding.logoUrl} alt="Logo email" width={48} height={48} className="max-h-12 w-auto object-contain" unoptimized />
                : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex flex-col items-start gap-1">
              <button type="button" disabled={!businessId || savingBrand} onClick={() => setPickerOpen(true)} className="text-xs font-medium text-primary hover:underline disabled:opacity-50">Schimba logo</button>
              {emailLogo && <button type="button" disabled={savingBrand} onClick={removeLogo} className="text-[11px] text-muted-foreground hover:underline disabled:opacity-50">Elimina (foloseste logo magazin)</button>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground">Culoare</label>
            <input type="color" value={normalizeHex(effectiveBranding.color)} disabled={!businessId}
              onChange={(e) => setEmailColor(e.target.value)} onBlur={(e) => commitColor(e.target.value)}
              className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer disabled:opacity-50" aria-label="Culoare accent email" />
            {emailColor && <button type="button" disabled={savingBrand} onClick={resetColor} className="text-[11px] text-muted-foreground hover:underline disabled:opacity-50">Reset</button>}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Sabloane de email</p>
          <p className="text-xs text-muted-foreground mt-0.5">Editeaza fiecare email direct pe preview: apasa pe titlu, text sau buton si scrie, ori pe logo ca sa il schimbi. Tabelul cu produse se genereaza automat.</p>
        </div>
        <div className="space-y-2">
          {TEMPLATE_DEFS.map((def) => (
            <TemplateCard key={def.kind} businessId={businessId} def={def} initial={initial.templates[def.kind] ?? {}} branding={effectiveBranding} onEditLogo={() => setPickerOpen(true)} />
          ))}
        </div>
      </div>

      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={pickLogo} accept="image" bucket="logos" />
    </div>
  );
}
