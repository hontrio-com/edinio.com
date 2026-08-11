/**
 * Verificarea reCAPTCHA v3, pe server.
 *
 * ═══ DE CE v3 SI NU CASETA „NU SUNT ROBOT" ═══
 *
 * Formularul are deja o bifa (acordul cu Politica de confidentialitate). A doua
 * caseta, langa prima, arata a birocratie si scade numarul de oameni care duc
 * formularul pana la capat. v3 nu se vede deloc: da un scor, iar noi decidem.
 *
 * ═══ CE FACE CAND NU E CONFIGURAT ═══
 *
 * Fara chei, verificarea TRECE si se scrie in loguri. E o alegere, si merita
 * spusa pe fata: un formular de contact care refuza toata lumea fiindca n-a
 * pus nimeni cheile in Vercel e mai rau decat unul fara captcha — al doilea
 * primeste si spam, primul nu primeste NIMIC, inclusiv clientii adevarati.
 *
 * ⚠ Dar tocmai de aia se si LOGHEAZA, la fiecare pornire: altfel „avem captcha"
 * ramane o convingere, nu un fapt. Vezi `NEVERIFICAT` in raspuns — apelantul
 * poate deosebi „a trecut verificarea" de „n-a fost nicio verificare".
 *
 * ═══ PRAGUL ═══
 *
 * Google intoarce un scor intre 0 (aproape sigur robot) si 1 (aproape sigur om).
 * 0,5 e pragul recomandat de ei si punctul de plecare rezonabil. Nu e o valoare
 * de reglat din ochi: daca se muta, se muta dupa ce te uiti in consola Google la
 * distributia scorurilor reale ale formularului.
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** Sub asta, cererea se respinge. Vezi nota de mai sus inainte de a-l muta. */
export const PRAG_SCOR = 0.5;

export type RezultatCaptcha =
  | { ok: true; scor: number }
  /** A trecut fiindca nu e configurat nimic — NU fiindca a fost verificat. */
  | { ok: true; neverificat: true }
  | { ok: false; motiv: string };

export function recaptchaConfigurat(): boolean {
  return !!process.env.RECAPTCHA_SECRET_KEY;
}

export async function verificaRecaptcha(
  token: string | undefined,
  actiuneAsteptata: string,
): Promise<RezultatCaptcha> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, neverificat: true };

  if (!token) return { ok: false, motiv: "token lipsa" };

  let date: {
    success?: boolean;
    score?: number;
    action?: string;
    "error-codes"?: string[];
  };
  try {
    /*
      `AbortSignal.timeout`: fara el, o cerere care atarna la Google tine
      formularul blocat pana la limita functiei. Mai bine o respingem in 5
      secunde si omul reincearca, decat sa se uite la o rotita 60 de secunde.
    */
    const raspuns = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    date = await raspuns.json();
  } catch {
    return { ok: false, motiv: "verificarea nu a raspuns" };
  }

  if (!date.success) {
    return { ok: false, motiv: `respins: ${(date["error-codes"] ?? ["fara motiv"]).join(", ")}` };
  }

  /*
    ⚠ ACTIUNEA SE VERIFICA, nu doar scorul.
    Un token luat de pe ALTA pagina a site-ului (unde pragul poate fi mai
    ingaduitor, sau unde e mai usor de obtinut) trece la fel de bine daca nu
    verifici pentru ce a fost cerut. E greseala clasica la v3.
  */
  if (date.action && date.action !== actiuneAsteptata) {
    return { ok: false, motiv: `actiune gresita: ${date.action}` };
  }

  const scor = typeof date.score === "number" ? date.score : 0;
  if (scor < PRAG_SCOR) return { ok: false, motiv: `scor prea mic: ${scor}` };

  return { ok: true, scor };
}
