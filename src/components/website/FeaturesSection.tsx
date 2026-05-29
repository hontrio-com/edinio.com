import {
  Store,
  Calendar,
  Globe,
  BarChart2,
  Link2,
  BadgePercent,
} from "lucide-react";

const FEATURES = [
  {
    icon: Store,
    title: "Magazin online complet",
    description:
      "Adauga produse, gestioneaza comenzi si proceseaza plati. Tot ce ai nevoie pentru vanzari online.",
  },
  {
    icon: Calendar,
    title: "Programari online",
    description:
      "Permite clientilor sa programeze direct de pe site. Calendar integrat cu confirmare automata.",
  },
  {
    icon: Globe,
    title: "Site profesional",
    description:
      "Template-uri moderne, personalizabile. Arata profesionist fara cunostinte tehnice.",
  },
  {
    icon: BarChart2,
    title: "Statistici detaliate",
    description:
      "Urmareste vizitele, comenzile si veniturile. Ia decizii bazate pe date reale.",
  },
  {
    icon: Link2,
    title: "Domeniu personalizat",
    description:
      "Conecteaza-ti propriul domeniu sau foloseste un subdomeniu gratuit edinio.ro.",
  },
  {
    icon: BadgePercent,
    title: "Fara comisioane ascunse",
    description:
      "Pe planurile platite nu platesti comisioane pe vanzari. Profitul ramane al tau.",
  },
];

export function FeaturesSection() {
  return (
    <section id="functionalitati" className="py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Tot ce ai nevoie pentru afacerea ta
          </h2>
          <p className="text-lg text-muted-foreground">
            Functionalitati puternice, interfata simpla. Concentreaza-te pe
            afacere, noi ne ocupam de tehnologie.
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
