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
 * ⚠ LIVRAREA E DUSA DE PEPITA, nu de curierul comerciantului?
 *
 * ═══ CE SPUNE SELLER CENTER-UL LOR, PE PAGINA ROMANEASCA (18.06.2025) ═══
 *
 * „GLS locker delivery: Livrarea este efectuata de firma de curierat GLS care are
 * contract cu Pepita. (Pepita Delivery Program)", si la fel „GLS home delivery".
 * Pe cand: „General delivery: Coletul este livrat de firma de curierat aleasa de
 * tine si cu care ai contract direct", iar MPL la fel.
 *
 * Deosebirea nu e cosmetica: de ea atarna CINE incaseaza rambursul.
 */
export function esteLivrarePepita(modLivrare: string | null): boolean {
  return modLivrare === LIVRARI_PEPITA.gls || modLivrare === LIVRARI_PEPITA.gls_parcelshop;
}

/**
 * ⚠ BANII AJUNG LA PEPITA, deci comerciantul NU are ce incasa la usa?
 *
 * ═══ CE COSTA UN RASPUNS GRESIT: CLIENTUL PLATESTE DE DOUA ORI ═══
 *
 * Textul lor, pe pagina romaneasca:
 *
 *   „In cazul comenzilor Pepita Delivery (momentan automat de colet GLS sau
 *    livrare GLS la adresa), suma ramburs ajunge la Pepita."
 *   „In cazul curierilor proprii sau al serviciilor terte (inclusiv MPL),
 *    decontarea se face direct intre tine si compania de curierat."
 *   „Transferul nu ajunge la Pepita, ci direct la voi."
 *
 * Deci exista UN SINGUR caz in care comerciantul incaseaza la livrare: ramburs dus
 * de curierul LUI. Pana la reparatia asta, orice comanda cu `cod` primea
 * `cash_on_delivery`, iar `rambursDeIncasat` precompleta totalul pe AWB: la o
 * comanda GLS, clientul ar fi platit o data curierului Pepita si inca o data
 * curierului comerciantului.
 *
 * ⚠ SI TRANSFERUL nu se incaseaza la usa, DACA A FOST FACUT: banii vin la comerciant prin
 * banca, in avans. Un AWB cu ramburs acolo ar cere a doua oara aceiasi bani.
 *
 * ⚠ DAR „TRANSFER" NU INSEAMNA „PLATIT", si aici era defectul reparatiei dintai. Functia
 * raspundea `true` pentru ORICE mod care nu e `cod`, deci si pentru un transfer NEFACUT sau
 * un card refuzat. `rambursDeIncasat` iese pe zero inaintea oricarei socoteli cand vede
 * marcajul, deci marfa ar fi plecat cu ramburs 0,00 la o comanda pe care nu o platise nimeni:
 * nici Pepita n-avea banii („Transferul nu ajunge la Pepita, ci direct la voi"), nici curierul
 * n-avea ce sa ceara. De aceea starea platii intra in socoteala, si e un argument CERUT: asa
 * `tsc` numeste fiecare apelant, in loc sa-l lase sa treaca pe langa schimbarea de inteles.
 */
export function incaseazaPepita(
  modPlata: string | null, modLivrare: string | null, starePlatii: "paid" | "unpaid",
): boolean {
  if (modPlata === PLATI_PEPITA.cod) return esteLivrarePepita(modLivrare);
  /*
   * Card platit: banii sunt la Pepita. Transfer facut: la comerciant, prin banca. In amandoua
   * cazurile, la usa nu se incaseaza nimic. Neplatit inseamna ca banii nu sunt la nimeni, si
   * atunci hotararea ramane a lui `payment_status`, adica a lui `rambursDeIncasat`.
   */
  return starePlatii === "paid";
}

/**
 * Metoda de plata scrisa in `orders.payment_method`.
 *
 * ═══ ⚠ „cash_on_delivery" NUMAI CAND CURIERUL COMERCIANTULUI CHIAR INCASEAZA ═══
 *
 * eMAG scrie „emag", Trendyol scrie „trendyol", si acolo e corect: banii ii
 * incaseaza marketplace-ul, comerciantul nu are ce sa ceara la usa.
 *
 * La Pepita depinde de LIVRARE, nu doar de plata. Ramburs dus de curierul lui
 * inseamna o comanda cu plata la livrare in toate privintele care conteaza:
 * `dhl.actions.ts` verifica textual `payment_method === "cash_on_delivery"` ca sa
 * avertizeze ca marfa pleaca fara incasare, iar panoul afiseaza „Plata la livrare".
 *
 * ⚠ Ramburs dus de GLS-ul Pepita NU e asa, si scris tot „cash_on_delivery" ar fi
 * pus curierul comerciantului sa ceara a doua oara bani deja incasati.
 */
export function metodaPlata(modPepita: string | null, modLivrare: string | null): string {
  return modPepita === PLATI_PEPITA.cod && !esteLivrarePepita(modLivrare)
    ? "cash_on_delivery"
    : "pepita";
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
  gls: "Curier GLS la adresa (livrare Pepita)",
  /* ⚠ „csomagautomata" in documentatia lor maghiara inseamna AUTOMAT DE COLET, nu parcel
     shop, iar pagina romaneasca scrie „automat de colet GLS". Numele campului lor induce
     in eroare, deci eticheta arata ce e cu adevarat. */
  gls_parcelshop: "Automat de colet GLS (livrare Pepita)",
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
