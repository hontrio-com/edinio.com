"use client";

import { ShoppingCart } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { hrefCatalog } from "@/lib/storefront/category-href";
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
 *
 * `prioritate` spune daca grila e PRIMA sectiune a paginii, exact ca la
 * randurile de produse. Grila era singura care nu primea steagul si isi incarca
 * nerabdator primele patru imagini oricum — adica tocmai ce interzice
 * comentariul din `SectionRenderer`. Pe un magazin cu hero si trei randuri
 * deasupra, alea patru erau sub pliu si furau banda de la bannerul care chiar
 * era elementul LCP: 864 KiB pe eSAFE, imagini de furnizor care ocolesc si
 * redimensionarea din CDN.
 */
export function ProductGridClassic({ prioritate = false }: { prioritate?: boolean }) {
  const {
    catalogRoot,
    color,
    search,
    categoryFilter,
    paginatedProducts,
    featuredProducts,
    pageContent,
    hasHero,
    currentPage,
    totalPages,
    goToPage,
    interogareFiltre,
    totalFiltrate,
    catalogSeIncarca,
  } = useStorefront();

  const areRecomandate = pageContent.show_featured_section === true;
  const cauta = !!search || categoryFilter !== "toate";

  const mergiLa = (n: number) => {
    goToPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section id="produse" className="mb-16" style={{ scrollMarginTop: "calc(var(--st-header-offset, 100px) + 1rem)" }}>
      {!hasHero && !areRecomandate && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Produse</h2>
        </div>
      )}
      {areRecomandate && featuredProducts.length > 0 && totalFiltrate > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-bold text-foreground">Toate produsele</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {totalFiltrate === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {cauta ? "Niciun produs gasit" : "Niciun produs disponibil"}
          </p>
          <p className="text-sm text-muted-foreground">
            {cauta ? "Incearca alta cautare sau categorie." : "Revino curand pentru produse noi."}
          </p>
        </div>
      ) : (
        <>
          {/* Cat timp se cere pagina noua, grila se stinge putin si nu mai
              primeste apasari: pe palierul server un filtru bifat e un
              dus-intors, iar fara semnul asta vizitatorul apasa a doua data
              crezand ca prima n-a mers. */}
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 transition-opacity${catalogSeIncarca ? " opacity-50 pointer-events-none" : ""}`}
            aria-busy={catalogSeIncarca || undefined}>
            {paginatedProducts.map((product, i) => (
              <StoreProductCard key={product.id} product={product} priority={prioritate && i < 4} />
            ))}
          </div>
          {totalPages > 1 && (
            <Paginare current={currentPage} total={totalPages} color={color} catalogRoot={catalogRoot} interogareFiltre={interogareFiltre} onGo={mergiLa} />
          )}
        </>
      )}
    </section>
  );
}

/**
 * Prima si ultima pagina raman mereu vizibile; restul se condenseaza in „...".
 *
 * Numerele sunt ancore reale, nu butoane: paginarea schimba doar starea locala
 * si adresa (history.replaceState), deci fara ele paginile 2..N ale catalogului
 * n-ar avea niciun link crawlabil catre ele — la 1181 de produse, 58 de pagini
 * pe care nimeni nu le poate atinge din pagina principala. Serverul stie deja sa
 * citeasca `?page=`, adresele functioneaza; lipsea doar cine sa le scrie.
 * Fiecare pagina leaga prima, ultima si vecinele, deci lantul e complet.
 */
function Paginare({
  current,
  total,
  color,
  catalogRoot,
  interogareFiltre,
  onGo,
}: {
  current: number;
  total: number;
  color: string;
  /**
   * Adresa paginii care gazduieste catalogul. Vine ca prop, nu se deduce din
   * `basePath`: grila se randeaza acolo unde e pusa, iar dedusa aici, lantul de
   * paginare ar fi trimis mereu la radacina magazinului.
   */
  catalogRoot: string;
  /**
   * Filtrele active, gata scrise ca interogare. Fara ele, fiecare numar de
   * pagina arunca cautarea, categoria si pretul si trimitea la catalogul intreg.
   *
   * Nu contin `utm_*`/`gclid`/`preview`: alea se adauga doar la rescrierea
   * adresei, din motivul scris in `MiniStoreRenderer` — puse in ancore, ar lipsi
   * din HTML-ul initial si ar aparea abia la hidratare.
   */
  interogareFiltre: string;
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
  /*
   * Numerele duc la ACEEASI lista, doar la alta pagina din ea.
   *
   * Inainte se scria `?page=N` gol, deci fiecare numar arunca cautarea,
   * categoria, intervalul de pret si fatetele: „pagina 2 din manusi sub 50 lei"
   * ducea la pagina 2 din tot catalogul. Bug-ul statea ascuns fiindca
   * `e.preventDefault()` de mai jos inghite apasarea obisnuita si paginarea se
   * face pe loc — se vedea doar la ctrl-click, la copierea adresei, si la
   * roboti, care nu apasa nimic si citesc chiar `href`-ul gresit.
   *
   * Aceeasi compunere ca sora ei din `ShopPieces`. `hrefCatalog` normalizeaza
   * radacina, deci ramane si fara slash inaintea interogarii: `/magazin/?page=2`
   * lua un 308 la fiecare apasare, iar Search Console numara fiecare pagina ca
   * redirectionare.
   */
  const href = (p: number) => hrefCatalog(
    catalogRoot,
    p <= 1 ? interogareFiltre : `${interogareFiltre}${interogareFiltre ? "&" : ""}page=${p}`,
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
      <button onClick={() => onGo(Math.max(1, current - 1))} disabled={current === 1} className={nav}>
        Inapoi
      </button>
      {pagini.map((p, i) =>
        p === "dots" ? (
          <span key={`dots-${i}`} className="px-1 text-muted-foreground">...</span>
        ) : (
          // Ctrl/Cmd/Shift-click deschide adresa in fila noua; restul ramane
          // schimbare de pagina pe loc, fara navigare.
          <a key={p} href={href(p)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              onGo(p);
            }}
            aria-current={current === p ? "page" : undefined}
            className="inline-flex items-center justify-center min-w-[36px] h-9 text-sm rounded-lg border transition-colors"
            style={current === p
              ? { backgroundColor: color, borderColor: color, color: "#fff" }
              : { borderColor: "var(--color-border)" }}>
            {p}
          </a>
        ),
      )}
      <button onClick={() => onGo(Math.min(total, current + 1))} disabled={current === total} className={nav}>
        Inainte
      </button>
    </div>
  );
}
