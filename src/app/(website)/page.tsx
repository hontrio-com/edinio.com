import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Shield, Headset, Wrench } from "lucide-react";
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
