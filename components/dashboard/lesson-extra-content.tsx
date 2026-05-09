import Link from 'next/link'
import { ExternalLink, Sparkles, Wand2, Clapperboard, Video, Bot } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  sortOrder: number
  courseSlug: string
}

const tools = [
  {
    name: 'Nano Banana',
    Icon: Wand2,
    bg: 'bg-yellow-50 border-yellow-100',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    label: 'bg-yellow-100 text-yellow-700',
    description:
      'Platformă AI specializată în crearea de scene și videoclipuri animate. Ideal pentru conținut dinamic cu avatare și personaje generate artificial.',
    access: 'Accesezi direct din browser, fără instalare. Contul gratuit include credite lunare.',
    url: 'https://gemini.google.com/',
  },
  {
    name: 'Kling AI',
    Icon: Clapperboard,
    bg: 'bg-purple-50 border-purple-100',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    label: 'bg-purple-100 text-purple-700',
    description:
      'Unul dintre cele mai avansate modele de generare video prin AI. Creează clipuri ultra-realiste din text sau imagini, cu mișcări naturale.',
    access: 'Disponibil pe web. Versiunea gratuită permite câteva generări pe zi.',
    url: 'https://kling.ai/app',
  },
  {
    name: 'Google VEO 3',
    Icon: Video,
    bg: 'bg-blue-50 border-blue-100',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    label: 'bg-blue-100 text-blue-700',
    description:
      'Cel mai nou model video de la Google. Generează videoclipuri cinematografice de înaltă calitate, cu sunet și detalii remarcabile.',
    access: 'Accesibil prin Google AI Studio. Disponibil pentru utilizatori cu cont Google.',
    url: 'https://aistudio.google.com/models/veo-3',
  },
]

export function LessonExtraContent({ sortOrder, courseSlug }: Props) {
  if (sortOrder === 2) {
    return (
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Instrumentele cursului
        </h2>
        <div className="grid gap-3">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className={cn('rounded-xl border p-4 sm:p-5 space-y-3', tool.bg)}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', tool.iconBg)}>
                  <tool.Icon className={cn('h-4 w-4', tool.iconColor)} />
                </div>
                <span className="text-sm font-semibold">{tool.name}</span>
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

  if (sortOrder === 3) {
    return (
      <div className="pt-2">
        <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-100 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-violet-600" />
            </div>
            <span className="text-sm font-semibold text-violet-900">KIE.AI</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            KIE.AI este platforma centrala pe care o folosim in acest curs pentru a genera si gestiona avatarele AI.
            Interfata este intuitiva si iti permite sa creezi avatare realiste in cateva minute.
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

  if (sortOrder === 7) {
    return (
      <div className="pt-2">
        <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-sm font-semibold text-amber-900">Colectie avatare AI</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Ti-am pregatit o selectie de avatare AI gata de descarcat si utilizat imediat in proiectele tale, fara sa fie nevoie sa le creezi de la zero.
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
