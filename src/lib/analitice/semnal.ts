/*
  Semnalele de palnie trimise din browser: „adaugat in cos" si „a inceput comanda in fereastra".

  ⚠ DE CE STA AICI, SI NU IN `CartProvider`.

  Providerul are o regula aparata de proba (`cosul-nu-arata-un-pret-nevalidat`):
  acolo nu are voie sa existe niciun `.catch(() => {})`, fiindca exact asa a fost
  inghitit odata esecul cererii de preturi, iar omul nu putea afla de ce nu-i
  apar preturile. Regula ramane buna si nu se ocoleste.

  Aici, insa, inghitirea e chiar raspunsul corect: masurarea n-are voie nici sa
  intarzie adaugarea in cos, nici sa o strice daca reteaua cade. Cosul e drumul
  catre bani; analitica e doar o observatie despre el.

  ⚠ `keepalive`, ca cererea sa plece si daca omul apasa imediat „Finalizeaza" si
  pagina se schimba dedesubt.
*/

/**
 * Evenimentele de palnie pe care ruta `/api/analitice/eveniment` le primeste din browser. Ruta le RECUNOASTE si semnalul
 * le TRIMITE prin aceeasi lista: adaugat intr-o parte, un fel nou nu se poate desparti de cealalta.
 *
 * ⚠ `purchase` NU intra aici niciodata: scris din browser, oricine si-ar putea desena rata de conversie. Nici `visit`
 * ori `product_view`: ele se scriu la randare, pe server.
 */
export const FELURI_DIN_BROWSER = ["add_to_cart", "begin_checkout"] as const;
export type FelDinBrowser = (typeof FELURI_DIN_BROWSER)[number];

function trimite(fel: FelDinBrowser, businessId: string | undefined, productId: string | null): void {
  if (!businessId || typeof window === "undefined") return;

  void fetch("/api/analitice/eveniment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      businessId,
      fel,
      ...(productId ? { productId } : {}),
      path: window.location.pathname,
    }),
    keepalive: true,
  }).then(
    () => undefined,
    () => undefined,
  );
}

export function semnaleazaAdaugareaInCos(businessId: string | undefined, productId: string | undefined): void {
  if (!productId) return;
  trimite("add_to_cart", businessId, productId);
}

/**
 * „A inceput comanda", cand formularul de comanda se deschide intr-o FEREASTRA (20.11.2026).
 *
 * Pe magazinele cu pagina de comanda, evenimentul il scrie serverul cand randeaza `/checkout`. Pe cele cu formularul in
 * fereastra nu se randeaza nicio pagina, deci nu-l scria nimeni: „Checkout-uri incepute" din Statistici statea pe 0 la
 * toate aceste magazine, adica la cele mai multe. Se cheama din cele patru locuri care deschid fereastra (sertarul
 * cosului de pe prima pagina si de pe celelalte pagini, pagina cosului, formularul rapid de pe pagina de produs), langa
 * evenimentele trimise acolo pixelilor; NU si de pe pagina de comanda, unde ar dubla randul scris de server.
 *
 * `productId` doar la formularul rapid, unde comanda e a unui singur produs.
 */
export function semnaleazaInceputulComenzii(businessId: string | undefined, productId?: string | null): void {
  trimite("begin_checkout", businessId, productId ?? null);
}
