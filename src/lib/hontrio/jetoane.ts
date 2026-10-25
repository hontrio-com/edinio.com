import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Jetonul, codul de autorizare si PKCE: numai forma si amprenta, fara baza.
 *
 * ⚠ AMANDOUA SUNT 32 DE OCTETI DIN GENERATORUL CRIPTOGRAFIC, ca cheile Pepita (`cheieNoua`). NU
 * `Math.random()`, NU un UUID: aici nu e nevoie de nicio structura, doar de ceva ce nu se poate ghici.
 *
 * Jetonul poarta prefixul `hnt_`. Nu adauga siguranta, dar face doua lucruri: un jeton lipit din
 * greseala intr-un tichet sau intr-un jurnal se recunoaste dintr-o privire, iar o cautare de secrete
 * scapate in cod il gaseste dupa prefix.
 */

export const PREFIX_JETON = "hnt_";

export function jetonNou(): string {
  return PREFIX_JETON + randomBytes(32).toString("base64url");
}

export function codNou(): string {
  return randomBytes(32).toString("base64url");
}

/** Amprenta dupa care se cauta jetonul sau codul. Nu se poate intoarce la valoare. */
export function amprenta(valoare: string): string {
  return createHash("sha256").update(valoare, "utf8").digest("hex");
}

/*
 * ⚠ FORMA SE VERIFICA INAINTEA ORICAREI CITIRI DIN BAZA, ca la Pepita (`formaCheieValida`). Rutele
 * sunt publice prin definitie: fara poarta asta, orice sir trimis ar fi pornit o interogare, deci o
 * rafala pe jetoane inventate ar fi devenit trafic in baza, platit de noi.
 */
export function formaJetonuluiValida(jeton: string | null | undefined): boolean {
  return /^hnt_[A-Za-z0-9_-]{43}$/.test(jeton ?? "");
}

export function formaCoduluiValida(cod: string | null | undefined): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(cod ?? "");
}

/** RFC 7636, 4.1: 43-128 de caractere din setul „unreserved". */
export function formaVerificatoruluiValida(verificator: string | null | undefined): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(verificator ?? "");
}

/** O provocare S256 e un SHA-256 in base64url fara completare: exact 43 de caractere. */
export function formaProvocariiValida(provocare: string | null | undefined): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(provocare ?? "");
}

/** RFC 7636, 4.2: `BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`. */
export function provocareS256(verificator: string): string {
  return createHash("sha256").update(verificator, "ascii").digest("base64url");
}

/**
 * Verificatorul trimis la schimb se potriveste cu provocarea primita la autorizare?
 *
 * ⚠ ASTA LEAGA CODUL DE CEL CARE A PORNIT CEREREA. Un cod prins pe drum (in jurnalul unui proxy, in
 * istoricul browserului) nu se poate schimba fara verificatorul pe care Hontrio nu l-a trimis
 * niciodata prin browser.
 */
export function verificaPkce(verificator: string | null | undefined, provocare: string | null | undefined): boolean {
  if (!formaVerificatoruluiValida(verificator) || !formaProvocariiValida(provocare)) return false;
  const a = Buffer.from(provocareS256(verificator!), "ascii");
  const b = Buffer.from(provocare!, "ascii");
  return a.length === b.length && timingSafeEqual(a, b);
}
