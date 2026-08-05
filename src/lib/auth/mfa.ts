/**
 * Al doilea factor: partea PURA (fara acces la baza, fara Next.js).
 *
 * DE CE STA AICI, si nu in auth.actions.ts: acel fisier are `"use server"`, iar
 * de acolo Next.js accepta DOAR exporturi de functii asincrone — o functie pura
 * ca astea rupe build-ul ("Ecmascript file had an error"). Modulul de fata e
 * unul obisnuit, deci poate fi importat de Server Components, de actiuni si de
 * proxy deopotriva.
 *
 * ---------------------------------------------------------------------------
 * SCHIMBAREA DE SEMANTICA (05.08.2026)
 *
 * Intrebarea de dinainte era „exista o provocare MFA neexpirata?". Doua defecte:
 *
 *   1. Raspunsul devenea „nu" dupa 10 minute, cand codul expira. Adica „codul a
 *      expirat" insemna „liber", nu „tot neverificat". Sesiunea Supabase, insa,
 *      traieste mult peste 10 minute: atacatorul cu parola se autentifica,
 *      astepta, si intra.
 *   2. Era o proprietate a CONTULUI, nu a sesiunii. Nu putea raspunde la
 *      intrebarea care conteaza de fapt.
 *
 * Intrebarea noua e „sesiunea ACEASTA a fost confirmata cu al doilea factor?",
 * si se raspunde din doua coloane scrise numai cu service role:
 *   `mfa_confirmat_la`       — cand (urma pentru operatiuni)
 *   `mfa_sesiune_confirmata` — `session_id`-ul sesiunii confirmate
 *
 * DE CE `session_id` SI NU DOAR O DATA: o data raspunde la „s-a confirmat
 * vreodata", nu la „s-a confirmat sesiunea asta" — o confirmare veche de trei
 * luni ar valida o sesiune deschisa azi de un atacator cu parola.
 *
 * DE CE NU `user.last_sign_in_at`: acela e un camp pe UTILIZATOR, nu pe sesiune,
 * si arata ultima autentificare, oricare ar fi ea. Scenariul care il sparge:
 * atacatorul se autentifica la T1 (neconfirmat), proprietarul se autentifica la
 * T2 si confirma; de la T2 `last_sign_in_at` si `mfa_confirmat_la` coincid, deci
 * si sesiunea VECHE a atacatorului ar trece poarta. `session_id` e diferit
 * pentru fiecare autentificare si ramane stabil peste reimprospatarile de token,
 * deci leaga confirmarea de sesiunea reala.
 */

export interface ProfilMfa {
  mfa_email_enabled?: boolean | null;
  mfa_confirmat_la?: string | null;
  mfa_sesiune_confirmata?: string | null;
}

export interface ClaimuriSesiune {
  sub: string;
  session_id: string;
}

/**
 * Scoate `sub` si `session_id` din corpul unui access token Supabase.
 *
 * NU verifica semnatura, si nu are nevoie sa o faca — dar numai atat timp cat
 * rezultatul e folosit EXCLUSIV ca sa REFUZE o cerere, niciodata ca sa o
 * autorizeze. Poarta MFA e un strat peste autentificarea reala: ruta sau
 * actiunea de dedesubt cheama tot `auth.getUser()`, care valideaza tokenul la
 * serverul de autentificare. Un token fabricat ar putea, cel mult, sa treaca de
 * poarta — si ar cadea imediat dupa, la autentificarea propriu-zisa.
 *
 * DACA vreodata cineva vrea sa se sprijine pe valorile astea ca sa DEA acces,
 * trebuie inlocuit apelul cu `supabase.auth.getUser()` / `getClaims()`.
 */
export function claimuriDinToken(accessToken: string | null | undefined): ClaimuriSesiune | null {
  if (!accessToken) return null;
  const parti = accessToken.split(".");
  if (parti.length !== 3) return null;
  try {
    // base64url -> base64, apoi umplut la multiplu de 4.
    const b64 = parti[1].replace(/-/g, "+").replace(/_/g, "/");
    const umplut = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    // `atob` da o singura octeti-per-caracter (latin1). Corpul tokenului poate
    // contine diacritice (numele, emailul), deci trecem prin TextDecoder ca sa
    // nu stricam UTF-8 — altfel JSON.parse arunca si poarta ar da fals „fara
    // sesiune", adica ar bloca un utilizator legitim.
    const binar = atob(umplut);
    const octeti = Uint8Array.from(binar, (c) => c.charCodeAt(0));
    const corp = JSON.parse(new TextDecoder().decode(octeti)) as Record<string, unknown>;
    const sub = corp.sub;
    const sesiune = corp.session_id;
    if (typeof sub !== "string" || !sub) return null;
    if (typeof sesiune !== "string" || !sesiune) return null;
    return { sub, session_id: sesiune };
  } catch {
    return null;
  }
}

/**
 * Raspunde la „sesiunea aceasta NU e confirmata cu al doilea factor?".
 *
 * Adevarat inseamna „opreste cererea". Ordinea conteaza:
 *
 *  - profil lipsa  -> ADEVARAT. Nu stim nimic, deci nu presupunem nimic bun.
 *    (Apelantul are grija sa nu ajunga aici pentru conturile despre care stie
 *    deja ca nu au MFA — vezi `poarta-mfa.ts`.)
 *  - MFA stins     -> FALS. Conturile fara al doilea factor trebuie sa mearga
 *    exact ca inainte; nu se schimba absolut nimic pentru ele.
 *  - fara confirmare inregistrata -> ADEVARAT. Aici e reparatia propriu-zisa:
 *    „nu s-a confirmat" NU mai poate deveni „liber" prin trecerea timpului.
 *  - sesiune necunoscuta -> ADEVARAT. Daca nu putem identifica sesiunea cererii
 *    nu avem cu ce compara.
 */
export function sesiuneNeconfirmata(
  profil: ProfilMfa | null | undefined,
  idSesiune: string | null | undefined,
): boolean {
  if (!profil) return true;
  if (!profil.mfa_email_enabled) return false;
  if (!profil.mfa_confirmat_la || !profil.mfa_sesiune_confirmata) return true;
  if (!idSesiune) return true;
  return profil.mfa_sesiune_confirmata !== idSesiune;
}
