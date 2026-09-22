"use client";

import { useState, useTransition } from "react";
import {
  BLOC_PREGATIRE_PUBLICARE, BUTON_ADU_OFERTELE, BUTON_ADU_OFERTELE_SCURT,
} from "@/lib/emag/etichete";
import {
  AlertTriangle, Ban, Check, CheckCircle, ClipboardCheck, Clock, Copy, Download,
  EyeOff, HelpCircle, Hourglass, Layers, Link2, Loader2, PackagePlus, PackageX,
  PauseCircle, RefreshCw, ShieldAlert, ShoppingCart, Tag, XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { EmagPregatirePublicare } from "@/components/dashboard/EmagPregatirePublicare";
import { SUPPLY_LEAD_TIME_INGADUIT } from "@/lib/emag/mapping";
import {
  aduComenzileAcumEmag, connectEmag, continuaImportEmag, disconnectEmag, importaDinEmag,
  leagaOferteImportateEmag, pornesteSincronizareaTuturor, reiaAbandonateleEmag,
  salveazaSetariEmag, sincronizeazaFelieEmag,
  type StareEmag,
  importaIstoricEmag,
} from "@/lib/actions/emag.actions";

/**
 * Cardul de conectare la eMAG Marketplace.
 *
 * ⚠ ARE UN PRERECHIZIT PE CARE CELELALTE INTEGRARI NU-L AU: adresa IP.
 *
 * eMAG accepta apeluri numai de la adrese IP declarate in prealabil de vanzator.
 * Fara pasul asta, comerciantul completeaza corect utilizatorul si parola, apasa
 * „Conecteaza", si primeste un refuz care NU pomeneste nimic despre IP-uri. Ar
 * cauta o zi intreaga o greseala in acreditari.
 *
 * De aceea IP-ul se arata INAINTE de formular, cu buton de copiere, si cu drumul
 * exact prin panoul lor.
 *
 * ⚠ Parola nu se intoarce niciodata din server. Se primeste doar o forma mascata
 * si un boolean; campul gol la salvare inseamna „nu o schimba".
 */

const TARI: { valoare: "ro" | "bg" | "hu"; eticheta: string }[] = [
  { valoare: "ro", eticheta: "eMAG România" },
  { valoare: "bg", eticheta: "eMAG Bulgaria" },
  { valoare: "hu", eticheta: "eMAG Ungaria" },
];

/**
 * Gălețile panoului, în ordinea gravității.
 *
 * ⚠ ACEEAȘI ORDINE ȘI ACELEAȘI CUVINTE ca în `de-ce-nu-se-vinde.ts` și în
 * `numara_ofertele_emag`. Nu e o repetiție de dragul simetriei: etichetele sunt CHEILE
 * din răspunsul funcției. O literă schimbată aici, și cartonașul arată zero pentru o
 * găleată plină. `panoul-emag.test.ts` compară cele trei locuri.
 */
const ORDINEA_STARILOR = [
  "Respins de eMAG",
  "În validare la eMAG",
  "Scoasă din vânzare la eMAG",
  "Oprită la eMAG",
  "Preț neacceptat de eMAG",
  "Fără stoc la eMAG",
  "Încă necitit de la eMAG",
  "Stare necunoscută la eMAG",
  "Se vinde pe eMAG",
] as const;

/**
 * Cum arată fiecare găleată pe cardul ei: nume scurt, semn, și explicația care
 * spune de unde vine cifra.
 *
 * ⚠ CHEIA RAMANE CEA DIN `ORDINEA_STARILOR`, fiindca aia e cheia din raspunsul
 * lui `numara_ofertele_emag`. Pe card se scrie numele SCURT: „Scoasă din vânzare
 * la eMAG" la 12px se rupea pe doua randuri si impingea semnul in jos, iar
 * cardurile de pe acelasi rand nu-si mai potriveau cifra. Intelesul intreg trece
 * in explicatie, unde are loc.
 *
 * ⚠ EXPLICATIILE SUNT LUATE DIN `de-ce-nu-se-vinde.ts`, regula cu regula. Acolo
 * fiecare oferta cade intr-o SINGURA galeata, in ordinea de acolo, deci cifrele
 * se aduna chiar la total.
 */
const DESPRE_STARE: Record<
  (typeof ORDINEA_STARILOR)[number],
  { scurt: string; icon: LucideIcon; explicatie: string }
> = {
  "Se vinde pe eMAG": {
    scurt: "Se vând pe eMAG", icon: ShoppingCart,
    explicatie: "Ofertele aprobate de eMAG, active în contul tău și cu stoc la ei. Doar ele se pot cumpăra.",
  },
  "Respins de eMAG": {
    scurt: "Respinse", icon: XCircle,
    explicatie: "Oferte refuzate la validarea lor: marca, codul de bare, documentația sau oferta blocată. Motivul, când îl trimit ei, se vede pe rândul ofertei.",
  },
  "În validare la eMAG": {
    scurt: "În validare", icon: Hourglass,
    explicatie: "eMAG se uită chiar acum la ele: așteaptă marketplace-ul, marca sau documentația. Nu ai nimic de făcut.",
  },
  "Scoasă din vânzare la eMAG": {
    scurt: "Scoase din vânzare", icon: Ban,
    explicatie: "Marcate „End of Life” în contul tău eMAG. Se repornesc doar din panoul lor.",
  },
  "Oprită la eMAG": {
    scurt: "Oprite la eMAG", icon: PauseCircle,
    explicatie: "Oferte inactive în contul tău eMAG. Se pornesc doar din panoul lor.",
  },
  "Preț neacceptat de eMAG": {
    scurt: "Preț neacceptat", icon: Tag,
    explicatie: "eMAG a respins prețul ofertei: iese din intervalul pe care îl acceptă ei. Îl verifici în fișa produsului.",
  },
  "Fără stoc la eMAG": {
    scurt: "Fără stoc", icon: PackageX,
    explicatie: "Oferte aprobate și active la ei, dar cu zero bucăți în contul eMAG.",
  },
  "Încă necitit de la eMAG": {
    scurt: "Încă necitite", icon: EyeOff,
    explicatie: "Nu le-am citit încă starea de la eMAG. Se citesc la următoarea trecere, în câteva minute.",
  },
  "Stare necunoscută la eMAG": {
    scurt: "Stare necunoscută", icon: HelpCircle,
    explicatie: "eMAG a trimis o stare pe care documentația lor n-o descrie. O verifici în panoul lor.",
  },
};

/*
  ⚠ CELE TREI CERINTE SUNT ALE LOR, NU ALE NOASTRE, si de-aia se spun de la
  inceput: fara oricare dintre ele, conectarea e refuzata la eMAG, cu un mesaj
  care nu pomeneste care lipseste. IP-ul e cea mai costisitoare: refuzul lui
  arata identic cu o parola gresita, iar omul cauta o zi intreaga in acreditari.

  ⚠ NU E UN BLOC GALBEN. Galbenul inseamna „ceva e in neregula", iar o lista de
  cerinte nu e o problema: sunt trei lucruri de bifat o singura data.
*/
const CERINTE: { titlu: string; text: string }[] = [
  {
    titlu: "Adresa noastră IP, pusă în lista lor albă",
    text: "eMAG acceptă cereri doar de la adrese anunțate dinainte. Fără pasul ăsta, conectarea e refuzată chiar dacă utilizatorul și parola sunt corecte.",
  },
  {
    titlu: "Un utilizator cu drept de API",
    text: "Se face din contul tău de vânzător eMAG. Nu e același cu userul cu care intri în panoul lor.",
  },
  {
    titlu: "Contul țării în care vinzi",
    text: "România, Bulgaria și Ungaria sunt conturi separate la eMAG, fiecare cu acreditările lui.",
  },
];

/** `<select>`-urile raman native, dar poarta desenul campurilor casei. */
const SELECT = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/** Singurul camp cu mai multe randuri din ecran: avertismentele GPSR. */
const TEXTAREA =
  "min-h-[76px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none "
  + "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function EmagClient({ businessId, status }: { businessId: string; status: StareEmag | null }) {
  const [username, setUsername] = useState(status?.username ?? "");
  const [password, setPassword] = useState("");
  const [tara, setTara] = useState<"ro" | "bg" | "hu">(status?.tara ?? "ro");
  const [vendorName, setVendorName] = useState("");
  const [seLucreaza, incepe] = useTransition();


  if (!status) {
    return (
      <Callout variant="danger" icon={AlertTriangle}>
        Nu am putut citi starea integrării. Reîncarcă pagina.
      </Callout>
    );
  }

  if (!status.globallyEnabled) {
    return (
      <Panel className="p-5">
        <p className="text-sm text-muted-foreground">
          Integrarea eMAG este momentan indisponibilă. Revenim cu un anunț.
        </p>
      </Panel>
    );
  }

  /*
   * ⚠ Fara releul cu IP fix, integrarea nu poate porni pentru NIMENI. E o problema
   * de platforma, nu a comerciantului, deci i se spune asa: fara pasi de urmat si
   * fara sa para ca a gresit el ceva.
   */
  if (!status.iesireConfigurata) {
    return (
      <Callout variant="warning" icon={ShieldAlert} title="Integrarea nu este încă pregătită">
        Mai avem de configurat ceva pe partea noastră. Din contul tău nu e nimic de făcut.
        Îți dăm un semn când se poate conecta.
      </Callout>
    );
  }

  function conecteaza() {
    incepe(async () => {
      const r = await connectEmag(businessId, { username, password, tara, vendorName });
      if ("error" in r) { toast.error(r.error); return; }
      setPassword("");
      toast.success("Cont eMAG conectat.");
    });
  }

  function deconecteaza() {
    /* ⚠ Fara casuta cenusie a browserului: intrebarea o pune `ButonDeconectare`,
       in fereastra casei, cu ce se pierde scris pe fata. Doua intrebari una peste
       alta se invata sa fie apasate fara citire, iar a doua o anuleaza pe prima. */
    incepe(async () => {
      const r = await disconnectEmag(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Cont eMAG deconectat.");
    });
  }

  function comuta(camp: "auto_sync" | "auto_publish" | "sync_continut" | "emag_club", valoare: boolean) {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, { [camp]: valoare });
      if ("error" in r) toast.error(r.error);
    });
  }

  /*
   * ⚠ Se confirmă înainte: aprinderea schimbă cine conduce prețul pe tot catalogul, iar
   * prețurile pe care omul le-a pus de mână în panoul eMAG vor fi rescrise de ale
   * noastre. E o apăsare cu urmări, nu o preferință de afișare.
   */
  function porneșteToateAutoSync() {
    /* ⚠ `status?.` fiindca ingustarea de mai sus nu trece in inchidere. */
    const cate = status?.oferte.preluate ?? 0;
    if (!window.confirm(
      `Pornești trimiterea automată pentru ${cate} ${cate === 1 ? "ofertă" : "oferte"}?\n\n`
      + "De acum prețul și stocul din Edinio le vor rescrie pe cele puse de tine în panoul eMAG.",
    )) return;
    incepe(async () => {
      const r = await pornesteSincronizareaTuturor(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(
        r.cate === 0
          ? "Nu era nimic de pornit."
          : `Gata: ${r.cate} ${r.cate === 1 ? "ofertă își trimite" : "oferte își trimit"} de acum prețul și stocul.`,
      );
    });
  }

  /* Sursa adevărului la o derivă (§69). Separată de `comuta` fiindcă nu e un
     da/nu: e „cine hotărăște", iar cele două valori sunt amândouă legitime. */
  function alegeSursa(camp: "deriva_pret" | "deriva_stoc", valoare: "edinio" | "emag") {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, { [camp]: valoare });
      if ("error" in r) toast.error(r.error);
    });
  }

  /* ── Neconectat ─────────────────────────────────────────────────────────── */
  if (!status.connected) {
    return (
      <div className="space-y-4">
        <PanouIp ip={status.ipDeAlbit} />

        {/*
          ⚠ MARGINIT LA `max-w-3xl`, desi pagina e pe tot ecranul. Restul paginii
          are nevoie de latime (tabelul de oferte are zece coloane), dar patru
          campuri intinse pe 1900px sunt mai greu de citit, nu mai usor.
        */}
        <Panel step={1} title="Conectează contul eMAG" className="max-w-3xl p-5">
          <p className="text-sm text-muted-foreground">
            Ai nevoie de un utilizator cu drept de API, din contul tău de vânzător eMAG.
            Nu e același cu userul cu care intri în panou.
          </p>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <Field label="Utilizator API" required>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                placeholder="ex. api_magazinultau"
                className="font-mono"
              />
            </Field>

            {/* ⚠ `autoComplete="new-password"` vine de la `<Input>`, care il pune singur
                pe campurile de parola. Vezi comentariul din `input.tsx`. */}
            <Field label="Parolă API" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status.parolaMascata ? "•••••••• (salvată)" : ""}
                className="font-mono"
              />
            </Field>

            <Field label="Țara contului" required hint="Fiecare țară e un cont separat la eMAG, cu acreditări proprii.">
              <select className={SELECT} value={tara} onChange={(e) => setTara(e.target.value as "ro" | "bg" | "hu")}>
                {TARI.map((t) => <option key={t.valoare} value={t.valoare}>{t.eticheta}</option>)}
              </select>
            </Field>

            <Field label="Numele firmei" hint="Opțional. Îl vezi în panou, ca să știi ce cont e legat.">
              <Input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>

          <Button onClick={conecteaza} disabled={seLucreaza}>
            {seLucreaza ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            {seLucreaza ? "Se verifică..." : "Conectează și testează"}
          </Button>
        </Panel>
      </div>
    );
  }

  /*
    ═══ CIFRELE ═══

    ⚠ ACELASI `CardStatistica` ca la Panou, Oferte si Statistici, cerut de el pe
    22.09.2026. Erau noua cutii gri desenate aici, cu cifra la 18px si eticheta
    dedesubt: semanau cu cardurile casei fara sa fie ele, deci se retusau separat
    si divergeau.

    ⚠ RANDUL DE SUS E CEL CARE CONTEAZA, in ordinea in care se citeste: cate sunt,
    cate se vand, cate sunt refuzate, cate mai asteapta sa plece. Restul galetilor
    curg dupa ele si se arata numai cand sunt pline: un card „Preț neacceptat 0" e
    zgomot, iar „Se vând 0" e chiar vestea.

    ⚠ „Se vinde pe eMAG" si „Respins de eMAG" se scot din curgere, ca sa nu apara
    de doua ori: ele au deja cardul lor in randul de sus.

    ⚠ CU STARILE NECITITE nu se arata niciuna dintre galeti. „Nu s-a putut citi" nu
    e „zero", iar un card „Se vând 0" peste o citire picata e chiar minciuna
    reparata in alte trei locuri. In locul lor iese un avertisment, pe toata latimea.
  */
  /* ⚠ Se ia `peStare` intr-o constanta INAINTE: ingustarea lui `status` nu trece in
     inchidere, fiindca e un parametru, nu un `const`. Aceeasi capcana pentru care
     `porneșteToateAutoSync` scrie `status?.`. */
  const peStare = status.oferte.peStare;
  const galeata = (e: (typeof ORDINEA_STARILOR)[number]) => peStare[e] ?? 0;
  const cifre = [
    {
      label: "Oferte", value: status.oferte.total, icon: Layers,
      explicatie: "Toate ofertele legate de contul tău eMAG, în orice stare. Cardurile de stare de lângă se adună chiar la numărul ăsta, fiindcă fiecare ofertă cade într-o singură stare. „În coadă” nu intră în socoteala asta: ea numără modificări, nu oferte.",
    },
    ...(status.oferte.starileCitite
      ? (["Se vinde pe eMAG", "Respins de eMAG"] as const).map((e) => ({
        label: DESPRE_STARE[e].scurt, value: galeata(e),
        icon: DESPRE_STARE[e].icon, explicatie: DESPRE_STARE[e].explicatie,
      }))
      : []),
    {
      label: "În coadă", value: status.inCoada, icon: Clock,
      explicatie: "Modificări de produs, preț sau stoc care așteaptă să plece către eMAG. Coada se golește singură, din minut în minut.",
    },
    ...(status.oferte.starileCitite
      ? ORDINEA_STARILOR
        .filter((e) => e !== "Se vinde pe eMAG" && e !== "Respins de eMAG" && galeata(e) > 0)
        .map((e) => ({
          label: DESPRE_STARE[e].scurt, value: galeata(e),
          icon: DESPRE_STARE[e].icon, explicatie: DESPRE_STARE[e].explicatie,
        }))
      : []),
  ];
  /* ⚠ O DATA, din TOATE cifrele randului: lasata pe seama fiecarui card, „4" ar fi
     iesit la 44px langa „3754" la 36px, adica niste cutii care nu mai arata ca un set. */
  const marimeCifre = marimeaRandului(cifre.map((c) => c.value));

  /* ── Conectat ───────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {status.needsReconnect && (
        <Callout variant="danger" icon={AlertTriangle} title="eMAG a refuzat acreditările">
          S-a schimbat parola, i s-a scos dreptul de API, sau adresa noastră IP nu mai e în
          lista albă din contul tău. Verifică-le și reconectează.
        </Callout>
      )}

      {status.lipsaPentruPublicare && !status.needsReconnect && (
        <Callout variant="warning" icon={AlertTriangle} title={status.lipsaPentruPublicare}>
          {/* ⚠ INDRUMARUL SE POTRIVESTE CU CE LIPSESTE, nu e unul singur pentru tot.
              Mesajul trimitea odata „in setarile integrarii" la doua campuri care nu
              existau nicaieri: un drum infundat, cu publicarea blocata si fara cale
              de iesire. Scris tot asa acum, ar fi trimis in setari dupa butonul de
              import, care nu e acolo. */}
          {status.catalogCitit ? (
            <p className="text-xs">
              Le găsești mai jos, la <strong className="text-foreground">„{BLOC_PREGATIRE_PUBLICARE}”</strong>.
            </p>
          ) : (
            /* ⚠ NUMELE DE PE BUTON, CUVANT CU CUVANT. Scris „Importa din eMAG”,
               indrumarul trimitea la un buton care nu exista: a intrebat chiar
               comerciantul, „nu exista buton cu «Importa din eMag», eu il vad doar
               pe asta cu «Adu ofertele»”. Exact drumul infundat reparat pe 23.08,
               facut din nou. */
            <p className="text-xs">
              Butonul e mai jos, la{" "}
              <a href="#emag-import" className="font-semibold text-foreground underline underline-offset-2">
                „{BUTON_ADU_OFERTELE}”
              </a>
              . Doar citim și legăm, magazinul tău nu se schimbă.
            </p>
          )}
        </Callout>
      )}

      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-success" />
              <span className="text-sm font-semibold text-foreground">Cont conectat</span>
              {/* ⚠ Ton NEUTRU: tara contului nu e o stare buna sau rea, e o identificare. */}
              <EtichetaStare ton="neutru" marime="mic">{status.taraEticheta}</EtichetaStare>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{status.username}</span>
              {" · "}parolă <span className="font-mono text-foreground">{status.parolaMascata}</span>
              {" · "}{status.moneda}
            </p>
          </div>
          {/* ⚠ `cePierzi` spune ce face CHIAR `disconnectEmag`: scrie o configurare goala
              peste cea veche (deci pleaca si acreditarile, si setarile), sterge randurile
              din `emag_sync_queue` si `emag_offers`, si uita nomenclatoarele tinute minte.
              Ofertele de la ei NU se ating: eMAG n-are stergere de oferta. */}
          <ButonDeconectare
            nume="eMAG"
            cePierzi="Se șterg utilizatorul și parola de API, împreună cu toate setările integrării: TVA, timpul de expediere, datele GPSR, rezerva de stoc. Se pierd și legăturile locale cu ofertele și coada de modificări neplecate. Ofertele rămân pe eMAG: le oprești din vânzare separat, din panoul lor."
            pending={seLucreaza}
            onConfirma={deconecteaza}
          />
        </div>
      </Panel>

      {/*
        ═══ ⚠ CARTONAȘELE SE ADUNĂ LA TOTAL, ȘI ASTA E TOATĂ REPARAȚIA ═══

        Forma dinainte arăta „Oferte 3754" și dedesubt 61 + 3693 + 154 = **3908**.
        Trei motive deodată:

          „În validare" număra starea NOASTRĂ (`queued`/`sent`), nu verdictul lor.
          Din cele 3.693, 3.445 erau de fapt APROBATE și doar 4 chiar în validare.

          Cartonașele se suprapuneau: cele 154 respinse intrau și la „În validare",
          și la „De revizuit".

          Iar starea care privea cel mai mult catalogul lipsea cu totul: 3.089 de
          oferte „End of Life" plus 318 oprite, care se repornesc DOAR din panoul
          eMAG. Omul citea „în validare" și aștepta ceva ce nu venea niciodată.

        Acum vin din `numara_ofertele_emag`, care aplică exact ordinea din
        `deCeNuSeVinde`: fiecare ofertă cade într-o singură găleată.

        ⚠ Se arată numai gălețile NEGOALE, în afară de „se vând". Un cartonaș „Preț
        neacceptat 0" e zgomot; „Se vând 0" e chiar vestea. Lista lor se face mai sus,
        la `cifre`.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cifre.map((c) => (
          <CardStatistica
            key={c.label}
            marime={marimeCifre}
            icon={c.icon}
            label={c.label}
            value={c.value}
            explicatie={c.explicatie}
            empty={c.value === 0}
          />
        ))}
      </div>

      {/* ⚠ „Nu s-a putut citi" NU e „zero". Vezi `starileCitite`. */}
      {!status.oferte.starileCitite && (
        <Callout variant="warning" icon={AlertTriangle}>
          Nu s-au putut citi stările ofertelor acum. Reîncarcă pagina.
        </Callout>
      )}

      {/*
        ═══ ⚠ DERIVA STĂ DEASUPRA CELORLALTE, ȘI E COLORATĂ ═══

        E singura problemă care nu se vede din nicio altă cifră: ofertele derivate
        intră la „Se vând pe eMAG", publicate, aprobate, fără nicio eroare, și se
        vând la alt preț decât crede comerciantul.

        O linie ștearsă printre celelalte ar fi fost citită ca o informație
        tehnică. E o pierdere de bani, în fiecare zi cât ține.

        ⚠ IESE PE TOATA LATIMEA, ca toate avertismentele. Inghesuit in cartonasul
        contului, arata ca o nota de subsol a contului; aici e ce e: bani pierduti.
      */}
      {status.oferte.derivate > 0 && (
        <Callout
          variant="warning"
          icon={AlertTriangle}
          title={`${status.oferte.derivate} ${status.oferte.derivate === 1
            ? "ofertă are pe eMAG altceva decât trimitem noi"
            : "oferte au pe eMAG altceva decât trimitem noi"}`}
        >
          {/* ⚠ „Se repară singure" numai dacă Edinio chiar conduce câmpul. Cu sursa pe
              eMAG, nu se încearcă nimic niciodată, iar propoziția asta l-ar pune să
              aștepte o reparație pe care chiar el a oprit-o. */}
          <p className="text-xs leading-relaxed">
            Prețul sau stocul de acolo nu mai e cel din Edinio.{" "}
            {status.derivaPret === "edinio" || status.derivaStoc === "edinio"
              ? "Cele pe care le conduce Edinio se repară singure la următoarele treceri; "
              : "Ai ales ca eMAG să conducă și prețul, și stocul, deci nu se trimite nimic de la noi. "}
            le vezi una câte una în lista de oferte, la „Doar cu probleme”.
          </p>
        </Callout>
      )}

      {/*
        ⚠ ABANDONURILE SE VĂD, ȘI SE POT RELUA.
        Înainte se ștergeau: nimeni nu le mai putea număra, iar panoul arăta
        „0 în așteptare" pentru un catalog întreg care nu plecase.
      */}
      {status.abandonate > 0 && (
        <Callout
          variant="warning"
          icon={AlertTriangle}
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={seLucreaza}
              onClick={() =>
                incepe(async () => {
                  const r = await reiaAbandonateleEmag(businessId);
                  if ("error" in r) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(
                    r.reluate === 1 ? "O modificare a fost reluată." : `${r.reluate} modificări au fost reluate.`,
                  );
                })
              }
            >
              {seLucreaza ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Reia-le
            </Button>
          }
        >
          <span className="text-xs leading-relaxed">
            <strong className="text-foreground">{status.abandonate}</strong>{" "}
            {status.abandonate === 1 ? "modificare s-a oprit" : "modificări s-au oprit"} după cinci
            încercări. Vezi motivul la fiecare produs în lista de mai jos, repară-l, apoi reia.
          </span>
        </Callout>
      )}

      {/*
        ═══ ⚠ eMAG CERE FACTURA DUPA LIVRARE, SI LIPSA N-AVEA UNDE SA SE VADA ═══

        `invoice_uploaded_at` era scris si citit EXCLUSIV de filtrul cronului. Niciun
        ecran nu spunea „comenzile astea livrate n-au factura la ei". Iar cronul se
        putea bloca: fereastra lui era deterministica, deci zece comenzi nefacturate
        opreau urcarea pentru TOATE cele mai noi, la nesfarsit.

        Fereastra se roteste acum. Dar o comanda livrata fara factura ramane o lipsa
        fiscala, si aceea se repara din facturare, nu de aici. Deci se spune.
      */}
      {/* ⚠ `> 0` peste `null` e fals, deci avertismentul dispare cand nu s-a putut citi,
          si asta e corect: mai bine lipseste decat sa scrie „0 comenzi fara factura"
          pentru un magazin care are. Vezi nota din `getEmagStatus`. */}
      {(status.comenziFaraFactura ?? 0) > 0 && (
        <Callout variant="warning" icon={AlertTriangle}>
          <span className="text-xs leading-relaxed">
            <strong className="text-foreground">{status.comenziFaraFactura}</strong>{" "}
            {status.comenziFaraFactura === 1
              ? "comandă expediată nu are factura urcată la eMAG"
              : "comenzi expediate nu au factura urcată la eMAG"}
            . eMAG o cere după livrare. Emite factura din pagina comenzii, iar urcarea se
            face singură la trecerea următoare.
          </span>
        </Callout>
      )}

      {/*
        ═══ SETĂRILE ═══

        ⚠ INTR-UN PANOU AL LOR, nu inghesuite in cartonasul contului. Acolo, opt
        hotarari, doua alegeri de sursa si trei formulare stateau sub randul cu
        utilizatorul si parola, despartite doar de niste linii: cartonasul „cont"
        ajunsese sa poarte toata pagina.
      */}
      <Panel title="Setări" className="p-5">
        <div className="space-y-3">
          <RandDeComutator
            titlu="Trimite automat prețul și stocul"
            text="Când schimbi ceva în magazin, pleacă și către eMAG."
            pornit={status.autoSync}
            dezactivat={seLucreaza}
            comuta={(v) => comuta("auto_sync", v)}
          />

          {/*
            ═══ ⚠ NU E O NOTĂ DE SUBSOL, E STAREA A 99% DIN CATALOG (24.08.2026) ═══

            Propoziția asta se citea din `status = 'imported'`, o stare de trecere pe care
            reconcilierea o mută în câteva minute. Măsurat: ZERO rânduri acolo, deci nu s-a
            afișat niciodată, tocmai când era adevărată pentru 3.714 din 3.754 de oferte.

            Iar comutatorul de deasupra e pornit și scrie „Când schimbi ceva în magazin,
            pleacă și către eMAG". Cele două se contraziceau, și cea falsă era vizibilă.

            ⚠ Scrisă gri, ca înainte, ar fi trecut neobservată și acum. Pe Trendyol s-a
            văzut ce costă: 29 de listări preluate, o etichetă mică „Preluat" pe rând, și
            comerciantul a aflat dintr-o comandă vândută cu 4 lei sub prețul din magazin.
            Deci: culoare de avertisment, cifra în față, și butonul chiar lângă text.

            ⚠ ȘI STĂ CHIAR SUB COMUTATORUL PE CARE ÎL CONTRAZICE, nu între cifrele de
            sus: nu e o statistică, e o excepție de la bifa de deasupra. Pusă printre
            carduri, ar fi arătat ca încă o numărătoare oarecare.
          */}
          {status.oferte.preluate > 0 && (
            <Callout
              variant="warning"
              icon={AlertTriangle}
              title={`${status.oferte.preluate} ${status.oferte.preluate === 1
                ? "ofertă nu ascultă"
                : "oferte nu ascultă"} de comutatorul de mai sus`}
              action={
                <Button variant="outline" size="sm" onClick={porneșteToateAutoSync} disabled={seLucreaza}>
                  {seLucreaza ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Trimite prețul și stocul și pentru {status.oferte.preluate === 1 ? "ea" : "ele"}
                </Button>
              }
            >
              <span className="text-xs leading-relaxed">
                {status.oferte.preluate === 1
                  ? "Nu-și trimite prețul și stocul către eMAG. E preluată"
                  : "Nu-și trimit prețul și stocul către eMAG. Sunt preluate"} din contul tău, iar
                Edinio nu suprascrie ce ai pus în panoul lor.{" "}
                {status.oferte.total > 0 && status.oferte.preluate * 2 > status.oferte.total && (
                  <>
                    <strong className="text-foreground">
                      Asta înseamnă că pentru cea mai mare parte a catalogului prețul de pe eMAG nu
                      e cel din magazin.
                    </strong>{" "}
                  </>
                )}
                Dacă vrei ca Edinio să conducă prețul și stocul, pornește-le de aici, sau una câte
                una din lista de oferte.
              </span>
            </Callout>
          )}

          <RandDeComutator
            titlu="Publică automat produsele noi"
            text="Un produs nou pleacă singur pe eMAG, dacă are categoria mapată."
            pornit={status.autoPublish}
            dezactivat={seLucreaza}
            comuta={(v) => comuta("auto_publish", v)}
          />
          {/*
            ⚠ ALTĂ ÎNTREBARE DECÂT „trimite automat".
            Aceea e „trimite ceva"; asta e „rescrie și fișa produsului". Mulți
            comercianți își îngrijesc fișa în panoul eMAG — poze mai bune, text scris
            pentru cumpărătorul de acolo — și vor ca Edinio să conducă numai prețul și
            stocul. Fără comutatorul ăsta, prima editare a produsului le-ar fi șters
            munca, iar singura scăpare ar fi fost oprirea sincronizării cu totul.
          */}
          {/*
            ═══ ⚠ IMPLICITUL LOR E „DA", AL NOSTRU E „NU" ═══

            `emag_club` are `default: 1` în schema eMAG. Netrimis, FIECARE produs publicat
            din Edinio ar intra în Genius, cu comisioanele și obligațiile de livrare de
            acolo — fără ca cineva să fi ales asta.

            Măsurat pe un cont adevărat: toate ofertele comerciantului de dinainte au
            `emag_club: 0`. Deci produsele noastre ar fi intrat în Genius pe lângă restul
            catalogului lui, iar el ar fi aflat din decont.

            Se trimite mereu, ca implicitul lor să nu mai hotărască în locul lui.
          */}
          <RandDeComutator
            titlu="Pune ofertele noi în Genius"
            text="Programul eMAG cu livrare rapidă. Are comisioane și obligații de livrare proprii; verifică-le în contractul tău înainte să pornești."
            pornit={status.inGenius}
            dezactivat={seLucreaza}
            comuta={(v) => comuta("emag_club", v)}
          />

          <RandDeComutator
            titlu="Trimite și fișa produsului"
            text="Nume, descriere, poze, caracteristici. Oprit, Edinio trimite doar prețul și stocul, iar fișa rămâne cum ai făcut-o pe eMAG."
            pornit={status.syncContinut}
            dezactivat={seLucreaza}
            comuta={(v) => comuta("sync_continut", v)}
          />
        </div>

        {/*
          ═══ ⚠ DOUĂ ÎNTREBĂRI, NU UNA ═══

          Aproape orice comerciant vrea ca Edinio să țină STOCUL: ăsta e tot rostul
          integrării, un singur inventar, ca să nu vândă de două ori aceeași bucată.

          Dar mulți își țin PREȚUL în panoul eMAG, din campanii și din Smart Deals. Cu
          un singur comutator pentru amândouă, omul ar fi fost pus să aleagă între
          a-și pierde campaniile la fiecare trecere și a-și vinde marfa de două ori.

          ⚠ Comutatoarele astea privesc numai repararea AUTOMATĂ. Când schimbi prețul
          în Edinio, el pleacă spre eMAG oricum: aia e o hotărâre a ta, nu o derivă. Se
          spune pe ecran, ca nimeni să nu creadă că a oprit sincronizarea cu totul.
        */}
        <div className="space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-foreground">Când eMAG are altceva decât Edinio</h3>
          <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
            Verificăm periodic ce e pe eMAG față de ce trimitem. Aici spui cine are
            ultimul cuvânt. <strong className="text-foreground">Nu se aplică</strong> la modificările
            făcute de tine în magazin: acelea pleacă spre eMAG oricum.
          </p>
          <AlegereSursa
            eticheta="Prețul"
            descriere="Alege «eMAG» dacă îți faci campaniile în panoul lor și nu vrei să ți le suprascriem."
            valoare={status.derivaPret}
            dezactivat={seLucreaza}
            laSchimbare={(v) => alegeSursa("deriva_pret", v)}
          />
          <AlegereSursa
            eticheta="Stocul"
            descriere="Aproape mereu «Edinio»: un singur inventar e chiar rostul integrării."
            valoare={status.derivaStoc}
            dezactivat={seLucreaza}
            laSchimbare={(v) => alegeSursa("deriva_stoc", v)}
          />
        </div>

        {/* ⚠ INAINTEA celorlalte setari: fara astea doua nu se poate publica NIMIC, iar
            restul (rezerva de stoc, taxa verde) sunt reglaje fine peste ceva ce inca
            nu functioneaza. */}
        <EmagPregatirePublicare
          businessId={businessId}
          vatId={status.vatId}
          handlingTime={status.handlingTime}
        />

        <PanouStoculSiTaxa businessId={businessId} status={status} />
        <PanouGpsr businessId={businessId} status={status} />
      </Panel>

      <PanouSincronizare businessId={businessId} />

      <PanouNotificari
        url={status.webhookUrl}
        ultimulWebhook={status.ultimulWebhook}
        ultimaSincronizare={status.ultimaSincronizare}
      />

      <PanouIstoric businessId={businessId} />

      {/* ⚠ Ancora e ceruta de indrumarul de sus: fara ea, „butonul e mai jos" ar fi
          fost tot un drum de cautat cu ochii intr-o pagina lunga. */}
      <div id="emag-import" className="scroll-mt-24">
        <PanouImport businessId={businessId} />
      </div>

      <PanouIp ip={status.ipDeAlbit} restrans />
    </div>
  );
}

/**
 * Rezerva de stoc si taxa verde.
 *
 * ⚠ DOUA NUMERE CU DOUA CAPCANE DIFERITE, si amandoua se spun pe ecran.
 *
 * Rezerva: un numar prea mare opreste de la vanzare tot catalogul, TACUT — stocul
 * trimis devine zero, ofertele raman publicate dar nevandabile, si nimic nu da eroare.
 * De aceea scrie ce face, si e marginita la salvare.
 *
 * Taxa verde: INCLUDE TVA, spre deosebire de toate celelalte preturi din integrare.
 * Scrisa fara, ar pleca cu o cincime mai mica — si nimeni n-ar observa, fiindca e o
 * suma mica pe o linie separata.
 */
/**
 * Datele GPSR ale magazinului.
 *
 * ═══ ⚠ PANA AZI ERA O FUNDATURA (25.08.2026) ═══
 *
 * `emag_config.gpsr` exista in tipuri, `mapping.ts` chiar il trimitea, iar preflight-ul
 * spunea „Nu sunt completate datele GPSR". Dar NIMIC din Edinio nu-l scria: nici formular,
 * nici actiune. Deci comerciantul era trimis sa completeze ceva ce n-avea unde — si cauta
 * prin toate cartile setarilor, plecand incredintat ca i-a scapat lui ceva.
 *
 * ═══ ⚠ UN SINGUR PRODUCATOR, SI DE CE ═══
 *
 * eMAG ingaduie pana la zece seturi. Dar astea sunt datele MAGAZINULUI, iar un magazin are
 * un producator si un reprezentant. Un magazin care vinde marci diferite are nevoie de date
 * PE PRODUS — si aia e altceva, care inca nu exista. Scris aici ca o lista cu adaugare, ar
 * fi parut ca rezolva cazul acela si nu l-ar fi rezolvat.
 *
 * ⚠ Se spune limpede pe ecran, ca omul sa stie ce a rezolvat si ce nu.
 */
function PanouGpsr({ businessId, status }: { businessId: string; status: StareEmag }) {
  const [g, setG] = useState(status.gpsr);
  const [seSalveaza, incepe] = useTransition();

  const pune = (cheie: keyof typeof g) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setG((v) => ({ ...v, [cheie]: e.target.value }));

  function salveaza() {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, { gpsr: g });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Salvat. Datele pleacă la ofertele tale în câteva minute.");
    });
  }

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Date GPSR</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Regulamentul european cere producătorul și un reprezentant din UE pentru tot mai
          multe categorii. eMAG refuză ofertele fără ele acolo unde le cere.
        </p>
      </div>

      <Field
        label="Avertismente de siguranță"
        hint="Pleacă la fiecare ofertă a magazinului. Scrie doar ce e valabil pentru toate."
      >
        <textarea
          className={TEXTAREA}
          value={g.safety_information}
          placeholder="Ex.: A nu se lăsa la îndemâna copiilor sub 3 ani."
          onChange={pune("safety_information")}
        />
      </Field>

      {[
        { titlu: "Producător", n: "producatorNume", a: "producatorAdresa", e: "producatorEmail" },
        { titlu: "Reprezentant în UE", n: "reprezentantNume", a: "reprezentantAdresa", e: "reprezentantEmail" },
      ].map((sect) => (
        <div key={sect.titlu} className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium text-foreground">{sect.titlu}</p>
          <div className="grid items-start gap-3 sm:grid-cols-3">
            <Field label="Nume">
              <Input value={g[sect.n as keyof typeof g]} onChange={pune(sect.n as keyof typeof g)} />
            </Field>
            <Field label="Adresă">
              <Input value={g[sect.a as keyof typeof g]} onChange={pune(sect.a as keyof typeof g)} />
            </Field>
            <Field label="E-mail">
              <Input value={g[sect.e as keyof typeof g]} onChange={pune(sect.e as keyof typeof g)} />
            </Field>
          </div>
          {/*
            ⚠ SE SPUNE CE FACE UN NUME GOL. eMAG cere `name` pe fiecare set: o adresă
            completată și un nume uitat ar fi făcut ca oferta ÎNTREAGĂ să fie refuzată, cu
            un mesaj despre GPSR pe care omul l-ar fi citit ca „lipsesc datele", deși el
            le pusese. Aici se spune dinainte, nu se află de la ei.
          */}
          <p className="text-xs text-muted-foreground">
            Fără nume, setul nu se trimite deloc.
          </p>
        </div>
      ))}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Datele astea sunt ale magazinului și pleacă la toate ofertele. Dacă vinzi mărci cu
        producători diferiți, deocamdată le pui pe produs, în panoul eMAG.
      </p>

      <Button onClick={salveaza} disabled={seSalveaza}>
        {seSalveaza ? <Loader2 className="animate-spin" /> : null}
        {seSalveaza ? "Se salvează..." : "Salvează datele GPSR"}
      </Button>
    </div>
  );
}

function PanouStoculSiTaxa({ businessId, status }: { businessId: string; status: StareEmag }) {
  const [rezerva, setRezerva] = useState(String(status.stocRezervat ?? ""));
  const [taxa, setTaxa] = useState(String(status.greenTax ?? ""));
  const [reaprovizionare, setReaprovizionare] = useState(String(status.supplyLeadTime ?? ""));
  const [seSalveaza, incepe] = useTransition();

  function salveaza() {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, {
        stoc_rezervat: rezerva.trim() === "" ? null : Number(rezerva),
        green_tax: taxa.trim() === "" ? null : Number(taxa),
        supply_lead_time: reaprovizionare.trim() === "" ? null : Number(reaprovizionare),
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Salvat.");
    });
  }

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field
          label="Oprește pentru magazinul tău"
          hint="Bucăți scăzute din stocul trimis la eMAG. Cu 2 aici și 10 în depozit, eMAG vede 8."
        >
          <Input
            inputMode="numeric"
            value={rezerva}
            placeholder="0"
            onChange={(e) => setRezerva(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </Field>

        {/*
          ⚠ LISTĂ, NU CÂMP LIBER, ȘI ĂSTA E TOT ROSTUL.

          eMAG îngăduie doar 2, 3, 5, 7, 14, 30, 60, 90 sau 120 de zile — e un enum în
          schema lor. Un câmp liber ar fi lăsat pe cineva să scrie 10, iar eMAG ar fi
          refuzat oferta cu un mesaj despre numele câmpului, nu despre valorile
          îngăduite. Comerciantul ar fi căutat greșeala în altă parte.

          ⚠ „Nu spun" e prima opțiune, și e implicitul. eMAG are propriul lui 14; nu
          i-l suprascriem pe cel pus de om în panoul lor decât dacă chiar alege aici.
        */}
        <Field
          label="Reaprovizionare"
          hint="În câte zile aduci marfa înapoi când se termină. eMAG acceptă doar valorile astea."
        >
          <select
            className={SELECT}
            value={reaprovizionare}
            onChange={(e) => setReaprovizionare(e.target.value)}
          >
            <option value="">Nu spun (eMAG pune 14 zile)</option>
            {SUPPLY_LEAD_TIME_INGADUIT.map((z) => (
              <option key={z} value={String(z)}>{z} zile</option>
            ))}
          </select>
        </Field>

        <Field
          label="Taxă verde (lei)"
          /* ⚠ Se spune pe ecran, fiindcă e singura sumă din integrare care merge cu TVA. */
          hint={
            <>
              Doar dacă o cer categoriile tale. <strong className="text-foreground">Se scrie cu TVA
              inclus</strong>, spre deosebire de prețuri. Numai pe eMAG România.
            </>
          }
        >
          <Input
            inputMode="decimal"
            value={taxa}
            placeholder="0"
            onChange={(e) => setTaxa(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
          />
        </Field>
      </div>

      <Button variant="outline" onClick={salveaza} disabled={seSalveaza}>
        {seSalveaza ? <Loader2 className="animate-spin" /> : null}
        {seSalveaza ? "Se salvează..." : "Salvează"}
      </Button>
    </div>
  );
}

/**
 * „Sincronizeaza acum", pe felii.
 *
 * ═══ ⚠ DE CE NU UN SINGUR BUTON ═══
 *
 * Fiindca feliile costa foarte diferit, iar omul apasa din motive foarte diferite.
 *
 * „Am schimbat preturile la 400 de produse si vreau sa plece acum" e o cerere de
 * cateva secunde pe ruta usoara. „Retrimite documentatia tuturor produselor" e ruta
 * grea, sute de cereri la 3 pe secunda, si tine ocupat ritmul magazinului minute
 * intregi — inclusiv pentru miscarile de stoc de dupa vanzari.
 *
 * Un singur buton le-ar fi facut pe amandoua de fiecare data. Comerciantul care voia
 * doar preturile ar fi platit costul intreg, n-ar fi stiut de ce dureaza, si a doua
 * oara n-ar mai fi apasat.
 */
function PanouSincronizare({ businessId }: { businessId: string }) {
  const [seLucreaza, incepe] = useTransition();

  function felie(f: "preturi" | "stocuri" | "produse", nume: string) {
    incepe(async () => {
      const r = await sincronizeazaFelieEmag(businessId, f);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.puse === 0
          ? "Nicio ofertă de sincronizat."
          : `${r.puse} ${r.puse === 1 ? "produs pus" : "produse puse"} la rând: ${nume}.`,
      );
    });
  }

  function comenzi() {
    incepe(async () => {
      const r = await aduComenzileAcumEmag(businessId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.noi === 0 && r.actualizate === 0
          ? "Nicio comandă nouă."
          : `${r.noi} comenzi noi, ${r.actualizate} actualizate.`,
      );
    });
  }

  return (
    <Panel title="Sincronizează acum" className="p-5">
      <p className="-mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
        Totul merge singur, din minut în minut. Butoanele de mai jos sunt pentru când nu
        vrei să aștepți. {/* ⚠ Se spune ca nu e nevoie de ele: un buton care pare
        obligatoriu il face pe om sa-l apese la fiecare schimbare. */}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={comenzi} disabled={seLucreaza}>
          {seLucreaza ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Adu comenzile
        </Button>
        <Button variant="outline" onClick={() => felie("stocuri", "stocuri")} disabled={seLucreaza}>
          Trimite stocurile
        </Button>
        <Button variant="outline" onClick={() => felie("preturi", "prețuri")} disabled={seLucreaza}>
          Trimite prețurile
        </Button>
        <Button
          variant="outline"
          onClick={() => felie("produse", "produse")}
          disabled={seLucreaza}
          title="Retrimite documentația completă. E trimiterea cea mai grea și poate dura câteva minute."
        >
          Retrimite produsele
        </Button>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        {/* ⚠ Se spune care e scumpa, ca omul sa aleaga in cunostinta de cauza. */}
        „Retrimite produsele” trimite documentația întreagă și poate dura minute la un
        catalog mare. Ofertele preluate din eMAG nu sunt atinse de niciunul.
      </p>
    </Panel>
  );
}

/**
 * Adresa la care eMAG poate trimite notificari.
 *
 * ═══ ⚠ SE ARATA TOCMAI FIINDCA NU SE POATE PUNE DIN COD ═══
 *
 * Cautat in tot OpenAPI-ul lor: nu exista nicio ruta care sa primeasca un URL de
 * callback. Notificarile EXISTA — documentatia le enumera: comenzi noi, anulari,
 * retururi si schimbari de stare, statusul AWB, documentatie aprobata — dar adresa
 * se pune din partea lor, la cerere.
 *
 * Fara cartea asta, comerciantul n-ar fi avut de unde sti nici ca notificarile sunt
 * cu putinta, nici ce adresa sa ceara. Iar integrarea ar fi mers la fel de bine, doar
 * cu comenzile intrate la un minut in loc de indata — adica o lipsa pe care nimeni
 * n-ar fi observat-o si nimeni n-ar fi reparat-o.
 */
/**
 * Aduce comenzile vechi din eMAG (§87).
 *
 * ═══ ⚠ SE SPUNE LIMPEDE CE NU FACE ═══
 *
 * Nu scade stoc și nu emite facturi. Un comerciant care tocmai a trecut la Edinio se
 * așteaptă la contrariul — „importă-mi comenzile" sună a „fă tot ce faci de obicei" —
 * iar un stoc ajuns pe minus în câteva secunde, sau facturi duplicate plecate la ANAF
 * cu serii noi, se descoperă mult prea târziu.
 *
 * Textul de aici e singurul loc în care poate afla ÎNAINTE.
 */
function PanouIstoric({ businessId }: { businessId: string }) {
  const [zile, setZile] = useState("30");
  const [rezultat, setRezultat] = useState<{ noi: number; actualizate: number; complet: boolean } | null>(null);
  const [seLucreaza, incepe] = useTransition();

  function adu() {
    if (!window.confirm(
      `Aduc comenzile eMAG din ultimele ${zile} de zile.\n\n`
      + "NU se scade stoc și NU se emit facturi pentru ele, fiindcă au fost deja onorate și\n"
      + "facturate atunci. Intră doar ca istoric, ca să le ai la un loc.",
    )) return;

    incepe(async () => {
      const r = await importaIstoricEmag(businessId, Number(zile));
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setRezultat(r);
      /* ⚠ Se spune și când N-A adus tot. Un „gata, 340 de comenzi" pe un import oprit
         la jumătate l-ar fi lăsat pe om să creadă că are tot istoricul. */
      toast[r.complet ? "success" : "warning"](
        r.complet
          ? `${r.noi} comenzi noi, ${r.actualizate} actualizate.`
          : `${r.noi} comenzi noi, dar nu s-a adus tot. Apasă din nou.`,
      );
    });
  }

  return (
    <Panel title="Adu comenzile vechi" className="p-5">
      <p className="-mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
        Le vezi în Edinio la un loc cu restul. <strong className="text-foreground">Nu se scade
        stoc și nu se emit facturi</strong>, fiindcă au fost onorate și facturate atunci.
        Repetate, ar da stoc pe minus și facturi duplicate.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${SELECT} w-auto`}
          value={zile}
          onChange={(e) => setZile(e.target.value)}
          disabled={seLucreaza}
        >
          <option value="30">Ultimele 30 de zile</option>
          <option value="90">Ultimele 90 de zile</option>
          <option value="180">Ultimele 6 luni</option>
          <option value="365">Ultimul an</option>
        </select>
        <Button variant="outline" onClick={adu} disabled={seLucreaza}>
          {seLucreaza ? <Loader2 className="animate-spin" /> : <Download />}
          Adu-le
        </Button>
      </div>

      {rezultat && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {rezultat.noi} noi · {rezultat.actualizate} actualizate
          {!rezultat.complet && " · nu s-a adus tot, mai apasă o dată"}
        </p>
      )}
    </Panel>
  );
}

function PanouNotificari({
  url, ultimulWebhook, ultimaSincronizare,
}: {
  url: string;
  ultimulWebhook: string | null;
  ultimaSincronizare: string | null;
}) {
  const [copiat, setCopiat] = useState(false);

  return (
    <Panel title="Comenzi instant (optional)" className="p-5">
      <p className="-mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
        Comenzile intra oricum singure, la fiecare minut. Daca vrei sa vina{" "}
        <strong className="text-foreground">in aceeasi clipa</strong>, cere-i eMAG-ului sa
        trimita notificari la adresa de mai jos. Nu se poate pune din Edinio, numai ei o pot
        configura.
      </p>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopiat(true);
            toast.success("Adresa a fost copiata.");
            setTimeout(() => setCopiat(false), 2000);
          }}
          title="Copiaza adresa"
          aria-label="Copiaza adresa"
        >
          {copiat ? <CheckCircle className="text-primary" /> : <Copy />}
        </Button>
      </div>

      {/*
        ⚠ CELE DOUA MARCAJE RASPUND LA DOUA INTREBARI DIFERITE.
        „Ultima sincronizare" spune daca integrarea traieste. „Ultimul semnal" spune
        daca notificarile chiar au fost pornite de eMAG — intrebare care altfel n-are
        niciun raspuns, fiindca lipsa lor nu strica nimic vizibil: comenzile intra
        oricum, doar mai incet.
      */}
      <div className="-mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          Ultima sincronizare:{" "}
          <strong className="text-foreground">
            {ultimaSincronizare
              ? new Date(ultimaSincronizare).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })
              : "încă niciodată"}
          </strong>
        </span>
        <span>
          Ultimul semnal de la eMAG:{" "}
          <strong className="text-foreground">
            {ultimulWebhook
              ? new Date(ultimulWebhook).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })
              : "niciunul, notificările nu sunt pornite"}
          </strong>
        </span>
      </div>
    </Panel>
  );
}

/**
 * Aducerea ofertelor din contul eMAG.
 *
 * ═══ ⚠ CE SCRIE PE BUTON E O PROMISIUNE, SI SE TINE ═══
 *
 * Scrie „leaga produsele care exista deja" fiindca ASTA face: potrivirea cauta
 * intai dupa `emag_id`, apoi `part_number_key`, apoi codul de bare, apoi SKU, si
 * creeaza produs numai cand nu gaseste nimic. Un buton care ar fi scris doar
 * „Importa" ar fi lasat omul sa creada ca-si dubleaza catalogul, si n-ar fi apasat.
 *
 * ⚠ SE ARATA SI CE N-A MERS, NU DOAR CE A MERS. O oferta pe care n-am putut-o lega
 * nu e o nereusita a comerciantului, dar e singurul lucru pe care numai el il poate
 * limpezi — si daca nu i se spune, nu afla niciodata ca exista. La Trendyol, motivul
 * respingerii n-a fost aratat si produsele au stat „in aprobare" la nesfarsit.
 */
function PanouImport({ businessId }: { businessId: string }) {
  const [seLucreaza, incepe] = useTransition();
  const [raport, setRaport] = useState<RaportAratat | null>(null);
  const [faza, setFaza] = useState<Faza>("gata");
  const [create, setCreate] = useState<{ facute: number; total: number } | null>(null);
  /*
   * ═══ ⚠ NEBIFAT LA DESCHIDERE, SI ASTA E CHIAR HOTARAREA (24.08.2026) ═══
   *
   * Butonul facea doua lucruri deodata: citea ofertele SI transforma in produse noi
   * ce n-avea pereche. Comerciantul a intrebat, inainte sa apese: „nu vreau sa
   * importe produsele din eMAG in magazin”. Intrebarea lui era buna — unele magazine
   * vand pe eMAG lucruri pe care nu le tin in magazinul propriu.
   *
   * Citirea si legarea nu ating magazinul. Crearea il schimba, si nu se desface cu un
   * buton. Deci alegerea implicita e cea care nu strica nimic.
   */
  const [creeaza, setCreeaza] = useState(false);

  function importa() {
    incepe(async () => {
      setRaport(null);
      setCreate(null);
      setFaza("citim");

      const r = await importaDinEmag(businessId, creeaza);
      if ("error" in r) {
        setFaza("gata");
        toast.error(r.error);
        return;
      }

      const problemeInPlus: string[] = [];

      /*
       * ═══ ⚠ CREAREA PRODUSELOR SE DUCE PANA LA CAPAT CHIAR AICI ═══
       *
       * `processImport` lucreaza pe bucati, si dinadins: un catalog mare n-ar incapea
       * intr-o singura chemare. Lasat asa, importul s-ar fi incheiat cu un raport
       * frumos, iar produsele ar fi aparut in magazin peste doua minute, cand le-ar
       * fi prins cronul de rezerva. Comerciantul ar fi vazut „gata" si un catalog
       * gol, si ar fi apasat inca o data.
       *
       * ⚠ Bucla e MARGINITA. Fara plafon, un job care nu se incheie niciodata — o
       * eroare de scriere care se repeta — ar fi tinut fila invartind la nesfarsit.
       * Cand se atinge plafonul se SPUNE, si restul chiar il duce cronul.
       */
      if (r.importId) {
        setFaza("cream");
        for (let pas = 0; pas < PASI_MAXIM; pas++) {
          const p = await continuaImportEmag(businessId, r.importId);
          if ("error" in p) {
            problemeInPlus.push(`Crearea produselor s-a oprit: ${p.error}`);
            break;
          }
          setCreate({ facute: p.facute, total: p.total });
          if (p.gata) break;
          if (pas === PASI_MAXIM - 1) {
            problemeInPlus.push(
              "Ai un catalog mare, iar restul produselor se creează în fundal. " +
              "Poți închide pagina; revino în câteva minute.",
            );
          }
        }
      }

      /*
       * ⚠ Legarea se cheama SI cand crearea s-a oprit la plafon. Ce s-a creat pana
       * atunci merita legat acum; restul il prinde apasarea urmatoare, fiindca pasul
       * e re-derivabil si nu tine minte nimic.
       */
      setFaza("legam");
      const l = await leagaOferteImportateEmag(businessId);
      const legatePeUrma = "error" in l ? 0 : l.legate;
      if ("error" in l) problemeInPlus.push(l.error);

      setRaport({
        legate: r.raport.legate + legatePeUrma,
        deCreat: r.raport.deCreat,
        cunoscute: r.raport.cunoscute,
        nehotarate: r.raport.nehotarate,
        ocupate: r.raport.ocupate,
        disparute: r.raport.disparute,
        probleme: [...r.raport.probleme, ...problemeInPlus],
      });
      setFaza("gata");
      toast.success(r.mesaj);
    });
  }

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{BUTON_ADU_OFERTELE}</h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Citim lista produselor tale de pe eMAG și o potrivim cu produsele din
            magazin, după codul de produs, codul de bare sau SKU. Magazinul tău nu se
            modifică: nu se creează și nu se șterge niciun produs.
          </p>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Fă asta înainte să publici ceva. Altfel nu avem de unde să știm care produse
            sunt deja în contul tău, iar eMAG le refuză pe cele trimise a doua oară.
          </p>
        </div>
        <Button onClick={importa} disabled={seLucreaza}>
          {seLucreaza ? <Loader2 className="animate-spin" /> : <Download />}
          {ETICHETA_FAZA[faza]}
        </Button>
      </div>

      {/* ⚠ Comutatorul e SUB text si stins: e singurul lucru din panou care schimba
          magazinul, iar magazinul e al lui. */}
      <RandDeComutator
        titlu="Creează în magazin și produsele de pe eMAG care nu au pereche la mine"
        text="Lasă-l oprit dacă vrei doar să legăm ce ai deja. Produsele create rămân în magazin până le ștergi tu, unul câte unul."
        pornit={creeaza}
        dezactivat={seLucreaza}
        comuta={setCreeaza}
      />

      {faza === "cream" && create && create.total > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          Se creează produsele noi: {create.facute} din {create.total}.
        </p>
      )}

      {raport && (
        <div className="border-t border-border pt-5">
          {/* ⚠ ACELEASI CARDURI ca in capul paginii, si cu aceeasi marime pe tot randul:
              patru cutii gri desenate de mana langa patru carduri ale casei se citeau ca
              doua panouri diferite lipite unul de altul. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Legate de produse", value: raport.legate, icon: Link2,
                explicatie: "Oferte de pe eMAG potrivite cu un produs din magazin, după codul de produs, codul de bare sau SKU.",
              },
              {
                label: "Produse noi", value: raport.deCreat, icon: PackagePlus,
                explicatie: "Oferte fără pereche în magazin. Se creează ca produse noi doar dacă ai pornit comutatorul de mai sus.",
              },
              {
                label: "Deja cunoscute", value: raport.cunoscute, icon: Check,
                explicatie: "Oferte pe care le aveam legate dinainte. Nu s-a schimbat nimic la ele.",
              },
              {
                label: "De lămurit", value: raport.nehotarate + raport.ocupate, icon: HelpCircle,
                explicatie: "Oferte pe care nu le-am legat: ori se potriveau cu mai multe produse, ori produsul lor e deja legat de altă ofertă. Motivul e scris dedesubt.",
              },
            ].map((c) => (
              <CardStatistica
                key={c.label}
                marime={marimeaRandului([raport.legate, raport.deCreat, raport.cunoscute, raport.nehotarate + raport.ocupate])}
                icon={c.icon}
                label={c.label}
                value={c.value}
                explicatie={c.explicatie}
                empty={c.value === 0}
              />
            ))}
          </div>

          {raport.nehotarate > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">{raport.nehotarate}</strong>{" "}
              {raport.nehotarate === 1 ? "ofertă se potrivea" : "oferte se potriveau"} cu mai
              multe produse din magazin, așa că nu le-am legat de niciunul. Două produse cu
              același cod de bare sau același SKU sunt cauza obișnuită.
            </p>
          )}
          {raport.ocupate > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">{raport.ocupate}</strong>{" "}
              {raport.ocupate === 1 ? "ofertă s-a potrivit" : "oferte s-au potrivit"} cu un
              produs care e deja legat de altă ofertă eMAG. Un produs poate avea o singură
              ofertă.
            </p>
          )}
          {raport.disparute > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">{raport.disparute}</strong>{" "}
              {raport.disparute === 1 ? "ofertă pe care o știam nu mai vine" : "oferte pe care le știam nu mai vin"}{" "}
              de la eMAG. Nu le-am șters, fiindcă e posibil să fi fost doar refăcute acolo.
            </p>
          )}

          {raport.probleme.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {raport.probleme.slice(0, 8).map((x, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>{x}</span>
                </li>
              ))}
              {raport.probleme.length > 8 && (
                <li className="pl-5.5 text-xs text-muted-foreground">
                  și încă {raport.probleme.length - 8}.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * Cate bucati de creare se duc din fila.
 *
 * ⚠ E o MARGINE, nu o limita de catalog. Fiecare bucata ia sute de produse, deci 60
 * acopera cu mult orice magazin real. Rostul ei e sa opreasca o bucla care nu se mai
 * incheie — o scriere care cade la fel de fiecare data — din a tine fila invartind
 * la nesfarsit. Ce ramane il duce cronul de rezerva, si asa i se si spune omului.
 */
const PASI_MAXIM = 60;

type Faza = "gata" | "citim" | "cream" | "legam";

const ETICHETA_FAZA: Record<Faza, string> = {
  gata: BUTON_ADU_OFERTELE_SCURT,
  citim: "Se citește lista de pe eMAG…",
  cream: "Se creează produsele…",
  legam: "Se leagă produsele…",
};

interface RaportAratat {
  legate: number;
  deCreat: number;
  cunoscute: number;
  nehotarate: number;
  ocupate: number;
  disparute: number;
  probleme: string[];
}

/**
 * Prerechizitul care nu exista la nicio alta integrare.
 *
 * ⚠ Se arata SI dupa conectare, restrans: daca eMAG incepe brusc sa refuze, primul
 * lucru de verificat e ca IP-ul e inca in lista lor alba. Ascuns dupa conectare,
 * comerciantul n-ar mai avea de unde sa-l ia.
 */
function PanouIp({ ip, restrans = false }: { ip: string | null; restrans?: boolean }) {
  if (!ip) return null;

  const adresa = (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm">{ip}</code>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(ip);
          toast.success("Adresă copiată.");
        }}
      >
        <Copy />
        Copiază
      </Button>
    </div>
  );

  /* Dupa conectare ramane doar adresa, ca s-o poti lua la nevoie. Lista de cerinte
     nu-si mai are rostul: omul a trecut deja de ele. */
  if (restrans) {
    return (
      <Panel title="Adresa IP a Edinio" className="p-5">
        {adresa}
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Înainte de a începe</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Trei lucruri cerute de eMAG. Fără ele conectarea e refuzată la ei, iar mesajul lor
        nu spune care dintre ele lipsește.
      </p>

      <ul className="mt-4 grid gap-x-10 gap-y-3.5 sm:grid-cols-2">
        {CERINTE.map((c) => (
          <li key={c.titlu} className="flex gap-2.5">
            {/*
              ⚠ CHIAR BIFA DE PE CARDURILE DE PRET ale site-ului de prezentare,
              ceruta de el pe 22.09.2026: `h-4 w-4`, `strokeWidth={2.5}`, verde.
              Vezi `PricingSection.tsx`. Verdele e acelasi simbol in amandoua
              locurile: site-ul scrie `VERDE_CITIBIL`, care e `var(--primary)`,
              adica exact ce da `text-primary` aici.
            */}
            <Check className="mt-[3px] h-4 w-4 flex-shrink-0 text-primary" strokeWidth={2.5} />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{c.titlu}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{c.text}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* ⚠ ADRESA STA CHIAR AICI, nu intr-o carte de ajutor: cerinta e a noastra,
          deci tot noi dam si valoarea, cu buton de copiere. */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground">Adresa noastră IP</p>
        <div className="mt-2">{adresa}</div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          În panoul eMAG: <span className="font-medium text-foreground">Contul meu → Setări API → adrese IP permise</span>.
          Dacă nu găsești secțiunea, scrie-i managerului tău de cont eMAG. La unele conturi, lista se
          completează de ei.
        </p>
      </div>
    </Panel>
  );
}

/**
 * Cine hotărăște la o derivă: Edinio sau eMAG.
 *
 * ⚠ DOUĂ BUTOANE, NU UN COMUTATOR. Un comutator are o stare „pornit" și una
 * „oprit", iar aici amândouă valorile sunt alegeri legitime — „eMAG" nu înseamnă
 * „oprit", înseamnă „ei au dreptate". Arătat ca un comutator stins, comerciantul ar
 * fi crezut că a dezactivat ceva.
 */
function AlegereSursa({
  eticheta, descriere, valoare, dezactivat, laSchimbare,
}: {
  eticheta: string;
  descriere: string;
  valoare: "edinio" | "emag";
  dezactivat: boolean;
  laSchimbare: (v: "edinio" | "emag") => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{eticheta}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{descriere}</p>
      </div>
      <div className="flex shrink-0 rounded-lg border border-border p-0.5" role="group" aria-label={eticheta}>
        {(["edinio", "emag"] as const).map((v) => (
          /* ⚠ `variant` se schimba cu alegerea, nu clasele: butonul apasat e cel al
             casei, plin, iar celalalt e fantoma. Aceeasi pereche ca peste tot. */
          <Button
            key={v}
            type="button"
            size="sm"
            variant={valoare === v ? "default" : "ghost"}
            onClick={() => laSchimbare(v)}
            disabled={dezactivat}
            aria-pressed={valoare === v}
          >
            {v === "edinio" ? "Edinio" : "eMAG"}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Un rând de setare cu comutator: titlu, lămurire, și o notă de atenție când
 * alegerea are un cost.
 *
 * ⚠ COMUTATOARE, NU BIFE. Cele cinci hotarari da/nu din ecran erau
 * `<input type="checkbox">` desenate de mana: nu semanau cu nimic altceva din
 * panou si se citeau ca un formular de pe alt site. Casa foloseste `Switch`
 * peste tot, de la „Mediu de test" al curierilor pana la setarile Trendyol.
 *
 * ⚠ ACELASI DESEN CA LA TRENDYOL (vezi `RandDeComutator` din `TrendyolClient`),
 * ca sa nu fie al treilea fel de comutator din panou. Scris local, nu importat,
 * fiindca si acolo e local: o componenta comuna s-ar fi cerut abia cand a treia
 * pagina ar fi avut chiar aceleasi nevoi.
 */
function RandDeComutator({
  titlu, text, atentie, pornit, dezactivat, comuta,
}: {
  titlu: string;
  text: string;
  atentie?: string;
  pornit: boolean;
  dezactivat?: boolean;
  comuta: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{titlu}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
        {atentie && <p className="mt-1.5 text-xs leading-relaxed text-warning">{atentie}</p>}
      </div>
      <Switch
        checked={pornit}
        disabled={dezactivat}
        onCheckedChange={comuta}
        className="mt-0.5 flex-shrink-0"
      />
    </div>
  );
}
