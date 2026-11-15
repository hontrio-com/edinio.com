"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        `Catalog trimis în ${furnizor}: ${res.active} produse active`
        + (res.inactive ? `, ${res.inactive} scoase din vânzare` : "")
        + ". Apar în contul lor după ce le prelucrează.",
      );
    });
  }

  /* Sta in sectiunea de sincronizare e-commerce a paginii, sub comutator: de aceea linia de sus. */
  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm font-medium text-foreground">Catalogul de produse</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Trimite în {furnizor} toate produsele magazinului, cu link, preț și imagine, pentru recomandările de produs din emailuri.
        Produsele scoase din vânzare nu mai apar în recomandări. Pleacă singur când pornești sincronizarea e-commerce; aici îl retrimiți oricând.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={trimite} disabled={lucreaza || !pornita}>
        {lucreaza ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Sincronizează catalogul
      </Button>
      {!pornita && <p className="mt-1.5 text-xs text-warning">Pornește și salvează întâi sincronizarea e-commerce.</p>}
    </div>
  );
}
