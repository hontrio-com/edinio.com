import { Lightbulb } from 'lucide-react'

const TIPS = [
  'Practică zilnică de 20 de minute este mai eficientă decât sesiuni rare de 2 ore.',
  'Aplică imediat ce înveți. Creierul reține mai bine informațiile puse în practică.',
  'Explică ce ai învățat altcuiva — una dintre cele mai eficiente metode de consolidare.',
  'Fă pauze scurte la fiecare 45 de minute. Creierul procesează informațiile în repaus.',
  'Setează un obiectiv mic pentru sesiunea de azi. Progresul constant bate efortul rar.',
  'Folosește AI ca partener de învățare — pune întrebări, cere exemple, testează-te.',
  'Revizuiește noțiunile din ziua anterioară înainte de a trece la lecția nouă.',
]

export function DailyTipCard() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  const tip = TIPS[dayOfYear % TIPS.length]

  return (
    <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Lightbulb className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Sfatul zilei</p>
        <p className="text-sm leading-relaxed text-foreground">{tip}</p>
      </div>
    </div>
  )
}
