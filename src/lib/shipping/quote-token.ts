import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cotatie de transport semnata.
 *
 * Costul livrarii era singurul numar din comanda pe care serverul il lua de la
 * client fara sa il verifice: preturile produselor, reducerea, TVA-ul,
 * extraoptiunile si reducerea de card se recalculeaza toate server-side, dar
 * transportul se scria asa cum venea. Cine trimitea zero primea livrare gratuita,
 * iar comerciantul platea oricum curierul.
 *
 * Verificarea nu se poate face recalculand la plasarea comenzii: pretul vine de
 * la API-urile curierilor, deci ar insemna inca un apel extern exact in pasul cu
 * banii, cu latenta si cu un mod nou de esec. Semnam in schimb fiecare optiune
 * chiar cand o calculam, iar la comanda verificam semnatura. E O(1), fara retea,
 * si exact — acelasi tipar cu tokenul de IPN Netopia.
 *
 * Semnatura leaga pretul de magazin SI de destinatie: altfel cineva ar cere o
 * cotatie pentru un oras apropiat si ar folosi-o pentru unul scump. Are si
 * termen de valabilitate, ca o cotatie veche sa nu poata fi refolosita la
 * nesfarsit dupa ce comerciantul si-a schimbat tarifele.
 */
function secret(): string {
  return process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/** Cat timp ramane valabila o cotatie. Acopera lejer o sesiune de cumparaturi. */
const VALABILITATE_MS = 24 * 60 * 60 * 1000;

export interface QuoteDestination {
  county?: string | null;
  city?: string | null;
  country?: string | null;
  postCode?: string | null;
}

/**
 * Optiunea careia ii apartine pretul.
 *
 * Fara ea, semnatura spunea doar „am cotat noi suma asta pentru destinatia asta",
 * si toate optiunile aceleiasi destinatii se legitimau reciproc. „Ridicare
 * personala" produce mereu o optiune de 0 lei, semnata valid: cu tokenul ei si
 * `shipping_cost: 0` se putea comanda livrare la domiciliu. Cinci magazine
 * publicate au pickup pornit langa curieri platiti — tonel-beauty (0 langa
 * Cargus 17 si DPD 18), ciprian-piese-auto-brasov, esafero (0 langa 45),
 * yulmis-sound, medclean — deci comerciantul platea toata cursa.
 */
export interface QuoteOption {
  courier?: string | null;
  deliveryType?: string | null;
  /**
   * Eticheta, semnata si ea.
   *
   * E textul pe care il citeste OMUL: in panou, in emailul de comanda noua si pe
   * randul de transport al facturii. Lasat sir liber de la client, legarea
   * curierului nu ajungea: se trimitea tokenul valid de „Ridicare personala"
   * (0 lei) cu eticheta „Livrare prin Cargus", si comerciantul citea Cargus
   * langa un transport de 0,00.
   *
   * Se SEMNEAZA in loc sa se deduca fiindca eticheta poarta lucruri pe care
   * comanda nu le mai stie: sufixul de locker („Sameday EasyBox (locker)"),
   * numele transportatorului real al unui broker si tara la international
   * („DPD International (Germania)"). Dedusa, toate astea se pierdeau.
   */
  courierLabel?: string | null;
}

/** Cotatia, normalizata, ca sa semneze la fel si la cotare, si la comanda. */
function amprenta(businessId: string, dest: QuoteDestination, price: number, optiune: QuoteOption): string {
  const parte = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return [
    businessId,
    parte(dest.county),
    parte(dest.city),
    parte(dest.country) || "ro",
    parte(dest.postCode),
    // Doi bani sunt doi bani: semnam in bani, nu in lei cu virgula mobila.
    String(Math.round((Number(price) || 0) * 100)),
    parte(optiune.courier),
    parte(optiune.deliveryType),
    parte(optiune.courierLabel),
  ].join("|");
}

/** Semneaza o optiune de transport. Rezultatul calatoreste pana la comanda. */
export function signShippingQuote(
  businessId: string,
  dest: QuoteDestination,
  price: number,
  optiune: QuoteOption,
  expiraLa?: number,
): string {
  const expira = expiraLa ?? Date.now() + VALABILITATE_MS;
  const mac = createHmac("sha256", secret())
    .update(`${amprenta(businessId, dest, price, optiune)}|${expira}`)
    .digest("base64url");
  return `${expira}.${mac}`;
}

/**
 * Semneaza TOATE optiunile unei liste, intr-un singur loc.
 *
 * `getShippingOptions` are mai multe iesiri: una pentru international, care taie
 * scurt inainte de bucla de curieri interni, si una la final. Cat timp semnarea
 * statea doar pe cea de la final, ramura internationala pleca fara token — si
 * atunci comanda cadea pe tariful implicit intern al magazinului, 18 lei in loc
 * de 95,84 pentru un colet in Germania.
 *
 * Trecute amandoua prin ajutorul asta, o optiune nesemnata nu mai poate pleca
 * dintr-o iesire noua fara ca cineva sa scrie explicit alt drum.
 */
export function semneazaOptiuni<T extends { price: number; courier?: string; deliveryType?: string; courierLabel?: string }>(
  businessId: string,
  dest: QuoteDestination,
  optiuni: T[],
): (T & { token: string })[] {
  return optiuni.map((o) => ({
    ...o,
    token: signShippingQuote(businessId, dest, o.price, {
      courier: o.courier, deliveryType: o.deliveryType, courierLabel: o.courierLabel,
    }),
  }));
}

/**
 * Chiar am cotat noi pretul asta, pentru magazinul, destinatia SI optiunea astea?
 */
export function verifyShippingQuote(
  businessId: string,
  dest: QuoteDestination,
  price: number,
  token: string | null | undefined,
  optiune: QuoteOption,
): boolean {
  if (!token || !businessId) return false;
  const taiat = token.indexOf(".");
  if (taiat <= 0) return false;

  const expira = Number(token.slice(0, taiat));
  if (!Number.isFinite(expira) || expira < Date.now()) return false;

  const asteptat = Buffer.from(signShippingQuote(businessId, dest, price, optiune, expira));
  const primit = Buffer.from(token);
  if (asteptat.length !== primit.length) return false;
  try {
    return timingSafeEqual(asteptat, primit);
  } catch {
    return false;
  }
}
