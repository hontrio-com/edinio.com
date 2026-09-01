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
    /* Domeniul pe care a fost emis tokenul. Vezi `GAZDE_CUNOSCUTE` mai jos. */
    hostname?: string;
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
  /*
    ⚠ SI FARA PAZA DE FALSY. Randul era `if (date.action && date.action !== ...)`,
    deci un token care NU spune pentru ce a fost emis trecea mai departe. Nu e o
    usa exploatabila — cine poate mintui un token fara actiune poate mintui la fel
    de usor unul cu actiunea potrivita — dar comentariul de deasupra promitea ca
    „actiunea se verifica", si pana acum asta nu era intru totul adevarat.

    Motivele sunt deosebite dinadins: „actiune gresita: undefined" in jurnal ar
    trimite pe cine il citeste sa caute o actiune scrisa gresit, nu una lipsa.
  */
  if (!date.action) return { ok: false, motiv: "actiune lipsa din token" };
  if (date.action !== actiuneAsteptata) {
    return { ok: false, motiv: `actiune gresita: ${date.action}` };
  }

  /*
    ═══ ⚠ GAZDA SE MASOARA, DEOCAMDATA NU SE REFUZA ═══

    Google intoarce si domeniul pe care a fost emis tokenul. Auditul cere sa-l
    verificam si sa respingem ce nu se potriveste. Are dreptate ca principiu — dar
    o lista de gazde scrisa din birou, pusa direct pe calea prin care intra
    clientii, e o cadere de serviciu care asteapta un domeniu nou.

    ⚠ SI E POSIBIL SA FIE DEJA DE PRISOS: consola Google are bifa „Verify the
    origin of reCAPTCHA solutions"; daca e pornita, tokenul nici nu se poate emite
    de pe alt domeniu. N-am putut vedea consola, deci nu stiu.

    Deci mai intai SE MASOARA: orice gazda neasteptata se scrie in jurnal, iar
    cererea trece. Dupa o vreme se citeste ce a aparut acolo si abia atunci
    `if` de mai jos devine `return { ok: false }`. Aceeasi purtare pe care auditul
    o cere, pe bună dreptate, pentru CSP: Report-Only inainte de aplicare.

    ⚠ CINE FACE PASUL: schimba `avertizeaza` in refuz SI muta proba din
    `securitate-audit.test.ts` odata cu el.
  */
  const GAZDE_CUNOSCUTE = ["edinio.com", "www.edinio.com"];
  const gazda = date.hostname;
  if (gazda && !GAZDE_CUNOSCUTE.includes(gazda) && !gazda.endsWith(".edinio.com")) {
    /* Nu se arunca si nu se opreste: e o masuratoare, nu o incuietoare. */
    console.warn("[recaptcha] token emis de pe o gazda neasteptata", { gazda, actiune: actiuneAsteptata });
  }

  const scor = typeof date.score === "number" ? date.score : 0;
  if (scor < PRAG_SCOR) return { ok: false, motiv: `scor prea mic: ${scor}` };

  return { ok: true, scor };
}
