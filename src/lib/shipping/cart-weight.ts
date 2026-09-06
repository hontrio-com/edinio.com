import { enabledComboPriceMap } from "@/lib/storefront/variants";
import { normalizeazaCantitate } from "@/lib/orders/quantity";

/**
 * Ce stie cotatia despre cosul care se livreaza.
 *
 * Greutatea ajunge la API-ul curierului, deci de ea atarna pretul pe care il
 * plateste comerciantul. Se calculeaza DIN BAZA, niciodata din ce declara
 * browserul: pretul cotat pleaca semnat, iar o greutate de la client ar fi
 * insemnat ca cine cere o cotatie pentru un kilogram comanda apoi cincisprezece
 * la acelasi pret.
 *
 * Sta in modul pur ca sa poata fi verificata: `getShippingOptions` e „use server"
 * si testele nu-l pot incarca.
 */

export interface LinieCotata {
  productId: string;
  quantity: number;
  /**
   * Cat adauga configuratia liniei, in grame, PER BUCATA.
   *
   * ⚠ Nu vine niciodata din browser, ci din instantaneul scris in comanda de server
   * (`InstantaneuConfiguratie.grame`). O greutate declarata de client ar fi insemnat ca cine cere
   * o cotatie pentru o cutie de lemn de doua kilograme trimite „zero" si o plateste ca pe o cana
   * goala — exact atacul de care se apara si greutatea din catalog, in antetul fisierului.
   */
  grameConfiguratie?: number;
}

/** Doar campurile de care depinde transportul, asa cum vin din `products`. */
export interface ProdusCotat {
  id: string;
  shipping_class?: string | null;
  category?: string | null;
  weight_grams?: number | null;
  /** Pretul din catalog. Serveste la PLAFONAREA subtotalului declarat de client
   *  in regulile de transport — vezi `subtotalMaximDinCatalog`. */
  price?: number | null;
  /** Combinatiile, pentru pretul lor propriu. Tot pentru plafon: o marime mai
   *  scumpa decat baza costa CHIAR mai mult, iar plafonul trebuie sa o cuprinda. */
  page_sections?: unknown;
}

export interface ContextCos {
  /** Greutatea totala, in kilograme. Zero cand niciun produs n-are greutate. */
  weightKg: number;
  /** Cate bucati se livreaza, cu tot cu liniile care nu s-au regasit in catalog. */
  quantity: number;
  classIds: string[];
  categories: string[];
  productIds: string[];
}

export function contextulCosului(linii: LinieCotata[] | undefined, produse: ProdusCotat[]): ContextCos {
  const byId = new Map(produse.map((p) => [p.id, p]));
  const classIds = new Set<string>();
  const categories = new Set<string>();
  let grame = 0;
  let quantity = 0;

  for (const linie of linii ?? []) {
    // Clemeaza, ca in browser. La COMANDA regula e mai aspra — ce trece de plafon
    // se refuza (`cantitateCeruta`) — deci un cos cu 5000 de bucati nu ajunge
    // niciodata sa fie si livrat; aici doar nu are voie sa produca o greutate
    // absurda sau negativa.
    const qty = normalizeazaCantitate(linie.quantity);
    quantity += qty;
    /*
     * Sporul de greutate al configuratiei se aduna INAINTE de cautarea in catalog, si
     * dinadins.
     *
     * O cana cu cutie de lemn cantareste azi exact cat cana goala, la toti cei saisprezece
     * curieri: `Optiune.grame` era compilat si trimis, dar nu-l aduna nimeni. Sporul nu vine din
     * `products` — el sta pe alegerea cumparatorului — deci nu are de ce sa depinda de faptul ca
     * produsul s-a mai gasit sau nu in catalog. Stiut, se numara.
     *
     * ⚠ Se cere FINIT si pozitiv, nu doar `|| 0` ca la `weight_grams`. Sporul vine din `orders.items`,
     * adica din jsonb care se poate edita de mana, iar `Infinity` trece nevatamat printr-un `|| 0`:
     * o singura linie stricata ar fi facut greutatea INTREGII comenzi nefinita, si atata ar fi
     * plecat in cererea catre curier. Negativa, ar fi scazut din colet.
     */
    const sporCfg = Number(linie.grameConfiguratie);
    grame += (Number.isFinite(sporCfg) && sporCfg > 0 ? sporCfg : 0) * qty;
    const p = byId.get(linie.productId);
    // Un produs care nu s-a regasit (sters, al altui magazin) NU se sare la
    // numaratoare: bucatile lui tot pleaca in colet. Doar greutatea lui lipseste,
    // si atunci lipseste sincer — nu se inventeaza una.
    if (!p) continue;
    if (p.shipping_class) classIds.add(p.shipping_class);
    if (p.category) categories.add(p.category);
    grame += Math.max(0, Number(p.weight_grams) || 0) * qty;
  }

  return {
    // Trei zecimale: gramul e cea mai mica unitate pe care o tine catalogul, iar
    // curierii primesc kilograme.
    weightKg: Math.round(grame) / 1000,
    quantity,
    classIds: [...classIds],
    categories: [...categories],
    productIds: [...new Set((linii ?? []).map((l) => l.productId))],
  };
}


/**
 * Cat POATE valora cel mult cosul declarat, dupa preturile din catalog.
 *
 * Regulile de transport („livrare gratuita peste 200 de lei") primeau subtotalul
 * de la BROWSER, iar pretul care iesea din ele pleaca SEMNAT. Cine trimitea o
 * suma umflata obtinea livrare gratuita semnata pentru un cos ieftin.
 *
 * Nu inlocuim valoarea clientului, o PLAFONAM. Motivul: subtotalul real e
 * dupa reduceri, oferte si preturi de varianta — lucruri pe care cotatia nu le
 * poate reconstrui exact din `{productId, quantity}`. Daca l-am inlocui cu
 * pretul de catalog, un cos cu reducere ar parea mai scump decat este si ar
 * primi transport gratuit pe nedrept, in dauna comerciantului.
 *
 * Plafonul taie exact atacul (umflarea) si lasa neatins cazul legitim
 * (reducerea, care doar coboara suma). Produsele negasite in catalog nu adauga
 * nimic: plafonul e ce putem SUSTINE, nu ce sustine clientul.
 *
 * ⚠ PRETUL DE BAZA NU E MAXIMUL LEGITIM (reparat 06.09.2026).
 *
 * Plafonul se calcula doar din `products.price`, dar o combinatie isi poate avea
 * pretul ei, si de obicei mai MARE (XXL costa mai mult decat S). Deci un cos cu
 * marimea scumpa era plafonat sub cat facea el cu adevarat, iar consecinta nu era
 * teoretica: pragul de livrare gratuita nu se atingea cand ar fi trebuit, iar
 * valoarea declarata la DHL pleca mai mica decat marfa — la asigurare, diferenta
 * o plateste comerciantul.
 *
 * Se ia acum cel mai mare pret legitim al produsului (baza sau oricare combinatie
 * activa). Linia nu spune ce combinatie s-a ales — `LinieCotata` n-o poarta — dar
 * pentru un PLAFON asta e alegerea corecta: apara mai departe impotriva umflarii,
 * si nu mai poate taia in carne vie o suma adevarata.
 */
export function subtotalMaximDinCatalog(
  linii: LinieCotata[] | undefined,
  produse: ProdusCotat[],
): number {
  const byId = new Map(produse.map((p) => [p.id, p]));
  let total = 0;
  for (const linie of linii ?? []) {
    const p = byId.get(linie.productId);
    if (!p) continue;
    const baza = Number(p.price);
    if (!Number.isFinite(baza) || baza <= 0) continue;
    let maxim = baza;
    for (const pret of enabledComboPriceMap(p.page_sections, baza).values()) {
      if (Number.isFinite(pret) && pret > maxim) maxim = pret;
    }
    total += maxim * normalizeazaCantitate(linie.quantity);
  }
  return Math.round(total * 100) / 100;
}
