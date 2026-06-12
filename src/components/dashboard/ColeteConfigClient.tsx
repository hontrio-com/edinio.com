"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Loader2, Plug, PlugZap, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { saveCOConfig, disconnectCO, testCOConnection } from "@/lib/actions/colete.actions";
import type { COConfig, COSender } from "@/lib/colete";

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors";

const DEFAULT_SENDER: COSender = {
  name: "",
  phone: "",
  email: "",
  company: "",
  county: "",
  city: "",
  postal_code: "",
  street: "",
  street_number: "",
};

export default function ColeteConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: COConfig | null;
}) {
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false);
  const [sandbox, setSandbox] = useState(initialConfig?.sandbox ?? false);
  const [clientId, setClientId] = useState(initialConfig?.client_id ?? "");
  const [clientSecret, setClientSecret] = useState(initialConfig?.client_secret ?? "");
  const [sender, setSender] = useState<COSender>(initialConfig?.sender ?? DEFAULT_SENDER);
  const [testResult, setTestResult] = useState<{ balance?: number; bonus?: number; error?: string } | null>(null);
  const [testing, startTestTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const [disconnecting, startDisconnectTransition] = useTransition();

  const isConnected = !!(initialConfig?.client_id && initialConfig?.client_secret);

  function updateSender(key: keyof COSender, value: string) {
    setSender(prev => ({ ...prev, [key]: value }));
  }

  function handleTest() {
    if (!clientId || !clientSecret) { toast.error("Introdu Client ID si Client Secret"); return; }
    startTestTransition(async () => {
      setTestResult(null);
      const result = await testCOConnection(clientId, clientSecret, sandbox);
      if ("error" in result) {
        setTestResult({ error: result.error });
        toast.error(result.error);
      } else {
        setTestResult({ balance: result.balance, bonus: result.bonus });
        toast.success("Conexiune reusita!");
      }
    });
  }

  function handleSave() {
    if (!clientId || !clientSecret) { toast.error("Client ID si Client Secret sunt obligatorii"); return; }
    if (!sender.name || !sender.phone) { toast.error("Numele si telefonul expeditorului sunt obligatorii"); return; }
    if (!sender.county || !sender.city || !sender.postal_code || !sender.street || !sender.street_number) {
      toast.error("Adresa expeditorului este incompleta"); return;
    }
    const config: COConfig = { enabled, sandbox, client_id: clientId, client_secret: clientSecret, sender };
    startSaveTransition(async () => {
      const result = await saveCOConfig(businessId, config);
      if ("error" in result) toast.error(result.error);
      else toast.success("Configuratie salvata");
    });
  }

  function handleDisconnect() {
    startDisconnectTransition(async () => {
      const result = await disconnectCO(businessId);
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Colete Online deconectat");
        setClientId(""); setClientSecret("");
        setSender(DEFAULT_SENDER);
        setEnabled(false);
      }
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="colete" description="Genereaza AWB-uri Colete Online direct din comenzile magazinului tau." />

      <div className="space-y-4">
        {/* Info */}
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Despre Colete Online</p>
              <p className="text-xs text-muted-foreground">
                Colete Online este o platforma agregator de curierat care ofera acces la DPD, Cargus, SameDay, TNT si altii
                printr-un singur API. Credentialele API (Client ID si Client Secret) sunt furnizate de echipa Colete Online
                la cerere.
              </p>
              <a
                href="https://www.colete-online.ro"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                Solicita acces API
              </a>
            </div>
          </div>
        </div>

        {/* Main config */}
        <div className="p-5 rounded-xl border border-border bg-surface space-y-5">
          <p className="text-sm font-semibold text-foreground">Configurare integrare</p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Activat</p>
              <p className="text-xs text-muted-foreground">Permite crearea AWB-urilor prin Colete Online</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Sandbox toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Mod test (Staging)</p>
              <p className="text-xs text-muted-foreground">Foloseste serverul de test (comenzile nu sunt reale)</p>
            </div>
            <button
              type="button"
              onClick={() => setSandbox(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${sandbox ? "bg-amber-500" : "bg-muted-foreground/30"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${sandbox ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Credentials */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credentiale API</p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Client ID furnizat de Colete Online"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="Client Secret furnizat de Colete Online"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !clientId || !clientSecret}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Testeaza conexiunea
            </button>
            {testResult && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${testResult.error ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                {testResult.error ? testResult.error : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Conexiune reusita — Sold: {testResult.balance?.toFixed(2)} RON
                    {(testResult.bonus ?? 0) > 0 && ` + ${testResult.bonus?.toFixed(2)} RON bonus`}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sender address */}
        <div className="p-5 rounded-xl border border-border bg-surface space-y-4">
          <p className="text-sm font-semibold text-foreground">Adresa expeditor (sender)</p>
          <p className="text-xs text-muted-foreground">Aceasta adresa va fi folosita ca punct de ridicare pentru toate coletele.</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nume contact *</label>
              <input type="text" value={sender.name} onChange={e => updateSender("name", e.target.value)} placeholder="Ion Popescu" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon *</label>
              <input type="text" value={sender.phone} onChange={e => updateSender("phone", e.target.value)} placeholder="+40722000000" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input type="email" value={sender.email ?? ""} onChange={e => updateSender("email", e.target.value)} placeholder="contact@firma.ro" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Firma</label>
              <input type="text" value={sender.company ?? ""} onChange={e => updateSender("company", e.target.value)} placeholder="Firma SRL" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Judet *</label>
              <input type="text" value={sender.county} onChange={e => updateSender("county", e.target.value)} placeholder="Cluj" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Oras/Localitate *</label>
              <input type="text" value={sender.city} onChange={e => updateSender("city", e.target.value)} placeholder="Cluj-Napoca" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Strada *</label>
              <input type="text" value={sender.street} onChange={e => updateSender("street", e.target.value)} placeholder="Strada Eroilor" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Numar *</label>
              <input type="text" value={sender.street_number} onChange={e => updateSender("street_number", e.target.value)} placeholder="10A" className={inputCls} />
            </div>
          </div>

          <div className="w-40">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Cod postal *</label>
            <input type="text" value={sender.postal_code} onChange={e => updateSender("postal_code", e.target.value)} placeholder="400001" className={inputCls} />
          </div>
        </div>

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
