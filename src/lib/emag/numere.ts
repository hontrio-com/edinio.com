/**
 * Numerele venite de la eMAG, aduse la forma noastră — sau la nimic.
 *
 * ═══ ⚠ DE CE EXISTĂ, ȘI CE A COSTAT LIPSA LUI (24.08.2026) ═══
 *
 * Comerciantul a apăsat „Adu ofertele". Catalogul s-a citit întreg, fără o eroare.
 * Apoi importul a căzut cu:
 *
 *     invalid input syntax for type integer: "true"
 *
 * Unul dintre câmpurile pe care le scriem în coloane `integer` — `ownership`,
 * `number_of_offers`, `buy_button_rank` — vine de la ei ca **boolean**. Zero oferte
 * legate, iar omul a văzut doar o rotiță care s-a oprit.
 *
 * ⚠ NICIUNUL DINTRE ELE NU E ÎN SCHEMA LOR. Am căutat în tot OpenAPI-ul v4.5.1:
 * răspunsul lui `product_offer/read` e `ApiResponse` generic, iar cele patru câmpuri
 * nu au niciun tip declarat nicăieri. Le-am scris `number` în `types.ts` din
 * presupunere, iar TypeScript n-avea cum să ne contrazică: tipul descrie ce credem
 * noi despre un JSON, nu ce trimit ei.
 *
 * Aceeași lecție e deja scrisă de două ori în casă — la `zileleDinTimp` („forma
 * răspunsului lor NU e în schemă") și la `handling_time`. A treia oară o facem
 * structurală: **ce nu e în schema lor trece prin aici, întotdeauna.**
 *
 * ═══ ⚠ DE CE `null` ȘI NU O GHICITURĂ ═══
 *
 * `ownership: true` ar putea însemna 1. Sau 2. Documentația lor spune „1 = poți
 * actualiza documentația, 2 = nu poți", iar un boolean nu se traduce singur în
 * asta. Scris ca 1 din intuiție, ar fi arătat drept până în ziua în care cineva ar
 * fi luat o hotărâre pe el.
 *
 * Nimic din aplicație nu citește azi `emag_offers.ownership` — verificat. Deci `null`
 * nu costă nimic, iar un număr inventat ar fi costat cândva.
 */

/** Un întreg de la ei, sau `null` dacă nu e un număr. ⚠ `true` NU devine 1. */
export function intregDeLaEi(v: unknown): number | null {
  if (Array.isArray(v)) return intregDeLaEi(v[0]);
  if (v && typeof v === "object") return intregDeLaEi((v as { value?: unknown }).value);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  /*
   * ⚠ Șirurile TREC, dar numai cele care sunt chiar numere. eMAG trimite uneori
   * „3" în loc de 3, iar refuzat, un status valid s-ar fi pierdut. „true" nu e un
   * număr și cade — chiar cazul din 24.08.
   */
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Ca `intregDeLaEi`, dar păstrează zecimalele. Pentru prețuri. */
export function zecimalDeLaEi(v: unknown): number | null {
  return intregDeLaEi(v);
}

/**
 * Care dintre câmpurile cerute au venit într-o formă pe care n-o putem citi.
 *
 * ⚠ Ca să AFLĂM, nu ca să oprim. Un câmp necitibil nu e un motiv să pice importul —
 * dovada e chiar ziua de azi. Dar tăcut, n-am fi aflat niciodată ce trimit ei de
 * fapt, iar întrebarea „ce e `ownership` la ei?" ar fi rămas fără răspuns.
 *
 * Se cheamă o dată pe pagină, nu o dată pe ofertă: 100 de oferte cu același câmp
 * ciudat sunt o singură constatare, nu o sută.
 */
export function campuriNecitibile(
  obiect: Record<string, unknown>, chei: readonly string[],
): { camp: string; primit: string }[] {
  const iesire: { camp: string; primit: string }[] = [];
  for (const c of chei) {
    const v = obiect[c];
    if (v === undefined || v === null) continue;
    if (intregDeLaEi(v) !== null) continue;
    iesire.push({ camp: c, primit: `${typeof v}: ${JSON.stringify(v)}`.slice(0, 60) });
  }
  return iesire;
}
