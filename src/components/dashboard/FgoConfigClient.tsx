"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ExternalLink } from "lucide-react";
import { saveFgoConfig, disconnectFgo, testFgoConfig } from "@/lib/actions/fgo.actions";
import type { FgoConfig } from "@/lib/fgo";

export function FgoConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FgoConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tested, setTested] = useState(false);

  const [form, setForm] = useState<FgoConfig>({
    enabled: initialConfig?.enabled ?? false,
    sandbox: initialConfig?.sandbox ?? false,
    cod_unic: initialConfig?.cod_unic ?? "",
    private_key: initialConfig?.private_key ?? "",
    serie: initialConfig?.serie ?? "",
    platforma_url: initialConfig?.platforma_url ?? "",
    tip_factura: initialConfig?.tip_factura ?? "Factura",
    valuta: initialConfig?.valuta ?? "RON",
  });

  function set(field: keyof FgoConfig, value: string | boolean) {
    setTested(false);
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const isActive = !!(initialConfig?.enabled && initialConfig?.cod_unic && initialConfig?.private_key && initialConfig?.serie);

  async function handleTest() {
    if (!form.cod_unic.trim() || !form.private_key.trim()) {
      toast.error("Completeaza CUI si Cheia privata");
      return;
    }
    setTesting(true);
    const result = await testFgoConfig(form);
    setTesting(false);
    if ("error" in result) {
      toast.error(`Eroare conexiune fGO: ${result.error}`);
    } else {
      setTested(true);
      toast.success(`Conexiune reusita — ${result.judete} judete disponibile`);
    }
  }

  async function handleSave() {
    if (!form.cod_unic.trim()) return toast.error("CUI-ul firmei este obligatoriu");
    if (!form.private_key.trim()) return toast.error("Cheia privata este obligatorie");
    if (!form.serie.trim()) return toast.error("Seria documentelor este obligatorie");
    if (!form.platforma_url.trim()) return toast.error("URL-ul platformei este obligatoriu");

    setSaving(true);
    const result = await saveFgoConfig(businessId, { ...form, enabled: true });
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configuratie fGO salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectFgo(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("fGO deconectat");
      setForm(prev => ({ ...prev, enabled: false, cod_unic: "", private_key: "", serie: "" }));
      setTested(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      {isActive && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">fGO activ</p>
            <p className="text-xs text-green-700">CUI: {initialConfig?.cod_unic} · Serie: {initialConfig?.serie}</p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
            Deconecteaza
          </button>
        </div>
      )}

      {/* Sandbox toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
        <div>
          <p className="text-sm font-semibold text-foreground">Mod testare (UAT)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Foloseste serverul de test fGO (<span className="font-mono">api-testuat.fgo.ro</span>)
          </p>
        </div>
        <button
          type="button"
          onClick={() => set("sandbox", !form.sandbox)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            form.sandbox ? "bg-amber-400" : "bg-muted"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.sandbox ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Credentials */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Credentiale API</h3>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">CUI firma *</label>
          <input
            type="text"
            value={form.cod_unic}
            onChange={e => set("cod_unic", e.target.value.trim())}
            placeholder="ex: RO12345678"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Codul fiscal al firmei tale (CUI/CIF)</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cheie privata API *</label>
          <input
            type="password"
            value={form.private_key}
            onChange={e => set("private_key", e.target.value.trim())}
            placeholder="Cheia generata in fGO → Setari → Utilizatori"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Gasesti cheia in contul fGO la Setari → Utilizatori API
          </p>
        </div>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !form.cod_unic.trim() || !form.private_key.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : tested ? <CheckCircle className="h-4 w-4 text-green-600" /> : null}
          {testing ? "Se verifica..." : tested ? "Conexiune reusita" : "Testeaza conexiunea"}
        </button>
      </div>

      {/* Document settings */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Setari documente</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Serie documente *</label>
            <input
              type="text"
              value={form.serie}
              onChange={e => set("serie", e.target.value.trim().toUpperCase())}
              placeholder="ex: FCT"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Configurata in fGO → Setari → Serii Documente</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valuta</label>
            <select
              value={form.valuta}
              onChange={e => set("valuta", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            >
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tip factura</label>
            <input
              type="text"
              value={form.tip_factura}
              onChange={e => set("tip_factura", e.target.value)}
              placeholder="Factura"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Lasa implicit &quot;Factura&quot; daca nu stii</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">URL platforma *</label>
            <input
              type="url"
              value={form.platforma_url}
              onChange={e => set("platforma_url", e.target.value.trim())}
              placeholder="https://edinio.com"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
            <p className="text-[11px] text-muted-foreground mt-1">URL-ul root al platformei tale</p>
          </div>
        </div>
      </div>

      {/* How to get credentials */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-semibold text-foreground mb-2">Cum obtii credentialele fGO?</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Autentifica-te in contul tau fGO</li>
          <li>Mergi la <span className="font-semibold text-foreground">Setari → Utilizatori</span> si genereaza un utilizator API</li>
          <li>Copiaza <span className="font-semibold text-foreground">Cheia privata</span> afisata</li>
          <li>Mergi la <span className="font-semibold text-foreground">Setari → Serii Documente</span> si noteaza seria pentru facturi</li>
        </ol>
        <a
          href="https://fgo.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide fGO
        </a>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Se salveaza..." : "Salveaza configuratia"}
        </button>
      </div>
    </div>
  );
}
