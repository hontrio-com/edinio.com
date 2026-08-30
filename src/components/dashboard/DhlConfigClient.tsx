"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, Info, Loader2, Unplug } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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
  { valoare: "productie", eticheta: "Productie (express.api.dhl.com/mydhlapi): expedieri reale, facturate" },
  { valoare: "test", eticheta: "Test (.../mydhlapi/test): expedieri simulate, care nu se pot urmari" },
];

/**
 * ⚠ Numele de aici sunt cele din NOMENCLATORUL lor de imagini (`PDF, ZPL, LP2, EPL2`), nu
 * cele din enumerarea cererii (`pdf, zpl, lp2, epl`, minuscule si „epl" fara 2). Conversia
 * o face `formatCerut()` la trimitere; scrise aici in forma cererii, ar fi ajuns asa si in
 * `dhl_etichete.format`, unde comparatia cu ce intorc ei ar fi picat tacut.
 */
const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "PDF", eticheta: "PDF (orice imprimanta, inclusiv una obisnuita de birou)" },
  { valoare: "ZPL", eticheta: "ZPL (imprimanta termica de etichete)" },
  { valoare: "EPL2", eticheta: "EPL2 (imprimanta termica)" },
  { valoare: "LP2", eticheta: "LP2 (imprimanta termica)" },
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
  const unde = p.intern && p.extern ? "intern si extern" : p.intern ? "intern" : "extern";
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
  const [config, setConfig] = useState<DhlConfig>({
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
    toast.success("Configurarea DHL a fost salvata.");
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

  return (
    <div className="space-y-6">
      <Panel step={1} title="Conectare">
        <Field
          label="Utilizator MyDHL API"
          hint="⚠ NU e „API Key” din aplicatia de pe developer.dhl.com. E utilizatorul MyDHL API, dat de consultantul tau DHL Express, adesea dupa certificarea integrarii. Nu e mascat: iti spune ce cont ai legat."
        >
          <Input
            value={config.username}
            onChange={(e) => setConfig({ ...config, username: e.target.value })}
          />
        </Field>

        <Field
          label="Parola MyDHL API"
          hint="⚠ Perechea utilizatorului de mai sus, tot de la consultantul DHL Express, NU „API Secret” de pe portalul lor pentru dezvoltatori. Cheia de portal e respinsa cu 401 fara nicio explicatie. Se cripteaza in baza si nu se mai afiseaza."
        >
          <Input
            type="password"
            value={config.password}
            placeholder={secretulEsteSalvat(initialConfig, "password") ? PLACEHOLDER_SECRET_SALVAT : "parola ta"}
            onChange={(e) => setConfig({ ...config, password: e.target.value })}
          />
        </Field>

        <Field
          label="Numar de cont DHL Express"
          hint="Cel de pe factura DHL, noua cifre in Romania. Nu e o credentiala, dar fara el cotarea intoarce tarifele PUBLICATE in loc de ale tale: pret gresit, nu eroare."
        >
          <Input
            value={config.account_number}
            placeholder="123456789"
            onChange={(e) => setConfig({ ...config, account_number: e.target.value })}
          />
        </Field>
        {contScris.length > 12 && (
          <p className="text-[11px] text-warning">
            Numarul are {contScris.length} caractere, iar DHL accepta cel mult 12. Daca ai lipit aici cheia de
            API, ea nu se pune in acest camp.
          </p>
        )}

        <Field
          label="Mediu"
          hint="⚠ Credentialele de test si cele de productie sunt de obicei DIFERITE la DHL: cheia de productie se emite dupa certificarea integrarii. Si, mai grav, adresa de productie e prefixul celei de test, deci o nepotrivire nu da 404, ci o expediere REALA, facturata, care nu se poate anula."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.mediu ?? "productie"}
            onChange={(e) => setConfig({ ...config, mediu: e.target.value as MediuDhl })}
          >
            {MEDII.map((m) => <option key={m.valoare} value={m.valoare}>{m.eticheta}</option>)}
          </select>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={testeaza} disabled={probeaza || !areChei || !areExpeditor}>
            {probeaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Testeaza conexiunea
          </Button>
          {areChei && (
            <Button type="button" variant="ghost" onClick={deconecteaza}>
              <Unplug className="h-4 w-4" /> Deconecteaza
            </Button>
          )}
        </div>
        {!areExpeditor && (
          <p className="text-[11px] text-muted-foreground">
            Completeaza intai orasul si codul postal de expeditie: proba chiar cere o cotare reala, nu doar un
            raspuns de autentificare.
          </p>
        )}

        {proba && (
          <Callout variant={proba.ok ? "success" : "warning"} icon={proba.ok ? CheckCircle : AlertTriangle}>
            <span className="block">{proba.mesaj}</span>
            {proba.produse.length > 0 && (
              <span className="block mt-1 text-xs">
                Produse intoarse: {proba.produse.map((p) => `${p.cod} (${p.nume})`).join(", ")}
              </span>
            )}
            {proba.valuta && (
              <span className="block mt-1 text-xs">
                Valuta cotarii: <strong>{proba.valuta}</strong>
                {proba.valuta.includes("RON")
                  ? ""
                  : ". ⚠ Magazinul lucreaza in lei, iar noi nu convertim sumele, deci DHL va aparea in checkout la tariful fix. Cere-i reprezentantului DHL tarifele in RON pe contul tau."}
              </span>
            )}
            {proba.cerContract.length > 0 && (
              <span className="block mt-1 text-xs">
                ⚠ Produse pe care DHL le marcheaza ca avand nevoie de un acord separat: {proba.cerContract.join(", ")}.
                Ele apar in cotare, dar emiterea poate fi refuzata pana cand contractul le cuprinde.
              </span>
            )}
            {/*
              ⚠ Raspunsul la intrebarea „merge rambursul pe contul meu?", pusa la fiecare proba.
              Polaritatea e INVERSA fata de UPS: aici „a intors KB" e vestea neasteptata, nu cea
              buna. Vezi nota de pe tipul `Proba`.
            */}
            <span className={`block mt-1 text-xs ${proba.rambursOferit ? "text-warning" : ""}`}>
              {proba.rambursMesaj}
            </span>
            {proba.alerte.length > 0 && (
              <span className="block mt-1 text-xs">DHL a raspuns si cu: {proba.alerte.join(" | ")}</span>
            )}
            {proba.mediu === "test" && (
              <span className="block mt-1 text-xs">
                ⚠ Raspuns din mediul lor de test. Expedierile create acolo nu intra in reteaua DHL, nu se pot
                urmari si nu le ridica nimeni.
              </span>
            )}
          </Callout>
        )}
      </Panel>

      <Panel step={2} title="Adresa de expeditie">
        <Callout variant="info" icon={Info}>
          De aici pleaca fiecare colet, si tot de aici se calculeaza tariful. Codul postal si telefonul sunt
          amandoua obligatorii la DHL, si la expedierile interne, nu doar la cele externe: fara ele nu se face
          nicio cotare si niciun AWB.
        </Callout>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nume persoana de contact">
            <Input value={expeditor.nume ?? ""} onChange={(e) => setExpeditor({ nume: e.target.value })} />
          </Field>
          <Field label="Firma">
            <Input value={expeditor.companie ?? ""} onChange={(e) => setExpeditor({ companie: e.target.value })} />
          </Field>
          <Field label="Telefon" hint="⚠ Obligatoriu la DHL pe orice expediere. Se trimite cu prefixul tarii.">
            <Input value={expeditor.telefon ?? ""} onChange={(e) => setExpeditor({ telefon: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={expeditor.email ?? ""} onChange={(e) => setExpeditor({ email: e.target.value })} />
          </Field>
        </div>
        <Field
          label="Strada si numarul"
          hint="Se imparte automat in cel mult trei linii de cate 45 de caractere, cum cere DHL. Ce nu incape se pierde, deci scrie adresa scurt."
        >
          <Input value={expeditor.strada ?? ""} onChange={(e) => setExpeditor({ strada: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Oras">
            <Input value={expeditor.oras ?? ""} onChange={(e) => setExpeditor({ oras: e.target.value })} />
          </Field>
          <Field
            label="Judet"
            hint="Optional. La DHL campul inseamna „cartier sau judet” si nu e nomenclator: nu inlocuieste codul postal."
          >
            <Input value={expeditor.judet ?? ""} onChange={(e) => setExpeditor({ judet: e.target.value })} />
          </Field>
          <Field
            label="Cod postal"
            hint={taraExpeditor === "RO" ? "Sase cifre, formatul cerut de DHL pentru Romania." : undefined}
            /* ⚠ Validare VIZIBILA, nu doar pe server: un cod cu cinci cifre nu e ignorat de DHL,
               ci taie cotarea cu `420506 Postcode not found`, iar mesajul lor nu spune daca e
               vinovat codul expeditorului sau al destinatarului. */
            error={!codPostalBun
              ? (taraExpeditor === "RO"
                ? "Codul postal romanesc are exact sase cifre. Asa cum e scris acum, DHL respinge cotarea."
                : "Codul postal nu are un format pe care DHL sa-l accepte.")
              : undefined}
          >
            <Input
              value={expeditor.cod_postal ?? ""}
              placeholder={taraExpeditor === "RO" ? "010101" : ""}
              onChange={(e) => setExpeditor({ cod_postal: e.target.value })}
            />
          </Field>
        </div>
      </Panel>

      <Panel step={3} title="Ce se ofera in checkout">
        <p className="text-xs font-semibold">Produsele DHL pe care le arati clientilor</p>
        <p className="text-[11px] text-muted-foreground">
          Nimic bifat = toate produsele pe care le intoarce cotarea. Filtrul adevarat e al lor: cotarea se face
          cu numarul tau de cont, deci DHL raspunde deja cu ce iti vinde pe ruta ceruta. Bifele de aici doar
          restrang lista, nu o largesc.
        </p>
        <div className="flex flex-wrap gap-2">
          {produse.map((p) => {
            const bifat = permise.includes(p.cod);
            return (
              <button
                key={p.cod}
                type="button"
                onClick={() => setConfig({
                  ...config,
                  produse_permise: bifat ? permise.filter((x) => x !== p.cod) : [...permise, p.cod],
                })}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                  bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
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
          <p className="text-[11px] text-muted-foreground">
            Nu propunem o lista pentru tara de expeditie aleasa. Se ofera tot ce intoarce cotarea.
          </p>
        )}

        {/*
          ⚠ Se spune limpede ca livrarea in punct NU exista, ca omul sa nu caute comutatorul.
          Ceilalti curieri au unul, deci absenta lui arata ca o scapare a noastra.
        */}
        <Callout variant="info" icon={Info}>
          <span className="block">
            <strong>DHL livreaza doar la adresa, nu si in puncte de ridicare.</strong>
          </span>
          <span className="block mt-1 text-xs">
            Punctele lor exista in API, dar livrarea catre un punct trece prin serviciul „on demand delivery”,
            care cere un identificator de punct pe care DHL il da doar prin managerul tau de cont, iar acoperirea
            pentru Romania nu se poate verifica din documentatia lor publica. Am preferat sa nu oferim in checkout
            ceva ce s-ar putea rupe la emitere, dupa ce cumparatorul a platit.
          </span>
        </Callout>
      </Panel>

      <Panel title="Plata la livrare (ramburs)">
        {/*
          ⚠ SECTIUNE DE INFORMARE, FARA COMUTATOR, si asta e o hotarare, nu o scapare.
          Un comutator la tarif fix ar fi fost ales de cumparator, iar comerciantul ar fi
          aflat abia la emitere ca AWB-ul nu se poate face: comanda blocata, banii neincasati.
          Aceeasi asezare ca la FedEx.
        */}
        <Callout variant="warning" icon={Ban}>
          <span className="block">
            <strong>DHL Express nu ofera plata la livrare.</strong> {AVERTISMENT_RAMBURS}
          </span>
          <span className="block mt-1 text-xs">
            Nu exista comutator fiindca nu exista ce comuta. Pe comenzile cu plata la livrare, DHL nu apare deloc
            in checkout, iar celelalte metode de livrare raman neatinse: cumparatorul alege dintre ele si nu vede
            nimic lipsa.
          </span>
          <span className="block mt-1 text-xs">
            „Testeaza conexiunea” verifica de fiecare data, pe contul TAU, daca DHL a inceput totusi sa ofere
            serviciul. Daca vreodata apare, ti-o spune in rezultatul probei.
          </span>
        </Callout>
      </Panel>

      <Panel step={4} title="Eticheta">
        <Field
          label="Formatul etichetei"
          hint="PDF-ul e implicit fiindca se tipareste la orice imprimanta, inclusiv una obisnuita de birou. Celelalte trei sunt limbaje de imprimanta termica de etichete."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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

        <Field
          label="Sablonul etichetei"
          hint="Lista arata doar sabloanele care merg cu formatul ales mai sus. Schimbi formatul, se schimba si ea."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={sablonPotrivit(format, config.sablon_eticheta)}
            onChange={(e) => setConfig({ ...config, sablon_eticheta: e.target.value })}
          >
            {sabloanePotrivite.map((s) => <option key={s.valoare} value={s.valoare}>{s.eticheta}</option>)}
          </select>
        </Field>

        {/*
          ⚠ AICI SCRIA SI CA „odata cu eticheta se descarca si documentul de transport,
          arhiva ta de expeditor". Nu era adevarat niciodata: `waybillDoc` se cerea la
          emitere, dar schema raspunsului lor enumera doar `invoice, proforma, label or
          receipt`, deci documentul nu venea, coloana `document_transport` ramanea goala si
          butonul „Descarca eticheta" n-avea ce sa scoata. Mai rau, ceruta, a doua hartie
          vine tot etichetata `label`, deci putea fi luata drept eticheta de lipit pe colet
          — la un curier fara reimprimare si fara anulare de expediere. Cererea nu mai cere
          `waybillDoc`, deci pagina nu-l mai promite: o fagaduiala pe care descarcarea n-o
          tine il pune pe comerciant sa caute un fisier inexistent si il invata sa nu mai
          creada nici restul notelor de aici.
        */}
        <Callout variant="info" icon={Info}>
          <span className="block">
            La expedierile in afara Uniunii Europene se descarca, odata cu eticheta, si <strong>factura
            comerciala</strong>, mereu in PDF, orice format ai alege aici. Fara ea tiparita si atasata la
            colet, marfa se opreste in vama.
          </span>
        </Callout>
      </Panel>

      <Panel step={5} title="Coletul implicit si vama">
        <p className="text-xs text-muted-foreground">
          Dimensiunile se folosesc cand comanda n-are unele proprii. DHL factureaza pe maximul dintre greutatea
          fizica si cea volumetrica, iar volumetricul lor se imparte la {DIVIZOR_VOLUMETRIC}, nu la 6000 ca la
          alti curieri: o cutie prea mare scumpeste fiecare colet. Limita pe colet e {GREUTATE_MAXIMA_KG} kg;
          peste {PRAG_SUPRATAXA_GREUTATE_KG} kg (reali sau volumetrici) sau peste {PRAG_SUPRATAXA_DIMENSIUNE_CM} cm
          pe o latura se adauga suprataxele lor fixe, iar intre {PRAG_NECONVENABIL_KG} si {GREUTATE_MAXIMA_KG} kg
          reali se adauga taxa de colet nemanevrabil.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Latime"], ["inaltime_cm", "Inaltime"]] as const).map(([cheie, eticheta]) => (
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

        <Field
          label="Descrierea marfii"
          hint="⚠ Cel putin trei caractere reale: DHL respinge descrierile mai scurte cu codul 7143. Apare pe documentele vamale ale expedierilor din afara Uniunii Europene."
        >
          <Input
            value={config.continut_implicit ?? ""}
            placeholder="Bunuri de consum"
            onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })}
          />
        </Field>

        <Field
          label="Incoterm"
          hint="Cine plateste taxele vamale la destinatie. DHL il cere pe fiecare expediere, chiar si pe una interna."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.incoterm ?? INCOTERM_IMPLICIT}
            onChange={(e) => setConfig({ ...config, incoterm: e.target.value })}
          >
            {INCOTERMURI.map((i) => <option key={i.cod} value={i.cod}>{i.eticheta}</option>)}
          </select>
        </Field>
        {(config.incoterm ?? INCOTERM_IMPLICIT) === "DDP" && (
          <Callout variant="warning" icon={AlertTriangle}>
            {/* ⚠ „Ca sa fie sigur" e exact motivul pentru care se alege gresit DDP. */}
            Cu <strong>DDP</strong> platesti TU taxele vamale si TVA-ul de la destinatie, pe TOATE expedierile in
            afara Uniunii Europene, iar DHL ti le refactureaza dupa livrare, cu un comision de vamuire deasupra.
            Pe un colet de 300 de lei catre o tara terta, factura poate depasi valoarea comenzii. {""}
            <strong>DAP</strong> lasa taxele in seama cumparatorului si e asezarea obisnuita a unui magazin
            romanesc.
          </Callout>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Asigura expedierea</p>
            <p className="text-xs text-muted-foreground">
              Costa la fiecare colet: 55 lei sau 1% din valoarea asigurata, care e mai mare. Stins, coletul merge
              cu despagubirea standard din conditiile lor de transport.
            </p>
          </div>
          <Switch
            checked={!!config.asigurare_activa}
            onCheckedChange={(v) => setConfig({ ...config, asigurare_activa: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Declara valoarea comenzii la transport</p>
            <p className="text-xs text-muted-foreground">
              Trimite valoarea marfii pe expediere. La destinatiile vamale ea se declara oricum; aici e vorba de
              expedierile in care DHL o foloseste pentru raspundere si pentru formalitati.
            </p>
          </div>
          <Switch
            checked={!!config.valoare_declarata}
            onCheckedChange={(v) => setConfig({ ...config, valoare_declarata: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Cere ridicare de la DHL</p>
            <p className="text-xs text-muted-foreground">
              {/* ⚠ Documentatia lor nu spune nicaieri cum ajunge coletul la ei fara asta. */}
              Pornit, la emiterea AWB-ului DHL programeaza si venirea curierului dupa colet. Stins, nu vine nimeni:
              coletul trebuie dus la un punct DHL sau predat la ridicarea zilnica din contractul tau. Se poate cere
              si mai tarziu, separat.
            </p>
          </div>
          <Switch
            checked={!!config.cere_ridicare}
            onCheckedChange={(v) => setConfig({ ...config, cere_ridicare: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Anunta destinatarul pe email</p>
            <p className="text-xs text-muted-foreground">
              ⚠ DHL trimite instiintarea in engleza: romana nu e printre limbile pe care le accepta pentru
              instiintari. De aceea e optiune, nu implicit.
            </p>
          </div>
          <Switch
            checked={!!config.notifica_destinatarul}
            onCheckedChange={(v) => setConfig({ ...config, notifica_destinatarul: v })}
          />
        </div>
      </Panel>

      <Panel step={6} title="Pornire">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Foloseste DHL pentru livrare</p>
            <p className="text-xs text-muted-foreground">
              Dupa salvare, activeaza metoda „DHL” si din Setari → Livrare, ca sa apara in checkout.
            </p>
          </div>
          <Switch checked={!!config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
        </div>

        {config.enabled && !areExpeditor && (
          <Callout variant="warning" icon={AlertTriangle}>
            Fara oras si cod postal de expeditie, DHL nu poate cota nimic, iar clientii vor vedea tariful fix in
            loc de pretul real.
          </Callout>
        )}
        {config.enabled && !codPostalBun && (
          <Callout variant="warning" icon={AlertTriangle}>
            Codul postal de expeditie nu are formatul cerut de DHL, deci fiecare cotare va fi respinsa. Repara-l
            inainte de salvare.
          </Callout>
        )}
        {config.mediu === "test" && (
          <Callout variant="warning" icon={AlertTriangle}>
            Esti pe mediul de test al DHL. Expedierile emise acolo nu intra in reteaua lor, nu se pot urmari si nu
            le ridica nimeni. Treci pe productie inainte de prima comanda adevarata, si verifica atunci ca
            utilizatorul si parola sunt cele de productie: DHL da de obicei alte credentiale pentru fiecare mediu.
          </Callout>
        )}
        {esteActiv && config.mediu !== "test" && (
          <Callout variant="info" icon={Info}>
            <span className="block">
              Fiecare AWB emis e real si facturat, iar DHL nu are protectie contra dublurilor: daca emiterea pare
              ca a esuat, foloseste „Verifica la DHL” din pagina comenzii in loc sa incerci din nou. Butonul cauta
              expedierea dupa referinta comenzii si o adopta daca ea exista deja.
            </span>
            <span className="block mt-1 text-xs">
              ⚠ Si DHL nu are anulare de expediere: „Dezleaga AWB-ul” din editarea comenzii scoate numerele de pe
              comanda si anuleaza ridicarea, daca a fost ceruta, dar eticheta ramane emisa. Daca a fost deja
              facturata, se rezolva doar cu reprezentantul DHL.
            </span>
          </Callout>
        )}

        <Button type="button" onClick={salvare} disabled={salveaza}>
          {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salveaza
        </Button>
      </Panel>
    </div>
  );
}
