"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Package, RefreshCw } from "lucide-react";

type Rezultat = { active: number; inactive: number; loturi?: number } | { error: string };

/**
 * Butonul „Sincronizeaza catalogul”, comun pentru Mailchimp, Brevo si Klaviyo.
 *
 * ⚠ Pana pe 18.09.2026 nu exista: cand comerciantul pornea sincronizarea e-commerce, produsele
 * existente nu plecau nicaieri. Acum pleaca singure la pornire, iar butonul le retrimite oricand
 * (de exemplu dupa un import mare). Retrimiterea e sigura: la toti trei e „creeaza sau actualizeaza”.
 */
export function SincronizareCatalogEmail({
  furnizor,
  pornita,
  sincronizeaza,
}: {
  furnizor: string;
  /** Sincronizarea e-commerce e pornita SI salvata. */
  pornita: boolean;
  sincronizeaza: () => Promise<Rezultat>;
}) {
  const [lucreaza, porneste] = useTransition();

  function trimite() {
    porneste(async () => {
      let res: Rezultat;
      try {
        res = await sincronizeaza();
      } catch {
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a trimis catalogul. "
          + "Poti incerca din nou linistit: trimiterea doar creeaza sau actualizeaza produse.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error, { duration: 12000 }); return; }
      toast.success(
        `Catalog trimis in ${furnizor}: ${res.active} produse active`
        + (res.inactive ? `, ${res.inactive} scoase din vanzare` : "")
        + ". Apar in contul lor dupa ce le prelucreaza.",
      );
    });
  }

  return (
    <div className="p-4 rounded-xl border border-border">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Package className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Sincronizeaza catalogul</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Trimite in {furnizor} toate produsele magazinului, cu link, pret si imagine, pentru recomandarile de produs din emailuri.
            Produsele scoase din vanzare nu mai apar in recomandari. Pleaca singur cand pornesti sincronizarea e-commerce; aici il retrimiti oricand.
          </p>
          <button type="button" onClick={trimite} disabled={lucreaza || !pornita}
            className="mt-2.5 inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50">
            {lucreaza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizeaza catalogul
          </button>
          {!pornita && <p className="text-[11px] text-amber-600 mt-1.5">Porneste si salveaza sincronizarea e-commerce intai.</p>}
        </div>
      </div>
    </div>
  );
}
