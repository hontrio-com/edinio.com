import type { RegimTva } from "@/lib/billing/invoice-vat";

/**
 * Suma liniilor de pe factura chiar da totalul comenzii?
 *
 * Nimic nu punea vreodata intrebarea asta. Cele trei case isi compuneau liniile si
 * le trimiteau, iar singurul loc care se uita la `orders.total` il trimitea ca
 * INCASARE — deci pe o comanda stricata factura pleca cu o suma si incasarea cu
 * alta. In productie sunt doua comenzi (Medclean #0001 si #0002) unde TVA-ul a
 * fost extras din pretul brut SI adunat inca o data deasupra: liniile dau 63,99
 * pe o comanda de 71,63.
 *
 * Regula NU e o toleranta fixa. O toleranta fixa refuza comenzi bune: fGO cere
 * pretul unitar NET, rotunjit la doi bani, iar la 50 de bucati diferenta urca la
 * 0,24 lei fara ca nimic sa fie gresit. Aici rotunjirea se MODELEAZA: se calculeaza
 * exact cat poate ea sa mute, si se refuza doar ce ramane neexplicat. Restul se
 * ABSOARBE printr-o linie de ajustare, ca documentul sa iasa pe fix `orders.total`.
 *
 * Cu doua rezerve, spuse pe fata.
 *
 * Una: la magazinele cu preturi FARA TVA garda lucreaza pe baza NETA, iar TVA-ul
 * il calculeaza furnizorul pe fiecare linie. Diferenta de rotunjire care poate
 * ramane atunci in partea de TVA nu se vede aici si nu se poate corecta cu o linie
 * neta.
 *
 * A doua: cand casa cere preturi nete iar magazinul are preturi CU TVA (fGO),
 * garda certifica baza neta, iar furnizorul reconstruieste brutul inmultind
 * inapoi. Reconstructia PIERDE: netul se taie la doi bani inainte sa se aplice
 * cota, deci vreo sasea parte din totalurile brute nici nu se pot scrie pe o
 * factura fGO — 100,00 lei la 21% se desface in 82,64 + 17,35 = 99,99, si nu
 * exista pret unitar care sa dea 100,00. Nici o linie de ajustare nu ajuta: pasul
 * ei, dus in brut, e de 1,21 bani. E o limita a formatului, nu a garzii, si nu se
 * inchide de aici.
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Pretul unitar asa cum il scrie documentul: doi bani, atat.
 *
 * Se aplica la GRANITA, adica exact acolo unde linia pleaca spre furnizor, si e
 * chiar rotunjirea pe care garda de mai jos o modeleaza. Fara ea, modelul ar fi
 * o presupunere: fGO taie la doi bani (`fgo.ts`), Oblio primeste `precision: 2`
 * si taie el, dar SmartBill primeste numarul ca atare si il rotunjeste dupa
 * setarea CONTULUI. Pe un cont cu patru zecimale, documentul ar fi iesit pe suma
 * exacta, iar linia noastra de ajustare l-ar fi impins cu un ban pe langa.
 *
 * Preturile de pachet chiar au mai mult de doi bani: `orders.items` tine pretul
 * unitar nerotunjit, ca `pret x cantitate` sa dea fix subtotalul comenzii
 * (13,41 pe doua bucati inseamna 6,705).
 */
export function pretDeDocument(n: number): number {
  return round2(n);
}

/** O linie de document, redusa la ce conteaza pentru suma. Reducerile intra negative. */
export interface LinieDocument {
  cantitate: number;
  pretUnitar: number;
}

export type Reconciliere =
  | { fel: "exact" }
  | { fel: "ajustare"; delta: number }
  | {
      fel: "refuz";
      /** Cat insumeaza liniile documentului. */
      asteptat: number;
      /** Cat ar trebui sa insumeze, in ACEEASI unitate cu liniile. */
      gasit: number;
      delta: number;
      /** `orders.total`, adica numarul pe care il vede comerciantul pe ecran. */
      total: number;
    };

/**
 * Cat poate muta rotunjirea, legitim.
 *
 * Termenul care conteaza se inmulteste cu CANTITATEA, nu cu numarul de liniilor:
 * documentul scrie un pret unitar cu doi bani, iar acela se inmulteste apoi cu
 * bucatile. La 50 de bucati, o jumatate de ban pe unitate face un sfert de leu —
 * si chiar asa arata o comanda reala din productie, perfect corecta. O toleranta
 * fixa de doi bani ar fi refuzat-o.
 *
 * Cand preturile comenzii sunt NETE se adauga si rotunjirea TVA-ului, pe care
 * furnizorul o face pe FIECARE linie in timp ce noi o facem o singura data pe
 * baza intreaga.
 *
 * Consecinta de asumat: pe o comanda cu cantitati mari, plafonul creste si el, si
 * o eroare mica se ascunde sub el. Nu e o slabiciune a garzii, e chiar aritmetica
 * documentului — iar suma incasata ramane corecta oricum, fiindca diferenta se
 * ABSOARBE si documentul iese pe fix `orders.total`.
 */
function plafon(linii: LinieDocument[], liniiNete: boolean): number {
  const bucati = linii.reduce((s, l) => s + Math.max(0, Number(l.cantitate) || 0), 0);
  return round2(0.01 + 0.005 * bucati + (liniiNete ? 0.005 * linii.length : 0));
}

export function reconciliazaFactura(i: {
  linii: LinieDocument[];
  totalComenzii: number;
  regim: RegimTva;
  /** TVA-ul adaugat PESTE sumele comenzii (0 la preturi cu TVA inclus). */
  vatAddOn?: number;
  /**
   * Casa cere preturi FARA TVA si le converteste ea (fGO). Se spune explicit, nu
   * se deduce din regim: la fGO liniile sunt nete in AMANDOUA regimurile, iar
   * dedusa, comparatia punea linii nete langa un total brut si refuza tot.
   */
  liniiNete?: boolean;
}): Reconciliere {
  // Pretul unitar se rotunjeste INAINTE de inmultire: asta e chiar numarul pe care
  // il va scrie documentul. Fara rotunjire, garda ar certifica o suma pe care
  // factura n-o va contine niciodata.
  const asteptat = round2(i.linii.reduce((s, l) => s + round2(l.pretUnitar) * l.cantitate, 0));

  // Totalul, adus in UNITATEA liniilor. La preturi nete `orders.total` poarta si
  // TVA-ul adaugat deasupra; iar cand casa isi converteste singura preturile, si
  // TVA-ul continut in ele trebuie scos.
  const stocat = i.regim.taxIncluded ? round2(i.totalComenzii) : round2(i.totalComenzii - (i.vatAddOn ?? 0));
  const converteste = !!i.liniiNete && i.regim.taxIncluded && i.regim.rate > 0;
  const gasit = converteste ? round2(stocat / (1 + i.regim.rate / 100)) : stocat;
  const delta = round2(gasit - asteptat);

  if (delta === 0) return { fel: "exact" };
  if (Math.abs(delta) <= plafon(i.linii, !!i.liniiNete || !i.regim.taxIncluded)) return { fel: "ajustare", delta };
  return { fel: "refuz", asteptat, gasit, delta, total: round2(i.totalComenzii) };
}

/**
 * Ce i se spune comerciantului. Numerele SI pasul urmator: un refuz care nu spune
 * ce sa faci opreste facturarea fara sa o repare.
 */
export function mesajRefuz(
  r: Extract<Reconciliere, { fel: "refuz" }>,
  orderNumber: string | number,
  platita: boolean,
): string {
  const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;
  // Se citeaza `orders.total`, numarul pe care comerciantul il vede pe ecran, nu
  // baza in care se face comparatia: altfel i-am reprosa o suma pe care n-o gaseste.
  const cap = `Comanda #${orderNumber} nu se poate factura: liniile facturii insumeaza ${lei(r.asteptat)} in loc de ${lei(r.gasit)}, deci documentul nu ar da totalul comenzii de ${lei(r.total)} (diferenta ${lei(Math.abs(r.delta))}).`;
  return platita
    ? `${cap} Diferenta a fost deja incasata, deci corecteaza intai incasarea: o resalvare a comenzii i-ar cobori totalul sub suma platita.`
    : `${cap} Deschide „Editeaza comanda" si salveaza — totalul se recalculeaza — apoi emite factura.`;
}

/** Forma cu care o cheama cele trei case: totalul si TVA-ul vin de pe comanda. */
export function reconciliazaComanda(
  linii: LinieDocument[],
  order: { total?: unknown; vat_amount?: unknown },
  regim: RegimTva,
  optiuni?: { liniiNete?: boolean },
): Reconciliere {
  return reconciliazaFactura({
    linii,
    totalComenzii: Number(order.total) || 0,
    regim,
    // La preturi cu TVA inclus nu se adauga nimic peste sumele comenzii.
    vatAddOn: regim.taxIncluded ? 0 : Number(order.vat_amount) || 0,
    liniiNete: optiuni?.liniiNete,
  });
}

/* ─── Cum se citesc liniile fiecarei case ─────────────────────────────────── */

/** SmartBill: reducerile sunt linii cu `price: 0` si valoarea in `discountValue`. */
export function liniiSmartbill(
  produse: { quantity?: unknown; price?: unknown; isDiscount?: boolean; discountValue?: unknown }[],
): LinieDocument[] {
  return produse.map((p) => p.isDiscount
    ? { cantitate: 1, pretUnitar: Number(p.discountValue) || 0 }
    : { cantitate: Number(p.quantity) || 0, pretUnitar: Number(p.price) || 0 });
}

/** Oblio: reducerile au `discount` pozitiv si se scad din liniile de deasupra. */
export function liniiOblio(
  produse: { quantity?: unknown; price?: unknown; discount?: unknown; discountType?: unknown }[],
): LinieDocument[] {
  return produse.map((p) => p.discountType
    ? { cantitate: 1, pretUnitar: -Math.abs(Number(p.discount) || 0) }
    : { cantitate: Number(p.quantity) || 0, pretUnitar: Number(p.price) || 0 });
}

/**
 * fGO: preturile sunt NETE, iar reducerile vin ca linii `Discount` cu valoarea
 * pozitiva — de aceea se intorc cu semn schimbat, ca sa se poata aduna.
 */
export function liniiFgo(
  produse: { quantity?: unknown; unitPrice?: unknown; isDiscount?: boolean }[],
): LinieDocument[] {
  return produse.map((p) => p.isDiscount
    ? { cantitate: 1, pretUnitar: -Math.abs(Number(p.unitPrice) || 0) }
    : { cantitate: Number(p.quantity) || 0, pretUnitar: Number(p.unitPrice) || 0 });
}
