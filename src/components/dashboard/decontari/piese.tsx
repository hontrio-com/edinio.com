"use client";

/*
  Piesele paginii de Decontări: zilele scrise ca pe extrasul de banca, sigla curierului, totalul
  filtrului si randul unui colet decontat.

  Limbajul e cel al Comenzilor si al Retururilor: file subliniate, un rand de filtre, sigla
  curierului in loc de numele lui scris, sume aliniate la dreapta cu cifre de aceeasi latime.
  Pagina nu are nimic de apasat care sa scrie in baza: e un registru de citit si de potrivit cu
  extrasul de banca.
*/

import Link from "next/link";
import { ArrowUpRight, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { ATINGERE, INEL } from "@/components/dashboard/atomi-panou";
import { suma } from "@/components/dashboard/liste/piese";
import { curierDecont, type Colet, type Rezumat } from "./date";

export const NUME_COLETE = ["colet", "colete"] as const;

/* ── Zile ─────────────────────────────────────────────────────────────────── */

/*
  ⚠ O ZI CALENDARISTICA NU E UN MOMENT. Ziua virarii e scrisa „2026-09-16" si trebuie sa ramana
  16 pe orice ceas: se citeste la amiaza UTC si se scrie tot in UTC, deci niciun fus n-o muta cu
  o zi fata de extrasul de banca, exact acolo unde omul compara cifra cu cifra.
*/
const UTC = { timeZone: "UTC" } as const;
const F_ZI = new Intl.DateTimeFormat("ro-RO", { ...UTC, day: "numeric", month: "short", year: "numeric" });
const F_ZI_FARA_AN = new Intl.DateTimeFormat("ro-RO", { ...UTC, day: "numeric", month: "short" });
const F_ZI_INTREAGA = new Intl.DateTimeFormat("ro-RO", { ...UTC, day: "numeric", month: "long", year: "numeric" });

function scrie(zi: string | null, f: Intl.DateTimeFormat): string {
  if (!zi) return "";
  const d = new Date(`${zi}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? zi : f.format(d);
}
/** „16 sept. 2026”. */
export const ziScurta = (zi: string | null) => scrie(zi, F_ZI);
/** „16 sept.”. */
export const ziFaraAn = (zi: string | null) => scrie(zi, F_ZI_FARA_AN);
/** „16 septembrie 2026”. */
export const ziIntreaga = (zi: string | null) => scrie(zi, F_ZI_INTREAGA);

/* ── Curierul ─────────────────────────────────────────────────────────────── */

/**
 * Sigla curierului intr-un locas de marime FIXA, lipita de stanga lui: asa stau aliniate in
 * coloana si siglele late, si cele patrate. Un curier fara sigla isi arata numele.
 */
function SiglaCurier({ curier }: { curier: string }) {
  const { nume, sigla } = curierDecont(curier);
  if (!sigla) return <span className="truncate text-muted-foreground">{nume}</span>;
  return (
    /*
      24 px inaltime: la 18, siglele patrate (cele cu semnul deasupra numelui) nu se mai citeau.
      Locasul e mai ingust intr-o lista stramta (telefon): acolo fiecare pixel e al AWB-ului.
    */
    <span className="block h-6 w-[46px] flex-shrink-0 @[24rem]:w-[58px]" title={nume}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sigla.logo}
        alt={nume}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain object-left"
        style={sigla.inversat ? { filter: "invert(1)" } : undefined}
      />
    </span>
  );
}

/* ── Totalul filtrului ────────────────────────────────────────────────────── */

/**
 * Cati bani inseamna filtrul ales, in cate colete si in cate virari. Sta in CAPUL listei, in
 * aceeasi cutie cu ea: suma lui e aliniata cu sumele randurilor de dedesubt, pe orice ecran.
 *
 * (Pana pe 25.11.2026 totalul plutea sub butoanele de perioada; pe telefon nu se lega de nimic.
 * Proprietarul: „pe mobil arata cam prost asezat suma asta".)
 */
export function TotalFiltru({ rezumat }: { rezumat: Rezumat }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/40 px-4 py-3">
      <p className="min-w-0 @[56rem]:flex @[56rem]:items-baseline @[56rem]:gap-3">
        <span className="block font-medium text-foreground">Total virat</span>
        <span className="block text-xs text-muted-foreground">
          {pluralRo(rezumat.colete, "colet", "colete")} în {pluralRo(rezumat.virari, "virare", "virări")}
        </span>
      </p>
      <p className="flex-shrink-0 whitespace-nowrap text-base font-semibold tracking-tight tabular-nums text-foreground">{suma(rezumat.suma)}</p>
    </div>
  );
}

/* ── Un colet decontat ────────────────────────────────────────────────────── */

/*
  Coloanele unui colet pe loc lat. ⚠ Doar latimi fixe si fractii, nicio pista „auto": fiecare
  rand e o grila a lui, iar pistele dupa continut ar iesi altfel de la un rand la altul.
  ⚠ Pragul e la 56rem: mai jos, AWB-ul ramanea cu 14 px langa sigla si se vedea doar „…".
*/
const LAT = "hidden @[56rem]:grid @[56rem]:grid-cols-[112px_minmax(190px,1.2fr)_minmax(120px,1.5fr)_88px_124px_116px]";
const INGUST = "@[56rem]:hidden";

/** Capul coloanelor, doar pe loc lat. Pe loc ingust fiecare rand isi spune singur campurile. */
export function CapColete() {
  return (
    <div aria-hidden="true" className={cn("gap-x-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", LAT)}>
      <span>Virat pe</span>
      <span>AWB</span>
      <span>Destinatar</span>
      <span>Încasat pe</span>
      <span>Comandă</span>
      <span className="text-right">Sumă</span>
    </div>
  );
}

/** Legatura spre comanda coletului. Un AWB emis din afara platformei n-are comanda, si se spune. */
function LegaturaComanda({ colet: c }: { colet: Colet }) {
  if (!c.comanda) {
    return <span className="text-muted-foreground" title="AWB emis din afara platformei: nu are comandă în Edinio.">În afara Edinio</span>;
  }
  return (
    <Link
      href={`/dashboard/orders/${c.comanda.id}`}
      prefetch={false}
      /* Marginea negativa tine randul la inaltimea textului; tinta de atins ramane de 44 px sub `lg`. */
      className={cn("-my-1.5 inline-flex items-center gap-1 rounded-sm py-1.5 font-medium tabular-nums text-foreground underline-offset-2 hover:underline", INEL, ATINGERE)}
    >
      {c.comanda.numar ?? "Comanda"} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function AwbRetur({ colet: c }: { colet: Colet }) {
  if (!c.awbRetur) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
      <Undo2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" /> retur <span className="font-mono">{c.awbRetur}</span>
    </span>
  );
}

/**
 * Un colet decontat. Pe loc lat e un rand cu coloane; pe loc ingust, trei randuri scurte:
 * sigla, AWB-ul si suma; cine l-a primit si din ce comanda vine; cand s-au miscat banii.
 */
export function RandColet({ colet: c }: { colet: Colet }) {
  const destinatar = [c.destinatar, c.localitate].filter(Boolean).join(", ");
  return (
    <li className="px-4 py-3">
      {/* Loc lat: coloane. */}
      <div className={cn("items-start gap-x-4", LAT)}>
        <span className="whitespace-nowrap tabular-nums text-foreground">{ziScurta(c.viratPe)}</span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2.5">
            <SiglaCurier curier={c.curier} />
            <span className="truncate font-mono text-[13px] font-medium text-foreground" title={c.awb}>{c.awb}</span>
          </span>
          <AwbRetur colet={c} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-foreground" title={c.destinatar ?? undefined}>{c.destinatar ?? "Fără nume"}</span>
          {c.localitate && <span className="block truncate text-xs text-muted-foreground">{c.localitate}</span>}
        </span>
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">{c.incasatPe ? ziFaraAn(c.incasatPe) : ""}</span>
        <span className="min-w-0 truncate"><LegaturaComanda colet={c} /></span>
        <span className="whitespace-nowrap text-right font-semibold tabular-nums text-foreground">{suma(c.suma)}</span>
      </div>

      {/* Loc ingust: trei randuri scurte. */}
      <div className={INGUST}>
        {/*
          ⚠ AWB-ul nu se taie cu „…": e chiar ce cauta omul. Pe un ecran de 320 px, un AWB de 13
          cifre si o suma de patru cifre nu incap pe un rand; atunci suma coboara pe al ei, la dreapta.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <span className="flex min-w-0 max-w-full items-center gap-2.5">
            <SiglaCurier curier={c.curier} />
            <span className="truncate font-mono text-[13px] font-medium text-foreground">{c.awb}</span>
          </span>
          <span className="ml-auto flex-shrink-0 whitespace-nowrap font-semibold tabular-nums text-foreground">{suma(c.suma)}</span>
        </div>
        <AwbRetur colet={c} />
        {/* Cine l-a primit, iar in dreapta din ce comanda vine: legatura sta sub suma, nu pierduta intr-un rand de date. */}
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-foreground">{destinatar || "Fără nume"}</p>
          <span className="flex-shrink-0 text-xs"><LegaturaComanda colet={c} /></span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          virat {ziScurta(c.viratPe)}
          {c.incasatPe && <><span aria-hidden="true"> · </span>încasat {ziFaraAn(c.incasatPe)}</>}
        </p>
      </div>
    </li>
  );
}
