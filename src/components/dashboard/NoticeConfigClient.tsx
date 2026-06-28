"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Save, Loader2, MessageSquare, Phone, ExternalLink, CheckCircle, XCircle,
  Plug, BarChart3, Wallet, MessageCircle, PhoneCall, Inbox, Webhook, Copy, ShoppingCart,
} from "lucide-react";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { NoticeWhatsappPanel } from "@/components/dashboard/NoticeWhatsappPanel";
import {
  updateNoticeConfig, testNoticeConnection, listNoticeTemplates, sendNoticeTestSms,
  getNoticeStats, getNoticeInbox, getNoticeConfig, sendNoticeTestWhatsapp, sendNoticeTestVoice,
  type NoticeStats, type NoticeInboxItem,
} from "@/lib/actions/notice.actions";
import {
  type NoticeConfig, type NoticeTemplate, type NoticeTriggerKey, type NoticeTrigger,
} from "@/lib/notice";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

const STATUS_TRIGGERS: { key: NoticeTriggerKey; label: string }[] = [
  { key: "pending", label: "Procesare comanda (comanda noua)" },
  { key: "confirmed", label: "Comanda confirmata" },
  { key: "processing", label: "In procesare" },
  { key: "shipped", label: "Comanda expediata" },
  { key: "delivered", label: "Comanda livrata" },
  { key: "cancelled", label: "Comanda anulata" },
  { key: "refunded", label: "Comanda rambursata" },
];

const PAYMENT_TRIGGERS: { key: NoticeTriggerKey; label: string }[] = [
  { key: "payment_paid", label: "Status plata - Platita" },
  { key: "payment_refunded", label: "Status plata - Rambursata" },
];

const TRIGGER_LABELS: Record<string, string> = {
  ...Object.fromEntries([...STATUS_TRIGGERS, ...PAYMENT_TRIGGERS].map(t => [t.key, t.label])),
  abandoned_cart: "Cos abandonat",
};

const selectCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

export function NoticeConfigClient({ businessId, initialConfig }: { businessId: string; initialConfig: NoticeConfig }) {
  const router = useRouter();
  const [config, setConfig] = useState<NoticeConfig>(initialConfig);
  const [templates, setTemplates] = useState<NoticeTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [stats, setStats] = useState<NoticeStats | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testingChannel, setTestingChannel] = useState<"sms" | "whatsapp" | "voice" | null>(null);
  const [inbox, setInbox] = useState<NoticeInboxItem[]>([]);

  // After a WhatsApp connect/disconnect, re-sync only the server-managed slice
  // (whatsapp + webhook_secret) so unsaved trigger edits in the form are preserved.
  const syncWhatsapp = useCallback(async () => {
    const res = await getNoticeConfig(businessId);
    if ("error" in res) return;
    setConfig(c => ({ ...c, whatsapp: res.config.whatsapp, webhook_secret: res.config.webhook_secret ?? c.webhook_secret }));
  }, [businessId]);

  const loadTemplates = useCallback(async (token: string) => {
    if (!token.trim()) return;
    setTplLoading(true);
    setTplError(null);
    const res = await listNoticeTemplates(token);
    setTplLoading(false);
    if ("error" in res) { setTplError(res.error); setTemplates([]); }
    else setTemplates(res.templates);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await getNoticeStats(businessId);
    if (!("error" in res)) setStats(res);
  }, [businessId]);

  // On load, if a token is already saved, fetch templates + stats so the merchant
  // sees current selections and figures immediately. State is set only after the
  // awaits (never synchronously inside the effect).
  useEffect(() => {
    const token = initialConfig.api_token;
    if (!token) return;
    let active = true;
    void (async () => {
      const tpl = await listNoticeTemplates(token);
      if (active && !("error" in tpl)) setTemplates(tpl.templates);
      const st = await getNoticeStats(businessId);
      if (active && !("error" in st)) setStats(st);
      const ib = await getNoticeInbox(businessId);
      if (active && !("error" in ib)) setInbox(ib.items);
    })();
    return () => { active = false; };
  }, [initialConfig.api_token, businessId]);

  const trigger = (key: NoticeTriggerKey): NoticeTrigger => config.triggers?.[key] ?? { enabled: false };

  function patchTrigger(key: NoticeTriggerKey, patch: Partial<NoticeTrigger>) {
    setConfig(c => ({
      ...c,
      triggers: { ...c.triggers, [key]: { ...(c.triggers?.[key] ?? { enabled: false }), ...patch } },
    }));
  }

  function pickTemplate(key: NoticeTriggerKey, templateId: string) {
    const t = templates.find(x => x.id === templateId);
    patchTrigger(key, {
      template_id: templateId || null,
      template_text: t?.text ?? null,
      template_name: t?.name ?? null,
    });
  }

  async function testConnection() {
    if (!config.api_token.trim()) { toast.error("Introdu tokenul API."); return; }
    setTesting(true);
    setTestResult(null);
    const res = await testNoticeConnection(config.api_token);
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, message: `Conexiune reusita. ${res.templateCount} sabloane gasite in contul tau.` });
      void loadTemplates(config.api_token);
    } else {
      setTestResult({ ok: false, message: res.error });
    }
  }

  async function sendTest(channel: "sms" | "whatsapp" | "voice") {
    if (!testPhone.trim()) { toast.error("Introdu un numar de telefon."); return; }
    setTestingChannel(channel);
    const res = channel === "whatsapp"
      ? await sendNoticeTestWhatsapp(config.api_token, testPhone)
      : channel === "voice"
        ? await sendNoticeTestVoice(config.api_token, testPhone)
        : await sendNoticeTestSms(config.api_token, testPhone);
    setTestingChannel(null);
    if ("error" in res) toast.error(res.error);
    else {
      const labels = { sms: "SMS", whatsapp: "WhatsApp", voice: "Apel" } as const;
      toast.success(`Test ${labels[channel]} trimis catre ${testPhone}.`);
      void loadStats();
    }
  }

  function save() {
    if (config.enabled && !config.api_token.trim()) { toast.error("Tokenul API este obligatoriu."); return; }
    startSave(async () => {
      const res = await updateNoticeConfig(businessId, config);
      if ("error" in res) toast.error(res.error);
      else { setConfig(res.config); toast.success("Integrarea notice.ro a fost salvata."); router.refresh(); }
    });
  }

  const hasToken = config.api_token.trim().length > 0;
  const waEnabled = !!config.whatsapp?.enabled;
  const voiceEnabled = !!config.voice?.enabled;
  const webhookUrl = config.webhook_secret
    ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com"}/api/notice/webhook?secret=${config.webhook_secret}`
    : null;

  // Rendered as a plain function (not <TriggerRow/>) so the <select> keeps focus
  // across re-renders and we avoid clashing with React's reserved `key` prop.
  function renderTriggerRow(tk: NoticeTriggerKey, label: string) {
    const tr = trigger(tk);
    const anyOn = !!tr.enabled || !!tr.whatsapp || !!tr.voice;
    return (
      <div key={tk} className="rounded-xl border border-border p-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2">
            <Switch checked={!!tr.enabled} onCheckedChange={v => patchTrigger(tk, { enabled: v })} disabled={!config.enabled} />
            <span className="text-xs text-muted-foreground">SMS</span>
          </label>
          {waEnabled && (
            <label className="flex items-center gap-2">
              <Switch checked={!!tr.whatsapp} onCheckedChange={v => patchTrigger(tk, { whatsapp: v })} disabled={!config.enabled} />
              <span className="text-xs text-muted-foreground">WhatsApp</span>
            </label>
          )}
          {voiceEnabled && (
            <label className="flex items-center gap-2">
              <Switch checked={!!tr.voice} onCheckedChange={v => patchTrigger(tk, { voice: v })} disabled={!config.enabled} />
              <span className="text-xs text-muted-foreground">Apel</span>
            </label>
          )}
        </div>
        {anyOn && (
          <div className="mt-2.5">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Sablon notice.ro</label>
            {templates.length > 0 ? (
              <select value={tr.template_id ?? ""} onChange={e => pickTemplate(tk, e.target.value)} className={selectCls}>
                <option value="">Mesaj standard (fara sablon)</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                {tr.template_name
                  ? `Sablon selectat: ${tr.template_name}. Testeaza conexiunea ca sa schimbi.`
                  : "Conecteaza-te si testeaza conexiunea ca sa incarci sabloanele. Pana atunci se trimite un mesaj standard."}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <IntegrationHeader id="notice" description="Trimite notificari automate clientilor (SMS, WhatsApp si apel vocal) la fiecare schimbare de status, prin notice.ro." />

      <div className="space-y-6">
        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Conecteaza contul tau <strong>notice.ro</strong> ca sa trimiti automat notificari clientilor (SMS, WhatsApp
            si apel vocal) cand schimbi statusul comenzii sau al platii. Mesajele folosesc sabloanele create de tine in
            notice.ro, iar rapoartele de livrare si raspunsurile vin inapoi prin webhook.
          </p>
        </div>

        {/* Step guide */}
        <Panel className="overflow-hidden">
          <PanelHeader><PanelTitle>Cum obtii tokenul API?</PanelTitle></PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              { step: "1", title: "Creeaza un cont notice.ro", desc: "Inregistreaza-te pe notice.ro si adauga credit SMS pentru a putea trimite mesaje.", link: "https://notice.ro" },
              { step: "2", title: "Genereaza tokenul API", desc: "In contul notice.ro, mergi la sectiunea API / Dezvoltatori si genereaza un token API.", link: "https://notice.ro" },
              { step: "3", title: "Creeaza sabloanele de SMS", desc: "Adauga in notice.ro sabloanele dorite pentru fiecare status. Variabile acceptate: {name}, {order_id}, {total}, {telephone}, {shipping_address}, {shipping_city}, {shipping_company}, {payment_method}, {store_url}, {date_added} (plus {awb} adaugat de noi). Un SMS = aproximativ 130 de caractere.", link: null },
              { step: "4", title: "Conecteaza si testeaza", desc: "Lipeste tokenul mai jos, testeaza conexiunea, apoi alege ce SMS-uri se trimit si cu ce sablon.", link: null },
            ].map(({ step, title, desc, link }) => (
              <div key={step} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Deschide notice.ro <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Connection */}
        <Panel className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Token API notice.ro</label>
            <Input
              type="password"
              value={config.api_token}
              onChange={e => setConfig(c => ({ ...c, api_token: e.target.value }))}
              placeholder="Tokenul tau API de la notice.ro"
            />
          </div>

          {testResult && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg border p-3 text-sm",
              testResult.ok ? "border-success/20 bg-success/5 text-success" : "border-destructive/20 bg-destructive/5 text-destructive",
            )}>
              {testResult.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
              <p className="font-medium">{testResult.message}</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={testConnection} disabled={testing || !hasToken}>
              {testing ? <Loader2 className="animate-spin" /> : <Plug />}
              {testing ? "Se testeaza..." : "Testeaza conexiunea"}
            </Button>
          </div>
        </Panel>

        {/* Settings — shown once a token is present */}
        {hasToken && (
          <Panel className="space-y-5 p-5">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-sm font-semibold text-foreground">Activeaza notice.ro</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cand e activ, trimitem notificari (SMS / WhatsApp / apel) pentru scenariile bifate mai jos.
                </p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={v => setConfig(c => ({ ...c, enabled: v }))} />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="pr-4">
                <p className="text-sm font-semibold text-foreground">Elimina diacriticele (SMS)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Recomandat: mesajele SMS raman intr-un singur segment. WhatsApp si apelul pastreaza diacriticele.
                </p>
              </div>
              <Switch
                checked={config.strip_diacritics !== false}
                onCheckedChange={v => setConfig(c => ({ ...c, strip_diacritics: v }))}
              />
            </div>
          </Panel>
        )}

        {/* WhatsApp channel */}
        {hasToken && config.enabled && (
          <NoticeWhatsappPanel
            businessId={businessId}
            token={config.api_token}
            whatsapp={config.whatsapp}
            onChange={syncWhatsapp}
          />
        )}

        {/* Voice + abandoned-cart channels */}
        {hasToken && config.enabled && (
          <Panel className="space-y-5 p-5">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <PhoneCall className="h-4 w-4 text-primary" /> Notificari vocale (apel)
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Suna automat clientul cu un mesaj vocal generat din text. Apoi bifeaza &quot;Apel&quot; la fiecare scenariu.
                </p>
              </div>
              <Switch
                checked={voiceEnabled}
                onCheckedChange={v => setConfig(c => ({ ...c, voice: { ...c.voice, enabled: v } }))}
              />
            </div>
            {voiceEnabled && (
              <div className="border-t border-border pt-4">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tip apel</label>
                <select
                  value={config.voice?.type ?? "confirmation"}
                  onChange={e => setConfig(c => ({ ...c, voice: { enabled: c.voice?.enabled ?? true, type: e.target.value as "confirmation" | "fulfilment" } }))}
                  className={selectCls}
                >
                  <option value="confirmation">Confirmare</option>
                  <option value="fulfilment">Procesare / livrare</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="pr-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShoppingCart className="h-4 w-4 text-primary" /> SMS cos abandonat
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Foloseste notice.ro pentru SMS-urile de recuperare cos abandonat (din pagina Cosuri abandonate).
                </p>
              </div>
              <Switch
                checked={!!config.abandoned?.enabled}
                onCheckedChange={v => setConfig(c => ({ ...c, abandoned: { enabled: v } }))}
              />
            </div>
          </Panel>
        )}

        {/* Triggers + save */}
        {hasToken && (
          <Panel className="space-y-5 p-5">
            {tplError && (
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-warning">
                {tplError} Verifica tokenul si testeaza din nou conexiunea.
              </div>
            )}
            {tplLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se incarca sabloanele din notice.ro...
              </p>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notificari la status comanda</p>
              {STATUS_TRIGGERS.map(t => renderTriggerRow(t.key, t.label))}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notificari la status plata</p>
              {PAYMENT_TRIGGERS.map(t => renderTriggerRow(t.key, t.label))}
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button size="lg" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "Se salveaza..." : "Salveaza integrarea"}
              </Button>
            </div>
          </Panel>
        )}

        {/* Webhook URL */}
        {hasToken && config.enabled && webhookUrl && (
          <Panel className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Webhook (rapoarte livrare + raspunsuri)</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Copiaza acest URL in notice.ro &rarr; Integrare API &rarr; Webhook URL ca sa primesti rapoartele de livrare si raspunsurile clientilor.
            </p>
            <div className="flex gap-2">
              <input readOnly value={webhookUrl} className="min-w-0 flex-1 truncate rounded-lg border border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground focus:outline-none" />
              <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => { void navigator.clipboard.writeText(webhookUrl); toast.success("URL copiat."); }}>
                <Copy /> Copiaza
              </Button>
            </div>
          </Panel>
        )}

        {/* Stats + credits */}
        {hasToken && (
          <Panel className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Statistici notificari</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Trimise azi", value: stats?.today ?? 0 },
                { label: "Total trimise", value: stats?.total ?? 0 },
                { label: "Esuate", value: stats?.failed ?? 0 },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-3 text-center">
                  <p className="text-2xl font-semibold text-foreground tabular-nums">{s.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <a href="https://notice.ro" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                Vezi creditele ramase in contul notice.ro
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>

            {stats && stats.recent.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Ultimele notificari</p>
                <div className="space-y-1.5">
                  {stats.recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {r.success
                          ? <CheckCircle className="h-3 w-3 flex-shrink-0 text-success" />
                          : <XCircle className="h-3 w-3 flex-shrink-0 text-destructive" />}
                        {r.channel === "whatsapp"
                          ? <MessageCircle className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          : r.channel === "voice"
                            ? <PhoneCall className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            : <MessageSquare className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
                        <span className="truncate text-foreground">{TRIGGER_LABELS[r.trigger_key] ?? r.trigger_key}</span>
                        {r.phone && <span className="text-muted-foreground">· {r.phone}</span>}
                        {r.delivery_status === "delivered" && <span className="text-success">· livrat</span>}
                      </span>
                      <span className="flex-shrink-0 text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* Inbox — inbound replies captured by the webhook */}
        {hasToken && inbox.length > 0 && (
          <Panel className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Raspunsuri primite</p>
            </div>
            <div className="space-y-2">
              {inbox.map(m => (
                <div key={m.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {m.channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                      {m.from_number ?? "necunoscut"}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(m.received_at).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {m.body && <p className="mt-1 text-xs text-muted-foreground">{m.body}</p>}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Test channels */}
        {hasToken && (
          <Panel className="space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Trimite un test</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Consuma 1 credit notice.ro pe canal.</p>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring">
              <span className="flex w-10 shrink-0 items-center justify-center bg-muted/40">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => sendTest("sms")} disabled={testingChannel !== null} className="whitespace-nowrap">
                {testingChannel === "sms" ? <Loader2 className="animate-spin" /> : <MessageSquare />} Test SMS
              </Button>
              {waEnabled && (
                <Button variant="outline" onClick={() => sendTest("whatsapp")} disabled={testingChannel !== null} className="whitespace-nowrap">
                  {testingChannel === "whatsapp" ? <Loader2 className="animate-spin" /> : <MessageCircle />} Test WhatsApp
                </Button>
              )}
              {voiceEnabled && (
                <Button variant="outline" onClick={() => sendTest("voice")} disabled={testingChannel !== null} className="whitespace-nowrap">
                  {testingChannel === "voice" ? <Loader2 className="animate-spin" /> : <PhoneCall />} Test apel
                </Button>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
