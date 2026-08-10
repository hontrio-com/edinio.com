import { createHmac } from "node:crypto";

/**
 * Unde se pastreaza eticheta GLS.
 *
 * ═══ DE CE E NEVOIE DE ASA CEVA ═══
 *
 * MyGLS intoarce PDF-ul o SINGURA data, la creare. Nu exista „retipareste": un
 * al doilea `PrintLabels` ar crea un al doilea colet, real si facturat. Deci
 * daca nu il salvam noi in clipa aceea, eticheta se pierde definitiv — iar
 * comerciantul ramane cu un colet pe care nu-l poate eticheta.
 *
 * Ceilalti curieri n-au problema asta: la ei PDF-ul se cere oricand, dupa AWB.
 *
 * ═══ ⚠ NU E O POZA DE PRODUS ═══
 *
 * Fisierele din R2 sunt servite public prin CDN, cu `max-age` de un an. Pentru
 * imaginile de produs e chiar ce vrem. Dar o eticheta AWB contine NUMELE,
 * ADRESA si TELEFONUL cumparatorului — date personale ale unui tert, nu ale
 * comerciantului.
 *
 * De aceea cheia nu e ghicibila. `awb/gls/<business>/<comanda>.pdf` ar fi:
 * cine stie doua UUID-uri (si comerciantul le stie pe ale lui, iar un fost
 * angajat la fel) descarca eticheta oricui. Se adauga o semnatura HMAC din
 * secretul serverului, deci cheia nu se poate reconstitui din afara.
 *
 * Pe langa asta, descarcarea trece printr-o ruta care verifica proprietatea
 * magazinului. Cele doua paze sunt independente dinadins: daca vreodata cineva
 * expune public URL-ul, el tot nu poate fi ghicit; daca cineva ghiceste
 * structura, ruta tot cere sesiune.
 */

/**
 * Secretul de semnare.
 *
 * Acelasi tipar ca la simbolurile de cotare a transportului
 * (`lib/shipping/quote-token.ts`): o variabila dedicata daca exista, altfel
 * cheia de service role, care oricum nu paraseste serverul.
 */
function secret(): string {
  return process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Cheia R2 a etichetei, determinista si neghicibila.
 *
 * Determinista fiindca ruta de descarcare trebuie sa o recompuna fara sa fi
 * salvat nimic in plus pe comanda — deci nicio coloana noua si nicio migratie.
 *
 * ⚠ Semnatura intra in NUMELE fisierului, nu intr-un parametru de adresa: un
 * parametru s-ar pierde la prima copiere a linkului, si atunci ar ramane doar
 * cheia ghicibila.
 */
export function cheieEticheta(businessId: string, orderId: string): string {
  const semnatura = createHmac("sha256", secret())
    .update(`gls:eticheta:${businessId}:${orderId}`)
    .digest("hex")
    .slice(0, 24);
  return `awb/gls/${businessId}/${orderId}-${semnatura}.pdf`;
}
