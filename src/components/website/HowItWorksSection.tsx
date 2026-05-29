import { UserPlus, Palette, Rocket } from "lucide-react";

const STEPS = [
  {
    icon: UserPlus,
    step: "01",
    title: "Creeaza un cont",
    description:
      "Inregistreaza-te gratuit in mai putin de 2 minute. Nu este nevoie de card de credit.",
  },
  {
    icon: Palette,
    step: "02",
    title: "Personalizeaza-ti magazinul",
    description:
      "Alege un template, adauga produse, seteaza culorile si logo-ul. Totul drag & drop.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Publica si vinde",
    description:
      "Publica-ti magazinul cu un click si incepe sa primesti comenzi si programari.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="cum-functioneaza" className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Cum functioneaza?
          </h2>
          <p className="text-lg text-muted-foreground">
            Trei pasi simpli pentru a-ti lansa magazinul online.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {STEPS.map(({ icon: Icon, step, title, description }, i) => (
            <div key={step} className="relative text-center">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[calc(50%+2.5rem)] w-[calc(100%-5rem)] h-px bg-border" />
              )}

              <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
                <Icon className="h-8 w-8 text-primary" />
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                  {step}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
