/*
  ═══════════════════════════════════════════════════════════════════════════════
  JETONUL DE CONT NOU: SCRIS DE SERVER, CITIT O DATA DE BROWSER
  ═══════════════════════════════════════════════════════════════════════════════

  Forma: `<amprenta>.<origine>`, de pilda `a3f9….google`.

  ⚠ DE CE STA AICI SI NU IN COMPONENTA. Doua motive, si al doilea m-a costat o
  rulare de probe:

  1. E logica pura. O componenta care o poarta n-o poate proba fara un browser.
  2. `npm test` ruleaza cu un incarcator care ia `.ts`, nu `.tsx`. Cat timp
     `desfaJeton` statea in `UrmaPalnie.tsx`, proba trecea cu `tsx --test` si
     cadea in suita adevarata — adica exact felul de verde inselator pe care il
     scot de peste tot azi.

  ⚠ SI DE CE NU IN `cont-nou.ts`, langa cealalta jumatate a aceluiasi jeton:
  acolo se importa `node:crypto`, care n-are ce cauta intr-un pachet de browser.
*/

/** Originile pe care le cunoastem. Ce nu e aici devine `altul`, nu text strain. */
export const ORIGINI_CONT = ["email", "google", "altul"] as const;
export type OrigineCont = (typeof ORIGINI_CONT)[number];

/**
 * Desface jetonul in amprenta contului si originea inscrierii.
 *
 * ⚠ TOLEREAZA SI FORMA VECHE, fara punct. Intre desfasurare si expirarea celor
 * cinci minute exista browsere care inca poarta jetoane scrise de codul dinainte.
 * Fara ramura asta, inscrierile din fereastra aceea s-ar pierde — putine, dar
 * exact felul de pierdere pe care n-o observa nimeni.
 *
 * ⚠ SI ORIGINEA E DINTR-O MULTIME INCHISA. Un furnizor nou la Supabase (sa zicem
 * `linkedin_oidc`) n-are voie sa-si strecoare numele in rapoarte prin cookie:
 * ce nu recunoastem devine `altul`.
 */
export function desfaJeton(jeton: string): { id: string; origine: OrigineCont } {
  const i = jeton.indexOf(".");
  if (i === -1) return { id: jeton, origine: "altul" };
  const coada = jeton.slice(i + 1);
  const origine = (ORIGINI_CONT as readonly string[]).includes(coada) ? (coada as OrigineCont) : "altul";
  return { id: jeton.slice(0, i), origine };
}
