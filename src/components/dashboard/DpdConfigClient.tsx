"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, ChevronRight, ExternalLink } from "lucide-react";
import {
  saveDpdConfig,
  disconnectDpd,
  loadDpdAccountAction,
  verificaSediuDpdAction,
} from "@/lib/actions/dpd.actions";
import type { DpdConfig, DpdObiect } from "@/lib/dpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

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
  const [obiecte, setObiecte] = useState<DpdObiect[]>([]);
  const [clientIdManual, setClientIdManual] = useState("");
  const [verificSediu, setVerificSediu] = useState(false);
  const [international, setInternational] = useState(initialConfig?.international_enabled ?? false);
  const [iban, setIban] = useState(initialConfig?.iban ?? "");
  const [accountHolder, setAccountHolder] = useState(initialConfig?.account_holder ?? "");
  const [declaredValue, setDeclaredValue] = useState(initialConfig?.declared_value_enabled ?? false);
  const [obpd, setObpd] = useState<"" | "OPEN" | "TEST">(initialConfig?.open_before_delivery ?? "");
  const [obpdPayer, setObpdPayer] = useState<"SENDER" | "RECIPIENT">(initialConfig?.obpd_payer ?? "SENDER");

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completeaza username-ul DPD");
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) return toast.error("Completeaza parola DPD");

    setLoading(true);
    const result = await loadDpdAccountAction(businessId, username.trim(), password.trim());
    setLoading(false);

    if ("error" in result) {
      toast.error(`Eroare DPD: ${result.error}`);
      return;
    }

    /*
     * ⚠ Un cont DPD poate vedea mai multe obiecte (sedii) din acelasi contract, iar `/client`
     * intoarce doar pe cel implicit. Daca obiectul salvat e printre ele, il pastram; altfel
     * pornim de la cel implicit, iar omul il schimba din lista.
     */
    const salvat = initialConfig?.client_id;
    const ales = result.obiecte.find((o) => o.clientId === salvat) ?? result.obiecte.find((o) => o.clientId === result.clientId);
    setObiecte(result.obiecte);
    setClientId(ales?.clientId ?? result.clientId);
    setClientName(ales ? numeObiect(ales) : result.name);
    toast.success(result.obiecte.length > 1
      ? `Cont DPD conectat · ${result.obiecte.length} sedii in contract, alege-l pe al tau`
      : `Cont DPD conectat · Client ID: ${result.clientId}`);
  }

  async function handleSave() {
    if (!clientId) return toast.error("Conecteaza-te mai intai pentru a obtine Client ID");

    const config: DpdConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      client_id: clientId,
      international_enabled: international,
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
      setObiecte([]);
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
            <ButonDeconectare
              nume="DPD"
              cePierzi="Se șterge toată configurarea DPD din Edinio: username, parolă, Client ID-ul, contul bancar pentru ramburs și opțiunile de expediere. Ca să te întorci, le ceri din nou din contul tău DPD; AWB-urile deja emise rămân pe comenzi."
              pending={disconnecting}
              onConfirma={handleDisconnect}
            />
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
              placeholder={secretulEsteSalvat(initialConfig, "password") ? PLACEHOLDER_SECRET_SALVAT : "Parola contului DPD"}
            />
          </Field>
        </div>

        <Button
          onClick={handleConnect}
          disabled={loading || !username.trim() || (!password.trim() && !secretulEsteSalvat(initialConfig, "password"))}
        >
          {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {loading ? "Se conecteaza..." : "Testeaza si conecteaza"}
        </Button>

        {clientId && (
          <p className="rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs font-semibold text-success">
            Conectat ca: {clientName || "DPD Client"} (ID: {clientId})
          </p>
        )}

        {clientId && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Ai primit de la DPD un Client ID pentru firma ta?</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Daca firma ta nu apare mai sus, scrie aici Client ID-ul dat de DPD. Il verificam la DPD inainte sa-l folosim.
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                value={clientIdManual}
                onChange={e => setClientIdManual(e.target.value.replace(/\D/g, ""))}
                placeholder="ex: 50929196001"
              />
              <Button
                variant="outline"
                disabled={verificSediu || !clientIdManual}
                onClick={async () => {
                  setVerificSediu(true);
                  const r = await verificaSediuDpdAction(businessId, username.trim(), password.trim(), Number(clientIdManual));
                  setVerificSediu(false);
                  if ("error" in r) return toast.error(r.error);
                  setObiecte((prev) => prev.some((o) => o.clientId === r.obiect.clientId) ? prev : [...prev, r.obiect]);
                  setClientId(r.obiect.clientId);
                  setClientName(numeObiect(r.obiect));
                  setClientIdManual("");
                  toast.success(`Sediu verificat: ${numeObiect(r.obiect)}. Apasa „Salveaza configuratia".`);
                }}
              >
                {verificSediu ? <Loader2 className="animate-spin" /> : null}
                Foloseste
              </Button>
            </div>
          </div>
        )}

        {obiecte.length > 1 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Sediul expeditor</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Contul tau DPD vede mai multe sedii din acelasi contract. Alege firma ta: pe ea se emit AWB-urile, de acolo se ridica coletele si in contul ei se vireaza rambursul.
            </p>
            <select
              aria-label="Sediul expeditor DPD"
              value={clientId ?? ""}
              onChange={e => {
                const o = obiecte.find((x) => x.clientId === Number(e.target.value));
                if (o) { setClientId(o.clientId); setClientName(numeObiect(o)); }
              }}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
            >
              {obiecte.map((o) => (
                <option key={o.clientId} value={o.clientId}>
                  {numeObiect(o)}{o.address ? ` · ${o.address}` : ""} (ID {o.clientId})
                </option>
              ))}
            </select>
          </div>
        )}
      </Panel>

      {/* Cont bancar pentru ramburs */}
      {clientId && (
        <Panel className="space-y-3 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Cont bancar (ramburs)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Optional. Lasa gol daca IBAN-ul este deja in contractul tau DPD: rambursul ajunge acolo. Completeaza doar daca vrei banii incasati intr-un alt cont.</p>
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
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              Pretul livrarii se calculeaza din greutatea setata pe fiecare produs, inmultita cu
              bucatile din cos. Produsele fara greutate completata intra cu o estimare de 1 kg pe colet.
            </p>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

/** „Firma · Obiect", fara repetitie cand obiectul poarta chiar numele firmei. */
function numeObiect(o: DpdObiect): string {
  const obiect = o.objectName.trim();
  return obiect && obiect !== o.name.trim() ? `${o.name} · ${obiect}` : o.name || obiect || "DPD Client";
}
