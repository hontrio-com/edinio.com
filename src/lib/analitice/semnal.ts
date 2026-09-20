/*
  Semnalul de „adaugat in cos", trimis din browser.

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
export function semnaleazaAdaugareaInCos(businessId: string | undefined, productId: string | undefined): void {
  if (!businessId || !productId || typeof window === "undefined") return;

  void fetch("/api/analitice/eveniment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      businessId,
      fel: "add_to_cart",
      productId,
      path: window.location.pathname,
    }),
    keepalive: true,
  }).then(
    () => undefined,
    () => undefined,
  );
}
