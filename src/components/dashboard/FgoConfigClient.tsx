"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ExternalLink } from "lucide-react";
import { saveFgoConfig, disconnectFgo, testFgoConfig } from "@/lib/actions/fgo.actions";
import type { FgoConfig } from "@/lib/fgo";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { selectCls } from "@/lib/ui";

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
    auto_invoice: initialConfig?.auto_invoice ?? false,
    auto_invoice_trigger: initialConfig?.auto_invoice_trigger ?? "confirmed",
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
        <Callout
          variant="success"
          icon={CheckCircle}
          title="fGO activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          CUI: {initialConfig?.cod_unic} · Serie: {initialConfig?.serie}
        </Callout>
      )}

      {/* Sandbox toggle */}
      <Panel className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Mod testare (UAT)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Foloseste serverul de test fGO (<span className="font-mono">api-testuat.fgo.ro</span>)
          </p>
        </div>
        <Switch checked={form.sandbox} onCheckedChange={v => set("sandbox", v)} className="data-checked:bg-warning" />
      </Panel>

      {/* Credentials */}
      <Panel className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Credentiale API</h3>

        <Field label="CUI firma" required hint="Codul fiscal al firmei tale (CUI/CIF)">
          <Input
            type="text"
            value={form.cod_unic}
            onChange={e => set("cod_unic", e.target.value.trim())}
            placeholder="ex: RO12345678"
          />
        </Field>

        <Field label="Cheie privata API" required hint="Gasesti cheia in contul fGO la Setari → Utilizatori API">
          <Input
            type="password"
            value={form.private_key}
            onChange={e => set("private_key", e.target.value.trim())}
            placeholder="Cheia generata in fGO → Setari → Utilizatori"
            className="font-mono"
          />
        </Field>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || !form.cod_unic.trim() || !form.private_key.trim()}
        >
          {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : null}
          {testing ? "Se verifica..." : tested ? "Conexiune reusita" : "Testeaza conexiunea"}
        </Button>
      </Panel>

      {/* Document settings */}
      <Panel className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Setari documente</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serie documente" required hint="Configurata in fGO → Setari → Serii Documente">
            <Input
              type="text"
              value={form.serie}
              onChange={e => set("serie", e.target.value.trim().toUpperCase())}
              placeholder="ex: FCT"
              className="font-mono"
            />
          </Field>

          <Field label="Valuta">
            <select
              aria-label="Valuta"
              value={form.valuta}
              onChange={e => set("valuta", e.target.value)}
              className={selectCls}
            >
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tip factura" hint={'Lasa implicit "Factura" daca nu stii'}>
            <Input
              type="text"
              value={form.tip_factura}
              onChange={e => set("tip_factura", e.target.value)}
              placeholder="Factura"
            />
          </Field>

          <Field label="URL platforma" required hint="URL-ul root al platformei tale">
            <Input
              type="url"
              value={form.platforma_url}
              onChange={e => set("platforma_url", e.target.value.trim())}
              placeholder="https://edinio.com"
            />
          </Field>
        </div>

        {/* Auto-invoice */}
        <div className="mt-1 space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Generare automata factura</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Factura fGO se genereaza automat cand comanda atinge statusul selectat
              </p>
            </div>
            <Switch checked={form.auto_invoice} onCheckedChange={v => set("auto_invoice", v)} />
          </div>
          {form.auto_invoice && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Declanseaza generarea cand comanda devine</label>
              <select aria-label="Declanseaza generarea cand comanda devine" value={form.auto_invoice_trigger ?? "confirmed"} onChange={e => set("auto_invoice_trigger", e.target.value as AutoInvoiceTrigger)}
                className={selectCls}>
                {AUTO_INVOICE_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Daca ai mai multe softuri de facturare cu generare automata, se emite o singura factura (prioritate: SmartBill, apoi Oblio, apoi fGO).
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* How to get credentials */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Cum obtii credentialele fGO?</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Autentifica-te in contul tau fGO</li>
          <li>Mergi la <span className="font-semibold text-foreground">Setari → Utilizatori</span> si genereaza un utilizator API</li>
          <li>Copiaza <span className="font-semibold text-foreground">Cheia privata</span> afisata</li>
          <li>Mergi la <span className="font-semibold text-foreground">Setari → Serii Documente</span> si noteaza seria pentru facturi</li>
        </ol>
        <a
          href="https://fgo.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide fGO
        </a>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Se salveaza..." : "Salveaza configuratia"}
        </Button>
      </div>
    </div>
  );
}
