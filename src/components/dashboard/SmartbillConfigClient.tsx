"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, ExternalLink, Layers, Loader2, Mail, ReceiptText, RefreshCw } from "lucide-react";
import { updateSmartbillConfig } from "@/lib/actions/store.actions";
import { testSmartbillConnection, getSmartbillTaxes } from "@/lib/actions/smartbill.actions";
import type { SmartbillConfig } from "@/lib/smartbill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { Callout } from "@/components/ui/callout";
import { selectCls } from "@/lib/ui";
import {
  BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

const AUTO_TRIGGERS = [
  { value: "confirmed",  label: "Comanda Confirmata" },
  { value: "processing", label: "In procesare" },
  { value: "shipped",    label: "Expediata" },
  { value: "delivered",  label: "Livrata" },
  { value: "paid",       label: "Platita (status plata)" },
] as const;

const DEFAULT_CONFIG: SmartbillConfig = {
  enabled: false,
  email: "",
  token: "",
  company_vat_code: "",
  series_name: "",
  estimate_series_name: "",
  tax_name: "",
  send_email: false,
  auto_invoice: false,
  auto_invoice_trigger: "confirmed",
  mark_paid_online: false,
  due_days: 0,
};

type SeriesInfo = { name: string; type: string; nextNumber?: string };

export function SmartbillConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: SmartbillConfig;
}) {
  const router = useRouter();
  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<SmartbillConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    series?: SeriesInfo[];
    taxes?: string[];
    message: string;
  } | null>(null);

  // VAT rates pulled from the merchant's SmartBill account — the Cota TVA value we
  // send must be one of THESE names (not a percentage typed by hand).
  const [taxes, setTaxes] = useState<{ name: string; percentage: number }[]>([]);
  const [taxesLoading, setTaxesLoading] = useState(false);

  const loadTaxes = useCallback(async () => {
    setTaxesLoading(true);
    const res = await getSmartbillTaxes(businessId);
    setTaxesLoading(false);
    if (!("error" in res)) setTaxes(res.taxes);
  }, [businessId]);

  // Auto-load the VAT rates on open if creds are already saved (state set only
  // after the await, never synchronously inside the effect).
  useEffect(() => {
    if (!(initialConfig.email && (initialConfig.token || secretulEsteSalvat(initialConfig, "token")) && initialConfig.company_vat_code)) return;
    let active = true;
    void (async () => {
      const res = await getSmartbillTaxes(businessId);
      if (active && !("error" in res)) setTaxes(res.taxes);
    })();
    return () => { active = false; };
  }, [initialConfig.email, initialConfig.token, initialConfig.company_vat_code, businessId]);

  function set<K extends keyof SmartbillConfig>(key: K, value: SmartbillConfig[K]) {
    setCfg(c => ({ ...c, [key]: value }));
  }

  function save() {
    if (cfg.enabled) {
      if (!cfg.email.trim()) { toast.error("Email-ul SmartBill este obligatoriu."); return; }
      if ((!cfg.token.trim() && !secretulEsteSalvat(initialConfig, "token"))) { toast.error("Tokenul API este obligatoriu."); return; }
      if (!cfg.company_vat_code.trim()) { toast.error("CUI-ul firmei este obligatoriu."); return; }
      if (!cfg.series_name.trim()) { toast.error("Seria facturilor este obligatorie."); return; }
    }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof updateSmartbillConfig>>;
      try {
        result = await updateSmartbillConfig(businessId, cfg);
      } catch {
        /* ⚠ Scrie configurarea SmartBill. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea SmartBill s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Integrarea SmartBill a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    });
  }

  async function testConnection() {
    if (!cfg.email.trim() || (!cfg.token.trim() && !secretulEsteSalvat(initialConfig, "token")) || !cfg.company_vat_code.trim()) {
      toast.error("Completeaza email-ul, tokenul si CUI-ul inainte de a testa.");
      return;
    }
    /*
     * ⚠ PROBA NU MAI SALVEAZA INAINTE (14.09.2026).
     *
     * Aici se chema `updateSmartbillConfig` ca actiunea de pe server sa aiba ce citi din
     * baza. Deci un token tastat gresit il STERGEA pe cel care mergea, tocmai cand omul
     * voia doar sa afle daca e bun, si facturarea se oprea. Acum configul pleaca odata cu
     * proba; tokenul mascat se rezolva pe server. Vezi nota din `testSmartbillConnection`.
     */
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSmartbillConnection(businessId, cfg);
      if ("error" in result) {
        setTestResult({ ok: false, message: result.error });
      } else {
        setTestResult({ ok: true, message: "Conexiune reusita!", series: result.series, taxes: result.taxes });
        void loadTaxes();
      }
    } catch {
      setTestResult({ ok: false, message: "Eroare de retea." });
    } finally {
      setTesting(false);
    }
  }

  const canTest = !!(cfg.email.trim() && (cfg.token.trim() || secretulEsteSalvat(initialConfig, "token")) && cfg.company_vat_code.trim());

  const tokenSalvat = secretulEsteSalvat(initialConfig, "token");
  const configurat = !!(initialConfig.email && (initialConfig.token || tokenSalvat) && initialConfig.company_vat_code);
  const stari: StareAntet[] = !configurat
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [initialConfig.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" }];

  return (
    <PaginaIntegrare
      id="smartbill"
      titlu="Facturare"
      descriere="Emiți facturi și proforme SmartBill din comenzi, manual sau automat."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Facturarea SmartBill" activ={cfg.enabled} onChange={v => set("enabled", v)} ariaLabel="Activează SmartBill" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul SmartBill", facut: canTest },
          { text: "Seria facturilor", facut: !!cfg.series_name.trim() },
          { text: "Facturarea activă", facut: configurat && !!initialConfig.enabled },
        ]} />
        <CumFunctioneaza id="smartbill" puncte={[
          { Icon: ReceiptText, text: "Emiți factura din pagina comenzii sau automat, când comanda ajunge la statusul ales." },
          { Icon: Layers, text: "Seriile și cotele TVA vin din contul tău SmartBill: le aduci cu „Testează conexiunea”." },
          { Icon: Mail, text: "SmartBill poate trimite factura pe email clientului, dacă ai serverul de email configurat la ei." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul SmartBill" descriere="Emailul contului, tokenul API și CUI-ul firmei care emite facturile.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email cont SmartBill" htmlFor="sb-email">
            <Input id="sb-email" type="email" value={cfg.email} onChange={e => set("email", e.target.value)} placeholder="email@firma.ro" />
          </Field>
          <Field label="Token API" htmlFor="sb-token"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Token API SmartBill"
              text="În contul SmartBill: Contul meu, apoi Integrări, apoi API. Copiezi tokenul generat." />}>
            <Input id="sb-token" type="password" value={cfg.token} onChange={e => set("token", e.target.value)}
              placeholder={tokenSalvat ? PLACEHOLDER_SECRET_SALVAT : ""} />
          </Field>
          <Field label="CUI firmă" htmlFor="sb-cui" hint="Cu sau fără prefixul RO.">
            <Input id="sb-cui" type="text" value={cfg.company_vat_code} onChange={e => set("company_vat_code", e.target.value)} placeholder="RO12345678" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={testConnection} disabled={testing || !canTest}>
            {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {testing ? "Se testează..." : "Testează conexiunea"}
          </Button>
          <a href="https://cloud.smartbill.ro/core/settings/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide setările SmartBill <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {testResult && (
          <Callout
            variant={testResult.ok ? "success" : "danger"}
            icon={testResult.ok ? CheckCircle : undefined}
            title={testResult.message}
          >
            {testResult.ok && testResult.series && testResult.series.length > 0 && (() => {
              const invoiceSeries = testResult.series.filter(s => s.type === "f");
              const estimateSeries = testResult.series.filter(s => s.type === "p");
              const chipLabel = (s: SeriesInfo) => s.nextNumber ? `${s.name} (urm. ${s.nextNumber})` : s.name;
              return (
                <div className="mt-2 space-y-3">
                  {invoiceSeries.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-foreground">Serii de facturi (apasă ca s-o alegi):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {invoiceSeries.map(s => (
                          <Button key={s.name} type="button" variant="outline" size="xs" className="font-mono"
                            onClick={() => { set("series_name", s.name); toast.success(`Seria „${s.name}” aleasă pentru facturi.`); }}>
                            {chipLabel(s)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {estimateSeries.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-foreground">Serii de proforme (apasă ca s-o alegi):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {estimateSeries.map(s => (
                          <Button key={s.name} type="button" variant="outline" size="xs" className="font-mono"
                            onClick={() => { set("estimate_series_name", s.name); toast.success(`Seria „${s.name}” aleasă pentru proforme.`); }}>
                            {chipLabel(s)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {invoiceSeries.length === 0 && (
                    <p className="text-xs text-warning">Nu există serii de facturi în cont. Creează una în SmartBill, la Nomenclatoare, Serii.</p>
                  )}
                </div>
              );
            })()}
          </Callout>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Documentele" descriere="Seria și cota TVA cu care se emit facturile.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Seria facturilor" htmlFor="sb-serie" hint="„Testează conexiunea” îți arată seriile din cont.">
            <Input id="sb-serie" type="text" value={cfg.series_name} onChange={e => set("series_name", e.target.value)} placeholder="FACT" />
          </Field>
          <Field label="Seria proformelor (opțional)" htmlFor="sb-serie-proforma" hint="Completată, poți emite proforme din comandă.">
            <Input id="sb-serie-proforma" type="text" value={cfg.estimate_series_name} onChange={e => set("estimate_series_name", e.target.value)} placeholder="PFACT" />
          </Field>
        </div>

        <Field label="Cota TVA"
          ajutor={<ExplicatieCard marime="mic" intrebare="Ce aleg aici" eticheta="Cota TVA"
            text="SmartBill cere NUMELE cotei din contul tău (de exemplu „Normală”), nu procentul. Alege cota care se potrivește cu TVA-ul din Setări. Lasă gol dacă nu ești plătitor de TVA." />}>
          {(() => {
            const known = taxes.some(t => t.name === cfg.tax_name);
            const showCustom = !!cfg.tax_name && !known;
            const isUnknownAfterLoad = showCustom && taxes.length > 0;
            return (
              <>
                <div className="flex gap-2">
                  <select
                    aria-label="Cota TVA"
                    value={cfg.tax_name}
                    onChange={e => set("tax_name", e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Nu sunt plătitor de TVA (fără TVA)</option>
                    {taxes.map(t => (
                      <option key={t.name} value={t.name}>{t.name} ({t.percentage}%)</option>
                    ))}
                    {showCustom && (
                      <option value={cfg.tax_name}>
                        {cfg.tax_name}{isUnknownAfterLoad ? " (necunoscută în SmartBill)" : ""}
                      </option>
                    )}
                  </select>
                  <Button type="button" variant="outline" size="icon" aria-label="Reîncarcă cotele din SmartBill"
                    onClick={() => void loadTaxes()} disabled={taxesLoading || !canTest}>
                    {taxesLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  </Button>
                </div>
                {isUnknownAfterLoad && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>Cota „{cfg.tax_name}” nu există în contul tău SmartBill. Alege una din listă.</span>
                  </div>
                )}
                {taxes.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Testează conexiunea (sau apasă reîncarcă) ca să aduci cotele din SmartBill.</p>
                )}
              </>
            );
          })()}
        </Field>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Trimite documentul pe email clientului</p>
              <p className="mt-0.5 text-xs text-muted-foreground">SmartBill trimite factura sau proforma, dacă clientul are email.</p>
            </div>
            <Switch checked={cfg.send_email} onCheckedChange={v => set("send_email", v)} aria-label="Trimite documentul pe email clientului" />
          </div>
          {cfg.send_email && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Emailul pleacă doar dacă ai un server de email configurat în SmartBill (Setări, Configurare email). Altfel factura se emite, dar emailul nu pleacă.</span>
            </p>
          )}
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Automat" descriere="Factura se poate emite singură, iar plata online se poate trece direct pe ea.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Generare automată factură</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Când comanda ajunge la statusul ales mai jos.</p>
          </div>
          <Switch checked={cfg.auto_invoice} onCheckedChange={v => set("auto_invoice", v)} aria-label="Generare automată factură" />
        </div>
        {cfg.auto_invoice && (
          <Field label="Declanșează generarea când comanda devine">
            <select
              aria-label="Declanșează generarea când comanda devine"
              value={cfg.auto_invoice_trigger}
              onChange={e => set("auto_invoice_trigger", e.target.value as SmartbillConfig["auto_invoice_trigger"])}
              className={selectCls}
            >
              {AUTO_TRIGGERS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Factura încasată la plata online</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Comanda plătită cu cardul primește factura direct încasată (Card online).</p>
          </div>
          <Switch checked={!!cfg.mark_paid_online} onCheckedChange={v => set("mark_paid_online", v)} aria-label="Marchează factura încasată la plata online" />
        </div>
        <Field label="Scadența facturii (zile)" htmlFor="sb-scadenta" hint="Zile de la emitere până la scadență. Gol = data emiterii.">
          <Input id="sb-scadenta" type="number" min={0} max={120} value={cfg.due_days || ""}
            onChange={e => set("due_days", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            placeholder="0 = fără scadență" className="max-w-[180px]" />
        </Field>
      </Sectiune>

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={save} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
