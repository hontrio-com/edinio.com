import { randuriDeBani } from "@/lib/email/order-totals";
import type { SetariTvaMagazin } from "@/lib/orders/totals-box";
import { formatPrice } from "@/lib/utils/format";
import type { DetaliuComanda } from "./comenzi";

/**
 * Randurile de bani de pe ecranul unei comenzi din cont.
 *
 * ⚠⚠ DE CE EXISTA. Ecranul isi facea singur socoteala: suma liniilor, transportul,
 * reducerea de cupon si taxa de ramburs, iar restul pana la total pe un rand
 * „Alte ajustari”. Coloana se aduna, dar banii erau fara nume. Masurat pe
 * PRODUCTIE, 23.09.2026: din 344 de comenzi de vitrina, 41 ar fi aratat „Alte
 * ajustari", dintre care 38 erau reducerea pentru plata cu cardul. Acelasi om
 * primise emailul de confirmare cu „Reducere plata cu cardul”.
 *
 * Deci randurile vin din `randuriDeBani`, CHIAR functia emailului, care la randul
 * ei cheama `totaluriComanda`, modulul casetei din panou. Trei suprafete care
 * arata aceeasi comanda arata acum aceleasi randuri.
 *
 * ⚠ „Subtotal” si „Optiuni extra” se sar, ca in emailul clientului: liniile sunt
 * deja insirate deasupra, cu extraoptiunile printre ele. In locul lor sta un
 * singur rand, „Produse”, care e SUMA LINIILOR ARATATE, nu `orders.subtotal`
 * (pe demo 19 comenzi din 498 au linii care nu dau subtotalul).
 *
 * ⚠ Ce nu se explica din randuri ramane VAZUT, pe randul lui. Pe productie sunt
 * doua asemenea comenzi (Medclean, 9 iunie, cu TVA-ul adunat de doua ori in
 * total); un rand de umplutura ascuns ar fi facut coloana sa minta.
 */

export type RandDeBaniDinCont = { eticheta: string; valoare: string };

/** Ce ii trebuie socotelii din detaliul comenzii. */
export type BaniDinCont = Pick<
  DetaliuComanda,
  | "vedere" | "linii" | "total" | "subtotal" | "transport" | "reducere" | "taxaRamburs"
  | "reducereCard" | "reducereRamburs" | "codReducere" | "tva" | "cotaTva" | "regimTva"
>;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function randurileDeBani(c: BaniDinCont, magazin: SetariTvaMagazin): RandDeBaniDinCont[] {
  const produse = round2(c.linii.reduce((s, l) => s + l.pret * l.cantitate, 0));
  const randuri: { eticheta: string; valoare: string; contributie: number }[] = [
    { eticheta: "Produse", valoare: formatPrice(produse), contributie: produse },
  ];

  /*
    ⚠ Vederea REDUSA nu primeste defalcarea: baza intoarce acolo NULL pe toate
    campurile de bani, iar un rand „Transport 0 lei” facut din NULL ar fi fost o
    minciuna. Ramane suma liniilor, iar diferenta pana la total are un nume care
    spune exact ce e in ea, fara sa spuna cat e fiecare.
  */
  if (c.vedere === "intreaga") {
    for (const r of randuriDeBani({
      items: c.linii.map((l) => ({ product_id: l.produsId ?? "", name: l.nume, quantity: l.cantitate, price: l.pret })),
      subtotal: c.subtotal ?? 0,
      shipping_cost: c.transport ?? 0,
      discount_code: c.codReducere,
      discount_amount: c.reducere ?? 0,
      card_discount_amount: c.reducereCard ?? 0,
      cod_discount_amount: c.reducereRamburs ?? 0,
      cod_fee_amount: c.taxaRamburs ?? 0,
      vat_amount: c.tva ?? 0,
      vat_rate: c.cotaTva ?? 0,
      vat_enabled: magazin.vat_enabled,
      /*
        ⚠⚠ REGIMUL INGHETAT BATE SETAREA DE AZI, ca in `invoiceVat`. `randuriDeBani`
        il trece mai departe si ca regim inghetat, si ca setare. Fara asta, un magazin trecut intre timp pe „preturi cu TVA”
        si-ar fi vazut comenzile vechi cu TVA-ul scris „inclus”, desi fusese
        adunat peste pret.
      */
      prices_include_vat: c.regimTva ?? magazin.prices_include_vat,
      total: c.total,
    })) {
      if (r.cheie === "subtotal" || r.cheie === "extras") continue;
      randuri.push({ eticheta: r.eticheta, valoare: r.valoare, contributie: r.contributie });
    }
  }

  const rest = round2(c.total - randuri.reduce((s, r) => s + r.contributie, 0));
  if (Math.abs(rest) >= 0.01) {
    randuri.push({
      eticheta: c.vedere === "intreaga" ? "Alte ajustari" : "Transport, taxe si reduceri",
      valoare: `${rest > 0 ? "" : "- "}${formatPrice(Math.abs(rest))}`,
      contributie: rest,
    });
  }

  return randuri.map(({ eticheta, valoare }) => ({ eticheta, valoare }));
}
