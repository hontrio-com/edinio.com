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

/** Destinatia, normalizata, ca sa semneze la fel si la cotare, si la comanda. */
function amprenta(businessId: string, dest: QuoteDestination, price: number): string {
  const parte = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return [
    businessId,
    parte(dest.county),
    parte(dest.city),
    parte(dest.country) || "ro",
    parte(dest.postCode),
    // Doi bani sunt doi bani: semnam in bani, nu in lei cu virgula mobila.
    String(Math.round((Number(price) || 0) * 100)),
  ].join("|");
}

/** Semneaza o optiune de transport. Rezultatul calatoreste pana la comanda. */
export function signShippingQuote(
  businessId: string,
  dest: QuoteDestination,
  price: number,
  expiraLa?: number,
): string {
  const expira = expiraLa ?? Date.now() + VALABILITATE_MS;
  const mac = createHmac("sha256", secret())
    .update(`${amprenta(businessId, dest, price)}|${expira}`)
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
export function semneazaOptiuni<T extends { price: number }>(
  businessId: string,
  dest: QuoteDestination,
  optiuni: T[],
): (T & { token: string })[] {
  return optiuni.map((o) => ({ ...o, token: signShippingQuote(businessId, dest, o.price) }));
}

/** Chiar am cotat noi pretul asta, pentru magazinul si destinatia astea? */
export function verifyShippingQuote(
  businessId: string,
  dest: QuoteDestination,
  price: number,
  token: string | null | undefined,
): boolean {
  if (!token || !businessId) return false;
  const taiat = token.indexOf(".");
  if (taiat <= 0) return false;

  const expira = Number(token.slice(0, taiat));
  if (!Number.isFinite(expira) || expira < Date.now()) return false;

  const asteptat = Buffer.from(signShippingQuote(businessId, dest, price, expira));
  const primit = Buffer.from(token);
  if (asteptat.length !== primit.length) return false;
  try {
    return timingSafeEqual(asteptat, primit);
  } catch {
    return false;
  }
}
