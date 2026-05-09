'use client'

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Clock } from 'lucide-react'

const lessons = [
  {
    number: '01',
    title: 'Introducere',
    duration: '5 min',
    description:
      'Descoperi ce vei crea, ce instrumente vei folosi si ce rezultate poti obtine la finalul cursului. O privire de ansamblu care iti da directie clara.',
  },
  {
    number: '02',
    title: 'Cu ce lucram?',
    duration: '15 min',
    description:
      'Prezentare completa a ecosistemului de unelte AI: ce face fiecare platforma, cum se conecteaza intre ele si de ce le-am ales pe acestea.',
  },
  {
    number: '03',
    title: 'Platforma KIE.AI',
    duration: '20 min',
    description:
      'Ghid complet de utilizare a platformei KIE.AI. Configurezi contul, inveti interfata si faci primele generari de continut AI ghidat pas cu pas.',
  },
  {
    number: '04',
    title: 'Creare avatar',
    duration: '25 min',
    description:
      'Creezi primul tau avatar AI personalizat. De la upload-ul imaginii sursa, la ajustari fine pentru un rezultat cat mai natural si profesional.',
  },
  {
    number: '05',
    title: 'Creare scene cu Nano Banana Pro',
    duration: '30 min',
    description:
      'Inveti sa folosesti Nano Banana Pro pentru generarea de scene video de calitate cinematografica. Prompturi, setari si trucuri care fac diferenta.',
  },
  {
    number: '06',
    title: 'Creare videoclipuri cu Google Veo 3.1',
    duration: '35 min',
    description:
      'Google Veo 3.1 este cel mai avansat model de generare video disponibil. Inveti sa il folosesti la potential maxim, de la prompturi simple la scene complexe.',
  },
  {
    number: '07',
    title: 'Final',
    duration: '10 min',
    description:
      'Combini tot ce ai invatat pentru a produce un videoclip complet, de la concept la publicare. Primesti acces la resursele bonus si urmatoarele pasi.',
  },
]

export function CurriculumSection() {
  return (
    <section className="py-24 bg-white" id="curriculum">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold tracking-widest text-primary uppercase mb-4">
            Curriculum
          </span>
          <h2 className="text-4xl font-bold">
            Curriculum <span className="text-primary">complet</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
            7 lectii structurate logic, de la zero la un proiect video real gata de publicat.
          </p>
        </div>

        <Accordion openMultiple defaultValue={['01']}>
          {lessons.map((lesson) => (
            <AccordionItem
              key={lesson.number}
              value={lesson.number}
              className="border border-border rounded-xl mb-3 overflow-hidden"
            >
              <AccordionTrigger className="px-5 py-4 text-base font-medium [&:hover]:no-underline">
                <div className="flex items-center gap-4 flex-1 pr-2">
                  <span className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                    {lesson.number}
                  </span>
                  <span className="flex-1 text-left font-semibold">{lesson.title}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 mr-1">
                    <Clock className="size-3" />
                    {lesson.duration}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5">
                <p className="pl-13 pb-4 text-muted-foreground leading-relaxed">
                  {lesson.description}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
