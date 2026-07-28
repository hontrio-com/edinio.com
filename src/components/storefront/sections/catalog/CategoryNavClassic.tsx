"use client";

import type { MouseEvent } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { CategoryScroller } from "./CategoryScroller";

/** Ctrl/Cmd/Shift-click pe o categorie deschide adresa in fila noua. */
function altaFila(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/**
 * Categoriile sunt ancore, nu butoane: filtrarea se face pe loc, fara navigare,
 * deci fara ele pagina de magazin n-ar avea niciun link crawlabil catre vreo
 * categorie (in headere linkurile apar abia dupa deschiderea dropdown-ului, iar
 * footerul „centered" nu arata categorii deloc). Serverul stie deja sa citeasca
 * `?cat=`, adresele functioneaza; lipsea doar cine sa le scrie.
 *
 * Adresa se compune in `lib/storefront/category-href`, impreuna cu celelalte
 * sase locuri care arata aceleasi categorii.
 */

/**
 * Navigarea pe categorii, varianta classic.
 *
 * Doua forme, alese automat dupa date, nu din setari: cercuri cu imagini cand
 * macar o categorie are imagine, pastile text altfel. Ambele sunt ierarhice —
 * click pe o categorie cu subcategorii intra in ea, iar controlul din fata
 * devine „Inapoi".
 *
 * Cand desenam variantele de categorii, alegerea intre cele doua devine
 * explicita in editor; deocamdata ramane exact cum era.
 */
export function CategoryNavClassic() {
  const { hasCategories, hasAnyCategoryImage } = useStorefront();
  if (!hasCategories) return null;
  return hasAnyCategoryImage ? <CerculeteCuImagini /> : <PastileText />;
}

function PastileText() {
  const { heroAreCategorii, categoriiRoot, categoriiPePagina, color, categoryFilter, currentCategoryItems, isDrilled, drillParentName, selectCategoryItem, resetCategory, goBackCategory } =
    useStorefront();

  const inactiv = {
    backgroundColor: "transparent",
    color: "var(--color-muted-foreground)",
    border: "1px solid var(--color-border)",
  };
  const pastila = "flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all";

  return (
    <CategoryScroller className={heroAreCategorii ? "mb-6 lg:hidden" : "mb-6"}>
      <div className="flex items-center gap-2 pb-1 w-max mx-auto">
        {isDrilled ? (
          <button type="button" onClick={goBackCategory}
            className={`${pastila} inline-flex items-center gap-1`} style={inactiv}>
            <ChevronLeft size={14} /> {drillParentName ?? "Inapoi"}
          </button>
        ) : (
          <button type="button" onClick={resetCategory} className={pastila}
            aria-current={categoryFilter === "toate" ? "true" : undefined}
            style={categoryFilter === "toate" ? { backgroundColor: color, color: "white" } : inactiv}>
            Toate
          </button>
        )}
        {currentCategoryItems.map((item) => {
          const activ = categoryFilter === item.name;
          return (
            // `aria-current` fiindca altfel starea „aceasta e categoria aleasa"
            // se vede exclusiv din culoarea de fundal.
            <a key={item.key} href={hrefCategorie(categoriiRoot, item.name, categoriiPePagina)}
              onClick={(e) => {
                if (altaFila(e)) return;
                e.preventDefault();
                selectCategoryItem(item);
              }}
              aria-current={activ ? "true" : undefined}
              className={`${pastila} inline-flex items-center gap-1`}
              style={activ ? { backgroundColor: color, color: "white" } : inactiv}>
              {item.name}{item.hasChildren && <ChevronRight size={13} className="opacity-70" />}
            </a>
          );
        })}
      </div>
    </CategoryScroller>
  );
}

function CerculeteCuImagini() {
  const { heroAreCategorii, categoriiRoot, categoriiPePagina, color, categoryFilter, currentCategoryItems, isDrilled, drillParentName, selectCategoryItem, resetCategory, goBackCategory } =
    useStorefront();

  const buton = "flex flex-col items-center gap-2 flex-shrink-0 group";
  const eticheta = "text-xs font-medium text-center leading-tight w-[84px] break-words min-h-[30px]";
  const toateActiv = categoryFilter === "toate";

  return (
    <CategoryScroller className={heroAreCategorii ? "mb-6 lg:hidden" : "mb-6"}>
      <div className="flex gap-4 pb-1 w-max mx-auto">
        {/* Controlul din fata: „Toate" la nivelul de sus, „Inapoi" intr-o subcategorie. */}
        {isDrilled ? (
          <button type="button" onClick={goBackCategory} className={buton}>
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all border-2"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}>
              <ChevronLeft className="w-6 h-6" style={{ color: "var(--color-muted-foreground)" }} />
            </div>
            <span className={eticheta} style={{ color: "var(--color-muted-foreground)" }}>
              {drillParentName ?? "Inapoi"}
            </span>
          </button>
        ) : (
          <button type="button" onClick={resetCategory} className={buton}
            aria-current={toateActiv ? "true" : undefined}>
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all border-2"
              style={{
                borderColor: toateActiv ? color : "var(--color-border)",
                backgroundColor: toateActiv ? `${color}15` : "var(--color-muted)",
              }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"
                style={{ color: toateActiv ? color : "var(--color-muted-foreground)" }}>
                <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <span className={eticheta} style={{ color: toateActiv ? color : "var(--color-muted-foreground)" }}>
              Toate
            </span>
          </button>
        )}
        {currentCategoryItems.map((item) => {
          const activ = categoryFilter === item.name;
          return (
            <a key={item.key} href={hrefCategorie(categoriiRoot, item.name, categoriiPePagina)}
              onClick={(e) => {
                if (altaFila(e)) return;
                e.preventDefault();
                selectCategoryItem(item);
              }}
              aria-current={activ ? "true" : undefined}
              className={buton}>
              <div className="relative w-[72px] h-[72px] rounded-full overflow-hidden transition-all border-2"
                style={{
                  borderColor: activ ? color : "var(--color-border)",
                  boxShadow: activ ? `0 0 0 2px ${color}40` : "none",
                }}>
                {item.image ? (
                  <Image src={item.image} alt={item.name} fill sizes="72px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: activ ? `${color}15` : "var(--color-muted)" }}>
                    <span className="text-lg font-bold" style={{ color: activ ? color : "var(--color-muted-foreground)" }}>
                      {item.name[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                {item.hasChildren && (
                  <span className="absolute bottom-0.5 right-0.5 rounded-full bg-surface/95 p-0.5 shadow-sm flex items-center justify-center" style={{ color }}>
                    <Layers className="w-3 h-3" />
                  </span>
                )}
              </div>
              <span className={eticheta} style={{ color: activ ? color : "var(--color-muted-foreground)" }}>
                {item.name}
              </span>
            </a>
          );
        })}
      </div>
    </CategoryScroller>
  );
}
