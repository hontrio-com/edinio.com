import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, Heart, Zap, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Despre Edinio - Platforma de creare magazin online din Romania",
  description:
    "Edinio face comertul online accesibil pentru orice afacere locala din Romania. Creeaza-ti magazinul online in cateva minute, fara cunostinte tehnice, cu integrari complete.",
  alternates: {
    canonical: "https://edinio.com/despre",
  },
  openGraph: {
    title: "Despre Edinio - Platforma de creare magazin online",
    description:
      "Misiunea noastra este sa facem comertul online accesibil pentru orice afacere locala din Romania.",
    url: "https://edinio.com/despre",
  },
};

const VALUES = [
  {
    icon: Target,
    title: "Simplu de folosit",
    description:
      "Nu ai nevoie de cunostinte tehnice. Configureaza totul vizual, cu drag & drop.",
  },
  {
    icon: Heart,
    title: "Construit pentru Romania",
    description:
      "Preturi in lei, suport in romana, integrari cu servicii locale de livrare si plata.",
  },
  {
    icon: Zap,
    title: "Pret corect",
    description:
      "Plan gratuit generos. Fara comisioane pe vanzari pe planurile platite.",
  },
  {
    icon: Shield,
    title: "Suport real",
    description:
      "Echipa de suport dedicata, disponibila sa te ajute la fiecare pas.",
  },
];

export default function DesprePage() {
  return (
    <>
      {/* Hero */}
      <div className="pt-20 pb-12 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Despre Edinio
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Misiunea noastra este sa facem comertul online accesibil pentru
            orice afacere locala din Romania.
          </p>
        </div>
      </div>

      {/* Story */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Povestea noastra
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Edinio s-a nascut dintr-o observatie simpla: mii de afaceri locale
            din Romania nu au prezenta online pentru ca solutiile existente sunt
            prea complicate sau prea scumpe. Am construit o platforma care
            elimina barierele tehnice si financiare, permitand oricui sa-si
            lanseze magazinul online in cateva minute.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Credem ca fiecare afacere locala merita sa fie vizibila online. De la
            florarii si cofetarii, pana la ateliere de bijuterii handmade si
            saloane de infrumusetare, Edinio ofera instrumentele necesare pentru
            a vinde si a creste in mediul digital.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-foreground mb-10 text-center">
            Ce ne diferentiaza
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {VALUES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-xl border border-border bg-card"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Hai sa construim impreuna
          </h2>
          <p className="text-white/80 mb-8">
            Incepe gratuit si descopera cum Edinio poate transforma afacerea ta.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-white text-primary text-base font-semibold hover:bg-white/90 transition-colors"
          >
            Incepe gratuit
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
