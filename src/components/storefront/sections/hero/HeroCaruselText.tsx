"use client";

import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { resolveHref } from "@/lib/pages/href";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { textulBannerelor, type AliniereTextBannere, type LatimeBannere, type TextBannere } from "@/lib/storefront/design/hero-text";
import { LIMITE_RAPORT } from "@/lib/storefront/design/raport-bannere";
import { hrefCatreProduse } from "@/lib/storefront/category-href";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { BannerSlider } from "./HeroBanners";

/**
 * Bannerele cu text peste ele, designul „Bannere cu text și buton peste” (20.11.2026).
 *
 * Acelasi carusel ca la „Doar imagini” (aceleasi poze, aceleasi linkuri, acelasi loc), cu un titlu, un rand de text si un
 * buton asezate peste primul banner, sau, la cerere, fixe peste toate. Cerut pentru un magazin real, dupa macheta lui:
 * pana acum, un mesaj peste carusel se putea pune doar desenat in poza, iar pe telefon ajungea de sase pixeli.
 *
 * Titlul e H1-ul paginii (`providesH1` in registru), deci aici nu se mai pune unul ascuns. Reglajele si implicitele:
 * `lib/storefront/design/hero-text.ts`.
 *
 * ⚠ Stratul NU prinde clicuri (`pointer-events-none`), doar butonul din el: altfel bannerul cu link n-ar mai fi fost
 * apasabil, iar caruselul nu s-ar mai fi putut trage cu mouse-ul de pe jumatatea cu text.
 */
export function HeroCaruselText({ settings }: { settings: Record<string, unknown> }) {
  const chrome = useStoreChrome();
  const { business, basePath, pageContent } = chrome;

  const nume = business.store_name ?? business.business_name;
  const { banners, links, marimi } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);
  const t = textulBannerelor(settings, { nume, slogan: business.tagline });

  // Fara niciun banner n-are peste ce scrie: ramane titlul ascuns, ca la „Doar imagini”.
  if (banners.length === 0) {
    return (
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>
    );
  }

  const href = t.link ? resolveHref(t.link, basePath) : hrefCatreProduse(chrome);
  // De la doua bannere in sus caruselul are puncte, jos la mijloc: textul le lasa loc (`LOC_PUNCTE`).
  const strat = <StratText t={t} nume={nume} href={href} cuPuncte={banners.length > 1} />;
  const cadru = CADRU[t.latime];

  return (
    <section className={cadru.sectiune}>
      <div className={cadru.coloana}>
        <BannerSlider
          banners={banners}
          links={links}
          alt={nume}
          basePath={basePath}
          marimi={marimi}
          limiteRaport={LIMITE_RAPORT.carusel}
          {...cadru.carusel}
          pesteBanner={t.peToate ? undefined : (i) => (i === 0 ? strat : null)}
          pesteTot={t.peToate ? strat : undefined}
        />
      </div>
    </section>
  );
}

/*
 * ═══ CELE DOUA ASEZARI ALE CARUSELULUI: CAT PAGINA, CAT ECRANUL (24.11.2026, vezi `hero-text.ts`) ═══
 *
 * „pagina” e asezarea de pana acum, la litera: aceleasi clase ca la „Doar imagini” (`BannerCarousel`), iar caruselul
 * isi ia invelisul si locul din implicitele lui `BannerSlider` (de aceea `carusel` e gol).
 *
 * „ecran” scoate, DOAR de la `md` in sus, spatiul de deasupra, coloana de 1120 px si colturile rotunjite, si plafoneaza
 * inaltimea locului la 70% din fereastra (poza se taie sus si jos, `object-cover`).
 *
 * ⚠ Clasele FARA prag de ecran sunt aceleasi in amandoua asezarile: pe telefon bannerele ocupau deja tot ecranul, deci
 * acolo nu se schimba nimic. Proba le compara clasa cu clasa.
 *
 * ⚠ Butonul de pauza trece in STANGA jos, tot de la `md` in sus. Cu bannerul pana la marginea ferestrei, coltul lui din
 * dreapta jos cade sub butoanele plutitoare de contact ale magazinului (telefon, WhatsApp), care stau lipite de coltul
 * ferestrei: la 1440 x 900 si la 1920 x 1080, cu pagina sus, pauza era acoperita aproape toata. In stanga nu sta nimic,
 * iar cutia cu text incepe de la cel putin 53 px (7% din latime, de la 768 px in sus), deci nu ajunge peste ea.
 */
const CADRU: Record<LatimeBannere, { sectiune: string; coloana: string; carusel: { wrapperClass?: string; slideClass?: string; clasaPauza?: string } }> = {
  pagina: { sectiune: "relative overflow-hidden md:pt-6", coloana: "mx-auto md:max-w-6xl md:px-4", carusel: {} },
  ecran: {
    sectiune: "relative overflow-hidden",
    coloana: "mx-auto",
    carusel: {
      wrapperClass: "relative",
      slideClass: "shrink-0 w-full snap-center aspect-[16/9] bg-muted md:max-h-[70vh]",
      clasaPauza: "absolute bottom-3 right-3 md:right-auto md:left-3 z-10 w-7 h-7 rounded-full flex items-center justify-center bg-black/35 text-white hover:bg-black/55 transition-colors",
    },
  },
};

/**
 * Pe bannerele intinse pe tot ecranul, cutia cu text incepe unde incepe si continutul paginii: marginea coloanei
 * (`--st-container`, aceeasi pe care o folosesc antetele) plus cei 16 px ai ei. Fara asta, pe un ecran de 1920 px
 * textul ar sta la 64 px de marginea ferestrei, iar sigla si meniul de deasupra lui la 336. Pe ferestrele mai inguste
 * decat coloana socoteala iese negativa, iar `max` lasa marginea obisnuita.
 */
const MARGINE_COLOANA = "calc((100cqw - var(--st-container, 72rem)) / 2 + 1rem)";

/*
 * ⚠ MARIMILE TIN DE BANNER, NU DE ECRAN.
 *
 * Bannerul isi ia raportul din poza (`raport-bannere.ts`, intre 4:3 si 4:1), deci la aceeasi latime de ecran poate avea
 * 290 px inaltime sau 97. Cu marimi pe praguri de ecran, pe un banner lat (1920x600, forma cea mai des intalnita)
 * titlul si butonul nu mai incapeau pe telefon. De aceea stratul e un container (`container-type: size`), iar marimile
 * se dau in sutimi din inaltimea si din latimea LUI (`cqh`, `cqw`), intre un minim care se mai poate citi si un maxim
 * care nu striga. Cate randuri are titlul si daca apare textul de sub el hotaraste tot marimea bannerului (regulile
 * `@container` de pe elemente): un rand sub 100 px inaltime, doua sub 150, trei peste; textul, de la 560 x 250 px.
 *
 * Masurat pe 20.11.2026, in browser, cu textele cele mai lungi admise (titlu de 50 de caractere, text de 159, buton de
 * 29): bannere 4:3, 16:9, 3,2:1 si 4:1, cele trei alinieri, la 320, 390, 640, 768, 1024 si 1440 px, adica 72 de cazuri.
 * In toate, cutia cu text ramane in banner, nu atinge sagetile, punctele ori butonul de pauza, butonul primeste clicul,
 * iar bannerul ramane apasabil pe langa el. Prima forma a marimilor punea butonul sub punctele caruselului pe bannerele
 * late; de atunci, `hero-text.test.ts` socoteste din marimile de mai jos cazul cel mai rau pe 40 de marimi de banner si
 * cade cand nu mai incape deasupra punctelor.
 *
 * Clasele de marime de pe aceleasi elemente sunt plasa pentru browserele fara aceste unitati (dinainte de 2023): acolo
 * valoarea din `style` e nevalida si se arunca, deci raman clasele, pe praguri de ecran, cu titlul pe un rand si fara
 * textul de sub el.
 */
const MARIMI = {
  titlu: { fontSize: "clamp(15px, min(9.5cqh, 5.4cqw), 52px)" },
  text: { fontSize: "clamp(13px, min(3.2cqh, 1.8cqw), 17px)", marginTop: "clamp(6px, 2cqh, 16px)" },
  buton: {
    height: "clamp(28px, min(16cqh, 9cqw), 48px)",
    paddingInline: "clamp(12px, 2.6cqw, 28px)",
    fontSize: "clamp(11px, min(4.2cqh, 1.9cqw), 13px)",
    marginTop: "clamp(3px, 4cqh, 24px)",
  },
} satisfies Record<string, CSSProperties>;

/**
 * Locul punctelor caruselului (jos, la mijloc: 6 px de la margine, 24 px inaltime). Textul se centreaza in ce ramane
 * deasupra lor: pe un banner scund (unul lat, vazut pe telefon), butonul ajungea altfel sub puncte, care ii luau clicul.
 */
const LOC_PUNCTE = "30px";

/**
 * Unde sta cutia cu text, cat de lata e si cat loc lasa pe margini (ultimele doua: dupa banner, pe browserele cu `cqw`).
 *
 * ⚠ La mijloc si in dreapta marginea e de cel putin 44 px: in coltul din dreapta jos sta butonul de pauza al caruselului
 * (28 px, la 12 px de margini), iar cu marginea de 20 px a celui din stanga cutia ajungea peste el. De la 736 px in sus
 * toate au peste 51 px, cat sa ramana libere si sagetile (36 px, la 8 px de margini).
 */
const ASEZARE: Record<AliniereTextBannere, { rand: string; cutie: string; latime: string; margini: string }> = {
  stanga: { rand: "justify-start text-left", cutie: "max-w-[66%] sm:max-w-[54%] lg:max-w-[46%]", latime: "clamp(13.5rem, 62cqw, 34rem)", margini: "clamp(20px, 7cqw, 64px)" },
  centru: { rand: "justify-center text-center", cutie: "max-w-[88%] sm:max-w-[70%] lg:max-w-[56%]", latime: "clamp(15rem, 76cqw, 44rem)", margini: "clamp(44px, 7cqw, 64px)" },
  dreapta: { rand: "justify-end text-left", cutie: "max-w-[66%] sm:max-w-[54%] lg:max-w-[46%]", latime: "clamp(13.5rem, 62cqw, 34rem)", margini: "clamp(44px, 7cqw, 64px)" },
};

/** Stratul de sub textul alb: intuneca poza in partea in care sta textul. */
const STRAT_INCHIS: Record<AliniereTextBannere, string> = {
  stanga: "bg-gradient-to-r from-black/65 via-black/30 to-transparent",
  centru: "bg-black/40",
  dreapta: "bg-gradient-to-l from-black/65 via-black/30 to-transparent",
};

/** Stratul de sub textul inchis: deschide poza in partea in care sta textul. */
const STRAT_DESCHIS: Record<AliniereTextBannere, string> = {
  stanga: "bg-gradient-to-r from-white/80 via-white/40 to-transparent",
  centru: "bg-white/55",
  dreapta: "bg-gradient-to-l from-white/80 via-white/40 to-transparent",
};

/**
 * Textul „închis”. O culoare FIXA, nu `--st-text`: pe o tema cu fond inchis, culoarea textului temei e deschisa, iar
 * aici sub text sta un strat alb, deci „Închis” ar fi iesit alb pe alb.
 */
const INCHIS = "#18181b";

function StratText({ t, nume, href, cuPuncte }: { t: TextBannere; nume: string; href: string; cuPuncte: boolean }) {
  const asezare = ASEZARE[t.aliniere];
  const alb = t.culoare === "deschis";
  const culoareTitlu = alb ? "#ffffff" : t.culoare === "principala" ? "var(--st-primary)" : INCHIS;
  const culoareText = alb ? "rgba(255,255,255,0.9)" : `color-mix(in srgb, ${INCHIS} 88%, transparent)`;
  // „Cât ecranul”: textul se aliniaza cu coloana paginii, nu cu marginea ferestrei (`MARGINE_COLOANA`).
  const margini = t.latime === "ecran" ? `max(${asezare.margini}, ${MARGINE_COLOANA})` : asezare.margini;

  return (
    <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden [container-type:size]">
      {t.estompare && <span aria-hidden className={`absolute inset-0 ${(alb ? STRAT_INCHIS : STRAT_DESCHIS)[t.aliniere]}`} />}
      <div className={`relative h-full flex items-center px-5 sm:px-10 lg:px-16 ${asezare.rand}`}
        style={{ paddingInline: margini, paddingBottom: cuPuncte ? LOC_PUNCTE : undefined }}>
        <div className={`min-w-0 ${asezare.cutie}`} style={{ maxWidth: asezare.latime }}>
          {/*
            Randurile titlului dupa inaltimea bannerului: unul sub 100 px, doua sub 150, trei peste (pragurile nu se
            suprapun, deci ordinea regulilor in foaie nu conteaza). Spatiul de jos tine in cadru cozile literelor de pe
            ultimul rand (g, j, ț), pe care taietura randurilor le-ar fi retezat.
          */}
          <h1 className="text-[21px] sm:text-[32px] lg:text-[44px] xl:text-[52px] font-medium leading-[1.15] tracking-tight text-balance pb-[0.1em] line-clamp-1 [@container_(min-height:100px)_and_(max-height:149.98px)]:line-clamp-2 [@container_(min-height:150px)]:line-clamp-3"
            style={{ ...MARIMI.titlu, fontFamily: "var(--st-font-heading)", color: culoareTitlu, fontStyle: t.cursiv ? "italic" : undefined }}>
            {t.titlu}
            {t.titlu !== nume && <span className="sr-only"> - {nume}</span>}
          </h1>
          {/*
            Textul apare doar cand bannerul are loc pentru el (cel putin 560 px latime si 250 px inaltime), adica nu pe
            telefon. Invelisul il ascunde, iar paragraful isi taie singur randurile: puse pe acelasi element, `block` ar
            fi anulat taietura (care cere `display: -webkit-box`).
          */}
          {t.text && (
            <div className="hidden [@container_(min-width:560px)_and_(min-height:250px)]:block">
              <p className="text-[14px] lg:text-[17px] leading-[1.55] line-clamp-3" style={{ ...MARIMI.text, color: culoareText }}>
                {t.text}
              </p>
            </div>
          )}
          {/*
            Butonul nu trece de cutie: o eticheta prea lunga pentru un banner ingust se scurteaza cu „…”, nu iese din poza.
            `draggable={false}`: altfel browserul ar trage legatura, nu caruselul (vezi linkul bannerului, `HeroBanners.tsx`).
          */}
          <a href={href} draggable={false}
            className="pointer-events-auto mt-3 sm:mt-6 inline-flex max-w-full items-center gap-2 h-9 sm:h-11 lg:h-12 px-4 sm:px-6 lg:px-7 rounded-[var(--st-radius-btn)] text-[11px] sm:text-[13px] font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-90"
            style={{ ...MARIMI.buton, backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
            <span className="truncate">{t.buton}</span>
            <ArrowRight aria-hidden className="h-[1.25em] w-[1.25em] shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}
