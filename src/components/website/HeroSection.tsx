import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 -z-10" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl -z-10 -translate-x-1/2 translate-y-1/2" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-32 lg:pb-32">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Platforma #1 pentru afaceri locale
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-[1.1] mb-6">
            Creeaza-ti magazinul online in{" "}
            <span className="text-primary">mai putin de 10 minute</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-10">
            Mini-site cu programari, magazin online cu plati, statistici si
            domeniu personalizat. Totul intr-un singur loc, fara cunostinte
            tehnice.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-primary text-white text-base font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
            >
              Incepe gratuit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/#cum-functioneaza"
              className="inline-flex items-center justify-center h-12 px-8 rounded-xl border border-border text-foreground text-base font-medium hover:bg-accent transition-colors"
            >
              Vezi cum functioneaza
            </Link>
          </div>

          {/* Trust line */}
          <p className="mt-8 text-sm text-muted-foreground">
            Gratuit, fara card de credit. Configureaza totul in mai putin de 10
            minute.
          </p>
        </div>
      </div>
    </section>
  );
}
