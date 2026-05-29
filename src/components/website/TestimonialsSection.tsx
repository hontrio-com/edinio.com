import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    name: "Maria P.",
    business: "Florarie",
    text: "Am trecut de la un site WordPress la Edinio si am economisit ore intregi pe saptamana. Platforma este incredibil de simpla.",
    rating: 5,
  },
  {
    name: "Andrei M.",
    business: "Cofetarie artizanala",
    text: "Clientii mei pot acum sa comande direct de pe telefon. Vanzarile au crescut cu 40% de cand folosesc Edinio.",
    rating: 5,
  },
  {
    name: "Elena S.",
    business: "Bijuterii handmade",
    text: "Cel mai simplu mod de a avea un magazin online. L-am configurat in 15 minute si arata profesionist.",
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Ce spun clientii nostri
          </h2>
          <p className="text-lg text-muted-foreground">
            Sute de afaceri locale folosesc Edinio pentru a vinde online.
          </p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="p-6 rounded-2xl bg-card border border-border"
            >
              {/* Stars */}
              <div className="flex items-center gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-foreground leading-relaxed mb-6">
                &ldquo;{t.text}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.business}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
