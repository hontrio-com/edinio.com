import Link from "next/link";
import { ShoppingCart, TrendingUp, Package } from "lucide-react";

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

          {/* ── Right: Visual ── */}
          <div className="relative hidden lg:block h-[500px]">
            {/* Dot pattern */}
            <div
              className="absolute inset-0 rounded-3xl"
              style={{
                backgroundImage:
                  "radial-gradient(circle, oklch(0.527 0.154 150.069 / 0.12) 1.2px, transparent 1.2px)",
                backgroundSize: "20px 20px",
              }}
            />

            {/* Main card: mock store */}
            <div className="relative z-10 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden w-[360px] mx-auto mt-6">
              {/* Browser bar */}
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-background rounded-md px-3 py-1 text-[10px] text-muted-foreground text-center truncate">
                  floraria-maria.edinio.ro
                </div>
              </div>

              {/* Store header */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-rose-500 flex items-center justify-center text-white text-[10px] font-bold">
                    F
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    Floraria Maria
                  </span>
                </div>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Products */}
              <div className="p-3 grid grid-cols-2 gap-2.5">
                {[
                  { name: "Buchet Trandafiri", price: "149 lei", bg: "bg-rose-50" },
                  { name: "Aranjament Floral", price: "199 lei", bg: "bg-amber-50" },
                  { name: "Buchet Mixt", price: "99 lei", bg: "bg-purple-50" },
                  { name: "Lalele Premium", price: "129 lei", bg: "bg-pink-50" },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="rounded-lg border border-border overflow-hidden"
                  >
                    <div className={`h-16 ${p.bg}`} />
                    <div className="p-2">
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-primary font-bold mt-0.5">
                        {p.price}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating: stat card (top-right) */}
            <div className="absolute top-2 right-2 z-20 bg-card rounded-xl shadow-lg border border-border px-4 py-3">
              <p className="text-2xl font-bold text-primary leading-none">
                150+
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Afaceri locale
                <br />
                active
              </p>
            </div>

            {/* Floating: growth card (bottom-left) */}
            <div className="absolute bottom-8 -left-2 z-20 bg-card rounded-xl shadow-lg border border-border px-3.5 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground leading-none">
                  40%
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Crestere in comenzi
                </p>
              </div>
            </div>

            {/* Floating: order notification (mid-right) */}
            <div className="absolute top-[52%] -right-3 z-20 bg-card rounded-xl shadow-lg border border-border p-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-foreground">
                  Comanda noua!
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Acum 2 minute
                </p>
              </div>
            </div>

            {/* Small floating avatars (top-right decorative) */}
            <div className="absolute top-6 right-[140px] z-20 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-full bg-sky-100 border-2 border-card shadow flex items-center justify-center text-sky-600 text-xs font-bold">
                A
              </div>
              <div className="w-9 h-9 rounded-full bg-rose-100 border-2 border-card shadow flex items-center justify-center text-rose-600 text-xs font-bold">
                E
              </div>
            </div>
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
