import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusul unui colet GLS → statusul comenzii.
 *
 * ═══ CODURILE SUNT NUMERICE, SI SUNT CELE REALE ═══
 *
 * Din Appendix G al documentatiei MyGLS (ver. 25.12.11), nu ghicite. `StatusCode`
 * vine ca sir, dar continutul e un numar: „5", „55", „23".
 *
 * ⚠ Prima forma a fisierului folosea siruri („DELIVERED", „INTRANSIT"), luate din
 * webhook-ul GLS din developer portal — alt API, alt vocabular. A fost stearsa.
 *
 * ═══ ⚠ 55 NU E 5 ═══
 *
 * `5` = „The parcel has been delivered."
 * `55` = „The parcel has been delivered at the ParcelShop."
 *
 * A doua inseamna ca respectivul colet a ajuns LA PUNCT, nu la client — omul inca
 * nu l-a ridicat. Tratata ca livrare:
 *   - comanda se inchide inainte de vreme;
 *   - la ramburs, marcam INCASAT ce nu s-a incasat (GLS ia banii la ridicare);
 *   - daca nu se ridica in termen (cod 57), coletul se intoarce si noi avem in
 *     baza o comanda „livrata" care de fapt s-a returnat.
 *
 * Acelasi rationament la `56` (stocat in ParcelShop) si `59` (ridicare din
 * ParcelShop, adica in curs).
 *
 * ═══ ⚠ 54 SI 58 SUNT LIVRARI ADEVARATE ═══
 *
 * `54` = predat la parcel box, `58` = predat vecinului, cu semnatura. Coletul a
 * iesit din mana GLS catre destinatie, deci comanda se inchide.
 *
 * ═══ ⚠ 23 SI 40 NU SUNT „LIVRAT" SI NU SUNT „ANULAT" ═══
 *
 * „The parcel has been returned to sender." Marfa se intoarce la comerciant, dar
 * comanda NU e anulata automat de noi: anularea atrage dupa ea eliberarea de
 * stoc si, uneori, rambursarea. Alea sunt decizii ale comerciantului, nu ale
 * curierului. Se semnaleaza, atat.
 */

/** Statusuri care inchid comanda ca LIVRATA. */
const LIVRAT = new Set([5, 54, 58]);

/** Coletul a plecat de la comerciant si e pe drum (ori a incercat sa ajunga). */
const EXPEDIAT = new Set([
  1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  24, 25, 26, 27, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 41, 43, 44, 46, 47,
  53, 55, 56, 57, 59,
  /* Vama: coletul e in retea, doar oprit. */
  60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72,
]);

/**
 * Datele au intrat in sistemul GLS, dar coletul e INCA la comerciant.
 *
 * `51` — „the parcel was not yet handed over to GLS"
 * `52` — datele de ramburs introduse
 *
 * ⚠ NU inseamna „expediat". O comanda marcata expediata aici ar minti clientul,
 * care primeste si email de expediere.
 */
const LA_COMERCIANT = new Set([51, 52]);

/** Coletul s-a intors sau nu mai exista. Comanda NU se inchide singura. */
const NELIVRAT_FINAL = new Set([23, 40, 28, 31, 42]);

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

/** `StatusCode` vine ca sir; aici devine numar, sau `null` daca nu e unul. */
export function codNumeric(statusCode: string | null | undefined): number | null {
  if (statusCode == null) return null;
  const curat = String(statusCode).trim();
  /*
   * ⚠ Sirul gol trebuie oprit AICI, explicit: `Number("")` e 0, iar 0 e intreg.
   * Fara randul asta, un `StatusCode` lipsa ar deveni „codul 0" — un cod care nu
   * exista in Appendix G, deci ar trece drept necunoscut si n-ar face nimic…
   * pana cand cineva ar adauga cândva un inteles pentru 0. Proba a prins-o.
   */
  if (curat === "") return null;
  const n = Number(curat);
  return Number.isInteger(n) ? n : null;
}

/**
 * Statusul comenzii pentru un cod GLS, fara sa tina cont de unde venim.
 *
 * `null` = „nu schimba nimic". Acopera doua situatii diferite, si ambele merita
 * lasate in pace: coduri pe care nu le cunoastem (GLS poate adauga oricand) si
 * coduri care descriu un sfarsit prost, unde decizia e a comerciantului.
 */
export function statusComandaDinCod(statusCode: string | null | undefined): OrderStatus | null {
  const cod = codNumeric(statusCode);
  if (cod === null) return null;
  if (LIVRAT.has(cod)) return "delivered";
  if (LA_COMERCIANT.has(cod)) return "processing";
  if (EXPEDIAT.has(cod)) return "shipped";
  /*
   * Ramura scrisa explicit, nu lasata sa cada in `null` din intamplare: aici
   * sunt sfarsiturile PROASTE (retur, distrus, aruncat). Ele chiar au un
   * inteles, dar decizia — anulare, rambursare, reexpediere — e a
   * comerciantului, nu a curierului. Deci comanda nu se misca, iar
   * `trebuieSemnalat` il anunta.
   */
  if (NELIVRAT_FINAL.has(cod)) return null;
  /* Cod necunoscut: GLS poate adauga oricand. Nu ghicim. */
  return null;
}

/**
 * Ce status primeste comanda dupa un eveniment GLS — sau `null` daca nu se
 * schimba nimic.
 *
 * 1. **Cod necunoscut** → nimic. GLS poate adauga coduri; a le trata pe toate ca
 *    „altceva" ar muta comenzi pe baza unui numar pe care nu-l intelegem.
 * 2. **Comanda incheiata** (`cancelled`, `refunded`) → nu se atinge. Un eveniment
 *    intarziat nu reinvie o comanda anulata sau rambursata.
 * 3. **Nu se coboara.** Statusurile pot sosi in alta ordine decat s-au produs, si
 *    de mai multe ori: un „pe drum" venit dupa „livrat" ar trage comanda inapoi.
 */
export function statusUrmator(statusCurent: string, statusCode: string | null | undefined): OrderStatus | null {
  const tinta = statusComandaDinCod(statusCode);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/**
 * Evenimentele care cer atentia comerciantului, chiar daca nu misca statusul.
 *
 * Sunt lucrurile pe care altfel le afli dupa trei zile, de la client: retur,
 * refuz, adresa gresita, colet distrus, vama blocata. Fiecare cere o decizie
 * OMENEASCA — de aia nu schimbam noi statusul in locul lui.
 */
const DE_SEMNALAT = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 28, 29, 30, 31, 33, 34, 35,
  36, 38, 39, 42, 43, 44, 57, 60, 62, 66, 68, 69, 70, 71, 72,
  /* Returnat expeditorului: cel mai important dintre toate. */
  23, 40,
]);

export function trebuieSemnalat(statusCode: string | null | undefined): boolean {
  const cod = codNumeric(statusCode);
  return cod !== null && DE_SEMNALAT.has(cod);
}

/** Coletul s-a intors la expeditor: marfa vine inapoi, banii nu s-au incasat. */
export function esteRetur(statusCode: string | null | undefined): boolean {
  const cod = codNumeric(statusCode);
  return cod === 23 || cod === 40;
}
