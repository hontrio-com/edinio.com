"use client";

import { Fragment, type ReactNode } from "react";
import { variantMeta } from "@/lib/storefront/design/registry";
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

/** `full` se intinde pe toata latimea; `contained` primeste containerul paginii. */
function layoutOf(section: SectionInstance): "contained" | "full" {
  return variantMeta(section.kind, section.variant)?.layout ?? "contained";
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
  const active = sections.filter((s) => s.enabled);
  const out: ReactNode[] = [];
  let serie: SectionInstance[] = [];
  let mainFolosit = false;

  const inchideSerie = () => {
    if (serie.length === 0) return;
    const continut = serie.map((s) => <SectionOne key={s.id} section={s} />);
    const cheie = `grup-${serie[0].id}`;
    if (!mainFolosit) {
      mainFolosit = true;
      out.push(
        <main key={cheie} className="max-w-6xl mx-auto px-4 py-10">
          {continut}
        </main>,
      );
    } else {
      out.push(
        <div key={cheie} className="max-w-6xl mx-auto px-4 pb-10">
          {continut}
        </div>,
      );
    }
    serie = [];
  };

  for (const s of active) {
    if (layoutOf(s) === "contained") {
      serie.push(s);
      continue;
    }
    inchideSerie();
    out.push(<Fragment key={s.id}><SectionOne section={s} /></Fragment>);
  }
  inchideSerie();

  return <>{out}</>;
}

/** Sectiunile fixe de sus si de jos: bara de anunt, header, footer. */
export function ChromeSection({ section }: { section: SectionInstance | null }) {
  if (!section || !section.enabled) return null;
  return <SectionOne section={section} />;
}
