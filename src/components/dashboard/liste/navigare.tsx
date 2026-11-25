"use client";

/*
  Piesele comune ale listelor din panou: Comenzi, Retururi, Decontări.

  Aceeasi reteta la toate trei: filtrele (cautare, perioada, fila aleasa, pagina) stau in ADRESA,
  filtrarea si paginarea le face serverul in SQL, iar lista vine gata. De aici: navigarea prin
  filtre, campul de cautare, filtrul de perioada, randul de filtre, filele subliniate, comutatorul
  in segmente, paginarea, lista goala si meniul care se monteaza abia la prima apasare.

  Au pornit in prototipul paginii de Comenzi (24.11.2026) si au fost mutate aici cand cele trei
  liste au intrat in paginile adevarate (25.11.2026).
*/

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search, SearchX, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ORDERS_PAGE_SIZE } from "@/lib/orders/pagination";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { ziuaDeAzi } from "@/lib/zi-romaneasca";
import type { TonEticheta } from "@/components/ui/eticheta-stare";
import { INEL, PunctStare } from "@/components/dashboard/atomi-panou";

/* ── Navigarea prin filtre ────────────────────────────────────────────────── */

/** Ce filtre are orice lista din panou: cautare, perioada, pagina. Fiecare lista le adauga pe ale ei. */
export interface FiltreDeBaza {
  q: string;
  deLa: string;
  panaLa: string;
  page: number;
}

export interface Navigare<F extends FiltreDeBaza = FiltreDeBaza> {
  filtre: F;
  /** Duce la aceeasi pagina cu filtrele schimbate. Lista vine de pe server, gata filtrata. */
  mergiLa: (urmator: Partial<F>, optiuni?: { inlocuieste?: boolean }) => void;
  /** Adevarat cat se asteapta raspunsul: lista veche ramane la vedere, stinsa. */
  inAsteptare: boolean;
}

/**
 * @param adresa Cum se scrie o stare a filtrelor in adresa. ⚠ O functie de modul (aceeasi la
 *   fiecare desenare), altfel `mergiLa` s-ar schimba la fiecare desenare si cautarea si-ar
 *   reporni ceasul la orice redesenare.
 */
export function useNavigare<F extends FiltreDeBaza>(filtre: F, adresa: (cale: string, filtre: F) => string): Navigare<F> {
  const router = useRouter();
  const cale = usePathname();
  const [inAsteptare, porneste] = useTransition();
  const mergiLa = useCallback<Navigare<F>["mergiLa"]>((urmator, optiuni) => {
    const tinta = adresa(cale, { ...filtre, ...urmator });
    porneste(() => {
      if (optiuni?.inlocuieste) router.replace(tinta, { scroll: false });
      else router.push(tinta, { scroll: false });
    });
  }, [adresa, cale, filtre, router]);
  return { filtre, mergiLa, inAsteptare };
}

/**
 * Cautarea: se scrie in camp, pleaca in adresa dupa o clipa de liniste, iar filtrarea o face
 * serverul, in SQL, pe toate comenzile, nu doar pe cele de pe ecran.
 */
export function useCautareServer({ filtre, mergiLa }: Navigare) {
  const [text, setText] = useState(filtre.q);
  const [vazut, setVazut] = useState(filtre.q);
  const [trimis, setTrimis] = useState(filtre.q);
  /*
    Adresa s-a schimbat din alta parte (Inapoi, „Șterge filtrele")? Campul o urmeaza. Daca e
    chiar raspunsul la ce am trimis noi, campul NU se atinge: omul poate ca a mai scris o
    litera intre timp, si ar pierde-o.
  */
  if (filtre.q !== vazut) {
    setVazut(filtre.q);
    if (filtre.q !== trimis) {
      setText(filtre.q);
      setTrimis(filtre.q);
    }
  }
  useEffect(() => {
    if (text === filtre.q) return;
    const t = setTimeout(() => {
      setTrimis(text);
      mergiLa({ q: text, page: 1 }, { inlocuieste: true });
    }, 400);
    return () => clearTimeout(t);
  }, [text, filtre.q, mergiLa]);
  return { text, setText };
}

/* Textul din camp e scurt dinadins: la 16 px pe telefon, unul mai lung iesea taiat („…sau telefo"). */
export function CampCautare({ nav, loc = "Caută număr, client, telefon", fond = "alb", className }: {
  nav: Navigare;
  loc?: string;
  /** „alb" pe fundalul paginii, „gri" inauntrul unui panou alb. */
  fond?: "alb" | "gri";
  className?: string;
}) {
  const { text, setText } = useCautareServer(nav);
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{loc}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {/*
        ⚠ Text de 16 px pe telefon (`text-base`), ca in campurile panoului: sub 16 px, Safari pe
        iPhone mareste toata pagina cand atingi campul si omul trebuie sa o micsoreze la loc.
      */}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={loc}
        className={cn(
          "h-10 w-full rounded-lg pl-9 pr-9 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring md:text-[13px] lg:h-9",
          fond === "alb" ? "bg-white ring-1 ring-black/10" : "bg-muted/60 focus:bg-white",
        )}
      />
      {text && (
        <button type="button" onClick={() => setText("")} aria-label="Șterge căutarea" className={cn("absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground max-lg:after:absolute max-lg:after:-inset-2 max-lg:after:content-['']", INEL)}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );
}

/* ── Butonul unui filtru ──────────────────────────────────────────────────── */

/** Cum arata butonul unui filtru din rand (perioada, sursa): alb, cu inel fin, lat cat locul lui. */
export const BUTON_FILTRU = `inline-flex h-10 w-full items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] text-foreground ring-1 ring-black/10 transition hover:ring-black/25 lg:h-9 ${INEL}`;

/* ── Filtrul de perioada ──────────────────────────────────────────────────── */

const F_ZI_SCURTA = new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", day: "numeric", month: "short" });
const ziScurta = (zi: string) => F_ZI_SCURTA.format(new Date(`${zi}T12:00:00Z`));

/** Ziua aflata la `zile` distanta de `zi`; amandoua scrise „YYYY-MM-DD". */
function ziPlus(zi: string, zile: number): string {
  const [an, luna, ziua] = zi.split("-").map(Number);
  return new Date(Date.UTC(an, luna - 1, ziua + zile)).toISOString().slice(0, 10);
}

function numelePerioadei(deLa: string, panaLa: string): string {
  if (!deLa && !panaLa) return "Oricând";
  if (deLa && panaLa) return deLa === panaLa ? ziScurta(deLa) : `${ziScurta(deLa)} – ${ziScurta(panaLa)}`;
  return deLa ? `de la ${ziScurta(deLa)}` : `până la ${ziScurta(panaLa)}`;
}

export function FiltruPerioada({ nav, className }: { nav: Navigare; className?: string }) {
  const [deschis, setDeschis] = useState(false);
  const { deLa, panaLa } = nav.filtre;
  const alege = (de: string, pana: string) => {
    nav.mergiLa({ deLa: de, panaLa: pana, page: 1 });
    setDeschis(false);
  };
  /* Zilele sunt romanesti: „azi" e ziua de la ora Romaniei, nu cea a serverului. */
  const azi = ziuaDeAzi();
  const rapide: [string, string, string][] = [
    ["Azi", azi, azi],
    ["Ieri", ziPlus(azi, -1), ziPlus(azi, -1)],
    ["Ultimele 7 zile", ziPlus(azi, -6), azi],
    ["Ultimele 30 de zile", ziPlus(azi, -29), azi],
    ["Luna aceasta", `${azi.slice(0, 8)}01`, azi],
  ];
  return (
    <div className={className}>
      <Popover open={deschis} onOpenChange={setDeschis}>
        <PopoverTrigger className={BUTON_FILTRU}>
          {/* Pe telefon: fara pictograma, iar cu o perioada aleasa raman doar zilele, ca sa incapa intregi. */}
          <CalendarDays className="hidden h-4 w-4 flex-shrink-0 text-muted-foreground sm:block" />
          <span className={cn("text-muted-foreground", (deLa || panaLa) && "hidden sm:inline")}>Perioadă</span>
          <span className="truncate font-medium">{numelePerioadei(deLa, panaLa)}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-0 p-1.5">
          <div className="grid">
            {rapide.map(([nume, de, pana]) => (
              <button
                key={nume}
                type="button"
                onClick={() => alege(de, pana)}
                className={cn("flex items-center justify-between rounded-md px-2 py-2.5 text-left text-[13px] text-foreground hover:bg-muted lg:py-1.5", INEL)}
              >
                {nume}
                {deLa === de && panaLa === pana && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
          {/* Pe telefon cele doua zile stau una sub alta: la 16 px, o data intreaga nu incape in jumatate de meniu. */}
          <div className="mt-1.5 grid grid-cols-1 gap-2 border-t border-border px-2 pb-1.5 pt-2.5 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              De la
              <input
                type="date"
                value={deLa}
                max={panaLa || undefined}
                onChange={(e) => nav.mergiLa({ deLa: e.target.value, page: 1 })}
                className="mt-1 h-10 w-full rounded-md bg-white px-2 text-base text-foreground ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-ring md:h-8 md:px-1.5 md:text-xs"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Până la
              <input
                type="date"
                value={panaLa}
                min={deLa || undefined}
                onChange={(e) => nav.mergiLa({ panaLa: e.target.value, page: 1 })}
                className="mt-1 h-10 w-full rounded-md bg-white px-2 text-base text-foreground ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-ring md:h-8 md:px-1.5 md:text-xs"
              />
            </label>
          </div>
          {(deLa || panaLa) && (
            <button type="button" onClick={() => alege("", "")} className={cn("mx-2 mb-1 rounded-md py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground lg:py-1.5", INEL)}>
              Șterge perioada
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ── Randul de filtre si filele ───────────────────────────────────────────── */

/** Locul unui filtru in rand: pe telefon doua filtre impart randul in jumatati egale. */
export const LOC_FILTRU = "min-w-0 flex-1 basis-[40%] sm:flex-none sm:basis-auto";

/**
 * Un singur rand de filtre: cautarea, apoi filtrele listei (date ca fii), apoi perioada. Pe
 * telefon cautarea ia un rand intreg, iar filtrele il impart pe al doilea.
 */
export function RandFiltre({ nav, cuFiltre, laGolire, locCautare, children, className }: {
  nav: Navigare;
  /** E pus vreun filtru? Atunci apare „Șterge filtrele". */
  cuFiltre: boolean;
  laGolire: () => void;
  /** Ce scrie in campul de cautare gol, cand lista cauta in altceva decat comenzile. */
  locCautare?: string;
  /** Filtrele proprii listei, de pilda sursa comenzilor. Fiecare cu clasa `LOC_FILTRU`. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <CampCautare nav={nav} loc={locCautare} className="w-full sm:w-auto sm:min-w-[240px] sm:max-w-md sm:flex-1" />
      {/* Baza de 40%: filtrele umplu randul, iar „Șterge filtrele" coboara pe al lui, nu le inghesuie. */}
      {children}
      <FiltruPerioada nav={nav} className={LOC_FILTRU} />
      {cuFiltre && (
        <button
          type="button"
          onClick={laGolire}
          className={cn("inline-flex h-10 items-center gap-1 rounded-lg px-2 text-[13px] text-muted-foreground hover:text-foreground lg:h-9", INEL)}
        >
          <X className="h-3.5 w-3.5" /> Șterge filtrele
        </button>
      )}
    </div>
  );
}

/**
 * File subliniate: cuvant si numar, fara pastile. Starile in „Registru", etapele in „Flux"
 * pe telefon.
 *
 * ⚠ Linia de sub file e un element separat, nu marginea celui care deruleaza: cu marginea pe
 * el si cu fila activa coborata un pixel peste ea, randul capata o bara de derulare VERTICALA
 * de un pixel (vazuta in dreapta filelor, pe Windows).
 */
export function FileSubliniate({ file, activa, laAlegere, eticheta, className }: {
  file: { cheie: string; eticheta: string; numar: number; ton?: TonEticheta }[];
  activa: string;
  laAlegere: (cheie: string) => void;
  /** Numele accesibil al randului de file. */
  eticheta: string;
  className?: string;
}) {
  /*
    Pe telefon filele se deruleaza in lateral. Fila aleasa se aduce la vedere, altfel dupa
    „Rambursate" randul ar arata primele trei file si niciuna subliniata. Se misca doar randul
    de file (`scrollTo` pe el), nu pagina.
  */
  const rand = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rand.current;
    const aleasa = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (el && aleasa) el.scrollTo({ left: aleasa.offsetLeft - (el.clientWidth - aleasa.offsetWidth) / 2 });
  }, [activa]);

  return (
    <div className={cn("relative", className)}>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-border" />
      <div
        ref={rand}
        /*
          Sunt filtre, nu file cu panouri: fiecare duce la aceeasi lista, altfel filtrata. De aceea
          `group` + `aria-current`, nu `tablist` + `tab` (care promit un panou si mers cu sagetile).
        */
        role="group"
        aria-label={eticheta}
        className="relative flex gap-6 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {file.map((f) => {
          const eActiva = f.cheie === activa;
          return (
            <button
              key={f.cheie}
              type="button"
              aria-current={eActiva ? "true" : undefined}
              onClick={() => laAlegere(f.cheie)}
              className={cn(
                /*
                  Sub `lg` fila are 44 px inaltime, cat cere degetul, si cel putin 40 latime (o fila
                  scurta ca „Noi 3" avea 36). Inelul e pe dinauntru: randul care deruleaza l-ar taia pe cel de afara.
                  ⚠ `shrink-0` e pereche cu latimea minima: o latime minima scrisa de mana o inlocuieste
                  pe cea implicita (cat continutul), iar fara `shrink-0` filele s-ar strange TOATE la
                  40 px, cu textele unele peste altele (masurat).
                */
                "flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-t-sm border-b-2 pb-2.5 text-sm transition-colors max-lg:min-w-10 max-lg:justify-center max-lg:pt-3.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                eActiva ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {f.ton && <PunctStare ton={f.ton} className="self-center" />}
              {f.eticheta}
              {/* Numarul in gri plin: la 80% iesea sub contrastul de citit (3,3 la 1). */}
              <span className={cn("text-xs tabular-nums", eActiva ? "text-foreground/70" : "text-muted-foreground")}>
                {f.numar.toLocaleString("ro-RO")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Comutatorul in segmente al grupelor de lucru (De lucru, Pe drum, Încheiate, Toate), cu
 * numarul fiecareia. Patru grupe, nu opt pastile.
 *
 * Numele sta sus si numarul dedesubt acolo unde locul e ingust (pe telefon, sau mereu in
 * coloana de 320 px a listei din „Două panouri"): pe un rand nu incap patru, iar rupte la
 * intamplare arata stricat.
 */
export function SegmenteGrupe({ grupe, grupa, laAlegere, eticheta = "Grupe de comenzi", mereuStivuit = false, className }: {
  /** Grupele, cu numarul fiecareia. Comenzile au patru, retururile trei. */
  grupe: { cheie: string; eticheta: string; numar: number }[];
  grupa: string;
  laAlegere: (grupa: string) => void;
  /** Numele accesibil al comutatorului. */
  eticheta?: string;
  mereuStivuit?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={eticheta}
      className={cn("grid rounded-lg bg-muted/70 p-0.5", !mereuStivuit && "sm:inline-flex", className)}
      style={{ gridTemplateColumns: `repeat(${grupe.length}, minmax(0, 1fr))` }}
    >
      {grupe.map((g) => {
        const aleasa = g.cheie === grupa;
        return (
          <button
            key={g.cheie}
            type="button"
            aria-current={aleasa ? "true" : undefined}
            onClick={() => laAlegere(g.cheie)}
            className={cn(
              /* Sub `lg` segmentul are 44 px inaltime, cat cere degetul. */
              "rounded-md px-1 py-1.5 text-center text-xs leading-tight transition max-lg:py-2",
              INEL,
              !mereuStivuit && "sm:px-3.5 sm:text-[13px]",
              aleasa ? "bg-white font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("block whitespace-nowrap", !mereuStivuit && "sm:inline")}>{g.eticheta}</span>
            <span className={cn(
              "mt-0.5 block text-[11px] font-normal tabular-nums",
              aleasa ? "text-foreground/70" : "text-muted-foreground",
              !mereuStivuit && "sm:ml-1.5 sm:mt-0 sm:inline sm:text-[13px]",
            )}>
              {g.numar.toLocaleString("ro-RO")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Paginarea ────────────────────────────────────────────────────────────── */

const NUME_COMENZI = ["comandă", "comenzi"] as const;

/**
 * Cate comenzi sunt si pe ce pagina esti, intr-un singur loc: sub lista. Aici stau la orice
 * tabel de lucru, si tot aici le cauta ochiul. (Textul „60 de comenzi pe pagină" plutea
 * singur sub filtre; proprietarul, 24.11.2026: „gaseste alta amplasare mai profi".)
 *
 * Fara nicio comanda nu se arata nimic: o paginare sub o lista goala n-are ce pagina.
 */
export function Paginare({ pagina, total, laPagina, pePagina = ORDERS_PAGE_SIZE, ce = NUME_COMENZI, ingusta = false, className }: {
  pagina: number;
  total: number;
  laPagina: (pagina: number) => void;
  pePagina?: number;
  /** Ce se numara, la singular si la plural: „comandă", „comenzi". */
  ce?: readonly [string, string];
  /** Intr-o coloana ingusta: doar sagetile, cu numaratoarea intre ele. */
  ingusta?: boolean;
  className?: string;
}) {
  if (total === 0) return null;
  const pagini = Math.max(1, Math.ceil(total / pePagina));
  const curenta = Math.min(pagina, pagini);
  const prima = (curenta - 1) * pePagina + 1;
  const ultima = Math.min(curenta * pePagina, total);
  const numarul = pluralRo(total, ce[0], ce[1]);

  if (ingusta) {
    const sageataMica = `grid h-10 w-10 flex-shrink-0 place-items-center rounded-md text-foreground ring-1 ring-black/10 transition hover:ring-black/25 disabled:cursor-not-allowed disabled:opacity-40 lg:h-7 lg:w-7 ${INEL}`;
    return (
      <div className={cn("flex items-center justify-between gap-2 text-xs text-muted-foreground", className)}>
        {pagini > 1 && (
          <button type="button" onClick={() => laPagina(curenta - 1)} disabled={curenta === 1} aria-label="Pagina dinainte" className={sageataMica}>
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <p className="flex-1 text-center tabular-nums">{pagini > 1 ? `${prima}–${ultima} din ${numarul}` : numarul}</p>
        {pagini > 1 && (
          <button type="button" onClick={() => laPagina(curenta + 1)} disabled={curenta === pagini} aria-label="Pagina următoare" className={sageataMica}>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  /* 1 … 4 5 6 … 12: capetele si vecinii paginii curente. */
  const aratate: (number | "…")[] = [];
  for (let p = 1; p <= pagini; p++) {
    if (p !== 1 && p !== pagini && Math.abs(p - curenta) > 1) continue;
    const dinainte = aratate[aratate.length - 1];
    if (typeof dinainte === "number" && p - dinainte > 1) aratate.push("…");
    aratate.push(p);
  }

  const sageata = `grid h-10 w-10 place-items-center rounded-lg bg-white text-foreground ring-1 ring-black/10 transition hover:ring-black/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-black/10 lg:h-8 lg:w-8 ${INEL}`;
  return (
    <div className={cn("flex flex-col items-center gap-3 text-xs text-muted-foreground sm:flex-row sm:justify-between", className)}>
      <p className="tabular-nums">{pagini > 1 ? `${prima}–${ultima} din ${numarul}` : numarul}</p>
      {pagini > 1 && (
        <nav aria-label="Paginile listei" className="flex items-center gap-1">
          <button type="button" onClick={() => laPagina(curenta - 1)} disabled={curenta === 1} aria-label="Pagina dinainte" className={sageata}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          {aratate.map((p, i) => p === "…" ? (
            <span key={`rupere-${i}`} className="px-1">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => laPagina(p)}
              aria-current={p === curenta ? "page" : undefined}
              className={cn(
                "grid h-10 min-w-10 place-items-center rounded-lg px-2 font-medium tabular-nums transition lg:h-8 lg:min-w-8",
                INEL,
                p === curenta ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
              )}
            >
              {p}
            </button>
          ))}
          <button type="button" onClick={() => laPagina(curenta + 1)} disabled={curenta === pagini} aria-label="Pagina următoare" className={sageata}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

/* ── Lista goala ──────────────────────────────────────────────────────────── */

export function StareGoala({ titlu, lamurire, laStergere, className }: {
  titlu: string;
  lamurire?: string;
  /** Cand lista e goala din cauza filtrelor: butonul care le scoate. */
  laStergere?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center rounded-xl bg-white px-6 py-14 text-center ring-1 ring-black/10", className)}>
      <SearchX className="h-7 w-7 text-muted-foreground/70" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-foreground">{titlu}</p>
      {lamurire && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{lamurire}</p>}
      {laStergere && (
        <button type="button" onClick={laStergere} className={cn("mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 lg:h-9", INEL)}>
          <X className="h-3.5 w-3.5" /> Șterge filtrele
        </button>
      )}
    </div>
  );
}

/* ── Meniul care se monteaza la cerere ────────────────────────────────────── */

/**
 * Un meniu care se monteaza abia la prima apasare; pana atunci e un buton simplu, la fel la
 * infatisare. O pagina de 50 de comenzi are peste o suta de meniuri („alt curier", „⋯"), iar
 * omul deschide unul sau doua. Montate toate de la inceput, fiecare isi aducea starea si
 * ascultatorii lui la incarcarea paginii.
 */
export function MeniuLaCerere({ eticheta, clasaButon, buton, aliniere = "start", clasaMeniu, children }: {
  /** Numele accesibil al butonului. */
  eticheta: string;
  clasaButon: string;
  /** Ce se vede pe buton. */
  buton: React.ReactNode;
  aliniere?: "start" | "end";
  clasaMeniu?: string;
  children: React.ReactNode;
}) {
  const [montat, setMontat] = useState(false);
  if (!montat) {
    return (
      <button type="button" aria-label={eticheta} aria-haspopup="menu" aria-expanded={false} onClick={() => setMontat(true)} className={clasaButon}>
        {buton}
      </button>
    );
  }
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger aria-label={eticheta} className={clasaButon}>{buton}</DropdownMenuTrigger>
      <DropdownMenuContent align={aliniere} className={clasaMeniu}>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
