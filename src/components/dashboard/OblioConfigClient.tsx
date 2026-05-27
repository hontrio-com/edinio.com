"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Loader2, Plug, PlugZap, RefreshCw, Info, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { saveOblioConfig, disconnectOblio, loadOblioAccountData, loadOblioSeriesForCif } from "@/lib/actions/oblio.actions";
import type { OblioConfig } from "@/lib/oblio";

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors";
const selectCls = inputCls + " appearance-none cursor-pointer";

type AccountData = {
  companies: { cif: string; name: string }[];
  series: { type: string; name: string; default: boolean }[];
  vatRates: { name: string; percent: number; default: boolean }[];
};

export default function OblioConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: OblioConfig | null;
}) {
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false);
  const [clientId, setClientId] = useState(initialConfig?.client_id ?? "");
  const [clientSecret, setClientSecret] = useState(initialConfig?.client_secret ?? "");
  const [cif, setCif] = useState(initialConfig?.cif ?? "");
  const [companyName, setCompanyName] = useState(initialConfig?.company_name ?? "");
  const [seriesInvoice, setSeriesInvoice] = useState(initialConfig?.series_invoice ?? "");
  const [seriesProforma, setSeriesProforma] = useState(initialConfig?.series_proforma ?? "");
  const [vatName, setVatName] = useState(initialConfig?.vat_name ?? "Normala");
  const [vatPercentage, setVatPercentage] = useState(initialConfig?.vat_percentage ?? 19);

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [loadError, setLoadError] = useState("");

  const [loading, startLoadTransition] = useTransition();
  const [loadingCif, startLoadCifTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const [disconnecting, startDisconnectTransition] = useTransition();

  const isConnected = !!(initialConfig?.client_id && initialConfig?.cif);
  const invoiceSeries = accountData?.series.filter(s => s.type === "Factura") ?? [];
  const proformaSeries = accountData?.series.filter(s => s.type === "Proforma") ?? [];

  function handleLoad() {
    if (!clientId || !clientSecret) { toast.error("Introdu email-ul si secretul contului Oblio"); return; }
    setLoadError("");
    setAccountData(null);
    startLoadTransition(async () => {
      const result = await loadOblioAccountData(clientId, clientSecret);
      if ("error" in result) {
        setLoadError(result.error);
        toast.error(result.error);
        return;
      }
      setAccountData(result);
      // Auto-select first company
      if (!cif && result.firstCif) {
        const firstCompany = result.companies.find(c => c.cif === result.firstCif);
        setCif(result.firstCif);
        setCompanyName(firstCompany?.name ?? "");
      }
      // Auto-select default invoice series
      const defInvoice = result.series.find(s => s.type === "Factura" && s.default);
      if (defInvoice && !seriesInvoice) setSeriesInvoice(defInvoice.name);
      // Auto-select default proforma series
      const defProforma = result.series.find(s => s.type === "Proforma" && s.default);
      if (defProforma && !seriesProforma) setSeriesProforma(defProforma.name);
      // Auto-select default VAT rate
      const defVat = result.vatRates.find(v => v.default);
      if (defVat) { setVatName(defVat.name); setVatPercentage(defVat.percent); }
      toast.success(`Conexiune reusita! ${result.companies.length} ${result.companies.length === 1 ? "firma" : "firme"} gasite.`);
    });
  }

  function handleCifChange(newCif: string) {
    if (!accountData) return;
    const company = accountData.companies.find(c => c.cif === newCif);
    setCif(newCif);
    setCompanyName(company?.name ?? "");
    // Reload series + VAT for this CIF
    startLoadCifTransition(async () => {
      const result = await loadOblioSeriesForCif(clientId, clientSecret, newCif);
      if ("error" in result) { toast.error(result.error); return; }
      setAccountData(prev => prev ? { ...prev, series: result.series, vatRates: result.vatRates } : prev);
      const defInvoice = result.series.find(s => s.type === "Factura" && s.default);
      if (defInvoice) setSeriesInvoice(defInvoice.name);
      const defProforma = result.series.find(s => s.type === "Proforma" && s.default);
      if (defProforma) setSeriesProforma(defProforma.name);
      const defVat = result.vatRates.find(v => v.default);
      if (defVat) { setVatName(defVat.name); setVatPercentage(defVat.percent); }
    });
  }

  function handleSave() {
    if (!clientId || !clientSecret) { toast.error("Introdu credentialele Oblio"); return; }
    if (!cif) { toast.error("Selecteaza firma"); return; }
    if (!seriesInvoice) { toast.error("Selecteaza seria pentru factura"); return; }

    const config: OblioConfig = {
      enabled,
      client_id: clientId,
      client_secret: clientSecret,
      cif,
      company_name: companyName,
      series_invoice: seriesInvoice,
      series_proforma: seriesProforma,
      vat_name: vatName,
      vat_percentage: vatPercentage,
    };

    startSaveTransition(async () => {
      const result = await saveOblioConfig(businessId, config);
      if ("error" in result) toast.error(result.error);
      else toast.success("Configuratie Oblio salvata");
    });
  }

  function handleDisconnect() {
    startDisconnectTransition(async () => {
      const result = await disconnectOblio(businessId);
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Oblio deconectat");
        setClientId(""); setClientSecret(""); setCif(""); setCompanyName("");
        setSeriesInvoice(""); setSeriesProforma("");
        setAccountData(null); setEnabled(false);
      }
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/features" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <img
          src="/integrations/oblio.webp"
          alt="Oblio"
          className="h-6 w-auto object-contain"
          style={{ filter: "invert(1)" }}
        />
        {isConnected && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle className="h-3 w-3" />Activ
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Info */}
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Despre Oblio</p>
              <p className="text-xs text-muted-foreground">
                Oblio este o platforma romaneasca de facturare online. Integrarea permite generarea automata de facturi si proforme
                direct din comenzile magazinului tau.
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5 mt-1">
                <li><strong>client_id</strong> = email-ul cu care te autentifici in Oblio</li>
                <li><strong>client_secret</strong> = token-ul din <strong>Setari &gt; Date Cont</strong></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
          <div>
            <p className="text-sm font-medium text-foreground">Activat</p>
            <p className="text-xs text-muted-foreground">Permite generarea documentelor Oblio din comenzi</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Credentials */}
        <div className="p-5 rounded-xl border border-border bg-surface space-y-4">
          <p className="text-sm font-semibold text-foreground">Credentiale API</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email cont Oblio (client_id) *</label>
              <input
                type="email"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="email@exemplu.ro"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Token secret (client_secret) *</label>
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="Token din Setari > Date Cont"
                className={inputCls}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleLoad}
            disabled={loading || !clientId || !clientSecret}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Testeaza si incarca date
          </button>

          {loadError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</p>
          )}
        </div>

        {/* Company + Series + VAT — shown after data loaded or if already configured */}
        {(accountData || isConnected) && (
          <div className="p-5 rounded-xl border border-border bg-surface space-y-4">
            <p className="text-sm font-semibold text-foreground">Configurare firma si documente</p>

            {/* Company selector */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Firma *</label>
              {accountData && accountData.companies.length > 1 ? (
                <div className="relative">
                  <select
                    value={cif}
                    onChange={e => handleCifChange(e.target.value)}
                    className={selectCls}
                    disabled={loadingCif}
                  >
                    {accountData.companies.map(c => (
                      <option key={c.cif} value={c.cif}>{c.name} ({c.cif})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={cif ? `${companyName} (${cif})` : cif}
                  readOnly
                  className={inputCls + " bg-muted/40"}
                  placeholder="CIF firma"
                />
              )}
            </div>

            {/* Invoice series */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Serie factura *</label>
              {accountData && invoiceSeries.length > 0 ? (
                <div className="relative">
                  <select value={seriesInvoice} onChange={e => setSeriesInvoice(e.target.value)} className={selectCls}>
                    <option value="">-- Selecteaza --</option>
                    {invoiceSeries.map(s => (
                      <option key={s.name} value={s.name}>{s.name}{s.default ? " (implicita)" : ""}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              ) : (
                <input type="text" value={seriesInvoice} onChange={e => setSeriesInvoice(e.target.value)} placeholder="ex: FCT" className={inputCls} />
              )}
            </div>

            {/* Proforma series */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Serie proforma</label>
              {accountData && proformaSeries.length > 0 ? (
                <div className="relative">
                  <select value={seriesProforma} onChange={e => setSeriesProforma(e.target.value)} className={selectCls}>
                    <option value="">-- Fara proforma --</option>
                    {proformaSeries.map(s => (
                      <option key={s.name} value={s.name}>{s.name}{s.default ? " (implicita)" : ""}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              ) : (
                <input type="text" value={seriesProforma} onChange={e => setSeriesProforma(e.target.value)} placeholder="ex: PR (optional)" className={inputCls} />
              )}
            </div>

            {/* VAT rate */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Cota TVA implicita</label>
              {accountData && accountData.vatRates.length > 0 ? (
                <div className="relative">
                  <select
                    value={vatName}
                    onChange={e => {
                      const selected = accountData.vatRates.find(v => v.name === e.target.value);
                      setVatName(e.target.value);
                      if (selected) setVatPercentage(selected.percent);
                    }}
                    className={selectCls}
                  >
                    {accountData.vatRates.map(v => (
                      <option key={v.name} value={v.name}>{v.name} ({v.percent}%){v.default ? " — implicita" : ""}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" value={vatName} onChange={e => setVatName(e.target.value)} placeholder="Normala" className={inputCls} />
                  <input type="number" value={vatPercentage} onChange={e => setVatPercentage(Number(e.target.value))} placeholder="19" className={inputCls} style={{ maxWidth: 80 }} />
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Folosita la generarea facturilor daca nu este specificata per produs. Cota va fi aplicata conform setarilor de TVA ale magazinului.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Salveaza
          </button>

          {isConnected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Deconecteaza
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
