import crypto from "node:crypto";
import { LUNGIME_MAXIMA, LUNGIME_MINIMA } from "./parola-reguli";

/**
 * Parola contului de cumparator: regula ei si amprenta.
 *
 * ⚠⚠ IN BAZA AJUNGE NUMAI AMPRENTA, calculata AICI. O constrangere din migratie
 * (`cont_cumparator_parola_forma`) refuza orice nu incepe cu `scrypt$`, deci o
 * parola in clar nu poate ajunge intr-o coloana nici din greseala. Parola nu se
 * scrie in niciun jurnal si in niciun `logError`; o proba cauta asta pe sursa.
 *
 * ⚠ scrypt, din `node:crypto`: fara dependenta noua, rezistent la placi grafice
 * fiindca cere memorie. N=2^15, r=8, p=1 cere 32 MB; `maxmem` e ridicat peste
 * plafonul implicit al lui Node (32 MB fix), altfel ar fi aruncat.
 *
 * ⚠ Parametrii se scriu IN amprenta (`scrypt$N$r$p$sare$cheie`), ca sa poata fi
 * ridicati mai tarziu fara sa cada parolele vechi.
 *
 * ⚠ H6: mesajele ajung pe vitrina, deci fara diacritice.
 */

export { LUNGIME_MAXIMA, LUNGIME_MINIMA };

const N = 32768;
const R = 8;
const P = 1;
const LUNGIME_CHEIE = 64;
const MAXMEM = 128 * 1024 * 1024;

/* Cele mai des folosite parole, in forma lor mica. Scurta dinadins: regula e
   lungimea; lista prinde doar ce trece de lungime si tot e ghicit din prima. */
const PREA_DES_FOLOSITE = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000",
  "password", "password1", "password123", "parola123", "parola1234", "parolaparola",
  "qwertyui", "qwerty123", "qwertyuiop", "asdfghjk", "iloveyou", "abcdefgh",
  "abcd1234", "12341234", "123123123", "romania1", "romania123", "bucuresti",
  "admin123", "letmein1", "welcome1", "a1b2c3d4", "zaq12wsx", "1q2w3e4r",
]);

/** Forma sub care se compara si se amprenteaza: aceeasi parola scrisa altfel pe alt telefon. */
function forma(parola: string): string {
  return parola.normalize("NFKC");
}

/**
 * Ce e in neregula cu parola, sau `null` cand e buna.
 *
 * ⚠ Fara reguli de compunere (litera mare, cifra, semn): impun parole greu de tinut
 * minte si usor de ghicit. Conteaza lungimea si sa nu fie una dintre cele ghicite
 * din prima.
 */
export function problemaParolei(parola: unknown, email?: string | null): string | null {
  if (typeof parola !== "string") return "Scrie o parola.";
  const p = forma(parola);
  if ([...p].length < LUNGIME_MINIMA) return `Parola trebuie sa aiba cel putin ${LUNGIME_MINIMA} caractere.`;
  if ([...p].length > LUNGIME_MAXIMA) return `Parola poate avea cel mult ${LUNGIME_MAXIMA} caractere.`;
  if (p.trim() === "") return "Parola nu poate fi formata doar din spatii.";
  const mica = p.toLowerCase();
  if (PREA_DES_FOLOSITE.has(mica) || /^(.)\1+$/u.test(p)) return "Parola asta e printre cele mai des folosite. Alege alta.";
  const adresa = (email ?? "").trim().toLowerCase();
  if (adresa && (mica === adresa || mica === adresa.split("@")[0])) return "Parola nu poate fi adresa ta de email.";
  return null;
}

function scrypt(parola: string, sare: Buffer, n: number, r: number, p: number, lungime: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(forma(parola), sare, lungime, { N: n, r, p, maxmem: MAXMEM }, (err, cheie) => {
      if (err) reject(err);
      else resolve(cheie);
    });
  });
}

/** Amprenta unei parole noi. */
export async function amprentaParolei(parola: string): Promise<string> {
  const sare = crypto.randomBytes(16);
  const cheie = await scrypt(parola, sare, N, R, P, LUNGIME_CHEIE);
  return `scrypt$${N}$${R}$${P}$${sare.toString("base64url")}$${cheie.toString("base64url")}`;
}

/**
 * Parola se potriveste cu amprenta pastrata?
 *
 * ⚠ Comparatie in timp constant. O amprenta stricata sau lipsa intoarce `false`,
 * niciodata o exceptie: ruta raspunde atunci ca la o parola gresita.
 */
export async function parolaPotrivita(parola: string, amprenta: string | null | undefined): Promise<boolean> {
  if (typeof parola !== "string" || typeof amprenta !== "string") return false;
  const bucati = amprenta.split("$");
  if (bucati.length !== 6 || bucati[0] !== "scrypt") return false;
  const n = Number(bucati[1]);
  const r = Number(bucati[2]);
  const p = Number(bucati[3]);
  /* Plafon pe parametri: o amprenta scrisa de altcineva nu are voie sa ceara gigabytes. */
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 1024 || n > 1 << 17 || r < 1 || r > 16 || p < 1 || p > 4) return false;
  const sare = Buffer.from(bucati[4], "base64url");
  const asteptat = Buffer.from(bucati[5], "base64url");
  if (sare.length < 8 || asteptat.length < 32) return false;
  try {
    const cheie = await scrypt(parola, sare, n, r, p, asteptat.length);
    return crypto.timingSafeEqual(cheie, asteptat);
  } catch {
    return false;
  }
}

/*
  ⚠⚠ O AMPRENTA FALSA, pentru adresele fara cont sau fara parola. Fara ea, un
  raspuns care vine in 2 ms in loc de 80 ar spune din afara ce adrese au cont la
  magazin, exact oracolul pe care formularul il evita in text.
*/
let amprentaFalsa: Promise<string> | null = null;

/** Consuma cat o verificare adevarata si intoarce mereu `false`. */
export async function verificareOarba(parola: string): Promise<false> {
  amprentaFalsa ??= amprentaParolei(crypto.randomBytes(18).toString("base64url"));
  await parolaPotrivita(typeof parola === "string" ? parola : "", await amprentaFalsa);
  return false;
}
