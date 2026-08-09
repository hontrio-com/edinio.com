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
import { PlatformEvent } from "@/components/platform/PlatformEvent";

export const metadata: Metadata = {
  title: "Creare magazin online rapid",
  description:
    "Creeaza un magazin online profesional fara cunostinte tehnice. Plati online, curierat, facturi si AWB-uri automate. Incepe gratuit cu Edinio.",
  alternates: {
    canonical: "https://www.edinio.com",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.edinio.com/#organization",
      name: "Edinio",
      url: "https://www.edinio.com",
      logo: {
        "@type": "ImageObject",
        url: "https://www.edinio.com/logo.png",
      },
      contactPoint: {
        "@type": "ContactPoint",
        email: "contact@edinio.com",
        contactType: "customer service",
        availableLanguage: "Romanian",
      },
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://www.edinio.com/#website",
      url: "https://www.edinio.com",
      name: "Edinio",
      publisher: { "@id": "https://www.edinio.com/#organization" },
      inLanguage: "ro-RO",
    },
    {
      "@type": "WebPage",
      "@id": "https://www.edinio.com/#webpage",
      url: "https://www.edinio.com",
      name: "Creare magazin online in cateva minute | Edinio",
      isPartOf: { "@id": "https://www.edinio.com/#website" },
      about: { "@id": "https://www.edinio.com/#organization" },
      description:
        "Creeaza un magazin online profesional la cheie, fara cunostinte tehnice. Plati online, integrari curierat, facturi si AWB-uri automate.",
      inLanguage: "ro-RO",
    },
    {
      "@type": "SoftwareApplication",
      name: "Edinio",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://www.edinio.com",
      description:
        "Platforma de creare magazin online pentru afaceri locale din Romania. Fara cunostinte tehnice, cu integrari complete pentru curierat, plati si facturare.",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "0",
        highPrice: "499",
        priceCurrency: "RON",
        offerCount: "4",
      },
      featureList: [
        "Creare magazin online",
        "Integrari curierat (FAN Courier, Sameday, Cargus, DPD, GLS)",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PlatformEvent event="ViewContent" data={{ content_name: "Homepage", content_category: "landing" }} />
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
