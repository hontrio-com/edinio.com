import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroSection } from "@/components/website/HeroSection";
import { FeaturesSection } from "@/components/website/FeaturesSection";
import { HowItWorksSection } from "@/components/website/HowItWorksSection";
import { DemoSection } from "@/components/website/DemoSection";
import { PricingSection } from "@/components/website/PricingSection";
import { FAQSection } from "@/components/website/FAQSection";

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DemoSection />
      <PricingSection />
      <FAQSection />

      {/* Final CTA */}
      <section className="py-20 lg:py-28 bg-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Pregatit sa-ti lansezi magazinul?
          </h2>
          <p className="text-lg text-white/80 mb-8">
            Alatura-te sutelor de afaceri care vand deja online cu Edinio.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-white text-primary text-base font-semibold hover:bg-white/90 transition-colors"
          >
            Incepe gratuit acum
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
