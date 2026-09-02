/*
  ═══════════════════════════════════════════════════════════════════════════════
  HOTARAREA OMULUI DESPRE URMARIRE — FORMA EI, SI NIMIC ALTCEVA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FISIERUL ASTA NU STIE NIMIC DESPRE LUME. Fara `window`, fara `next/headers`,
  fara `node:crypto`. Doar sirul si intelesul lui.

  De ce conteaza: aceeasi hotarare e citita din TREI feluri de cod — corpul inline
  al pixelilor (sincron, inaintea hidratarii), React, si serverul. Daca fiecare ar
  avea propria dezlegare, s-ar despartii la prima schimbare, iar cele doua maluri
  ar crede lucruri deosebite despre acelasi om. Un singur codec, trei cititori.

  ⚠ SI DE CE UN COOKIE, NU `localStorage`. Mecanismul magazinelor tine starea in
  `localStorage` (`src/lib/cookie-consent.ts:82`). Acolo e destul: poarta e in
  browser. Aici NU e: conversiile pleaca si de pe server, iar serverul nu vede
  `localStorage`. Un banner care opreste scripturile si lasa coada sa trimita mai
  departe e teatru — arata a poarta si nu e.
*/

/** Se ridica la orice schimbare care face vechile hotarari neintelese. */
export const VERSIUNE = 1;

/**
 * Categoriile pe care omul le poate porni sau opri.
 *
 * ⚠ NU EXISTA „functionale". Un comutator care nu comanda nimic e chiar tiparul
 * pe care EDPB il numeste incalcare de sine statatoare: pare o alegere si nu e.
 * Cand vom avea o tehnologie functionala optionala, se adauga aici — si amprenta
 * de mai jos invalideaza singura hotararile vechi.
 */
export const CATEGORII = ["statistici", "marketing"] as const;
export type Categorie = (typeof CATEGORII)[number];

/**
 * Furnizorii numiti in panou.
 *
 * ⚠ INTRA IN AMPRENTA. Daca maine se adauga un al patrulea furnizor, hotararile
 * de pana atunci nu-l acopera — omul n-a stiut de el cand a apasat. Amprenta le
 * invalideaza si bannerul se arata din nou. Fara asta, un furnizor nou s-ar
 * strecura sub un consimtamant dat pentru altceva.
 */
export const FURNIZORI = ["google-analytics", "meta", "tiktok"] as const;

/** Cat tine o hotarare. Sub un an, cum cer ghidurile autoritatilor. */
export const DURATA_ZILE = 180;

/** Cum s-a ajuns la hotarare. Se pastreaza ca dovada. */
export type Metoda =
  | "t"  /* a acceptat tot */
  | "r"  /* a respins optionalele */
  | "p"  /* a ales pe categorii */
  | "w"; /* si-a retras acordul */

export type Stare = {
  statistici: boolean;
  marketing: boolean;
  /** Clipa apasarii, in secunde. */
  cand: number;
  metoda: Metoda;
  /**
   * Id-ul de vizitator, pentru potrivirea conversiilor.
   *
   * ⚠ STA IN ACELASI COOKIE, si asta e miezul. N-are cookie propriu, deci
   * retragerea — care rescrie cookie-ul fara el — il sterge structural. Un id
   * tinut separat ar fi supravietuit hotararii pana cand cineva si-ar fi amintit
   * sa-l stearga; aici nu POATE.
   */
  vid?: string;
};

/*
  ⚠ AMPRENTA SE CALCULEAZA, NU SE SCRIE DE MANA. Scrisa de mana, ar ramane
  neschimbata exact cand se adauga o categorie sau un furnizor — adica exact
  cand hotararile vechi nu mai acopera ce facem. FNV-1a fiindca trebuie sa fie
  sincron si acelasi in browser si pe server; nu e criptografie, e o pecete.
*/
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const AMPRENTA_SCOPURI = fnv1a(`${CATEGORII.join(",")}|${FURNIZORI.join(",")}`);

const SEPARATOR = ".";

/**
 * Starea, ca sir de pus in cookie.
 *
 * Forma: `v.cand.flaguri.metoda.amprenta.vid`
 * Pozitionala si scurta dinadins — se citeste si dintr-un script inline, unde
 * n-avem `JSON.parse` pe ceva ce poate fi stricat de un caracter gresit.
 */
export function serializeaza(s: Stare): string {
  const flaguri = `${s.statistici ? "1" : "0"}${s.marketing ? "1" : "0"}`;
  return [VERSIUNE, s.cand, flaguri, s.metoda, AMPRENTA_SCOPURI, s.vid ?? ""].join(SEPARATOR);
}

/** Id de vizitator valid: 32 de caractere hexa. Orice altceva se ignora. */
export function validVid(x: unknown): x is string {
  return typeof x === "string" && /^[0-9a-f]{32}$/.test(x);
}

/**
 * Sirul din cookie, inapoi in hotarare — sau `null`.
 *
 * ⚠ `null` INSEAMNA „N-A ALES INCA", deci se arata bannerul si nu porneste nimic.
 * Toate caile de esec cad aici: versiune veche, amprenta schimbata (s-a adaugat
 * un furnizor), hotarare mai veche de 180 de zile, sir stricat. Niciuna nu cade
 * spre „a acceptat" — o dezlegare gresita n-are voie sa devina un acord.
 */
export function parseaza(brut: string | null | undefined, acumSecunde: number): Stare | null {
  if (!brut) return null;
  const p = brut.split(SEPARATOR);
  if (p.length < 5) return null;

  const [v, cand, flaguri, metoda, amprenta, vid] = p;
  if (Number(v) !== VERSIUNE) return null;
  if (amprenta !== AMPRENTA_SCOPURI) return null;
  if (!["t", "r", "p", "w"].includes(metoda)) return null;
  if (!/^[01]{2}$/.test(flaguri ?? "")) return null;

  const clipa = Number(cand);
  if (!Number.isFinite(clipa) || clipa <= 0) return null;
  if (acumSecunde - clipa > DURATA_ZILE * 86_400) return null;

  return {
    statistici: flaguri[0] === "1",
    marketing: flaguri[1] === "1",
    cand: clipa,
    metoda: metoda as Metoda,
    ...(validVid(vid) ? { vid } : {}),
  };
}

/** Cine n-a ales inca nu are voie sa fie urmarit. */
export const NIMIC: Stare = { statistici: false, marketing: false, cand: 0, metoda: "r" };

export function are(s: Stare | null, c: Categorie): boolean {
  return s ? s[c] === true : false;
}
