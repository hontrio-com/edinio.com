"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { useStoreChrome, useStorefrontOptional, type CategoryItem } from "@/components/storefront/StorefrontProvider";
import { BannerSlider } from "./HeroBanners";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { subcategorii } from "@/lib/storefront/categories-chrome";

/** Cate categorii se arata implicit. */
const MAX_IMPLICIT = 10;

/**
 * Hero cu bara de categorii la stanga si bannere la dreapta.
 *
 * Asezarea marilor magazine: vizitatorul are dintr-o privire si intreg raftul,
 * si oferta zilei. Inaltimea o da lista de categorii, iar bannerele o umplu.
 *
 * A cerut candva sase categorii CU PRODUSE, si pragul acela oprea exact
 * magazinele care aveau nevoie de el: cel care isi face intai categoriile si
 * abia apoi produsele nu putea alege designul pentru care si le facea. Acum se
 * arata cu oricate, goale sau nu; fara nicio categorie ramane doar cu bannerele,
 * fiindca o bara fara randuri nu e o alegere, e o cutie goala.
 */
export function HeroCategories({ settings }: { settings: Record<string, unknown> }) {
  const { business, basePath, categoriiRoot, categoriiPePagina, pageContent, searchCategories } = useStoreChrome();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const { banners, links } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);

  const maxim = typeof settings.maxCategories === "number" ? settings.maxCategories : MAX_IMPLICIT;
  // Si categoriile inca goale: vezi `rootCategoryItemsToate`.
  const toate = catalog?.rootCategoryItemsToate ?? catalog?.rootCategoryItems ?? [];
  const categorii = toate.slice(0, maxim);
  const areBara = toate.length > 0;
  const areBanner = banners.length > 0;

  /*
   * Categoria peste care sta mausul, si copiii ei.
   *
   * Arborele vine din catalog cand exista (pagina principala) si din chrome in
   * rest: `searchCategories` aduce acum arborele intreg, nu doar radacinile,
   * tocmai ca panoul asta si meniul de pe telefon sa aiba ce arata.
   */
  /*
   * Categoria atinsa SI inaltimea la care sta randul ei.
   *
   * Panoul lipit sus, cand se deschidea dintr-un rand de jos, lasa o diagonala
   * de traversat cu mausul: pana ajungeai la subcategorii ieseai de pe rand,
   * randul se stingea si panoul disparea. Aliniat la rand, drumul e drept si
   * scurt. Inaltimea se citeste din elementul insusi, nu din indexul lui:
   * randurile n-au inaltime fixa, iar un nume pe doua linii ar fi decalat tot ce
   * urmeaza.
   */
  const [deschisa, setDeschisa] = useState<{ item: CategoryItem; sus: number } | null>(null);
  const arbore = catalog?.categories ?? searchCategories;
  const subcategoriiDeschise = useMemo(
    () => subcategorii(arbore, deschisa?.item.id ?? null),
    [arbore, deschisa],
  );
  const invelis = useRef<HTMLDivElement>(null);
  const panou = useRef<HTMLDivElement>(null);
  /*
   * Inaltimea la care se aseaza panoul, dupa ce stim cat de inalt e.
   *
   * Aliniat strict la rand, un panou deschis dintr-o categorie de jos ar fi
   * atarnat sub bara si sub hero. Se ridica exact cat sa incapa, si numai atunci:
   * `useLayoutEffect` masoara inainte de vopsire, deci nu se vede niciun salt.
   */
  const [sus, setSus] = useState(0);
  useLayoutEffect(() => {
    if (!deschisa) return;
    const inaltimeBara = invelis.current?.clientHeight ?? 0;
    const inaltimePanou = panou.current?.offsetHeight ?? 0;
    setSus(Math.max(0, Math.min(deschisa.sus, inaltimeBara - inaltimePanou)));
  }, [deschisa, subcategoriiDeschise]);

  // H1-ul se emite inaintea oricarei conditii, ca in HeroBannersOnly: un magazin
  // fara bannere care scade si sub pragul de categorii si-ar pierde altfel
  // singurul titlu al paginii principale, in tacere.
  return (
    <>
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>

      {(areBanner || areBara) && (
        <section className="pt-4 md:pt-6">
          <div className="mx-auto max-w-6xl px-0 md:px-4">
            <div className={areBara ? "lg:grid lg:grid-cols-[236px_1fr] lg:gap-4" : ""}>
              {areBara && (
                // Inaltimea o da bannerul, cu raportul lui neatins, iar randurile se
                // impart ce a mai ramas. Invers — inaltimea din numarul de randuri —
                // bannerul ar fi fost taiat cu atat mai mult cu cat magazinul are mai
                // putine categorii, adica exact acolo unde arata deja mai sarac.
                //
                // De aceea, cat timp exista un banner, bara sta absolut intr-o
                // celula fara inaltime proprie: altfel, de la ~11 randuri in sus
                // (campul permite 14), ea ar fi dictat inaltimea grilei si ar fi
                // lasat un gol sub banner, cu punctele caruselului plutind
                // dedesubt. Fara banner nu are de la cine sa isi ia inaltimea,
                // deci ramane in flux.
                // `relative` si fara banner: panoul cu subcategorii se aseaza fata
                // de invelisul asta, iar fara el s-ar fi agatat de primul stramos
                // pozitionat — adica ar fi aparut aiurea exact la magazinele care
                // n-au pus niciun banner.
                <div ref={invelis} className={areBanner ? "relative hidden lg:block" : "relative hidden lg:block"}
                  onMouseLeave={() => setDeschisa(null)}>
                  {/* `overflow-visible`, nu `auto`: panoul cu subcategorii iese in
                      dreapta barei, iar o taietura l-ar fi ascuns exact acolo unde
                      apare. Numarul de randuri e oricum plafonat din setari, deci
                      bara n-are ce derula. */}
                  <nav aria-label="Categorii" className={areBanner
                    ? "absolute inset-0 flex flex-col rounded-2xl border border-[var(--st-border)] bg-[var(--st-surface)] py-1.5"
                    : "flex flex-col rounded-2xl border border-[var(--st-border)] bg-[var(--st-surface)] py-1.5"}>
                    {categorii.map((c) => (
                      <Rand key={c.key} nume={c.name} imagine={c.image} catalogRoot={categoriiRoot}
                        pePagina={categoriiPePagina} areCopii={c.hasChildren}
                        activ={deschisa?.item.key === c.key}
                        onHover={(sus) => setDeschisa({ item: c, sus })}
                        onAlege={catalog ? () => catalog.selectCategoryItem(c) : undefined} />
                    ))}
                  </nav>

                  {/*
                    UN SINGUR panou, in dreapta barei, nu cate unul per rand.
                    Asa arata orice catalog mare: lista de categorii la stanga,
                    continutul celei atinse la dreapta. Cate un panou per rand ar
                    fi insemnat zece panouri montate degeaba si un salt vizual la
                    fiecare trecere cu mausul.
                  */}
                  {deschisa && subcategoriiDeschise.length > 0 && (
                    /*
                      Elementul pozitionat porneste LIPIT de bara, iar spatiul de 8
                      pixeli e margine INAUNTRUL lui. Cu marginea pe elementul
                      pozitionat, spatiul acela nu apartinea nimanui: mausul care
                      pleca din rand catre subcategorii iesea o clipa din invelis,
                      `onMouseLeave` inchidea panoul, si nu se putea ajunge la el.
                    */
                    <div ref={panou} className="absolute left-full z-30 w-72" style={{ top: sus }}>
                      <div className="ml-2 max-h-[22rem] overflow-y-auto rounded-2xl border border-[var(--st-border)] bg-[var(--st-surface)] shadow-xl py-2">
                        <p className="px-3.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--st-muted)]">
                          {deschisa.item.name}
                        </p>
                        <a href={hrefCategorie(categoriiRoot, deschisa.item.name, categoriiPePagina)}
                          className="block px-3.5 py-1.5 text-[13px] font-semibold hover:opacity-70 transition-opacity"
                          style={{ color: "var(--st-primary)" }}>
                          Vezi tot din {deschisa.item.name}
                        </a>
                        {subcategoriiDeschise.map((sub) => (
                          <a key={sub.key} href={hrefCategorie(categoriiRoot, sub.name, categoriiPePagina)}
                            className="block px-3.5 py-1.5 text-[13px] text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors truncate">
                            {sub.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {areBanner && (
                <BannerSlider
                  banners={banners}
                  links={links}
                  alt={nume}
                  basePath={basePath}
                  wrapperClass="relative md:rounded-2xl md:overflow-hidden"
                  slideClass="shrink-0 w-full snap-center bg-muted aspect-[16/9]"
                />
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** Un rand din bara: imaginea categoriei daca exista, altfel initiala ei. */
function Rand({
  nume,
  imagine,
  catalogRoot,
  pePagina = false,
  areCopii = false,
  activ = false,
  onHover,
  onAlege,
}: {
  nume: string;
  imagine: string | null;
  catalogRoot: string;
  pePagina?: boolean;
  areCopii?: boolean;
  activ?: boolean;
  onHover?: (sus: number) => void;
  onAlege?: () => void;
}) {
  const continut = (
    <>
      {imagine ? (
        <span className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-[var(--st-bg)]">
          <Image src={imagine} alt="" fill sizes="32px" className="object-cover" />
        </span>
      ) : (
        <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: "var(--st-primary-soft)", color: "var(--st-primary)" }}>
          {nume[0]?.toUpperCase()}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-sm text-[var(--st-text)]">{nume}</span>
      {areCopii && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--st-muted)]" strokeWidth={1.7} />}
    </>
  );

  const cls = `flex flex-1 items-center gap-2.5 min-h-11 px-3.5 transition-colors text-left ${activ ? "bg-[var(--st-primary-soft)]" : "hover:bg-[var(--st-primary-soft)]"}`;
  // Si pe focus, nu doar pe maus: altfel panoul cu subcategorii ar fi existat
  // doar pentru cine foloseste mausul.
  const raporteaza = (e: { currentTarget: HTMLElement }) => onHover?.(e.currentTarget.offsetTop);
  const asculta = { onMouseEnter: raporteaza, onFocus: raporteaza };

  // Pe pagina de magazin filtreaza pe loc; miniatura din galerie n-are catalog.
  return onAlege ? (
    <button type="button" onClick={onAlege} className={cls} {...asculta}>{continut}</button>
  ) : (
    <a href={hrefCategorie(catalogRoot, nume, pePagina)} className={cls} {...asculta}>{continut}</a>
  );
}
