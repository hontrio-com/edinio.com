"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updatePageContent } from "@/lib/actions/store.actions";

/**
 * Fila „Catalog" din Setari: ce produse si ce categorii apar in magazin.
 *
 * Pana la 24.10.2026 cele trei comutatoare stateau in „Editeaza magazinul",
 * printre sectiunile paginii principale, desi nu tin de design: hotarasc ce vede
 * clientul pe ORICE pagina cu produse. Cheile au ramas in `page_content`.
 *
 * ⚠ Se trimit DOAR cheile de mai jos. `updatePageContent` imbina pe chei de prim
 * nivel, deci o cheie in plus, dintr-o copie facuta la deschiderea paginii, ar
 * scrie peste ce a schimbat intre timp alt ecran.
 *
 * Textele sunt ale PANOULUI, deci cu diacritice.
 */

export type VizibilitateCatalog = {
  hide_products_without_images: boolean;
  hide_out_of_stock_products: boolean;
  show_empty_categories: boolean;
};

const RANDURI: { cheie: keyof VizibilitateCatalog; titlu: string; ajutor: string }[] = [
  {
    cheie: "hide_products_without_images",
    titlu: "Ascunde produsele fără imagini",
    ajutor: "Produsele fără nicio imagine nu mai apar în listele magazinului. Rămân accesibile prin link direct. Util după un import, până adaugi pozele.",
  },
  {
    cheie: "hide_out_of_stock_products",
    titlu: "Ascunde produsele fără stoc",
    ajutor: "Produsele cu stocul epuizat nu mai apar în listele magazinului. Rămân accesibile prin link direct.",
  },
  {
    cheie: "show_empty_categories",
    titlu: "Arată și categoriile goale",
    ajutor: "Categoriile fără produse apar oricum în meniuri și în banda de categorii. Cele ascunse din Produse > Categorii nu apar în niciun caz.",
  },
];

export function CatalogSetari({ businessId, initial }: { businessId: string; initial: VizibilitateCatalog }) {
  const [valori, setValori] = useState(initial);
  const [salveaza, startSalvare] = useTransition();

  function salveazaCatalogul() {
    const trimis: VizibilitateCatalog = {
      hide_products_without_images: valori.hide_products_without_images,
      hide_out_of_stock_products: valori.hide_out_of_stock_products,
      show_empty_categories: valori.show_empty_categories,
    };
    startSalvare(async () => {
      let rezultat: Awaited<ReturnType<typeof updatePageContent>>;
      try {
        rezultat = await updatePageContent(businessId, trimis);
      } catch {
        /* ⚠ Nu stim daca scrierea a apucat sa ajunga in baza. Mesajul spune doar atat. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă setările s-au salvat. "
          + "Reîncarcă pagina și uită-te la valorile de pe ecran înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in rezultat) toast.error(rezultat.error);
      else toast.success("Setările catalogului au fost salvate.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Ce apare în magazin</p>
          <p className="text-xs text-muted-foreground mt-0.5">Se aplică pe toate paginile cu produse: pagina principală, catalogul, categoriile și căutarea.</p>
        </div>
        <div className="px-5 py-5 space-y-3">
          {RANDURI.map(({ cheie, titlu, ajutor }) => (
            <div key={cheie} className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{titlu}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{ajutor}</p>
              </div>
              <Switch checked={valori[cheie]} aria-label={titlu}
                onCheckedChange={(v) => setValori((p) => ({ ...p, [cheie]: v }))}
                className="shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={salveazaCatalogul} disabled={salveaza}>
        {salveaza ? <Loader2 className="animate-spin" /> : <Save />}
        {salveaza ? "Se salvează..." : "Salvează"}
      </Button>
    </div>
  );
}
