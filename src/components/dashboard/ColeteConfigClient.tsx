"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Loader2, Plug, PlugZap, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { saveCOConfig, disconnectCO, testCOConnection } from "@/lib/actions/colete.actions";
import type { COConfig, COSender } from "@/lib/colete";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/ui/panel";

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
  const [insuranceEnabled, setInsuranceEnabled] = useState(initialConfig?.insurance_enabled ?? false);
  const [repaymentType, setRepaymentType] = useState<"cash" | "bank">(initialConfig?.repayment_type ?? "cash");
  const [repaymentIban, setRepaymentIban] = useState(initialConfig?.repayment_iban ?? "");
  const [repaymentHolder, setRepaymentHolder] = useState(initialConfig?.repayment_holder ?? "");
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
    if (repaymentType === "bank" && !repaymentIban.trim()) {
      toast.error("Introdu IBAN-ul pentru rambursul in cont"); return;
    }
    const config: COConfig = {
      enabled, sandbox, client_id: clientId, client_secret: clientSecret, sender,
      insurance_enabled: insuranceEnabled,
      repayment_type: repaymentType,
      repayment_iban: repaymentIban.trim() || undefined,
      repayment_holder: repaymentHolder.trim() || undefined,
    };
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
        <Panel className="p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Despre Colete Online</p>
              <p className="text-xs text-muted-foreground">
                Colete Online este o platforma agregator de curierat care ofera acces la DPD, Cargus, SameDay, TNT si altii
                printr-un singur API. Credentialele API (Client ID si Client Secret) sunt furnizate de echipa Colete Online
                la cerere.
              </p>
              <a
                href="https://www.colete-online.ro"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-primary hover:underline"
              >
                Solicita acces API
              </a>
            </div>
          </div>
        </Panel>

        {/* Main config */}
        <Panel className="space-y-5 p-5">
          <p className="text-sm font-semibold text-foreground">Configurare integrare</p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between border-b border-border py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Activat</p>
              <p className="text-xs text-muted-foreground">Permite crearea AWB-urilor prin Colete Online</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Sandbox toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Mod test (Staging)</p>
              <p className="text-xs text-muted-foreground">Foloseste serverul de test (comenzile nu sunt reale)</p>
            </div>
            <Switch checked={sandbox} onCheckedChange={setSandbox} className="data-checked:bg-warning" />
          </div>

          {/* Credentials */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Credentiale API</p>
            <Field label="Client ID">
              <Input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Client ID furnizat de Colete Online"
              />
            </Field>
            <Field label="Client Secret">
              <Input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="Client Secret furnizat de Colete Online"
              />
            </Field>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !clientId || !clientSecret}
            >
              {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Testeaza conexiunea
            </Button>
            {testResult && (
              <div className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs",
                testResult.error
                  ? "border border-destructive/20 bg-destructive/5 text-destructive"
                  : "border border-success/20 bg-success/5 text-success"
              )}>
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
        </Panel>

        {/* Sender address */}
        <Panel className="space-y-4 p-5">
          <p className="text-sm font-semibold text-foreground">Adresa expeditor (sender)</p>
          <p className="text-xs text-muted-foreground">Aceasta adresa va fi folosita ca punct de ridicare pentru toate coletele.</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nume contact" required>
              <Input type="text" value={sender.name} onChange={e => updateSender("name", e.target.value)} placeholder="Ion Popescu" />
            </Field>
            <Field label="Telefon" required>
              <Input type="text" value={sender.phone} onChange={e => updateSender("phone", e.target.value)} placeholder="+40722000000" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={sender.email ?? ""} onChange={e => updateSender("email", e.target.value)} placeholder="contact@firma.ro" />
            </Field>
            <Field label="Firma">
              <Input type="text" value={sender.company ?? ""} onChange={e => updateSender("company", e.target.value)} placeholder="Firma SRL" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Judet" required>
              <Input type="text" value={sender.county} onChange={e => updateSender("county", e.target.value)} placeholder="Cluj" />
            </Field>
            <Field label="Oras/Localitate" required>
              <Input type="text" value={sender.city} onChange={e => updateSender("city", e.target.value)} placeholder="Cluj-Napoca" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Strada" required className="col-span-2">
              <Input type="text" value={sender.street} onChange={e => updateSender("street", e.target.value)} placeholder="Strada Eroilor" />
            </Field>
            <Field label="Numar" required>
              <Input type="text" value={sender.street_number} onChange={e => updateSender("street_number", e.target.value)} placeholder="10A" />
            </Field>
          </div>

          <Field label="Cod postal" required className="w-40">
            <Input type="text" value={sender.postal_code} onChange={e => updateSender("postal_code", e.target.value)} placeholder="400001" />
          </Field>
        </Panel>

        {/* Optiuni expediere */}
        <Panel className="space-y-4 p-4">
          <p className="text-sm font-medium text-foreground">Optiuni expediere</p>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={insuranceEnabled}
              onChange={e => setInsuranceEnabled(e.target.checked)}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Asigurare (valoare declarata).</span>{" "}
              Fiecare AWB se asigura pentru valoarea produselor din comanda. Prima de asigurare apare in pret.
            </span>
          </label>

          <Field label="Incasare ramburs">
            <div className="flex gap-2">
              {([["cash", "Numerar la curier"], ["bank", "In cont bancar"]] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setRepaymentType(kind)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    repaymentType === kind
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {repaymentType === "bank" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="IBAN" required>
                <Input type="text" value={repaymentIban} onChange={e => setRepaymentIban(e.target.value)} placeholder="RO49AAAA1B31007593840000" />
              </Field>
              <Field label="Titular cont">
                <Input type="text" value={repaymentHolder} onChange={e => setRepaymentHolder(e.target.value)} placeholder="Firma SRL" />
              </Field>
            </div>
          )}
        </Panel>

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
