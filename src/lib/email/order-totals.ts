/**
 * Caseta de totaluri din emailurile de comanda noua.
 *
 * Cele doua emailuri (catre client si catre comerciant) isi insirau fiecare
 * randurile de bani, si niciunul nu dadea totalul:
 *
 *  1. emailul comerciantului scria „Subtotal" din `orders.subtotal`, care NU
 *     contine extraoptiunile, desi le lista deasupra printre produse. Masurat
 *     2026-08-04 in productie: 3 comenzi din 96 au linii `extra_*` (#0018, #0065
 *     si #0073, toate ale magazinului suporti-numar), iar pe #0073 coloana dadea
 *     40 + 20 = 60 sub un Total de 65 — cei 5 lei ai „Comenzii cu Prioritate"
 *     erau in lista si dispareau din socoteala.
 *  2. randul de TVA se aduna in coloana chiar si la magazinele cu preturi CU TVA
 *     inclus, unde `orders.vat_amount` e portiunea EXTRASA din incasare, nu o
 *     suma in plus. Toate cele 21 de comenzi cu `vat_amount > 0` din productie
 *     sunt la magazine cu preturi cu TVA inclus (8 din cele 9 magazine cu TVA
 *     pornit), deci exact ele ar fi iesit umflate: pe #0074, 40 + 20 + 6,94 =
 *     66,94 sub un Total de 60.
 *
 * Socoteala nu se face aici. Vine din `totaluriComanda`, acelasi modul pur si
 * testat pe care il foloseste caseta din panoul comerciantului: doua suprafete
 * care arata aceeasi comanda trebuie sa arate aceleasi randuri, iar pana acum
 * fiecare isi facea propria varianta.
 *
 * Modulul sta separat de `email.ts` ca sa poata fi TESTAT: `email.ts` nu se
 * poate importa dintr-un test, fiindca `@/lib/email` se rezolva pe directorul
 * `src/lib/email/`, iar `@/lib/email.ts` cere `allowImportingTsExtensions`.
 */

import { formatPrice } from "@/lib/utils/format";
import { totaluriComanda } from "@/lib/orders/totals-box";

/** Banii unei comenzi, asa cum ii trimite `order.actions.ts` catre emailuri. */
export interface BaniComanda {
  /** Liniile comenzii CU `product_id`: dupa el se recunosc extraoptiunile. */
  items: { product_id: string; name: string; quantity: number; price: number }[];
  subtotal: number;
  shipping_cost: number;
  discount_code?: string | null;
  discount_amount: number;
  card_discount_amount: number;
  cod_discount_amount: number;
  cod_fee_amount: number;
  /** TVA-ul si cota INREGISTRATE pe comanda, nu cele din setarile de azi. */
  vat_amount: number;
  vat_rate: number;
  /** Regimul de preturi al magazinului, ca sa se stie daca TVA-ul se aduna. */
  vat_enabled: boolean;
  prices_include_vat: boolean;
  total: number;
}

/**
 * Cheia randului, ca fiecare email sa poata sari peste ce arata deja altfel.
 * Emailul clientului insira produsele unul cate unul (extraoptiunile printre
 * ele), deci nu mai repeta „Subtotal" si „Optiuni extra".
 */
export type CheieRandDeBani =
  | "subtotal" | "extras" | "reducere" | "reducere-card"
  | "reducere-ramburs" | "taxa-ramburs" | "transport" | "tva";

export interface RandDeBani {
  cheie: CheieRandDeBani;
  /** Text SIMPLU, NEESCAPAT: randarea il trece prin `esc`. */
  eticheta: string;
  /** Ce se scrie in dreapta, deja formatat. */
  valoare: string;
  /** Cat intra in coloana. 0 la randurile informative („TVA (21%) inclus"). */
  contributie: number;
  /** Reducerile se scriu in verde. */
  verde: boolean;
}

/**
 * Randurile de deasupra Totalului, in ordinea in care se aduna.
 *
 * Suma `contributie` a randurilor intoarse ESTE `order.total` — proprietatea e
 * verificata in `order-totals.test.ts` pe cele trei forme care au gresit in
 * productie (extraoptiuni, TVA inclus, TVA adaugat). Cine adauga maine inca o
 * taxa si uita randul aici o vede cazand acolo, nu in inboxul unui client.
 *
 * Toate campurile din `BaniComanda` sunt OBLIGATORII, chiar si cele aproape mereu
 * zero: optionale, ar fi disparut tacit exact cum a disparut randul de
 * extraoptiuni, si `tsc` n-ar fi spus nimic.
 */
export function randuriDeBani(order: BaniComanda): RandDeBani[] {
  const t = totaluriComanda({
    items: order.items,
    subtotal: order.subtotal,
    shippingCost: order.shipping_cost,
    discountAmount: order.discount_amount,
    cardDiscount: order.card_discount_amount,
    codDiscount: order.cod_discount_amount,
    codFee: order.cod_fee_amount,
    vatAmount: order.vat_amount,
    vatRate: order.vat_rate,
    total: order.total,
    setariTva: { vat_enabled: order.vat_enabled, prices_include_vat: order.prices_include_vat },
  });

  const randuri: RandDeBani[] = [
    { cheie: "subtotal", eticheta: "Subtotal", valoare: formatPrice(t.subtotal), contributie: t.subtotal, verde: false },
  ];
  // Aceeasi eticheta ca la finalizare (`CheckoutSummary`) si ca in panou.
  if (t.extras > 0) {
    randuri.push({ cheie: "extras", eticheta: "Optiuni extra", valoare: `+ ${formatPrice(t.extras)}`, contributie: t.extras, verde: false });
  }
  if (t.reducere > 0) {
    randuri.push({
      cheie: "reducere",
      // Codul vine din `orders.discount_code`, adica doar cand cuponul a fost
      // chiar acceptat de server. Vezi payload-ul din `order.actions.ts`.
      eticheta: `Reducere${order.discount_code ? ` (${order.discount_code})` : ""}`,
      valoare: `- ${formatPrice(t.reducere)}`, contributie: -t.reducere, verde: true,
    });
  }
  if (t.reducereCard > 0) {
    randuri.push({ cheie: "reducere-card", eticheta: "Reducere plata cu cardul", valoare: `- ${formatPrice(t.reducereCard)}`, contributie: -t.reducereCard, verde: true });
  }
  if (t.reducereRamburs > 0) {
    randuri.push({ cheie: "reducere-ramburs", eticheta: "Reducere plata ramburs", valoare: `- ${formatPrice(t.reducereRamburs)}`, contributie: -t.reducereRamburs, verde: true });
  }
  if (t.taxaRamburs > 0) {
    randuri.push({ cheie: "taxa-ramburs", eticheta: "Taxa plata ramburs", valoare: formatPrice(t.taxaRamburs), contributie: t.taxaRamburs, verde: false });
  }
  randuri.push({
    cheie: "transport", eticheta: "Transport",
    valoare: t.transport === 0 ? "Gratuit" : formatPrice(t.transport),
    contributie: t.transport, verde: false,
  });
  if (t.tvaEticheta) {
    randuri.push({
      cheie: "tva", eticheta: t.tvaEticheta, valoare: formatPrice(t.tva),
      // La preturi cu TVA inclus eticheta poarta cuvantul „inclus" si cifra NU se
      // aduna: e deja cuprinsa in randurile de deasupra.
      contributie: t.tvaInTotal ? t.tva : 0, verde: false,
    });
  }
  return randuri;
}
