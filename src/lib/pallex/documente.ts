import { createHmac } from "node:crypto";
import type { FelDocument } from "./client";

/**
 * Unde se pastreaza documentele de transport Pall-Ex.
 *
 * ═══ DOUA DOCUMENTE, NU UNUL ═══
 *
 * `GET /consignments/{id}/label` da eticheta care se lipeste pe palet, iar
 * `GET /consignments/{id}/note` da avizul de transport. Amandoua sunt PDF-uri,
 * amandoua se cer de cate ori e nevoie — sunt citiri, nu creari.
 *
 * De aceea copia din CDN NU e aici o plasa de siguranta (ca la GLS, unde
 * eticheta venea odata cu coletul si a doua chemare a metodei de emitere ar fi
 * facut un al doilea colet real). E doar viteza: descarcarea e instantanee, merge
 * si cand ClientPlus e picat, si nu consuma apeluri.
 *
 * ═══ ⚠ NU E O POZA DE PRODUS ═══
 *
 * Fisierele din R2 sunt servite public prin CDN, cu `max-age` de un an. Pentru
 * imaginile de produs e chiar ce vrem. Dar un aviz de transport contine NUMELE,
 * ADRESA si TELEFONUL destinatarului — date personale ale unui tert, nu ale
 * comerciantului.
 *
 * De aceea cheia nu e ghicibila: `awb/pallex/<business>/<comanda>-label.pdf` ar
 * fi fost. Cine stie doua UUID-uri — iar comerciantul le stie pe ale lui, si un
 * fost angajat la fel — ar fi descarcat avizul oricui. Se adauga o semnatura HMAC
 * din secretul serverului, deci cheia nu se poate reconstitui din afara.
 *
 * Pe langa asta, descarcarea trece printr-o ruta care cere sesiune si verifica
 * proprietatea magazinului. Cele doua paze sunt independente dinadins: daca
 * vreodata cineva expune public un URL, el tot nu poate fi ghicit; daca cineva
 * deduce structura, ruta tot cere autentificare.
 */

/**
 * Secretul de semnare.
 *
 * Acelasi tipar ca la GLS si ca la simbolurile de cotare a transportului
 * (`lib/shipping/quote-token.ts`): o variabila dedicata daca exista, altfel cheia
 * de service role, care oricum nu paraseste serverul.
 */
function secret(): string {
  return process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Cheia R2 a unui document, determinista si neghicibila.
 *
 * Determinista fiindca ruta de descarcare trebuie sa o recompuna fara sa fi
 * salvat nimic in plus pe comanda — deci nicio coloana noua si nicio migratie.
 *
 * ⚠ Semnatura intra in NUMELE fisierului, nu intr-un parametru de adresa: un
 * parametru s-ar pierde la prima copiere a linkului, si atunci ar ramane doar
 * cheia ghicibila.
 *
 * ⚠ Si sirul semnat, si prefixul contin numele curierului. Copiate de la GLS,
 * doua documente ale unor curieri diferiti pe ACEEASI comanda ar fi ajuns la
 * aceeasi cheie si s-ar fi suprascris — iar stergerea la anularea uneia ar fi
 * sters-o pe a celeilalte. La fel, `fel` intra in semnatura: altfel eticheta si
 * avizul aceleiasi comenzi ar fi impartit fisierul.
 */
export function cheieDocument(
  businessId: string,
  orderId: string,
  fel: FelDocument,
): string {
  const semnatura = createHmac("sha256", secret())
    .update(`pallex:document:${fel}:${businessId}:${orderId}`)
    .digest("hex")
    .slice(0, 24);
  return `awb/pallex/${businessId}/${orderId}-${fel}-${semnatura}.pdf`;
}

/** Numele sub care se descarca fisierul, pentru comerciant. */
export function numeFisier(fel: FelDocument, awb: string): string {
  const eticheta = fel === "label" ? "eticheta" : "aviz";
  /* Codul Pall-Ex are litere si cifre, dar o comanda veche poate purta orice: se
     curata, ca sa nu iasa un nume de fisier pe care sistemul de operare il refuza. */
  const curat = awb.replace(/[^A-Za-z0-9._-]/g, "") || "partida";
  return `${eticheta}-pallex-${curat}.pdf`;
}
