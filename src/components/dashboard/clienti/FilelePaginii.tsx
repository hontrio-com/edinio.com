import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CELE TREI FILE ALE PAGINII DE CLIENTI                         (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Toți clienții · Segmente · Importuri. **Fara intrare noua in meniu** — cerut
 * anume: segmentele si importurile sunt despre clienti, nu langa ei.
 *
 * ⚠ FILA STA IN ADRESA, spre deosebire de filele din fisa clientului, care stau
 * in stare. Deosebirea nu e de gust: fila paginii e un loc in care te afli si pe
 * care il poti trimite cuiva („uita-te in Segmente”), iar „inapoi” din browser
 * trebuie sa te scoata de acolo. Fila din fisa e o alegere de-o clipa inauntrul
 * unei ferestre deschise; pusa in adresa, ar fi umplut istoricul browserului.
 *
 * ⚠ LEGATURI, NU BUTOANE. Fiecare fila e o pagina care se poate deschide intr-un
 * tab nou, se poate pune la favorite si se randeaza pe server. Facute butoane cu
 * `onClick`, toata pagina ar fi trebuit sa devina componenta de client.
 *
 * ⚠ SCHIMBAREA FILEI NU CARA FILTRELE LISTEI. `?q=ana&page=3` n-au niciun inteles
 * in „Importuri”, iar intoarcerea pe „Toti clientii” cu ele lipite ar fi aratat o
 * lista filtrata fara ca bara de filtre sa fie de fata ca sa spuna de ce.
 */

export const FILELE = [
  { cheie: "clienti", eticheta: "Toți clienții" },
  { cheie: "segmente", eticheta: "Segmente" },
  { cheie: "importuri", eticheta: "Importuri" },
] as const;

export type FilaPaginii = (typeof FILELE)[number]["cheie"];

export function filaValida(v: string | null | undefined): FilaPaginii {
  return FILELE.some((f) => f.cheie === v) ? (v as FilaPaginii) : "clienti";
}

export function FilelePaginii({ activa }: { activa: FilaPaginii }) {
  return (
    <div className="mb-5 flex gap-1 border-b border-border" role="tablist">
      {FILELE.map((f) => {
        const aici = f.cheie === activa;
        return (
          <Link
            key={f.cheie}
            href={f.cheie === "clienti" ? "/dashboard/customers" : `/dashboard/customers?fila=${f.cheie}`}
            role="tab"
            aria-selected={aici}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
              aici
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {f.eticheta}
          </Link>
        );
      })}
    </div>
  );
}
