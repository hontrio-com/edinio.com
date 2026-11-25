/*
  Atomii limbajului nou al panoului (24–25.11.2026): stari fara pastile (punct si cuvant),
  butonul alb doar cu sigla partenerului, inelul de focalizare si tinta de atins. Au pornit in
  prototipul paginii de Comenzi; pagina unei comenzi e prima pagina adevarata care ii foloseste.

  ⚠ Fara „use client": nimic de aici nu tine stare. `ButonSigla` primeste `onClick`, deci cine il
  foloseste e oricum o componenta de client.
*/

import { cn } from "@/lib/utils/cn";
import type { TonEticheta } from "@/components/ui/eticheta-stare";
import type { Sigla } from "@/lib/integrari/sigle";

/* ── Doua reguli pentru tot ce se apasa ───────────────────────────────────── */

/** Inelul de focalizare, acelasi peste tot: se vede doar la mersul cu tastatura. */
export const INEL = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Tinta de atins. Sub `lg` (telefon si tableta, unde se lucreaza cu degetul) un buton inalt de
 * 32 px e greu de nimerit: minimul pentru deget e 44. Butonul ramane cum arata, iar un strat
 * nevazut ii mareste locul de atins cu 6 px de jur imprejur. Pe ecran lat, cu mausul, nu exista.
 */
export const ATINGERE = "relative max-lg:after:absolute max-lg:after:-inset-1.5 max-lg:after:content-['']";

/* ── Clasele paginilor noi: suprafete albe cu contur fin, fara fonduri colorate ── */

/*
  Au pornit in pagina unei comenzi (`OrderDetailClient`) si au fost mutate aici pe 25.11.2026, cand
  panourile din interiorul ei (eMAG, Trendyol, easySales, tbi, SAGA, returul de primit, operatiile
  atarnate, filele caselor cu cheie) au trecut pe aceeasi infatisare. Tinute in doua locuri, pagina
  si panourile ei ar fi ajuns sa nu mai arate la fel la prima ajustare facuta doar intr-unul.
*/
export const SECTIUNE = "rounded-xl bg-surface ring-1 ring-black/10";
export const TITLU = "text-sm font-semibold text-foreground";
export const ETICHETA = "text-xs font-medium text-muted-foreground";
/* Sub `lg` butoanele au 40 px inaltime, cat cere degetul. */
export const BUTON = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 max-lg:h-10";
export const BUTON_CONTUR = `${BUTON} bg-surface text-foreground ring-1 ring-black/10 hover:ring-black/25 ${INEL}`;
export const BUTON_PLIN = `${BUTON} bg-foreground text-background hover:bg-foreground/85 ${INEL}`;
export const BUTON_PERICOL = `${BUTON} bg-surface text-destructive ring-1 ring-destructive/30 hover:ring-destructive/60 ${INEL}`;
export const BUTON_PERICOL_PLIN = `${BUTON} bg-destructive text-white hover:bg-destructive/90 ${INEL}`;
export const BUTON_MIC = `inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-surface px-2.5 text-xs font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 disabled:opacity-50 max-lg:h-10 ${INEL}`;
export const LEGATURA = "rounded-sm text-foreground underline-offset-2 hover:underline";
/* O atentionare: cutie alba cu contur, iar culoarea o poarta doar pictograma. */
export const NOTA = "flex items-start gap-2.5 rounded-lg bg-surface p-3 text-xs leading-relaxed text-foreground ring-1 ring-black/10";
export const NOTA_PERICOL = "flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 ring-1 ring-destructive/30";

/* ── Starea, fara pastila ─────────────────────────────────────────────────── */

const CULOARE_TON: Record<TonEticheta, string> = {
  asteptare: "bg-warning",
  info: "bg-info",
  lucru: "bg-purple-500",
  drum: "bg-indigo-500",
  bun: "bg-success",
  rau: "bg-destructive",
  neutru: "bg-muted-foreground/50",
};

/** Punctul colorat de langa numele unei stari: starea se citeste, nu sta intr-o pastila. */
export function PunctStare({ ton, className }: { ton: TonEticheta; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2 w-2 flex-shrink-0 rounded-full", CULOARE_TON[ton], className)} />;
}

/* ── Butonul alb cu sigla ─────────────────────────────────────────────────── */

/*
  Cutia e mereu aceeasi, ca butoanele sa stea aliniate; sigla isi ia inaltimea intreaga a
  locasului. Siglele patrate (Sameday, UPS, SmartBill) ies mai inguste decat cele late (DPD,
  GLS, FedEx), dar la fel de inalte, deci la fel de usor de recunoscut.

  Locasul lasa patru pixeli sus si jos: mai mic de atat, siglele patrate (cele cu semnul
  deasupra numelui) ajungeau la 20 px si numele din ele nu se mai citea.
*/
const MARIMI_SIGLA = {
  mic: { cutie: "h-8 w-[68px] rounded-lg", sigla: "h-[24px] w-[54px]" },
  mediu: { cutie: "h-9 w-[86px] rounded-lg", sigla: "h-[28px] w-[68px]" },
  mare: { cutie: "h-12 w-[140px] rounded-xl", sigla: "h-[38px] w-[112px]" },
  /* Mic pe telefon, mediu de la `sm`: acolo unde trei butoane trebuie sa incapa pe un rand de 280 px. */
  adaptiv: { cutie: "h-8 w-[68px] rounded-lg sm:h-9 sm:w-[86px]", sigla: "h-[24px] w-[54px] sm:h-[28px] sm:w-[68px]" },
} as const;

export type MarimeSigla = keyof typeof MARIMI_SIGLA;

/**
 * Butonul cerut de proprietar in locul lui „Creeaza AWB”: alb, cu colturi rotunde, doar cu
 * sigla curierului (sau a casei de facturare). Ce face spune numele accesibil si indiciul de la
 * trecerea cu mausul, nu un text pe buton.
 *
 * @param eticheta Ce face butonul, cu tot cu numele partenerului: „Creează AWB FAN Courier”.
 * @param refuz De ce nu se poate apasa acum. Butonul ramane la vedere, stins, cu motivul la
 *   indemana; apasarea ajunge tot la `onClick`, care hotaraste ce spune.
 */
export function ButonSigla({
  sigla, eticheta, onClick, marime = "mediu", refuz, className,
}: {
  sigla: Sigla;
  eticheta: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  marime?: MarimeSigla;
  refuz?: string | null;
  className?: string;
}) {
  const m = MARIMI_SIGLA[marime];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={eticheta}
      aria-disabled={!!refuz}
      title={refuz ?? eticheta}
      className={cn(
        "inline-grid flex-shrink-0 place-items-center bg-white ring-1 ring-black/10 transition",
        "shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        INEL,
        ATINGERE,
        refuz
          ? "cursor-not-allowed opacity-45 grayscale"
          : "hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] hover:ring-black/25 active:translate-y-px",
        m.cutie,
        className,
      )}
    >
      {/*
        Locas cu marime FIXA, iar sigla se asaza in el (`object-contain`). Cu `width: auto` si
        doar limite maxime, un SVG fara dimensiuni proprii isi anunta alta latime decat cea
        desenata, iar ce sta langa el intra peste el (vazut la sigla Google Ads).
      */}
      <span className={cn("block max-w-full", m.sigla)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sigla.logo}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          style={sigla.inversat ? { filter: "invert(1)" } : undefined}
        />
      </span>
    </button>
  );
}

/**
 * Sigla intr-un locas fix, NEbuton: langa un numar de AWB sau de factura, ca sa se vada al cui
 * e documentul. Aceleasi marimi de locas ca la buton, fara chenar.
 */
export function SiglaInLocas({ sigla, marime = "mediu", className }: { sigla: Sigla; marime?: MarimeSigla; className?: string }) {
  return (
    <span className={cn("block flex-shrink-0", MARIMI_SIGLA[marime].sigla, className)} title={sigla.nume}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sigla.logo}
        alt={sigla.nume}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain object-left"
        style={sigla.inversat ? { filter: "invert(1)" } : undefined}
      />
    </span>
  );
}
