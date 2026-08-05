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
 * UNDE E REPARATIA DE FOND, ca sa nu se caute aici
 *
 * Din 05.08.2026 sesiunea nu se mai emite inainte de al doilea factor: cand
 * contul are MFA pornit, `login()` nu scrie cookie-urile de sesiune, ci pastreaza
 * tokenurile sigilate pana la verificarea codului (src/lib/auth/sesiune-asteptare.ts).
 * Deci un atacator cu parola nu are, pur si simplu, sesiune.
 *
 * Ce urmeaza mai jos e A DOUA plasa: raspunde la „sesiunea ACEASTA a trecut de
 * al doilea factor?" si e verificat in proxy (rute /api si actiuni de server),
 * in layout-ul de panou si in `requireAdmin`. Rostul ei e sa nu se redeschida in
 * tacere aceeasi gaura daca cineva modifica vreodata fluxul de autentificare.
 *
 * INTREBAREA DE DINAINTE era „exista o provocare MFA neexpirata?", cu doua
 * defecte: raspunsul devenea „nu" dupa 10 minute (deci „codul a expirat"
 * insemna „liber", desi sesiunea Supabase traieste mult peste), si era o
 * proprietate a CONTULUI, nu a sesiunii.
 */

export interface SesiuneConfirmata {
  /** session_id-ul din JWT */
  s: string;
  /** cand a fost confirmata, epoch ms */
  t: number;
}

export interface ProfilMfa {
  mfa_email_enabled?: boolean | null;
  mfa_confirmat_la?: string | null;
  mfa_sesiuni_confirmate?: unknown;
}

export interface ClaimuriSesiune {
  sub: string;
  session_id: string;
}

/** Cate sesiuni confirmate se tin minte, si cat. */
export const MAX_SESIUNI_CONFIRMATE = 10;
export const VIATA_CONFIRMARE_MS = 30 * 24 * 60 * 60 * 1000;

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
    // `atob` da un singur octet per caracter (latin1). Corpul tokenului poate
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

/** Citeste lista de sesiuni confirmate dintr-o coloana jsonb, fara sa creada nimic pe cuvant. */
export function listaSesiuni(brut: unknown): SesiuneConfirmata[] {
  if (!Array.isArray(brut)) return [];
  const acum = Date.now();
  return brut.filter((x): x is SesiuneConfirmata => {
    if (!x || typeof x !== "object") return false;
    const c = x as Partial<SesiuneConfirmata>;
    if (typeof c.s !== "string" || !c.s) return false;
    if (typeof c.t !== "number") return false;
    return acum - c.t < VIATA_CONFIRMARE_MS;
  });
}

/**
 * Adauga o sesiune la lista, curatand-o: fara duplicate, fara confirmari mai
 * vechi de 30 de zile, cel mult MAX_SESIUNI_CONFIRMATE intrari (cele mai noi).
 *
 * DE CE O LISTA si nu un singur id: cu un singur id, autentificarea de pe
 * telefon ar fi scos laptopul din priza — poarta ar fi vazut sesiunea de pe
 * laptop ca neconfirmata, desi fusese confirmata cu codul cum trebuie.
 */
export function adaugaSesiune(brut: unknown, idSesiune: string): SesiuneConfirmata[] {
  const vechi = listaSesiuni(brut).filter((x) => x.s !== idSesiune);
  // Cea noua se pune PRIMA, nu ultima. `Array.prototype.sort` e stabil, deci la
  // marci de timp egale (aceeasi milisecunda) ordinea de intrare decide cine
  // supravietuieste taierii de mai jos — iar taiata trebuie sa fie mereu cea mai
  // veche, niciodata confirmarea tocmai facuta.
  const toate = [{ s: idSesiune, t: Date.now() }, ...vechi];
  toate.sort((a, b) => b.t - a.t);
  return toate.slice(0, MAX_SESIUNI_CONFIRMATE);
}

/**
 * Raspunde la „sesiunea aceasta NU e confirmata cu al doilea factor?".
 *
 * Adevarat inseamna „opreste cererea". Ordinea conteaza:
 *
 *  - profil lipsa  -> ADEVARAT. Nu stim nimic, deci nu presupunem nimic bun.
 *    (Apelantul are grija sa nu ajunga aici pentru conturile despre care stie
 *    deja ca nu au MFA — vezi `stare-mfa.ts`.)
 *  - MFA stins     -> FALS. Conturile fara al doilea factor trebuie sa mearga
 *    exact ca inainte; nu se schimba absolut nimic pentru ele.
 *  - sesiune necunoscuta -> ADEVARAT. Daca nu putem identifica sesiunea cererii
 *    nu avem cu ce compara.
 *  - sesiunea nu e in lista -> ADEVARAT. Aici e reparatia propriu-zisa: „nu s-a
 *    confirmat" NU mai poate deveni „liber" prin trecerea timpului.
 */
export function sesiuneNeconfirmata(
  profil: ProfilMfa | null | undefined,
  idSesiune: string | null | undefined,
): boolean {
  if (!profil) return true;
  if (!profil.mfa_email_enabled) return false;
  if (!idSesiune) return true;
  return !listaSesiuni(profil.mfa_sesiuni_confirmate).some((x) => x.s === idSesiune);
}
