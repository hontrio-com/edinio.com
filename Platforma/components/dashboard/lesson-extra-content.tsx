import Link from 'next/link'
import { ExternalLink, Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  sortOrder: number
  courseSlug: string
}

const tools = [
  {
    name: 'Nano Banana Pro',
    emoji: '🍌',
    bg: 'bg-yellow-50 border-yellow-100',
    badge: 'bg-yellow-100 text-yellow-700',
    description:
      'Platformă AI specializată în crearea de scene și videoclipuri animate. Ideal pentru conținut dinamic cu avatare și personaje generate artificial.',
    access: 'Accesezi direct din browser, fără instalare. Contul gratuit include credite lunare.',
    url: 'https://nanobanana.ai',
  },
  {
    name: 'Kling AI',
    emoji: '🎬',
    bg: 'bg-purple-50 border-purple-100',
    badge: 'bg-purple-100 text-purple-700',
    description:
      'Unul dintre cele mai avansate modele de generare video prin AI — creează clipuri ultra-realiste din text sau imagini, cu mișcări naturale.',
    access: 'Disponibil pe web. Versiunea gratuită permite câteva generări pe zi.',
    url: 'https://klingai.com',
  },
  {
    name: 'Google VEO 3.1',
    emoji: '🎥',
    bg: 'bg-blue-50 border-blue-100',
    badge: 'bg-blue-100 text-blue-700',
    description:
      'Cel mai nou model video de la Google — generează videoclipuri cinematografice de înaltă calitate, cu sunet și detalii remarcabile.',
    access: 'Accesibil prin Google AI Studio sau Vertex AI. Disponibil pentru utilizatori cu cont Google.',
    url: 'https://kie.ai',
  },
]

export function LessonExtraContent({ sortOrder, courseSlug }: Props) {
  // Lecția 2 — Tool cards
  if (sortOrder === 2) {
    return (
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Instrumentele cursului
        </h2>
        <div className="grid gap-3 sm:grid-cols-1">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className={cn('rounded-xl border p-4 sm:p-5 space-y-3', tool.bg)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{tool.emoji}</span>
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', tool.badge)}>
                  {tool.name}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{tool.description}</p>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Cum accesezi:</p>
                <p className="text-sm text-foreground/70 leading-relaxed">{tool.access}</p>
              </div>
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'gap-1.5 text-xs h-8'
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Deschide {tool.name}
              </a>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Lecția 3 — KIE.AI link
  if (sortOrder === 3) {
    return (
      <div className="pt-2">
        <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <span className="text-sm font-semibold text-violet-700">KIE.AI</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            KIE.AI este platforma centrală pe care o folosim în acest curs pentru a genera și gestiona avatarele AI.
            Interfața este intuitivă și îți permite să creezi avatare realiste în câteva minute.
          </p>
          <a
            href="https://kie.ai"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 text-xs h-8')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Deschide KIE.AI
          </a>
        </div>
      </div>
    )
  }

  // Lecția 7 — Link avatare
  if (sortOrder === 7) {
    return (
      <div className="pt-2">
        <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">Colecție avatare AI</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Ți-am pregătit o selecție de avatare AI gata de descărcat și utilizat imediat în proiectele tale — fără să fie nevoie să le creezi de la zero.
          </p>
          <Link
            href="/dashboard/avatare"
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 text-xs h-8')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Vezi avatarele AI
          </Link>
        </div>
      </div>
    )
  }

  return null
}
