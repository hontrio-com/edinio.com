"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, Globe, Info, KeyRound, Loader2, Truck } from "lucide-react";
import {
  disconnectDhl, getDhlProduseAction, saveDhlConfig, testDhlConnectionAction,
} from "@/lib/actions/dhl.actions";
import {
  FORMAT_IMPLICIT, INCOTERMURI, INCOTERM_IMPLICIT, SABLOANE,
  type DhlConfig, type ExpeditorDhl, type FormatEticheta, type MediuDhl,
} from "@/lib/dhl/client";
import { produsePropuse } from "@/lib/dhl/servicii";
import {
  AVERTISMENT_RAMBURS, DIMENSIUNE_MAXIMA_CM, DIVIZOR_VOLUMETRIC, GREUTATE_MAXIMA_KG,
  PRAG_NECONVENABIL_KG, PRAG_SUPRATAXA_DIMENSIUNE_CM, PRAG_SUPRATAXA_GREUTATE_KG,
  codPostalDhl, sablonPotrivit,
} from "@/lib/dhl/expediere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare, useFormularIntegrare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea DHL Express.
 *
 * ═══ ⚠ CINCI LUCRURI CARE SE GRESESC USOR, SI COSTA ═══
 *
 * 1. **DHL are DOUA perechi de credentiale, iar documentatia lor nu le distinge.**
 *    „API Key" / „API Secret" din aplicatia de pe developer.dhl.com deschid API-urile
 *    unificate; MyDHL API cere un UTILIZATOR si o PAROLA date de consultantul DHL Express.
 *    Lipite gresit, raspunsul e 401 fara nicio explicatie, la fiecare cotare, deci fiecare
 *    cumparator vede tariful fix. De aia campurile de mai jos se cheama exact asa.
 *
 * 2. **Mediul de productie e PREFIXUL celui de test** (`.../mydhlapi` fata de
 *    `.../mydhlapi/test`). La FedEx si UPS erau gazde complet diferite si o nepotrivire
 *    dadea 404; aici da o expediere REALA, facturata, care nu se poate anula. Si
 *    credentialele de test sunt cel mai probabil altele decat cele de productie: cheia de
 *    productie se emite dupa certificare.
 *
 * 3. **Rambursul nu se vinde cu origine Romania.** Nu exista comutator fiindca nu exista
 *    ce comuta: `KB` cade abia la EMITERE, cu `7008`, adica dupa ce cumparatorul a comandat
 *    si a platit asteptand. Pe comenzile cu plata la livrare DHL nu apare deloc in checkout.
 *
 * 4. **Codul postal e obligatoriu si are sase cifre pentru Romania.** Nomenclatorul lor da
 *    `999999 | 6 | RO`. Un cod cu cinci cifre nu e ignorat, cade cotarea cu `420506`, iar
 *    mesajul lor nu spune al cui e codul: al expeditorului sau al destinatarului.
 *
 * 5. **Formatul etichetei si sablonul ei trebuie sa se potriveasca.** `ECOM26_A4_001` exista
 *    doar in PDF, `ECOM26_84_001` doar in ZPL/LP2/EPL2. Perechea gresita nu da o eticheta
 *    stricata, da o eroare la emitere, iar comerciantul care si-a schimbat imprimanta n-are
 *    de unde sa lege cele doua setari. De asta lista de sabloane se filtreaza dupa format.
 */

const MEDII: { valoare: MediuDhl; eticheta: string }[] = [
  { valoare: "productie", eticheta: "Producție (express.api.dhl.com/mydhlapi): expedieri reale, facturate" },
  { valoare: "test", eticheta: "Test (.../mydhlapi/test): expedieri simulate, care nu se pot urmări" },
];

/**
 * ⚠ Numele de aici sunt cele din NOMENCLATORUL lor de imagini (`PDF, ZPL, LP2, EPL2`), nu
 * cele din enumerarea cererii (`pdf, zpl, lp2, epl`, minuscule si „epl" fara 2). Conversia
 * o face `formatCerut()` la trimitere; scrise aici in forma cererii, ar fi ajuns asa si in
 * `dhl_etichete.format`, unde comparatia cu ce intorc ei ar fi picat tacut.
 */
const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "PDF", eticheta: "PDF (orice imprimantă, inclusiv una obișnuită de birou)" },
  { valoare: "ZPL", eticheta: "ZPL (imprimantă termică de etichete)" },
  { valoare: "EPL2", eticheta: "EPL2 (imprimantă termică)" },
  { valoare: "LP2", eticheta: "LP2 (imprimantă termică)" },
];

/**
 * Aplatizarea locala a lui `ProbaDhl`, ca sa nu se plimbe obiecte imbricate prin randare.
 *
 * ⚠ `rambursOferit` NU se cheama „rambursOk", si nu din cochetarie. La UPS `ramburs.ok`
 * insemna „merge, e bine". La DHL, adevarat inseamna ca DHL a intors `KB` pentru contul
 * asta, ceea ce contrazice patru surse comerciale ale lor si trebuie confirmat cu
 * reprezentantul inainte sa se bazeze cineva pe el. Adica polaritatea culorii e INVERSA
 * fata de UPS, iar un nume care sugereaza „ok" ar fi facut pe cineva sa o coloreze verde.
 */
type Proba = {
  mediu: MediuDhl;
  ok: boolean;
  mesaj: string;
  produse: { cod: string; nume: string }[];
  valuta: string | null;
  alerte: string[];
  cerContract: string[];
  rambursOferit: boolean;
  rambursMesaj: string;
};

type Produs = { cod: string; nume: string; intern: boolean; extern: boolean; document: boolean };

/** „intern si extern · colete", pentru pastila din checkout. */
function insemneProdus(p: Produs): string {
  const unde = p.intern && p.extern ? "intern și extern" : p.intern ? "intern" : "extern";
  return `${unde}, ${p.document ? "documente" : "colete"}`;
}

export function DhlConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: DhlConfig | null;
}) {
  const router = useRouter();
  const { cfg: config, setCfg: setConfig, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<DhlConfig>({
    enabled: initialConfig?.enabled ?? false,
    username: initialConfig?.username ?? "",
    password: initialConfig?.password ?? "",
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
    produse_permise: initialConfig?.produse_permise ?? [],
    format_eticheta: initialConfig?.format_eticheta ?? FORMAT_IMPLICIT,
    /* ⚠ Perechea format+sablon se aseaza chiar la deschiderea paginii: un config vechi,
       salvat inainte de o schimbare de format, ar fi purtat un sablon care nu mai exista
       pentru formatul ales, si abia emiterea ar fi spus-o. */
    sablon_eticheta: sablonPotrivit(
      initialConfig?.format_eticheta ?? FORMAT_IMPLICIT,
      initialConfig?.sablon_eticheta,
    ),
    lungime_cm: initialConfig?.lungime_cm,
    latime_cm: initialConfig?.latime_cm,
    inaltime_cm: initialConfig?.inaltime_cm,
    continut_implicit: initialConfig?.continut_implicit ?? "",
    valoare_declarata: initialConfig?.valoare_declarata ?? false,
    asigurare_activa: initialConfig?.asigurare_activa ?? false,
    incoterm: initialConfig?.incoterm ?? INCOTERM_IMPLICIT,
    cere_ridicare: initialConfig?.cere_ridicare ?? false,
    notifica_destinatarul: initialConfig?.notifica_destinatarul ?? false,
  });

  const [salveaza, setSalveaza] = useState(false);
  const [probeaza, setProbeaza] = useState(false);
  const [proba, setProba] = useState<Proba | null>(null);
  const [produse, setProduse] = useState<Produs[]>(
    produsePropuse(initialConfig?.expeditor?.tara ?? "RO"),
  );

  const expeditor = config.expeditor ?? ({} as ExpeditorDhl);
  const setExpeditor = (patch: Partial<ExpeditorDhl>) =>
    setConfig((c) => ({ ...c, expeditor: { ...(c.expeditor ?? {} as ExpeditorDhl), ...patch } }));

  /*
   * ⚠ „Parola e pusa?" se citeste din CONFIGUL SALVAT, nu din campul din ecran.
   *
   * Campul poarta substituentul cand exista deja o parola criptata in baza, iar o verificare
   * pe lungimea lui ar raspunde „da" si pentru substituent, si pentru o parola stearsa din
   * greseala. Comerciantul cu integrarea deja configurata trebuie sa poata salva un simplu
   * comutator fara sa-si rescrie parola.
   */
  const areSecret = secretulEsteSalvat(initialConfig, "password") || !!config.password.trim();

  const contScris = config.account_number.trim();
  /* ⚠ `accounts[].number` are `maxLength: 12`. Contul romanesc are noua cifre; peste
     douasprezece caractere e aproape sigur cheia de API lipita in campul gresit. */
  const contBun = contScris.length > 0 && contScris.length <= 12;
  const areChei = !!config.username.trim() && areSecret && contBun;

  const taraExpeditor = ((expeditor.tara ?? "RO").trim() || "RO").toUpperCase();
  const codPostalScris = (expeditor.cod_postal ?? "").trim();
  /* Aceeasi regula ca pe server: `codPostalDhl` intoarce sirul gol cand formatul tarii nu
     iese, si atunci cotarea ar cadea la ei cu `420506`. */
  const codPostalBun = !codPostalScris || !!codPostalDhl(codPostalScris, taraExpeditor);
  const areExpeditor = !!(expeditor.oras ?? "").trim() && !!codPostalScris;

  /*
   * ⚠ IDENTIC cu `dhlGata()` de pe server, cu `activeCourierIds` din Setari, cu pagina
   * comenzii si cu cardul din hub. CINCI locuri care trebuie sa spuna acelasi lucru,
   * altfel panoul arata „conectat" pentru o integrare care nu poate cota nimic, si
   * niciunul dintre cele cinci nu da eroare cand difera.
   *
   * ⚠ Si tocmai de aceea formatul codului postal NU intra aici, desi il verificam mai jos:
   * `dhlGata` cere codul postal doar COMPLETAT. Adaugat aici, panoul ar spune „nu e activ"
   * pentru un magazin pe care serverul il considera activ, si comerciantul ar cauta la
   * nesfarsit un comutator stins care de fapt e pornit.
   */
  const esteActiv = !!config.enabled && !!config.username.trim() && areSecret
    && !!contScris && areExpeditor;

  const format = config.format_eticheta ?? FORMAT_IMPLICIT;
  const sabloanePotrivite = SABLOANE.filter((s) => s.formate.includes(format));

  /** Ce se trimite la server. ⚠ Parola neatinsa pleaca GOALA, ca sa fie pastrata. */
  const construieste = (): DhlConfig => ({
    ...config,
    username: config.username.trim(),
    password: config.password === PLACEHOLDER_SECRET_SALVAT ? "" : config.password.trim(),
    account_number: contScris,
    continut_implicit: (config.continut_implicit ?? "").trim(),
    produse_permise: (config.produse_permise ?? []).filter(Boolean),
    incoterm: ((config.incoterm ?? INCOTERM_IMPLICIT).trim().toUpperCase()) || INCOTERM_IMPLICIT,
    /* A doua asezare a perechii, la plecare: intre deschiderea paginii si salvare formatul
       se poate schimba de mai multe ori. */
    sablon_eticheta: sablonPotrivit(format, config.sablon_eticheta),
    expeditor: {
      ...expeditor,
      nume: (expeditor.nume ?? "").trim(),
      companie: (expeditor.companie ?? "").trim(),
      telefon: (expeditor.telefon ?? "").trim(),
      email: (expeditor.email ?? "").trim(),
      strada: (expeditor.strada ?? "").trim(),
      oras: (expeditor.oras ?? "").trim(),
      judet: (expeditor.judet ?? "").trim(),
      cod_postal: codPostalScris,
      tara: taraExpeditor,
    },
  });

  const salvare = async () => {
    setSalveaza(true);
    const r = await saveDhlConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Configurarea DHL a fost salvată.");
    marcheazaSalvat();
    const p = await getDhlProduseAction(businessId);
    if (p.ok) setProduse(p.produse);
    router.refresh();
  };

  const testeaza = async () => {
    setProbeaza(true);
    const r = await testDhlConnectionAction(businessId, construieste());
    setProbeaza(false);
    if (!r.ok) { toast.error(r.error, { duration: 15000 }); return; }

    setProba({
      mediu: r.proba.mediu,
      ok: r.proba.cotare.ok,
      mesaj: r.proba.cotare.mesaj,
      produse: r.proba.cotare.produse,
      valuta: r.proba.cotare.valuta,
      alerte: r.proba.cotare.alerte,
      cerContract: r.proba.cotare.cerContract,
      rambursOferit: r.proba.ramburs.ok,
      rambursMesaj: r.proba.ramburs.mesaj,
    });

    if (!r.proba.cotare.ok) { toast.error(r.proba.cotare.mesaj, { duration: 15000 }); return; }
    toast.success(r.proba.cotare.mesaj);
  };

  const deconecteaza = async () => {
    const r = await disconnectDhl(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("DHL a fost deconectat.");
    router.refresh();
  };

  const permise = config.produse_permise ?? [];

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const activSalvat = !!initialConfig?.enabled && !!initialConfig?.username && parolaSalvata && !!initialConfig?.account_number
    && !!(initialConfig?.expeditor?.oras ?? "").trim() && !!(initialConfig?.expeditor?.cod_postal ?? "").trim();
  const stari: StareAntet[] = !parolaSalvata
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      activSalvat ? { ton: "bun", text: "Activ" } : { ton: "neutru", text: "Oprit" },
      ...(initialConfig?.mediu === "test" ? [{ ton: "asteptare" as const, text: "Mediu de test" }] : []),
    ];

  return (
    <PaginaIntegrare
      id="dhl"
      titlu="Livrare"
      descriere="Colete prin DHL Express: livrări interne și în toată lumea, cu tarifele contractului tău și eticheta în PDF."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="DHL la livrare" activ={!!config.enabled} onChange={(v) => setConfig({ ...config, enabled: v })} ariaLabel="Folosește DHL pentru livrare" textPornit="Pornit" textOprit="Oprit" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Utilizatorul, parola și contul", facut: areChei },
          { text: "Orașul și codul poștal de expediție", facut: areExpeditor && codPostalBun },
          { text: "DHL pornit", facut: esteActiv },
        ]} />
        <CumFunctioneaza id="dhl" puncte={[
          { Icon: KeyRound, text: "Utilizatorul și parola MyDHL API le primești de la consultantul tău DHL Express, nu de pe portalul pentru dezvoltatori." },
          { Icon: Ban, text: "DHL Express nu oferă plata la livrare: la comenzile cu ramburs nu apare deloc la comandă." },
          { Icon: Globe, text: "În afara Uniunii Europene se descarcă și factura comercială; fără ea, marfa se oprește în vamă." },
          { Icon: Truck, text: "După salvare, pornește și metoda „DHL” din Setări, Livrare." },
        ]} />
      </>}
    >
      {config.enabled && !areExpeditor && (
        <Callout variant="warning" icon={AlertTriangle}>
          Fără oraș și cod poștal de expediție, DHL nu poate cota nimic, iar clienții vor vedea tariful fix în loc de prețul real.
        </Callout>
      )}
      {config.enabled && !codPostalBun && (
        <Callout variant="warning" icon={AlertTriangle}>
          Codul poștal de expediție nu are formatul cerut de DHL, deci fiecare cotare va fi respinsă. Repară-l înainte de salvare.
        </Callout>
      )}
      {config.mediu === "test" && (
        <Callout variant="warning" icon={AlertTriangle}>
          Ești pe mediul de test al DHL. Expedierile emise acolo nu intră în rețeaua lor, nu se pot urmări și nu le ridică
          nimeni. Treci pe producție înainte de prima comandă adevărată, și verifică atunci că utilizatorul și parola sunt cele
          de producție: DHL dă de obicei alte credențiale pentru fiecare mediu.
        </Callout>
      )}
      {esteActiv && config.mediu !== "test" && (
        <Callout variant="info" icon={Info}>
          <span className="block">
            Fiecare AWB emis e real și facturat, iar DHL nu are protecție contra dublurilor: dacă emiterea pare că a eșuat,
            folosește „Verifică la DHL” din pagina comenzii, în loc să încerci din nou. Butonul caută expedierea după
            referința comenzii și o adoptă dacă ea există deja.
          </span>
          <span className="mt-1 block text-xs">
            DHL nu are nici anulare de expediere: „Dezleagă AWB-ul” din editarea comenzii scoate numerele de pe comandă și
            anulează ridicarea, dacă a fost cerută, dar eticheta rămâne emisă. Dacă a fost deja facturată, se rezolvă doar cu
            reprezentantul DHL.
          </span>
        </Callout>
      )}

      <Sectiune pas={1} titlu="Conectare">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Utilizator MyDHL API"
            ajutor={
              <ExplicatieCard
                marime="mic"
                intrebare="Ce se scrie aici"
                eticheta="Utilizator MyDHL API"
                text={`Nu e „API Key” din aplicația de pe developer.dhl.com.

E utilizatorul MyDHL API, primit de la consultantul tău DHL Express, de obicei după certificarea integrării.

Nu se ascunde: îți arată ce cont ai legat.`}
              />
            }
          >
            <Input value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} />
          </Field>

          <Field
            label="Parola MyDHL API"
            ajutor={
              <ExplicatieCard
                marime="mic"
                intrebare="Ce se scrie aici"
                eticheta="Parola MyDHL API"
                text={`Perechea utilizatorului de mai sus, tot de la consultantul DHL Express.

Nu e „API Secret” de pe portalul lor pentru dezvoltatori: cheia de portal e respinsă cu 401, fără nicio explicație.

Se criptează și nu se mai afișează.`}
              />
            }
          >
            <Input
              type="password"
              value={config.password}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : "parola ta"}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
            />
          </Field>

          <Field
            label="Număr de cont DHL Express"
            error={contScris.length > 12 ? `Numărul are ${contScris.length} caractere, iar DHL acceptă cel mult 12. Dacă ai lipit aici cheia de API, ea nu se pune în acest câmp.` : undefined}
            ajutor={
              <ExplicatieCard
                marime="mic"
                intrebare="Ce se scrie aici"
                eticheta="Număr de cont DHL Express"
                text={`Cel de pe factura DHL, nouă cifre în România.

Nu e o credențială, dar fără el cotarea întoarce tarifele publicate în loc de ale tale. Prețul iese greșit, și nu apare nicio eroare.`}
              />
            }
          >
            <Input value={config.account_number} placeholder="123456789" onChange={(e) => setConfig({ ...config, account_number: e.target.value })} />
          </Field>

          <Field
            label="Mediu"
            htmlFor="dhl-mediu"
            ajutor={
              <ExplicatieCard
                marime="mic"
                intrebare="La ce să fiu atent"
                eticheta="Mediul DHL"
                text="Credențialele de test și cele de producție sunt de obicei DIFERITE la DHL: cheia de producție se emite după certificarea integrării. Și, mai grav, adresa de producție e prefixul celei de test, deci o nepotrivire nu dă 404, ci o expediere REALĂ, facturată, care nu se poate anula."
              />
            }
          >
            <select id="dhl-mediu" className={selectCls} value={config.mediu ?? "productie"} onChange={(e) => setConfig({ ...config, mediu: e.target.value as MediuDhl })}>
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
              Completează întâi orașul și codul poștal de expediție: proba chiar cere o cotare reală, nu doar un răspuns de autentificare.
            </p>
          )}
        </div>

        {proba && (
          <Callout variant={proba.ok ? "success" : "warning"} icon={proba.ok ? CheckCircle : AlertTriangle}>
            <span className="block">{proba.mesaj}</span>
            {proba.produse.length > 0 && (
              <span className="mt-1 block text-xs">Produse întoarse: {proba.produse.map((p) => `${p.cod} (${p.nume})`).join(", ")}</span>
            )}
            {proba.valuta && (
              <span className="mt-1 block text-xs">
                Valuta cotării: <strong>{proba.valuta}</strong>
                {proba.valuta.includes("RON")
                  ? ""
                  : ". Magazinul lucrează în lei, iar noi nu convertim sumele, deci DHL va apărea la comandă la tariful fix. Cere-i reprezentantului DHL tarifele în RON pe contul tău."}
              </span>
            )}
            {proba.cerContract.length > 0 && (
              <span className="mt-1 block text-xs">
                Produse pe care DHL le marchează ca având nevoie de un acord separat: {proba.cerContract.join(", ")}. Ele apar în
                cotare, dar emiterea poate fi refuzată până când contractul le cuprinde.
              </span>
            )}
            {/*
              ⚠ Raspunsul la intrebarea „merge rambursul pe contul meu?", pusa la fiecare proba.
              Polaritatea e INVERSA fata de UPS: aici „a intors KB" e vestea neasteptata, nu cea
              buna. Vezi nota de pe tipul `Proba`.
            */}
            <span className={`mt-1 block text-xs ${proba.rambursOferit ? "text-warning" : ""}`}>{proba.rambursMesaj}</span>
            {proba.alerte.length > 0 && (
              <span className="mt-1 block text-xs">DHL a răspuns și cu: {proba.alerte.join(" | ")}</span>
            )}
            {proba.mediu === "test" && (
              <span className="mt-1 block text-xs">
                Răspuns din mediul lor de test. Expedierile create acolo nu intră în rețeaua DHL, nu se pot urmări și nu le ridică nimeni.
              </span>
            )}
          </Callout>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de expediție">
        <Callout variant="info" icon={Info}>
          De aici pleacă fiecare colet, și tot de aici se calculează tariful. Codul poștal și telefonul sunt amândouă
          obligatorii la DHL, și la expedierile interne, nu doar la cele externe: fără ele nu se face nicio cotare și niciun AWB.
        </Callout>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nume persoană de contact">
            <Input value={expeditor.nume ?? ""} onChange={(e) => setExpeditor({ nume: e.target.value })} />
          </Field>
          <Field label="Firmă">
            <Input value={expeditor.companie ?? ""} onChange={(e) => setExpeditor({ companie: e.target.value })} />
          </Field>
          <Field label="Telefon" hint="Obligatoriu la DHL pe orice expediere. Se trimite cu prefixul țării.">
            <Input value={expeditor.telefon ?? ""} onChange={(e) => setExpeditor({ telefon: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={expeditor.email ?? ""} onChange={(e) => setExpeditor({ email: e.target.value })} />
          </Field>
        </div>
        <Field
          label="Strada și numărul"
          hint="Se împarte automat în cel mult trei linii de câte 45 de caractere, cum cere DHL. Ce nu încape se pierde, deci scrie adresa scurt."
        >
          <Input value={expeditor.strada ?? ""} onChange={(e) => setExpeditor({ strada: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Oraș">
            <Input value={expeditor.oras ?? ""} onChange={(e) => setExpeditor({ oras: e.target.value })} />
          </Field>
          <Field label="Județ" hint="Opțional. La DHL câmpul înseamnă „cartier sau județ” și nu e nomenclator: nu înlocuiește codul poștal.">
            <Input value={expeditor.judet ?? ""} onChange={(e) => setExpeditor({ judet: e.target.value })} />
          </Field>
          <Field
            label="Cod poștal"
            hint={taraExpeditor === "RO" ? "Șase cifre, formatul cerut de DHL pentru România." : undefined}
            /* ⚠ Validare VIZIBILA, nu doar pe server: un cod cu cinci cifre nu e ignorat de DHL,
               ci taie cotarea cu `420506 Postcode not found`, iar mesajul lor nu spune daca e
               vinovat codul expeditorului sau al destinatarului. */
            error={!codPostalBun
              ? (taraExpeditor === "RO"
                ? "Codul poștal românesc are exact șase cifre. Așa cum e scris acum, DHL respinge cotarea."
                : "Codul poștal nu are un format pe care DHL să-l accepte.")
              : undefined}
          >
            <Input
              value={expeditor.cod_postal ?? ""}
              placeholder={taraExpeditor === "RO" ? "010101" : ""}
              onChange={(e) => setExpeditor({ cod_postal: e.target.value })}
            />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Ce se oferă la comandă"
        descriere="Produsele DHL pe care le arăți clienților. Nimic bifat înseamnă tot ce întoarce cotarea. Filtrul adevărat e al lor: cotarea se face cu numărul tău de cont, deci DHL răspunde deja cu ce îți vinde pe ruta cerută. Bifele doar restrâng lista.">
        <div className="flex flex-wrap gap-2">
          {produse.map((p) => {
            const bifat = permise.includes(p.cod);
            return (
              <button
                key={p.cod}
                type="button"
                aria-pressed={bifat}
                onClick={() => setConfig({
                  ...config,
                  produse_permise: bifat ? permise.filter((x) => x !== p.cod) : [...permise, p.cod],
                })}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
                title={`Cod DHL ${p.cod}`}
              >
                {p.nume}
                <span className="opacity-60"> · {insemneProdus(p)}</span>
              </button>
            );
          })}
        </div>
        {produse.length === 0 && (
          <p className="text-xs text-muted-foreground">Nu propunem o listă pentru țara de expediție aleasă. Se oferă tot ce întoarce cotarea.</p>
        )}

        {/*
          ⚠ Se spune limpede ca livrarea in punct NU exista, ca omul sa nu caute comutatorul.
          Ceilalti curieri au unul, deci absenta lui arata ca o scapare a noastra.
        */}
        <Callout variant="info" icon={Info} title="DHL livrează doar la adresă, nu și în puncte de ridicare">
          Punctele lor există în API, dar livrarea către un punct trece prin serviciul „on demand delivery”, care cere un
          identificator de punct pe care DHL îl dă doar prin managerul tău de cont, iar acoperirea pentru România nu se poate
          verifica din documentația lor publică. Am preferat să nu oferim la comandă ceva ce s-ar putea rupe la emitere, după
          ce cumpărătorul a plătit.
        </Callout>

        {/*
          ⚠ SECTIUNE DE INFORMARE, FARA COMUTATOR, si asta e o hotarare, nu o scapare.
          Un comutator la tarif fix ar fi fost ales de cumparator, iar comerciantul ar fi
          aflat abia la emitere ca AWB-ul nu se poate face: comanda blocata, banii neincasati.
          Aceeasi asezare ca la FedEx.
        */}
        <Callout variant="warning" icon={Ban} title="DHL Express nu oferă plata la livrare">
          <span className="block">{AVERTISMENT_RAMBURS}</span>
          <span className="mt-1 block text-xs">
            Nu există comutator fiindcă nu există ce comuta. Pe comenzile cu plata la livrare, DHL nu apare deloc la comandă,
            iar celelalte metode de livrare rămân neatinse. „Testează conexiunea” verifică de fiecare dată, pe contul TĂU, dacă
            DHL a început totuși să ofere serviciul; dacă vreodată apare, îți spune în rezultatul probei.
          </span>
        </Callout>
      </Sectiune>

      <Sectiune pas={4} titlu="Eticheta">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Formatul etichetei"
            htmlFor="dhl-format"
            hint="PDF-ul e implicit fiindcă se tipărește la orice imprimantă. Celelalte trei sunt limbaje de imprimantă termică."
          >
            <select
              id="dhl-format"
              className={selectCls}
              value={format}
              onChange={(e) => {
                const nou = e.target.value as FormatEticheta;
                /* ⚠ Sablonul se reaseaza ODATA cu formatul. Lasat pe loc, un sablon PDF cerut cu
                   `zpl` nu da o eticheta stricata, da o eroare la emitere, si abia atunci ar fi
                   aflat comerciantul care si-a schimbat imprimanta ca mai avea o setare de mutat. */
                setConfig({ ...config, format_eticheta: nou, sablon_eticheta: sablonPotrivit(nou, config.sablon_eticheta) });
              }}
            >
              {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
            </select>
          </Field>
          <Field label="Șablonul etichetei" htmlFor="dhl-sablon" hint="Lista arată doar șabloanele care merg cu formatul ales. Schimbi formatul, se schimbă și ea.">
            <select id="dhl-sablon" className={selectCls} value={sablonPotrivit(format, config.sablon_eticheta)} onChange={(e) => setConfig({ ...config, sablon_eticheta: e.target.value })}>
              {sabloanePotrivite.map((s) => <option key={s.valoare} value={s.valoare}>{s.eticheta}</option>)}
            </select>
          </Field>
        </div>

        {/*
          ⚠ AICI SCRIA SI CA „odata cu eticheta se descarca si documentul de transport,
          arhiva ta de expeditor". Nu era adevarat niciodata: `waybillDoc` se cerea la
          emitere, dar schema raspunsului lor enumera doar `invoice, proforma, label or
          receipt`, deci documentul nu venea, coloana `document_transport` ramanea goala si
          butonul „Descarca eticheta" n-avea ce sa scoata. Mai rau, ceruta, a doua hartie
          vine tot etichetata `label`, deci putea fi luata drept eticheta de lipit pe colet,
          la un curier fara reimprimare si fara anulare de expediere. Cererea nu mai cere
          `waybillDoc`, deci pagina nu-l mai promite: o fagaduiala pe care descarcarea n-o
          tine il pune pe comerciant sa caute un fisier inexistent si il invata sa nu mai
          creada nici restul notelor de aici.
        */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          La expedierile în afara Uniunii Europene se descarcă, odată cu eticheta, și <strong className="text-foreground">factura
          comercială</strong>, mereu în PDF, oricare ar fi formatul ales. Fără ea tipărită și atașată la colet, marfa se oprește în vamă.
        </p>
      </Sectiune>

      <Sectiune pas={5} titlu="Coletul implicit și vama">
        <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
          Dimensiunile se folosesc când comanda n-are unele proprii. DHL facturează maximul dintre greutatea fizică și cea
          volumetrică, iar volumetricul lor se împarte la {DIVIZOR_VOLUMETRIC}, nu la 6000 ca la alți curieri: o cutie prea
          mare scumpește fiecare colet. Limita pe colet e {GREUTATE_MAXIMA_KG} kg; peste {PRAG_SUPRATAXA_GREUTATE_KG} kg (reali
          sau volumetrici) sau peste {PRAG_SUPRATAXA_DIMENSIUNE_CM} cm pe o latură se adaugă suprataxele lor fixe, iar între
          {" "}{PRAG_NECONVENABIL_KG} și {GREUTATE_MAXIMA_KG} kg reali se adaugă taxa de colet nemanevrabil.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Lățime"], ["inaltime_cm", "Înălțime"]] as const).map(([cheie, eticheta]) => (
            <Field key={cheie} label={`${eticheta} (cm)`}>
              <Input
                type="number"
                min={1}
                max={DIMENSIUNE_MAXIMA_CM}
                value={config[cheie] ?? ""}
                onChange={(e) => setConfig({ ...config, [cheie]: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Descrierea mărfii"
            htmlFor="dhl-continut"
            hint="Cel puțin trei caractere reale: DHL respinge descrierile mai scurte cu codul 7143. Apare pe documentele vamale ale expedierilor din afara Uniunii Europene."
          >
            <Input id="dhl-continut" value={config.continut_implicit ?? ""} placeholder="Bunuri de consum" onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })} />
          </Field>
          <Field label="Incoterm" htmlFor="dhl-incoterm" hint="Cine plătește taxele vamale la destinație. DHL îl cere pe fiecare expediere, chiar și pe una internă.">
            <select id="dhl-incoterm" className={selectCls} value={config.incoterm ?? INCOTERM_IMPLICIT} onChange={(e) => setConfig({ ...config, incoterm: e.target.value })}>
              {INCOTERMURI.map((i) => <option key={i.cod} value={i.cod}>{i.eticheta}</option>)}
            </select>
          </Field>
        </div>
        {(config.incoterm ?? INCOTERM_IMPLICIT) === "DDP" && (
          <Callout variant="warning" icon={AlertTriangle}>
            {/* ⚠ „Ca sa fie sigur" e exact motivul pentru care se alege gresit DDP. */}
            Cu <strong>DDP</strong> plătești TU taxele vamale și TVA-ul de la destinație, pe TOATE expedierile în afara Uniunii
            Europene, iar DHL ți le refacturează după livrare, cu un comision de vămuire deasupra. Pe un colet de 300 de lei
            către o țară terță, factura poate depăși valoarea comenzii. <strong>DAP</strong> lasă taxele în seama cumpărătorului
            și e așezarea obișnuită a unui magazin românesc.
          </Callout>
        )}

        <RandComutator
          separat
          titlu="Asigură expedierea"
          text="Costă la fiecare colet: 55 de lei sau 1% din valoarea asigurată, care e mai mare. Oprită, coletul merge cu despăgubirea standard din condițiile lor de transport."
          activ={!!config.asigurare_activa}
          onChange={(v) => setConfig({ ...config, asigurare_activa: v })}
        />
        <RandComutator
          separat
          titlu="Declară valoarea comenzii la transport"
          text="Trimite valoarea mărfii pe expediere. La destinațiile vamale ea se declară oricum; aici e vorba de expedierile în care DHL o folosește pentru răspundere și formalități."
          activ={!!config.valoare_declarata}
          onChange={(v) => setConfig({ ...config, valoare_declarata: v })}
        />
        {/* ⚠ Documentatia lor nu spune nicaieri cum ajunge coletul la ei fara asta. */}
        <RandComutator
          separat
          titlu="Cere ridicare de la DHL"
          text="Pornit, la emiterea AWB-ului DHL programează și venirea curierului după colet. Oprit, nu vine nimeni: coletul se duce la un punct DHL sau se predă la ridicarea zilnică din contractul tău. Se poate cere și mai târziu, separat."
          activ={!!config.cere_ridicare}
          onChange={(v) => setConfig({ ...config, cere_ridicare: v })}
        />
        <RandComutator
          separat
          titlu="Anunță destinatarul pe email"
          text="DHL trimite înștiințarea în engleză: româna nu e printre limbile pe care le acceptă pentru înștiințări. De aceea e opțiune, nu implicit."
          activ={!!config.notifica_destinatarul}
          onChange={(v) => setConfig({ ...config, notifica_destinatarul: v })}
        />
      </Sectiune>

      {parolaSalvata && (
        <ZonaDeconectare descriere="Șterge configurarea DHL din Edinio. Expedierile deja emise rămân emise la DHL.">
          <ButonDeconectare
            nume="DHL Express"
            cePierzi="Se șterge toată configurarea DHL din Edinio: utilizatorul MyDHL API, parola, numărul de cont, adresa de expediție și setările de etichetă. Ca să te întorci, le ceri din nou de la consultantul tău DHL Express. Expedierile deja emise rămân emise la DHL: ei nu au anulare de expediere."
            marime="default"
            onConfirma={deconecteaza}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={salveaza} onSalveaza={salvare} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
