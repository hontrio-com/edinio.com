"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Banknote, Info, KeyRound, Loader2, MapPin, Wallet } from "lucide-react";
import {
  diagnosticSmartshipAction, disconnectSmartship, getSmartshipCurieriAction,
  getSmartshipDeconturiAction, getSmartshipFacturiAction, saveSmartshipConfig,
  testSmartshipConnectionAction,
} from "@/lib/actions/smartship.actions";
import type { DecontSmartship, ExpeditorSalvat, FacturaSmartship, FormatEticheta, SmartshipConfig, SoldSmartship } from "@/lib/smartship/client";
import { ibanValid } from "@/lib/smartship/expediere";
import { suprapuneri, textSuprapunere } from "@/lib/smartship/suprapunere";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea SmartShip.
 *
 * ═══ ⚠ DOUA LUCRURI CARE SE GRESESC USOR SI COSTA MULT ═══
 *
 * 1. **Adresa de ridicare cere un ID NUMERIC de localitate**, nu un nume. De aia
 *    exista butonul „Incarca expeditorii": el aduce adresele salvate in contul
 *    SmartShip, cu `localitate_id` si `sector` gata completate. Scris de mana, un
 *    id gresit trimite coletele in alt oras fara nicio eroare.
 *
 * 2. **IBAN-ul e obligatoriu la orice comanda cu ramburs**, si SmartShip il
 *    valideaza la FIECARE cerere — cotare inclusa. Gresit, TOATE comenzile cu
 *    plata la livrare cad tacut pe tariful fix din „Setari → Livrare", fiindca
 *    `/cost` raspunde 201 si cotarea se pierde. De aceea se verifica aici, in
 *    formular, cu cifra de control.
 *
 * ═══ ⚠ NU EXISTA MEDIU DE PROBA ═══
 *
 * Spre deosebire de Innoship (`/validate`, `/simulate`), la SmartShip fiecare
 * emitere e reala si facturata din prima. Ecranul o spune, ca omul sa stie asta
 * inainte de primul buton, nu dupa.
 */

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "A4", eticheta: "A4 (foaie întreagă)" },
  { valoare: "A6", eticheta: "A6 (etichetă compactă, imprimante de etichete)" },
];

export function SmartshipConfigClient({
  businessId,
  initialConfig,
  activiDirect = [],
}: {
  businessId: string;
  initialConfig: SmartshipConfig | null;
  /** Curierii pe care magazinul ii are deja pornit pe cont propriu. */
  activiDirect?: string[];
}) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState("");
  const [iban, setIban] = useState(initialConfig?.iban ?? "");
  const [expeditor, setExpeditor] = useState(initialConfig?.expeditor ?? null);

  const [contractPropriu, setContractPropriu] = useState(initialConfig?.contract_propriu === true);
  const [arataContractPropriu, setArataContractPropriu] = useState(initialConfig?.arata_contract_propriu === true);
  const [folosesteEasybox, setFolosesteEasybox] = useState(initialConfig?.foloseste_easybox === true);
  const [folosesteFanbox, setFolosesteFanbox] = useState(initialConfig?.foloseste_fanbox === true);
  const [deschidere, setDeschidere] = useState(initialConfig?.deschidere_la_livrare === true);
  const [asigura, setAsigura] = useState(initialConfig?.asigura_coletul === true);
  const [faraRidicare, setFaraRidicare] = useState(initialConfig?.fara_ridicare_automata === true);
  const [lungime, setLungime] = useState(String(initialConfig?.lungime_cm ?? 30));
  const [latime, setLatime] = useState(String(initialConfig?.latime_cm ?? 20));
  const [inaltime, setInaltime] = useState(String(initialConfig?.inaltime_cm ?? 10));
  const [continut, setContinut] = useState(initialConfig?.continut_implicit ?? "Produse");
  const [format, setFormat] = useState<FormatEticheta>(initialConfig?.format_eticheta ?? "A4");
  const [curieriPermisi, setCurieriPermisi] = useState<number[]>(initialConfig?.curieri_permisi ?? []);

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    apiKey, iban, expeditor, contractPropriu, arataContractPropriu, folosesteEasybox, folosesteFanbox, deschidere,
    asigura, faraRidicare, lungime, latime, inaltime, continut, format, curieriPermisi,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setApiKey(reper.apiKey); setIban(reper.iban); setExpeditor(reper.expeditor); setContractPropriu(reper.contractPropriu);
    setArataContractPropriu(reper.arataContractPropriu); setFolosesteEasybox(reper.folosesteEasybox);
    setFolosesteFanbox(reper.folosesteFanbox); setDeschidere(reper.deschidere); setAsigura(reper.asigura);
    setFaraRidicare(reper.faraRidicare); setLungime(reper.lungime); setLatime(reper.latime); setInaltime(reper.inaltime);
    setContinut(reper.continut); setFormat(reper.format); setCurieriPermisi(reper.curieriPermisi);
  }

  const [expeditori, setExpeditori] = useState<ExpeditorSalvat[]>([]);
  const [sold, setSold] = useState<SoldSmartship | null>(null);
  const [curieri, setCurieri] = useState<{ id: number; nume: string; siContractPropriu: boolean }[]>([]);
  const [deconturi, setDeconturi] = useState<DecontSmartship[] | null>(null);
  const [facturi, setFacturi] = useState<FacturaSmartship[] | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const [salveaza, setSalveaza] = useState(false);
  const [proba, setProba] = useState(false);
  const [incarcCurieri, setIncarcCurieri] = useState(false);
  const [incarcDeconturi, setIncarcDeconturi] = useState(false);
  const [incarcFacturi, setIncarcFacturi] = useState(false);
  const [rulezDiagnostic, setRulezDiagnostic] = useState(false);

  /* Cheia nu ajunge in browser (e mascata), deci prezenta ei se citeste din config. */
  const areCheie = apiKey.trim() !== "" || secretulEsteSalvat(initialConfig, "api_key");
  const expeditorGata = !!(expeditor?.name && expeditor.address && expeditor.phone && Number(expeditor.city) > 0);
  /* ⚠ ACEEASI regula ca `smartshipGata` de pe server. */
  const isActive = !!(initialConfig?.enabled && secretulEsteSalvat(initialConfig, "api_key") && expeditorGata);

  const ibanCurat = iban.replace(/\s/g, "");
  const ibanGresit = ibanCurat.length > 0 && !ibanValid(ibanCurat);

  function construieste(): SmartshipConfig {
    return {
      enabled: true,
      /* Gol = „n-am schimbat"; serverul pastreaza valoarea veche. */
      api_key: apiKey.trim(),
      expeditor: expeditor ?? undefined,
      iban: ibanCurat.toUpperCase(),
      curieri_permisi: curieriPermisi,
      contract_propriu: contractPropriu,
      arata_contract_propriu: arataContractPropriu,
      foloseste_easybox: folosesteEasybox,
      foloseste_fanbox: folosesteFanbox,
      deschidere_la_livrare: deschidere,
      asigura_coletul: asigura,
      fara_ridicare_automata: faraRidicare,
      lungime_cm: Number(lungime) || 30,
      latime_cm: Number(latime) || 20,
      inaltime_cm: Number(inaltime) || 10,
      continut_implicit: continut.trim() || "Produse",
      format_eticheta: format,
    };
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completează cheia de API.");
    if (!expeditorGata) {
      return toast.error("Alege adresa de ridicare: apasă „Verifică și încarcă expeditorii”.");
    }
    if (ibanGresit) return toast.error("IBAN-ul nu e valid. Verifică cifrele de control.");

    setSalveaza(true);
    const r = await saveSmartshipConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea SmartShip a fost salvată.");
    setReper(valori);
    router.refresh();
  }

  async function handleProba() {
    setProba(true);
    const r = await testSmartshipConnectionAction(businessId, apiKey.trim() || undefined);
    setProba(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });

    setExpeditori(r.expeditori);
    setSold(r.sold);
    if (r.expeditori.length === 0) {
      return toast.warning("Cheia e bună, dar contul n-are nicio adresă de ridicare salvată. Adaugă una în SmartShip.");
    }
    /* Un singur expeditor: il alegem noi, ca omul sa nu mai apese inca o data. */
    if (r.expeditori.length === 1 && !expeditorGata) alegeExpeditorul(r.expeditori[0]);
    toast.success(`Conexiune reușită: ${r.expeditori.length} adrese de ridicare.`);
  }

  function alegeExpeditorul(e: ExpeditorSalvat) {
    setExpeditor({
      name: (e.nume ?? "").trim(),
      address: (e.adresa ?? "").trim(),
      email: (e.email ?? "").trim() || undefined,
      city: Number(e.localitate_id) || 0,
      phone: (e.telefon ?? "").trim(),
      country: "RO",
      sector: Number(e.sector) || 0,
    });
  }

  async function incarcaCurieri() {
    setIncarcCurieri(true);
    const r = await getSmartshipCurieriAction(businessId);
    setIncarcCurieri(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });
    setCurieri(r.curieri);
    if (r.curieri.length === 0) toast.info("Niciun curier nu a întors preț pentru ruta de probă.");
  }

  async function incarcaDeconturi() {
    setIncarcDeconturi(true);
    const r = await getSmartshipDeconturiAction(businessId);
    setIncarcDeconturi(false);
    if (!r.ok) return toast.error(r.error);
    setDeconturi(r.deconturi);
    if (r.deconturi.length === 0) toast.info("Nu există deconturi de ramburs.");
  }

  async function incarcaFacturi() {
    setIncarcFacturi(true);
    const r = await getSmartshipFacturiAction(businessId);
    setIncarcFacturi(false);
    if (!r.ok) return toast.error(r.error);
    setFacturi(r.facturi);
    if (r.facturi.length === 0) toast.info("Nu există facturi emise către contul tău.");
  }

  async function ruleazaDiagnostic() {
    setRulezDiagnostic(true);
    const r = await diagnosticSmartshipAction(businessId);
    setRulezDiagnostic(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });
    setDiagnostic(
      [
        `easybox: ${r.easybox} lockere${r.easyboxFaraId > 0 ? `, din care ${r.easyboxFaraId} FARA id recunoscut` : ""}`,
        `FANbox: ${r.eroareFanbox ? `indisponibil (${r.eroareFanbox})` : `${r.fanbox} lockere${r.fanboxFaraId > 0 ? `, din care ${r.fanboxFaraId} FARA id recunoscut` : ""}`}`,
        r.chei.length > 0 ? `Campurile raspunsului: ${r.chei.map((c) => `${c.cheie}=${c.exemplu}`).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  /* ⚠ Fara `window.confirm`: intrebarea o pune `ButonDeconectare`, in fereastra
     casei. Doua intrebari una peste alta se invata sa se apese fara citire. */
  async function handleDisconnect() {
    const r = await disconnectSmartship(businessId);
    if ("error" in r) return toast.error(r.error);
    toast.success("SmartShip a fost deconectat.");
    router.refresh();
  }

  const suprapunerea = textSuprapunere(
    suprapuneri(curieri.map((c) => ({ id: c.id, nume: c.nume })), activiDirect, curieriPermisi),
  );

  const stari: StareAntet[] = isActive ? [{ ton: "bun", text: "Conectat" }] : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="smartship"
      titlu="Livrare"
      descriere="Colete prin SmartShip.ro: un cont, mai mulți curieri și un tarif negociat de ei. Poți emite și pe contractele tale de curierat, dacă le ai legate acolo."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia de API", facut: areCheie },
          { text: "Adresa de ridicare", facut: expeditorGata },
          { text: "IBAN-ul pentru ramburs", facut: ibanCurat.length > 0 && !ibanGresit },
          { text: "SmartShip activ", facut: isActive },
        ]} />
        {sold && (
          <CardCifre titlu="Contul SmartShip" cifre={[
            { eticheta: `disponibil (${sold.currency ?? "RON"})`, valoare: sold.available_for_shipping ?? 0 },
          ]} randuri={sold.payment_on_terms ? [{ eticheta: "Plata", valoare: "la termen" }] : []} />
        )}
        <CumFunctioneaza id="smartship" puncte={[
          { Icon: KeyRound, text: "Cheia o găsești în SmartShip, la Contul meu, Setări, API." },
          { Icon: MapPin, text: "Adresa de ridicare se alege din cele salvate în contul tău: localitatea e un id numeric, nu un nume." },
          { Icon: Banknote, text: "IBAN-ul e obligatoriu la orice comandă cu ramburs; greșit, comenzile cu ramburs rămân fără preț real." },
          { Icon: AlertTriangle, text: "SmartShip nu are mediu de probă: fiecare emitere e reală și facturată din prima." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Cheia de API">
        <Callout variant="info" icon={Info}>
          O găsești în platforma SmartShip, la <strong>Contul meu, Setări, API</strong>.
        </Callout>
        <Field label="Cheia API" htmlFor="smartship-cheie" hint="Se trimite la fiecare cerere. Nu o publica nicăieri.">
          <Input
            id="smartship-cheie"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "Cheia API"}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleProba} disabled={proba || !areCheie}>
            {proba && <Loader2 className="animate-spin" />}
            Verifică și încarcă expeditorii
          </Button>
          {sold && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Disponibil pentru expediere: <strong className="text-foreground">{sold.available_for_shipping ?? 0} {sold.currency ?? "RON"}</strong>
              {sold.payment_on_terms ? " (plata la termen)" : ""}
            </span>
          )}
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de ridicare">
        {/*
          * ⚠ Aici sta cel mai usor de gresit camp din toata configurarea.
          * `sender.city` e un ID numeric din nomenclatorul lor.
          */}
        <Callout variant="info" icon={Info}>
          SmartShip identifică localitățile prin <strong>id numeric</strong>, nu prin nume. De aceea adresa de ridicare se
          alege din cele salvate în contul tău, nu se scrie de mână.
        </Callout>

        {expeditori.length > 0 && (
          <div className="space-y-1">
            {expeditori.map((e) => (
              <button
                key={e.id ?? e.nume}
                type="button"
                onClick={() => alegeExpeditorul(e)}
                className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  expeditor?.city === Number(e.localitate_id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <span className="font-medium text-foreground">{e.nume}</span>
                <span className="text-muted-foreground">
                  {[e.adresa, e.localitate, e.judet].filter(Boolean).join(", ")}
                  {e.sector ? ` · sector ${e.sector}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {expeditorGata ? (
          <p className="text-xs text-muted-foreground">
            Ales: <strong className="text-foreground">{expeditor!.name}</strong> · {expeditor!.address}
            {expeditor!.sector ? `, sector ${expeditor!.sector}` : ""} (id localitate {expeditor!.city})
          </p>
        ) : (
          <p className="text-xs text-warning">Nicio adresă de ridicare aleasă. Apasă „Verifică și încarcă expeditorii”.</p>
        )}
      </Sectiune>

      <Sectiune pas={3} titlu="Ramburs">
        {/*
          * ⚠ Cel mai scump camp gresit din toata configurarea: un IBAN invalid
          * face ca TOATE comenzile cu ramburs sa cada tacut pe tariful fix.
          */}
        <Field
          label="IBAN pentru virarea rambursului"
          htmlFor="smartship-iban"
          hint="Obligatoriu la orice comandă cu plata la livrare. SmartShip îl verifică la fiecare cerere. Greșit, comenzile cu ramburs rămân fără preț real."
        >
          <Input
            id="smartship-iban"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="RO49AAAA1B31007593840000"
            className={ibanGresit ? "border-destructive" : undefined}
          />
        </Field>
        {ibanGresit && (
          <p className="text-xs text-destructive">IBAN-ul nu trece verificarea cifrelor de control. Verifică-l înainte de salvare.</p>
        )}
      </Sectiune>

      <Sectiune pas={4} titlu="Ce se oferă la comandă">
        <RandComutator
          titlu="Lockere Sameday Easybox"
          text="Clientul își alege lockerul la comandă. Prețul e cel fix din Setări, Livrare: SmartShip nu poate cota un locker înainte să știe CARE locker."
          activ={folosesteEasybox}
          onChange={setFolosesteEasybox}
        />
        <RandComutator
          separat
          titlu="Lockere FAN Courier FANbox"
          text={<>Merge <strong className="text-foreground">numai pe contractul tău de FAN Courier</strong>. Fără contract propriu, opțiunea nu apare la comandă.</>}
          activ={folosesteFanbox}
          onChange={setFolosesteFanbox}
          ariaLabel="Lockere FAN Courier FANbox"
        />
        {/* ⚠ Documentat de ei: FANbox merge doar cu `use_own_contract: 1`. */}
        {folosesteFanbox && !contractPropriu && (
          <Callout variant="warning" icon={AlertTriangle}>
            Ai pornit FANbox fără contract propriu. Opțiunea nu va apărea la comandă până nu pornești „Emite pe contractele tale”.
          </Callout>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Curierii oferiți</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fără niciunul bifat, apar toți curierii din cont. SmartShip n-are listă de curieri în API, deci se află dintr-o
                cotare de probă (București, Cluj-Napoca, 1 kg). Pe alte rute pot apărea și alții.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={incarcaCurieri} disabled={incarcCurieri || !isActive}>
              {incarcCurieri && <Loader2 className="animate-spin" />}
              Încarcă curierii
            </Button>
          </div>

          {curieri.length > 0 && (
            <div className="space-y-1">
              {curieri.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-border accent-primary"
                    checked={curieriPermisi.includes(c.id)}
                    onChange={(e) =>
                      setCurieriPermisi((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))
                    }
                  />
                  <span>{c.nume}</span>
                  {c.siContractPropriu && <span className="text-[10px] text-muted-foreground">(există și pe contractul tău)</span>}
                </label>
              ))}
            </div>
          )}

          {/*
            * ⚠ Suprapunerea, a PATRA oara: acelasi curier poate ajunge in checkout
            * direct, prin Innoship, prin Packeta si prin SmartShip.
            */}
          {suprapunerea && <Callout variant="warning" icon={AlertTriangle}>{suprapunerea}</Callout>}
        </div>
      </Sectiune>

      <Sectiune pas={5} titlu="Contract propriu (BYOC)">
        <Callout variant="info" icon={Info}>
          Dacă ai conturi proprii de curier legate în SmartShip („Curieri Proprii”) și abonament BYOC activ, expedierile pot
          pleca pe contractele tale, la tarifele tale.
        </Callout>
        <RandComutator
          titlu="Emite pe contractele tale"
          text="Fără asta, AWB-ul pleacă pe contractul SmartShip, la tariful standard."
          activ={contractPropriu}
          onChange={setContractPropriu}
        />
        {/*
          * ⚠ Acelasi curier apare atunci de DOUA ori, cu doua preturi. Nu e un
          * defect, dar cumparatorul trebuie sa le poata deosebi; de aia
          * eticheta ofertei spune „(contractul tau)".
          */}
        <RandComutator
          separat
          titlu="Arată și prețurile contractelor tale la comandă"
          text="Același curier poate apărea de două ori, o dată pe contractul tău, o dată pe cel SmartShip. În listă se vede care e care."
          activ={arataContractPropriu}
          onChange={setArataContractPropriu}
        />
      </Sectiune>

      <Sectiune pas={6} titlu="Coletul">
        {/*
          * ⚠ Dimensiunile nu sunt decor: se factureaza MAXIMUL dintre greutatea
          * fizica si cea volumetrica (L×l×h / 6000).
          */}
        <Callout variant="info" icon={Info}>
          SmartShip facturează <strong>maximul</strong> dintre greutatea reală și cea volumetrică (L × l × h / 6000).
          Dimensiuni prea mari scumpesc fiecare colet.
        </Callout>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Lungime (cm)">
            <Input type="number" min={1} value={lungime} onChange={(e) => setLungime(e.target.value)} />
          </Field>
          <Field label="Lățime (cm)">
            <Input type="number" min={1} value={latime} onChange={(e) => setLatime(e.target.value)} />
          </Field>
          <Field label="Înălțime (cm)">
            <Input type="number" min={1} value={inaltime} onChange={(e) => setInaltime(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Greutate volumetrică la dimensiunile astea:{" "}
          <strong className="text-foreground">{((Number(lungime) * Number(latime) * Number(inaltime)) / 6000 || 0).toFixed(2)} kg</strong>
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Descrierea implicită a conținutului" htmlFor="smartship-continut" hint="Apare pe AWB când comanda n-are alta.">
            <Input id="smartship-continut" value={continut} onChange={(e) => setContinut(e.target.value)} maxLength={255} />
          </Field>
          <Field label="Formatul etichetei" htmlFor="smartship-format">
            <select id="smartship-format" value={format} onChange={(e) => setFormat(e.target.value as FormatEticheta)} className={selectCls}>
              {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
            </select>
          </Field>
        </div>

        <RandComutator
          separat
          titlu="Deschidere la livrare"
          text="Unde curierul o suportă. La locker nu se aplică: nu e nimeni acolo care să deschidă coletul."
          activ={deschidere}
          onChange={setDeschidere}
        />
        <RandComutator
          separat
          titlu="Asigură coletul la valoarea comenzii"
          text="Asigurarea se facturează separat de curier."
          activ={asigura}
          onChange={setAsigura}
        />
        <RandComutator
          separat
          titlu="Nu comanda automat ridicarea"
          text="Util dacă ai deja o ridicare zilnică programată. Se aplică la curierii unde SmartShip comandă ridicarea singur (FanCourier, DragonStar, PTT Express)."
          activ={faraRidicare}
          onChange={setFaraRidicare}
        />
      </Sectiune>

      <Sectiune titlu="Facturi de la SmartShip">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Facturile emise către contul tău, cu link public către PDF. Se citesc doar; nu intră în contabilitatea magazinului.
          </p>
          <Button variant="outline" size="sm" onClick={incarcaFacturi} disabled={incarcFacturi || !isActive}>
            {incarcFacturi && <Loader2 className="animate-spin" />}
            Încarcă
          </Button>
        </div>
        {facturi && facturi.length > 0 && (
          <ul className="space-y-1">
            {facturi.slice(0, 10).map((f) => (
              <li key={f.number} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>
                  {f.number} · {f.date}
                  {f.due_date ? ` · scadență ${f.due_date}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <strong>{f.total} {f.currency ?? "RON"}</strong>
                  {f.pdf_link && (
                    <a href={f.pdf_link} target="_blank" rel="noopener noreferrer" className="text-primary underline">PDF</a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Sectiune>

      <Sectiune titlu="Deconturi de ramburs">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Banii din ramburs, așa cum îi vede SmartShip. Informativ: statusul plății comenzilor nu se schimbă singur după ele.
          </p>
          <Button variant="outline" size="sm" onClick={incarcaDeconturi} disabled={incarcDeconturi || !isActive}>
            {incarcDeconturi && <Loader2 className="animate-spin" />}
            Încarcă
          </Button>
        </div>
        {deconturi && deconturi.length > 0 && (
          <ul className="space-y-1">
            {deconturi.slice(0, 10).map((d) => (
              <li key={d.number} className="flex justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>{d.number} · {d.date}{d.awb_count ? ` · ${d.awb_count} AWB` : ""}</span>
                <span className="font-semibold">{d.valoare} lei</span>
              </li>
            ))}
          </ul>
        )}
      </Sectiune>

      {isActive && (
        <Sectiune titlu="Diagnostic">
          {/*
            * ⚠ Masoara SINGURA necunoscuta din tot contractul lor: forma randului
            * din cele doua endpointuri de lockere, care n-au exemplu de raspuns.
            */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Verifică listele de lockere și arată cum se numesc câmpurile în răspunsul lor, singurele două adrese fără exemplu în documentație.
            </p>
            <Button variant="outline" size="sm" onClick={ruleazaDiagnostic} disabled={rulezDiagnostic}>
              {rulezDiagnostic && <Loader2 className="animate-spin" />}
              Rulează
            </Button>
          </div>
          {diagnostic && (
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-foreground">{diagnostic}</pre>
          )}
        </Sectiune>
      )}

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheia și setările SmartShip din Edinio. Expedierile deja emise rămân la SmartShip.">
          <ButonDeconectare
            nume="SmartShip"
            cePierzi="Cheia de API se șterge din Edinio, împreună cu expeditorul, curierii permiși și IBAN-ul de ramburs. Ca să te întorci, ceri din nou cheia din contul tău SmartShip. Expedierile deja emise rămân la ei."
            eticheta="Deconectează SmartShip"
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare
        modificat={isActive ? modificat : undefined}
        saving={salveaza}
        onSalveaza={handleSave}
        onRenunta={isActive ? renunta : undefined}
        textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
      />
    </PaginaIntegrare>
  );
}
