/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O OFERTĂ SE NUMĂRĂ O SINGURĂ DATĂ PE VIZITĂ                   (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regula stă aici, singură, fără niciun import: `use-afisari-oferte.ts` aduce
 * `recordOfferImpressions` dintr-un fișier `"use server"`, iar acela aduce
 * `next/headers` — deci n-ar fi putut fi încărcat de o probă. Scoasă aici,
 * regula se măsoară cu numere, nu printr-un randator.
 *
 * ⚠⚠ DE CE O DATĂ PE VIZITĂ, ȘI NU O DATĂ PE MONTARE. Aceeași ofertă se poate
 * arăta de mai multe ori în aceeași vizită: sertarul de coș se deschide și se
 * închide, formularul de comandă se redeschide, lista de bump-uri se reface la
 * fiecare linie scoasă din coș („A,B” devine „A”, apoi iar „A,B”). Numărate de
 * fiecare dată, afișările ar fi crescut singure fără ca nimeni să vadă ceva nou,
 * iar rata de acceptare — conversiile se numără o dată pe COMANDĂ, adică cel
 * mult una pe vizită — ar fi scăzut de la sine.
 *
 * ⚠ MULȚIMEA E DE ID-URI, nu un singur șir cu toată lista. Ținută ca șir,
 * întoarcerea de la „A” la „A,B” ar fi renumărat și pe A, care nu plecase
 * niciodată de pe ecran.
 *
 * ⚠ Se golește singură la reîncărcarea paginii, fiindcă atunci se încarcă din
 * nou și modulul — adică exact ce înseamnă „o vizită”.
 */

/** Ofertele deja numărate în fila asta. */
const numarateInFilaAsta = new Set<string>();

/**
 * Ce a mai rămas de numărat din lista asta, ÎNSEMNÂNDU-LE pe loc ca numărate.
 *
 * ⚠⚠ ÎNSEMNAREA SE FACE ÎNAINTE de cererea către server, nu după răspuns: două
 * randări la rând (sau cele două treceri prin StrictMode) ar fi apucat amândouă
 * să întrebe mulțimea înainte ca prima cerere să se întoarcă.
 *
 * ⚠ Se cheamă ABIA CÂND OFERTELE AJUNG PE ECRAN, nu la montare. Chemată la
 * montare, ar fi însemnat ca văzute și ofertele la care vizitatorul nu coboară
 * niciodată — adică exact numărătoarea greșită de care fuge fișierul ăsta.
 */
export function deNumaratAcum(ids: readonly string[], deja: Set<string> = numarateInFilaAsta): string[] {
  const noi: string[] = [];
  for (const id of ids) {
    if (!id || deja.has(id)) continue;
    deja.add(id);
    noi.push(id);
  }
  return noi;
}

/** Mai e ceva de numărat din lista asta? Doar întreabă — nu însemnează nimic. */
export function maiEDeNumarat(ids: readonly string[], deja: Set<string> = numarateInFilaAsta): boolean {
  return ids.some((id) => id !== "" && !deja.has(id));
}

/** Doar pentru probe: golește mulțimea, ca două probe să nu se influențeze. */
export function uitaAfisarileNumarate(): void {
  numarateInFilaAsta.clear();
}
