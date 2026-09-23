import type { TonEticheta } from "@/components/ui/eticheta-stare";

/**
 * Plata unei comenzi, spusa cumparatorului.
 *
 * ⚠⚠ CE NU SE FACE: nu se citeste `payment_status` singur. La ramburs, curierul ia
 * banii la usa si nimeni nu intoarce campul: pe productie, 112 comenzi ramburs
 * `delivered` + `unpaid` SUNT incasate. Adevarul e `incasata`, adica
 * `public.comanda_incasata`, aceeasi regula ca in panou. Starea bruta se foloseste
 * numai ca sa se poata spune „suma a fost returnata".
 *
 * ⚠ Si nici „nu ai platit" la o comanda anulata: pe productie exista o comanda
 * Netopia platita SI anulata, unde `incasata` iese `false` fiindca e anulata, desi
 * banii au intrat. Acolo omul afla ca rambursarea o face magazinul.
 */

export const METODE_RAMBURS = new Set(["cash_on_delivery", "cod", "ramburs"]);

/**
 * Numele metodei, fara furnizor: omului ii pasa ca a platit cu cardul, nu prin
 * cine. O valoare necunoscuta NU cade pe ramburs (cum face emailul catre client),
 * ci pe un nume neutru: altfel un transfer bancar ar fi fost numit ramburs.
 */
const ETICHETE: Record<string, string> = {
  cash_on_delivery: "Ramburs la livrare",
  cod: "Ramburs la livrare",
  ramburs: "Ramburs la livrare",
  netopia: "Card online",
  stripe: "Card online",
  ipay: "Card online",
  card: "Card online",
  revolut: "Revolut Pay",
  klarna: "Klarna",
  bank_transfer: "Transfer bancar",
};

export function numeleMetodei(metoda: string | null | undefined): string | null {
  if (!metoda) return null;
  return ETICHETE[metoda] ?? "Alta metoda de plata";
}

export type StareaPlatii = { text: string; ton: TonEticheta };

export function stareaPlatii(p: {
  stare: string;
  incasata: boolean;
  metoda: string | null;
  /** `orders.payment_status`, NULL la vederea redusa. */
  starePlata: string | null;
}): StareaPlatii {
  const ramburs = p.metoda !== null && METODE_RAMBURS.has(p.metoda);

  if (p.starePlata === "refunded") return { text: "Suma a fost returnata", ton: "neutru" };

  if (p.stare === "cancelled") {
    return p.starePlata === "paid"
      ? { text: "Comanda anulata. Rambursarea o face magazinul", ton: "neutru" }
      : { text: "Comanda anulata, nu s-a incasat nimic", ton: "neutru" };
  }
  if (p.stare === "refunded") return { text: "Comanda rambursata", ton: "neutru" };

  if (p.incasata) return { text: ramburs ? "Achitata la livrare" : "Platita", ton: "bun" };
  if (ramburs) return { text: "Se plateste la livrare", ton: "asteptare" };
  /* Vederea redusa nu stie metoda; nu spune mai mult decat stie. */
  if (p.metoda === null) return { text: "Neincasata inca", ton: "asteptare" };
  return { text: "Plata nu a fost finalizata", ton: "asteptare" };
}
