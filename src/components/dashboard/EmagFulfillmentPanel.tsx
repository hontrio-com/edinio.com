"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Truck } from "lucide-react";
import { EmagAwbModal } from "./EmagAwbModal";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

/**
 * Expedierea unei comenzi eMAG.
 *
 * ═══ ⚠ NU INLOCUIESTE CURIERII MAGAZINULUI, STA DEASUPRA LOR ═══
 *
 * La Trendyol, panoul lor ia locul celui obisnuit, fiindca acolo transportul e al
 * marketplace-ului si comerciantul n-are ce alege.
 *
 * eMAG ingaduie AMANDOUA: ori emiti AWB prin contul lor de curier, ori expediezi cu
 * curierul tau si le trimiti numarul. Iar alegerea nu e a noastra — depinde de
 * contracte, de preturi si de ce curier ajunge in localitatea clientului.
 *
 * Deci se arata cartea eMAG, si dedesubt raman toti curierii magazinului. Pusa in
 * locul lor, un comerciant cu contract propriu mai bun ar fi fost silit sa plateasca
 * transportul lor — sau sa iasa din Edinio ca sa-si emita AWB-ul.
 */
export function EmagFulfillmentPanel({
  businessId, order,
}: {
  businessId: string;
  order: Order;
}) {
  const [deschis, setDeschis] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Expediere prin eMAG</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Poți emite AWB pe contul de curier din eMAG, sau poți expedia cu curierul tău
            de mai jos — eMAG le acceptă pe amândouă.
          </p>
          <button
            type="button"
            onClick={() => setDeschis(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 transition-colors"
          >
            <Package className="h-4 w-4" />
            Emite AWB prin eMAG
          </button>
        </div>
      </div>

      {/* ⚠ Se monteaza abia la deschidere, nu se ascunde. Asa, cand omul il deschide
          a doua oara, starea porneste curata si `pregatireAwbEmag` se cere din nou —
          iar intre timp AWB-ul poate sa fi fost emis din alta parte. Tinut montat, ar
          fi aratat ce a citit prima data. */}
      {deschis && <EmagAwbModal
        onClose={() => setDeschis(false)}
        order={order}
        businessId={businessId}
        onSuccess={() => {
          setDeschis(false);
          router.refresh();
        }}
      />}
    </>
  );
}
