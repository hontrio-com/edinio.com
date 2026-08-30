import { createHmac } from "node:crypto";

/**
 * Unde se pastreaza eticheta GLS.
 *
 * ═══ DE CE E NEVOIE DE ASA CEVA ═══
 *
 * `PrintLabels` intoarce PDF-ul la creare, si NU se cheama a doua oara pentru
 * aceeasi comanda: ar face un al DOILEA colet, real si facturat.
 *
 * ⚠ Corectare (2026-08-27, dupa documentatia MyGLS ver. 25.12.11): prima forma a
 * fisierului spunea ca eticheta se pierde definitiv daca n-o salvam atunci. NU e
 * adevarat — asa se poarta pluginul de WooCommerce, nu API-ul. Exista
 * `GetPrintedLabels`, care da eticheta din nou fara sa creeze nimic; cere insa
 * `ParcelId` (pastrat in registrul de operatii) si inca un drum pana la GLS.
 *
 * Salvarea pe CDN ramane deci buna, dar din alte motive decat credeam:
 * descarcarea e instantanee, merge si cand MyGLS e picat, si nu consuma apeluri.
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
  const s = process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  /*
   * ⚠ ARUNCA. Nu cade pe sirul gol.
   *
   * Cu `""`, `createHmac` merge mai departe si scoate tot 24 de caractere
   * hexazecimale — deci nimic, nici o proba de pornire, nici testele, nu
   * deosebeste o cheie neghicibila de una pe care o poate calcula oricine cu
   * cele doua UUID-uri. Iar fisierul de sub cheia aia e o eticheta AWB: numele,
   * adresa si telefonul CUMPARATORULUI, intr-un bucket servit public prin CDN.
   *
   * O degradare de securitate invizibila e mai rea decat o eroare zgomotoasa: aici
   * emiterea se opreste, comerciantul vede un mesaj, si cineva pune variabila.
   */
  if (!s) {
    throw new Error(
      "Lipseste secretul de semnare a etichetelor (SHIPPING_QUOTE_SECRET sau "
      + "SUPABASE_SERVICE_ROLE_KEY). Fara el, cheia din CDN a etichetei — care contine "
      + "datele cumparatorului — ar fi ghicibila.",
    );
  }
  return s;
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
export function cheieEticheta(
  businessId: string,
  orderId: string,
  /**
   * ⚠ Extensia intra SI in cheie, SI in sirul semnat.
   *
   * Formatele Zebra (`ThermoZPL`, `ThermoZPL_300DPI`, `ShipItThermoZpl`) intorc
   * ZPL, adica text de imprimanta, nu PDF. Salvat sub `.pdf` si servit cu
   * `application/pdf`, cititorul spune „fisier deteriorat" si comerciantul n-are
   * cum sa lege asta de formatul ales in configurare.
   *
   * Si daca extensia n-ar intra in semnatura, PDF-ul si ZPL-ul aceleiasi comenzi
   * ar avea cheia identica pana la extensie — iar o schimbare de format ar
   * suprascrie fisierul vechi cu unul de alt fel.
   */
  ext: "pdf" | "zpl" = "pdf",
): string {
  const semnatura = createHmac("sha256", secret())
    .update(`gls:eticheta:${businessId}:${orderId}:${ext}`)
    .digest("hex")
    .slice(0, 24);
  return `awb/gls/${businessId}/${orderId}-${semnatura}.${ext}`;
}

/**
 * Toate cheile sub care poate sta eticheta unei comenzi.
 *
 * ⚠ La stergere se incearca TOATE: comerciantul poate fi schimbat formatul intre
 * emitere si anulare, iar o eticheta ramasa in urma inseamna datele unui
 * cumparator lasate intr-un bucket public. Cheia veche, nesemnata cu extensia, e
 * si ea in lista — altfel etichetele emise pana acum n-ar mai putea fi sterse
 * niciodata de nicio cale din cod.
 */
export function cheiEticheta(businessId: string, orderId: string): string[] {
  const vechea = `awb/gls/${businessId}/${orderId}-${createHmac("sha256", secret())
    .update(`gls:eticheta:${businessId}:${orderId}`)
    .digest("hex")
    .slice(0, 24)}.pdf`;
  return [cheieEticheta(businessId, orderId, "pdf"), cheieEticheta(businessId, orderId, "zpl"), vechea];
}
