"use client";

import { Fragment, type ComponentType, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { groupSections, sectionLayout } from "@/lib/storefront/design/group-sections";
import { ETICHETA_ATTR, SECTION_ATTR } from "@/lib/storefront/design/preview-protocol";
import { sectionMeta } from "@/lib/storefront/design/registry";
import { stilFontSectiune } from "@/lib/storefront/design/fonturi-sectiune";
import { claseFonturi } from "@/components/pages/fonturi-incarcate";
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
import { SlotBlocuri } from "./SloturiBlocuri";
import { ContinutLiber } from "./ContinutLiber";

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
const HeaderHipermarket = dynamic(
  () => import("./sections/chrome/HeaderHipermarket").then((m) => m.HeaderHipermarket),
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
const FooterHipermarket = dynamic(
  () => import("./sections/chrome/FooterHipermarket").then((m) => m.FooterHipermarket),
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
const HeroCuCarduri = dynamic(
  () => import("./sections/hero/HeroCuCarduri").then((m) => m.HeroCuCarduri),
  { ssr: true },
);
const CategoryNavPlaci = dynamic(
  () => import("./sections/catalog/CategoryNavPlaci").then((m) => m.CategoryNavPlaci),
  { ssr: true },
);
const PlaciPromo = dynamic(
  () => import("./sections/content/PlaciPromo").then((m) => m.PlaciPromo),
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
  hipermarket: HeaderHipermarket as VariantaSectiune,
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
const FOOTERE: Record<string, ComponentType<{ sectiune: SectionInstance }>> = {
  columns: FooterColumnsLight,
  centered: FooterCentered,
  hipermarket: FooterHipermarket,
};

/** Variantele de hero, dupa id-ul din registry. */
const HEROURI: Record<string, VariantaSectiune> = {
  banners: HeroBannersOnly as VariantaSectiune,
  overlay: HeroOverlay as VariantaSectiune,
  categories: HeroCategories as VariantaSectiune,
  carduri: HeroCuCarduri as VariantaSectiune,
};

/**
 * Randeaza sectiunile paginii de magazin in ordinea din configuratie.
 *
 * Dispecerul alege dupa tip si, unde exista mai multe, dupa varianta. Header-ul
 * si footer-ul nu-si trec varianta implicita prin lista, deci ramura fara
 * potrivire e chiar „classic", respectiv „dark"; hero-ul nu are asa ceva, toate
 * variantele lui sunt in lista.
 */
function SectionOne({ section, estePrima = false }: { section: SectionInstance; estePrima?: boolean }) {
  switch (section.kind) {
    case "announcement":
      return <AnnouncementMarquee />;
    case "header": {
      const Varianta = HEADERE[section.variant];
      return Varianta ? <Varianta settings={section.settings} /> : <HeaderClassic />;
    }
    case "footer": {
      // Subsolul primeste sectiunea intreaga: coloanele lui sunt blocuri (etapa 11), nu doar reglaje.
      const Varianta = FOOTERE[section.variant];
      return Varianta ? <Varianta sectiune={section} /> : <FooterDark sectiune={section} />;
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
      return section.variant === "placi" ? <CategoryNavPlaci settings={section.settings} /> : <CategoryNavClassic />;
    case "shipping_progress":
      return <ShippingProgressBanner />;
    case "product_row":
      // Asezarea randului vine din editorul magazinului (`page_content`), nu din
      // varianta: randul n-are catalog de design-uri, iar o varianta salvata ar
      // ingheta o alegere pe care comerciantul o schimba din alta parte.
      return section.settings.mode === "featured" ? (
        <FeaturedRowClassic prioritate={estePrima} banda={section.settings.banda === true} />
      ) : (
        <CustomProductRow sectionId={String(section.settings.sectionRef ?? section.id)} prioritate={estePrima} banda={section.settings.banda === true} />
      );
    case "product_grid":
      return <ProductGridClassic prioritate={estePrima} />;
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
    case "rich_blocks":
      // Blocurile paginii alese ca pagina principala, randate pe server.
      return <SlotBlocuri cheie={String(section.settings.slot ?? "")} />;
    case "placi_promo":
      return <PlaciPromo settings={section.settings} />;
    case "continut_liber":
      // „Conținut liber” (etapa 9): slotul randat pe server, sau blocurile vii in editor.
      return <ContinutLiber cale={{ sectiune: section.id, bloc: null }} />;
    default:
      return null;
  }
}

/**
 * In editorul de DESIGN, fiecare sectiune primeste `data-st-section` cu id-ul
 * ei: asa preview-ul stie pe ce s-a dat click si unde sa deruleze.
 *
 * Pe magazinul public marcajul lipseste complet. Ar fi insemnat zeci de
 * elemente in plus fara niciun folos pentru vizitator, iar un wrapper — chiar
 * si cu `display: contents` — ramane vizibil pentru selectori de tip copil
 * direct sau `:nth-child`, deci ar putea rupe o varianta de design.
 *
 * ⚠ Si lipseste si in previzualizarea din „Editeaza magazinul", desi si aceea e
 * un iframe de editor. Marcajul e ce cauta blocarea de clicuri din
 * `useDesignPreview`: pus acolo, acoperea toata pagina — inclusiv headerul si
 * footerul, prin `ChromeSection` — si previzualizarea nu mai raspundea la niciun
 * click. Vezi `preview-protocol.ts`.
 */
function Marcata({ section, estePrima = false }: { section: SectionInstance; estePrima?: boolean }) {
  const marcata = (
    <MarcajSectiune sectiune={section}>
      <SectionOne section={section} estePrima={estePrima} />
    </MarcajSectiune>
  );
  /*
   * Fontul ales pe sectiune (etapa 14): un invelis `display: contents` care suprascrie variabilele fontului doar pe
   * portiunea ei, cu clasa `next/font` care le declara. Fara font ales, niciun element in plus.
   *
   * ⚠ IN AFARA marcajului de editor, nu inauntru: acolo `LocGol` apare numai cand e singurul copil al marcajului,
   * deci un invelis langa el l-ar fi ascuns la o sectiune goala cu font ales.
   */
  const font = stilFontSectiune(section.settings);
  if (!font) return marcata;
  return (
    <div className={["contents", claseFonturi(font.chei)].join(" ")} style={font.style as CSSProperties}>
      {marcata}
    </div>
  );
}

/**
 * Invelisul de editor, pentru orice sectiune: cele din lista de mai sus si cele
 * randate direct de pagina lor (pagina de produs, Magazinul, cosul, comanda), care
 * pana la etapa 3 n-aveau marcaj si nu se puteau alege din previzualizare.
 *
 * In afara editorului de design intoarce copiii neatinsi: niciun element in plus
 * pe magazinul public. Numele sectiunii sta langa id, ca stratul de contur
 * (`ConturEditor`) sa-l scrie fara sa caute in design.
 */
export function MarcajSectiune({ sectiune, children }: {
  sectiune: Pick<SectionInstance, "id" | "kind">;
  children: ReactNode;
}) {
  const { esteEditorDesign } = useStoreChrome();
  if (!esteEditorDesign) return <>{children}</>;
  const eticheta = sectionMeta(sectiune.kind)?.label ?? sectiune.kind;
  return (
    <div {...{ [SECTION_ATTR]: sectiune.id, [ETICHETA_ATTR]: eticheta }} className="contents">
      {children}
      <LocGol eticheta={eticheta} />
    </div>
  );
}

/**
 * Locul unei sectiuni aprinse care n-a randat nimic, DOAR in editor.
 *
 * Galeria fara imagini, recenziile fara recenzii, pragul de transport fara
 * valoare: aprinse in arbore, dar fara nicio cutie in previzualizare, deci nu
 * se puteau nici vedea, nici apasa. Apare numai cand e singurul copil al
 * invelisului (`only:`), adica exact cand sectiunea n-a pus nimic langa el; fara
 * efecte si fara masuratori, deci fara clipire la hidratare.
 */
function LocGol({ eticheta }: { eticheta: string }) {
  return (
    <div className="hidden only:block max-w-[var(--st-container,72rem)] mx-auto px-4 py-3">
      <div className="rounded-xl border-2 border-dashed border-[#93c5fd] bg-[#eff6ff] px-4 py-5 text-center text-sm text-[#1d4ed8]">
        Secțiunea „{eticheta}” e goală, deci nu apare în magazin. Apasă aici ca s-o completezi.
      </div>
    </div>
  );
}

/**
 * Sectiunile pe latime completa se randeaza direct, iar seriile consecutive de
 * sectiuni cu container se grupeaza sub un singur wrapper.
 *
 * Gruparea nu e cosmetica: fara ea, containerul (latimea din stil, `--st-container`; pana la etapa 16.3 un
 * `max-w-6xl` fix, adica exact implicitul de 72rem al tuturor magazinelor) ar trebui pus fie
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
  // Imaginile din PRIMA sectiune sunt candidatele pentru LCP („cel mai mare
  // element vizibil"), metrica dupa care Google judeca viteza perceputa. Fara
  // `priority`, `next/image` le incarca lenes: browserul le descopera abia dupa
  // ce a parsat pagina, si LCP-ul intarzie cu sute de milisecunde. Marcam DOAR
  // prima sectiune — incarcarea nerabdatoare a imaginilor de sub pliu ar fura
  // latime de banda tocmai de la cea care conteaza.
  const idPrimeiSectiuni = sections[0]?.id;
  return (
    <>
      {groupSections(sections).map((bloc) =>
        bloc.tip === "full" ? (
          <Fragment key={bloc.section.id}>
            <Marcata section={bloc.section} estePrima={bloc.section.id === idPrimeiSectiuni} />
          </Fragment>
        ) : bloc.esteMain ? (
          <main key={`grup-${bloc.sections[0].id}`} className="max-w-[var(--st-container,72rem)] mx-auto px-4 py-10">
            {bloc.sections.map((s) => <Marcata key={s.id} section={s} estePrima={s.id === idPrimeiSectiuni} />)}
          </main>
        ) : (
          <div key={`grup-${bloc.sections[0].id}`} className="max-w-[var(--st-container,72rem)] mx-auto px-4 py-10">
            {bloc.sections.map((s) => <Marcata key={s.id} section={s} estePrima={s.id === idPrimeiSectiuni} />)}
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
  // Miniatura din editor: fara `estePrima`. Sectiunea e aratata izolat, nu ca
  // prima a unei pagini, deci n-ar avea ce imagine LCP sa grabeasca.
  if (sectionLayout(section) === "full") return <SectionOne section={section} />;
  return (
    <div className="max-w-[var(--st-container,72rem)] mx-auto px-4 py-10">
      <SectionOne section={section} />
    </div>
  );
}
