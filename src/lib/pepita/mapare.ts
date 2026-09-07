/**
 * Traducerea valorilor Pepita in valorile Edinio, si inapoi in text pentru om.
 *
 * ⚠ VALOAREA BRUTA NU SE PIERDE NICIODATA. Tot ce se traduce aici se si pastreaza
 * asa cum a venit, in `order_source`. Traducerea e pentru logica noastra; brutul e
 * pentru ziua in care traducerea se dovedeste gresita.
 */

import { LIVRARI_PEPITA, PLATI_PEPITA, STARI_PLATA_PEPITA } from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
   PLATA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Metoda de plata scrisa in `orders.payment_method`.
 *
 * ═══ ⚠ DE CE „cash_on_delivery” SI NU „pepita” LA RAMBURS ═══
 *
 * eMAG scrie „emag”, Trendyol scrie „trendyol”, si acolo e corect: banii ii
 * incaseaza marketplace-ul, comerciantul nu are ce sa ceara la usa.
 *
 * La Pepita cu `cod` NU e asa. Clientul plateste CURIERULUI comerciantului, deci
 * comanda e, in toate privintele care conteaza pentru noi, o comanda cu plata la
 * livrare. Scrisa „pepita”, ar fi cazut pe langa fiecare loc care intreaba daca
 * are ramburs: `dhl.actions.ts` verifica textual `payment_method ===
 * "cash_on_delivery"` ca sa avertizeze ca marfa pleaca fara incasare, iar panoul
 * comenzii ar fi afisat „pepita” acolo unde omul asteapta „Plata la livrare”.
 *
 * ⚠ CELELALTE MODURI raman „pepita”: la card si la transfer banii se duc la ei,
 * iar `cash_on_delivery` ar fi pus curierul sa mai ceara o data aceiasi bani.
 */
export function metodaPlata(modPepita: string | null): string {
  return modPepita === PLATI_PEPITA.cod ? "cash_on_delivery" : "pepita";
}

/**
 * Starea platii, in valorile pe care le primeste `orders_payment_status_check`.
 *
 * ⚠ CELE DOUA GRESELI POSIBILE NU COSTA LA FEL, si de-aia regula nu e simetrica:
 *
 *   „platit” pus gresit pe o comanda neplatita: curierul livreaza si nu incaseaza.
 *   Banii se pierd, si se afla abia la inchiderea lunii.
 *
 *   „neplatit” pus gresit pe o comanda platita: `rambursDeIncasat` pune totalul in
 *   AWB, iar comerciantul il sterge inainte sa emita. Suma e editabila peste tot,
 *   dinadins.
 *
 * ⚠ DAR NU SE CADE ORBESTE PE „neplatit”. Documentatia lor spune despre `paid`:
 * „this status is normally assigned to payment by credit card”. Deci, cand starea
 * lipseste sau vine cu o valoare pe care n-o cunoastem, modul de plata e martorul
 * urmator: cardul inseamna platit, restul nu.
 */
export function starePlata(starePepita: string | null, modPepita: string | null): "paid" | "unpaid" {
  if (starePepita === STARI_PLATA_PEPITA.paid) return "paid";
  if (starePepita === STARI_PLATA_PEPITA.unpaid) return "unpaid";
  return modPepita === PLATI_PEPITA.creditcard ? "paid" : "unpaid";
}

/** Modul de plata e unul dintre cele documentate? Ce nu e, ajunge in fata comerciantului. */
export function modPlataCunoscut(modPepita: string | null): boolean {
  return modPepita != null && Object.prototype.hasOwnProperty.call(PLATI_PEPITA, modPepita);
}

const ETICHETE_PLATA: Record<string, string> = {
  cod: "Ramburs la curier",
  transfer: "Transfer bancar",
  creditcard: "Card",
};

/** Ce scrie in panou despre plata comenzii. */
export function etichetaPlata(modPepita: string | null): string {
  if (!modPepita) return "Nespecificat de Pepita";
  return ETICHETE_PLATA[modPepita] ?? `Necunoscut (${modPepita})`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVRAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const ETICHETE_LIVRARE: Record<string, string> = {
  shipping: "Livrare standard",
  gls: "Curier GLS",
  gls_parcelshop: "GLS ParcelShop",
  mpl: "Curier MPL (Magyar Posta)",
};

/**
 * Ce scrie in panou despre livrare.
 *
 * ⚠ NU SE ALEGE NICIUN CURIER IN LOCUL COMERCIANTULUI, si asta e o hotarare, nu o
 * lipsa. Lista lor („shipping”, „gls”, „gls_parcelshop”, „mpl”) e a pietei
 * UNGARE, iar pentru Romania nu exista una publicata. Peste asta:
 *
 *   - un magazin care n-are integrare GLS ar fi primit o comanda „cu GLS” pe care
 *     n-o poate expedia asa;
 *   - la `gls_parcelshop` NU primim identificatorul punctului de ridicare, deci un
 *     AWB catre „un ParcelShop” n-ar avea unde sa plece.
 *
 * Valoarea lor se ARATA, cu numele ei, si comerciantul alege curierul ca la orice
 * alta comanda. O potrivire ghicita ar fi parut mai desteapta si ar fi trimis
 * colete in gol.
 */
export function etichetaLivrare(modPepita: string | null): string {
  if (!modPepita) return "Nespecificat de Pepita";
  return ETICHETE_LIVRARE[modPepita] ?? `Necunoscut (${modPepita})`;
}

/** Modul de livrare e unul dintre cele documentate? */
export function modLivrareCunoscut(modPepita: string | null): boolean {
  return modPepita != null && Object.prototype.hasOwnProperty.call(LIVRARI_PEPITA, modPepita);
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATUSUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Statusul cu care se naste comanda in Edinio.
 *
 * ⚠ MEREU „pending”, oricare ar fi `status`-ul lor.
 *
 * Documentatia spune despre campul lor: „By default, this is not forwarded, but we
 * can forward any status that triggers an event at the partner store, if
 * required", cu exemplul „new_order”. Adica un camp negarantat, cu valori care se
 * convin de la caz la caz.
 *
 * Nu exista nicio lista de statusuri Pepita pe care sa o traducem, si nu exista
 * niciun drum inapoi prin care sa aflam mai tarziu ce s-a intamplat. Deci o
 * comanda proaspat primita e „in asteptare”, pana cand comerciantul o misca. Orice
 * altceva ar fi o presupunere despre o comanda care abia a intrat.
 */
export function statusInitial(): "pending" {
  return "pending";
}
