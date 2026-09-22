import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠⚠ DE CE UN CAMP DE PAROLA PORNESTE CU `autoComplete="new-password"`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aratat de el pe captura, 22.09.2026, pe `/dashboard/features/ecolet`: intrand
 * pe pagina, Chrome scria singur emailul contului in CAUTAREA din capul
 * panoului si parola salvata in campul „Token".
 *
 * Nu era o setare a lui. Managerul de parole cauta in pagina un camp
 * `type="password"`, il ia drept camp de autentificare, si atunci completeaza si
 * „utilizatorul": primul camp de text de dinaintea lui. In panou, acela e bara
 * de cautare din antet, care e pe fiecare pagina.
 *
 * ⚠ `autoComplete="off"` NU ajuta: Chrome il ignora dinadins pe campurile de
 * parola, tocmai fiindca site-urile il puneau ca sa impiedice managerele de
 * parole. `new-password` e singura valoare pe care o asculta: ii spune „aici se
 * SCRIE un secret nou", deci nu completeaza nimic si nu mai cauta un utilizator.
 *
 * ⚠ E un IMPLICIT, nu o impunere: `{...props}` vine dupa, deci orice camp care
 * chiar vrea autocompletare si-o cere. Paginile de autentificare fac deja asta,
 * toate: `/login` cere `current-password`, iar `/register` si
 * `/reset-password` cer `new-password`. Deci niciuna nu se schimba.
 *
 * Perechea acestei reguli sta in `CautareGlobala`, pe cealalta jumatate a
 * defectului: bara de cautare cere si ea `autoComplete="off"`.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      autoComplete={type === "password" ? "new-password" : undefined}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
