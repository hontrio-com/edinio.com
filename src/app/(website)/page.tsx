import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Shield, Headset, Wrench } from "lucide-react";
import { HeroSection } from "@/components/website/HeroSection";
import { FeaturesSection } from "@/components/website/FeaturesSection";
import { HowItWorksSection } from "@/components/website/HowItWorksSection";
import { DemoSection } from "@/components/website/DemoSection";
import { PricingSection } from "@/components/website/PricingSection";
import { FAQSection } from "@/components/website/FAQSection";

export const metadata: Metadata = {
  title:
    "Creare magazin online in cateva minute | Edinio - Platforma eCommerce Romania",
  description:
    "Creeaza un magazin online profesional la cheie, fara cunostinte tehnice. Plati online, integrari curierat, facturi si AWB-uri automate. Incepe gratuit, pret de la 99 lei/luna. Mentenanta gratuita pe viata.",
  alternates: {
    canonical: "https://edinio.ro",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://edinio.ro/#organization",
      name: "Edinio",
      url: "https://edinio.ro",
      logo: {
        "@type": "ImageObject",
        url: "https://edinio.ro/logo.png",
      },
      contactPoint: {
        "@type": "ContactPoint",
        email: "contact@edinio.ro",
        contactType: "customer service",
        availableLanguage: "Romanian",
      },
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://edinio.ro/#website",
      url: "https://edinio.ro",
      name: "Edinio",
      publisher: { "@id": "https://edinio.ro/#organization" },
      inLanguage: "ro-RO",
    },
    {
      "@type": "WebPage",
      "@id": "https://edinio.ro/#webpage",
      url: "https://edinio.ro",
      name: "Creare magazin online in cateva minute | Edinio",
      isPartOf: { "@id": "https://edinio.ro/#website" },
      about: { "@id": "https://edinio.ro/#organization" },
      description:
        "Creeaza un magazin online profesional la cheie, fara cunostinte tehnice. Plati online, integrari curierat, facturi si AWB-uri automate.",
      inLanguage: "ro-RO",
    },
    {
      "@type": "SoftwareApplication",
      name: "Edinio",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://edinio.ro",
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
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Ce este Edinio?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Edinio este o platforma care permite afacerilor locale sa-si creeze un magazin online complet, fara cunostinte tehnice. Poti adauga produse, primi comenzi, configura integrari cu curierii si procesatoare de plati, totul dintr-un singur loc.",
          },
        },
        {
          "@type": "Question",
          name: "Cat costa Edinio?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oferim o perioada de testare gratuita de 15 zile, fara card de credit. Planurile platite incep de la 99 lei/luna si includ mentenanta gratuita pe viata, suport 7 zile din 7 si toate integrarile necesare.",
          },
        },
        {
          "@type": "Question",
          name: "Am nevoie de cunostinte tehnice?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Nu. Edinio este conceput pentru a fi folosit de oricine. Interfata este intuitiva, iar configurarea magazinului se face simplu, fara a scrie o singura linie de cod.",
          },
        },
        {
          "@type": "Question",
          name: "Ce include mentenanta gratuita?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Mentenanta este gratuita pe viata la orice abonament. Ne ocupam de actualizari, securitate, performanta si disponibilitate. Suntem la dispozitia ta 7 zile din 7 pentru orice problema sau intrebare.",
          },
        },
        {
          "@type": "Question",
          name: "Ce metode de plata sunt acceptate?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Magazinul tau poate accepta plati prin card bancar (Stripe, Netopia), ramburs la curier si ridicare din magazin. Integrarile de plata sunt preconfigurate si nu necesita configurare tehnica.",
          },
        },
        {
          "@type": "Question",
          name: "Pot anula abonamentul oricand?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Da, poti anula abonamentul oricand, fara costuri suplimentare sau penalitati.",
          },
        },
      ],
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DemoSection />
      <PricingSection />
      <FAQSection />

      {/* Final CTA */}
      <section className="relative py-24 lg:py-32 bg-gray-950 overflow-hidden">
        {/* Romania map background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.06] pointer-events-none">
          <Image
            src="/ro.svg"
            alt=""
            width={900}
            height={600}
            className="w-full max-w-4xl h-auto"
            aria-hidden="true"
          />
        </div>

        {/* Gradient accents */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-primary/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5">
            Ești pregătit să vinzi în toată România{" "}
            <span className="text-primary">cu ajutorul Edinio?</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            Testează gratuit 15 zile. Fără card de credit, fără obligații. Mentenanță gratuită pe viață și suport 7 zile din 7.
          </p>

          <Link
            href="/register"
            className="inline-flex items-center justify-center h-13 px-10 rounded-xl bg-primary text-white text-base font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:bg-primary/90 transition-all duration-200"
          >
            Începe gratuit acum
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>

          {/* Trust row */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mt-12">
            {[
              { icon: Shield, text: "Fără card de credit" },
              { icon: Headset, text: "Suport 7 zile din 7" },
              { icon: Wrench, text: "Mentenanță gratuită pe viață" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-gray-500">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
