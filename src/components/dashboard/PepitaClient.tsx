"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Boxes, CalendarClock, Check, CheckCircle2, ClipboardCheck, Copy, Eye,
  Info, Layers, Loader2, Mail, Package, PackageCheck, Plug, RefreshCw, ShoppingCart, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import {
  activeazaPepita, deconecteazaPepita, dezvaluieAdresele, getComenziProblemaPepita,
  includeToateProdusePepita, listaProdusePepita, marcheazaTrimis, reproceseazaComandaPepita,
  rotestePepita,
  salveazaSetariPepita, setareProdusePepita, verificaProdusePepita,
  type AdresePepita, type AdresePiata, type ComandaProblema, type RandProdusPepita, type RezumatProduse,
  type SetariPepita, type StarePepita,
} from "@/lib/actions/pepita.actions";
import { CITIRI_PANOU, TIPURI_GARANTIE, type TipGarantie } from "@/lib/pepita/types";
import { sablonMesajPepita } from "@/lib/pepita/activare";
import { PietelePepita } from "./pepita/PietelePepita";

/**
 * Panoul integrarii Pepita.
 *
 * ═══ ⚠ CE NU ARE VOIE SA APARA AICI ═══
 *
 * Niciun buton care sa para ca trimite ceva spre Pepita: nici „confirmă comanda”,
 * nici „trimite AWB”, nici „schimbă statusul”. Documentatia lor descrie o singura
 * cale pentru comenzi, dinspre ei spre noi, iar confirmarea se face in panoul lor.
 * Un buton care ar parea ca face asta ar fi mai rau decat lipsa lui: comerciantul
 * ar apasa, ar crede ca a confirmat, si ar pierde termenul de o zi.
 *
 * ⚠ SI NICI „Conectat la Pepita”. Noi nu avem cum sa aflam ca ei au acceptat
 * conexiunea: nu exista niciun capat de stare. Ce stim e ca noi am pregatit totul
 * („Configurat în Edinio”) si, cel mult, ca ei au citit un feed. Atat se scrie.
 */

/*
  ⚠ CELE PATRU LUCRURI NU SUNT PASI DE-AI NOSTRI, ci felul in care merge legatura
  cu ei, si de-aia se spun de la inceput: fiecare dintre ele explica ceva ce
  comerciantul nu poate face din Edinio, oricat ar cauta butonul.

  Erau un bloc albastru cu un singur paragraf. Acum au titlu si lamurire, ca sa se
  poata citi dintr-o privire, nu rand cu rand.
*/
const INAINTE_DE_A_INCEPE: { titlu: string; text: string }[] = [
  {
    titlu: "Două adrese de feed și una de comenzi",
    text: "Edinio le pregătește singur: una cu produsele și prețurile, una doar cu stocul, iar pe a treia Pepita îți trimite comenzile.",
  },
  {
    titlu: "Activarea o fac ei",
    text: "Adresele se trimit la contactul tău din Pepita Seller Center. Noi nu avem cum să aflăm singuri că au acceptat legătura.",
  },
  {
    titlu: "Feedul nu conține produse cu variații",
    text: "Fiecare combinație activă pleacă drept produs de sine stătător, cu codul ei.",
  },
  {
    titlu: "Confirmarea și statusul comenzilor se operează în Pepita Admin",
    text: "Pepita nu are, deocamdată, o cale prin care Edinio să i le trimită înapoi. Termenul lor de confirmare e de o zi.",
  },
];

export function PepitaClient({ businessId, stare }: { businessId: string; stare: StarePepita }) {
  const router = useRouter();
  const [lucrez, setLucrez] = useState<string | null>(null);
  const config = stare.config;

  const cu = async (cheie: string, f: () => Promise<{ error?: string } | { ok: true }>) => {
    setLucrez(cheie);
    try {
      const r = await f();
      if ("error" in r && r.error) { toast.error(r.error); return false; }
      router.refresh();
      return true;
    } catch {
      /* ⚠ O actiune de server nu raspunde intotdeauna: cade reteaua, expira sesiunea, sau
         adresa actiunii nu mai exista dupa o livrare noua. Tacerea de aici ar lasa butonul
         invartindu-se la nesfarsit. */
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
      return false;
    } finally {
      setLucrez(null);
    }
  };

  /* ⚠ „Nicio comandă" e o AFIRMATIE. Cand citirea a picat, nu stim nimic: „-". */
  const ultimaComanda = stare.ultimaComanda
    ? cand(stare.ultimaComanda)
    : stare.citiriPicate.includes(CITIRI_PANOU.ultimaComanda) ? "-" : "Nicio comandă";

  /*
    ═══ CIFRELE ═══

    ⚠ ACELASI `CardStatistica` ca la Panou, Oferte, Statistici si Trendyol, cerut de el
    pe 22.09.2026. Erau cutiute gri desenate aici, cu cifra la 18px si eticheta dedesubt:
    semanau cu cardurile casei fara sa fie ele, deci se retusau separat si divergeau.

    ⚠ CIFRA SE ARATA SI CAND E BUNA, nu doar cand e zero. Un numar care apare numai la
    necaz nu se citeste ca o masuratoare, ci ca o alarma, si atunci nimeni nu-l foloseste
    ca sa vada ca a scazut de la 1.024 la 12 dupa un import. De-aia „Produse în feed" a
    urcat aici, din randul de text de sub starea conexiunii.

    ⚠ `marimeaRandului` se socoteste O DATA, din toate cifrele randului: altfel „3" ar
    iesi la 44px langa o data intreaga la 28px, si cele patru cutii n-ar mai arata ca un set.
  */
  const cifre = [
    {
      label: "Produse în feed", value: cifraSauNecunoscut(stare.produseAlese), icon: Package,
      explicatie: "Câte produse active pleacă spre Pepita chiar acum. Pe „toate produsele active” sunt toate cele active minus cele scoase de tine; pe „doar produsele alese de mine” sunt doar cele bifate, și numai cât timp produsul e activ.",
      /* ⚠ Si necunoscutul se scrie stins: „-" nu e o cifra, deci nu se poarta ca una. */
      gol: (stare.produseAlese ?? 0) === 0,
    },
    {
      label: "Comenzi primite", value: cifraSauNecunoscut(stare.comenziTotal), icon: ShoppingCart,
      explicatie: "Toate comenzile pe care Pepita ni le-a trimis până acum, din toate țările.",
      gol: (stare.comenziTotal ?? 0) === 0,
    },
    {
      label: "Cu probleme", value: cifraSauNecunoscut(stare.comenziCarantina), icon: AlertTriangle,
      explicatie: "Comenzile Pepita care nu au intrat întregi în Edinio și au nevoie de verificare înainte de expediere. Le vezi mai jos, la „Comenzi”.",
      gol: (stare.comenziCarantina ?? 0) === 0,
    },
    {
      label: "Ultima comandă", value: ultimaComanda, icon: CalendarClock,
      explicatie: "Când a sosit ultima comandă de la Pepita. „-” înseamnă că nu am putut citi, nu că n-a venit niciuna.",
      gol: stare.ultimaComanda === null,
    },
  ];
  const marimeCifre = marimeaRandului(cifre.map((c) => c.value));

  /*
    ⚠ NUMAI CITIRILE CIFRELOR DE DEASUPRA. Lista vine intreaga de la server, iar „ultima
    citire a feedului" tine de panoul Conexiune, unde e si tratata. Numarata aici,
    avertismentul ar fi pus la indoiala cifre care erau bune.
  */
  const picateAici = stare.citiriPicate.filter((c) => c !== CITIRI_PANOU.feed);

  return (
    <div className="space-y-4">
      {/*
        ═══ ÎNAINTE DE A ÎNCEPE ═══

        ⚠ NU E UN BLOC COLORAT. O casetă colorată înseamnă „uită-te aici, ceva e
        de făcut acum”, iar aici nu e nimic de făcut: sunt patru lucruri de știut
        o singură dată. Pe o pagină pe care comerciantul intră des, caseta care nu
        anunță nimic se învață și apoi nu se mai vede, inclusiv atunci când chiar
        apare una adevărată dedesubt.
      */}
      <Panel className="p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Înainte de a începe</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Cum merge legătura cu Pepita, în patru rânduri. Două dintre ele nu se pot face din
          Edinio, oricât ai căuta butonul: activarea și confirmarea comenzilor.
        </p>
        <ul className="mt-4 grid gap-x-10 gap-y-3.5 sm:grid-cols-2">
          {INAINTE_DE_A_INCEPE.map((p) => (
            <li key={p.titlu} className="flex gap-2.5">
              {/*
                ⚠ CHIAR BIFA DE PE CARDURILE DE PRET ale site-ului de prezentare,
                cerută de el pe 22.09.2026: `h-4 w-4`, `strokeWidth={2.5}`, verde.
                Vezi `PricingSection.tsx`, unde verdele se scrie `VERDE_CITIBIL`,
                adică `var(--primary)`, adică exact ce dă `text-primary` aici.
              */}
              <Check className="mt-[3px] h-4 w-4 flex-shrink-0 text-primary" strokeWidth={2.5} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-foreground">{p.titlu}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Conexiune
        stare={stare}
        lucrez={lucrez}
        porneste={() => cu("porneste", () => activeazaPepita(businessId))}
        opreste={() => cu("opreste", () => deconecteazaPepita(businessId))}
      />

      {config.activ && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cifre.map((c) => (
              <CardStatistica
                key={c.label}
                marime={marimeCifre}
                icon={c.icon}
                label={c.label}
                value={c.value}
                explicatie={c.explicatie}
                empty={c.gol}
              />
            ))}
          </div>

          {picateAici.length > 0 && (
            <Callout variant="warning" icon={AlertTriangle}>
              Nu am putut citi {picateAici.join(", ")}. Cifrele de mai sus pot fi incomplete.
              Reîncarcă pagina peste câteva minute.
            </Callout>
          )}

          <Adrese
            businessId={businessId}
            trimisLa={config.trimis_la}
            lucrez={lucrez}
            roteste={(fel) => cu(`rotire-${fel}`, () => rotestePepita(businessId, fel))}
            marcheaza={(v) => cu("trimis", () => marcheazaTrimis(businessId, v))}
          />
          {/*
            ⚠ TARILE STAU INAINTEA SETARILOR SI A PRODUSELOR, fiindca ele
            hotarasc CE feeduri exista. Puse la urma, omul ar fi ales strategia
            de pret si produsele fara sa stie catre cate tari pleaca.
          */}
          <Panel title="Țările către care trimiți">
            <p className="text-xs text-muted-foreground">
              Pepita cere un feed separat pentru fiecare țară. Prețurile tale sunt în{" "}
              <span className="font-medium text-foreground">{stare.monedaMagazinului}</span>; pentru
              o țară cu altă monedă scrii tu cursul, iar fără el feedul acelei țări nu pleacă deloc.
            </p>
            <PietelePepita
              businessId={businessId}
              piete={config.piete}
              monedaMagazinului={stare.monedaMagazinului}
              piataDeBaza={config.piata}
              strategie={config.strategie_pret}
            />
          </Panel>

          <Setari businessId={businessId} config={config} />
          <Produse businessId={businessId} modImplicit={config.mod_includere} />
          <Catalog businessId={businessId} />
          <Comenzi businessId={businessId} stare={stare} />
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONEXIUNEA
   ═══════════════════════════════════════════════════════════════════════════ */

function Conexiune({ stare, lucrez, porneste, opreste }: {
  stare: StarePepita;
  lucrez: string | null;
  porneste: () => void;
  opreste: () => void;
}) {
  const c = stare.config;
  const gata = c.activ && c.areFeedToken && c.areOrderKey;
  const aCitit = !!stare.ultimaCitire;
  /*
    ⚠ TREI STARI, NU DOUA. Dacă citirea a picat, nu știm dacă Pepita a citit vreodată feedul,
    iar sfatul „Activarea conexiunii se face de către Pepita" ar fi fost tocmai sfatul greșit
    dat unui magazin la care totul merge.
  */
  const stimDacaACitit = !stare.citiriPicate.includes(CITIRI_PANOU.feed);
  /*
    ═══ ⚠ FEEDUL GOL STINGE BIFA VERDE ═══

    Pana pe 09.09.2026 starea de aici se socotea DOAR din `gata` plus ultima citire, adica din
    „exista chei" si „cineva a deschis adresa". Nimic despre continut. Trei magazine din trei
    au avut deci bifa verde si „Pepita citește feedul" peste un `<Catalog>` gol, iar unul din
    ele avea 1.353 de produse active. Comerciantul a aflat dintr-un email al Pepitei.

    ⚠ `=== 0`, NU `!produseAlese`. Cifra e `number | null`, iar `null` inseamna „n-am putut
    citi", nu „zero". Cu o verificare adevarat/fals, o pana a bazei ar fi aprins o alarma de
    feed gol peste un feed plin, adica exact minciuna inversa.
  */
  const feedGol = stare.produseAlese === 0;

  return (
    <Panel title="Conexiune">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {!c.activ && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Plug className="h-4 w-4" /> Neconfigurat
            </p>
          )}
          {gata && feedGol && (
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {aCitit ? "Pepita citește un feed gol" : "Feedul nu conține niciun produs"}
            </p>
          )}
          {gata && !feedGol && !aCitit && (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> Configurat în Edinio
            </p>
          )}
          {gata && !feedGol && aCitit && (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> Pepita citește feedul
            </p>
          )}
          {/*
            ⚠ SE SPUNE CE STIM SI CE NU. „Pepita citește feedul” e un fapt: adresa a fost
            deschisă de cineva cu cheia noastră. „Conectat la Pepita” ar fi o presupunere,
            fiindcă nu avem nicio cale prin care să aflăm că au acceptat conexiunea.
          */}
          <p className="text-xs text-muted-foreground">
            {gata && feedGol
              ? "Niciun produs nu pleacă spre Pepita, deci feedul răspunde cu un catalog gol. "
                + "Alege ce trimiți în „Ce produse pleacă pe Pepita”, mai jos."
              : gata && aCitit
                ? `Ultima citire: ${cand(stare.ultimaCitire)}. Frecvența o stabilește Pepita: de obicei stocul o dată pe oră, prețurile și descrierile o dată pe zi.`
                : gata && stimDacaACitit
                  ? "Adresele sunt gata. Activarea conexiunii se face de către Pepita, după ce le trimiți."
                  : gata
                    ? "Adresele sunt gata. Nu am putut afla dacă Pepita a citit deja feedul."
                    : "Pornește integrarea ca să genereze adresele pe care le trimiți la Pepita."}
          </p>
          {/* ⚠ Cifra produselor alese sta acum intre carduri, deasupra: vezi nota de acolo.
              Regula ei nu s-a schimbat, se arata SI cand e buna, nu doar cand e zero. */}
        </div>

        {c.activ ? (
          /*
            ⚠ INTREBAREA O PUNE FEREASTRA CASEI, ca la toate integrarile: oprirea sterge
            cheile, iar la repornire adresele sunt altele si trebuie trimise din nou la
            Pepita. Ce se pierde se scrie pe fata, nu „Ești sigur?".
          */
          <ButonDeconectare
            nume="Pepita"
            eticheta="Oprește integrarea"
            cePierzi="Adresele se închid imediat: feedul nu mai răspunde, iar comenzile noi sunt refuzate. Cheile se șterg, deci la repornire primești adrese noi, pe care trebuie să le trimiți din nou la Pepita. Comenzile deja primite, facturile și AWB-urile rămân neatinse. Anunță și Pepita, altfel vor continua să încerce."
            pending={lucrez === "opreste"}
            onConfirma={opreste}
          />
        ) : (
          <Button size="sm" onClick={porneste} disabled={lucrez !== null}>
            {lucrez === "porneste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Pornește integrarea
          </Button>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADRESELE
   ═══════════════════════════════════════════════════════════════════════════ */

function Adrese({ businessId, trimisLa, lucrez, roteste, marcheaza }: {
  businessId: string;
  trimisLa: string | null;
  lucrez: string | null;
  roteste: (fel: "feed" | "comenzi") => void;
  marcheaza: (v: boolean) => void;
}) {
  const [adrese, setAdrese] = useState<AdresePepita | null>(null);
  const [pietele, setPietele] = useState<AdresePiata[]>([]);
  const [incarc, setIncarc] = useState(false);

  const arata = async () => {
    setIncarc(true);
    try {
      const r = await dezvaluieAdresele(businessId);
      if ("error" in r) toast.error(r.error);
      else { setAdrese(r.adrese); setPietele(r.piete); }
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  const copiaza = (v: string) => {
    navigator.clipboard?.writeText(v);
    toast.success("Copiat.");
  };

  return (
    <Panel title="Adresele pentru Pepita">
      <p className="text-xs text-muted-foreground">
        Cele trei adrese conțin fiecare o cheie proprie magazinului tău. Nu le publica și nu le
        trimite decât către Pepita: cine are adresa feedului îți poate citi catalogul, iar cine are
        adresa de comenzi îți poate crea comenzi.
      </p>

      {!adrese ? (
        <Button variant="outline" size="sm" onClick={arata} disabled={incarc}>
          {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Arată adresele
        </Button>
      ) : (
        <div className="space-y-3">
          {/*
            ⚠ O PERECHE DE ADRESE PE FIECARE TARA, cu mesajul ei. Pepita cere
            fluxuri separate pe tara, iar activarea se face de oameni, pe conturi
            de tara: un singur mesaj care insira sapte perechi ar fi pus pe cineva
            sa aleaga, si cineva ar fi ales gresit.
          */}
          {pietele.map((pi) => (
            <div key={pi.piata} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{pi.eticheta}</span>
                <span className="text-xs text-muted-foreground">{pi.adresaLor} · {pi.moneda}</span>
                {pi.curs != null && (
                  <span className="text-xs text-muted-foreground">curs {pi.curs}</span>
                )}
                <Button
                  variant="ghost" size="sm" className="ml-auto"
                  onClick={() => copiaza(sablonMesajPepita(
                    { feedProduse: pi.feedProduse, feedStoc: pi.feedStoc, comenzi: adrese.comenzi },
                    pi.piata,
                  ))}
                >
                  <Mail className="h-4 w-4" /> Mesajul pentru {pi.eticheta}
                </Button>
              </div>
              {pi.opritPentru ? (
                /*
                  ⚠ ADRESELE UNEI PIETE OPRITE NU SE ARATA DELOC. Aratate, omul
                  le-ar fi trimis la Pepita, iar ei ar fi primit 404 de la prima
                  citire - adica o integrare nascuta moarta, si o discutie cu
                  suportul lor despre o adresa care „nu merge".
                */
                <p className="text-[11px] text-destructive">{pi.opritPentru}</p>
              ) : (
                <div className="space-y-2">
                  <Rand eticheta="Feed produse" valoare={pi.feedProduse} onCopy={copiaza} />
                  <Rand eticheta="Feed stoc" valoare={pi.feedStoc} onCopy={copiaza} />
                </div>
              )}
            </div>
          ))}

          {pietele.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nu ai nicio țară pornită. Alege cel puțin una mai sus, la „Țările către care trimiți”.
            </p>
          )}

          {/* ⚠ Adresa de comenzi e UNA SINGURA: comenzile din toate tarile vin pe ea,
              si fiecare isi poarta moneda. Vezi `comanda-forma.ts`. */}
          <Rand eticheta="Adresă comenzi (API), pentru toate țările" valoare={adrese.comenzi} onCopy={copiaza} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="outline" size="sm" disabled={lucrez !== null}
              onClick={() => {
                if (!confirm("Cheia veche a feedurilor se oprește imediat. Va trebui să trimiți noile adrese la Pepita, altfel feedul lor se oprește. Continui?")) return;
                setAdrese(null);
                setPietele([]);
                roteste("feed");
              }}
            >
              {lucrez === "rotire-feed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Schimbă cheia feedurilor
            </Button>
            <Button
              variant="outline" size="sm" disabled={lucrez !== null}
              onClick={() => {
                if (!confirm("Adresa veche de comenzi se oprește imediat. Până când Pepita primește adresa nouă, comenzile lor vor fi refuzate. Continui?")) return;
                setAdrese(null);
                setPietele([]);
                roteste("comenzi");
              }}
            >
              {lucrez === "rotire-comenzi" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Schimbă cheia de comenzi
            </Button>
          </div>
        </div>
      )}

      <Callout variant="neutral" icon={Info} title="Ce trebuie trimis la Pepita">
        <ul className="list-inside list-disc space-y-1 text-xs">
          <li>adresa feedului de produse și a celui de stoc;</li>
          <li>adresa de comenzi, ca să îți trimită comenzile automat;</li>
          <li>
            că feedul <strong className="text-foreground">nu conține produse cu variații</strong>:
            fiecare variantă pleacă drept produs de sine stătător, cu codul ei;
          </li>
          <li>dacă folosesc costul de transport și termenul de livrare din feed sau pe cele implicite.</li>
        </ul>
        <p className="mt-2 text-xs">
          Trimite-le la contactul tău dedicat sau la adresa de suport pentru vânzători din
          Pepita Seller Center. Activarea conexiunii se face de ei, nu din Edinio.
        </p>
      </Callout>

      <RandDeComutator
        titlu="Am trimis adresele către Pepita"
        text={trimisLa
          ? `Pornit pe ${cand(trimisLa)}. Activarea o fac ei, după ce le primesc.`
          : "Pornește-l după ce le-ai trimis, ca să știi unde ai rămas. Comutatorul nu trimite nimic la ei, doar ține minte."}
        pornit={!!trimisLa}
        comuta={marcheaza}
      />
    </Panel>
  );
}

function Rand({ eticheta, valoare, onCopy }: { eticheta: string; valoare: string; onCopy: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">{eticheta}</p>
      <div className="flex items-center gap-2">
        <Input
          readOnly value={valoare} onFocus={(e) => e.target.select()}
          aria-label={eticheta}
          className="min-w-0 flex-1 font-mono text-[11px] text-foreground"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => onCopy(valoare)}>
          <Copy className="h-3.5 w-3.5" /> Copiază
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETARILE
   ═══════════════════════════════════════════════════════════════════════════ */

function Setari({ businessId, config }: { businessId: string; config: StarePepita["config"] }) {
  const router = useRouter();
  const [salvez, setSalvez] = useState(false);
  const [f, setF] = useState<SetariPepita>({
    strategie_fel: config.strategie_pret.fel,
    strategie_valoare: config.strategie_pret.valoare,
    safety_stock: config.safety_stock,
    shipping_delay: config.shipping_delay,
    shipping_price: config.shipping_price,
    garantie_tip: config.garantie?.tip ?? "",
    garantie_durata: config.garantie?.durata ?? 0,
    mod_includere: config.mod_includere,
    factureaza_clientul: config.factureaza_clientul,
  });

  const salveaza = async () => {
    setSalvez(true);
    try {
      const r = await salveazaSetariPepita(businessId, f);
      if ("error" in r && r.error) toast.error(r.error);
      else { toast.success("Setări salvate."); router.refresh(); }
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setSalvez(false);
    }
  };

  /* Exemplul se socotește pe loc, ca omul să vadă ce înseamnă adaosul înainte să salveze. */
  const exemplu = f.strategie_fel === "procent"
    ? 100 * (1 + (Number(f.strategie_valoare) || 0) / 100)
    : f.strategie_fel === "fix"
      ? 100 + (Number(f.strategie_valoare) || 0)
      : 100;

  return (
    <Panel title="Setări">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ce produse pleacă">
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.mod_includere}
            onChange={(e) => setF({ ...f, mod_includere: e.target.value as SetariPepita["mod_includere"] })}
          >
            <option value="selectate">Doar produsele alese de mine</option>
            <option value="toate">Toate produsele active</option>
          </select>
        </Field>

        <Field label="Preț pe Pepita">
          <div className="flex gap-2">
            <select
              className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
              value={f.strategie_fel}
              onChange={(e) => setF({ ...f, strategie_fel: e.target.value as SetariPepita["strategie_fel"] })}
            >
              <option value="identic">La fel ca în magazin</option>
              <option value="procent">Adaos procentual</option>
              <option value="fix">Adaos fix</option>
            </select>
            {f.strategie_fel !== "identic" && (
              <Input
                type="number" step="0.01" className="w-28"
                value={f.strategie_valoare}
                onChange={(e) => setF({ ...f, strategie_valoare: Number(e.target.value) })}
              />
            )}
          </div>
          {f.strategie_fel !== "identic" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Un produs de 100 lei pleacă la Pepita cu {exemplu.toFixed(2)} lei.
            </p>
          )}
        </Field>

        <Field label="Stoc de siguranță">
          <Input
            type="number" min={0}
            value={f.safety_stock}
            onChange={(e) => setF({ ...f, safety_stock: Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Câte bucăți ții deoparte și nu le anunți la Pepita. Stocul real din Edinio nu se
            atinge: cu 5 pe stoc și 2 aici, Pepita vede 3.
          </p>
        </Field>

        <Field label="Termen de pregătire (zile lucrătoare)">
          <Input
            type="number" min={0} placeholder="implicit Pepita"
            value={f.shipping_delay ?? ""}
            onChange={(e) => setF({ ...f, shipping_delay: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Lăsat gol, Pepita folosește termenul stabilit la activare.
          </p>
        </Field>

        <Field label="Cost de transport pe bucată (lei)">
          <Input
            type="number" min={0} step="0.01" placeholder="implicit Pepita"
            value={f.shipping_price ?? ""}
            onChange={(e) => setF({ ...f, shipping_price: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se trimite pentru fiecare bucată, iar Pepita îl înmulțește singură cu cantitatea.
            Lăsat gol, folosesc costul implicit convenit cu ei.
          </p>
        </Field>

        <Field label="Garanție">
          <div className="flex gap-2">
            <select
              className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
              value={f.garantie_tip}
              onChange={(e) => setF({ ...f, garantie_tip: e.target.value as TipGarantie | "" })}
            >
              <option value="">Nu trimit garanție</option>
              {TIPURI_GARANTIE.filter((t) => t !== "None").map((t) => (
                <option key={t} value={t}>{ETICHETE_GARANTIE[t]}</option>
              ))}
            </select>
            {f.garantie_tip && (
              <Input
                type="number" min={1} className="w-24"
                value={f.garantie_durata}
                onChange={(e) => setF({ ...f, garantie_durata: Number(e.target.value) })}
              />
            )}
          </div>
        </Field>
      </div>

      {/*
        ⚠ CINE FACTUREAZĂ NU E O ÎNTREBARE: factura către clientul final o emite PARTENERUL,
        adică magazinul, și tot pe baza facturii lui se face decontarea. Textul de aici spunea
        altceva („Pepita nu spune public cine emite factura"), și a fost îndreptat pe 08.09.2026,
        după auditul extern.

        ⚠ Deci comutatorul e despre AUTOMATIZARE, nu despre responsabilitate. Rămâne stins din
        start fiindcă o factură emisă degeaba nu se retrage, se stornează, iar Pepita nu ne poate
        spune ce document a ieșit în altă parte.
      */}
      {/*
        ⚠ NUMELE SPUNE CE FACE COMUTATORUL, nu pune o întrebare la care nu putem răspunde.
        Forma veche — „Emit eu factura către client" — suna ca și cum n-ar fi limpede cine
        facturează, iar asta e o chestiune între comerciant și Pepita, nu una pe care s-o
        hotărască un comutator din Edinio.
      */}
      <RandDeComutator
        titlu="Include comenzile Pepita în facturarea automată"
        text="Factura către client o emiți tu, ca partener Pepita. Pornit, comenzile Pepita intră în facturarea automată Edinio, ca oricare altă comandă."
        atentie="Lasă-l stins dacă facturezi din alt sistem: Pepita nu ne poate spune ce document a ieșit acolo, iar două facturi pentru aceeași marfă se repară mai greu decât una lipsă."
        pornit={f.factureaza_clientul}
        comuta={(v) => setF({ ...f, factureaza_clientul: v })}
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={salveaza} disabled={salvez}>
          {salvez ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvează setările
        </Button>
      </div>
    </Panel>
  );
}

const ETICHETE_GARANTIE: Record<TipGarantie, string> = {
  None: "Fără garanție",
  Day: "Zile lucrătoare",
  Week: "Săptămâni",
  Month: "Luni",
  Year: "Ani",
};

/* ═══════════════════════════════════════════════════════════════════════════
   ALEGEREA PRODUSELOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce produse pleaca pe Pepita.
 *
 * ⚠ NU SE INCARCA TOT CATALOGUL. Un magazin cu zece mii de produse ar da o pagina
 * care nu se deschide pe telefon, iar nimeni nu bifeaza zece mii de randuri. Se
 * cauta si se bifeaza punctual; pentru „vreau tot” exista butonul de dedesubt si
 * comutatorul din Setari.
 */
function Produse({ businessId, modImplicit }: { businessId: string; modImplicit: "toate" | "selectate" }) {
  const [cauta, setCauta] = useState("");
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState<RandProdusPepita[] | null>(null);
  const [maiSunt, setMaiSunt] = useState(false);
  const [incarc, setIncarc] = useState(false);
  const [lucrez, setLucrez] = useState(false);
  /* Cat s-a facut pana acum in trecerea curenta, ca butonul sa nu para inghetat. */
  const [progres, setProgres] = useState<{ facut: number; dinCate: number | null } | null>(null);
  /*
    Ce a ramas neterminat dupa o rulare oprita la mijloc. Toastul dispare in cateva secunde,
    iar o includere pe jumatate facuta arata exact ca una intreaga: asta ramane pe ecran.
  */
  const [ramas, setRamas] = useState<{ facut: number; dinCate: number | null } | null>(null);

  const incarca = async (p = pagina, termen = cauta) => {
    setIncarc(true);
    try {
      const r = await listaProdusePepita(businessId, termen, p);
      if ("error" in r) { toast.error(r.error); return; }
      setLista(r.produse);
      setMaiSunt(r.maiSunt);
      setPagina(p);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  const comuta = async (id: string, inclus: boolean) => {
    /*
     * ⚠ BIFA SE MUTA DUPA CE SERVERUL CONFIRMA, nu inainte. Mutata optimist, un refuz
     * ar fi lasat ecranul aratand „inclus” pentru un produs care nu pleaca nicaieri,
     * si comerciantul ar fi aflat din vanzari.
     */
    setLucrez(true);
    try {
      const r = await setareProdusePepita(businessId, [id], inclus);
      if ("error" in r && r.error) { toast.error(r.error); return; }
      setLista((l) => (l ?? []).map((p) => (p.id === id ? { ...p, inclus } : p)));
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setLucrez(false);
    }
  };

  return (
    <Panel title="Ce produse pleacă pe Pepita">
      <p className="text-xs text-muted-foreground">
        {modImplicit === "toate"
          ? "Setarea este „toate produsele active”, deci pleacă tot ce e activ în magazin. Aici poți scoate produse anume."
          : "Setarea este „doar produsele alese de mine”, deci pleacă doar ce bifezi aici."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Caută după nume"
          value={cauta}
          onChange={(e) => setCauta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void incarca(0, cauta); }}
          className="min-w-0 flex-1"
        />
        <Button variant="outline" size="sm" onClick={() => void incarca(0, cauta)} disabled={incarc}>
          {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Caută
        </Button>
        <Button
          variant="ghost" size="sm" disabled={lucrez}
          onClick={async () => {
            if (!confirm("Toate produsele active din magazin vor fi incluse în feedul Pepita. Continui?")) return;
            setLucrez(true);
            /*
              ⚠ SE IA MEREU DE LA CAP, si asta e alegerea buna acum.
              Un cursor pastrat intre apasari ar sari produsele aparute intre timp: fila poate
              sta deschisa ore, iar un import care se termina intre timp adauga produse cu
              id-uri mai mici decat cursorul. Iar reluarea de la zero nu mai costa aproape nimic:
              serverul citeste ce e deja in feed si scrie DOAR ce se schimba.
            */
            let facut = 0;
            let cursor: string | null = null;
            let dinCate: number | null = null;
            setRamas(null);
            try {
              /*
                ⚠ BUCLA E AICI, LA APASARE, nu pe server. Serverul face o trecere marginita si
                spune de unde se reia; o singura cerere care ar merge pana la capat peste un
                catalog mare ar depasi timpul functiei si ar cadea tocmai la magazinele mari.
                Reluarea e sigura: scrierea e un upsert, deci a doua trecere peste acelasi
                produs nu strica nimic.
              */
              for (;;) {
                const r = await includeToateProdusePepita(businessId, cursor);
                if ("error" in r) {
                  toast.error(`${r.error} S-au inclus ${facut} produse până aici.`);
                  setRamas({ facut, dinCate });
                  break;
                }
                facut += r.scrise;
                dinCate = r.dinCate ?? dinCate;
                setProgres({ facut, dinCate });
                if (!r.incomplet) { toast.success(`${facut} produse incluse.`); break; }
                cursor = r.dupa;
              }
              void incarca(pagina, cauta);
            } catch {
              toast.error(`Cererea nu a ajuns. S-au inclus ${facut} produse până aici.`);
              setRamas({ facut, dinCate });
            } finally { setLucrez(false); setProgres(null); }
          }}
        >
          {lucrez && progres
            ? `Includ… ${progres.facut}${progres.dinCate ? ` din ${progres.dinCate}` : ""}`
            : "Include toate produsele active"}
        </Button>
      </div>

      {ramas && (
        <Callout variant="warning" icon={AlertTriangle}>
          S-au inclus {ramas.facut}{ramas.dinCate ? ` din ${ramas.dinCate}` : ""} produse, apoi
          includerea s-a oprit. Apasă din nou: o ia de la început, dar sare peste ce e deja în
          feed, deci nu rescrie nimic degeaba.
        </Callout>
      )}

      {lista === null && (
        <p className="text-xs text-muted-foreground">Caută un produs sau apasă „Caută” ca să vezi lista.</p>
      )}
      {lista !== null && lista.length === 0 && (
        <p className="text-xs text-muted-foreground">Niciun produs activ care să se potrivească.</p>
      )}

      {lista !== null && lista.length > 0 && (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">{p.nume}</p>
                  {p.sku && <p className="truncate text-[11px] text-muted-foreground">{p.sku}</p>}
                </div>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {/* ⚠ Comutator, nu bifa: la fel ca setarile de mai sus si ca restul panoului.
                      Numele citit de cititorul de ecran poarta si produsul, fiindca randul nu
                      mai e un `<label>` care sa-l imprumute. */}
                  <Switch
                    size="sm"
                    aria-label={`În feed: ${p.nume}`}
                    checked={p.inclus} disabled={lucrez}
                    onCheckedChange={(v) => void comuta(p.id, v)}
                  />
                  În feed
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={pagina === 0 || incarc} onClick={() => void incarca(pagina - 1, cauta)}>
              Înapoi
            </Button>
            <span className="text-[11px] text-muted-foreground">Pagina {pagina + 1}</span>
            <Button variant="ghost" size="sm" disabled={!maiSunt || incarc} onClick={() => void incarca(pagina + 1, cauta)}>
              Înainte
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CATALOGUL
   ═══════════════════════════════════════════════════════════════════════════ */

function Catalog({ businessId }: { businessId: string }) {
  const [r, setR] = useState<RezumatProduse | null>(null);
  const [incarc, setIncarc] = useState(false);

  /*
    Cifrele verificarii, si marimea lor socotita O DATA, din tot randul: lasata pe seama
    fiecarui card, „6" ar iesi la 44px langa „1.353" la 36px, iar cele patru cutii n-ar
    mai arata ca un set.
  */
  const cifre = r ? cifreleCatalogului(r) : [];
  const marimeCifre = marimeaRandului(cifre.map((c) => c.value));

  const verifica = async () => {
    setIncarc(true);
    try {
      const raspuns = await verificaProdusePepita(businessId);
      if ("error" in raspuns) toast.error(raspuns.error);
      else setR(raspuns);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  return (
    <Panel title="Produsele din feed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Verificarea folosește exact regulile după care se scrie feedul, deci ce vezi aici este ce
          pleacă la Pepita.
        </p>
        <Button variant="outline" size="sm" onClick={verifica} disabled={incarc}>
          {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verifică produsele
        </Button>
      </div>

      {r && (
        <div className="space-y-3">
          {/*
            ⚠ PATRU CIFRE, NU CINCI. „Fără cod EAN" a coborât sub grilă, ca rând de text:
            a cincea cutie ar fi stat singură pe al doilea rând, lângă trei celule goale.
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

          {/*
            ⚠ NU E O EROARE, si de aceea nu e rosu si nu e o caseta de avertizare.
            Specificatia XML a Pepita numeste GTIN-ul „recomandat", dar in unele categorii
            il cere: vezi nota din `articole.ts`, cu cele trei documente ale lor care nu
            spun acelasi lucru. Cifra exista ca sa se poata VEDEA expunerea, nu ca sa
            opreasca feedul, si de-aia se scrie si cand e zero.
          */}
          {r.incluse > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {r.faraEan === 0
                ? "Toate produsele incluse pleacă cu cod EAN."
                : `${r.faraEan} ${r.faraEan === 1 ? "produs inclus pleacă" : "produse incluse pleacă"} fără cod EAN. Feedul nu se oprește, dar în categoriile unde Pepita cere GTIN produsul poate fi refuzat la ei.`}
            </p>
          )}

          {/*
            ⚠ „Articole” ≠ „produse”: o combinație aplatizată e un articol de sine stătător.
            Fără rândul ăsta, un catalog de 40 de produse care trimite 300 de articole ar
            părea o greșeală.
          */}
          <p className="text-[11px] text-muted-foreground">
            Un produs cu variante pleacă drept mai multe articole, câte unul pentru fiecare
            combinație activă. Așa rămâne exactă legătura dintre ce se vinde și ce stoc scade.
          </p>

          {r.partial && (
            <Callout variant="warning" icon={AlertTriangle}>
              Verificarea s-a oprit după primele 10.000 de produse. Cifrele de mai sus nu acoperă
              tot catalogul.
            </Callout>
          )}

          {(r.orfane ?? 0) > 0 && (
            <Callout variant="warning" icon={AlertTriangle}>
              <div className="space-y-1">
                <p className="text-xs text-foreground">
                  {r.orfane === 1
                    ? "Un articol trimis anterior la Pepita nu mai este generat de feed."
                    : `${r.orfane} articole trimise anterior la Pepita nu mai sunt generate de feed.`}
                </p>
                {/*
                  ⚠ SE SPUNE SI CE SE POATE FACE. Cel mai des e o redenumire de variantă: în
                  Edinio asta chiar distruge combinația, deci la Pepita rămâne un produs vechi
                  care se poate vinde în continuare. Noi nu îl putem șterge de acolo, fiindcă
                  feedul nu are cum să spună „scoate produsul ăsta".
                */}
                <p className="text-[11px] text-muted-foreground">
                  {/*
                    ⚠ CIFRA AMESTECA TREI CAUZE, deci textul nu mai afirma una singura. Un articol
                    iese din feed si cand varianta a fost redenumita sau ștearsă, si cand produsul
                    a fost dezactivat, dar SI cand produsul are o eroare care îl oprește: acela e
                    în lista de mai jos și se repară, nu se cere scos de la Pepita.
                  */}
                  Se întâmplă când ai redenumit sau ai șters o variantă, când ai dezactivat
                  produsul, dar și când un produs are o eroare care îl oprește din feed: pe
                  acelea le vezi mai jos și se repară aici. Articolele rămase la Pepita păstrează
                  ultimul preț și ultimul stoc trimise și se pot vinde în continuare, iar noi nu
                  le putem retrage din feed: verifică-le întâi, iar pe cele care chiar nu mai
                  există cere-le celor de la Pepita să le scoată.
                  {r.exempleOrfane.length > 0 && ` Primele: ${r.exempleOrfane.slice(0, 5).join(", ")}.`}
                </p>
              </div>
            </Callout>
          )}

          {r.orfane === null && !r.partial && (
            <Callout variant="warning" icon={AlertTriangle}>
              {/*
                ⚠ „0 articole rămase" ar fi o AFIRMATIE. Citirea evidenței a picat, deci nu știm
                nimic despre ele; restul cifrelor de mai sus sunt însă bune.
              */}
              Nu am putut verifica dacă au rămas articole la Pepita care nu mai sunt generate de
              feed. Restul cifrelor de mai sus sunt corecte.
            </Callout>
          )}

          {r.incluse === 0 && (
            <Callout variant="neutral" icon={Info}>
              Niciun produs nu este inclus încă în feedul Pepita. Alege produsele din lista de
              produse, sau treci setarea de mai sus pe „Toate produsele active”.
            </Callout>
          )}

          {r.produse.length > 0 && (
            <ul className="space-y-2">
              {r.produse.map((p) => (
                <li key={p.id} className="rounded-xl border border-border p-3">
                  <Link href={`/dashboard/products/${p.id}/edit`} className="text-xs font-medium text-foreground underline underline-offset-2">
                    {p.nume}
                  </Link>
                  <ul className="mt-1.5 space-y-1">
                    {p.probleme.map((pb, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px]">
                        <span className={pb.nivel === "eroare" ? "text-destructive" : "text-warning"}>
                          {pb.nivel === "eroare" ? "Eroare" : "Atenție"}
                        </span>
                        <span className="text-muted-foreground">
                          {pb.combinatie ? `[${pb.combinatie}] ` : ""}{pb.mesaj}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {r.cuErori === 0 && r.produse.length === 0 && r.incluse > 0 && (
            <Callout variant="success" icon={CheckCircle2}>
              Toate produsele incluse pot pleca la Pepita.
            </Callout>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * Cele patru cifre ale verificarii, cu explicatia fiecareia.
 *
 * ⚠ EXPLICATIILE SUNT SCRISE DIN CE FACE CODUL, nu din ce pare: „active” se numara in
 * plimbarea pe catalog, „incluse” trece prin chiar hotararea feedului (`inclus()`), iar
 * „cu erori” numara PRODUSE, nu probleme, fiindca un produs cu variante poate raporta
 * aceeasi lipsa de zece ori. Vezi `verificaProdusePepita`.
 */
function cifreleCatalogului(r: RezumatProduse) {
  return [
    {
      label: "Produse active", value: r.active, icon: Boxes,
      explicatie: "Câte produse active are magazinul, numărate la verificare. Peste 10.000, verificarea se oprește și ți-o spune.",
    },
    {
      label: "Incluse în feed", value: r.incluse, icon: PackageCheck,
      explicatie: "Câte dintre ele ar pleca la Pepita, după aceeași regulă pe care o folosește feedul: setarea de includere plus bifele tale.",
    },
    {
      label: "Articole trimise", value: r.articole, icon: Layers,
      explicatie: "Câte articole ar avea feedul. O combinație activă a unui produs cu variante e un articol de sine stătător, cu codul ei.",
    },
    {
      label: "Cu erori", value: r.cuErori, icon: XCircle,
      explicatie: "Câte produse incluse au cel puțin o eroare care le oprește din feed. Se numără produsul, nu problemele lui, și îl vezi în lista de mai jos.",
    },
  ];
}

/**
 * Cifra asa cum se scrie pe card.
 *
 * ⚠ `null` NU E ZERO. O interogare cazuta nu arunca, deci un `?? 0` pe raspunsul ei ar fi
 * aratat exact ca un magazin fara nicio comanda. Necunoscutul se arata ca necunoscut, iar
 * cardul ramane stins.
 */
function cifraSauNecunoscut(valoare: number | null): string | number {
  return valoare ?? "-";
}

/**
 * Un rând de setare cu comutator: titlu, lămurire, și o notă de atenție când
 * alegerea are un cost.
 *
 * ⚠ ACELASI DESEN CA LA TRENDYOL SI LA CURIERI, ca sa nu fie al treilea fel de comutator
 * din panou. Scris o data aici fiindca ecranul are doua.
 */
function RandDeComutator({
  titlu, text, atentie, pornit, comuta,
}: {
  titlu: string;
  text: string;
  atentie?: string;
  pornit: boolean;
  comuta: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{titlu}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
        {atentie && <p className="mt-1.5 text-xs leading-relaxed text-warning">{atentie}</p>}
      </div>
      <Switch checked={pornit} onCheckedChange={comuta} className="mt-0.5 flex-shrink-0" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMENZILE
   ═══════════════════════════════════════════════════════════════════════════ */

function Comenzi({ businessId, stare }: { businessId: string; stare: StarePepita }) {
  const [lista, setLista] = useState<ComandaProblema[] | null>(null);
  const [incarc, setIncarc] = useState(false);
  /** Comanda pe care o reincercam acum. Butonul se blocheaza doar pe randul ei. */
  const [reincerc, setReincerc] = useState<string | null>(null);

  const incarca = async () => {
    setIncarc(true);
    try {
      const r = await getComenziProblemaPepita(businessId);
      if ("error" in r) toast.error(r.error);
      else setLista(r);
    } catch {
      toast.error("Cererea nu a ajuns. Încearcă din nou.");
    } finally {
      setIncarc(false);
    }
  };

  return (
    <Panel title="Comenzi">
      {/*
        ⚠ CIFRELE COMENZILOR STAU SUS, INTRE CARDURI, nu aici. Erau trei cutiute desenate
        de mana chiar in panoul asta; acum sunt carduri ca la Panou si la Trendyol, iar
        avertismentul despre citirile picate le insoteste acolo, nu aici.
      */}
      <p className="text-xs text-muted-foreground">
        {/*
          ⚠ „AWB ca la orice altă comandă" era ADEVĂRAT DOAR PE JUMĂTATE: la Pepita Delivery
          transportul e în fluxul lor, cu eticheta lor, iar un AWB propriu ar fi al doilea colet
          pe același pachet. Generarea în masă le sare acum, dar textul le promitea.
        */}
        Comenzile Pepita apar în lista obișnuită de comenzi, cu eticheta Pepita. Le poți factura ca
        la orice altă comandă, iar pe cele cu livrare proprie le poți și expedia cu curierul tău.
        {" "}
        <strong className="text-foreground">La Pepita Delivery coletul îl duce GLS-ul contractat
        de ei</strong>: acolo nu emite AWB propriu, ar fi a doua etichetă pe același pachet, iar
        generarea în masă le sare.
        {" "}
        <strong className="text-foreground">Statusul lor nu pleacă înapoi la Pepita</strong>: după
        ce expediezi, treci comanda pe „trimisă” și în Pepita Admin.
      </p>

      {(stare.comenziCarantina ?? 0) > 0 && (
        <div className="space-y-2">
          <Callout variant="warning" icon={AlertTriangle}>
            {/*
              ⚠ TEXT NEUTRU, dinadins. Spunea „au linii pe care nu le-am putut lega" si „stocul
              lor nu a fost scăzut", iar amândouă puteau minți: în carantină intră acum și o
              comandă care nu se poate expedia (lipsește telefonul, strada), și una al cărei
              stoc a scăzut în parte. Cauza adevărată e scrisă pe fiecare rând, mai jos.
            */}
            {stare.comenziCarantina === 1
              ? "O comandă Pepita are nevoie de verificare înainte de expediere."
              : `${stare.comenziCarantina} comenzi Pepita au nevoie de verificare înainte de expediere.`}
          </Callout>
          {!lista ? (
            <Button variant="outline" size="sm" onClick={incarca} disabled={incarc}>
              {incarc ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Vezi care sunt
            </Button>
          ) : (
            <ul className="space-y-1">
              {lista.map((c) => (
                <li key={c.externalId} className="rounded-lg border border-border px-3 py-2 text-[11px]">
                  <span className="font-medium text-foreground">Comanda Pepita {c.externalId}</span>
                  {" · "}{cand(c.primitLa)}
                  {c.motiv ? <span className="block text-muted-foreground">{c.motiv}</span> : null}
                  <span className="mt-1 flex flex-wrap items-center gap-3">
                    {c.orderId && (
                      <Link href={`/dashboard/orders/${c.orderId}`} className="text-primary underline underline-offset-2">
                        Deschide comanda
                      </Link>
                    )}
                    {/*
                      ⚠ NUMELE BUTONULUI NU TRIMITE NIMIC SPRE PEPITA, si nici nu pare ca ar
                      trimite. Legătura e într-un singur sens: ei împing comenzi la noi, noi
                      n-avem cum să le trimitem nimic înapoi. „Reprocesează” lucrează numai
                      în Edinio: leagă din nou liniile de catalog și duce stocul la capăt.
                    */}
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      /* Subliniat ca vecinul lui, „Deschide comanda": doua actiuni de acelasi
                         fel pe acelasi rand nu au voie sa arate diferit. */
                      className="h-auto p-0 text-[11px] underline underline-offset-2"
                      /* Se blochează doar rândul pe care se lucrează: celelalte rămân apăsabile. */
                      disabled={reincerc === c.externalId}
                      onClick={async () => {
                        setReincerc(c.externalId);
                        try {
                          const r = await reproceseazaComandaPepita(businessId, c.externalId);
                          if ("error" in r) toast.error(r.error);
                          else if (r.ok) {
                            /*
                              ⚠ VERDE numai când comanda a IEȘIT din carantină. O reprocesare care
                              a mers, dar a lăsat comanda în verificare, e o veste galbenă: un toast
                              verde peste „rămâne în verificare" spune două lucruri deodată.
                            */
                            if (r.inCarantina) toast.warning(r.mesaj);
                            else toast.success(r.mesaj);
                            /* Lista se reîncarcă doar dacă s-a schimbat ceva: altfel ar clipi degeaba. */
                            if (r.schimbat) await incarca();
                          } else toast.error(r.mesaj);
                        } catch {
                          toast.error("Cererea nu a ajuns. Încearcă din nou.");
                        } finally { setReincerc(null); }
                      }}
                    >
                      {reincerc === c.externalId ? "Reprocesez…" : "Reprocesează"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Pepita cere confirmarea comenzii în cel mult o zi de la primirea ei, din panoul lor.
      </p>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/** Data, in forma scurta romaneasca. Fara biblioteci: un singur loc, un singur format. */
function cand(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
