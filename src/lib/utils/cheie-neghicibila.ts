import { createHmac } from "node:crypto";

/**
 * Semnatura care face neghicibila cheia unui fisier din depozitul PUBLIC.
 *
 * ⚠ DE CE E NEVOIE. Depozitul R2 e servit public prin CDN: nu exista autentificare la
 * mijloc, deci ADRESA fisierului e singura lui paza. Pentru o poza de produs e chiar ce
 * vrem. Pentru o factura sau o eticheta AWB — care poarta numele si adresa CUMPARATORULUI,
 * date personale ale unui tert — o cheie compusa doar din id-uri pe care le stie
 * comerciantul (si un fost angajat la fel) e mai slaba decat ar trebui.
 *
 * ⚠ CE NU REZOLVA. Adresa ramane o CAPABILITATE: cine o are, o poate folosi. Trebuie asa,
 * fiindca marketplace-ul vine singur sa ia documentul si n-avem cum sa-i cerem sesiune.
 * Ce se schimba e ca adresa nu mai poate fi RECONSTRUITA din datele comenzii.
 *
 * Acelasi tipar ca la etichetele GLS (`lib/gls/eticheta.ts`) si ca la simbolurile de
 * cotare a transportului (`lib/shipping/quote-token.ts`). GLS isi pastreaza forma proprie
 * dinadins: acolo cheia se RECOMPUNE la stergere, deci formatul ei nu se poate schimba
 * fara sa ramana etichete vechi de negasit.
 */
export function semnaturaCheii(context: string): string {
  const s = process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  /*
   * ⚠ ARUNCA. Nu cade pe sirul gol.
   *
   * Cu `""`, `createHmac` merge mai departe si scoate tot 24 de caractere hexazecimale —
   * deci nimic, nici o proba de pornire, nici testele, n-ar deosebi o cheie neghicibila de
   * una pe care o poate calcula oricine. O degradare de securitate invizibila e mai rea
   * decat o eroare zgomotoasa: aici emiterea se opreste si cineva pune variabila.
   */
  if (!s) {
    throw new Error(
      "Lipseste secretul de semnare a cheilor de fisier (SHIPPING_QUOTE_SECRET sau "
      + "SUPABASE_SERVICE_ROLE_KEY). Fara el, adresa documentului — care contine datele "
      + "cumparatorului — ar fi reconstruibila din datele comenzii.",
    );
  }
  return createHmac("sha256", s).update(context).digest("hex").slice(0, 24);
}
