import { Banknote, Store, Truck } from "lucide-react";
import { BlockShell } from "../BlockShell";
import type { CouriersBlock, PaymentsBlock } from "@/lib/pages/blocks.types";
import type { MetodaAfisata } from "@/lib/pages/integrari-pagini";

/*
  Blocurile „Metode de plata” si „Curierii nostri”: arata ce e ACTIV in
  magazin, luat din setari la fiecare randare (vezi `integrariPentruPagini`).
  Un procesator stins sau un curier oprit dispare singur din bloc, fara ca
  omul sa-si aminteasca sa modifice pagina.
*/

const REZERVA: Record<string, React.ElementType> = { cash_on_delivery: Banknote, own: Truck, pickup: Store };

function Lista({ metode, layout, gri }: { metode: MetodaAfisata[]; layout?: "logos" | "cards"; gri?: boolean }) {
  const carduri = layout === "cards";
  return (
    <ul className={`flex flex-wrap items-center gap-3 ${carduri ? "" : "pg-sm:gap-4"} [.text-center_&]:justify-center [.text-right_&]:justify-end`}>
      {metode.map((m) => {
        const Icon = REZERVA[m.cheie] ?? Truck;
        return (
          <li key={m.cheie} title={m.nume}
            /* Placi de aceeasi marime (26.09.2026): siglele au latimi foarte diferite, iar
               pe telefon, rupte pe randuri la intamplare, blocul arata dezordonat. Siglele:
               cate doua pe rand pe telefon, latime fixa de la `sm`. Cardurile: unul sub altul
               pe telefon, pe toata latimea. */
            className={`flex items-center gap-2.5 ${carduri
              ? "w-full rounded-xl border border-border bg-surface px-4 py-3 text-left pg-sm:w-auto"
              : "h-14 w-[calc(50%-0.375rem)] justify-center rounded-xl bg-white px-3 ring-1 ring-black/5 pg-sm:w-40"} ${gri ? "grayscale transition hover:grayscale-0" : ""}`}>
            {/* In carduri, sigla sta intr-un loc de latime fixa: numele incep toate din acelasi punct. */}
            <span className={`flex shrink-0 items-center ${carduri ? "w-[84px]" : ""}`}>
              {m.logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.logo} alt={carduri || m.arataNumele ? "" : m.nume} loading="lazy" className={`h-7 w-auto object-contain ${carduri ? "max-w-full" : "max-w-[100px]"} ${m.alba ? "brightness-0" : ""}`} />
                : <Icon className="h-5 w-5 text-foreground/70" aria-hidden />}
            </span>
            {(carduri || !m.logo || m.arataNumele) && <span className="min-w-0 text-sm font-medium leading-tight text-foreground">{m.nume}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function PaymentsBlockView({ block, metode }: { block: PaymentsBlock; metode: MetodaAfisata[] }) {
  if (metode.length === 0) return null;
  return (
    <BlockShell style={{ align: "center", ...block.style }}>
      {block.title && <p className="mb-4 text-sm font-semibold text-foreground">{block.title}</p>}
      <Lista metode={metode} layout={block.layout} gri={block.grayscale} />
    </BlockShell>
  );
}

export function CouriersBlockView({ block, curieri }: { block: CouriersBlock; curieri: MetodaAfisata[] }) {
  if (curieri.length === 0) return null;
  return (
    <BlockShell style={{ align: "center", ...block.style }}>
      {block.title && <p className="mb-1 text-sm font-semibold text-foreground">{block.title}</p>}
      {block.subtitle && <p className="mb-4 text-sm text-muted-foreground">{block.subtitle}</p>}
      {!block.subtitle && block.title && <div className="mb-3" />}
      <Lista metode={curieri} layout={block.layout} gri={block.grayscale} />
    </BlockShell>
  );
}
