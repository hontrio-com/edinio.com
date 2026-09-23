import { ReceiptText } from "lucide-react";
import type { FacturaDinCont } from "@/lib/cont/facturi";
import { BlocDocument } from "./BlocDocument";
import { Paginare } from "./Paginare";
import { StareGoala } from "../ui/piese";
import { CARD } from "../ui/clase";

/**
 * Facturile cumparatorului, fiecare cu comanda ei.
 *
 * ⚠ Aici apar NUMAI documentele fiscale adevarate: regula din baza sare peste
 * documentele de TEST ale caselor de facturare si peste comenzile legate doar pe
 * numar. Stornarea sta langa factura pe care o anuleaza.
 */
export function EcranFacturi({
  facturi,
  pagina,
  pagini,
  emailMagazin,
}: {
  facturi: FacturaDinCont[];
  pagina: number;
  pagini: number;
  emailMagazin: string | null;
}) {
  if (facturi.length === 0) {
    return (
      <StareGoala icon={ReceiptText} titlu="Nu ai inca nicio factura">
        Factura unei comenzi apare aici dupa ce magazinul o emite. O gasesti si in pagina comenzii.
      </StareGoala>
    );
  }

  return (
    <>
      <ul className="space-y-4">
        {facturi.map((f) => (
          <li key={f.orderId} className={`${CARD} p-5 sm:p-6`}>
            <BlocDocument
              doc={f.document}
              orderId={f.orderId}
              emailMagazin={emailMagazin}
              comanda={{ numar: f.numarComanda, total: f.totalComanda, firma: f.firma }}
            />
          </li>
        ))}
      </ul>
      <Paginare baza="/cont/facturi" pagina={pagina} pagini={pagini} />
    </>
  );
}
