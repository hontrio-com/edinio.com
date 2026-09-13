/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CURIERUL SCRIS PE COMANDA TREBUIE SA FIE UNUL AL MAGAZINULUI    (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `selected_courier`, `courier_label` si `delivery_type` vin din browser
 * (`OrderModal.tsx`) si se scriu pe comanda fara nicio verificare
 * (`order.actions.ts`, de doua ori: si la comanda directa, si la cea din cos).
 *
 * ⚠ DE CE NU LE APARA SEMNATURA COTATIEI, desi le acopera. `autoritativeShipping`
 * intoarce doar un NUMAR. Cand semnatura bate, pretul e al nostru si optiunea e
 * confruntata; dar pe CELELALTE drumuri, functia nu-i spune niciodata apelantului
 * ca optiunea pretinsa n-a fost verificata, si atunci campurile se scriu oricum:
 *
 *   - livrarea e gratuita (prag sau cupon): `esteGratuit` taie scurt inaintea
 *     oricarei verificari, fiindca browserul trimite zero si niciun token semnat
 *     pe pretul curierului n-ar avea cum sa bata;
 *   - semnatura nu bate si se cade pe `max(suma ceruta, tarif implicit)`.
 *
 * ⚠ CE E SI CE NU E IN JOC. Banii NU sunt: pe drumul gratuit transportul e zero,
 * iar pe celalalt suma e deja plafonata de tariful comerciantului. In joc e
 * IDENTITATEA expedierii, care pleaca mai departe: numele curierului ajunge pe
 * randul de transport al facturii, in emailul cumparatorului, in panoul
 * comerciantului si in alegerea punctului de ridicare.
 *
 * ═══ ⚠ SE CERE SA EXISTE CHEIA, NU SA FIE SI PORNITA ═══
 *
 * Masurat pe 14.09.2026, pe cele 254 de comenzi care poarta un curier:
 *
 *   woot 216 · pickup 12 · own 11 · sameday 8 · dpd 4 · cargus 2 · gls 1
 *
 *   - **zero** poarta o cheie care nu exista in `shipping_zones`. Deci regula de
 *     mai jos n-ar fi luat curierul NICIUNEI comenzi reale de pana acum;
 *   - dar **doua** comenzi `own` stau pe o zona care azi nu mai e pornita.
 *
 * Cele doua sunt chiar cursa dintre checkout si setarile comerciantului: omul
 * inchide o zona cat timp un cumparator e in finalizare. Ceruta si pornirea,
 * regula ar fi taiat acolo o vanzare cinstita, si asta nu e un schimb bun pentru
 * inchiderea unei fabricari care nu s-a intamplat inca niciodata.
 *
 * Aceeasi judecata ca la `autoritativeShipping`, scrisa acolo pe fata: o cotatie
 * pierduta nu are voie sa coste o vanzare.
 *
 * ═══ ⚠ SI DE CE NU REFUZA COMANDA ═══
 *
 * Regula spune doar daca se SCRIE curierul, nu daca se primeste comanda. O cheie
 * fabricata nu e o informatie pe care comerciantul ar vrea-o: scrisa, ii arata in
 * panou un curier pe care nu-l are. Lasata deoparte, comanda intra ca oricare
 * alta fara curier ales, drum care exista oricum si azi (`data.selected_courier`
 * e optional in `OrderInput`).
 */

/**
 * Tipurile de livrare pe care le produce chiar cotarea noastra.
 *
 * ⚠ `getShippingOptions` scrie `deliveryType` cu una din cele doua valori si cu
 * nimic altceva. Sirul liber ajungea pe comanda si de acolo in formularele de AWB.
 */
export const TIPURI_DE_LIVRARE = new Set(["address", "locker"]);

/** Forma minima a unei zone din `shipping_zones`, cat trebuie regulii. */
export type ZoneleMagazinului = Record<string, { enabled?: boolean; price?: number }> | null | undefined;

/**
 * Curierul asta e unul dintre curierii declarati de magazin?
 *
 * ⚠ `Object.prototype.hasOwnProperty.call`, nu `zone[curier] !== undefined`: altfel
 * `constructor`, `toString` sau `__proto__` trimise din browser ar fi raspuns „da"
 * de pe lantul de prototipuri, si tocmai un sir ales anume ar fi trecut de poarta.
 *
 * ⚠ Si `shipping_zones` are DOUA forme in productie: obiect la 19 magazine, array
 * gol la 110. Un array nu are cheile cerute, deci raspunsul e „nu", ceea ce e si
 * corect: un magazin fara nicio zona n-a declarat niciun curier.
 */
export function curierulEDeclaratDeMagazin(curier: unknown, zone: ZoneleMagazinului): boolean {
  if (typeof curier !== "string" || curier.trim() === "") return false;
  if (!zone || typeof zone !== "object" || Array.isArray(zone)) return false;
  return Object.prototype.hasOwnProperty.call(zone, curier);
}

/** Tipul de livrare e unul dintre cele pe care le producem noi? */
export function tipDeLivrareCunoscut(tip: unknown): boolean {
  return typeof tip === "string" && TIPURI_DE_LIVRARE.has(tip);
}

/**
 * Campurile de curier care au voie sa ajunga pe comanda.
 *
 * Intoarce un obiect gol cand curierul nu e al magazinului: raspandit cu `...`, el
 * nu scrie nimic, deci comanda intra ca una fara curier ales.
 *
 * ⚠ `courier_label` NU se valideaza si nu se poate: el poarta lucruri pe care
 * comanda nu le mai stie (sufixul de locker, numele transportatorului real al unui
 * broker, tara la international). Dar nu mai poate insoti un curier fabricat,
 * fiindca pleaca odata cu el sau deloc.
 *
 * ⚠ Tipul de livrare se curata SEPARAT: un curier adevarat cu un tip inventat
 * ramane o comanda buna cu un camp de aruncat, nu o comanda de refuzat.
 */
export function campuriDeCurier(
  curier: unknown,
  eticheta: unknown,
  tip: unknown,
  zone: ZoneleMagazinului,
): { courier: string; courier_label?: string; delivery_type?: string } | Record<string, never> {
  if (!curierulEDeclaratDeMagazin(curier, zone)) return {};
  return {
    courier: curier as string,
    ...(typeof eticheta === "string" && eticheta.trim() !== "" ? { courier_label: eticheta } : {}),
    ...(tipDeLivrareCunoscut(tip) ? { delivery_type: tip as string } : {}),
  };
}
