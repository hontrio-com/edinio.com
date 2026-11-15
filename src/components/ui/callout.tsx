import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/*
  ═══════════════════════════════════════════════════════════════════════════
  NOTIFICAREA DIN PANOU: FORMA „DE FĂCUT”                         (15.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Aleasa de proprietar din a doua runda de variante („Imi place A”), dupa lista
  „De facut” din panourile Stripe si Shopify: carte alba, iconita intr-o placuta
  cu chenar, titlul, textul si butonul chiar pe rand.

  ⚠ CULOAREA STARII STA NUMAI IN ICONITA. Forma de dinainte avea fond colorat
  translucid si chenar in culoarea starii (`bg-warning/5`), iar el a spus despre
  ea „nu prea imi plac”; vezi si memoria `design-fara-vibe-code`. Tonul (`variant`)
  ramane, si alege culoarea si iconita implicita.

  ⚠ O SINGURA COMPONENTA, ~190 de folosiri in 50 de fisiere: schimbata aici, se
  schimba peste tot. Cand o pagina are mai multe notificari una sub alta, ele intra
  intr-un `GrupCallout` (o singura carte, cu antet si randuri despartite de linii),
  ca lista „De facut” din varianta aleasa.
*/

const calloutVariants = cva(
  "flex flex-wrap items-start rounded-xl border border-border bg-card text-sm shadow-xs",
  {
    variants: {
      /* Tonul nu mai coloreaza cartea: alege doar iconita (vezi `TON`). */
      variant: {
        success: "",
        warning: "",
        danger: "",
        info: "",
        neutral: "",
      },
      /* `mic`: pentru locurile inguste (bara editorului, ferestrele laterale). */
      marime: {
        normal: "gap-x-4 gap-y-3 px-4 py-3.5",
        mic: "gap-x-3 gap-y-2 px-3 py-2.5",
      },
    },
    defaultVariants: {
      variant: "info",
      marime: "normal",
    },
  }
)

type TonCallout = NonNullable<VariantProps<typeof calloutVariants>["variant"]>

/** Culoarea iconitei si iconita folosita cand pagina nu da una. */
const TON: Record<TonCallout, { culoare: string; Icon: LucideIcon }> = {
  success: { culoare: "text-success", Icon: CheckCircle2 },
  warning: { culoare: "text-warning", Icon: AlertTriangle },
  danger: { culoare: "text-destructive", Icon: XCircle },
  info: { culoare: "text-info", Icon: Info },
  neutral: { culoare: "text-muted-foreground", Icon: Info },
}

function Callout({
  variant = "info",
  marime = "normal",
  icon,
  title,
  action,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof calloutVariants> & {
    icon?: LucideIcon
    title?: React.ReactNode
    action?: React.ReactNode
  }) {
  const v = variant ?? "info"
  const mic = marime === "mic"
  /* ⚠ Placuta e mereu acolo, si fara `icon`: 25 de notificari din panou nu dau una, iar
     un rand fara placuta n-ar mai fi aliniat cu vecinii lui din acelasi grup. */
  const Icon = icon ?? TON[v].Icon
  return (
    <div
      data-slot="callout"
      data-variant={v}
      className={cn(calloutVariants({ variant, marime }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center border border-border bg-background",
          mic ? "h-7 w-7 rounded-md" : "h-9 w-9 rounded-lg",
        )}
      >
        <Icon className={cn(mic ? "h-3.5 w-3.5" : "h-4 w-4", TON[v].culoare)} />
      </span>
      {/* ⚠ `pt-2` / `pt-1.5`: primul rand de text sta pe mijlocul placutei (36 px fata de un rand de
          20 px), iar urmatoarele curg dedesubt. Centrata pe tot blocul, placuta ar fi ajuns la
          jumatatea unei notificari lungi. */}
      <div className={cn("min-w-0 flex-1", mic ? "pt-1" : "pt-2")}>
        {title && <p className="font-medium leading-5 text-foreground">{title}</p>}
        {children && (
          <div className={cn("leading-relaxed text-muted-foreground", title && "mt-0.5 text-xs")}>
            {children}
          </div>
        )}
      </div>
      {/* ⚠ Pe telefon butonul coboara pe randul lui, sub text (`basis-full`, aliniat cu textul). Pus
          alaturi, ca pe ecranul lat, strangea titlul intr-o coloana de un cuvant pe rand (vazut pe
          15.11.2026 la „3 oferte nu asculta de comutatoarele de mai sus”, eMAG pe 390 px). */}
      {action && (
        <div className={cn("shrink-0 max-sm:basis-full", mic ? "max-sm:pl-10" : "max-sm:pl-[3.25rem] sm:pt-1")}>
          {action}
        </div>
      )}
    </div>
  )
}

/**
 * Mai multe notificari ale aceleiasi pagini, intr-o singura carte: antet (titlu, o propozitie si,
 * optional, cate sunt) si randuri despartite de linii. E lista „De facut” din varianta aleasa.
 *
 * ⚠ Copiii sunt `Callout`-uri obisnuite, puse conditionat (`{cond && <Callout …/>}`): cele lipsa nu se
 * numara, iar fara niciunul grupul nu se arata deloc. Randurile isi pierd chenarul si umbra prin
 * selectorii de mai jos, fara context React, deci merge si pe server.
 */
function GrupCallout({
  titlu,
  descriere,
  numar,
  className,
  children,
}: {
  titlu?: React.ReactNode
  descriere?: React.ReactNode
  /** Textul din dreapta antetului, dupa cate notificari se vad (de exemplu „3 de rezolvat”). */
  numar?: (cate: number) => React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const randuri = React.Children.toArray(children)
  if (randuri.length === 0) return null
  return (
    <section
      data-slot="callout-grup"
      className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}
    >
      {(titlu || descriere || numar) && (
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {titlu && <h3 className="text-sm font-semibold text-foreground">{titlu}</h3>}
            {descriere && <p className="mt-0.5 text-xs text-muted-foreground">{descriere}</p>}
          </div>
          {numar && <span className="text-xs tabular-nums text-muted-foreground">{numar(randuri.length)}</span>}
        </header>
      )}
      {/* ⚠ `border-0` pe randuri, apoi linia de sus inapoi pe toate in afara de primul: `divide-y` ar fi
          pierdut, fiindca selectorul lui (`:where`) e mai slab decat `border-0` de aici. */}
      <div className="[&>[data-slot=callout]]:rounded-none [&>[data-slot=callout]]:border-0 [&>[data-slot=callout]]:px-5 [&>[data-slot=callout]]:py-4 [&>[data-slot=callout]]:shadow-none [&>[data-slot=callout]:not(:first-child)]:border-t">
        {randuri}
      </div>
    </section>
  )
}

export { Callout, GrupCallout, calloutVariants }
