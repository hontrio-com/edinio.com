"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import {
  Save, Loader2, FileText, ExternalLink,
  CheckCircle, RefreshCw, Mail, Building2, Key, Layers,
  ReceiptText, Zap, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { updateSmartbillConfig } from "@/lib/actions/store.actions";
import { testSmartbillConnection, getSmartbillTaxes } from "@/lib/actions/smartbill.actions";
import type { SmartbillConfig } from "@/lib/smartbill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { selectCls } from "@/lib/ui";

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
};

export function SmartbillConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: SmartbillConfig;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<SmartbillConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [testing, setTesting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(initialConfig.estimate_series_name || initialConfig.auto_invoice)
  );
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    series?: string[];
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
    if (!(initialConfig.email && initialConfig.token && initialConfig.company_vat_code)) return;
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
      if (!cfg.token.trim()) { toast.error("Tokenul API este obligatoriu."); return; }
      if (!cfg.company_vat_code.trim()) { toast.error("CUI-ul firmei este obligatoriu."); return; }
      if (!cfg.series_name.trim()) { toast.error("Seria facturilor este obligatorie."); return; }
    }
    startSave(async () => {
      const result = await updateSmartbillConfig(businessId, cfg);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Integrarea SmartBill a fost salvata.");
      router.refresh();
    });
  }

  async function testConnection() {
    if (!cfg.email.trim() || !cfg.token.trim() || !cfg.company_vat_code.trim()) {
      toast.error("Completeaza email-ul, tokenul si CUI-ul inainte de a testa.");
      return;
    }
    // Save first so the server action can read the config
    const saveResult = await updateSmartbillConfig(businessId, cfg);
    if ("error" in saveResult) { toast.error(saveResult.error); return; }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSmartbillConnection(businessId);
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

  const canTest = !!(cfg.email.trim() && cfg.token.trim() && cfg.company_vat_code.trim());

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <IntegrationHeader id="smartbill" description="Genereaza automat facturi SmartBill pentru comenzile din magazinul tau." />

      <div className="space-y-5">
        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Integreaza contul tau SmartBill pentru a genera facturi si proforma direct din comenzile magazinului.
            Documentele sunt emise in contul tau SmartBill si pot fi trimise automat pe email clientilor.
          </p>
        </div>

        {/* Ghid */}
        <Panel className="overflow-hidden">
          <PanelHeader>
            <PanelTitle>Cum configurezi integrarea?</PanelTitle>
          </PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              {
                step: "1",
                title: "Creeaza un cont SmartBill",
                desc: "Mergi pe smartbill.ro si inregistreaza-te.",
                link: null,
              },
              {
                step: "2",
                title: "Obtine Tokenul API",
                desc: "In contul SmartBill, mergi la Contul meu > Integrari > API. Copiaza tokenul generat.",
                link: "https://cloud.smartbill.ro/core/settings/",
              },
              {
                step: "3",
                title: "Configureaza serii de documente",
                desc: "In SmartBill > Nomenclatoare > Serii, creeaza o serie pentru facturi (ex: FACT) si optional una pentru proforma (ex: PFACT).",
                link: null,
              },
              {
                step: "4",
                title: "Testeaza si salveaza",
                desc: "Completeaza campurile, apasa Testeaza conexiunea — seriile si TVA-ul disponibil vor aparea automat — apoi salveaza.",
                link: null,
              },
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
                      Deschide SmartBill <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Main config card */}
        <Panel className="space-y-5 p-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza SmartBill</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Activeaza pentru a genera facturi din pagina comenzilor
              </p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={v => set("enabled", v)} />
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />Email cont SmartBill
              </label>
              <Input type="email" value={cfg.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@firma.ro" />
            </div>

            {/* Token */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />Token API SmartBill
              </label>
              <Input type="password" value={cfg.token}
                onChange={e => set("token", e.target.value)}
                placeholder="Tokenul din Contul meu > Integrari > API" />
            </div>

            {/* CUI */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />CUI firma
              </label>
              <Input type="text" value={cfg.company_vat_code}
                onChange={e => set("company_vat_code", e.target.value)}
                placeholder="ex: RO12345678 sau 12345678" />
              <p className="mt-1 text-xs text-muted-foreground">Cu sau fara prefix RO.</p>
            </div>

            {/* Invoice series */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />Seria facturilor
              </label>
              <Input type="text" value={cfg.series_name}
                onChange={e => set("series_name", e.target.value)}
                placeholder="ex: FACT" />
              <p className="mt-1 text-xs text-muted-foreground">
                Testeaza conexiunea pentru a vedea seriile disponibile.
              </p>
            </div>

            {/* Cota TVA — must be a tax NAME from SmartBill (not a percentage), so it's a dropdown */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />Cota TVA
              </label>
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
                        <option value="">— Nu sunt platitor de TVA (fara TVA) —</option>
                        {taxes.map(t => (
                          <option key={t.name} value={t.name}>{t.name} ({t.percentage}%)</option>
                        ))}
                        {showCustom && (
                          <option value={cfg.tax_name}>
                            {cfg.tax_name}{isUnknownAfterLoad ? " — necunoscut in SmartBill" : ""}
                          </option>
                        )}
                      </select>
                      <Button type="button" variant="outline" size="icon" aria-label="Reincarca cotele din SmartBill"
                        onClick={() => void loadTaxes()} disabled={taxesLoading || !canTest}>
                        {taxesLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      </Button>
                    </div>
                    {isUnknownAfterLoad && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>Cota „{cfg.tax_name}” nu exista in contul tau SmartBill. Alege una din lista — SmartBill cere <strong>numele</strong> cotei (ex. „Normala”), nu procentul.</span>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {taxes.length > 0
                        ? "Alege cota care corespunde TVA-ului din Setari. SmartBill foloseste numele cotei, nu procentul."
                        : "Testeaza conexiunea (sau apasa reincarca) ca sa aduci cotele din SmartBill. Lasa gol daca nu esti platitor de TVA."}
                    </p>
                  </>
                );
              })()}
            </div>

            {/* Send email toggle */}
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Trimite documentul pe email clientului</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    SmartBill va trimite factura/proforma automat daca clientul are email
                  </p>
                </div>
                <Switch checked={cfg.send_email} onCheckedChange={v => set("send_email", v)} />
              </div>
              {cfg.send_email && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/20 bg-warning/5 p-2.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Ca emailul sa fie trimis, contul tau SmartBill trebuie sa aiba un server de email configurat (in SmartBill: Setari &rarr; Configurare email). Daca nu e configurat, factura se genereaza oricum, dar emailul catre client nu pleaca.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Advanced section: auto-invoice + proforma series */}
          <div className="border-t border-border pt-4">
            <button type="button" onClick={() => setAdvancedOpen(o => !o)}
              className="flex w-full items-center gap-2 text-left text-sm font-medium text-foreground transition-colors hover:text-primary">
              <Zap className="h-4 w-4 text-primary" />
              Setari avansate
              {advancedOpen ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
            </button>

            {advancedOpen && (
              <div className="mt-4 space-y-5">
                {/* Proforma series */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />Seria proformelor (optional)
                  </label>
                  <Input type="text" value={cfg.estimate_series_name}
                    onChange={e => set("estimate_series_name", e.target.value)}
                    placeholder="ex: PFACT — lasa gol daca nu emiti proforma" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Daca este completata, vei putea genera proforma din detaliul comenzii.
                  </p>
                </div>

                {/* Auto-invoice toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Generare automata factura</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Factura se genereaza automat cand comanda atinge statusul selectat
                    </p>
                  </div>
                  <Switch checked={cfg.auto_invoice} onCheckedChange={v => set("auto_invoice", v)} />
                </div>

                {cfg.auto_invoice && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Declanseaza generarea cand comanda devine
                    </label>
                    <select
                      aria-label="Declanseaza generarea cand comanda devine"
                      value={cfg.auto_invoice_trigger}
                      onChange={e => set("auto_invoice_trigger", e.target.value as SmartbillConfig["auto_invoice_trigger"])}
                      className={selectCls}
                    >
                      {AUTO_TRIGGERS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <Button variant="outline" onClick={testConnection} disabled={testing || !canTest}>
              {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {testing ? "Se testeaza..." : "Testeaza conexiunea"}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Se salveaza..." : "Salveaza"}
            </Button>
          </div>

          {/* Test result */}
          {testResult && (
            <Callout
              variant={testResult.ok ? "success" : "danger"}
              icon={testResult.ok ? CheckCircle : undefined}
              title={testResult.message}
            >
              {testResult.ok && testResult.series && testResult.series.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1.5 text-xs font-semibold text-foreground">Serii disponibile (click pentru selectare):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {testResult.series.map(s => (
                      <Button key={s} type="button" variant="outline" size="xs" className="font-mono"
                        onClick={() => { set("series_name", s); toast.success(`Seria "${s}" selectata ca serie facturi.`); }}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Callout>
          )}
        </Panel>
      </div>
    </div>
  );
}
