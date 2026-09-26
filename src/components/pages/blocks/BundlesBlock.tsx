import { Flame, Package, Plus, Sparkles } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { AddToCartButton } from "./AddToCartButton";
import { LegaturaProdus } from "./LegaturaProdus";
import { Numaratoare } from "./Numaratoare";
import { formatPrice } from "@/lib/utils/format";
import { cuTransparenta } from "@/lib/pages/culori";
import type { BundlesBlock } from "@/lib/pages/blocks.types";
import type { PachetPagina } from "@/lib/pages/resolve-bundles";

/*
  ═══════════════════════════════════════════════════════════════════════════
  BLOCUL DE PACHETE                                                (25-26.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Fiecare pachet: ce contine, pretul, pretul separat taiat, cat economisesti,
  descrierea scurta si, daca omul vrea, elemente FOMO. Butonul de cos pune in
  cos PACHETUL (o singura linie); comanda il desface in componente.

  ⚠ FOMO NUMAI DIN DATE REALE: stocul ramas (din componente), vanzarile din
  ultimele 7 zile (din comenzi), o data de sfarsit aleasa de om, o eticheta
  scrisa de el. Nimic generat („12 oameni se uita acum”): ar fi o practica
  comerciala inselatoare, si ANPC o sanctioneaza.

  ⚠ „Cate unul pe rand” (26.09.2026, dupa captura lui): produsele din pachet
  stateau ca pastile de latimi diferite, rupte pe randuri la intamplare. Acum
  sunt o grila de placi egale, iar pretul si butonul au randul lor, jos.
*/
export function BundlesBlockView({ block, pachete, color, basePath, storeSlug }: {
  block: BundlesBlock; pachete: PachetPagina[]; color: string; basePath: string; storeSlug: string;
}) {
  if (pachete.length === 0) return null;
  const accent = block.accent || color;
  const lat = block.layout === "wide";
  const grila = lat ? "grid-cols-1" : block.columns === 2 ? "grid-cols-1 pg-sm:grid-cols-2" : "grid-cols-1 pg-sm:grid-cols-2 pg-lg:grid-cols-3";
  const cuCos = block.showAddToCart !== false && !!storeSlug;
  const evidentiate = new Set(block.evidentiate ?? []);
  const prag = Math.max(1, block.lowStockThreshold ?? 5);
  const minVanzari = Math.max(1, block.recentSalesMin ?? 3);

  return (
    <BlockShell style={block.style}>
      {(block.title || block.subtitle) && (
        <div className="mb-8 text-center">
          {block.title && <h2 className="pg-titlu text-2xl pg-sm:text-3xl font-black tracking-tight text-foreground">{block.title}</h2>}
          {block.subtitle && <p className="mt-2 text-muted-foreground">{block.subtitle}</p>}
        </div>
      )}
      {block.countdownEnd && (
        <div className="flex justify-center">
          <Numaratoare sfarsit={block.countdownEnd} text={block.countdownText} culoare={accent}
            className="mb-6 rounded-full px-4 py-2" style={{ backgroundColor: cuTransparenta(accent, 0.08) }} />
        </div>
      )}
      <div className={`grid ${grila} gap-5 text-left`}>
        {pachete.map((p) => {
          const procent = p.compare > 0 && p.economie > 0 ? Math.round((p.economie / p.compare) * 100) : 0;
          const descriere = block.showDescription ? (block.descrieri?.[p.id]?.trim() || p.descriere) : null;
          const putine = block.showLowStock && p.disponibil && p.ramase !== null && p.ramase > 0 && p.ramase <= prag;
          const vandute = block.showRecentSales && p.vanzari7 !== null && p.vanzari7 >= minVanzari;
          const scos = evidentiate.has(p.id);

          const etichete = (
            <div className="flex flex-wrap gap-1.5">
              {scos && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: accent }}>
                  <Sparkles className="h-3 w-3" /> {block.evidentiatText || "Cel mai popular"}
                </span>
              )}
              {block.badgeText && (
                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: block.badgeColor || "#111" }}>{block.badgeText}</span>
              )}
              {block.showSavings !== false && procent > 0 && (
                <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm">−{procent}%</span>
              )}
            </div>
          );

          const fomo = (putine || vandute) && (
            <div className="space-y-1.5 text-sm">
              {putine && (
                <p className="flex items-center gap-2 font-semibold text-red-600">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" /></span>
                  {p.ramase === 1 ? "Doar 1 pachet rămas" : `Doar ${p.ramase} pachete rămase`}
                </p>
              )}
              {vandute && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Flame className="h-4 w-4 text-orange-500" aria-hidden />
                  Cumpărat de {p.vanzari7} ori în ultimele 7 zile
                </p>
              )}
            </div>
          );

          const pret = (
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-black tracking-tight" style={{ color: accent }}>{formatPrice(p.price)}</span>
                {p.compare > p.price && <span className="text-sm text-muted-foreground line-through">{formatPrice(p.compare)}</span>}
              </div>
              {block.showSavings !== false && p.economie > 0 && (
                <p className="text-xs font-semibold" style={{ color: accent }}>Economisești {formatPrice(p.economie)}</p>
              )}
            </div>
          );

          const cos = !p.disponibil ? (
            <p className="rounded-lg bg-muted px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Indisponibil momentan</p>
          ) : cuCos ? (
            <AddToCartButton
              product={{ id: p.id, name: p.name, slug: p.slug, price: p.price, compareAtPrice: p.compare > p.price ? p.compare : null, image: p.image, images: p.images, pageSections: p.page_sections, priceRange: p.price_range }}
              storeSlug={storeSlug} basePath={basePath} color={accent} />
          ) : null;

          /*
            ⚠ La „cate unul pe rand”, imaginea umple coloana ei ASEZATA ABSOLUT: o
            inaltime in procente sub un parinte cu doar `min-height` nu se poate
            calcula, iar imaginea ramanea de 0 px (vazut pe ecran, 26.09).
          */
          const imagine = (
            <LegaturaProdus basePath={basePath} slugSauId={p.slug ?? p.id}
              className={`block overflow-hidden bg-muted/40 ${lat ? "absolute inset-0" : "relative"}`}>
              {p.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${lat ? "h-full" : "aspect-[4/3]"}`} />
                : <div className={`flex w-full items-center justify-center ${lat ? "h-full" : "aspect-[4/3]"}`}><Package className="h-10 w-10 text-muted-foreground/30" /></div>}
              <div className="absolute left-3 top-3">{etichete}</div>
            </LegaturaProdus>
          );

          if (lat) {
            return (
              <article key={p.id} className="group grid overflow-hidden rounded-2xl border border-border bg-surface pg-md:grid-cols-[5fr_7fr]"
                style={scos ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
                <div className="relative min-h-[240px] pg-md:min-h-[340px]">{imagine}</div>
                <div className="flex flex-col p-5 pg-sm:p-7">
                  <LegaturaProdus basePath={basePath} slugSauId={p.slug ?? p.id}>
                    <h3 className="text-xl font-bold leading-snug text-foreground">{p.name}</h3>
                  </LegaturaProdus>
                  {descriere && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{descriere}</p>}

                  {block.showItems !== false && p.componente.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Conține {p.componente.length} {p.componente.length === 1 ? "produs" : "produse"}
                      </p>
                      <ul className="grid grid-cols-1 gap-2 pg-sm:grid-cols-2 pg-xl:grid-cols-3">
                        {p.componente.map((c, i) => (
                          <li key={`${c.id}-${i}`} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-background p-2">
                            {c.imagine
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={c.imagine} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted"><Package className="h-4 w-4 text-muted-foreground" /></span>}
                            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-foreground/85">{c.nume}</span>
                            {c.cantitate > 1 && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold text-foreground">×{c.cantitate}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {fomo && <div className="mt-5">{fomo}</div>}

                  {/* Spatiu flexibil: subsolul sta jos, dar niciodata lipit de continut. */}
                  <div className="min-h-5 flex-1" />
                  <div className="flex flex-col gap-4 border-t border-border pt-5 pg-sm:flex-row pg-sm:items-center pg-sm:justify-between">
                    {pret}
                    {cos && <div className="pg-sm:w-60 [&_button]:mt-0 [&_button]:py-3 [&_button]:text-sm">{cos}</div>}
                  </div>
                </div>
              </article>
            );
          }

          return (
            <article key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface"
              style={scos ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
              {imagine}
              <div className="flex flex-1 flex-col p-4 pg-sm:p-5">
                <LegaturaProdus basePath={basePath} slugSauId={p.slug ?? p.id}>
                  <h3 className="text-base font-bold leading-snug text-foreground pg-sm:text-lg">{p.name}</h3>
                </LegaturaProdus>
                {descriere && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{descriere}</p>}
                {block.showItems !== false && p.componente.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {p.componente.map((c, i) => (
                      <li key={`${c.id}-${i}`} className="flex items-center gap-2 text-sm">
                        {i > 0 ? <Plus className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden /> : <span className="w-3 shrink-0" />}
                        {c.imagine
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={c.imagine} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-lg border border-border object-cover" />
                          : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted"><Package className="h-4 w-4" /></span>}
                        <span className="min-w-0 truncate text-foreground/80">
                          {c.cantitate > 1 && <span className="font-semibold text-foreground">{c.cantitate}× </span>}
                          {c.nume}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {fomo && <div className="mt-3">{fomo}</div>}
                <div className="mt-auto pt-4">
                  {pret}
                  <div className="mt-2">{cos}</div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </BlockShell>
  );
}
