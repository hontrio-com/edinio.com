import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 lg:pt-24 lg:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* ── Left: Text ── */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2.5 mb-8">
              <span className="px-2.5 py-1 rounded-md bg-primary text-white text-xs font-bold tracking-wide">
                NOU
              </span>
              <span className="text-sm text-muted-foreground">
                Platforma lansata!
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-foreground tracking-tight leading-[1.12] mb-6">
              Creeaza-ti{" "}
              <span className="text-primary">magazinul online</span> care
              livreaza rezultate reale
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg mb-10">
              Afacerile locale pot construi si gestiona un magazin online complet
              intr-o singura platforma vizuala.
            </p>

            {/* CTA + Social proof */}
            <div className="flex flex-wrap items-center gap-6">
              <Link
                href="/register"
                className="inline-flex items-center justify-center h-11 px-7 rounded-lg bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
              >
                Incepe gratuit
              </Link>

              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {[
                    "bg-rose-200 text-rose-700",
                    "bg-sky-200 text-sky-700",
                    "bg-amber-200 text-amber-700",
                  ].map((cls, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold ${cls}`}
                    >
                      {["M", "A", "E"][i]}
                    </div>
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  <strong className="text-primary">500+</strong> afaceri locale
                </span>
              </div>
            </div>
          </div>

          {/* ── Right: Video ── */}
          <div className="relative hidden lg:block">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto"
            >
              <source src="/hero/video.webm" type="video/webm" />
            </video>
          </div>
        </div>
      </div>

      {/* ── Logo marquee ── */}
      <div className="border-t border-border py-8">
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
