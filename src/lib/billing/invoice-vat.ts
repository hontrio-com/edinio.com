/**
 * Ce cota de TVA poarta o factura, si daca sumele comenzii o contin deja.
 *
 * Aceeasi intrebare avea TREI raspunsuri, cate unul pe casa de facturare:
 * SmartBill o lua de pe COMANDA (`orders.vat_rate`), cu rezerva pe cota
 * magazinului; Oblio dintr-un numar tastat in ecranul lui de configurare, care
 * nu e legat de nimic; fGO din setarile magazinului CITITE AZI. Doar SmartBill
 * se uita vreodata la comanda.
 *
 * Cat timp toate magazinele stau pe aceeasi cota, cele trei raspunsuri coincid si
 * nu se vede nimic. Se despart in ziua in care un magazin isi schimba cota — adica
 * exact ce s-a intamplat in Romania cu trecerea de la 19 la 21: fiecare comanda
 * veche facturata dupa schimbare ar iesi cu cota de AZI pe Oblio si pe fGO, si cu
 * cea de la vanzare pe SmartBill.
 *
 * Regula, una singura: cota se ia de pe comanda, fiindca acolo a fost inghetata
 * la vanzare. Rezerva pe cota magazinului exista pentru comenzile de dinainte ca
 * TVA-ul sa fie pornit — ele poarta zero, iar un comerciant platitor trebuie
 * totusi sa le poata factura.
 *
 * `orders.prices_include_vat` NU EXISTA: doar cota e inghetata pe comanda, nu si
 * regimul. De aceea rezerva forteaza `taxIncluded`: sumele unei comenzi vechi sunt
 * cele chiar platite de client, deci TVA-ul se EXTRAGE din ele, nu se adauga peste
 * — altfel factura ar cere mai mult decat s-a incasat.
 */

export interface ComandaTva {
  /** Cota inghetata la vanzare. 0 pe comenzile de dinainte de pornirea TVA-ului. */
  vat_rate?: unknown;
}

export interface MagazinTva {
  vat_enabled: boolean;
  /** Cota de AZI a magazinului. Serveste doar ca rezerva. */
  vat_rate?: unknown;
  prices_include_vat: boolean;
}

export interface RegimTva {
  /** Cota pentru liniile facturii. 0 inseamna factura fara TVA. */
  rate: number;
  /** Sumele comenzii contin deja TVA-ul (SmartBill `isTaxIncluded`, Oblio `vatIncluded`). */
  taxIncluded: boolean;
  /** Cota a venit din setarea de azi, nu de pe comanda. */
  fallback: boolean;
}

export function invoiceVat(
  order: ComandaTva,
  magazin: MagazinTva,
  /**
   * Casa de facturare are identitate fiscala in configuratia ei: SmartBill cere
   * numele cotei, Oblio la fel. fGO n-are asa ceva, deci trimite `true`.
   */
  furnizorConfiguratPentruTva = true,
): RegimTva {
  const platitor = magazin.vat_enabled && furnizorConfiguratPentruTva;
  const cotaComenzii = Number(order.vat_rate) || 0;
  const cotaMagazinului = Number(magazin.vat_rate) || 0;
  const rate = platitor ? (cotaComenzii > 0 ? cotaComenzii : cotaMagazinului) : 0;
  const fallback = rate > 0 && cotaComenzii <= 0;
  return { rate, taxIncluded: fallback ? true : magazin.prices_include_vat, fallback };
}

/**
 * Numele cotei, cand casa de facturare cere un NUME si nu un procent.
 *
 * SmartBill si Oblio isi tin cotele intr-un nomenclator propriu, iar comerciantul
 * alege din el o PERECHE nume+procent. Cand cota facturii nu mai e cea aleasa
 * atunci — o comanda veche la alta cota, sau magazinul trecut intre timp pe alta
 * — numele configurat descrie alt procent decat cel trimis, si factura ar pleca
 * cu „Normala 21%" scris peste 19. Se cauta deci intai dupa procent, si abia dupa
 * aceea se cade pe numele configurat.
 *
 * `cote` lipsa (nu s-a putut citi nomenclatorul) inseamna ca ramane numele
 * configurat: o factura cu un nume aproximativ e mai buna decat una neemisa.
 */
export function numeCota(
  rate: number,
  configurat: { name: string; percentage: number },
  cote?: { name: string; percentage: number }[],
): string {
  if (potrivesteCota(configurat.percentage, rate)) return configurat.name;
  const dupaProcent = (cote ?? []).find((c) => potrivesteCota(c.percentage, rate));
  return dupaProcent?.name ?? configurat.name;
}

/** Merita citit nomenclatorul de cote de la furnizor? Doar cand numele nu se mai potriveste. */
export function cereNumeleCotei(rate: number, configuratPercentage: number): boolean {
  return rate > 0 && !potrivesteCota(configuratPercentage, rate);
}

function potrivesteCota(a: number, b: number): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
}
