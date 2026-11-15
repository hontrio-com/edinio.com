"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, CheckCircle, ChevronRight, ExternalLink, KeyRound, Loader2, Truck } from "lucide-react";
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
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
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

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { username, password, clientId, international, iban, accountHolder, declaredValue, obpd, obpdPayer };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setClientId(reper.clientId);
    setInternational(reper.international); setIban(reper.iban); setAccountHolder(reper.accountHolder);
    setDeclaredValue(reper.declaredValue); setObpd(reper.obpd); setObpdPayer(reper.obpdPayer);
  }

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completează username-ul DPD.");
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) return toast.error("Completează parola DPD.");

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
      ? `Cont DPD conectat: ${result.obiecte.length} sedii în contract, alege-l pe al tău.`
      : `Cont DPD conectat, Client ID: ${result.clientId}.`);
  }

  async function handleSave() {
    if (!clientId) return toast.error("Conectează-te întâi, ca să obținem Client ID-ul.");

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
      toast.success("Configurația DPD a fost salvată.");
      setReper(valori);
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
      toast.success("DPD a fost deconectat.");
      setClientId(null);
      setClientName("");
      setObiecte([]);
      router.refresh();
    }
  }

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const areContul = !!username.trim() && (!!password.trim() || parolaSalvata);
  const stari: StareAntet[] = isActive
    ? [{ ton: "bun", text: "Activ" }, ...(initialConfig?.international_enabled ? [{ ton: "info" as const, text: "Livrare în UE" }] : [])]
    : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="dpd"
      titlu="Livrare"
      descriere="Generezi AWB-uri DPD din comenzi, cu sediul și contractul tău DPD."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul DPD", facut: areContul },
          { text: "Sediul expeditor (Client ID)", facut: !!clientId },
          { text: "DPD activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Utilizator", valoare: initialConfig?.username || "-" },
            { eticheta: "Client ID", valoare: <span className="font-mono">{initialConfig?.client_id}</span> },
            { eticheta: "Livrare în UE", valoare: initialConfig?.international_enabled ? "da" : "nu" },
          ]} />
        )}
        <CumFunctioneaza id="dpd" puncte={[
          { Icon: KeyRound, text: "Accesul API (myDPD Business) îl ceri de la DPD România: primești un username și o parolă pentru API." },
          { Icon: Building2, text: "Dacă contractul are mai multe sedii, alegi firma ta: pe ea se emit AWB-urile și în contul ei vine rambursul." },
          { Icon: Truck, text: "AWB-ul îl generezi din pagina comenzii; costul livrării se calculează pe loc." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul DPD" descriere="Datele de acces la API primite de la DPD.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="dpd-user" required>
            <Input id="dpd-user" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="user@firma.ro" />
          </Field>
          <Field label="Parola" htmlFor="dpd-parola" required>
            <Input
              id="dpd-parola"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : "Parola contului DPD"}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleConnect} disabled={loading || !areContul}>
            {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {loading ? "Se conectează..." : "Testează și conectează"}
          </Button>
          <a href="https://api.dpd.ro/api/docs/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Documentația API DPD <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {clientId && (
          <Callout variant="success" icon={CheckCircle} title={`Conectat ca: ${clientName || "DPD Client"} (ID: ${clientId})`} />
        )}

        {clientId && (
          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-xs font-medium text-foreground">Ai primit de la DPD un Client ID pentru firma ta?</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Dacă firma ta nu apare mai sus, scrie aici Client ID-ul dat de DPD. Îl verificăm la DPD înainte să-l folosim.
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                aria-label="Client ID primit de la DPD"
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
                  toast.success(`Sediu verificat: ${numeObiect(r.obiect)}. Apasă „Salvează”.`);
                }}
              >
                {verificSediu ? <Loader2 className="animate-spin" /> : null}
                Folosește
              </Button>
            </div>
          </div>
        )}

        {obiecte.length > 1 && (
          <Field label="Sediul expeditor" htmlFor="dpd-sediu"
            hint="Contul tău DPD vede mai multe sedii din același contract. Alege firma ta: pe ea se emit AWB-urile, de acolo se ridică coletele și în contul ei se virează rambursul.">
            <select
              id="dpd-sediu"
              value={clientId ?? ""}
              onChange={e => {
                const o = obiecte.find((x) => x.clientId === Number(e.target.value));
                if (o) { setClientId(o.clientId); setClientName(numeObiect(o)); }
              }}
              className={selectCls}
            >
              {obiecte.map((o) => (
                <option key={o.clientId} value={o.clientId}>
                  {numeObiect(o)}{o.address ? ` · ${o.address}` : ""} (ID {o.clientId})
                </option>
              ))}
            </select>
          </Field>
        )}
      </Sectiune>

      {clientId && (
        <Sectiune pas={2} titlu="Cont bancar (ramburs)"
          descriere="Opțional. Lasă gol dacă IBAN-ul e deja în contractul tău DPD: rambursul ajunge acolo. Completează doar dacă vrei banii încasați în alt cont.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="IBAN" htmlFor="dpd-iban">
              <Input id="dpd-iban" type="text" value={iban} onChange={e => setIban(e.target.value)} placeholder="RO00 BANK 0000 0000 0000 0000" />
            </Field>
            <Field label="Titular cont" htmlFor="dpd-titular">
              <Input id="dpd-titular" type="text" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Numele firmei" />
            </Field>
          </div>
        </Sectiune>
      )}

      {clientId && (
        <Sectiune pas={3} titlu="Opțiuni de expediere">
          <RandComutator
            titlu="Livrare internațională (UE)"
            text="Permite comenzi către țările UE. Clientul alege țara la comandă, iar prețul livrării se calculează pe loc, prin DPD."
            activ={international}
            onChange={setInternational}
          />
          {international && (
            <p className="text-xs text-muted-foreground">
              Prețul livrării se calculează din greutatea setată pe fiecare produs, înmulțită cu bucățile din coș.
              Produsele fără greutate completată intră cu o estimare de 1 kg pe colet.
            </p>
          )}
          <RandComutator
            separat
            titlu="Asigurare (valoare declarată)"
            text="Fiecare AWB se asigură pentru valoarea produselor din comandă. DPD percepe o primă de asigurare, conform contractului."
            activ={declaredValue}
            onChange={setDeclaredValue}
          />
          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-sm font-medium text-foreground">Deschidere sau testare la livrare (OBPD)</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Destinatarul poate deschide sau testa coletul înainte de plată. Se aplică doar livrărilor la adresă, nu la punctele de ridicare.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select aria-label="Opțiune OBPD" value={obpd} onChange={e => setObpd(e.target.value as "" | "OPEN" | "TEST")} className={selectCls}>
                <option value="">Dezactivat</option>
                <option value="OPEN">Deschidere colet (OPEN)</option>
                <option value="TEST">Testare produs (TEST)</option>
              </select>
              {obpd && (
                <select aria-label="Plătitor retur OBPD" value={obpdPayer} onChange={e => setObpdPayer(e.target.value as "SENDER" | "RECIPIENT")} className={selectCls}>
                  <option value="SENDER">Retur plătit de expeditor</option>
                  <option value="RECIPIENT">Retur plătit de destinatar</option>
                </select>
              )}
            </div>
          </div>
        </Sectiune>
      )}

      {isActive && (
        <ZonaDeconectare descriere="Șterge configurarea DPD din Edinio. AWB-urile deja emise rămân pe comenzi.">
          <ButonDeconectare
            nume="DPD"
            cePierzi="Se șterge toată configurarea DPD din Edinio: username, parolă, Client ID-ul, contul bancar pentru ramburs și opțiunile de expediere. Ca să te întorci, le ceri din nou din contul tău DPD; AWB-urile deja emise rămân pe comenzi."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      {clientId && (
        <BaraSalvare
          modificat={isActive ? modificat : undefined}
          saving={saving}
          onSalveaza={handleSave}
          onRenunta={isActive ? renunta : undefined}
          textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
        />
      )}
    </PaginaIntegrare>
  );
}

/** „Firma · Obiect", fara repetitie cand obiectul poarta chiar numele firmei. */
function numeObiect(o: DpdObiect): string {
  const obiect = o.objectName.trim();
  return obiect && obiect !== o.name.trim() ? `${o.name} · ${obiect}` : o.name || obiect || "DPD Client";
}
