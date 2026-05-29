import type { Metadata } from "next";
import { PricingSection } from "@/components/website/PricingSection";
import { FAQSection } from "@/components/website/FAQSection";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Preturi",
  description:
    "Planuri si preturi Edinio. Incepe gratuit, fara card de credit.",
};

export default function PreturiPage() {
  return (
    <>
      {/* Hero */}
      <div className="pt-20 pb-8 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Preturi
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Alege planul potrivit pentru afacerea ta. Poti incepe gratuit si
            face upgrade oricand.
          </p>
        </div>
      </div>

      <PricingSection />
      <FAQSection />

      {/* CTA */}
      <section className="py-16 bg-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Incepe gratuit, fara obligatii
          </h2>
          <p className="text-white/80 mb-8">
            Nu ai nevoie de card de credit. Testeaza platforma si fa upgrade
            cand esti pregatit.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-white text-primary text-base font-semibold hover:bg-white/90 transition-colors"
          >
            Creeaza cont gratuit
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
