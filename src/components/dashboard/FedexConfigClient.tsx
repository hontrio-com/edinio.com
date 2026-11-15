"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, Info, KeyRound, Loader2, Tag, Truck } from "lucide-react";
import {
  disconnectFedex, getFedexServiciiAction, saveFedexConfig, testFedexConnectionAction,
} from "@/lib/actions/fedex.actions";
import {
  RAMBURS_INDISPONIBIL, STOCURI_ETICHETA, STOC_IMPLICIT,
  type ExpeditorFedex, type FedexConfig, type FormatEticheta, type MediuFedex, type TipRidicare,
} from "@/lib/fedex/client";
import { serviciiPropuse } from "@/lib/fedex/servicii";
import { GREUTATE_MAXIMA_EXPRESS_KG } from "@/lib/fedex/expediere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare, useFormularIntegrare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea FedEx.
 *
 * ═══ ⚠ TREI LUCRURI CARE SE GRESESC USOR ═══
 *
 * 1. **Cheile de test NU merg in productie, si invers.** Proiectul din portalul
 *    FedEx are doua perechi diferite. Comutatorul de mediu de aici alege gazda, iar
 *    o nepotrivire iese ca „credentiale respinse" — adica exact mesajul care il
 *    face pe comerciant sa-si regenereze cheile bune.
 *
 * 2. **Sandbox-ul lor e VIRTUALIZAT.** Raspunde cu preturi predefinite, indiferent
 *    de adresa („only country is validated"). E bun ca sa vezi ca legatura merge,
 *    nu ca sa afli cat costa un colet spre Cluj.
 *
 * 3. **Codul postal e obligatoriu de facto.** Romania e tara „postal-aware" la ei,
 *    cu sablonul `NNNNNN`. Fara el, fiecare cotare raspunde `POSTALCODE.ZIPCODE.REQUIRED`.
 *
 * ═══ ⚠ SI UNUL CARE NU SE POATE REPARA DIN CONFIGURARE ═══
 *
 * **Rambursul.** Nu e un comutator lipsa — FedEx l-a retras in iulie 2023. Se spune
 * sus de tot, nu la subsol: pentru un magazin romanesc e prima intrebare.
 */

const MEDII: { valoare: MediuFedex; eticheta: string }[] = [
  { valoare: "productie", eticheta: "Producție (apis.fedex.com) · expedieri reale" },
  { valoare: "test", eticheta: "Test / sandbox (apis-sandbox.fedex.com) · răspunsuri simulate" },
];

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "PDF", eticheta: "PDF (imprimantă obișnuită)" },
  { valoare: "PNG", eticheta: "PNG (imagine)" },
  { valoare: "ZPLII", eticheta: "ZPL II (imprimantă termică de etichete)" },
];

const RIDICARI: { valoare: TipRidicare; eticheta: string }[] = [
  { valoare: "USE_SCHEDULED_PICKUP", eticheta: "Ridicare programată (ai deja o ridicare zilnică la FedEx)" },
  { valoare: "CONTACT_FEDEX_TO_SCHEDULE", eticheta: "Suni la FedEx pentru fiecare ridicare" },
  { valoare: "DROPOFF_AT_FEDEX_LOCATION", eticheta: "Duci coletul la un punct FedEx" },
];

type Proba = {
  mediu: MediuFedex;
  ok: boolean;
  mesaj: string;
  servicii: string[];
  valuta: string | null;
  virtual: boolean;
  /** ⚠ Preturile contului includ TVA? Dedus din numerele cotarii de proba. */
  tva: string;
};

export function FedexConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FedexConfig | null;
}) {
  const router = useRouter();
  const { cfg: config, setCfg: setConfig, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<FedexConfig>({
    enabled: initialConfig?.enabled ?? false,
    client_id: initialConfig?.client_id ?? "",
    client_secret: initialConfig?.client_secret ?? "",
    account_number: initialConfig?.account_number ?? "",
    mediu: initialConfig?.mediu ?? "productie",
    expeditor: {
      nume: initialConfig?.expeditor?.nume ?? "",
      companie: initialConfig?.expeditor?.companie ?? "",
      telefon: initialConfig?.expeditor?.telefon ?? "",
      email: initialConfig?.expeditor?.email ?? "",
      strada: initialConfig?.expeditor?.strada ?? "",
      oras: initialConfig?.expeditor?.oras ?? "",
      judet: initialConfig?.expeditor?.judet ?? "",
      cod_postal: initialConfig?.expeditor?.cod_postal ?? "",
      tara: initialConfig?.expeditor?.tara ?? "RO",
    },
    servicii_permise: initialConfig?.servicii_permise ?? [],
    pickup_type: initialConfig?.pickup_type ?? "USE_SCHEDULED_PICKUP",
    format_eticheta: initialConfig?.format_eticheta ?? "PDF",
    stoc_eticheta: initialConfig?.stoc_eticheta ?? STOC_IMPLICIT,
    lungime_cm: initialConfig?.lungime_cm,
    latime_cm: initialConfig?.latime_cm,
    inaltime_cm: initialConfig?.inaltime_cm,
    continut_implicit: initialConfig?.continut_implicit ?? "",
    valoare_declarata: initialConfig?.valoare_declarata ?? false,
  });

  const [salveaza, setSalveaza] = useState(false);
  const [probeaza, setProbeaza] = useState(false);
  const [proba, setProba] = useState<Proba | null>(null);
  const [servicii, setServicii] = useState<{ cod: string; nume: string; marfaGrea: boolean }[]>(
    serviciiPropuse(initialConfig?.expeditor?.tara ?? "RO"),
  );

  const expeditor = config.expeditor ?? ({} as ExpeditorFedex);
  const setExpeditor = (patch: Partial<ExpeditorFedex>) =>
    setConfig((c) => ({ ...c, expeditor: { ...(c.expeditor ?? {} as ExpeditorFedex), ...patch } }));

  /*
   * ⚠ „Secretul e pus?" se citeste din CONFIGUL SALVAT, nu din campul din ecran.
   *
   * Campul poarta substituentul cand exista deja un secret criptat in baza, iar o
   * verificare pe lungimea lui ar raspunde „da" si pentru substituent, si pentru un
   * secret sters din greseala.
   */
  const areSecret = secretulEsteSalvat(initialConfig, "client_secret") || !!config.client_secret.trim();
  const areChei = !!config.client_id.trim() && areSecret && !!config.account_number.trim();
  const areExpeditor = !!(expeditor.oras ?? "").trim() && !!(expeditor.cod_postal ?? "").trim();

  /* ⚠ IDENTIC cu `fedexGata()` de pe server, cu `activeCourierIds`, cu pagina
     comenzii si cu cardul din hub. Cinci locuri care trebuie sa spuna acelasi lucru,
     altfel panoul arata „conectat" pentru o integrare care nu poate cota nimic. */
  const esteActiv = !!config.enabled && areChei && areExpeditor;

  /** Ce se trimite la server. ⚠ Secretul neatins pleaca GOL, ca sa fie pastrat. */
  const construieste = (): FedexConfig => ({
    ...config,
    client_id: config.client_id.trim(),
    client_secret: config.client_secret === PLACEHOLDER_SECRET_SALVAT ? "" : config.client_secret.trim(),
    account_number: config.account_number.trim(),
    continut_implicit: (config.continut_implicit ?? "").trim(),
    servicii_permise: (config.servicii_permise ?? []).filter(Boolean),
    expeditor: {
      ...expeditor,
      nume: (expeditor.nume ?? "").trim(),
      companie: (expeditor.companie ?? "").trim(),
      telefon: (expeditor.telefon ?? "").trim(),
      email: (expeditor.email ?? "").trim(),
      strada: (expeditor.strada ?? "").trim(),
      oras: (expeditor.oras ?? "").trim(),
      judet: (expeditor.judet ?? "").trim(),
      cod_postal: (expeditor.cod_postal ?? "").trim(),
      tara: ((expeditor.tara ?? "RO").trim() || "RO").toUpperCase(),
    },
  });

  const salvare = async () => {
    setSalveaza(true);
    const r = await saveFedexConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Configurarea FedEx a fost salvată.");
    marcheazaSalvat();
    const s = await getFedexServiciiAction(businessId);
    if (s.ok) setServicii(s.servicii);
    router.refresh();
  };

  const testeaza = async () => {
    setProbeaza(true);
    const r = await testFedexConnectionAction(businessId, construieste());
    setProbeaza(false);
    if (!r.ok) { toast.error(r.error, { duration: 15000 }); return; }

    setProba({
      mediu: r.proba.mediu,
      ok: r.proba.cotare.ok,
      mesaj: r.proba.cotare.mesaj,
      servicii: r.proba.cotare.servicii,
      valuta: r.proba.cotare.valuta,
      virtual: r.proba.cotare.virtual,
      tva: r.proba.cotare.tva,
    });

    if (!r.proba.cotare.ok) { toast.error(r.proba.cotare.mesaj, { duration: 15000 }); return; }
    toast.success(r.proba.cotare.mesaj);
  };

  const deconecteaza = async () => {
    const r = await disconnectFedex(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("FedEx a fost deconectat.");
    router.refresh();
  };

  const permise = config.servicii_permise ?? [];

  const secretSalvat = secretulEsteSalvat(initialConfig, "client_secret");
  const activSalvat = !!initialConfig?.enabled && !!initialConfig?.client_id && secretSalvat && !!initialConfig?.account_number
    && !!(initialConfig?.expeditor?.oras ?? "").trim() && !!(initialConfig?.expeditor?.cod_postal ?? "").trim();
  const stari: StareAntet[] = !secretSalvat
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      activSalvat ? { ton: "bun", text: "Activ" } : { ton: "neutru", text: "Oprit" },
      ...(initialConfig?.mediu === "test" ? [{ ton: "asteptare" as const, text: "Sandbox" }] : []),
    ];

  return (
    <PaginaIntegrare
      id="fedex"
      titlu="Livrare"
      descriere="Colete prin FedEx: livrări interne și internaționale, cu tarifele contului tău."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="FedEx la livrare" activ={!!config.enabled} onChange={(v) => setConfig({ ...config, enabled: v })} ariaLabel="Folosește FedEx pentru livrare" textPornit="Pornit" textOprit="Oprit" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheile și numărul de cont", facut: areChei },
          { text: "Orașul și codul poștal de expediție", facut: areExpeditor },
          { text: "FedEx pornit", facut: esteActiv },
        ]} />
        <CumFunctioneaza id="fedex" puncte={[
          { Icon: KeyRound, text: "Cheile le iei din portalul FedEx pentru dezvoltatori; cheile de test nu merg în producție și invers." },
          { Icon: Ban, text: "FedEx nu oferă plata la livrare: la comenzile cu ramburs nu apare deloc la comandă." },
          { Icon: Tag, text: "La comandă, FedEx apare la tariful fix din Setări, Livrare; prețul real îl vezi la emiterea AWB-ului." },
          { Icon: Truck, text: "După salvare, pornește și metoda „FedEx” din Setări, Livrare." },
        ]} />
      </>}
    >
      {/*
        ⚠ SUS DE TOT, nu la subsol. Pentru un magazin romanesc rambursul e prima
        intrebare, iar raspunsul nu se poate schimba din nicio setare.
      */}
      <Callout variant="warning" icon={Ban}>
        <strong>FedEx nu oferă plata la livrare.</strong> {RAMBURS_INDISPONIBIL} La comandă, FedEx nu apare deloc la comenzile
        cu ramburs; restul curierilor rămân.
      </Callout>
      {config.enabled && !areExpeditor && (
        <Callout variant="warning" icon={AlertTriangle}>
          Fără oraș și cod poștal de expediție, FedEx nu poate cota nimic, iar clienții vor vedea tariful fix.
        </Callout>
      )}
      {config.mediu === "test" && (
        <Callout variant="warning" icon={AlertTriangle}>
          Ești pe sandbox-ul FedEx. Răspunsurile sunt simulate: prețurile nu depind de adresă, iar AWB-urile emise nu există în
          realitate. Treci pe producție înainte de prima comandă adevărată.
        </Callout>
      )}
      {esteActiv && config.mediu !== "test" && (
        <Callout variant="info" icon={Info}>
          Fiecare AWB emis e real și facturat, iar FedEx nu are protecție contra dublurilor: dacă emiterea pare că a eșuat,
          folosește „Verifică la FedEx” din pagina comenzii, în loc să încerci din nou.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Conectare">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="API Key (client_id)" htmlFor="fedex-id"
            hint="Din portalul FedEx pentru dezvoltatori, la proiectul tău. Nu e mascat: îți spune ce proiect ai legat.">
            <Input id="fedex-id" value={config.client_id} placeholder="l7xx..." onChange={(e) => setConfig({ ...config, client_id: e.target.value })} />
          </Field>
          <Field label="Secret Key (client_secret)" htmlFor="fedex-secret" hint="Din același proiect. Se criptează și nu se mai afișează.">
            <Input
              id="fedex-secret"
              type="password"
              value={config.client_secret}
              placeholder={secretSalvat ? PLACEHOLDER_SECRET_SALVAT : "secretul tău"}
              onChange={(e) => setConfig({ ...config, client_secret: e.target.value })}
            />
          </Field>
          <Field label="Număr de cont FedEx" htmlFor="fedex-cont" hint="Nouă cifre. Îl găsești pe factura FedEx.">
            <Input id="fedex-cont" value={config.account_number} placeholder="123456789" maxLength={9} onChange={(e) => setConfig({ ...config, account_number: e.target.value })} />
          </Field>
          <Field label="Mediu" htmlFor="fedex-mediu" hint="Cheile de test NU merg în producție, și invers. O nepotrivire iese ca „credențiale respinse”.">
            <select id="fedex-mediu" className={selectCls} value={config.mediu ?? "productie"} onChange={(e) => setConfig({ ...config, mediu: e.target.value as MediuFedex })}>
              {MEDII.map((m) => <option key={m.valoare} value={m.valoare}>{m.eticheta}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={testeaza} disabled={probeaza || !areChei || !areExpeditor}>
            {probeaza ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            Testează conexiunea
          </Button>
          {!areExpeditor && (
            <p className="text-xs text-muted-foreground">
              Completează întâi orașul și codul poștal de expediție: proba chiar cere o cotare, nu doar un token.
            </p>
          )}
        </div>

        {proba && (
          <Callout variant={proba.ok ? "success" : "warning"} icon={proba.ok ? CheckCircle : AlertTriangle}>
            <span className="block">{proba.mesaj}</span>
            {proba.servicii.length > 0 && (
              <span className="mt-1 block text-xs">Servicii întoarse: {proba.servicii.join(", ")}</span>
            )}
            {proba.valuta && (
              <span className="mt-1 block text-xs">
                Valuta cotării: <strong>{proba.valuta}</strong>
                {proba.valuta.includes("RON")
                  ? ""
                  : ". Magazinul lucrează în lei. Nu convertim noi sumele, deci FedEx va apărea la comandă la tariful fix. Cere-i reprezentantului FedEx tarife în RON."}
              </span>
            )}
            {/*
              ⚠ Raspunsul la intrebarea „preturile FedEx sunt cu sau fara TVA?".
              Documentatia lor nu o spune pentru Romania, dar raspunsul de cotare
              aduce toate cele trei numere, deci se DEDUCE aici, o data pe cont,
              in loc sa fie masurat de om la prima expediere.
            */}
            {proba.ok && <span className="mt-1 block text-xs">{proba.tva}</span>}
            {proba.virtual && (
              <span className="mt-1 block text-xs">Răspuns din sandbox-ul FedEx: prețurile sunt simulate și nu depind de adresa reală.</span>
            )}
          </Callout>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de expediție">
        <Callout variant="info" icon={Info}>
          De aici pleacă fiecare colet, și tot de aici se calculează tariful. Codul poștal e obligatoriu: România e țară
          „postal-aware” la FedEx (șase cifre), iar fără el cotarea nu se poate face deloc.
        </Callout>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nume persoană de contact">
            <Input value={expeditor.nume ?? ""} onChange={(e) => setExpeditor({ nume: e.target.value })} />
          </Field>
          <Field label="Firmă">
            <Input value={expeditor.companie ?? ""} onChange={(e) => setExpeditor({ companie: e.target.value })} />
          </Field>
          <Field label="Telefon" hint="Maxim 15 caractere la FedEx.">
            <Input value={expeditor.telefon ?? ""} onChange={(e) => setExpeditor({ telefon: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={expeditor.email ?? ""} onChange={(e) => setExpeditor({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Strada și numărul" hint="Se împarte automat pe trei linii de câte 35 de caractere, cum cere FedEx.">
          <Input value={expeditor.strada ?? ""} onChange={(e) => setExpeditor({ strada: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Oraș">
            <Input value={expeditor.oras ?? ""} onChange={(e) => setExpeditor({ oras: e.target.value })} />
          </Field>
          <Field label="Județ" hint="Opțional: FedEx cere județul doar pentru SUA, Canada și Puerto Rico.">
            <Input value={expeditor.judet ?? ""} onChange={(e) => setExpeditor({ judet: e.target.value })} />
          </Field>
          <Field label="Cod poștal">
            <Input value={expeditor.cod_postal ?? ""} onChange={(e) => setExpeditor({ cod_postal: e.target.value })} />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Ce se oferă la comandă"
        descriere={`Serviciile pe care le arăți clienților. Nimic bifat înseamnă toate serviciile întoarse de cotare. Serviciile de marfă grea nu se oferă la colete sub ${GREUTATE_MAXIMA_EXPRESS_KG} kg, oricum ar fi bifate; rămân la emiterea din pagina comenzii.`}>
        <div className="flex flex-wrap gap-2">
          {servicii.map((s) => {
            const bifat = permise.includes(s.cod);
            return (
              <button
                key={s.cod}
                type="button"
                aria-pressed={bifat}
                onClick={() => setConfig({
                  ...config,
                  servicii_permise: bifat ? permise.filter((x) => x !== s.cod) : [...permise, s.cod],
                })}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
                title={s.marfaGrea ? "Marfă grea: nu se oferă la comandă pentru colete ușoare" : undefined}
              >
                {s.nume}
              </button>
            );
          })}
        </div>
        {/*
          ⚠ Se spune PE FATA, nu se lasa comerciantul sa descopere singur.
          FedEx cere codul postal al destinatarului ca sa coteze (Romania e tara
          „postal-aware" la ei), iar checkout-ul nu il colecteaza la livrarile interne.
          Fara randurile astea, omul ar vedea „conexiunea merge" aici si un pret fix in
          magazin, si ar cauta o zi ce a stricat.
        */}
        <Callout variant="info" icon={Info} title="Cum apare prețul în magazin">
          La comandă, FedEx apare la <strong>tariful fix</strong> din Setări, Livrare: FedEx cere codul poștal al destinatarului ca
          să calculeze un preț, iar formularul de comandă îl cere doar la livrările în străinătate. Prețul real îl vezi când emiți
          AWB-ul din pagina comenzii, unde poți completa codul poștal. Pune deci un tarif fix realist: cel mai ieftin serviciu
          intern FedEx pornește mult peste tarifele curierilor locali.
        </Callout>
      </Sectiune>

      <Sectiune pas={4} titlu="Ridicare și etichetă">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cum ajunge coletul la FedEx" htmlFor="fedex-ridicare">
            <select id="fedex-ridicare" className={selectCls} value={config.pickup_type ?? "USE_SCHEDULED_PICKUP"} onChange={(e) => setConfig({ ...config, pickup_type: e.target.value as TipRidicare })}>
              {RIDICARI.map((r) => <option key={r.valoare} value={r.valoare}>{r.eticheta}</option>)}
            </select>
          </Field>
          <Field label="Formatul etichetei" htmlFor="fedex-format">
            <select id="fedex-format" className={selectCls} value={config.format_eticheta ?? "PDF"} onChange={(e) => setConfig({ ...config, format_eticheta: e.target.value as FormatEticheta })}>
              {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
            </select>
          </Field>
        </div>
        <Field
          label="Dimensiunea hârtiei"
          htmlFor="fedex-hartie"
          hint="Numele conține dimensiunea în inch: 4X6 = 4×6&quot;, 85X11 = jumătate de coală. PAPER = coală, STOCK = rolă termică."
        >
          <select id="fedex-hartie" className={selectCls} value={config.stoc_eticheta ?? STOC_IMPLICIT} onChange={(e) => setConfig({ ...config, stoc_eticheta: e.target.value })}>
            {STOCURI_ETICHETA.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">
          FedEx nu permite retipărirea etichetei prin API, iar linkul din răspunsul lor expiră în câteva ore. De aceea o păstrăm
          noi, la emitere, și o poți descărca oricând din pagina comenzii.
        </p>
      </Sectiune>

      <Sectiune pas={5} titlu="Coletul implicit"
        descriere="Se folosesc când comanda n-are dimensiuni proprii. FedEx facturează maximul dintre greutatea fizică și cea volumetrică, deci dimensiuni prea mari scumpesc fiecare colet.">
        <div className="grid grid-cols-3 gap-3">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Lățime"], ["inaltime_cm", "Înălțime"]] as const).map(([cheie, eticheta]) => (
            <Field key={cheie} label={`${eticheta} (cm)`}>
              <Input
                type="number"
                min={1}
                max={999}
                value={config[cheie] ?? ""}
                onChange={(e) => setConfig({ ...config, [cheie]: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
          ))}
        </div>
        <Field label="Descrierea mărfii" htmlFor="fedex-continut"
          hint="Se tipărește pe factura comercială, la expedierile internaționale. La cele interne nu pleacă nicăieri.">
          <Input id="fedex-continut" value={config.continut_implicit ?? ""} placeholder="Bunuri de consum" onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })} />
        </Field>
        <RandComutator
          separat
          titlu="Declară valoarea comenzii la transport"
          text="FedEx taxează separat valoarea declarată. Oprită, coletul merge cu despăgubirea standard."
          activ={!!config.valoare_declarata}
          onChange={(v) => setConfig({ ...config, valoare_declarata: v })}
        />
      </Sectiune>

      {secretSalvat && (
        <ZonaDeconectare descriere="Șterge cheile și adresa FedEx din Edinio. Expedierile deja emise rămân la FedEx.">
          <ButonDeconectare
            nume="FedEx"
            cePierzi="Cheile FedEx, numărul de cont și adresa de expediție se șterg din Edinio. Ca să te întorci, le iei din nou din portalul FedEx pentru dezvoltatori, iar expedierile deja emise rămân la FedEx."
            marime="default"
            onConfirma={deconecteaza}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={salveaza} onSalveaza={salvare} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
