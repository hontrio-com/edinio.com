import Image from "next/image";
import { Package } from "lucide-react";

/**
 * Poza unui produs din catalog, in patratul de 40px de pe linia unei comenzi din panou, sau
 * patratul cu pictograma cand produsul n-are poza (sters, extraoptiune, linie de marketplace
 * nelegata), ca numele sa ramana aliniate.
 *
 * ⚠ Sta in fisierul ei, nu in `OrderDetailClient`. Acolo FISIERELE DE PERSONALIZARE se arata cu
 * `<img>`, pe ruta care cere sesiunea comerciantului, iar `panou-fisiere.test.ts` tine optimizatorul
 * afara din fisierul acela. Poza de catalog e publica: trece prin loaderul proiectului si cere
 * variantele de 64 si 128, aceleasi ca lista de produse, deci de obicei deja taiate.
 *
 * `alt` gol: numele produsului e chiar alaturi, iar un cititor de ecran l-ar spune de doua ori.
 */
export function MiniaturaProdus({ poza }: { poza: string | null }) {
  if (!poza) {
    return (
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-muted">
        <Package className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }
  return (
    <Image src={poza} alt="" width={40} height={40}
      className="h-10 w-10 flex-shrink-0 rounded-lg border border-border bg-muted object-cover" />
  );
}
