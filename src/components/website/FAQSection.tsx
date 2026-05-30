"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const FAQS = [
  {
    question: "Ce este Edinio?",
    answer:
      "Edinio este o platformă care permite afacerilor locale să-și creeze un magazin online complet, fără cunoștințe tehnice. Poți adăuga produse, primi comenzi, configura integrări cu curierii și procesatoare de plăți, totul dintr-un singur loc.",
  },
  {
    question: "Cât costă Edinio?",
    answer:
      "Oferim o perioadă de testare gratuită de 15 zile, fără card de credit. Planurile plătite încep de la 99 lei/lună și includ mentenanță gratuită pe viață, suport 7 zile din 7 și toate integrările necesare.",
  },
  {
    question: "Am nevoie de cunoștințe tehnice?",
    answer:
      "Nu. Edinio este conceput pentru a fi folosit de oricine. Interfața este intuitivă, iar configurarea magazinului se face simplu, fără a scrie o singură linie de cod.",
  },
  {
    question: "Ce include mentenanța gratuită?",
    answer:
      "Mentenanța este gratuită pe viață la orice abonament. Ne ocupăm de actualizări, securitate, performanță și disponibilitate. Suntem la dispoziția ta 7 zile din 7 pentru orice problemă sau întrebare.",
  },
  {
    question: "Ce metode de plată sunt acceptate?",
    answer:
      "Magazinul tău poate accepta plăți prin card bancar (Stripe, Netopia), ramburs la curier și ridicare din magazin. Integrările de plată sunt preconfigurate și nu necesită configurare tehnică.",
  },
  {
    question: "Pot anula abonamentul oricând?",
    answer:
      "Da, poți anula abonamentul oricând, fără costuri suplimentare sau penalități.",
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
            Întrebări frecvente
          </h2>
          <p className="text-lg text-muted-foreground">
            Răspunsuri la cele mai comune întrebări despre Edinio.
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
