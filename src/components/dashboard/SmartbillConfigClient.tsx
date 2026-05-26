"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Loader2, FileText, ExternalLink,
  CheckCircle, RefreshCw, Mail, Building2, Key, Layers,
  ReceiptText,
} from "lucide-react";
import { updateSmartbillConfig } from "@/lib/actions/store.actions";
import { testSmartbillConnection } from "@/lib/actions/smartbill.actions";
import type { SmartbillConfig } from "@/lib/smartbill";

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export function SmartbillConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: SmartbillConfig;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<SmartbillConfig>(initialConfig);
  const [saving, startSave] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    series?: string[];
    taxes?: string[];
    message: string;
  } | null>(null);

  function save() {
    if (cfg.enabled && !cfg.email.trim()) { toast.error("Email-ul SmartBill este obligatoriu."); return; }
    if (cfg.enabled && !cfg.token.trim()) { toast.error("Tokenul API este obligatoriu."); return; }
    if (cfg.enabled && !cfg.company_vat_code.trim()) { toast.error("CUI-ul firmei este obligatoriu."); return; }
    if (cfg.enabled && !cfg.series_name.trim()) { toast.error("Seria facturilor este obligatorie."); return; }
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
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSmartbillConnection(businessId);
      if ("error" in result) {
        setTestResult({ ok: false, message: result.error });
      } else {
        setTestResult({
          ok: true,
          message: "Conexiune reusita!",
          series: result.series,
          taxes: result.taxes,
        });
      }
    } catch {
      setTestResult({ ok: false, message: "Eroare de retea." });
    } finally {
      setTesting(false);
    }
  }

  const canTest = cfg.email.trim() && cfg.token.trim() && cfg.company_vat_code.trim();

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/dashboard/features")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Integrari
        </button>
        <span className="text-muted-foreground">/</span>
        <div className="flex items-center gap-2">
          <img src="/integrations/smartbill.svg" alt="SmartBill" className="h-5 w-auto object-contain" style={{ transform: "scale(1.25)", transformOrigin: "center" }} />
          <span className="text-sm font-semibold text-foreground">SmartBill</span>
        </div>
        {cfg.enabled && (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle className="h-2.5 w-2.5" />Activ
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Info */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
          <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Integreaza contul tau SmartBill pentru a genera facturi automat pentru comenzile din magazin.
            Facturile sunt create direct in contul tau SmartBill si pot fi trimise automat pe email catre clienti.
          </p>
        </div>

        {/* Ghid */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Cum configurezi integrarea?</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              {
                step: "1",
                title: "Creeaza un cont SmartBill",
                desc: "Mergi pe smartbill.ro si inregistreaza-te. Ai nevoie de un cont activ pentru a emite facturi.",
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
                title: "Verifica CUI-ul si Seria",
                desc: "CUI-ul firmei se gaseste in setarile contului. Seria facturilor (ex: FACT) se configureaza in SmartBill > Nomenclatoare > Serii.",
                link: null,
              },
              {
                step: "4",
                title: "Configureaza si testeaza",
                desc: "Completeaza campurile de mai jos, foloseste Testeaza conexiunea pentru a vedea seriile si cotele TVA disponibile, apoi salveaza.",
                link: null,
              },
            ].map(({ step, title, desc, link }) => (
              <div key={step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      Deschide SmartBill <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Configurare */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza SmartBill</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Activeaza pentru a putea genera facturi din pagina comenzilor
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${cfg.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />Email cont SmartBill
              </label>
              <input
                type="email"
                value={cfg.email}
                onChange={e => setCfg(c => ({ ...c, email: e.target.value }))}
                placeholder="email@firma.ro"
                className={inputCls}
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />Token API SmartBill
              </label>
              <input
                type="password"
                value={cfg.token}
                onChange={e => setCfg(c => ({ ...c, token: e.target.value }))}
                placeholder="Tokenul din Contul meu > Integrari > API"
                className={inputCls}
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />CUI firma
              </label>
              <input
                type="text"
                value={cfg.company_vat_code}
                onChange={e => setCfg(c => ({ ...c, company_vat_code: e.target.value }))}
                placeholder="ex: RO12345678 sau 12345678"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Codul unic de identificare al firmei tale, cu sau fara prefix RO.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />Seria facturilor
              </label>
              <input
                type="text"
                value={cfg.series_name}
                onChange={e => setCfg(c => ({ ...c, series_name: e.target.value }))}
                placeholder="ex: FACT"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Numele exact al seriei din SmartBill. Testeaza conexiunea pentru a vedea seriile disponibile.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />Cota TVA (optional)
              </label>
              <input
                type="text"
                value={cfg.tax_name}
                onChange={e => setCfg(c => ({ ...c, tax_name: e.target.value }))}
                placeholder="ex: Cota 19% sau lasa gol daca esti neplatitor"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Numele exact al cotei TVA din SmartBill. Lasa gol daca nu esti platitor de TVA.
              </p>
            </div>

            {/* Send email toggle */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-sm font-medium text-foreground">Trimite factura pe email clientului</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Daca clientul a completat email-ul la comanda, SmartBill va trimite factura automat
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCfg(c => ({ ...c, send_email: !c.send_email }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${cfg.send_email ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.send_email ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {/* Test button */}
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !canTest}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {testing ? "Se testeaza..." : "Testeaza conexiunea"}
            </button>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Se salveaza..." : "Salveaza integrarea"}
            </button>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`rounded-xl p-4 border space-y-3 ${testResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className={`flex items-center gap-2 text-sm font-semibold ${testResult.ok ? "text-green-800" : "text-red-800"}`}>
                <CheckCircle className={`h-4 w-4 ${testResult.ok ? "text-green-600" : "text-red-600"}`} />
                {testResult.message}
              </div>
              {testResult.ok && testResult.series && testResult.series.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Serii disponibile:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {testResult.series.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setCfg(c => ({ ...c, series_name: s })); toast.success(`Seria "${s}" selectata.`); }}
                        className="px-2.5 py-1 text-xs font-mono font-semibold bg-white border border-green-300 text-green-800 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {testResult.ok && testResult.taxes && testResult.taxes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Cote TVA disponibile:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {testResult.taxes.map(t => {
                      const name = t.split(" (")[0];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setCfg(c => ({ ...c, tax_name: name })); toast.success(`Cota "${name}" selectata.`); }}
                          className="px-2.5 py-1 text-xs font-mono font-semibold bg-white border border-green-300 text-green-800 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
