"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { confirmaReturulPrimit } from "@/lib/actions/retur-primit.actions";
import { asteaptaPrimireaReturului } from "@/lib/curiera/statusuri";
import { BUTON_PLIN, SECTIUNE } from "@/components/dashboard/atomi-panou";
import { cn } from "@/lib/utils/cn";

/**
 * Avertizarea si butonul „Retur primit” de pe pagina unei comenzi (cerut de un magazin, 23.11.2026).
 *
 * Apare numai la o comanda returnata prin Curiera al carei stoc inca n-a fost pus la loc, adica la
 * magazinele care au ales in integrarea Curiera „stocul revine cand confirm ca am primit returul”.
 * La celelalte, stocul s-a eliberat odata cu returul si aici nu se vede nimic.
 */
export function ReturDePrimit({ order }: {
  order: {
    id: string;
    status: string;
    curiera_status_code?: string | null;
    stoc_rezervat?: unknown;
    stoc_eliberat_la?: string | null;
  };
}) {
  const router = useRouter();
  const [inCurs, porneste] = useTransition();

  if (!asteaptaPrimireaReturului(order)) return null;

  function confirma() {
    porneste(async () => {
      let r: Awaited<ReturnType<typeof confirmaReturulPrimit>>;
      try {
        r = await confirmaReturulPrimit(order.id);
      } catch {
        toast.error("Nu am primit răspuns de la server. Reîmprospătează comanda și verifică stocul înainte să încerci din nou.");
        return;
      }
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Returul e confirmat. Stocul comenzii a fost pus la loc.");
      router.refresh();
    });
  }

  return (
    <div className={cn(SECTIUNE, "mb-5 flex flex-wrap items-center gap-3 p-4")}>
      <Undo2 className="h-5 w-5 flex-shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Coletul se întoarce la tine</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Stocul acestei comenzi nu a fost pus la loc. Apasă „Retur primit” când coletul ajunge înapoi, iar produsele revin în stoc.
        </p>
      </div>
      <button
        type="button"
        onClick={confirma}
        disabled={inCurs}
        className={BUTON_PLIN}
      >
        {inCurs ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
        Retur primit
      </button>
    </div>
  );
}
