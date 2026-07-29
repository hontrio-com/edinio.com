"use client";

import { Fragment, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { groupSections, sectionLayout } from "@/lib/storefront/design/group-sections";
import { SECTION_ATTR } from "@/lib/storefront/design/preview-protocol";
import { useStoreChrome } from "./StorefrontProvider";
import type { SectionInstance } from "@/lib/storefront/design/types";
import { AnnouncementMarquee } from "./sections/chrome/AnnouncementMarquee";
import { FooterColumnsLight } from "./sections/chrome/FooterColumnsLight";
import { FooterDark } from "./sections/chrome/FooterDark";
import { HeaderClassic } from "./sections/chrome/HeaderClassic";
import { UspStripIcons } from "./sections/chrome/UspStripIcons";
import { CatalogToolbar } from "./sections/catalog/CatalogToolbar";
import { CategoryNavClassic } from "./sections/catalog/CategoryNavClassic";
import { ProductGridClassic } from "./sections/catalog/ProductGridClassic";
import { ShippingProgressBanner } from "./sections/shipping/ShippingProgressBanner";
import { CustomProductRow, FeaturedRowClassic } from "./sections/products/ProductRowClassic";
import { AboutClassic } from "./sections/content/AboutClassic";
import { BenefitsClassic } from "./sections/content/BenefitsClassic";
import { ContactClassic } from "./sections/content/ContactClassic";
import { GalleryClassic } from "./sections/content/GalleryClassic";
import { ReviewsClassic } from "./sections/content/ReviewsClassic";

/**
 * Variantele care nu sunt „classic" se incarca la cerere.
 *
 * Un magazin foloseste cate o varianta per sectiune, iar catalogul creste spre
 * cateva zeci. Importate static, toate ar ajunge in bundle-ul fiecarui magazin;
 * asa, fiecare descarca doar ce a ales. Variantele classic raman statice: le
 * foloseste covarsitor majoritatea, si nu merita un chunk separat.
 */
const HeaderSearch = dynamic(
  () => import("./sections/chrome/HeaderSearch").then((m) => m.HeaderSearch),
  { ssr: true },
);
const HeaderNav = dynamic(
  () => import("./sections/chrome/HeaderNav").then((m) => m.HeaderNav),
  { ssr: true },
);
const HeaderPills = dynamic(
  () => import("./sections/chrome/HeaderPills").then((m) => m.HeaderPills),
  { ssr: true },
);
const HeaderMarket = dynamic(
  () => import("./sections/chrome/HeaderMarket").then((m) => m.HeaderMarket),
  { ssr: true },
);
const HeaderWedge = dynamic(
  () => import("./sections/chrome/HeaderWedge").then((m) => m.HeaderWedge),
  { ssr: true },
);
const HeroBannersOnly = dynamic(
  () => import("./sections/hero/HeroBannersOnly").then((m) => m.HeroBannersOnly),
  { ssr: true },
);
const FooterCentered = dynamic(
  () => import("./sections/chrome/FooterCentered").then((m) => m.FooterCentered),
  { ssr: true },
);
const HeroCategories = dynamic(
  () => import("./sections/hero/HeroCategories").then((m) => m.HeroCategories),
  { ssr: true },
);
const HeroOverlay = dynamic(
  () => import("./sections/hero/HeroOverlay").then((m) => m.HeroOverlay),
  { ssr: true },
);
const HeaderEditorial = dynamic(
  () => import("./sections/chrome/HeaderEditorial").then((m) => m.HeaderEditorial),
  { ssr: true },
);
const HeaderCentered = dynamic(
  () => import("./sections/chrome/HeaderCentered").then((m) => m.HeaderCentered),
  { ssr: true },
);

/**
 * Variantele de header, dupa id-ul din registry.
 *
 * Toate primesc `settings`, chiar daca deocamdata doar unele le folosesc: asa o
 * varianta care capata setari mai tarziu nu cere modificari aici.
 */
type VariantaSectiune = ComponentType<{ settings: Record<string, unknown> }>;

const HEADERE: Record<string, VariantaSectiune> = {
  search: HeaderSearch as VariantaSectiune,
  nav: HeaderNav as VariantaSectiune,
  pills: HeaderPills as VariantaSectiune,
  market: HeaderMarket as VariantaSectiune,
  wedge: HeaderWedge as VariantaSectiune,
  editorial: HeaderEditorial as VariantaSectiune,
  centered: HeaderCentered as VariantaSectiune,
};

/**
 * Variantele de footer, dupa id-ul din registry.
 *
 * `columns` e importat static desi nu e „classic": e acelasi modul `FooterColumns`
 * pe care il randeaza si `dark`, deci e oricum in bundle-ul principal, iar un
 * chunk separat pentru invelisul de opt linii ar fi doar o cerere de retea in
 * plus. Impartirea ramane pentru `centered`, care chiar e cod separat.
 */
const FOOTERE: Record<string, VariantaSectiune> = {
  columns: FooterColumnsLight as VariantaSectiune,
  centered: FooterCentered as VariantaSectiune,
};

/** Variantele de hero, dupa id-ul din registry. */
const HEROURI: Record<string, VariantaSectiune> = {
  banners: HeroBannersOnly as VariantaSectiune,
  overlay: HeroOverlay as VariantaSectiune,
  categories: HeroCategories as VariantaSectiune,
};

/**
 * Randeaza sectiunile paginii de magazin in ordinea din configuratie.
 *
 * Dispecerul alege dupa tip si, unde exista mai multe, dupa varianta. Header-ul
 * si footer-ul nu-si trec varianta implicita prin lista, deci ramura fara
 * potrivire e chiar „classic", respectiv „dark"; hero-ul nu are asa ceva, toate
 * variantele lui sunt in lista.
 */
function SectionOne({ section }: { section: SectionInstance }) {
  switch (section.kind) {
    case "announcement":
      return <AnnouncementMarquee />;
    case "header": {
      const Varianta = HEADERE[section.variant];
      return Varianta ? <Varianta settings={section.settings} /> : <HeaderClassic />;
    }
    case "footer": {
      const Varianta = FOOTERE[section.variant];
      return Varianta ? <Varianta settings={section.settings} /> : <FooterDark settings={section.settings} />;
    }
    case "hero": {
      // Fara refugiu propriu: parserul normalizeaza deja varianta la una din
      // registry, deci ramura n-ar fi accesibila, iar un import static al ei ar
      // trage caruselul in bundle-ul fiecarui magazin, inclusiv al celor pe
      // overlay.
      const Varianta = HEROURI[section.variant];
      return Varianta ? <Varianta settings={section.settings} /> : null;
    }
    case "usp_strip":
      return <UspStripIcons />;
    case "catalog_toolbar":
      return <CatalogToolbar />;
    case "category_nav":
      return <CategoryNavClassic />;
    case "shipping_progress":
      return <ShippingProgressBanner />;
    case "product_row":
      // Asezarea randului vine din editorul magazinului (`page_content`), nu din
      // varianta: randul n-are catalog de design-uri, iar o varianta salvata ar
      // ingheta o alegere pe care comerciantul o schimba din alta parte.
      return section.settings.mode === "featured" ? (
        <FeaturedRowClassic />
      ) : (
        <CustomProductRow sectionId={String(section.settings.sectionRef ?? section.id)} />
      );
    case "product_grid":
      return <ProductGridClassic />;
    case "benefits":
      return <BenefitsClassic />;
    case "reviews":
      return <ReviewsClassic />;
    case "gallery":
      return <GalleryClassic />;
    case "about":
      return <AboutClassic />;
    case "contact":
      return <ContactClassic />;
    default:
      return null;
  }
}

/**
 * In editor, fiecare sectiune primeste `data-st-section` cu id-ul ei: asa
 * preview-ul stie pe ce s-a dat click si unde sa deruleze.
 *
 * Pe magazinul public marcajul lipseste complet. Ar fi insemnat zeci de
 * elemente in plus fara niciun folos pentru vizitator, iar un wrapper — chiar
 * si cu `display: contents` — ramane vizibil pentru selectori de tip copil
 * direct sau `:nth-child`, deci ar putea rupe o varianta de design.
 */
function Marcata({ section }: { section: SectionInstance }) {
  const { isPreview } = useStoreChrome();
  if (!isPreview) return <SectionOne section={section} />;
  return (
    <div {...{ [SECTION_ATTR]: section.id }} className="contents">
      <SectionOne section={section} />
    </div>
  );
}

/**
 * Sectiunile pe latime completa se randeaza direct, iar seriile consecutive de
 * sectiuni cu container se grupeaza sub un singur wrapper.
 *
 * Gruparea nu e cosmetica: fara ea, containerul de `max-w-6xl` ar trebui pus fie
 * pe fiecare sectiune (schimband marcajul de azi), fie o singura data in jurul
 * tuturor (ceea ce ar strica hero-ul si banda de incredere, care sunt pe toata
 * latimea). Asa, layout-ul classic da exact acelasi marcaj ca inainte, iar o
 * ordine oarecare aleasa de comerciant ramane valida.
 *
 * Prima serie e `<main>`, marcajul semantic al paginii; eventualele serii de dupa
 * sunt simple containere, cu aceeasi spatiere. Serie fara spatiu sus ar insemna
 * ca orice sectiune mutata dupa una pe toata latimea se lipeste de marginea ei
 * de jos — adica exact ce produce reordonarea din editor.
 */
export function SectionRenderer({ sections }: { sections: SectionInstance[] }) {
  return (
    <>
      {groupSections(sections).map((bloc) =>
        bloc.tip === "full" ? (
          <Fragment key={bloc.section.id}>
            <Marcata section={bloc.section} />
          </Fragment>
        ) : bloc.esteMain ? (
          <main key={`grup-${bloc.sections[0].id}`} className="max-w-6xl mx-auto px-4 py-10">
            {bloc.sections.map((s) => <Marcata key={s.id} section={s} />)}
          </main>
        ) : (
          <div key={`grup-${bloc.sections[0].id}`} className="max-w-6xl mx-auto px-4 py-10">
            {bloc.sections.map((s) => <Marcata key={s.id} section={s} />)}
          </div>
        ),
      )}
    </>
  );
}

/** Sectiunile fixe de sus si de jos: bara de anunt, header, footer. */
export function ChromeSection({ section }: { section: SectionInstance | null }) {
  if (!section || !section.enabled) return null;
  return <Marcata section={section} />;
}

/**
 * O singura sectiune, pentru miniaturile din galeria de design-uri.
 *
 * Sectiunile care in magazin primesc container si spatiu vertical de la
 * invelisul paginii il primesc si aici, cu aceleasi masuri. Fara el, un rand de
 * produse pornea lipit de marginea din stanga si cu titlul retezat sus — adica
 * miniatura nu mai arata designul, ci un design fara jumatate din asezarea lui.
 */
export function PreviewSection({ section }: { section: SectionInstance }) {
  if (sectionLayout(section) === "full") return <SectionOne section={section} />;
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <SectionOne section={section} />
    </div>
  );
}
