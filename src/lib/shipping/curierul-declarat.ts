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

import type { PlanExpedierii } from "./quote-token";

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
/**
 * Planul de expediere PRETINS de comanda care se plaseaza acum.
 *
 * ═══ ⚠ DE CE E UN AJUTOR, SI NU CINCISPREZECE RANDURI LA FIECARE APELANT ═══
 *
 * Campurile astea sunt declarate de DOUA ori in `order.actions.ts` (`:924-985` pentru comanda
 * directa, `:3938-3993` pentru cea din cos) si scrise pe comanda tot de doua ori, in blocuri
 * identice caracter cu caracter. Scris pe loc, ajutorul ar fi fost a treia copie, iar prima
 * schimbare ar fi departat-o de celelalte in tacere.
 *
 * ⚠ SI NU SE VALIDEAZA NIMIC AICI, dinadins. Rostul lui e doar sa ADUNE ce sustine browserul,
 * intr-o forma pe care `verificaCotatia` o poate confrunta cu ce am semnat noi la cotare. Cine
 * hotaraste daca planul e bun e semnatura, nu o lista de valori permise scrisa de mana.
 */
export function planulPretins(d: {
  woot_service_id?: number;
  colete_service_id?: number;
  ecolet_service_slug?: string;
  innoship_courier_id?: number;
  innoship_service_id?: number;
  innoship_option_id?: string;
  smartship_courier_id?: number;
  smartship_own_contract?: boolean;
  smartship_locker_net?: "easybox" | "fanbox";
  shipo_rate_id?: number;
  fedex_service_type?: string;
  ups_service_code?: string;
  dhl_product_code?: string;
  dhl_local_product_code?: string;
  fan_point_type?: string;
}): PlanExpedierii {
  return {
    wootServiceId: d.woot_service_id,
    coleteServiceId: d.colete_service_id,
    ecoletServiceSlug: d.ecolet_service_slug,
    innoshipCourierId: d.innoship_courier_id,
    innoshipServiceId: d.innoship_service_id,
    innoshipOptionId: d.innoship_option_id,
    smartshipCourierId: d.smartship_courier_id,
    smartshipOwnContract: d.smartship_own_contract,
    smartshipLockerNet: d.smartship_locker_net,
    shipoRateId: d.shipo_rate_id,
    fedexServiceType: d.fedex_service_type,
    upsServiceCode: d.ups_service_code,
    dhlProductCode: d.dhl_product_code,
    dhlLocalProductCode: d.dhl_local_product_code,
    fanPointType: d.fan_point_type,
  };
}

export function campuriDeCurier(
  curier: unknown,
  eticheta: unknown,
  tip: unknown,
  zone: ZoneleMagazinului,
  /**
   * Comerciantul are livrarea PORNITA?
   *
   * ═══ ⚠ OBLIGATORIU, SI ULTIMUL, SI NU DIN INTAMPLARE ═══
   *
   * Obligatoriu fiindca optional la coada e exact ce se uita: un apelant nou l-ar fi sarit si ar
   * fi capatat tacut purtarea veche, permisiva. Casa a ales de doua ori tiparul asta cu motivul
   * scris, la `ramburs` si la `grame` din `semneazaOptiuni`. Asa `tsc` enumera apelantii in loc
   * sa-i lase.
   *
   * Ultimul fiindca proba acestei reguli numara chemarile dupa argumentul cu zonele
   * (`curierul-declarat.test.ts`); strecurat inaintea lui, ar fi rupt o cusatura buna.
   *
   * ⚠ SE DA CU `=== true`, NU PE INCREDERE. `updateShippingConfig` e `"use server"`, iar tipul
   * ei nu exista la rulare: o chemare HTTP directa poate trimite orice in campul asta. Aceeasi
   * clasa ca gazdele configurabile care primesc credentiale.
   */
  livrareaEPornita: boolean,
): { courier: string; courier_label?: string; delivery_type?: string } | Record<string, never> {
  /*
   * ⚠ LIVRAREA STINSA INSEAMNA FARA CURIERI, hotarare a proprietarului (14.09.2026).
   *
   * Pana azi comutatorul „Livrare activata" se salva, se reincarca in formular si se arata in
   * admin, dar NU-l citea nimeni: nici cotarea, nici configul public, nici vreunul din cele doua
   * checkout-uri. Stins, optiunile curgeau mai departe.
   *
   * Cotarea intoarce acum lista goala, deci un cumparator cinstit nici n-are ce alege. Randul
   * asta inchide cealalta usa: cine trimite oricum un curier in cerere nu-l mai scrie pe comanda.
   */
  if (livrareaEPornita !== true) return {};
  if (!curierulEDeclaratDeMagazin(curier, zone)) return {};
  return {
    courier: curier as string,
    ...(typeof eticheta === "string" && eticheta.trim() !== "" ? { courier_label: eticheta } : {}),
    ...(tipDeLivrareCunoscut(tip) ? { delivery_type: tip as string } : {}),
  };
}
