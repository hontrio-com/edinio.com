"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle, Copy, ExternalLink, FileText, ListChecks, Loader2, MessageCircle, MessageSquare, Phone, PhoneCall,
  Plug, ShoppingCart, UserPlus, Wallet, Webhook, XCircle,
} from "lucide-react";
import { NoticeWhatsappPanel } from "@/components/dashboard/NoticeWhatsappPanel";
import {
  updateNoticeConfig, testNoticeConnection, listNoticeTemplates, sendNoticeTestSms,
  getNoticeStats, getNoticeInbox, getNoticeConfig, sendNoticeTestWhatsapp, sendNoticeTestVoice,
  type NoticeStats, type NoticeInboxItem,
} from "@/lib/actions/notice.actions";
import {
  type NoticeConfig, type NoticeTemplate, type NoticeTriggerKey, type NoticeTrigger,
} from "@/lib/notice";
import { adresaPublica } from "@/lib/adresa-publica";
import { stareaVocii, ETICHETA_VOCE } from "@/lib/notice-raspunsuri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { selectCls } from "@/lib/ui";

const STATUS_TRIGGERS: { key: NoticeTriggerKey; label: string }[] = [
  { key: "pending", label: "Procesare comandă (comandă nouă)" },
  { key: "confirmed", label: "Comandă confirmată" },
  { key: "processing", label: "În procesare" },
  { key: "shipped", label: "Comandă expediată" },
  { key: "delivered", label: "Comandă livrată" },
  { key: "cancelled", label: "Comandă anulată" },
  { key: "refunded", label: "Comandă rambursată" },
];

const PAYMENT_TRIGGERS: { key: NoticeTriggerKey; label: string }[] = [
  { key: "payment_paid", label: "Status plată: plătită" },
  { key: "payment_refunded", label: "Status plată: rambursată" },
];

const TRIGGER_LABELS: Record<string, string> = {
  ...Object.fromEntries([...STATUS_TRIGGERS, ...PAYMENT_TRIGGERS].map(t => [t.key, t.label])),
  abandoned_cart: "Coș abandonat",
};

export function NoticeConfigClient({ businessId, initialConfig }: { businessId: string; initialConfig: NoticeConfig }) {
  const router = useRouter();
  const { cfg: config, setCfg: setConfig, modificat, marcheazaSalvat, renunta, aliniaza } = useFormularIntegrare<NoticeConfig>(initialConfig);
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
    aliniaza(c => ({ ...c, whatsapp: res.config.whatsapp, webhook_secret: res.config.webhook_secret ?? c.webhook_secret }));
  }, [businessId, aliniaza]);

  const loadTemplates = useCallback(async (token: string) => {
    if (!token.trim() && !secretulEsteSalvat(initialConfig, "api_token")) return;
    setTplLoading(true);
    setTplError(null);
    const res = await listNoticeTemplates(businessId, token);
    setTplLoading(false);
    if ("error" in res) { setTplError(res.error); setTemplates([]); }
    else setTemplates(res.templates);
  }, [businessId, initialConfig]);

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
      const tpl = await listNoticeTemplates(businessId, token);
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
    if ((!config.api_token.trim() && !secretulEsteSalvat(initialConfig, "api_token"))) { toast.error("Introdu tokenul API."); return; }
    setTesting(true);
    setTestResult(null);
    const res = await testNoticeConnection(businessId, config.api_token);
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, message: `Conexiune reușită: ${res.templateCount} șabloane găsite în contul tău.` });
      void loadTemplates(config.api_token);
    } else {
      setTestResult({ ok: false, message: res.error });
    }
  }

  async function sendTest(channel: "sms" | "whatsapp" | "voice") {
    if (!testPhone.trim()) { toast.error("Introdu un număr de telefon."); return; }
    setTestingChannel(channel);
    const res = channel === "whatsapp"
      ? await sendNoticeTestWhatsapp(businessId, config.api_token, testPhone)
      : channel === "voice"
        ? await sendNoticeTestVoice(businessId, config.api_token, testPhone)
        : await sendNoticeTestSms(businessId, config.api_token, testPhone);
    setTestingChannel(null);
    if ("error" in res) toast.error(res.error);
    else {
      const labels = { sms: "SMS", whatsapp: "WhatsApp", voice: "Apel" } as const;
      toast.success(`Test ${labels[channel]} trimis către ${testPhone}.`);
      void loadStats();
    }
  }

  function save() {
    if (config.enabled && (!config.api_token.trim() && !secretulEsteSalvat(initialConfig, "api_token"))) { toast.error("Tokenul API este obligatoriu."); return; }
    startSave(async () => {
      let res: Awaited<ReturnType<typeof updateNoticeConfig>>;
      try {
        res = await updateNoticeConfig(businessId, config);
      } catch {
        /* ⚠ Scrie configurarea notice.ro. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea notice.ro s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) toast.error(res.error);
      else { marcheazaSalvat(res.config); toast.success("Integrarea notice.ro a fost salvată."); router.refresh(); }
    });
  }

  const hasToken = config.api_token.trim().length > 0 || secretulEsteSalvat(initialConfig, "api_token");
  const waEnabled = !!config.whatsapp?.enabled;
  const voiceEnabled = !!config.voice?.enabled;
  /*
   * ═══ ⚠⚠ ADRESA PE CARE O COPIAZA OMUL IN notice.ro ═══
   *
   * Scria `NEXT_PUBLIC_SITE_URL ?? "https://edinio.com"`. In productie variabila e APEXUL, iar apexul
   * raspunde 308 catre `www` (masurat 17.09.2026). Deci fiecare comerciant copia o adresa pe care
   * serverul lor trebuia sa urmeze o redirectare ca s-o gaseasca. In aceeasi zi am reparat adresa din
   * `noticeWebhookUrl`, dar NU si pe asta, care e cea care conteaza: pe aceea n-o vede nimeni, pe asta
   * o lipeste omul.
   */
  const webhookUrl = config.webhook_secret
    ? `${adresaPublica()}/api/notice/webhook?secret=${config.webhook_secret}`
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Șablon notice.ro</label>
            {templates.length > 0 ? (
              <select value={tr.template_id ?? ""} onChange={e => pickTemplate(tk, e.target.value)} className={selectCls}>
                <option value="">Mesaj standard (fără șablon)</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                {tr.template_name
                  ? `Șablon ales: ${tr.template_name}. Testează conexiunea ca să-l schimbi.`
                  : "Testează conexiunea ca să încarci șabloanele. Până atunci se trimite un mesaj standard."}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const tokenSalvat = secretulEsteSalvat(initialConfig, "api_token");
  const configurat = tokenSalvat || !!initialConfig.api_token;
  const oNotificare = Object.values(config.triggers ?? {}).some(t => !!t && (!!t.enabled || !!t.whatsapp || !!t.voice));
  const stari: StareAntet[] = !configurat
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      initialConfig.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" },
      ...(waEnabled ? [{ ton: "info" as const, text: "WhatsApp conectat" }] : []),
    ];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";
  const ora = (data: string) => new Date(data).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <PaginaIntegrare
      id="notice"
      titlu="Notificări pentru clienți"
      descriere="SMS, WhatsApp și apel vocal la fiecare schimbare de status a comenzii, prin contul tău notice.ro."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Notificările notice.ro" activ={config.enabled}
        onChange={v => setConfig(c => ({ ...c, enabled: v }))} ariaLabel="Activează notice.ro" disabled={!hasToken} />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Tokenul API", facut: hasToken },
          { text: "Cel puțin o notificare aleasă", facut: oNotificare },
          { text: "Notificările pornite", facut: configurat && !!initialConfig.enabled },
        ]} />
        {hasToken && (
          <CardCifre
            titlu="Statistici notificări"
            cifre={[
              { eticheta: "Trimise azi", valoare: stats?.today ?? 0 },
              { eticheta: "Total trimise", valoare: stats?.total ?? 0 },
              { eticheta: "Eșuate", valoare: stats?.failed ?? 0 },
            ]}
            randuri={[{
              eticheta: <><Wallet className="h-3.5 w-3.5" /> Creditele rămase</>,
              valoare: (
                <a href="https://notice.ro" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  în contul notice.ro <ExternalLink className="h-3 w-3" />
                </a>
              ),
            }]}
          />
        )}
        <CumFunctioneaza id="notice" puncte={[
          { Icon: UserPlus, text: "Îți faci cont pe notice.ro, adaugi credit SMS și generezi tokenul API, la API / Dezvoltatori." },
          { Icon: FileText, text: "Șabloanele de mesaj le creezi în notice.ro, câte unul pentru fiecare status. Un SMS are cam 130 de caractere." },
          { Icon: ListChecks, text: "Aici alegi, pentru fiecare status, pe ce canal pleacă mesajul și cu ce șablon." },
          { Icon: Webhook, text: "Rapoartele de livrare și răspunsurile clienților vin prin adresa de webhook, pe care o lipești în notice.ro." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul notice.ro" descriere="Tokenul API din contul tău. Cu el aducem și șabloanele de mesaj.">
        <Field label="Token API notice.ro" htmlFor="notice-token"
          ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Tokenul API notice.ro"
            text="În contul notice.ro, la secțiunea API / Dezvoltatori, generezi un token API și îl lipești aici." />}>
          <Input
            id="notice-token"
            type="password"
            value={config.api_token}
            onChange={e => setConfig(c => ({ ...c, api_token: e.target.value }))}
            placeholder={tokenSalvat ? PLACEHOLDER_SECRET_SALVAT : ""}
          />
        </Field>
        {testResult && (
          <Callout variant={testResult.ok ? "success" : "danger"} icon={testResult.ok ? CheckCircle : XCircle} title={testResult.message} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={testConnection} disabled={testing || !hasToken}>
            {testing ? <Loader2 className="animate-spin" /> : <Plug />}
            {testing ? "Se testează..." : "Testează conexiunea"}
          </Button>
          <a href="https://notice.ro" target="_blank" rel="noopener noreferrer" className={legatura}>
            Deschide notice.ro <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      {hasToken && (
        <Sectiune pas={2} titlu="Canale" descriere="Pe unde pleacă notificările: SMS, WhatsApp sau apel vocal.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Elimină diacriticele (SMS)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Recomandat: mesajele SMS rămân într-un singur segment. WhatsApp și apelul păstrează diacriticele.
              </p>
            </div>
            <Switch
              checked={config.strip_diacritics !== false}
              onCheckedChange={v => setConfig(c => ({ ...c, strip_diacritics: v }))}
              aria-label="Elimină diacriticele (SMS)"
            />
          </div>

          {config.enabled ? (
            <>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <PhoneCall className="h-4 w-4 text-muted-foreground" /> Notificări vocale (apel)
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sună automat clientul cu un mesaj vocal generat din text. Apoi bifezi „Apel” la fiecare scenariu.
                  </p>
                </div>
                <Switch
                  checked={voiceEnabled}
                  onCheckedChange={v => setConfig(c => ({ ...c, voice: { ...c.voice, enabled: v } }))}
                  aria-label="Notificări vocale (apel)"
                />
              </div>
              {voiceEnabled && (
                <Field label="Tip apel" htmlFor="notice-tip-apel">
                  <select
                    id="notice-tip-apel"
                    value={config.voice?.type ?? "confirmation"}
                    onChange={e => setConfig(c => ({ ...c, voice: { enabled: c.voice?.enabled ?? true, type: e.target.value as "confirmation" | "fulfilment" } }))}
                    className={selectCls}
                  >
                    <option value="confirmation">Confirmare</option>
                    <option value="fulfilment">Procesare / livrare</option>
                  </select>
                </Field>
              )}

              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" /> SMS coș abandonat
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Folosește notice.ro pentru SMS-urile de recuperare a coșurilor abandonate (din pagina Coșuri abandonate).
                  </p>
                </div>
                <Switch
                  checked={!!config.abandoned?.enabled}
                  onCheckedChange={v => setConfig(c => ({ ...c, abandoned: { enabled: v } }))}
                  aria-label="SMS coș abandonat"
                />
              </div>
            </>
          ) : (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              WhatsApp, apelul vocal și SMS-ul de coș abandonat apar după ce pornești comutatorul „Notificările notice.ro” de sus.
            </p>
          )}
        </Sectiune>
      )}

      {/* WhatsApp: panoul lui, cu legarea numarului (felia `whatsapp` o scrie serverul, vezi `syncWhatsapp`). */}
      {hasToken && config.enabled && (
        <NoticeWhatsappPanel
          businessId={businessId}
          token={config.api_token}
          whatsapp={config.whatsapp}
          onChange={syncWhatsapp}
        />
      )}

      {hasToken && (
        <Sectiune pas={3} titlu="Când se trimit" descriere="La fiecare scenariu pornești canalele și alegi șablonul din notice.ro.">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Variabilele din șabloane
            <ExplicatieCard marime="mic" intrebare="Ce variabile pot folosi" eticheta="Variabilele din șabloane"
              text="{name}, {order_id}, {total}, {telephone}, {shipping_address}, {shipping_city}, {shipping_company}, {payment_method}, {store_url}, {date_added}, plus {awb}, adăugat de noi." />
          </div>
          {tplError && (
            <Callout variant="warning" title={tplError}>Verifică tokenul și testează din nou conexiunea.</Callout>
          )}
          {tplLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă șabloanele din notice.ro...
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notificări la status comandă</p>
            {STATUS_TRIGGERS.map(t => renderTriggerRow(t.key, t.label))}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notificări la status plată</p>
            {PAYMENT_TRIGGERS.map(t => renderTriggerRow(t.key, t.label))}
          </div>
        </Sectiune>
      )}

      {hasToken && (
        <Sectiune pas={4} titlu="Trimite un test" descriere="Consumă 1 credit notice.ro pe canal.">
          <div className="flex overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring">
            <span className="flex w-10 shrink-0 items-center justify-center bg-muted/40">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <input
              type="tel"
              aria-label="Numărul de telefon pentru test"
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
        </Sectiune>
      )}

      {hasToken && config.enabled && webhookUrl && (
        <Sectiune pas={5} titlu="Webhook (rapoarte livrare + răspunsuri)">
          <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
            Copiază adresa în notice.ro, la Integrare API, apoi Webhook URL, ca să primești rapoartele de livrare și
            răspunsurile clienților. Dacă ai lipit cândva acolo o adresă diferită (de exemplu fără „www”), înlocuiește-o.
            Rezultatul apelurilor vocale vine singur, fără nicio setare.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              aria-label="Adresa de webhook"
              value={webhookUrl}
              className="min-w-0 flex-1 truncate rounded-lg border border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground focus:outline-none"
            />
            <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => { void navigator.clipboard.writeText(webhookUrl); toast.success("URL copiat."); }}>
              <Copy /> Copiază
            </Button>
          </div>
        </Sectiune>
      )}

      {hasToken && stats && stats.recent.length > 0 && (
        <Sectiune titlu="Ultimele notificări">
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
                  {/* ⚠ La un apel se arata REZULTATUL: „clientul a anulat” e tocmai ce vrea sa afle comerciantul. */}
                  {r.channel === "voice" && stareaVocii(r.delivery_status) && (
                    <span className={stareaVocii(r.delivery_status) === "confirmed" ? "text-success" : "text-destructive"}>
                      · {ETICHETA_VOCE[stareaVocii(r.delivery_status)!]}
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-muted-foreground">{ora(r.created_at)}</span>
              </div>
            ))}
          </div>
        </Sectiune>
      )}

      {/* Raspunsurile clientilor: trase de cronul `notice-raspunsuri` si, daca vin, primite pe webhook. */}
      {hasToken && inbox.length > 0 && (
        <Sectiune titlu="Răspunsuri primite">
          <div className="space-y-2">
            {inbox.map(m => (
              <div key={m.id} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {m.channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                    {m.from_number ?? "necunoscut"}
                  </span>
                  <span className="text-muted-foreground">{ora(m.received_at)}</span>
                </div>
                {m.body && <p className="mt-1 text-xs text-muted-foreground">{m.body}</p>}
              </div>
            ))}
          </div>
        </Sectiune>
      )}

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={save} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
