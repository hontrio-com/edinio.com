import crypto from "node:crypto";

/**
 * SESIUNEA CARE ASTEAPTA AL DOILEA FACTOR
 *
 * ---------------------------------------------------------------------------
 * CAUZA, scrisa o data ca sa nu se mai piarda
 *
 * `signInWithPassword` intoarce o sesiune VALIDA. Pana acum cookie-urile ei se
 * scriau imediat, iar al doilea factor doar intarzia redirectarea catre panou.
 * Cine avea numai parola era, tehnic, autentificat: nu trebuia decat sa NU
 * urmeze redirectarea si sa cheme direct /api/**, o actiune de server sau
 * /admin. Am inchis rand pe rand fiecare suprafata (04.08: coloanele MFA in
 * baza; 05.08: poarta din proxy), dar mereu tratam consecinta.
 *
 * Cauza e una singura: SESIUNEA EXISTA INAINTE DE FACTORUL DOI.
 *
 * De aici incolo nu mai exista. Cand contul are MFA pornit, cookie-urile de
 * sesiune NU se scriu la parola. Tokenurile se pun sigilate intr-un cookie
 * `mfa_asteptare`, iar sesiunea propriu-zisa se emite abia cand codul din email
 * e verificat. Un atacator cu parola primeste un sir cifrat pe care nu-l poate
 * desface si care nu e acceptat de nimic in afara de ruta de verificare.
 *
 * ---------------------------------------------------------------------------
 * DE CE E SIGUR SA STEA INTR-UN COOKIE
 *
 * `httpOnly` NU ajuta cu nimic aici: atacatorul E clientul, deci vede antetul
 * `Set-Cookie` in raspunsul brut. Daca tokenurile ar sta in clar, ar putea sa si
 * le puna singur ca sesiune si am fi exact de unde am plecat. De aceea continutul
 * e cifrat AES-256-GCM cu o cheie care nu paraseste serverul: ce primeste
 * atacatorul e text fara sens, iar GCM garanteaza si ca nu-l poate modifica
 * (altfel ar putea schimba `u` pe id-ul altui cont).
 *
 * DE CE CHEIA E DERIVATA DIN `SUPABASE_SERVICE_ROLE_KEY`, si nu una noua: o
 * variabila de mediu noua trebuie adaugata in Vercel INAINTE de deploy, si daca
 * lipseste la prima cerere nimeni nu se mai poate autentifica. Cheia de service
 * role exista deja peste tot unde ruleaza codul asta, e la fel de secreta, si nu
 * pleaca niciodata catre client. Derivarea prin sha256 cu un sir de domeniu
 * separa complet cele doua utilizari.
 */

const ETICHETA = "edinio.mfa.asteptare.v1";

/** Numele cookie-ului. Aceeasi valoare in login, in verificare si la iesire. */
export const COOKIE_ASTEPTARE = "mfa_asteptare";

/** Cat traieste sigiliul. Aceeasi durata ca a codului din email. */
export const DURATA_ASTEPTARE_SEC = 10 * 60;

/**
 * DE CE NU E SI ACCESS TOKEN-UL AICI.
 *
 * Prima varianta pastra si `access_token`, si se emitea sesiunea cu `setSession`.
 * Un JWT Supabase are ~1 KB, dar creste cu `user_metadata`; sigilat si trecut prin
 * base64 inseamna ~1,34x, iar cookie-urile au o limita de 4096 de octeti. Peste ea,
 * browserul arunca cookie-ul IN TACERE — si cum cookie-urile de sesiune tocmai
 * fusesera sterse, omul ramanea cu un cod corect pe email si nicio cale de a-l
 * folosi. La fiecare incercare. Pentru acel cont, permanent.
 *
 * Cu doar `refresh_token` (~40 de caractere), sigiliul are cateva sute de octeti
 * indiferent cat de mare e JWT-ul, si clasa asta de defect dispare. Sesiunea se
 * emite din el, cu `refreshSession`.
 */
export interface SesiuneInAsteptare {
  /** id-ul utilizatorului care a trecut de parola */
  u: string;
  /** refresh token-ul sesiunii nescrise */
  r: string;
  /** cand expira sigiliul, in milisecunde epoch */
  e: number;
}

/**
 * Plafon de siguranta. Nu ar trebui atins niciodata (sigiliul are cateva sute de
 * octeti), dar daca cineva mai adauga vreodata un camp gras aici, prefer o
 * eroare vizibila la login in locul unei blocari tacute pe viata.
 */
export const MAX_OCTETI_SIGILIU = 3500;

function cheie(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY lipseste");
  return crypto.createHash("sha256").update(`${ETICHETA}|${secret}`).digest();
}

/**
 * Sigileaza sesiunea. Rezultatul e `iv.tag.continut`, tot base64url, deci sigur
 * de pus intr-un cookie fara escapare suplimentara.
 */
export function sigileazaSesiune(date: SesiuneInAsteptare): string {
  const iv = crypto.randomBytes(12);
  const cifru = crypto.createCipheriv("aes-256-gcm", cheie(), iv);
  const continut = Buffer.concat([
    cifru.update(JSON.stringify(date), "utf8"),
    cifru.final(),
  ]);
  const sigiliu = [iv, cifru.getAuthTag(), continut]
    .map((b) => b.toString("base64url"))
    .join(".");
  if (sigiliu.length > MAX_OCTETI_SIGILIU) {
    throw new Error(`Sigiliul depaseste limita de cookie (${sigiliu.length} octeti)`);
  }
  return sigiliu;
}

/**
 * Desface sigiliul. Intoarce `null` pentru ORICE problema — cheie schimbata,
 * continut modificat, sigiliu expirat, forma gresita. Apelantul trateaza `null`
 * ca „nu exista nicio autentificare in curs", niciodata ca pe o eroare de
 * sistem: un sigiliu invalid e, in cel mai probabil caz, o incercare de a-l
 * fabrica.
 */
export function desigileazaSesiune(valoare: string | undefined | null): SesiuneInAsteptare | null {
  if (!valoare) return null;
  const parti = valoare.split(".");
  if (parti.length !== 3) return null;
  try {
    const [iv, tag, continut] = parti.map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const descifru = crypto.createDecipheriv("aes-256-gcm", cheie(), iv);
    descifru.setAuthTag(tag);
    const clar = Buffer.concat([descifru.update(continut), descifru.final()]).toString("utf8");
    const date = JSON.parse(clar) as SesiuneInAsteptare;
    if (typeof date?.u !== "string" || !date.u) return null;
    if (typeof date?.r !== "string" || !date.r) return null;
    if (typeof date?.e !== "number" || date.e <= Date.now()) return null;
    return date;
  } catch {
    return null;
  }
}

/** Optiunile cookie-ului, intr-un singur loc: se pune si se sterge la fel. */
export function optiuniCookieAsteptare() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURATA_ASTEPTARE_SEC,
    secure: process.env.NODE_ENV === "production",
  };
}
