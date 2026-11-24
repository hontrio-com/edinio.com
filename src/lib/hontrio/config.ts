import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Configurarea legaturii cu Hontrio.
 *
 * Hontrio e singurul client al serverului nostru de autorizare, deci nu exista o tabela de
 * aplicatii: clientul se descrie prin doua variabile de mediu, ca orice alta integrare.
 *
 *   HONTRIO_CLIENT_SECRET  secretul cu care Hontrio isi dovedeste identitatea la schimbul codului
 *                          (cel putin 32 de caractere; aceeasi valoare sta si in mediul Hontrio);
 *   HONTRIO_REDIRECT_URIS  adresele exacte la care se poate intoarce un cod, despartite prin virgula.
 *
 * ⚠ FARA AMANDOUA, LEGATURA E OPRITA DE TOT: autorizarea arata „indisponibil", schimbul raspunde 503 si
 * rutele de citire la fel. E intrerupatorul de avarie: scoasa variabila, nimeni nu mai citeste nimic,
 * fara desfasurare de cod.
 */

/** Singurul client. Il trimite Hontrio la autorizare si la schimbul codului. */
export const HONTRIO_CLIENT_ID = "hontrio";

/**
 * Cardul din „Integrari" se vede de catre toata lumea.
 *
 * Stins, il vad doar administratorii si magazinele deja conectate (care trebuie sa-si poata vedea si
 * revoca legatura). Autorizarea NU atarna de el: un comerciant trimis de Hontrio trebuie sa poata
 * aproba si cat timp cardul nu e anuntat. Ca `GOOGLE_MERCHANT_LIVE`.
 */
export const HONTRIO_LIVE = false;

/*
 * Adresa site-ului Hontrio NU mai sta aici (24.11.2026): fisierul asta e `server-only`, iar butonul
 * din bara de sus e componenta de client. S-a mutat in `@/lib/parteneri/hontrio`, singurul loc care
 * scrie domeniul lor.
 */

export function secretulClientului(): string | null {
  const s = (process.env.HONTRIO_CLIENT_SECRET ?? "").trim();
  return s.length >= 32 ? s : null;
}

/**
 * O adresa de intoarcere acceptabila in lista din mediu.
 *
 * ⚠ HTTPS, cu o singura exceptie: `http://localhost` sub `next dev`, pentru serverul de dezvoltare
 * al lui Hontrio. Pe orice construire de productie (si previzualizarile Vercel sunt una, si scriu in
 * baza de productie), un `http://localhost` scapat in variabila ar fi trimis coduri catre orice
 * ascultator de pe calculatorul comerciantului.
 *
 * ⚠ Fara fragment (RFC 6749, 3.1.2). Interogarea e voie, dar codul se adauga peste ea.
 */
export function adresaDeIntoarcereAcceptabila(brut: string, productie: boolean): boolean {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  return u.protocol === "http:" && local && !productie;
}

export function adreseleDeIntoarcere(): string[] {
  const productie = process.env.NODE_ENV === "production";
  return (process.env.HONTRIO_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && adresaDeIntoarcereAcceptabila(s, productie));
}

export function hontrioConfigurat(): boolean {
  return secretulClientului() !== null && adreseleDeIntoarcere().length > 0;
}

/**
 * Secretul primit e chiar al lui Hontrio?
 *
 * ⚠ IN TIMP CONSTANT, si pe amprente, nu pe siruri: `timingSafeEqual` cere doua bucati de aceeasi
 * lungime, iar o comparatie care iese devreme la prima litera diferita lasa secretul sa fie ghicit
 * litera cu litera, dupa timpul raspunsului.
 */
export function secretulEsteCorect(primit: string | null | undefined): boolean {
  const asteptat = secretulClientului();
  if (!asteptat || !primit) return false;
  const a = createHash("sha256").update(asteptat, "utf8").digest();
  const b = createHash("sha256").update(primit, "utf8").digest();
  return timingSafeEqual(a, b);
}
