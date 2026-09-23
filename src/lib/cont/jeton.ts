import crypto from "node:crypto";

/**
 * Jetonul de sesiune al cumparatorului, codul de sase cifre, si cookie-ul.
 *
 * ⚠⚠ NUMELE COOKIE-ULUI NU E O ALEGERE LIBERA. Doua bucati de cod existente se
 * uita la numele cookie-urilor si ar inghiti unul ales prost:
 *
 *   1. `src/lib/auth/poarta-mfa.ts:32`, `/^sb-.*-auth-token(\.\d+)?$/`. Poarta
 *      MFA iese pe prima linie cand NU gaseste un cookie care se potriveste.
 *      Chiar de aceea un cumparator logat costa zero: nu are niciun cookie `sb-`.
 *      Un nume care s-ar potrivi ar trimite fiecare cerere a lui in poarta, iar
 *      acolo, neavand rand in `users_profile`, ar fi REFUZAT
 *      (`src/lib/auth/mfa.ts:140`).
 *   2. `src/app/api/auth/iesire/route.ts:37` sterge ORICE cookie care incepe cu
 *      `sb-` si contine `auth-token`. Iesirea comerciantului din panou i-ar fi
 *      inchis si sesiunea de cumparator, pe aceeasi gazda.
 *
 * `ec_cont` nu se potriveste cu niciuna. Nu se redenumeste fara sa se citeasca
 * amandoua locurile de mai sus.
 */
export const COOKIE_CONT = "ec_cont";

/**
 * Cat traieste cookie-ul. ⚠ ACELASI numar cu `viata_absoluta` din
 * `privat.cont_reguli_sesiune()` (30 de zile). Scrise diferit, cel mic ar fi
 * hotarat singur: un cookie de 7 zile ar fi deconectat oameni a caror sesiune
 * din baza era vie, si nimeni n-ar fi gasit de ce.
 */
export const VIATA_COOKIE_SEC = 60 * 60 * 24 * 30;

/**
 * ⚠ `httpOnly` ESTE ADEVARAT, spre deosebire de cookie-ul Supabase, care nu
 * poate fi (`createBrowserClient` trebuie sa-l citeasca din JS). Aici conteaza
 * mai mult decat oriunde: pe vitrina ruleaza pixelii ALESI de comerciant.
 *
 * ⚠ Si nu se pune `domain`: cookie-ul ramane al gazdei pe care a fost scris,
 * adica al domeniului magazinului. Un `domain: ".edinio.com"` l-ar fi trimis la
 * toate vitrinele de pe platforma deodata.
 */
export function optiuniCookie(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VIATA_COOKIE_SEC,
  };
}

/**
 * Un jeton nou si amprenta lui.
 *
 * ⚠ In baza ajunge NUMAI amprenta. 32 de octeti de la `randomBytes` au entropia
 * lor, deci sha256 e de ajuns: nu e o parola pe care s-o ghiceasca cineva cu un
 * dictionar, e un numar pe care trebuie sa-l nimereasca.
 */
export function jetonNou(): { jeton: string; amprenta: string } {
  const jeton = crypto.randomBytes(32).toString("base64url");
  return { jeton, amprenta: amprentaJetonului(jeton) };
}

export function amprentaJetonului(jeton: string): string {
  return crypto.createHash("sha256").update(jeton).digest("hex");
}

/**
 * Codul de sase cifre, exact ca la MFA-ul comerciantilor
 * (`src/lib/auth/flux-mfa.ts:26-27`), ca sa nu existe doua feluri de coduri in
 * aceeasi casa.
 */
export function codNou(): { cod: string; amprenta: string } {
  const cod = crypto.randomInt(100000, 1000000).toString();
  return { cod, amprenta: amprentaCodului(cod) };
}

export function amprentaCodului(cod: string): string {
  return crypto.createHash("sha256").update(cod.trim()).digest("hex");
}

/**
 * ⚠ Comparatie cu timp constant. Cu `===`, timpul raspunsului spune cate cifre
 * de la inceput erau bune, iar un cod de sase cifre se sparge atunci din cateva
 * zeci de incercari, nu din un milion.
 */
export function codPotrivit(cod: string, amprentaPastrata: string): boolean {
  const a = Buffer.from(amprentaCodului(cod));
  const b = Buffer.from(amprentaPastrata);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
