"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ChevronRight, ExternalLink } from "lucide-react";
import {
  saveDpdConfig,
  disconnectDpd,
  loadDpdAccountAction,
} from "@/lib/actions/dpd.actions";
import type { DpdConfig } from "@/lib/dpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

export function DpdConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: DpdConfig | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState(initialConfig?.password ?? "");
  const [clientId, setClientId] = useState<number | null>(initialConfig?.client_id ?? null);
  const [clientName, setClientName] = useState("");
  const [international, setInternational] = useState(initialConfig?.international_enabled ?? false);
  const [useWeight, setUseWeight] = useState(initialConfig?.use_product_weight ?? false);
  const [iban, setIban] = useState(initialConfig?.iban ?? "");
  const [accountHolder, setAccountHolder] = useState(initialConfig?.account_holder ?? "");
  const [declaredValue, setDeclaredValue] = useState(initialConfig?.declared_value_enabled ?? false);
  const [obpd, setObpd] = useState<"" | "OPEN" | "TEST">(initialConfig?.open_before_delivery ?? "");
  const [obpdPayer, setObpdPayer] = useState<"SENDER" | "RECIPIENT">(initialConfig?.obpd_payer ?? "SENDER");

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completeaza username-ul DPD");
    if (!password.trim()) return toast.error("Completeaza parola DPD");

    setLoading(true);
    const result = await loadDpdAccountAction(username.trim(), password.trim());
    setLoading(false);

    if ("error" in result) {
      toast.error(`Eroare DPD: ${result.error}`);
      return;
    }

    setClientId(result.clientId);
    setClientName(result.name);
    toast.success(`Cont DPD conectat — Client ID: ${result.clientId}`);
  }

  async function handleSave() {
    if (!clientId) return toast.error("Conecteaza-te mai intai pentru a obtine Client ID");

    const config: DpdConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      client_id: clientId,
      international_enabled: international,
      use_product_weight: useWeight,
      iban: iban.trim() || undefined,
      account_holder: accountHolder.trim() || undefined,
      declared_value_enabled: declaredValue,
      open_before_delivery: obpd,
      obpd_payer: obpdPayer,
    };

    setSaving(true);
    const result = await saveDpdConfig(businessId, config);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configuratie DPD salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectDpd(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("DPD deconectat");
      setClientId(null);
      setClientName("");
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
          title="DPD activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          {initialConfig?.username} · Client ID {initialConfig?.client_id}
        </Callout>
      )}

      {/* Credentials */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</span>
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont DPD</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" required>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="user@firma.ro"
            />
          </Field>
          <Field label="Parola" required>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola contului DPD"
            />
          </Field>
        </div>

        <Button
          onClick={handleConnect}
          disabled={loading || !username.trim() || !password.trim()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {loading ? "Se conecteaza..." : "Testeaza si conecteaza"}
        </Button>

        {clientId && (
          <p className="rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs font-semibold text-success">
            Conectat ca: {clientName || "DPD Client"} (ID: {clientId})
          </p>
        )}
      </Panel>

      {/* Cont bancar pentru ramburs */}
      {clientId && (
        <Panel className="space-y-3 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Cont bancar (ramburs)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Necesar pentru comenzile cu plata la livrare — DPD returneaza aici banii incasati de la clienti.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="IBAN">
              <Input type="text" value={iban} onChange={e => setIban(e.target.value)}
                placeholder="RO00 BANK 0000 0000 0000 0000" />
            </Field>
            <Field label="Titular cont">
              <Input type="text" value={accountHolder} onChange={e => setAccountHolder(e.target.value)}
                placeholder="Numele firmei" />
            </Field>
          </div>
        </Panel>
      )}

      {/* International (EU) */}
      {clientId && (
        <Panel className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Livrare internationala (UE)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Permite comenzi catre tarile UE. Clientul alege tara la checkout, iar pretul livrarii se calculeaza live prin DPD.</p>
            </div>
            <Switch checked={international} onCheckedChange={setInternational} />
          </div>
          {international && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t border-border pt-3">
              <input type="checkbox" checked={useWeight} onChange={e => setUseWeight(e.target.checked)}
                className="mt-0.5 rounded border-border accent-primary" />
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Calculeaza dupa greutatea reala a produselor.</span> Pretul livrarii internationale se ia din greutatea setata pe fiecare produs. Daca e oprit, se foloseste o estimare de 1kg.
              </span>
            </label>
          )}
        </Panel>
      )}

      {/* Optiuni expediere */}
      {clientId && (
        <Panel className="space-y-4 p-4">
          <p className="text-sm font-semibold text-foreground">Optiuni expediere</p>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={declaredValue}
              onChange={e => setDeclaredValue(e.target.checked)}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Asigurare (valoare declarata).</span>{" "}
              Fiecare AWB se asigura pentru valoarea produselor din comanda. DPD percepe o prima de asigurare conform contractului.
            </span>
          </label>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-foreground mb-1.5">Deschidere / testare la livrare (OBPD)</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Destinatarul poate deschide sau testa coletul inainte de plata. Se aplica doar livrarilor la adresa (nu la punctele de ridicare).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <select
                aria-label="Optiune OBPD"
                value={obpd}
                onChange={e => setObpd(e.target.value as "" | "OPEN" | "TEST")}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Dezactivat</option>
                <option value="OPEN">Deschidere colet (OPEN)</option>
                <option value="TEST">Testare produs (TEST)</option>
              </select>
              {obpd && (
                <select
                  aria-label="Platitor retur OBPD"
                  value={obpdPayer}
                  onChange={e => setObpdPayer(e.target.value as "SENDER" | "RECIPIENT")}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="SENDER">Retur platit de expeditor</option>
                  <option value="RECIPIENT">Retur platit de destinatar</option>
                </select>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Save */}
      {clientId && (
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza configuratia"}
          </Button>
        </div>
      )}

      {/* Help */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Cum obtii credentialele DPD?</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Contacteaza DPD Romania pentru activarea accesului API (myDPD Business)</li>
          <li>Vei primi un username si parola pentru API</li>
          <li>Introdu credentialele si apasa &quot;Testeaza si conecteaza&quot;</li>
        </ol>
        <a
          href="https://api.dpd.ro/api/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Documentatie API DPD
        </a>
      </div>
    </div>
  );
}
