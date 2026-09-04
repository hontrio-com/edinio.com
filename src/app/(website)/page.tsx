import type { Metadata } from "next";
import { Hero } from "@/components/website/sections/Hero";
import { Problem } from "@/components/website/sections/Problem";
import { Features } from "@/components/website/sections/Features";
import { IntegrationsBenzi } from "@/components/website/sections/integrations/IntegrationsBenzi";
import { Comparison } from "@/components/website/sections/Comparison";
import { PricingSection } from "@/components/website/PricingSection";
import { FAQSection } from "@/components/website/FAQSection";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { intrebariStructurate } from "@/lib/website/faq";
import { UrmaAterizare } from "@/components/edinio-marketing/UrmaAterizare";
import { jsonLdSafe } from "@/lib/json-ld";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { ID_ORGANIZATIE, ID_SITE } from "@/lib/website-jsonld";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plans";

/** Planurile care se pot cumpara. `free`/`trial` e perioada de testare, nu o oferta. */
const PLANURI_PUBLICE = ["basic", "premium", "ultra"] as const;

export const metadata: Metadata = {
  title: "Platformă eCommerce pentru crearea unui magazin online",
  description:
    "Creează și administrează magazinul tău online cu Edinio, platforma eCommerce românească cu integrări, automatizări și mentenanță gratuită permanentă.",
  alternates: {
    canonical: "https://www.edinio.com",
  },
};

/*
 * ⚠ `Organization` si `WebSite` NU mai sunt aici.
 *
 * S-au mutat in `(website)/layout.tsx`, ca sa existe pe TOATE cele opt pagini de
 * prezentare, nu doar pe radacina: paginile secundare se refereau la ele prin
 * `@id`, iar un crawler care citeste /despre separat n-avea de unde sa le ia.
 * Vezi `lib/website-jsonld.ts`.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${PLATFORM_ORIGIN}/#webpage`,
      url: PLATFORM_ORIGIN,
      // Numele si descrierea vin din `metadata` de mai sus, nu scrise a doua
      // oara: erau amandoua altele decat titlul si descrierea reale ale paginii,
      // adica doua raspunsuri la aceeasi intrebare despre aceeasi adresa.
      name: `${metadata.title as string} | Edinio`,
      isPartOf: { "@id": ID_SITE },
      about: { "@id": ID_ORGANIZATIE },
      description: metadata.description as string,
      inLanguage: "ro-RO",
    },
    {
      "@type": "SoftwareApplication",
      name: "Edinio",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: PLATFORM_ORIGIN,
      description:
        "Platforma de creare magazin online pentru afaceri locale din Romania. Fara cunostinte tehnice, cu integrari complete pentru curierat, plati si facturare.",
      /*
       * ⚠ PRET FARA PERIOADA = PRET FALS.
       *
       * Aici sta pana acum un `AggregateOffer` cu `lowPrice: "0"` si
       * `highPrice: "499"`, fara nicio urma de recurenta. Citit literal — si un
       * crawler nu citeste altfel — „499 RON" era pretul de CUMPARARE al
       * platformei, nu abonamentul lunar. Iar `offerCount: 4` numara si perioada
       * de testare drept oferta.
       *
       * `UnitPriceSpecification` cu `billingDuration: 1` si `unitCode: "MON"`
       * spune exact ce spune si pagina: atat pe luna. Preturile vin din
       * `PLAN_PRICES`, singura sursa de adevar din aplicatie; scrise inca o data
       * aici, s-ar fi desincronizat la prima schimbare de tarif.
       */
      offers: PLANURI_PUBLICE.map((plan) => ({
        "@type": "Offer",
        name: PLAN_LABELS[plan],
        priceCurrency: "RON",
        price: PLAN_PRICES[plan],
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: PLAN_PRICES[plan],
          priceCurrency: "RON",
          billingDuration: 1,
          billingIncrement: 1,
          unitCode: "MON",
        },
        url: `${PLATFORM_ORIGIN}/preturi`,
      })),
      featureList: [
        "Creare magazin online",
        "Integrari curierat (FAN Courier, Sameday, Cargus, DPD, GLS, Pall-Ex, eColet)",
        "Plati online (Stripe, Netopia)",
        "Facturare automata (SmartBill, Oblio)",
        "AWB-uri automate",
        "Mentenanta gratuita pe viata",
        "Suport 7 zile din 7",
      ],
    },
    /*
      ⚠ Blocul FAQ NU se mai scrie aici. Era copiat de mana din componenta —
      aceleasi intrebari in doua locuri, deci la prima corectura unul ramanea in
      urma si Google primea intrebari care nu mai exista pe pagina. Regulile lui
      cer explicit ca datele structurate sa corespunda continutului vizibil.
      Acum se construieste din chiar lista randata. Vezi `lib/website/faq.ts`.
    */
    intrebariStructurate(),
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />
      <UrmaAterizare nume="Homepage" categorie="landing" />
      <Hero />

      <Problem />
      <Features />
      {/* A luat locul lui `HowItWorksSection`, stearsa odata cu asta. Ancora ei,
          `#cum-functioneaza`, nu era tintita de niciun link — verificat. */}
      <IntegrationsBenzi />
      <Comparison />
      <PricingSection />
      <FAQSection />

      {/* Final CTA */}
      <FinalCta />
    </>
  );
}
