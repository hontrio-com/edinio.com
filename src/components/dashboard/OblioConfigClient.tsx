"use client";

import { useState, useTransition } from "react";
import { Loader2, Plug, PlugZap, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { saveOblioConfig, disconnectOblio, loadOblioAccountData, loadOblioSeriesForCif } from "@/lib/actions/oblio.actions";
import type { OblioConfig } from "@/lib/oblio";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/ui/panel";
import { selectCls } from "@/lib/ui";

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
  const [autoInvoice, setAutoInvoice] = useState(initialConfig?.auto_invoice ?? false);
  const [autoInvoiceTrigger, setAutoInvoiceTrigger] = useState<AutoInvoiceTrigger>(initialConfig?.auto_invoice_trigger ?? "confirmed");
  const [productType, setProductType] = useState(initialConfig?.product_type ?? "Marfa");
  const [dueDays, setDueDays] = useState(initialConfig?.due_days ?? 0);
  const [sendToSpv, setSendToSpv] = useState(initialConfig?.send_to_spv ?? false);

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
      auto_invoice: autoInvoice,
      auto_invoice_trigger: autoInvoiceTrigger,
      product_type: productType,
      due_days: dueDays,
      send_to_spv: sendToSpv,
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
      <IntegrationHeader id="oblio" description="Genereaza automat facturi Oblio pentru comenzile din magazinul tau." />

      <div className="space-y-4">
        {/* Info */}
        <Panel className="p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Despre Oblio</p>
              <p className="text-xs text-muted-foreground">
                Oblio este o platforma romaneasca de facturare online. Integrarea permite generarea automata de facturi si proforme
                direct din comenzile magazinului tau.
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                <li><strong>client_id</strong> = email-ul cu care te autentifici in Oblio</li>
                <li><strong>client_secret</strong> = token-ul din <strong>Setari &gt; Date Cont</strong></li>
              </ul>
            </div>
          </div>
        </Panel>

        {/* Enable toggle */}
        <Panel className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Activat</p>
            <p className="text-xs text-muted-foreground">Permite generarea documentelor Oblio din comenzi</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Panel>

        {/* Credentials */}
        <Panel className="space-y-4 p-5">
          <p className="text-sm font-semibold text-foreground">Credentiale API</p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email cont Oblio (client_id) *</label>
              <Input
                type="email"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="email@exemplu.ro"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Token secret (client_secret) *</label>
              <Input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="Token din Setari > Date Cont"
              />
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLoad}
            disabled={loading || !clientId || !clientSecret}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Testeaza si incarca date
          </Button>

          {loadError && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{loadError}</p>
          )}
        </Panel>

        {/* Company + Series + VAT — shown after data loaded or if already configured */}
        {(accountData || isConnected) && (
          <Panel className="space-y-4 p-5">
            <p className="text-sm font-semibold text-foreground">Configurare firma si documente</p>

            {/* Company selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Firma *</label>
              {accountData && accountData.companies.length > 1 ? (
                <select
                  aria-label="Firma"
                  value={cif}
                  onChange={e => handleCifChange(e.target.value)}
                  className={selectCls}
                  disabled={loadingCif}
                >
                  {accountData.companies.map(c => (
                    <option key={c.cif} value={c.cif}>{c.name} ({c.cif})</option>
                  ))}
                </select>
              ) : (
                <Input
                  type="text"
                  value={cif ? `${companyName} (${cif})` : cif}
                  readOnly
                  className="bg-muted/40"
                  placeholder="CIF firma"
                />
              )}
            </div>

            {/* Invoice series */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Serie factura *</label>
              {accountData && invoiceSeries.length > 0 ? (
                <select aria-label="Serie factura" value={seriesInvoice} onChange={e => setSeriesInvoice(e.target.value)} className={selectCls}>
                  <option value="">-- Selecteaza --</option>
                  {invoiceSeries.map(s => (
                    <option key={s.name} value={s.name}>{s.name}{s.default ? " (implicita)" : ""}</option>
                  ))}
                </select>
              ) : (
                <Input type="text" value={seriesInvoice} onChange={e => setSeriesInvoice(e.target.value)} placeholder="ex: FCT" />
              )}
            </div>

            {/* Proforma series */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Serie proforma</label>
              {accountData && proformaSeries.length > 0 ? (
                <select aria-label="Serie proforma" value={seriesProforma} onChange={e => setSeriesProforma(e.target.value)} className={selectCls}>
                  <option value="">-- Fara proforma --</option>
                  {proformaSeries.map(s => (
                    <option key={s.name} value={s.name}>{s.name}{s.default ? " (implicita)" : ""}</option>
                  ))}
                </select>
              ) : (
                <Input type="text" value={seriesProforma} onChange={e => setSeriesProforma(e.target.value)} placeholder="ex: PR (optional)" />
              )}
            </div>

            {/* VAT rate */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Cota TVA implicita</label>
              {accountData && accountData.vatRates.length > 0 ? (
                <select
                  aria-label="Cota TVA implicita"
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
              ) : (
                <div className="flex gap-2">
                  <Input type="text" value={vatName} onChange={e => setVatName(e.target.value)} placeholder="Normala" />
                  <Input type="number" value={vatPercentage} onChange={e => setVatPercentage(Number(e.target.value))} placeholder="19" className="max-w-20" />
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Folosita la generarea facturilor daca nu este specificata per produs. Cota va fi aplicata conform setarilor de TVA ale magazinului.
              </p>
            </div>
          </Panel>
        )}

        {/* Optiuni document */}
        {(accountData || isConnected) && (
          <Panel className="space-y-4 p-5">
            <p className="text-sm font-semibold text-foreground">Optiuni document</p>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tip produse</label>
              <select aria-label="Tip produse" value={productType} onChange={e => setProductType(e.target.value)} className={selectCls}>
                {["Marfa", "Serviciu", "Produs finit", "Semifabricate", "Materii prime", "Materiale consumabile", "Ambalaje", "Obiecte de inventar"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Tipul liniilor de produs pe factura. Pentru magazine cu produse fizice, alege „Marfa". Transportul ramane „Serviciu".
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Scadenta factura (zile)</label>
              <Input type="number" min={0} max={120} value={dueDays || ""}
                onChange={e => setDueDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                placeholder="0 = fara scadenta" />
              <p className="mt-1 text-xs text-muted-foreground">Numarul de zile de la emitere pana la scadenta. Lasa gol pentru data emiterii.</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Trimite in SPV (e-Factura)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trimite automat factura in SPV daca trimiterea automata e activata in contul tau Oblio
                </p>
              </div>
              <Switch checked={sendToSpv} onCheckedChange={setSendToSpv} />
            </div>
          </Panel>
        )}

        {/* Auto-invoice */}
        {(accountData || isConnected) && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Generare automata factura</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Factura Oblio se genereaza automat cand comanda atinge statusul selectat
                </p>
              </div>
              <Switch checked={autoInvoice} onCheckedChange={setAutoInvoice} />
            </div>
            {autoInvoice && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Declanseaza generarea cand comanda devine</label>
                <select aria-label="Declanseaza generarea cand comanda devine" value={autoInvoiceTrigger} onChange={e => setAutoInvoiceTrigger(e.target.value as AutoInvoiceTrigger)} className={selectCls}>
                  {AUTO_INVOICE_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Daca ai mai multe softuri de facturare cu generare automata, se emite o singura factura (prioritate: SmartBill, apoi Oblio, apoi fGO).
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <PlugZap />}
            Salveaza
          </Button>

          {isConnected && (
            <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Plug />}
              Deconecteaza
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
