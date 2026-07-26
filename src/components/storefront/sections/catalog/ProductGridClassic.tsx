"use client";

import { ShoppingCart } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { StoreProductCard } from "@/components/storefront/sections/products/StoreProductCard";

/**
 * Catalogul principal, varianta classic: grila paginata cu toate produsele care
 * trec de cautare si filtre.
 *
 * Antetul se adapteaza la restul paginii: „Produse" doar cand pagina n-are nici
 * hero nici Recomandate, „Toate produsele" cand exista Recomandate deasupra, si
 * niciun titlu in rest.
 *
 * Ancora `#produse` e folosita de butonul din hero si de „Vezi toate" din
 * randurile pe categorie, deci trebuie sa ramana pe sectiune.
 */
export function ProductGridClassic() {
  const {
    color,
    search,
    categoryFilter,
    filteredProducts,
    paginatedProducts,
    featuredProducts,
    pageContent,
    hasHero,
    currentPage,
    totalPages,
    goToPage,
  } = useStorefront();

  const areRecomandate = pageContent.show_featured_section === true;
  const cauta = !!search || categoryFilter !== "toate";

  const mergiLa = (n: number) => {
    goToPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section id="produse" className="mb-16">
      {!hasHero && !areRecomandate && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Produse</h2>
        </div>
      )}
      {areRecomandate && featuredProducts.length > 0 && filteredProducts.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-bold text-foreground">Toate produsele</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {cauta ? "Niciun produs gasit" : "Niciun produs disponibil"}
          </p>
          <p className="text-sm text-muted-foreground">
            {cauta ? "Incearca alta cautare sau categorie." : "Reveniti curand pentru produse noi."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {paginatedProducts.map((product, i) => (
              <StoreProductCard key={product.id} product={product} priority={i < 4} />
            ))}
          </div>
          {totalPages > 1 && <Paginare current={currentPage} total={totalPages} color={color} onGo={mergiLa} />}
        </>
      )}
    </section>
  );
}

/** Prima si ultima pagina raman mereu vizibile; restul se condenseaza in „...". */
function Paginare({
  current,
  total,
  color,
  onGo,
}: {
  current: number;
  total: number;
  color: string;
  onGo: (n: number) => void;
}) {
  const pagini = Array.from({ length: total }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === total || Math.abs(p - current) <= 1)
    .reduce<(number | "dots")[]>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("dots");
      acc.push(p);
      return acc;
    }, []);

  const nav = "px-3 py-2 text-sm rounded-lg border border-border disabled:opacity-30 hover:bg-muted transition-colors";

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button onClick={() => onGo(Math.max(1, current - 1))} disabled={current === 1} className={nav}>
        Inapoi
      </button>
      {pagini.map((p, i) =>
        p === "dots" ? (
          <span key={`dots-${i}`} className="px-1 text-muted-foreground">...</span>
        ) : (
          <button key={p} onClick={() => onGo(p)}
            className="min-w-[36px] h-9 text-sm rounded-lg border transition-colors"
            style={current === p
              ? { backgroundColor: color, borderColor: color, color: "#fff" }
              : { borderColor: "var(--color-border)" }}>
            {p}
          </button>
        ),
      )}
      <button onClick={() => onGo(Math.min(total, current + 1))} disabled={current === total} className={nav}>
        Inainte
      </button>
    </div>
  );
}
