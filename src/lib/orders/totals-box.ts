import { recalculeazaTotal, sumaExtraoptiunilor } from "./edit-pricing";
import { invoiceVat } from "@/lib/billing/invoice-vat";
/**
 * Caseta de totaluri de pe pagina unei comenzi din panoul comerciantului.
 *
 * Regula pe care o tine modulul asta e una singura: RANDURILE TREBUIE SA DEA
 * TOTALUL. Pana pe 2026-08-03 nu il dadeau pe 20 din cele 96 de comenzi din
 * productie, din doua motive care se pot vedea si separat:
 *
 * 1. Extraoptiunile („ambalare cadou" s.a.m.d.) sunt salvate ca linii in
 *    `orders.items`, dar NU sunt cuprinse in `orders.subtotal`. Erau listate sus,
 *    la produse, si apoi disparute din caseta. Comanda #0018 (9 iulie): lista
 *    arata 40 + 5, caseta aduna 40 + 20 = 60 sub un Total de 65, si nimeni nu
 *    putea spune de unde vin cei 5 lei.
 *
 * 2. `orders.vat_amount` la un magazin cu preturi CU TVA e portiunea EXTRASA din
 *    incasare (vezi `computeVat` din `utils/vat.ts`), nu o suma adaugata peste ea.
 *    Randul se aduna in coloana ca si cum ar fi de platit in plus. Comanda #0074:
 *    40 + 20 + 6,94 = 66,94 sub un Total de 60. La cea mai mare comanda masurata,
 *    ORD-MS1WS5QR-09F, umflarea era de 53,80 lei pe un total de 310.
 *
 * Dupa reparatie raman 2 comenzi din 96 care tot nu se impaca (#0001 si #0002 ale
 * magazinului e530f437, ambele din 9 iunie): acolo nu caseta greseste, ci
 * `orders.total` insusi — sunt scrise de codul de dinaintea reparatiei de TVA din
 * 24 iulie, care adauga TVA peste preturi care il contineau deja. Tocmai de aceea
 * modulul intoarce `diferenta` in loc sa o inghita: o comanda al carei total nu se
 * explica din propriile randuri trebuie sa se VADA, nu sa fie ascunsa printr-un
 * rand de umplutura.
 */

import { esteIdExtra } from "./extras";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** O linie din `orders.items`, asa cum e salvata (preturile pot veni si ca text). */
interface LinieCaseta {
  product_id?: unknown;
  price?: unknown;
  quantity?: unknown;
}

/**
 * Setarea de TVA a magazinului, citita ACUM.
 *
 * Nu exista instantaneu pe comanda: `orders` are doar `vat_amount` si `vat_rate`,
 * nicio coloana care sa spuna daca preturile includeau TVA atunci. Deci un magazin
 * care isi schimba regimul isi va vedea comenzile vechi socotite dupa regimul nou.
 * E singurul semnal disponibil azi, si tot e mai bun decat presupunerea de pana
 * acum, care era ca TVA-ul se aduna INTOTDEAUNA.
 */
export interface SetariTvaMagazin {
  vat_enabled: boolean;
  prices_include_vat: boolean;
}

export interface TotaluriCaseta {
  /** Marfa, adica exact `orders.subtotal`: NU contine extraoptiunile. */
  subtotal: number;
  /** Suma liniilor `extra_*`. 0 cand comanda n-are extraoptiuni. */
  extras: number;
  transport: number;
  reducere: number;
  reducereCard: number;
  reducereRamburs: number;
  taxaRamburs: number;
  /** Cifra de langa eticheta de TVA. 0 cand nu e nimic de aratat. */
  tva: number;
  /**
   * Daca TVA-ul se ADUNA in coloana. Fals la preturi cu TVA inclus, unde cifra e
   * doar informativa si e deja cuprinsa in fiecare rand de deasupra.
   */
  tvaInTotal: boolean;
  /** `TVA (21%) inclus` sau `TVA (21%)`. `null` cand randul nu se arata deloc. */
  tvaEticheta: string | null;
  /** `orders.total`, adica banii ceruti clientului. */
  total: number;
  /** Cat dau randurile care intra in coloana. */
  sumaRandurilor: number;
  /** `sumaRandurilor - total`. Zero inseamna ca socoteala se inchide. */
  diferenta: number;
  /** Diferenta e chiar cat TVA-ul, la o comanda pe „preturi cu TVA inclus". */
  tvaAdunatPesteTotal: boolean;
}

/**
 * Toate campurile sunt OBLIGATORII, chiar si cele care sunt aproape mereu zero.
 *
 * Optionale, ar fi disparut tacit exact asa cum a disparut randul de extraoptiuni:
 * cine adauga maine inca o taxa uita sa o treaca aici, `tsc` nu spune nimic, si
 * caseta iese iar cu un rand lipsa. Asa, orice apelant nou e enumerat de compilator.
 */
export function totaluriComanda(p: {
  items: LinieCaseta[] | null | undefined;
  subtotal: unknown;
  shippingCost: unknown;
  discountAmount: unknown;
  cardDiscount: unknown;
  codDiscount: unknown;
  codFee: unknown;
  vatAmount: unknown;
  vatRate: unknown;
  total: unknown;
  setariTva: SetariTvaMagazin;
}): TotaluriCaseta {
  // Suma extraoptiunilor: ajutorul exista de la constatarea 4, e pur si testat, si
  // il foloseste chiar calea care SCRIE totalul (`updateOrderDetails`). Rescris
  // aici, cele doua ar fi ajuns sa nu mai raspunda la fel.
  const extras = sumaExtraoptiunilor((p.items ?? []) as unknown[]);

  const subtotal = round2(num(p.subtotal));
  const transport = round2(num(p.shippingCost));
  const reducere = round2(num(p.discountAmount));
  const reducereCard = round2(num(p.cardDiscount));
  const reducereRamburs = round2(num(p.codDiscount));
  const taxaRamburs = round2(num(p.codFee));
  const total = round2(num(p.total));

  const tva = round2(num(p.vatAmount));
  const rata = num(p.vatRate);
  /*
   * Randul se arata ori de cate ori exista o cifra, indiferent de
   * `show_vat_breakdown`, si asta e o decizie deliberata pentru AMANDOI apelantii.
   *
   * In panou: setarea se numeste „Afiseaza defalcarea TVA IN COS" si e despre ce
   * vede clientul cat timp cumpara; comerciantul are nevoie de cifra ca sa o poata
   * pune fata in fata cu factura, care o contine intotdeauna.
   *
   * In emailul clientului: acolo comanda s-a incheiat, iar emailul e documentul pe
   * care il pastreaza si cu care compara factura. Un rand ascuns acolo l-ar lasa
   * cu un total pe care nu-l poate desface. Un singur magazin din cele noua cu TVA
   * are setarea stinsa, si are doua comenzi.
   */
  const arataTva = p.setariTva.vat_enabled && tva > 0;
  /*
   * „TVA-ul e inclus in preturi?" se intreaba prin `invoiceVat`, adica prin exact
   * regula pe care o folosesc cele trei case de facturare — nu prin setarea bruta.
   * Diferenta conteaza: pe o comanda fara cota inghetata, `invoiceVat` cade
   * deliberat pe „inclus" oricare ar fi setarea de azi. Cu setarea bruta, panoul
   * i-ar spune comerciantului sa adune TVA peste un total pe care factura il
   * trateaza ca inclusiv — si tot nota noua il trimite sa compare cu factura.
   */
  const regim = invoiceVat({ vat_rate: p.vatRate }, p.setariTva);
  const tvaInTotal = arataTva && !regim.taxIncluded;
  /*
   * Aceeasi formulare ca in cos si la finalizare (`CheckoutSummary`, `OrderModal`)
   * si ca in previzualizarea din Setari. Fara cuvantul „inclus" randul se citeste
   * ca o suma de adaugat — asta era jumatate din constatare.
   */
  const tvaEticheta = arataTva
    ? `TVA (${rata}%)${regim.taxIncluded ? " inclus" : ""}`
    : null;

  /*
   * Suma randurilor iese din `recalculeazaTotal`, formula pe care o foloseste si
   * serverul cand SCRIE totalul, si previzualizarea din modalul de editare.
   * Rescrisa de mana aici, ar fi divergat la prima schimbare — si diverge deja:
   * cea de acolo taie la zero (`Math.max(0, ...)`), asta nu, deci o comanda cu
   * reduceri peste valoarea marfii ar fi aparut in caseta cu „diferenta
   * nejustificata" fata de un total pe care serverul l-a taiat corect.
   *
   * `freeShippingThreshold: null` fiindca aici nu se re-evalueaza pragul: caseta
   * aduna randurile ASA CUM SUNT pe comanda, nu recalculeaza ce ar fi trebuit sa
   * fie transportul.
   */
  const { total: sumaRandurilor } = recalculeazaTotal({
    subtotal, extras, discount: reducere, cardDiscount: reducereCard,
    codDiscount: reducereRamburs, codFee: taxaRamburs, shipping: transport,
    freeShippingThreshold: null,
    vat: { vat_enabled: p.setariTva.vat_enabled, vat_rate: rata, prices_include_vat: regim.taxIncluded },
  });

  const diferenta = round2(sumaRandurilor - total);

  return {
    subtotal,
    extras,
    transport,
    reducere,
    reducereCard,
    reducereRamburs,
    taxaRamburs,
    tva: arataTva ? tva : 0,
    tvaInTotal,
    tvaEticheta,
    total,
    sumaRandurilor,
    diferenta,
    /*
     * Cand diferenta e chiar cat TVA-ul, ea are un nume.
     *
     * Pe cele doua comenzi din 9 iunie (Medclean #0001 si #0002) TVA-ul a fost
     * extras din pretul brut SI adunat inca o data deasupra: `orders.total` =
     * baza + TVA, desi eticheta spune „inclus". Caseta ar fi tiparit ACELASI
     * numar de doua ori — o data ca „TVA inclus 7,64" si o data ca „diferenta
     * nejustificata +7,64" — desi propria ei socoteala dovedeste ce s-a
     * intamplat. Un nume adevarat e mai util decat un semn de mirare.
     */
    tvaAdunatPesteTotal: arataTva && regim.taxIncluded && Math.abs(Math.abs(diferenta) - tva) < 0.01,
  };
}
