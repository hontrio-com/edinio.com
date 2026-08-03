"use client";

import { useMemo } from "react";
import { cdnImage } from "@/lib/cdn-image";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import { buildProductSearchIndex, queryProductSearchIndex } from "@/lib/storefront/product-search";

/**
 * Produsele gasite, chiar sub caseta de cautare din header.
 *
 * Pana acum cautarea din header filtra o grila aflata mai jos in pagina: cine
 * scria „bocanci" trebuia sa deruleze ca sa vada daca a gasit ceva, iar de pe
 * paginile fara catalog nu vedea nimic pana nu apasa Enter. Aici raspunsul e
 * imediat si in acelasi loc cu intrebarea.
 *
 * Trece prin ACELASI motor de cautare ca grila (`product-search`), cu diacritice
 * si greseli de tastare iertate. Un al doilea motor ar fi insemnat ca „rosu"
 * gaseste aici si nu gaseste dincolo, pentru acelasi magazin.
 */

/** Cate se arata in panou. Restul se vad apasand Enter, in catalog. */
const MAX_REZULTATE = 6;
/** Sub doua litere, orice interogare potriveste prea mult ca sa ajute. */
const MIN_LITERE = 2;

export function RezultateCautare({
  text,
  basePath,
  onAlege,
  inFlux = false,
}: {
  text: string;
  basePath: string;
  /** Se cheama la apasarea unui rezultat, ca panoul care il contine sa se inchida. */
  onAlege?: () => void;
  /**
   * Panoul sta in flux, nu absolut sub bara.
   *
   * Pentru cautarea care se deschide ca fereastra peste pagina: acolo exista loc
   * dedesubt, iar un panou absolut ar fi iesit din fereastra si ar fi acoperit
   * pagina de dincolo de ea.
   */
  inFlux?: boolean;
}) {
  const catalog = useStorefrontOptional();
  const produse = catalog?.visibleProducts;

  const index = useMemo(
    () => buildProductSearchIndex((produse ?? []).map((p) => ({
      id: p.id, name: p.name, category: p.category, description: p.description,
    }))),
    [produse],
  );

  const gasite = useMemo(() => {
    if (!produse || text.trim().length < MIN_LITERE) return null;
    const potriviri = queryProductSearchIndex(index, text);
    if (!potriviri) return null;
    return produse
      .filter((p) => potriviri.has(p.id))
      .sort((a, b) => (potriviri.get(b.id) ?? 0) - (potriviri.get(a.id) ?? 0))
      .slice(0, MAX_REZULTATE);
  }, [produse, index, text]);

  // Fara catalog incarcat nu avem ce cauta pe loc: acolo panoul nu se arata
  // deloc, iar Enter duce la catalog cu termenul in adresa.
  if (!catalog || gasite === null) return null;

  const total = queryProductSearchIndex(index, text)?.size ?? 0;

  return (
    <div className={inFlux
      ? "mt-4 rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] overflow-hidden"
      : "absolute left-0 right-0 top-full mt-1.5 z-50 rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-xl overflow-hidden"}>
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--st-border)] bg-[var(--st-bg)]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--st-muted)]">Produse</span>
        <span className="text-[11px] text-[var(--st-muted)]">
          {total === 0 ? "niciun rezultat" : total === 1 ? "1 produs gasit" : `${total} produse gasite`}
        </span>
      </div>

      {gasite.length === 0 ? (
        <p className="px-3.5 py-6 text-sm text-[var(--st-muted)] text-center">
          Nimic pentru „{text.trim()}”. Incearca alt cuvant.
        </p>
      ) : (
        <ul className="max-h-[22rem] overflow-y-auto">
          {gasite.map((p) => {
            // Coercit la sir aici: `images` e jsonb, deci `unknown[]`, iar un
            // `unknown` folosit direct ca fiu JSX nu trece de tipuri.
            const imagini = Array.isArray(p.images) ? (p.images as unknown[]).filter(Boolean) : [];
            const imagine = imagini.length > 0 ? String(imagini[0]) : "";
            const interval = p.price_range;
            const faraStoc = !!(p.track_inventory && (p.stock_quantity ?? 0) <= 0);
            return (
              <li key={p.id} className="border-b border-[var(--st-border)] last:border-0">
                <a href={`${basePath}/product/${p.slug ?? p.id}`} onClick={onAlege}
                  className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-[var(--st-primary-soft)] transition-colors">
                  <span className="w-11 h-11 shrink-0 rounded-[var(--st-radius-sm)] overflow-hidden bg-[var(--st-bg)]">
                    {imagine !== "" && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={cdnImage(imagine, 96)} alt="" className="w-full h-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--st-text)] truncate">{String(p.name)}</span>
                    <span className="block text-[11px] text-[var(--st-muted)] truncate">
                      {/* Stocul si categoria: cele doua lucruri dupa care se decide
                          daca merita deschis produsul, fara sa il deschizi. */}
                      <span style={faraStoc ? undefined : { color: "var(--st-primary)" }}>
                        {faraStoc ? "Stoc epuizat" : "In stoc"}
                      </span>
                      {p.category ? ` · ${p.category}` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-[var(--st-text)] shrink-0 whitespace-nowrap">
                    {/* Minimul intervalului, nu pretul de baza: pe ANTIFOANE
                        panoul scria 156,80 pentru un produs care se vinde cu 438. */}
                    {interval.hasRange
                      ? formatPriceRange(interval.min, interval.max)
                      : formatPrice(interval.min)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {total > gasite.length && (
        <div className="px-3.5 py-2 border-t border-[var(--st-border)] bg-[var(--st-bg)] text-center">
          <span className="text-[12px] text-[var(--st-muted)]">
            Apasa Enter ca sa le vezi pe toate {total}
          </span>
        </div>
      )}
    </div>
  );
}
