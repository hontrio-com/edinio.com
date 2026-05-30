"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const FAQS = [
  {
    question: "Ce este Edinio?",
    answer:
      "Edinio este o platforma care permite afacerilor locale sa-si creeze un magazin online complet, fara cunostinte tehnice. Poti adauga produse, primi comenzi, configura integrari cu curierii si procesatoare de plati, totul dintr-un singur loc.",
  },
  {
    question: "Cat costa Edinio?",
    answer:
      "Oferim o perioada de testare gratuita de 15 zile, fara card de credit. Planurile platite incep de la 99 lei/luna si includ mentenanta gratuita pe viata, suport 7 zile din 7 si toate integrarile necesare.",
  },
  {
    question: "Am nevoie de cunostinte tehnice?",
    answer:
      "Nu. Edinio este conceput pentru a fi folosit de oricine. Interfata este intuitiva, iar configurarea magazinului se face simplu, fara a scrie o singura linie de cod.",
  },
  {
    question: "Ce include mentenanta gratuita?",
    answer:
      "Mentenanta este gratuita pe viata la orice abonament. Ne ocupam de actualizari, securitate, performanta si disponibilitate. Suntem la dispozitia ta 7 zile din 7 pentru orice problema sau intrebare.",
  },
  {
    question: "Ce metode de plata sunt acceptate?",
    answer:
      "Magazinul tau poate accepta plati prin card bancar (Stripe, Netopia), ramburs la curier si ridicare din magazin. Integrarile de plata sunt preconfigurate si nu necesita configurare tehnica.",
  },
  {
    question: "Pot anula abonamentul oricand?",
    answer:
      "Da, poti anula abonamentul oricand, fara costuri suplimentare sau penalitati.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 lg:py-28 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Intrebari frecvente
          </h2>
          <p className="text-lg text-muted-foreground">
            Raspunsuri la cele mai comune intrebari despre Edinio.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="border border-border rounded-xl overflow-hidden bg-card"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-accent/50 transition-colors"
              >
                <span className="text-sm font-semibold text-foreground pr-4">
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200",
                    openIndex === i && "rotate-180"
                  )}
                />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
