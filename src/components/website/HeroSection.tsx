import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 sm:pt-14 sm:pb-16 lg:pt-20 lg:pb-24">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-8 items-center">
          {/* ── Left: Text ── */}
          <div>
            {/* Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-bold text-foreground tracking-tight leading-[1.12] mb-5">
              Creeaza-ti propriul{" "}
              <span className="text-primary">magazin online</span> in cateva
              minute, fara investitii de mii de euro
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
              Tot ce ai nevoie pentru a incepe sa vinzi online: magazin online,
              plati, facturi, AWB-uri, suport si mentenanta gratuita permanenta.
            </p>

            {/* CTAs */}
            <div className="flex items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center justify-center h-11 px-7 rounded-full bg-primary text-white text-sm font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 hover:bg-primary/90 transition-all duration-200"
              >
                Incepe gratuit
              </Link>
              <Link
                href="/#functionalitati"
                className="inline-flex items-center justify-center gap-1.5 h-11 px-6 rounded-full border border-border text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
              >
                Vezi toate functiile
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* ── Right: Video ── */}
          <div className="relative">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto"
            >
              <source src="/hero/video.mp4" type="video/mp4; codecs=hvc1" />
              <source src="/hero/video.webm" type="video/webm" />
            </video>
          </div>
        </div>
      </div>

      {/* ── Logo marquee ── */}
      <div className="border-t border-border bg-background py-8">
        <p className="text-center text-sm text-muted-foreground mb-6">
          Folosit de{" "}
          <span className="text-primary font-semibold">150+</span> afaceri
          locale din Romania
        </p>
        <div className="relative overflow-hidden">
          <div className="flex items-center gap-16 animate-marquee whitespace-nowrap">
            {[
              "Floraria Maria",
              "Cofetaria Dulce",
              "Bijuterii Ana",
              "Salon Elena",
              "Patiseria Bon",
              "Atelier Creativ",
              "Casa Verde",
              "Dulciuri Fine",
              "Floraria Maria",
              "Cofetaria Dulce",
              "Bijuterii Ana",
              "Salon Elena",
              "Patiseria Bon",
              "Atelier Creativ",
              "Casa Verde",
              "Dulciuri Fine",
            ].map((name, i) => (
              <span
                key={i}
                className="text-lg font-bold text-muted-foreground/25 select-none"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
