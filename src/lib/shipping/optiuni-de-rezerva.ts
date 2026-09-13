/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O REZERVA LA 0 LEI NU E O OFERTA                            (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cand un curier care trebuia sa COTEZE LIVE nu raspunde (zero oferte, eroare, sau plafonul
 * de timp al cotarii), `getShippingOptions` ii pune o optiune la `shipping_zones[curier].price`
 * si o SEMNEAZA. Pentru cele mai multe magazine numarul acela e tariful pe care comerciantul
 * l-a scris singur, deci degradarea e chiar ce a ales el.
 *
 * ⚠ DAR NU PESTE TOT, SI ASTA S-A MASURAT. Pe 13.09.2026, din 129 de magazine, cinci perechi
 * magazin-curier coteaza live printr-un API de tarif. Una dintre ele, `okxi` (VetDepo, 142 de
 * comenzi, activa chiar azi), are zona Sameday pornita cu `price: 0`. Acolo cade urmatorul
 * lucru:
 *
 *   1. Sameday nu raspunde la timp;
 *   2. se pune o optiune „Sameday, 0,00 lei" si se SEMNEAZA;
 *   3. cumparatorul o alege, fiindca e cea mai ieftina;
 *   4. la comanda, `verificaCotatia` spune „da, noi am cotat asta" (chiar noi am semnat-o),
 *      deci rezerva `max(suma ceruta, tarif implicit)` NU se aprinde;
 *   5. comanda pleaca cu transport 0, iar comerciantul plateste cursa.
 *
 * Zero nu e o degradare aleasa de nimeni: e livrare gratuita pe care comerciantul n-a
 * aprobat-o. Un tarif de rezerva REAL (17, 18, 20) ramane, fiindca el chiar l-a scris.
 *
 * ⚠ DE CE NU SE TAIE TOATE REZERVELE. Ar parea mai curat, dar ar scoate curierul din lista
 * exact la magazinele care si-au configurat un tarif de rezerva tocmai pentru cazul asta.
 * Precedentul din casa e la international (`shipping.actions.ts`, ramura `doarTarifeFixe`):
 * acolo nu exista tarif intern de rezerva, deci se raspunde cu lista GOALA in loc sa se
 * inventeze un pret. Aceeasi judecata, aplicata la un caz mai ingust.
 */

/**
 * Curierii care NU au nicio metoda de tarif in API-ul lor.
 *
 * ⚠ Packeta si Posta sunt aici fiindca preturile lor vin din contract, nu dintr-o grila
 * apelabila; Pall-Ex la fel (OpenAPI 1.0.5 n-are nicio metoda de tarif). `pickup` si `own`
 * nu ies niciodata din casa. Pentru toti acestia `price` din zona E pretul, nu o rezerva,
 * deci regula de mai jos nu-i priveste: un `pickup` la 0 lei e chiar ce a vrut omul.
 */
export const FARA_API_DE_TARIF = new Set(["pickup", "own", "gls", "pallex", "posta", "packeta"]);

/**
 * Se pastreaza optiunea asta de rezerva?
 *
 * @param courierId identificatorul curierului din `shipping_zones`
 * @param pret pretul optiunii care ar pleca semnata
 * @param coteazaLive zona cerea tarif viu (`auto_price !== false`), deci optiunea E o rezerva
 *
 * ⚠ `coteazaLive` se calculeaza de apelant, fiindca acolo se stie si daca plafonul de cereri
 * a trecut tot magazinul pe tarife fixe. O zona trecuta pe fix de plafon nu e o rezerva
 * dupa un esec, e chiar pretul magazinului.
 */
export function rezervaEDeIncredere(courierId: string, pret: number, coteazaLive: boolean): boolean {
  if (!coteazaLive) return true;
  if (FARA_API_DE_TARIF.has(courierId)) return true;
  /* ⚠ `> 0`, nu `>= 0`: exact zero e cazul masurat. Negativ n-ar trebui sa existe, dar daca
     apare vreodata dintr-o setare stricata, n-are ce cauta intr-o oferta semnata. */
  return Number.isFinite(pret) && pret > 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUMA RAMBURSULUI NU COBOARA SUB CE SUSTINE CATALOGUL     (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Suma de ramburs vine de la browser si intra DIRECT in cererea catre curier; din ea iese
 * comisionul de ramburs, deci ea misca pretul care pleaca apoi SEMNAT.
 *
 * ⚠ CE ERA DEJA INCHIS, ca sa nu se repare de doua ori. Cazul `cod: 0` cadea deja: cotatia se
 * semneaza atunci cu regimul „platit”, iar la comanda regimul se ia din metoda de plata
 * validata pe server, deci semnatura nu mai bate si comanda cere recotare. Ce ramanea deschis
 * era numit pe fata in `quote-token.ts`: `cod: 0.01` pastreaza steagul si scapa de partea
 * PROCENTUALA a comisionului.
 *
 * ⚠ DE CE UN PRAG, SI NU O INLOCUIRE. Formularul trimite la ramburs TOTALUL comenzii (marfa
 * plus transport), iar `valoareMarfii` e doar marfa, plafonata cu ce sustine catalogul. Pusa
 * IN LOCUL sumei, ar fi coborat rambursul cotat sub cel real ori de cate ori transportul intra
 * in el, si diferenta de comision ar fi platit-o comerciantul. Un prag nu poate cobori nimic:
 * pentru orice cumparator cinstit totalul e deja mai mare, deci se intoarce chiar numarul lui
 * si nicio comanda reala nu-si schimba pretul. Masurat pe 14.09.2026: 234 de comenzi cu
 * ramburs, 17 magazine, 214 in ultimele 90 de zile, niciuna atinsa.
 *
 * ⚠ SI DE CE NU E O INCHIDERE DEPLINA. Plafonul din catalog nu cunoaste transportul, deci cine
 * subdeclara ramane dator cu comisionul aferent transportului, nu cu tot. Inchiderea deplina
 * cere suma finala, care la cotare inca nu exista: ea contine chiar transportul pe care il
 * cotam. Ce se inchide sigur e subdeclararea MARFII, care e partea mare.
 *
 * @param cerutDeBrowser suma trimisa de client (orice, inclusiv lipsa sau text)
 * @param valoareMarfii `min(subtotal cerut, plafonul din catalog)`, socotita de server
 * @param esteRamburs comanda chiar se incaseaza la livrare
 */
export function pragulRambursului(
  cerutDeBrowser: unknown,
  valoareMarfii: number,
  esteRamburs: boolean,
): number {
  /* ⚠ Fara ramburs se cere ZERO, nu suma. Altfel fiecare cotatie platita in avans ar fi cerut
     curierului comisionul de ramburs, adica un pret mai mare la toata lumea. */
  if (!esteRamburs) return 0;

  const cerut = Number(cerutDeBrowser);
  const marfa = Number(valoareMarfii);
  /* ⚠ `Number.isFinite` la amandoua: `Number(undefined)` e `NaN`, iar `Math.max` cu un `NaN`
     intoarce `NaN`, care ar fi plecat ca atare in cererea catre curier. */
  return Math.max(
    0,
    Number.isFinite(cerut) ? cerut : 0,
    Number.isFinite(marfa) ? marfa : 0,
  );
}
