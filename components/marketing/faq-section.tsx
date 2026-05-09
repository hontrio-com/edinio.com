'use client'

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'

const faqs = [
  {
    q: 'Nu am nicio experienta cu AI. Pot urma cursul?',
    a: 'Da, absolut. Cursul este conceput de la zero pentru incepatori. Nu ai nevoie de cunostinte tehnice, de programare sau de experienta anterioara cu AI. Daca stii sa folosesti un browser web, poti urma acest curs.',
  },
  {
    q: 'Cat timp am acces la curs?',
    a: 'Acces pe viata, inclusiv toate actualizarile viitoare. Platesti o singura data si ai acces oricand, pe orice dispozitiv. Daca adaugam lectii noi sau actualizam continut, le primesti automat.',
  },
  {
    q: 'Ce se intampla daca nu sunt multumit?',
    a: 'Ai o garantie de 14 zile fara nicio intrebare. Daca parcurgi cursul si nu esti multumit de rezultate, iti returnam integral banii. Nu ti se va cere nicio explicatie.',
  },
  {
    q: 'Pot invata in ritmul meu?',
    a: 'Da. Toate lectiile sunt inregistrate video si disponibile 24/7. Poti incepe, pauza si relua oricand. Nu exista termene limita, nu exista sesiuni live obligatorii.',
  },
  {
    q: 'Am nevoie de un abonament la platformele prezentate?',
    a: 'Unele platforme (KIE.AI, Nano Banana Pro, Google Veo 3.1) ofera planuri gratuite sau perioade de proba. In curs iti aratam exact ce plan ai nevoie si cum sa minimizezi costurile la inceput.',
  },
  {
    q: 'Exista suport daca am intrebari?',
    a: 'Da. Ai acces la o comunitate privata de cursanti unde poti pune intrebari, impartasi rezultatele si primi feedback. Incercam sa raspundem la toate intrebarile in maxim 24 de ore.',
  },
]

export function FaqSection() {
  return (
    <section className="py-24 bg-white" id="faq">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="grid md:grid-cols-[280px_1fr] gap-16">
          <div>
            <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-4">
              FAQ
            </span>
            <h2 className="text-3xl font-bold leading-tight">
              Intrebari{' '}
              <span className="text-primary">frecvente</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Nu gasesti raspunsul? Contacteaza-ne pe{' '}
              <a href="/contact" className="text-primary underline underline-offset-2 hover:opacity-80">
                pagina de contact
              </a>
              .
            </p>
          </div>

          <Accordion openMultiple>
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={String(i)}
                className="border-b border-border last:border-0"
              >
                <AccordionTrigger className="py-5 text-left font-semibold text-base pr-2">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="pb-5 text-muted-foreground leading-relaxed">{faq.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
