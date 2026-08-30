/**
 * Cate bucati are voie sa aiba o linie, si ce se intampla cu ce nu se incadreaza.
 *
 * Regula statea scrisa de patru ori — de trei ori in `order.actions.ts` si o data
 * in cosul din browser — si nu spunea de fiecare data acelasi lucru. Endpointurile
 * de comanda sunt publice, deci cantitatea vine ca text arbitrar: fractionara,
 * negativa, nenumerica, sau 5000.
 *
 * Doua decizii care se pot uita:
 *
 * 1. Ce nu se incadreaza se REFUZA, nu se rescrie in tacere. Rescris, cine cere
 *    5000 primeste 999 — dar si TREAPTA de pret a lui 999, adica alt pret unitar
 *    decat cel pe care l-a vazut. „Am schimbat ce ai cerut si nu-ti spun" e chiar
 *    tiparul pe care il vaneaza auditul.
 * 2. Plafonul e acelasi in browser si pe server, dar se aplica diferit: in
 *    browser CLEMEAZA, ca o apasare pe „+" sa nu poata duce linia dincolo de
 *    plafon; pe server REFUZA, fiindca acolo ajunge si ce n-a trecut prin
 *    browserul nostru. Clemat in amandoua partile, o cerere fabricata ar trece
 *    neobservata.
 */

/** Plafonul de cantitate pe o linie de comanda, si la comanda, si la editare. */
export const MAX_CANTITATE_LINIE = 999;

export type CantitateCeruta =
  | { fel: "ok"; cantitate: number }
  | { fel: "prea_mica" }
  | { fel: "prea_mare"; plafon: number };

/**
 * Ce a cerut clientul, judecat. Pentru server: raspunde cu un motiv, ca apelantul
 * sa poata refuza cu un mesaj adevarat.
 */
export function cantitateCeruta(raw: unknown): CantitateCeruta {
  const n = Math.floor(Number(raw));
  // Se verifica NaN, nu finitudinea: `NaN < 1` e fals si `NaN > 999` e fals, deci
  // o cantitate nenumerica ar cadea intre cele doua porti si ar iesi „ok". Dar
  // `Infinity` e o cantitate PREA MARE, nu una nevalida — `JSON.parse("1e400")`
  // il produce dintr-un payload trivial, iar aruncat in ramura cealalta clientul
  // primea „reincarca pagina" in loc de „cel mult 999 bucati".
  if (Number.isNaN(n) || n < 1) return { fel: "prea_mica" };
  if (n > MAX_CANTITATE_LINIE) return { fel: "prea_mare", plafon: MAX_CANTITATE_LINIE };
  return { fel: "ok", cantitate: n };
}

/** Mesajul catre client, in ambele sensuri. Spune NUMARUL, ca la stoc. */
export function mesajCantitate(r: Exclude<CantitateCeruta, { fel: "ok" }>, numeProdus?: string): string {
  const produs = numeProdus ? ` pentru „${numeProdus}"` : "";
  return r.fel === "prea_mica"
    ? `Cantitatea comandata${produs} nu este valida. Reincarca pagina si incearca din nou.`
    : `Se pot comanda cel mult ${r.plafon} bucati dintr-un produs${produs}. Scade cantitatea si incearca din nou.`;
}

/**
 * Pentru BROWSER: cleme, nu refuza. Campul de cantitate al cosului n-are unde sa
 * arate o eroare, iar o valoare imposibila trebuie sa devina una posibila inainte
 * sa ajunga pe ecran sau in localStorage.
 */
export function normalizeazaCantitate(raw: unknown): number {
  const r = cantitateCeruta(raw);
  if (r.fel === "ok") return r.cantitate;
  return r.fel === "prea_mare" ? MAX_CANTITATE_LINIE : 1;
}
