"use client";

import { Fragment } from "react";
import { groupSections } from "@/lib/storefront/design/group-sections";
import { SECTION_ATTR } from "@/lib/storefront/design/preview-protocol";
import { useStoreChrome } from "./StorefrontProvider";
import type { SectionInstance } from "@/lib/storefront/design/types";
import { AnnouncementMarquee } from "./sections/chrome/AnnouncementMarquee";
import { FooterDark } from "./sections/chrome/FooterDark";
import { HeaderClassic } from "./sections/chrome/HeaderClassic";
import { UspStripIcons } from "./sections/chrome/UspStripIcons";
import { HeroClassic } from "./sections/hero/HeroClassic";
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
 * Randeaza sectiunile paginii de magazin in ordinea din configuratie.
 *
 * Dispecerul e pe `kind`, nu pe `kind:variant`: azi fiecare tip are exact o
 * implementare. Alegerea variantei intra aici cand un tip primeste a doua —
 * registry-ul poarta deja metadatele de care are nevoie editorul.
 *
 * Importurile sunt statice cat timp exista doar variantele „classic". Cand incep
 * sa apara variantele noi, tot ce nu e classic trece pe import dinamic, ca un
 * magazin sa descarce doar ce foloseste.
 */
function SectionOne({ section }: { section: SectionInstance }) {
  switch (section.kind) {
    case "announcement":
      return <AnnouncementMarquee />;
    case "header":
      return <HeaderClassic />;
    case "footer":
      return <FooterDark />;
    case "hero":
      return <HeroClassic />;
    case "usp_strip":
      return <UspStripIcons />;
    case "catalog_toolbar":
      return <CatalogToolbar />;
    case "category_nav":
      return <CategoryNavClassic />;
    case "shipping_progress":
      return <ShippingProgressBanner />;
    case "product_row":
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
 * Prima serie e `<main>`, marcajul semantic al paginii, si isi pastreaza
 * spatierea verticala; eventualele serii de dupa sunt simple containere.
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
          <div key={`grup-${bloc.sections[0].id}`} className="max-w-6xl mx-auto px-4 pb-10">
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
