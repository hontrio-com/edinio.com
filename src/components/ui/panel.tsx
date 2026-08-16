import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Standard dashboard surface: `rounded-xl border border-border bg-surface`.
 * Consolidates the card chrome that was hand-written across ~40 dashboard
 * files, so radius/border/elevation live in one place.
 *
 * ═══ DOUA FELURI DE PANOU, SI SE ALEG DUPA CE E INAUNTRU ═══
 *
 * **Fara `title`** — panou simplu. Padding-ul ramane al apelantului
 * (`className="space-y-4 p-4"`), fiindca panoul cu antet flush il vrea ZERO.
 *
 * **Cu `title`** — sectiune de formular, cum sunt toate paginile de curieri:
 * antetul se randeaza INAUNTRU, iar panoul isi ia singur `space-y-4 p-4`, ca sa
 * nu mai depinda de tinerea de minte a apelantului. `step` adauga bulina
 * numerotata a pasului, pentru panourile care chiar sunt pasi de configurare;
 * pentru cele informative sau de citit (facturi, diagnostic) se lasa nepusa.
 *
 * ⚠ DE CE `title` E DECLARAT AICI, SI NU LASAT SA CADA PRIN `...props`.
 *
 * `React.ComponentProps<"div">` cuprinde deja `title?: string`, atributul HTML
 * de tooltip. Cat timp panoul doar imprastia proprietatile pe `div`, sase
 * pagini de curieri scrise cu `<Panel title="Conectare">` — 39 de panouri, de
 * la Packeta pana la DHL — se randau FARA niciun titlu pe ecran (doar tooltip
 * la hover), fara padding si fara spatiere: totul lipit de chenar si intre el.
 * tsc n-avea ce sa spuna, fiindca `title="Conectare"` e un `div` perfect valid.
 *
 * De aceea `title` e scos din `ComponentProps` cu `Omit` si tratat ca antet:
 * aceeasi scriere care inainte disparea tacut acum randeaza corect, si nimeni
 * nu mai poate pierde titlul din greseala.
 */
function Panel({
  className,
  title,
  step,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  /** Antetul sectiunii. Prezent = panoul isi ia singur `space-y-4 p-4`. */
  title?: React.ReactNode
  /** Numarul pasului, in bulina colorata. Doar pentru pasi de configurare. */
  step?: number
}) {
  return (
    <div
      data-slot="panel"
      className={cn(
        "rounded-xl border border-border bg-surface",
        title != null && "space-y-4 p-4",
        className
      )}
      {...props}
    >
      {title != null && (
        <div className="flex items-center gap-2">
          {step != null && (
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {step}
            </span>
          )}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      )}
      {children}
    </div>
  )
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-5 py-4",
        className
      )}
      {...props}
    />
  )
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

export { Panel, PanelHeader, PanelTitle }
