import type { WootPriceResult } from "@/lib/woot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGULILE LOTULUI DE AWB-URI WOOT                              (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE CE LOTUL WOOT N-A EXISTAT PANA ACUM, SI DE CE E ALTFEL DECAT CEILALTI.
 *
 * Woot e BROKER, nu curier. Ceilalti paisprezece din generarea in masa isi deduc
 * serviciul din greutate si adresa, pe server; la Woot serviciul vine dintr-o cotatie
 * LIVE (`POST /orders/prices`) si nu se poate ghici. De aceea Woot, Colete Online si
 * eColet au stat pe dinafara.
 *
 * ⚠ SI DE CE NU SE IA SERVICIUL DE PE COMANDA. Checkout-ul poate scrie
 * `shipping_address.woot_service_id` cand cumparatorul alege dintre serviciile Woot.
 * Masurat pe productie pe 21.09.2026: **zero din 267** de comenzi cu AWB Woot il
 * poarta. Regula „foloseste ce a ales clientul" ar fi sarit absolut toate comenzile
 * magazinului care chiar are nevoie de lot.
 *
 * ⚠ SI DE CE NU SE IA DUPA NUMELE SERVICIULUI DE DATA TRECUTA. Dupa emitere ramane
 * doar `woot_service_name`, un text. Iar textul acela s-a si schimbat sub noi: 216
 * comenzi scriu „DPD — locatie - adresa" cu emdash, 48 scriu „DPD · locatie - adresa",
 * acelasi serviciu. Potrivirea pe nume ar fi inceput sa rateze in ziua in care s-a
 * scos emdash-ul, fara ca nimeni sa lege cele doua lucruri.
 *
 * Hotararea comerciantului (21.09.2026): **se intreaba o data, la apasare, pentru tot
 * lotul.** Fereastra cere cotatia pe prima comanda, el alege serviciul (si punctul de
 * predare, cand serviciul cere), iar lotul foloseste acelasi serviciu pe toate.
 */

/** De ce o comanda nu intra in lot. Fiecare motiv spune si ce are omul de facut. */
export type MotivSarire =
  | "are-deja"
  | "dusa-de-marketplace"
  | "fara-adresa"
  | "serviciu-indisponibil";

export const MESAJUL_SARIRII: Record<MotivSarire, string> = {
  "are-deja":
    "Comanda are deja expediere la Woot. Nu se emite a doua: ar fi un al doilea colet, plătit.",
  "dusa-de-marketplace":
    "Transportul e în fluxul marketplace-ului: eticheta o face el, nu se emite AWB propriu.",
  "fara-adresa":
    "Comanda n-are județ sau localitate care să se potrivească în nomenclatorul Woot. "
    + "Emite-o individual, din rândul ei, unde poți alege localitatea cu mâna.",
  "serviciu-indisponibil":
    "Serviciul ales nu e oferit de Woot pe ruta comenzii ăsteia. Emite-o individual, "
    + "din rândul ei, și alege alt serviciu.",
};

/**
 * Serviciul cere sa predai TU coletul la un punct.
 *
 * ⚠ E cazul obisnuit al magazinului care a cerut lotul: 264 din 267 de expedieri ale
 * lui sunt „DPD — locatie - adresa". Punctul se alege O SINGURA DATA pentru lot,
 * fiindca expeditorul e acelasi la toate comenzile.
 */
export function cerePunctDePredare(s: Pick<WootPriceResult, "service_pickup">): boolean {
  return !!s.service_pickup && s.service_pickup !== "door";
}

/**
 * Serviciul livreaza la un punct ales de cumparator.
 *
 * ⚠ ASTEA NU POT INTRA INTR-UN LOT, si nu e o lipsa de sarguinta: punctul de livrare
 * e ALTUL pentru fiecare cumparator, in localitatea lui. O alegere facuta o data
 * pentru tot lotul ar fi trimis coletele zece oameni la acelasi locker, pe adresa
 * altcuiva. Deci serviciile astea nici nu se ofera in fereastra lotului.
 */
export function livreazaLaPunct(s: Pick<WootPriceResult, "service_delivery">): boolean {
  return !!s.service_delivery && s.service_delivery !== "door";
}

/** Serviciile care pot fi alese pentru un lot. */
export function serviciiPentruLot(servicii: WootPriceResult[]): WootPriceResult[] {
  return servicii.filter((s) => !livreazaLaPunct(s));
}

export const FARA_SERVICII_DE_LOT =
  "Pe ruta primei comenzi, Woot oferă doar servicii cu livrare la punct (locker). "
  + "Acelea nu intră într-un lot: punctul de livrare e altul pentru fiecare cumpărător. "
  + "Emite comenzile individual, din rândurile lor.";

/**
 * Eticheta scrisa pe expediere, exact cum o scrie si fereastra.
 *
 * ⚠ ACEEASI FORMA CA LA EMITEREA PE BUCATA (`${curier} · ${serviciu}`). Alta forma ar
 * fi insemnat ca aceeasi expediere arata altfel dupa cum a fost emisa, iar `woot_service_name`
 * e singurul loc in care se mai vede serviciul dupa aceea.
 */
export function etichetaServiciului(s: Pick<WootPriceResult, "courier_name" | "service_name">): string {
  return `${s.courier_name} · ${s.service_name}`;
}

/**
 * Serviciul ales, regasit in cotatia unei ALTE comenzi.
 *
 * ⚠ SE CAUTA DIN NOU LA FIECARE COMANDA, si nu se refoloseste pretul primei: cotatia e
 * pe ruta, iar acelasi `service_id` poate lipsi cu totul pe alta adresa. Trimis orbeste,
 * Woot ar fi raspuns cu o eroare pe care nimeni n-ar fi stiut s-o citeasca.
 */
export function regasesteServiciul(
  servicii: WootPriceResult[], serviceId: number,
): WootPriceResult | undefined {
  return servicii.find((s) => s.service_id === serviceId);
}
