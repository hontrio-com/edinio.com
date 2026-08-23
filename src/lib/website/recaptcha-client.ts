/**
 * Partea de browser a reCAPTCHA v3: incarca scriptul si cere un token.
 *
 * ═══ SCRIPTUL SE INCARCA LA PRIMA ATINGERE, NU LA DESCHIDEREA PAGINII ═══
 *
 * Doua motive, si al doilea cantareste mai mult:
 *
 * 1. **Greutate.** Sunt ~250 kB de JavaScript de la Google pe o pagina care
 *    altfel n-are aproape deloc, pe un site care are pagina „Optimizare".
 * 2. **Confidentialitate.** Scriptul trimite date catre Google DE LA FIECARE
 *    vizitator, inclusiv de la cine doar citeste programul si pleaca. Legat de
 *    prima atingere a formularului, il primeste doar cine chiar il completeaza.
 *
 * ⚠ INSIGNA APARE, si o ascundem noi. Aici a scris o vreme ca „nu mai apare de
 * la sine daca scriptul vine tarziu" — nu e adevarat: Google o pune in coltul
 * din dreapta jos ori de cate ori se incarca scriptul, oricat de tarziu ar veni.
 * Se ascunde din `globals.css` (`.grecaptcha-badge`), unde scrie si de ce e
 * ingaduit si ce anume tine regula.
 *
 * Ce ramane adevarat: Google CERE ca pagina sa spuna in text ca formularul e
 * protejat de reCAPTCHA, cu linkuri catre politica si termenii lor. De aia
 * fiecare formular are randul acela sub buton — nu e podoaba, e chiar conditia
 * in schimbul careia insigna are voie sa lipseasca.
 *
 * ═══ TOKENUL SE CERE LA FIECARE APASARE ═══
 *
 * Expira in 2 minute. Unul luat la incarcarea paginii e mort pana termina omul
 * de scris mesajul, si atunci verificarea de pe server respinge un om adevarat.
 */

interface Grecaptcha {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, opts: { action: string }) => Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

export function recaptchaActiv(): boolean {
  return SITE_KEY.length > 0;
}

let incarcare: Promise<void> | null = null;

/** Incarca scriptul o singura data, oricat de des ar fi chemata. */
export function incarcaRecaptcha(): Promise<void> {
  if (!recaptchaActiv()) return Promise.resolve();
  if (incarcare) return incarcare;

  incarcare = new Promise<void>((resolve, reject) => {
    if (window.grecaptcha) return resolve();
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      /* Se uita esecul, ca o a doua incercare sa poata reincarca: o pana de
         retea de o secunda n-are voie sa strice formularul pana la reincarcare. */
      incarcare = null;
      reject(new Error("reCAPTCHA nu s-a incarcat"));
    };
    document.head.appendChild(s);
  });
  return incarcare;
}

/**
 * Tokenul pentru o actiune. `undefined` daca reCAPTCHA nu e configurat sau n-a
 * putut fi incarcat — serverul decide ce face mai departe, nu browserul.
 */
export async function tokenRecaptcha(actiune: string): Promise<string | undefined> {
  if (!recaptchaActiv()) return undefined;
  try {
    await incarcaRecaptcha();
    const g = window.grecaptcha;
    if (!g) return undefined;
    await new Promise<void>((r) => g.ready(r));
    return await g.execute(SITE_KEY, { action: actiune });
  } catch {
    return undefined;
  }
}
