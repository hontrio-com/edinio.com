"use client";

import { useState, useTransition } from "react";
import { CheckCircle, KeyRound, Loader2, MapPin, RefreshCw, Truck, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { saveCOConfig, disconnectCO, testCOConnection } from "@/lib/actions/colete.actions";
import type { COConfig, COSender } from "@/lib/colete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  AlegereCarduri, BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

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
  const router = useRouter();

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { enabled, sandbox, clientId, clientSecret, sender, insuranceEnabled, repaymentType, repaymentIban, repaymentHolder };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setEnabled(reper.enabled); setSandbox(reper.sandbox); setClientId(reper.clientId); setClientSecret(reper.clientSecret);
    setSender(reper.sender); setInsuranceEnabled(reper.insuranceEnabled); setRepaymentType(reper.repaymentType);
    setRepaymentIban(reper.repaymentIban); setRepaymentHolder(reper.repaymentHolder);
  }

  const isConnected = !!(initialConfig?.client_id && secretulEsteSalvat(initialConfig, "client_secret"));

  function updateSender(key: keyof COSender, value: string) {
    setSender(prev => ({ ...prev, [key]: value }));
  }

  function handleTest() {
    if (!clientId || (!clientSecret && !secretulEsteSalvat(initialConfig, "client_secret"))) { toast.error("Introdu Client ID și Client Secret."); return; }
    startTestTransition(async () => {
      setTestResult(null);
      let result: Awaited<ReturnType<typeof testCOConnection>>;
      try {
        result = await testCOConnection(businessId, clientId, clientSecret, sandbox);
      } catch {
        /* ⚠ Mesajul nu pretinde nimic despre ce s-a intamplat la Colete Online: n-am masurat ce
           face proba acolo, deci spun doar ca nu stim daca a ajuns la capat. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca proba de conexiune a ajuns la capat. "
          + "Reimprospateaza si incearca din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) {
        setTestResult({ error: result.error });
        toast.error(result.error);
      } else {
        setTestResult({ balance: result.balance, bonus: result.bonus });
        toast.success("Conexiune reușită.");
      }
    });
  }

  function handleSave() {
    if (!clientId || (!clientSecret && !secretulEsteSalvat(initialConfig, "client_secret"))) { toast.error("Client ID și Client Secret sunt obligatorii."); return; }
    if (!sender.name || !sender.phone) { toast.error("Numele și telefonul expeditorului sunt obligatorii."); return; }
    if (!sender.county || !sender.city || !sender.postal_code || !sender.street || !sender.street_number) {
      toast.error("Adresa expeditorului este incompletă."); return;
    }
    if (repaymentType === "bank" && !repaymentIban.trim()) {
      toast.error("Introdu IBAN-ul pentru rambursul în cont."); return;
    }
    const config: COConfig = {
      enabled, sandbox, client_id: clientId, client_secret: clientSecret, sender,
      insurance_enabled: insuranceEnabled,
      repayment_type: repaymentType,
      repayment_iban: repaymentIban.trim() || undefined,
      repayment_holder: repaymentHolder.trim() || undefined,
    };
    startSaveTransition(async () => {
      let result: Awaited<ReturnType<typeof saveCOConfig>>;
      try {
        result = await saveCOConfig(businessId, config);
      } catch {
        /* ⚠ Scrie configurarea Colete Online. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Colete Online s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) toast.error(result.error);
      else { toast.success("Configurația Colete Online a fost salvată."); setReper(valori); router.refresh(); }
    });
  }

  function handleDisconnect() {
    startDisconnectTransition(async () => {
      let result: Awaited<ReturnType<typeof disconnectCO>>;
      try {
        result = await disconnectCO(businessId);
      } catch {
        /* ⚠ `disconnectCO` scrie DOAR la noi: nu vorbeste cu Colete Online. Deci singurul lucru
           nestiut e daca stergerea a apucat sa se scrie, iar contul de la ei e neatins. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Reimprospateaza pagina si uita-te daca mai apare conectat inainte sa incerci "
          + "din nou: la Colete Online nu s-a atins nimic.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Colete Online a fost deconectat.");
        setClientId(""); setClientSecret("");
        setSender(DEFAULT_SENDER);
        setEnabled(false);
        setReper({ ...valori, clientId: "", clientSecret: "", sender: DEFAULT_SENDER, enabled: false });
        router.refresh();
      }
    });
  }

  const secretSalvat = secretulEsteSalvat(initialConfig, "client_secret");
  const areAcces = !!clientId && (!!clientSecret || secretSalvat);
  const adresaCompleta = !!(sender.name && sender.phone && sender.county && sender.city && sender.postal_code && sender.street && sender.street_number);
  const stari: StareAntet[] = !isConnected
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      initialConfig?.enabled ? { ton: "bun", text: "Activ" } : { ton: "neutru", text: "Oprit" },
      ...(initialConfig?.sandbox ? [{ ton: "asteptare" as const, text: "Mod test" }] : []),
    ];

  return (
    <PaginaIntegrare
      id="colete"
      titlu="Livrare"
      descriere="Generezi AWB-uri prin Colete Online, cu mai mulți curieri, direct din comenzile magazinului."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Colete Online" activ={enabled} onChange={setEnabled} ariaLabel="Activează Colete Online" textPornit="Pornit" textOprit="Oprit" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Datele de acces", facut: areAcces },
          { text: "Adresa expeditorului", facut: adresaCompleta },
          { text: "Colete Online activ", facut: isConnected && !!initialConfig?.enabled },
        ]} />
        {testResult && !testResult.error && (
          <CardCifre titlu="Contul Colete Online" cifre={[
            { eticheta: "sold (RON)", valoare: testResult.balance?.toFixed(2) ?? "-" },
            { eticheta: "bonus (RON)", valoare: (testResult.bonus ?? 0).toFixed(2) },
          ]} />
        )}
        <CumFunctioneaza id="colete" puncte={[
          { Icon: KeyRound, text: "Client ID și Client Secret le primești de la Colete Online." },
          { Icon: MapPin, text: "Adresa expeditorului e punctul de ridicare pentru toate coletele." },
          { Icon: Wallet, text: "„Testează conexiunea” îți arată și soldul contului Colete Online." },
          { Icon: Truck, text: "AWB-ul îl generezi din pagina comenzii." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Datele de acces" descriere="Credențialele API primite de la Colete Online.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client ID" htmlFor="colete-id">
            <Input id="colete-id" type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID de la Colete Online" />
          </Field>
          <Field label="Client Secret" htmlFor="colete-secret">
            <Input
              id="colete-secret"
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={secretSalvat ? PLACEHOLDER_SECRET_SALVAT : "Client Secret de la Colete Online"}
            />
          </Field>
        </div>
        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={sandbox}
          onChange={setSandbox}
          optiuni={[
            { valoare: true, titlu: "Test (Staging)", text: "Serverul de test: comenzile nu sunt reale.", avertizare: true },
            { valoare: false, titlu: "Real", text: "AWB-uri adevărate, plătite din contul tău." },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !areAcces}>
            {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Testează conexiunea
          </Button>
        </div>
        {testResult && (testResult.error
          ? <Callout variant="danger" title={testResult.error} />
          : (
            <Callout variant="success" icon={CheckCircle}
              title={`Conexiune reușită. Sold: ${testResult.balance?.toFixed(2)} RON${(testResult.bonus ?? 0) > 0 ? ` + ${testResult.bonus?.toFixed(2)} RON bonus` : ""}`} />
          ))}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa expeditorului" descriere="Punctul de ridicare pentru toate coletele.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nume contact" required>
            <Input type="text" value={sender.name} onChange={e => updateSender("name", e.target.value)} placeholder="Ion Popescu" />
          </Field>
          <Field label="Telefon" required>
            <Input type="text" value={sender.phone} onChange={e => updateSender("phone", e.target.value)} placeholder="+40722000000" />
          </Field>
          <Field label="Email">
            <Input type="email" value={sender.email ?? ""} onChange={e => updateSender("email", e.target.value)} placeholder="contact@firma.ro" />
          </Field>
          <Field label="Firmă">
            <Input type="text" value={sender.company ?? ""} onChange={e => updateSender("company", e.target.value)} placeholder="Firma SRL" />
          </Field>
          <Field label="Județ" required>
            <Input type="text" value={sender.county} onChange={e => updateSender("county", e.target.value)} placeholder="Cluj" />
          </Field>
          <Field label="Oraș / Localitate" required>
            <Input type="text" value={sender.city} onChange={e => updateSender("city", e.target.value)} placeholder="Cluj-Napoca" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Strada" required className="sm:col-span-2">
            <Input type="text" value={sender.street} onChange={e => updateSender("street", e.target.value)} placeholder="Strada Eroilor" />
          </Field>
          <Field label="Număr" required>
            <Input type="text" value={sender.street_number} onChange={e => updateSender("street_number", e.target.value)} placeholder="10A" />
          </Field>
        </div>

        <Field label="Cod poștal" required className="w-40">
          <Input type="text" value={sender.postal_code} onChange={e => updateSender("postal_code", e.target.value)} placeholder="400001" />
        </Field>
      </Sectiune>

      <Sectiune pas={3} titlu="Opțiuni de expediere">
        <RandComutator
          titlu="Asigurare (valoare declarată)"
          text="Fiecare AWB se asigură pentru valoarea produselor din comandă. Prima de asigurare apare în preț."
          activ={insuranceEnabled}
          onChange={setInsuranceEnabled}
        />
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Încasarea rambursului</p>
          <AlegereCarduri
            eticheta="Încasarea rambursului"
            valoare={repaymentType}
            onChange={setRepaymentType}
            optiuni={[
              { valoare: "cash", titlu: "Numerar la curier", text: "Curierul îți aduce banii încasați." },
              { valoare: "bank", titlu: "În cont bancar", text: "Banii vin în contul tău, prin virament." },
            ]}
          />
        </div>
        {repaymentType === "bank" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="IBAN" required>
              <Input type="text" value={repaymentIban} onChange={e => setRepaymentIban(e.target.value)} placeholder="RO49AAAA1B31007593840000" />
            </Field>
            <Field label="Titular cont">
              <Input type="text" value={repaymentHolder} onChange={e => setRepaymentHolder(e.target.value)} placeholder="Firma SRL" />
            </Field>
          </div>
        )}
      </Sectiune>

      {isConnected && (
        <ZonaDeconectare descriere="Șterge configurarea din Edinio. La Colete Online nu se atinge nimic.">
          <ButonDeconectare
            nume="Colete Online"
            cePierzi="Se șterge toată configurarea Colete Online din Edinio: Client ID, Client Secret, adresa expeditorului și opțiunile de expediere. La Colete Online nu se atinge nimic, iar AWB-urile deja emise rămân pe comenzi."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={handleSave} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
