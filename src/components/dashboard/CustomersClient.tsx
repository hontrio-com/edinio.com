"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users, Search, Phone, Mail, MapPin, ShoppingBag, TrendingUp, Repeat,
  X, ChevronLeft, ChevronRight, Calendar, ExternalLink, ArrowUpDown, Loader2, Upload,
} from "lucide-react";
import { formatPrice, formatPriceValue, formatDate, formatDateShort, formatPhoneDisplay } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Customer, CustomerOrder, CustomersSummary } from "@/lib/customers";
import { getCustomerOrders } from "@/lib/actions/customer.actions";
import { CUSTOMERS_PAGE_SIZE } from "@/lib/orders/pagination";
import { orderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { EticheteClient } from "@/components/dashboard/clienti/EticheteClient";
import { Activitate } from "@/components/dashboard/clienti/Activitate";
import { ETICHETE, PERIOADE, type NumePerioada } from "@/lib/perioade";
import {
  NUMELE_SEGMENTULUI, SEGMENTE, TREPTE_VALOARE, cateFiltreTot, numeleCanalului,
  type OptiuneFiltru, type Segment,
} from "@/lib/customers/filtre";
import { CustomerImportModal } from "./CustomerImportModal";
import { SalveazaSegment } from "@/components/dashboard/clienti/SalveazaSegment";
import { AdaugaClient } from "@/components/dashboard/clienti/AdaugaClient";
import { BaraSelectie } from "@/components/dashboard/clienti/BaraSelectie";
import { comuta } from "@/lib/customers/selectie";
import { StergeContact } from "@/components/dashboard/clienti/StergeContact";

type SortKey = "recent" | "spent" | "orders" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Activitate recenta" },
  { key: "spent",  label: "Total cheltuit" },
  { key: "orders", label: "Numar comenzi" },
  { key: "name",   label: "Nume (A-Z)" },
];


/** Filele din fisa clientului, in ordinea lor. */
const FILELE_FISEI = [
  { cheie: "prezentare", eticheta: "Prezentare" },
  { cheie: "comenzi", eticheta: "Comenzi" },
  { cheie: "activitate", eticheta: "Activitate" },
  { cheie: "date", eticheta: "Date" },
] as const;

type CheieFila = (typeof FILELE_FISEI)[number]["cheie"];

/**
 * Un camp din fila „Date”.
 *
 * ⚠ Lipsa se SPUNE („nu avem”), nu se lasa o linie goala: un camp gol arata a
 * defect, iar comerciantul cauta unde se completeaza.
 */
function Camp({ eticheta, valoare }: { eticheta: string; valoare: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{eticheta}</span>
      <span className={cn("text-right", valoare ? "text-foreground" : "text-muted-foreground/60")}>
        {valoare ?? "nu avem"}
      </span>
    </div>
  );
}

export function CustomersClient({ customers, summary, totalCount, page, searchQuery, sort, perioada, segment, valoare, judet, canal, judete, canale, segmentId, segmentLipsa, businessId }: {
  /** Pagina curenta de clienti (max CUSTOMERS_PAGE_SIZE), agregata in Postgres. */
  customers: Customer[];
  summary: CustomersSummary;
  /** Total clienti pentru cautarea curenta (count exact din DB). */
  totalCount: number;
  page: number;
  searchQuery: string;
  sort: string;
  perioada: NumePerioada;
  segment: Segment;
  valoare: string | null;
  judet: string | null;
  canal: string | null;
  /** Numai judetele si canalele care EXISTA in magazin, cu cati clienti are fiecare. */
  judete: OptiuneFiltru[];
  canale: OptiuneFiltru[];
  /** Segmentul cu lista fixa deschis acum, daca e vreunul. */
  segmentId: string | null;
  /** Segmentul cerut prin adresa n-are niciun om (sters, sau gol). */
  segmentLipsa: boolean;
  businessId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startNavTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const lastNavQ = useRef(searchQuery);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [importing, setImporting] = useState(false);

  /*
    ⚠⚠ BIFELE SE TIN PE CHEIE, nu pe pozitie in lista. Tinute pe pozitie, o
    sortare schimbata sau un client nou intrat intre timp ar muta bifele pe ALTI
    oameni — iar butonul de sub ele sterge date fara intoarcere. Vezi
    `selectia-e-pe-cheie-nu-pe-pozitie.test.ts`.
  */
  const [alese, setAlese] = useState<Set<string>>(new Set());

  /*
    ⚠⚠ SI CE PLEACA LA ACTIUNE SE TAIE PE PAGINA DE ACUM, la fiecare randare.
    Fara asta, bifele de pe pagina 1 ar fi plecat impreuna cu cele de pe pagina 2,
    iar bara ar fi aratat „63 selectați" intr-o lista de cincizeci.

    ⚠ Taierea se face AICI, la citire, nu intr-un `useEffect` care sa scrie
    starea: un efect care cheama `setState` naste o a doua randare la fiecare
    schimbare de pagina, si React o si semnaleaza. Golirea propriu-zisa se face
    la navigare (`goTo`), care e un eveniment.
  */
  const alesi = customers.filter((c) => alese.has(c.key));
  const toateBifate = customers.length > 0 && alesi.length === customers.length;

  // Datele vin gata agregate/cautate/paginate din SQL; interactiunile devin
  // parametri de URL (q, sort, page), deci functioneaza la orice volum.
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const buildUrl = useCallback((next: { q?: string; sort?: string; page?: number; perioada?: NumePerioada; segment?: Segment; valoare?: string | null; judet?: string | null; canal?: string | null }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? searchQuery;
    const nsort = next.sort ?? sort;
    const npage = next.page ?? page;
    if (nq) params.set("q", nq);
    if (nsort !== "recent") params.set("sort", nsort);
    /* ⚠ „tot” nu se scrie in adresa: e implicitul, iar o adresa curata se poate trimite. */
    const nperioada = next.perioada ?? perioada;
    if (nperioada !== "tot") params.set("perioada", nperioada);
    const nsegment = next.segment ?? segment;
    if (nsegment !== "toti") params.set("segment", nsegment);
    /* `next.valoare === null` inseamna „sterge filtrul”, deci nu se poate folosi `??`. */
    const nvaloare = next.valoare === undefined ? valoare : next.valoare;
    if (nvaloare) params.set("valoare", nvaloare);
    /* Aceeasi regula ca la valoare: `null` inseamna „sterge", nu „lasa cum era". */
    const njudet = next.judet === undefined ? judet : next.judet;
    if (njudet) params.set("judet", njudet);
    const ncanal = next.canal === undefined ? canal : next.canal;
    if (ncanal) params.set("canal", ncanal);
    if (npage > 1) params.set("page", String(npage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchQuery, sort, page, perioada, segment, valoare, judet, canal]);

  // Navigare externa (back/forward, link cu ?q=) → resincronizeaza inputul.
  useEffect(() => {
    if (searchQuery !== lastNavQ.current) {
      lastNavQ.current = searchQuery;
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);

  // Cautarea e debounced si dusa in URL; cautarea reala se face in SQL.
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = setTimeout(() => {
      lastNavQ.current = searchInput;
      startNavTransition(() => router.replace(buildUrl({ q: searchInput, page: 1 }), { scroll: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, searchQuery, buildUrl, router]);

  function goTo(next: { q?: string; sort?: string; page?: number; perioada?: NumePerioada; segment?: Segment; valoare?: string | null; judet?: string | null; canal?: string | null }) {
    /*
      ⚠ BIFELE SE GOLESC LA ORICE NAVIGARE. Altfel, un om care bifeaza zece
      clienti, pune un filtru si apasa „Șterge datele" ar sterge oameni pe care
      nu-i mai are pe ecran — si n-ar avea de unde sa afle.
    */
    setAlese(new Set());
    startNavTransition(() => router.push(buildUrl(next), { scroll: false }));
  }

  const marimeCifre = marimeaRandului([
    String(summary.totalContacts),
    String(summary.returningCustomers),
    { valoare: String(summary.returnRate), unitate: "%" },
    { valoare: formatPriceValue(summary.valuePerCustomer), unitate: "lei" },
  ]);

  return (
    <div>
      {/*
        ⚠ TITLUL SI DESCRIEREA S-AU MUTAT IN PAGINA, deasupra filelor: sunt ale
        paginii intregi, nu ale listei. Lasate aici, „Segmente” si „Importuri”
        si-ar fi desenat fiecare alt antet, sau niciunul.

        ⚠ PERIOADA STA LANGA CIFRE, nu langa lista: ea taie numai sumarul. Lista
        ramane pe tot istoricul — un client care n-a comandat luna asta e tot
        clientul magazinului, iar o lista care se goleste la schimbarea perioadei
        ar parea stricata.
      */}
      {/*
        ⚠ PE TELEFON SE AȘAZĂ PE DOUĂ RÂNDURI: perioada sus, pe toată lățimea
        (are cel mai lung text dintre toate, „De când există magazinul"), iar
        cele două butoane dedesubt, împărțind rândul în două părți egale.

        Pe un singur rând, cele trei se strângeau până când selectorul rămânea
        un ciot, iar butoanele își pierdeau textul și rămâneau două iconițe
        despre care nimeni nu știa ce fac.
      */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <select
          value={perioada}
          onChange={(e) => goTo({ perioada: e.target.value as NumePerioada, page: 1 })}
          aria-label="Perioada cifrelor de mai jos"
          className="w-full rounded-xl bg-card px-2.5 py-2 text-sm font-medium text-foreground ring-1 ring-foreground/10 sm:w-auto"
        >
          {PERIOADE.map((p) => (
            <option key={p} value={p}>{ETICHETE[p]}</option>
          ))}
        </select>
        {/*
          ⚠ ADĂUGAREA DE MÂNĂ stă lângă import, nu în „+ Adaugă" din bara de sus:
          acolo se adaugă lucruri de vânzare (produs, comandă), iar un client
          între ele ar fi al patrulea fel de obiect într-un meniu despre catalog.

          ⚠ Pe telefon butoanele își ȚIN textul și împart rândul în două: două
          iconițe fără cuvinte, într-un panou pe care comerciantul îl deschide o
          dată pe săptămână, înseamnă două ghicitori.
        */}
        <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <button
            onClick={() => setImporting(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-card px-3 py-2 text-sm font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
          >
            <Upload className="h-4 w-4" /> Importă clienți
          </button>
          <AdaugaClient businessId={businessId} />
        </div>
      </div>

      {importing && <CustomerImportModal onClose={() => setImporting(false)} />}

      {/*
        ═══ CELE PATRU CIFRE ═══

        ⚠ SUNT CHIAR `CardStatistica`, cel de la Statistici și de la Coșuri
        abandonate — nu unul local care semăna cu el. Cardul scris în fișierul
        paginii avea altă înălțime, altă mărime a cifrei și nicio explicație, iar
        două carduri care seamănă diverg la prima retușare.

        ⚠ „Venit total” și „Valoare medie comandă” AU IEȘIT de aici: amândouă există
        deja la Statistici. În pagina Clienți sunt utile mărimile despre RELAȚIA cu
        oamenii, nu cele despre vânzări.
      */}
      {/*
        ⚠⚠ O COLOANĂ PE TELEFON, două de la `sm`. Pornea de la două coloane, și
        era singura pagină din panou care o făcea: Statistici și Coșuri
        abandonate foloseau de mult `grid-cols-1 sm:grid-cols-2`.

        Măsurat pe telefon de 390px: cardul rămânea cu 129px pentru cifră, iar
        „407,11 lei" cere 165px la mărimea ei — deci trecea pe rândul următor.
        Și eticheta „Valoare medie per client" cere 136px, cu 94 disponibili.
        Nu era de reglat mărimea fontului: la 360px nici 28px nu încăpeau pentru
        un magazin cu sume de patru cifre.
      */}
      {/*
        ⚠⚠ O SINGURA MARIME PENTRU TOT RANDUL, data de cea mai lunga cifra.
        Lasata pe seama fiecarui card, „358" ramanea la 44px langa „407,11 lei"
        la 28px, si cele patru cutii nu mai aratau ca un set. Cerut de el.
        ⚠ `unit` („%") se numara si el: e scris in card, langa cifra.
      */}
      <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2 lg:grid-cols-4">
        <CardStatistica marime={marimeCifre}
          icon={Users}
          label="Clienți"
          value={String(summary.totalContacts)}
          explicatie={
            /*
              ⚠ CELE TREI CIFRE NU SE ADUNĂ, și de-aia se spun toate. Măsurat pe
              demo: 358 de contacte = 338 care au comandat vreodată + 20 importate,
              dar dintre cele 338 numai 292 au măcar o comandă validă — restul au
              comandat și totul le-a fost anulat sau rambursat. Un ecran care scrie
              „292 cumpărători și 20 importate” lângă „358” se contrazice singur, iar
              cine observă nu mai crede niciuna dintre cifre.
            */
            `${summary.totalContacts - summary.importedContacts} au comandat vreodată, `
            + `${summary.importedContacts} ${summary.importedContacts === 1 ? "e contact importat" : "sunt contacte importate"}, `
            + `iar ${summary.buyers} au cel puțin o comandă validă în perioada aleasă. `
            + "Îi identificăm după numărul de telefon, iar când lipsește, după email. "
            + "Numărul de sus e pe tot istoricul, nu pe perioadă."
          }
        />
        <CardStatistica marime={marimeCifre}
          icon={Repeat}
          label="Clienți recurenți"
          value={String(summary.returningCustomers)}
          explicatie={
            "Cumpărători cu mai mult de o comandă validă (neanulată și nerambursată) "
            + "în perioada aleasă. ⚠ Pe o fereastră scurtă cifra e mică din fire: "
            + "oamenii rareori cumpără de două ori într-o lună."
          }
        />
        <CardStatistica marime={marimeCifre}
          icon={TrendingUp}
          label="Rată de revenire"
          value={String(summary.returnRate)}
          unit="%"
          explicatie={
            /*
              ⚠ NUMITORUL SE SPUNE. O rată singură nu se poate verifica; cu „86 din
              358" se poate. Și se vede imediat când stă pe prea puțini oameni ca să
              însemne ceva.
            */
            `${summary.returningCustomers} din ${summary.buyers} `
            + `${summary.buyers === 1 ? "cumpărător a comandat" : "cumpărători au comandat"} din nou, `
            + "în perioada aleasă. "
            + "Contactele importate nu intră la numitor: n-aveau cum să revină."
          }
        />
        <CardStatistica marime={marimeCifre}
          icon={ShoppingBag}
          label="Valoare medie per client"
          value={formatPriceValue(summary.valuePerCustomer)}
          unit="lei"
          explicatie={
            "Valoarea comenzilor valide din perioada aleasă, împărțită la cumpărătorii "
            + "din aceeași perioadă. Media pe COMANDĂ stă la Statistici; aici interesează "
            + "cât aduce un om."
          }
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Caută după nume, telefon sau email…"
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <select
            value={sort}
            onChange={(e) => goTo({ sort: e.target.value, page: 1 })}
            className="appearance-none w-full sm:w-auto pl-10 pr-9 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:border-primary cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/*
        ═══ FILTRELE ═══

        ⚠ SE FILTREAZĂ ÎN BAZĂ, nu peste pagina adusă: numărul total și paginarea
        trebuie să fie ale mulțimii filtrate. Vezi `customers_aggregate`.

        ⚠ NICIUN FILTRU FĂRĂ DATE PE CARE SĂ CADă. Lipsesc dinadins „acceptă
        marketing" (n-avem consimțământ pe client), „tag” (nu există etichete scrise
        de comerciant) și „adăugat manual” (nu există adăugarea manuală). Toate trei
        sunt în plan, la etapele lor. Vezi `lib/customers/filtre.ts`.
      */}
      {/*
        ⚠ PE TELEFON MENIURILE STAU ÎNTR-O GRILĂ DE DOUĂ COLOANE, toate de
        aceeași lățime. Într-un `flex-wrap`, fiecare ieșea cât textul ei: „Toți
        clienții" scurt, „Municipiul Bucuresti (112)" lat, iar rândurile se
        rupeau la întâmplare — câte două pe un rând, unul pe altul, după cât
        magazin ai. Grila le face egale și previzibile, indiferent ce scrie în ele.

        ⚠ Și meniurile își iau lățimea containerului (`w-full`), altfel un
        `<select>` se întinde după cea mai lungă opțiune a lui, nu după celulă.
      */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={segment}
          onChange={(e) => goTo({ segment: e.target.value as Segment, page: 1 })}
          aria-label="Segment"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
        >
          {SEGMENTE.map((sg) => (
            <option key={sg} value={sg}>{NUMELE_SEGMENTULUI[sg]}</option>
          ))}
        </select>

        <select
          value={valoare ?? ""}
          onChange={(e) => goTo({ valoare: e.target.value || null, page: 1 })}
          aria-label="Valoarea comenzilor"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
        >
          <option value="">Orice valoare</option>
          {TREPTE_VALOARE.map((t) => (
            <option key={t.cheie} value={t.cheie}>{t.eticheta}</option>
          ))}
        </select>

        {/*
          ⚠⚠ JUDEȚUL ȘI CANALUL APAR DOAR DACĂ MAGAZINUL ARE MAI MULT DE UNUL.
          Un meniu cu o singură opțiune nu filtrează nimic: îl pune pe comerciant
          să-l deschidă ca să afle asta. Și un magazin care vinde doar pe site-ul
          lui n-are ce alege la „canal".

          ⚠ Opțiunile vin din bază, nu dintr-o listă scrisă în cod: cele 42 de
          județe ale țării, la un magazin care livrează în douăsprezece, ar fi
          însemnat treizeci de alegeri care nu găsesc pe nimeni.
        */}
        {judete.length > 1 && (
          <select
            value={judet ?? ""}
            onChange={(e) => goTo({ judet: e.target.value || null, page: 1 })}
            aria-label="Județ"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
          >
            <option value="">Orice județ</option>
            {judete.map((j) => (
              <option key={j.valoare} value={j.valoare}>{j.valoare} ({j.cati})</option>
            ))}
          </select>
        )}

        {canale.length > 1 && (
          <select
            value={canal ?? ""}
            onChange={(e) => goTo({ canal: e.target.value || null, page: 1 })}
            aria-label="Canal"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
          >
            <option value="">Orice canal</option>
            {canale.map((c) => (
              <option key={c.valoare} value={c.valoare}>{numeleCanalului(c.valoare)} ({c.cati})</option>
            ))}
          </select>
        )}

        {/*
          ⚠ „Șterge filtrele” apare DOAR când există ce șterge. Un buton mereu acolo,
          de cele mai multe ori fără efect, îl învață pe om să-l ignore — și atunci nu-l
          mai vede nici când chiar are nevoie de el.
        */}
        {cateFiltreTot({ segment, valoare, judet, canal }) > 0 && (
          <button
            type="button"
            onClick={() => goTo({ segment: "toti", valoare: null, judet: null, canal: null, page: 1 })}
            className="col-span-2 rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:col-span-1"
          >
            Șterge filtrele ({cateFiltreTot({ segment, valoare, judet, canal })})
          </button>
        )}

        {/*
          ⚠ „Salvează segmentul” apare DOAR când există un filtru de salvat, din
          același motiv ca ștergerea de mai sus. Și fiindcă un segment fără niciun
          filtru e tot magazinul sub un nume care promite altceva — server-ul îl
          refuză oricum, dar un buton care refuză mereu e o promisiune goală.
        */}
        {cateFiltreTot({ segment, valoare, judet, canal }) > 0 && (
          <div className="col-span-2 sm:col-span-1">
            <SalveazaSegment
              businessId={businessId}
              criterii={{ segment, valoare, q: searchQuery, judet, canal }}
            />
          </div>
        )}

        {/*
          ⚠ CÂȚI AU IEȘIT, lângă filtre. Fără cifra asta, un filtru care nu găsește pe
          nimeni arată exact ca o pagină stricată. Cu ea, „0 clienți” e un răspuns.
        */}
        {/* Pe telefon numărul trece pe rândul lui, aliniat la dreapta ca pe desktop. */}
        <span className="col-span-2 text-right text-xs text-muted-foreground sm:col-span-1 sm:ml-auto">
          {totalCount} {totalCount === 1 ? "client" : "clienți"}
        </span>
      </div>

      {/*
        ⚠ BARA APARE DOAR CÂND E CEVA BIFAT. Mereu acolo, goală, ar fi ocupat un
        rând din ecran ca să spună „0 selectați" — și l-ar fi învățat pe om s-o
        ignore tocmai când chiar are ceva în ea.
      */}
      {/*
        ⚠ CÂND E DESCHIS UN SEGMENT CU LISTĂ FIXĂ, se spune pe față. Altfel, lista
        scurtă ar fi arătat ca un filtru obișnuit, iar omul ar fi crezut că
        magazinul lui a rămas cu atâția clienți.

        ⚠ Și un segment care nu mai are pe nimeni NU se dă drept „tot magazinul":
        e chiar cazul în care s-ar fi trimis o campanie greșită.
      */}
      {segmentId && (
        <div className="mb-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
          {segmentLipsa
            ? "Segmentul ăsta n-are niciun client — ori a fost șters, ori lista lui e goală."
            : "Vezi un segment cu listă fixă: oamenii din el au fost aleși o dată și nu se mai schimbă."}{" "}
          <Link href="/dashboard/customers" className="font-semibold text-foreground hover:underline">
            Vezi toți clienții
          </Link>
        </div>
      )}

      {alesi.length > 0 && (
        <BaraSelectie
          businessId={businessId}
          alesi={alesi}
          segment={segment}
          onGata={() => setAlese(new Set())}
          onAnuleaza={() => setAlese(new Set())}
        />
      )}

      {/* List */}
      {customers.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {searchQuery || cateFiltreTot({ segment, valoare, judet, canal }) > 0
              ? "Niciun client pentru ce ai ales"
              : "Niciun client încă"}
          </p>
          {/*
            ⚠ GOLUL SPUNE DE CE E GOL. „Niciun client găsit” după un filtru arată
            exact ca o pagină stricată. Acum se spune care e pricina — căutarea sau
            filtrul — și ce se poate face cu ea.
          */}
          <p className="text-sm text-muted-foreground">
            {cateFiltreTot({ segment, valoare, judet, canal }) > 0
              ? "Sterge filtrele sau alege altele."
              : searchQuery
                ? "Încearcă altă căutare."
                : "Clienții apar aici după prima comandă din magazin, sau Îi poți aduce acum prin import."}
          </p>
        </div>
      ) : (
        <div className={cn("bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border transition-opacity", isPending && "opacity-60")}>
          {/*
            ═══ CAPUL DE TABEL, NUMAI PE DESKTOP ═══

            ⚠ O SINGURĂ BUCATĂ DE MARKUP pentru amândouă formele, nu două. Pe
            desktop rândul se așază în coloane care se aliniază sub cap; pe telefon
            aceeași copii curg unul lângă altul, ca până acum. Două markup-uri ar fi
            divergat la prima retușare, și cineva ar fi reparat numai unul.

            ⚠ Lățimile coloanelor sunt FIXE pe desktop: altfel fiecare rând și-ar
            așeza singur coloanele după cât text are, și nimic nu s-ar alinia — adică
            exact ce făcea lista până acum.
          */}
          <div className="hidden lg:flex items-center gap-3 bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex w-9 flex-shrink-0 items-center">
              {/*
                ⚠ BIFEAZĂ CE E PE PAGINA ASTA, nu toți cei {totalCount}. Bara de
                deasupra o spune pe litere. Un „bifează tot" care ar pretinde că
                a luat tot magazinul ar fi o minciună cu urmări.
              */}
              <input
                type="checkbox"
                checked={toateBifate}
                onChange={() => setAlese(toateBifate ? new Set() : new Set(customers.map((c) => c.key)))}
                aria-label="Bifează toți clienții de pe pagina asta"
                className="h-4 w-4 cursor-pointer accent-primary"
              />
            </span>
            <span className="w-9 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">Client</span>
            <span className="w-52 flex-shrink-0">Segment</span>
            <span className="w-48 flex-shrink-0 text-right">Comenzi</span>
            <span className="w-28 flex-shrink-0 text-right">Valoare</span>
            <span className="w-4 flex-shrink-0" aria-hidden="true" />
          </div>
          {customers.map((c) => (
            /*
              ⚠ BIFA STĂ ÎN AFARA BUTONULUI, nu înăuntrul lui. Un `<input>` într-un
              `<button>` e HTML nevalid, iar apăsarea pe bifă ar fi deschis fișa în
              loc s-o bifeze — adică exact pe dos față de ce voia omul.
            */
            <div
              key={c.key}
              className={cn(
                "flex w-full items-center gap-3 px-4 transition-colors",
                alese.has(c.key) ? "bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <input
                type="checkbox"
                checked={alese.has(c.key)}
                onChange={() => setAlese((v) => comuta(v, c.key))}
                aria-label={`Bifează ${c.name}`}
                className="h-4 w-4 flex-shrink-0 cursor-pointer accent-primary"
              />
            <button
              type="button"
              onClick={() => setSelected(c)}
              className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                {c.name[0]?.toUpperCase() ?? "C"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {/*
                    ⚠ Trecut prin `formatPhoneDisplay`. Până acum rândurile arătau
                    numărul exact cum a fost scris la checkout, deci în listă stăteau
                    unul sub altul `0753639611`, `+40755588107` și `+359884123309`.
                    Funcția exista de mult și n-o chema nimeni.
                  */}
                  {/*
                    ⚠ PE TELEFON NUMAI TELEFONUL, pe desktop și emailul. Măsurat la
                    390px: rândul are 114px, iar „0753 493 208 · alina.avram@exemplu.test"
                    se tăia la „0753 493 208 · ali…". Trei litere dintr-un email nu ajută
                    pe nimeni să recunoască pe cineva, dar strică un număr de telefon
                    care altfel se citea întreg. Când omul n-are telefon, emailul ia locul.
                  */}
                  <span className="sm:hidden">
                    {c.phone ? formatPhoneDisplay(c.phone) : (c.email ?? "")}
                  </span>
                  <span className="hidden sm:inline">
                    {formatPhoneDisplay(c.phone)}{c.email ? ` · ${c.email}` : ""}
                  </span>
                </p>

                {/*
                  ⚠⚠ PE TELEFON ETICHETELE STAU PE RÂNDUL LOR, sub nume, nu lângă el.
                  Lângă nume, ele nu se strâng — sunt cutii cu text scurt — iar
                  `truncate` de pe nume mânca tot ce mai rămânea. Măsurat pe un
                  telefon de 390px: „Simona Dinu" cu „Recurent" și „VIP" lângă ea
                  DISPĂREA cu totul, iar „Radu Ene" se scria „Radu ...".

                  Adică tocmai numele omului, singurul lucru după care îl recunoști,
                  era primul sacrificat. Pe desktop au mai departe coloana lor.

                  ⚠ Cele șapte etichete au regulile în `lib/customers/etichete.ts`,
                  cu măsurătorile care le-au hotărât.
                */}
                <div className="mt-1 flex flex-wrap items-center gap-1 lg:hidden">
                  <EticheteClient client={c} cheie={c.key} />
                </div>
              </div>
              {/* Coloana „Segment”, numai pe desktop: pe telefon etichetele stau langa nume. */}
              <div className="hidden lg:flex w-52 flex-shrink-0 flex-wrap items-center gap-1">
                <EticheteClient client={c} cheie={c.key} />
              </div>

              {/* Un client importat n-a comandat inca: nu are nici numar, nici data. */}
              <div className="hidden sm:block w-auto lg:w-48 flex-shrink-0 text-right">
                {c.lastOrderAt ? (
                  <>
                    {/*
                      ⚠ NUMĂRUL ȘI SUMA VORBEAU DESPRE MULȚIMI DIFERITE. Scria
                      „5 comenzi · 1.240 lei cheltuit”, dar cele cinci puteau cuprinde
                      două anulate, pe când suma le scotea. Acum se arată câte sunt
                      valide, iar totalul doar când diferă — altfel ar fi zgomot pe
                      fiecare rând.
                    */}
                    <p className="text-xs text-muted-foreground">
                      {c.validOrderCount} {c.validOrderCount === 1 ? "comandă validă" : "comenzi valide"}
                      {c.orderCount !== c.validOrderCount && (
                        <span className="text-muted-foreground/70"> din {c.orderCount}</span>
                      )}
                    </p>
                    {/*
                      ⚠ STAREA ULTIMEI COMENZI, CU ETICHETA PANOULUI. Era un text gri
                      („achitat”) sub sumă, care nu semăna cu nimic din restul panoului
                      și nu se putea deosebi dintr-o privire. Acum e același punct
                      colorat ca la Comenzi.
                    */}
                    {/*
                      ⚠ Data SCURTĂ („16 sept. 2026”), nu cea lungă: într-un tabel,
                      „16 septembrie 2026” rupe coloana pe două rânduri și strică
                      alinierea pe care tocmai am făcut-o. În fișa clientului, unde e
                      loc, rămâne cea lungă.
                    */}
                    <p className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground/70">
                      {formatDateShort(c.lastOrderAt)}
                      {c.lastStatus && (
                        <EtichetaStare ton={orderStatus(c.lastStatus).ton} marime="mic">
                          {orderStatus(c.lastStatus).label}
                        </EtichetaStare>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground/70">Fără comenzi</p>
                )}
              </div>
              <div className="w-24 lg:w-28 flex-shrink-0 text-right">
                {/*
                  ⚠ „VALOAREA COMENZILOR”, nu „cheltuit”. Suma cuprinde și comenzi
                  neachitate încă (ramburs pe drum, plată în așteptare), deci „cheltuit”
                  promitea bani intrați. Banii chiar intrați se văd în fișa clientului,
                  sub „Total încasat”.
                */}
                <p className="text-sm font-bold text-foreground tabular-nums">{formatPrice(c.ordersValue)}</p>
                <p className="text-[11px] text-muted-foreground">valoare comenzi</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * CUSTOMERS_PAGE_SIZE + 1}–{Math.min(currentPage * CUSTOMERS_PAGE_SIZE, totalCount)} din {totalCount} clienti
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goTo({ page: Math.max(1, currentPage - 1) })}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goTo({ page: item as number })}
                        className={cn(
                          "min-w-[28px] h-7 px-2 rounded-lg text-xs font-medium border transition-colors",
                          currentPage === item
                            ? "bg-primary text-white border-primary"
                            : "border-border hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {item}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  onClick={() => goTo({ page: Math.min(totalPages, currentPage + 1) })}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && <CustomerDetail customer={selected} businessId={businessId} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetail({ customer, businessId, onClose }: { customer: Customer; businessId: string; onClose: () => void }) {
  const addressParts = [customer.address, customer.city, customer.county].filter(Boolean);

  // Istoricul se incarca on-demand (paginat) — clientul poate avea mii de
  // comenzi, deci lista de clienti nu il mai cara pe tot in payload.
  /*
    ⚠ Fila se tine in STARE, nu in adresa: e o alegere de-o clipa inauntrul fisei.
    Pusa in adresa, ar fi intrat in istoricul browserului, iar „inapoi” ar fi sarit
    intre file in loc sa inchida fisa — ceea ce nimeni nu asteapta.
  */
  const [fila, setFila] = useState<CheieFila>("prezentare");
  const [history, setHistory] = useState<CustomerOrder[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();

  const fetchHistory = useCallback((offset: number) => {
    startLoadTransition(async () => {
      let res: Awaited<ReturnType<typeof getCustomerOrders>>;
      try {
        res = await getCustomerOrders(businessId, customer.key, offset);
      } catch {
        /* ⚠ Aici nu exista `toast`: casa arata greseala in panou, prin `setHistoryError`, si asa
           ramane. Manerul porneste singur cand se deschide fisa clientului, deci un strigat peste
           ecran ar fi fost si nepoftit, si intr-un loc unde nimeni nu-l asteapta. */
        setHistoryError(
          "Nu am primit raspuns de la server, deci istoricul comenzilor nu s-a putut incarca. "
          + "Incearca din nou.",
        );
        return;
      }
      if ("error" in res) {
        setHistoryError(res.error);
        return;
      }
      setHistoryError(null);
      setHistory(prev => (offset === 0 ? res.orders : [...prev, ...res.orders]));
      setHistoryTotal(res.total);
    });
  }, [businessId, customer.key]);

  useEffect(() => {
    fetchHistory(0);
  }, [fetchHistory]);

  return (
    /*
      ═══ ⚠ SERTAR LATERAL PE DESKTOP, NU FEREASTRĂ ÎN MIJLOC ═══

      Ce câștigă, și de ce a cerut-o el:
        - lista rămâne vizibilă, deci se trece repede de la un client la altul;
        - e mai multă înălțime pentru istoric, care e partea lungă a fișei;
        - seamănă cu un CRM, nu cu o alertă.

      ⚠ PE TELEFON RĂMÂNE PESTE TOT ECRANUL. Un sertar de 28rem pe un ecran de
      390px n-ar fi un sertar, ar fi o fereastră cu o dungă inutilă pe margine.

      ⚠ Fundalul se închide la clic, ca până acum; sertarul oprește clicul, ca să
      nu se închidă când omul dă în el.
    */
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-full sm:max-h-none sm:w-[34rem] sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start gap-3 flex-shrink-0">
          <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
            {customer.name[0]?.toUpperCase() ?? "C"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground truncate">{customer.name}</h2>
              <EticheteClient client={customer} cheie={customer.key} marime="normal" />
            </div>
            <div className="mt-1 space-y-0.5">
              {/*
                ⚠ `tel:` PRIMESTE NUMARUL BRUT, nu pe cel frumos. Spatiile puse de noi
                pentru citit n-au ce cauta intr-o adresa de apel; telefonul le ignora
                de obicei, dar „de obicei” nu e o garantie cand butonul trebuie sa sune
                un client.
              */}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Phone className="h-3 w-3" /> {formatPhoneDisplay(customer.phone)}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="h-3 w-3" /> {customer.email}
                </a>
              )}
              {addressParts.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" /> {addressParts.join(", ")}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          ═══ FILELE FIȘEI ═══

          ⚠ Sertarul avea tot conținutul unul sub altul și se lungea cât ținea
          istoricul. Cu file, fiecare bucată are locul ei și se ajunge la ea dintr-o
          apăsare, nu derulând.

          ⚠ FILA SE ȚINE ÎN STARE, NU ÎN ADRESĂ: e o alegere de-o clipă înăuntrul
          fișei, nu ceva de trimis prin legătură. Pusă în adresă, ar fi intrat în
          istoricul browserului, iar „înapoi” ar fi sărit între file în loc să închidă
          fișa — ceea ce nimeni nu așteaptă.

          ⚠ „Date și preferințe” arată azi numai ce chiar avem. Consimțământul,
          canalul preferat și dezabonarea cer date care nu există încă pe client, și
          se spune asta pe filă, nu se lasă câmpuri goale care par stricate.
        */}
        <div className="flex flex-shrink-0 gap-1 border-b border-border px-3">
          {FILELE_FISEI.map((f) => (
            <button
              key={f.cheie}
              type="button"
              onClick={() => setFila(f.cheie)}
              className={cn(
                "border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors",
                fila === f.cheie
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {f.eticheta}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
          {fila === "prezentare" && (<>
          {/*
            ═══ CIFRELE, DESFĂCUTE ═══

            ⚠ ERAU TREI ȘI SPUNEAU MAI PUȚIN DECÂT PĂREAU. „Comenzi” număra și
            anulările, „Total cheltuit” le scotea, iar niciuna nu spunea câți bani au
            intrat cu adevărat. Acum:

              Comenzi          valide, și totalul dedesubt când diferă
              Valoare comenzi   ce a cerut omul de la magazin (fără anulate/rambursate)
              Total încasat     ce a ajuns chiar la comerciant

            ⚠ Cele două sume NU sunt același lucru și n-au voie să fie confundate: la
            ramburs, o comandă expediată e valoare, dar nu e încă încasare. Vezi
            `lib/customers/bani.ts`.
          */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{customer.validOrderCount}</p>
              <p className="text-[11px] text-muted-foreground">
                {customer.orderCount === customer.validOrderCount
                  ? "Comenzi"
                  : `Comenzi valide, din ${customer.orderCount}`}
              </p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.ordersValue)}</p>
              <p className="text-[11px] text-muted-foreground">Valoare comenzi</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.collectedTotal)}</p>
              <p className="text-[11px] text-muted-foreground">Total încasat</p>
            </div>
          </div>

          {/*
            Anulările și rambursările se spun pe nume, și numai când există: pe un
            client curat, un rând cu „0 anulate” ar fi zgomot.
          */}
          {(customer.cancelledCount > 0 || customer.refundedCount > 0) && (
            <p className="text-xs text-muted-foreground">
              {customer.cancelledCount > 0 && (
                <>{customer.cancelledCount} {customer.cancelledCount === 1 ? "comandă anulată" : "comenzi anulate"}</>
              )}
              {customer.cancelledCount > 0 && customer.refundedCount > 0 && " · "}
              {customer.refundedCount > 0 && (
                <>{customer.refundedCount} {customer.refundedCount === 1 ? "rambursată" : "rambursate"}</>
              )}
            </p>
          )}

          {/* Datele de comanda exista doar daca a comandat. Un client adus dintr-un
              import apare pana atunci cu contactul si adresa lui, si atat. */}
          {customer.firstOrderAt && customer.lastOrderAt ? (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> Prima comanda: <span className="text-foreground font-medium">{formatDate(customer.firstOrderAt)}</span>
              </span>
              <span className="text-muted-foreground">Ultima: <span className="text-foreground font-medium">{formatDate(customer.lastOrderAt)}</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Nu a plasat nicio comanda. Contactul a fost adus prin import.
            </div>
          )}

          </>)}

          {/* Istoricul comenzilor, fila lui. */}
          {fila === "comenzi" && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Istoric comenzi</p>

            {historyError ? (
              <div className="text-center py-6">
                <p className="text-xs text-destructive mb-3">{historyError}</p>
                <button
                  type="button"
                  onClick={() => fetchHistory(history.length)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Incearca din nou
                </button>
              </div>
            ) : historyTotal === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((o) => {
                  const st = orderStatus(o.status);
                  return (
                    <Link
                      key={o.id}
                      href={`/dashboard/orders/${o.id}`}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {/* ⚠ Fara „#” pus de noi: numarul comenzii il poarta deja
                              („#1355”), iar al doilea ajungea pe ecran ca „##1355”.
                              Comenzile de marketplace n-au niciun „#” (Trendyol
                              trimite „7016”), deci nici nu se poate adauga de-a
                              valma: se scrie asa cum vine. */}
                          <p className="text-sm font-semibold text-foreground truncate">{o.order_number}</p>
                          <EtichetaStare ton={st.ton} marime="mic">{st.label}</EtichetaStare>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(o.created_at)} · {o.item_count} {o.item_count === 1 ? "produs" : "produse"}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-foreground tabular-nums flex-shrink-0">{formatPrice(o.total)}</p>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                    </Link>
                  );
                })}

                {history.length < historyTotal && (
                  <button
                    type="button"
                    onClick={() => fetchHistory(history.length)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Incarca mai multe ({historyTotal - history.length} ramase)
                  </button>
                )}
              </div>
            )}
          </div>
          )}

          {fila === "activitate" && (
            <Activitate businessId={businessId} cheie={customer.key} />
          )}

          {fila === "date" && (
            <div className="space-y-3 text-xs">
              <Camp eticheta="Nume" valoare={customer.name} />
              <Camp eticheta="Telefon" valoare={customer.phone ? formatPhoneDisplay(customer.phone) : null} />
              <Camp eticheta="Email" valoare={customer.email} />
              <Camp eticheta="Adresă" valoare={[customer.address, customer.city, customer.county].filter(Boolean).join(", ") || null} />
              {/*
                ⚠ CE LIPSEȘTE SE SPUNE, NU SE LASă GOL. Consimțământul, canalul
                preferat și starea dezabonării cer date care nu se țin azi pe client.
                Câmpuri goale ar fi arătat a defect, iar comerciantul ar fi căutat unde
                se completează.
              */}
              <p className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
                Consimțământul pentru email și SMS, canalul preferat și starea
                dezabonării nu se țin încă pe client, deci nu se pot arăta aici.
                Dezabonările de la mesajele de recuperare se văd în Coșuri abandonate.
              </p>

              {/*
                ⚠⚠ ȘTERGEREA STĂ AICI, în fila „Date", nu la vedere în capul fișei:
                e o acțiune fără întoarcere, și nu una la care ajungi din greșeală
                în timp ce te uiți la comenzile omului.

                ⚠ Butonul face DOUĂ lucruri, după cum e omul: un contact fără
                comenzi se șterge de tot, un cumpărător se anonimizează. Vezi
                `clienti/StergeContact.tsx` — acolo e scris de ce.
              */}
              <StergeContact
                businessId={businessId}
                cheie={customer.key}
                nume={customer.name}
                orderCount={customer.orderCount}
                /* Inchide fisa; reincarcarea listei o face componenta, dupa raspuns. */
                onSters={onClose}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
