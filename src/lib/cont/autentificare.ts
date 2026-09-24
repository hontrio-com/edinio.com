import { cookies } from "next/headers";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreEmailSender } from "@/lib/email/sender";
import { sendCodCont, sendParolaSchimbata, type SablonCod } from "@/lib/email";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";
import { amprentaCodului, amprentaJetonului, codNou, jetonNou, optiuniCookie } from "./jeton";
import { curataContClientConfig } from "./config";
import { parolaPotrivita, verificareOarba } from "./parola";
import { deschideSesiune } from "./sesiune";
import { leagaComenzile } from "./comenzi";
import { contacteleMele } from "./date";
import type { MagazinDeCont } from "./magazinul-cererii";
import { cheieIp, ipPentruBaza } from "./cerere";

export { ipPentruBaza };

/**
 * Intrarea cu email si parola, contul nou si resetarea, cu codul de pe email ca
 * al doilea pas (cerut de proprietar pe 24.09.2026).
 *
 * ⚠⚠ CODUL E LEGAT DE BROWSERUL CARE L-A CERUT. Fiecare cod are o PROVOCARE: un
 * jeton aleator tinut in cookie-ul `httpOnly` `ec_cont_pas`, din care in baza
 * ajunge numai amprenta. Un cod citit din emailul altcuiva nu deschide nimic fara
 * acest cookie, iar un cookie fara cod nu deschide nimic fara email.
 *
 * ⚠⚠ UN SINGUR RASPUNS acolo unde adevarul ar spune cine are cont: la contul nou
 * si la resetare, ruta raspunde la fel si cand adresa e cunoscuta, si cand nu e,
 * iar cookie-ul provocarii se scrie in ambele cazuri. La intrare, parola gresita,
 * contul inexistent si contul blocat raspund LA FEL, iar pentru o adresa fara cont
 * se consuma aceeasi munca de calcul (`verificareOarba`).
 *
 * ⚠ Parola nu se trimite niciodata spre `logError` sau spre consola.
 */

/** Cookie-ul provocarii: cat traieste pasul al doilea. */
export const COOKIE_PAS = "ec_cont_pas";
/** Cookie-ul dispozitivului de incredere. */
export const COOKIE_DISPOZITIV = "ec_disp";

export const MINUTE_COD = 10;
const MINUTE_PAS = 20;
export const ZILE_DISPOZITIV = 60;

export const MESAJ_PARTEA_INTAI =
  "Daca adresa poate fi folosita, ti-am trimis un cod pe email. Introdu-l mai jos.";
export const MESAJ_INTRARE_GRESITA =
  "Email sau parola gresita. Dupa mai multe incercari nereusite, autentificarea se blocheaza 15 minute. Poti folosi oricand „Ai uitat parola?”.";
export const MESAJ_PREA_MULTE = "Prea multe incercari. Asteapta cateva minute si incearca din nou.";
/**
 * Contul suspendat de magazin (din panou, Clienti, Conturi). Se spune NUMAI dupa
 * ce parola, sau codul de pe email, a dovedit ca omul e chiar el.
 */
export const MESAJ_CONT_SUSPENDAT =
  "Contul tau la acest magazin a fost suspendat. Pentru detalii, scrie magazinului.";

/**
 * Refuzurile care tin de IP (sau de retea), nu de adresa: pot fi spuse pe fata,
 * fiindca nu spun nimic despre cine are cont.
 */
const MOTIVE_DE_IP = new Set(["rafala", "limita-ip", "prea-multe-de-aici"]);
export function eLimitaDeIp(motiv: string): boolean {
  return MOTIVE_DE_IP.has(motiv);
}

/**
 * ⚠⚠ Plafonul pe IP cerut INAINTEA calculului scump. scrypt cere 32 MB si cam
 * 100 ms pe fir, pe un bazin de patru fire impartit cu restul serverului; o rafala
 * de parole trimise fara nicio alta cerinta ar fi ocupat instanta.
 */
export async function permisDeCalcul(ip: string): Promise<boolean> {
  const cheie = cheieIp(ip);
  if (!rateLimit(`contCalcul:ip:${cheie}`, 10, 60_000)) return false;
  const lim = await consumaLimita(`cont:calcul:ip:${cheie}`, 40, 900, 900);
  return lim.permis;
}

function numeleMagazinului(m: MagazinDeCont): string {
  return m.store_name ?? m.business_name ?? "magazin";
}

/** Adresa paginii de intrare, pentru emailul „parola s-a schimbat". */
function paginaDeIntrare(m: MagazinDeCont): string | null {
  return m.custom_domain ? `https://${m.custom_domain}/cont/intra` : null;
}

// ═══ Pasul al doilea: codul pe email ═══════════════════════════════════════

export type ScopPas = "inregistrare" | "doi-pasi" | "resetare-parola";

/**
 * Porneste pasul al doilea: scrie codul (legat de o provocare noua), trimite
 * emailul si pune cookie-ul provocarii.
 *
 * ⚠ Cookie-ul se pune cand baza a scris o provocare: codul, sau momeala unei
 * resetari fara cont. Deci si la o adresa fara cont (prezenta lui nu are voie sa
 * spuna cine are cont), dar NU la un refuz, care ar fi inlocuit provocarea buna.
 */
export async function pornestePas(p: {
  magazin: MagazinDeCont;
  scop: ScopPas;
  email: string;
  ip: string;
  contId?: string | null;
  parolaHash?: string | null;
  /**
   * ⚠⚠ Emailul pleaca DUPA raspuns (`after`). Folosit la contul nou si la
   * resetare: acolo, pentru o adresa fara cont nu pleaca nimic, iar un raspuns
   * care astepta trimiterea ar fi spus din timp cine are cont.
   */
  inFundal?: boolean;
}): Promise<{ trimis: boolean; motiv: string }> {
  const { jeton, amprenta } = jetonNou();

  const cheie = cheieIp(p.ip);
  if (!rateLimit(`contPas:ip:${cheie}`, 10, 60_000)) return { trimis: false, motiv: "rafala" };
  const lim = await consumaLimita(`cont:pas:ip:${cheie}`, 20, 3600, 900);
  if (!lim.permis) return { trimis: false, motiv: "limita-ip" };

  const { cod, amprenta: codHash } = codNou();
  const { data, error } = await createAdminClient().rpc("cont_cere_cod", {
    p_business: p.magazin.id,
    p_scop: p.scop,
    p_fel: "email",
    p_destinatie_bruta: p.email,
    p_cod_hash: codHash,
    p_cont: p.contId ?? null,
    p_minute: MINUTE_COD,
    p_ip: ipPentruBaza(p.ip),
    p_provocare_hash: amprenta,
    p_parola_hash: p.parolaHash ?? null,
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  /*
    ⚠⚠ Cookie-ul provocarii se scrie NUMAI cand baza a scris o provocare (codul, sau
    momeala la o resetare fara cont, ca raspunsul sa ramana acelasi). Scris inainte,
    un refuz („ai deja coduri vii") suprascria provocarea buna cu una goala, iar
    omul caruia i se spunea „foloseste ultimul cod" nu mai avea cum. Refuzurile nu
    depind de existenta contului (momeala se numara ca un cod), deci nu spun nimic.
  */
  if (r?.ok || r?.motiv === "fara-cont") {
    (await cookies()).set(COOKIE_PAS, jeton, { ...optiuniCookie(), maxAge: MINUTE_PAS * 60 });
  } else if (p.scop === "inregistrare") {
    /*
      ⚠ La contul nou provocarea veche poarta PAROLA de atunci: pastrata, codul
      vechi ar fi deschis contul cu parola dinainte, nu cu cea tocmai scrisa.
    */
    (await cookies()).delete(COOKIE_PAS);
  }
  if (!r?.ok) return { trimis: false, motiv: r?.motiv ?? "necunoscut" };

  /* Un cont nou pe o adresa cu cont are ALT email: codul de acolo schimba parola. */
  const sablon: SablonCod = p.scop === "inregistrare" && r.motiv === "trimis-cont-existent" ? "inregistrare-existent" : p.scop;
  const destinatie = r.destinatie ?? p.email;
  if (p.inFundal) {
    after(async () => {
      await trimiteCodul(p.magazin, destinatie, cod, sablon);
    });
    return { trimis: true, motiv: "programat" };
  }
  return trimiteCodul(p.magazin, destinatie, cod, sablon);
}

async function trimiteCodul(
  magazin: MagazinDeCont,
  destinatie: string,
  cod: string,
  scop: SablonCod,
): Promise<{ trimis: boolean; motiv: string }> {
  const sender = await getStoreEmailSender(createAdminClient(), magazin.id);
  const rez = await sendCodCont(destinatie, { cod, minute: MINUTE_COD, numeMagazin: numeleMagazinului(magazin), scop }, sender);
  if ("error" in rez) {
    await logError({
      action: "cont/cod",
      message: `codul nu a plecat pe email (${scop})`,
      businessId: magazin.id,
      severity: "warning",
    });
    return { trimis: false, motiv: "email-esuat" };
  }
  return { trimis: true, motiv: "trimis" };
}

/** Exista un pas al doilea inceput in browserul asta? (Fara el, nimic de verificat.) */
export async function arePas(): Promise<boolean> {
  return !!(await cookies()).get(COOKIE_PAS)?.value;
}

/** Un cod nou pe aceeasi provocare. Aceleasi plafoane ca primul. */
export async function retrimitePas(p: { magazin: MagazinDeCont; ip: string }): Promise<{ trimis: boolean; motiv: string; scop: string | null }> {
  const jeton = (await cookies()).get(COOKIE_PAS)?.value;
  if (!jeton) return { trimis: false, motiv: "fara-provocare", scop: null };
  if (!rateLimit(`contPas:ip:${cheieIp(p.ip)}`, 10, 60_000)) return { trimis: false, motiv: "rafala", scop: null };

  const { cod, amprenta: codHash } = codNou();
  const { data, error } = await createAdminClient().rpc("cont_retrimite_cod", {
    p_business: p.magazin.id,
    p_provocare_hash: amprentaJetonului(jeton),
    p_cod_hash: codHash,
    p_minute: MINUTE_COD,
    p_ip: ipPentruBaza(p.ip),
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.ok || !r.destinatie || !r.scop) return { trimis: false, motiv: r?.motiv ?? "necunoscut", scop: r?.scop ?? null };
  const sablon: SablonCod = r.scop === "inregistrare" && r.motiv === "trimis-cont-existent"
    ? "inregistrare-existent"
    : (r.scop as SablonCod);
  /* Ca la prima trimitere: numai pasul doi (dupa parola) asteapta emailul. */
  if (r.scop !== "doi-pasi") {
    const destinatie = r.destinatie;
    after(async () => {
      await trimiteCodul(p.magazin, destinatie, cod, sablon);
    });
    return { trimis: true, motiv: "programat", scop: r.scop };
  }
  const t = await trimiteCodul(p.magazin, r.destinatie, cod, sablon);
  return { ...t, scop: r.scop };
}

/**
 * Verifica codul pasului al doilea. Pentru resetare, primeste si amprenta parolei
 * noi. Cookie-ul provocarii se sterge numai la reusita: dupa o greseala, omul
 * trebuie sa poata incerca din nou.
 */
export async function verificaPas(p: {
  magazin: MagazinDeCont;
  cod: string;
  ip: string;
  parolaHash?: string | null;
}): Promise<{ ok: boolean; motiv: string; contId: string | null; scop: string | null; contNou: boolean }> {
  const cos = await cookies();
  const jeton = cos.get(COOKIE_PAS)?.value;
  if (!jeton) return { ok: false, motiv: "fara-cod", contId: null, scop: null, contNou: false };

  const cheie = cheieIp(p.ip);
  if (!rateLimit(`contVerif:ip:${cheie}`, 20, 60_000)) return { ok: false, motiv: "rafala", contId: null, scop: null, contNou: false };
  const lim = await consumaLimita(`cont:verif:ip:${cheie}`, 40, 3600, 900);
  if (!lim.permis) return { ok: false, motiv: "limita-ip", contId: null, scop: null, contNou: false };

  const { data, error } = await createAdminClient().rpc("cont_verifica_provocare", {
    p_business: p.magazin.id,
    p_provocare_hash: amprentaJetonului(jeton),
    p_cod_hash: amprentaCodului(p.cod),
    p_parola_hash: p.parolaHash ?? null,
    p_ip: ipPentruBaza(p.ip),
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  const ok = r?.ok === true && !!r.cont_id;
  if (ok) cos.delete(COOKIE_PAS);
  return { ok, motiv: r?.motiv ?? "necunoscut", contId: r?.cont_id ?? null, scop: r?.scop ?? null, contNou: r?.cont_nou === true };
}

/** Ce i se spune omului cand codul pasului al doilea nu e bun. */
export function mesajulPasului(motiv: string): string {
  switch (motiv) {
    case "gresit":
      return "Codul este gresit. Incearca din nou.";
    case "prea-multe-incercari":
      return "Prea multe incercari gresite. Incepe din nou peste cateva minute.";
    case "fara-cod":
    case "fara-provocare":
    case "provocare-incheiata":
      return "Codul a expirat sau a fost deja folosit. Cere unul nou.";
    case "fara-parola":
      return "Introdu si parola noua.";
    case "suspendat":
      return MESAJ_CONT_SUSPENDAT;
    case "rafala":
    case "limita-ip":
      return MESAJ_PREA_MULTE;
    default:
      return "Nu am putut verifica codul. Incearca din nou.";
  }
}

// ═══ Dispozitivele de incredere ════════════════════════════════════════════

export async function dispozitivCunoscut(businessId: string, contId: string): Promise<boolean> {
  const jeton = (await cookies()).get(COOKIE_DISPOZITIV)?.value;
  if (!jeton) return false;
  const { data, error } = await createAdminClient().rpc("cont_dispozitiv_cunoscut", {
    p_business: businessId,
    p_cont: contId,
    p_jeton_hash: amprentaJetonului(jeton),
  });
  if (error) throw error;
  return data === true;
}

/**
 * Tine minte browserul asta: la urmatoarea intrare cu parola, pe el nu se mai
 * cere codul (decat daca magazinul il cere mereu). ⚠ Best-effort: intrarea s-a
 * facut deja, deci o cadere aici nu are voie sa o strice.
 */
export async function tineMinteDispozitivul(businessId: string, contId: string): Promise<void> {
  try {
    const { jeton, amprenta } = jetonNou();
    const { data, error } = await createAdminClient().rpc("cont_dispozitiv_adauga", {
      p_business: businessId,
      p_cont: contId,
      p_jeton_hash: amprenta,
      p_zile: ZILE_DISPOZITIV,
    });
    if (error) throw error;
    if (data === true) {
      (await cookies()).set(COOKIE_DISPOZITIV, jeton, { ...optiuniCookie(), maxAge: ZILE_DISPOZITIV * 24 * 3600 });
    }
  } catch (e) {
    await logError({
      action: "cont/dispozitiv",
      message: `dispozitivul nu s-a putut tine minte: ${String(e)}`,
      businessId,
      severity: "warning",
    });
  }
}

// ═══ Intrarea cu parola ════════════════════════════════════════════════════

/**
 * Parola a fost buna: incercarea rezervata nu mai e o greseala. Nu arunca (omul a
 * trecut, iar o cadere aici nu trebuie sa-l intoarca), dar se SCRIE: ramasa in
 * jurnal, rezervarea s-ar numara la prag si ar putea bloca un om cinstit.
 */
async function elibereazaRezervarea(businessId: string, id: number): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("cont_incercare_reusita", { p_business: businessId, p_id: id });
    if (error) throw error;
  } catch (e) {
    await logError({
      action: "cont/parola",
      message: `incercarea buna a ramas numarata ca greseala: ${String(e)}`,
      businessId,
      severity: "warning",
    });
  }
}

export type RezultatIntrare =
  | { rezultat: "intrat"; contId: string }
  | { rezultat: "cod"; mesaj?: string }
  | { rezultat: "refuzat"; mesaj: string };

export async function intraCuParola(p: {
  magazin: MagazinDeCont & { contClientConfig: unknown };
  email: string;
  parola: string;
  ip: string;
}): Promise<RezultatIntrare> {
  const cheie = cheieIp(p.ip);
  if (!rateLimit(`contParola:ip:${cheie}`, 10, 60_000)) {
    return { rezultat: "refuzat", mesaj: MESAJ_PREA_MULTE };
  }
  const lim = await consumaLimita(`cont:parola:ip:${cheie}`, 40, 900, 900);
  if (!lim.permis) return { rezultat: "refuzat", mesaj: MESAJ_PREA_MULTE };

  const admin = createAdminClient();
  const ip = ipPentruBaza(p.ip);
  const { data, error } = await admin.rpc("cont_parola_pentru_intrare", {
    p_business: p.magazin.id,
    p_email: p.email,
    p_ip: ip,
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  const contId = r?.cont_id ?? null;

  /* Blocajul pe IP nu spune nimic despre cont, deci se spune pe fata. */
  if (r?.blocat_ip === true) return { rezultat: "refuzat", mesaj: MESAJ_PREA_MULTE };

  /*
    ⚠⚠ Blocajul pe CONT nu se aplica pe un dispozitiv de incredere (un browser pe
    care omul a trecut deja de codul de pe email): altfel un strain care greseste
    parola de cinci ori l-ar tine afara chiar de pe telefonul lui.
  */
  let deIncredere = r?.blocat_cont === true && !!contId && (await dispozitivCunoscut(p.magazin.id, contId));
  let blocatCont = r?.blocat_cont === true && !deIncredere;

  /*
    ⚠⚠ Incercarea se REZERVA inainte de comparatie, sub incuietoarea contului
    (`cont_incercare_parola`): altfel zeci de ghiciri trimise deodata citeau toate
    „sub prag" inainte ca vreuna sa scrie greseala. Cat contul e blocat, nu se mai
    rezerva nimic, deci un strain nu mai poate tine blocajul in viata.
  */
  let rezervare: number | null = null;
  if (contId && r?.parola_hash && !blocatCont && !deIncredere) {
    const { data: inc, error: eInc } = await admin.rpc("cont_incercare_parola", {
      p_business: p.magazin.id, p_cont: contId, p_ip: ip,
    });
    if (eInc) throw eInc;
    const ri = Array.isArray(inc) ? inc[0] : inc;
    /*
      ⚠ Blocajul poate aparea INTRE cele doua citiri (a cincea greseala a unui
      strain a ajuns prima). Dispozitivul de incredere ramane scutit si atunci.
    */
    if (ri?.blocat === true) {
      if (await dispozitivCunoscut(p.magazin.id, contId)) deIncredere = true;
      else blocatCont = true;
    } else rezervare = ri?.id ?? null;
  }

  /*
    ⚠⚠ Fara cont, fara parola sau blocat: ACEEASI munca si ACELASI raspuns ca la o
    parola gresita. Blocajul pe cont nu se spune pe fata: altfel cinci incercari
    ar fi aflat daca adresa are cont.
  */
  const potrivita = contId && r?.parola_hash && !blocatCont
    ? await parolaPotrivita(p.parola, r.parola_hash)
    : await verificareOarba(p.parola);

  if (!potrivita || !contId) {
    /* Rezervata = deja scrisa ca greseala. Blocat = numai IP-ul se numara, nu contul. */
    if (rezervare === null) {
      await admin.rpc("cont_intrare_esuata", { p_business: p.magazin.id, p_cont: blocatCont ? null : contId, p_ip: ip });
    }
    return { rezultat: "refuzat", mesaj: MESAJ_INTRARE_GRESITA };
  }
  if (rezervare !== null) await elibereazaRezervarea(p.magazin.id, rezervare);

  /*
    ⚠⚠ Contul suspendat de magazin: abia ACUM, dupa parola buna, se poate spune
    pe fata. Inainte de pasul doi si de dispozitivul de incredere, ca sa nu plece
    niciun cod si sa nu se deschida nicio sesiune. (Si baza refuza oricum o sesiune
    noua pe un cont suspendat, in `cont_sesiune_creeaza`.)
  */
  const { data: suspendat, error: eSuspendat } = await admin.rpc("cont_verifica_suspendarea", {
    p_business: p.magazin.id,
    p_cont: contId,
    p_ip: ip,
  });
  if (eSuspendat) throw eSuspendat;
  if (suspendat === true) return { rezultat: "refuzat", mesaj: MESAJ_CONT_SUSPENDAT };

  const cfg = curataContClientConfig(p.magazin.contClientConfig);
  if (cfg.verificare_intrare !== "mereu" && (await dispozitivCunoscut(p.magazin.id, contId))) {
    const { data: ok, error: e2 } = await admin.rpc("cont_intrare_cu_parola", {
      p_business: p.magazin.id,
      p_cont: contId,
      p_ip: ip,
    });
    if (e2) throw e2;
    if (ok === true) return { rezultat: "intrat", contId };
  }

  /* Parola a trecut: de aici incolo omul e chiar el, deci refuzul poate spune adevarul. */
  const pas = await pornestePas({ magazin: p.magazin, scop: "doi-pasi", email: p.email, contId, ip: p.ip });
  /*
    ⚠ „Ai deja coduri vii": provocarea din cookie e inca a lor (refuzul nu o mai
    suprascrie), deci omul trebuie dus la ecranul codului, nu lasat pe cel al
    parolei, unde „foloseste ultimul cod" n-ar avea unde.
  */
  if (!pas.trimis && (pas.motiv === "are-cod-viu" || pas.motiv === "prea-multe") && (await arePas())) {
    return { rezultat: "cod", mesaj: "Ti-am trimis deja un cod pe email. Foloseste-l pe ultimul primit." };
  }
  if (!pas.trimis) {
    return {
      rezultat: "refuzat",
      mesaj: pas.motiv === "buget-epuizat" || pas.motiv === "email-esuat"
        ? "Nu am putut trimite codul de verificare acum. Incearca din nou mai tarziu."
        : "Ai cerut deja cateva coduri. Foloseste-l pe ultimul primit sau asteapta cateva minute.",
    };
  }
  return { rezultat: "cod" };
}

// ═══ Parola ceruta din cont, inaintea unei fapte grele ═════════════════════

export type ContulCuParola = { are_parola: boolean; email: string | null; parola_hash: string | null };

export type ParolaDinCont =
  | { ok: true; cont: ContulCuParola }
  | { ok: false; status: 400 | 404 | 429; eroare: string };

/**
 * Parola contului, ceruta cu sesiunea deschisa, inaintea unei fapte grele:
 * schimbarea parolei, o adresa noua in cont, stergerea contului.
 *
 * ⚠⚠ Fara ea, o sesiune ramasa deschisa pe un calculator strain ajungea sa
 * schimbe adresa, parola sau sa stearga contul. Si cu ACELEASI plafoane ca la
 * intrare (IP-ul inaintea lui scrypt, blocajul pe IP si pe cont, greseala
 * numarata): altfel fiecare usa de aici ar fi fost una de ghicit parole.
 *
 * Un cont FARA parola (facut inainte de 24.09.2026) trece fara ea.
 *
 * `permisCerut`: ruta a cerut deja `permisDeCalcul` (schimbarea parolei o cere
 * oricum, pentru amprenta parolei noi); altfel s-ar fi numarat de doua ori.
 */
export async function parolaDinCont(p: {
  magazinId: string;
  contId: string;
  parola: unknown;
  ip: string;
  mesajGresita: string;
  permisCerut?: boolean;
}): Promise<ParolaDinCont> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cont_parola_contului", { p_business: p.magazinId, p_cont: p.contId });
  if (error) throw error;
  const cont = (Array.isArray(data) ? data[0] : data) ?? null;
  if (!cont) return { ok: false, status: 404, eroare: "Contul nu mai exista." };
  if (!cont.are_parola) return { ok: true, cont };

  if (!p.permisCerut && !(await permisDeCalcul(p.ip))) return { ok: false, status: 429, eroare: MESAJ_PREA_MULTE };

  const { data: st } = await admin.rpc("cont_parola_pentru_intrare", {
    p_business: p.magazinId, p_email: cont.email ?? "", p_ip: ipPentruBaza(p.ip),
  });
  const rand = Array.isArray(st) ? st[0] : st;
  let blocat = rand?.blocat_ip === true || rand?.blocat_cont === true;
  /* Aceeasi rezervare ca la intrare: ghicirile deodata nu mai trec toate de prag. */
  let rezervare: number | null = null;
  if (!blocat) {
    const { data: inc, error: eInc } = await admin.rpc("cont_incercare_parola", {
      p_business: p.magazinId, p_cont: p.contId, p_ip: ipPentruBaza(p.ip),
    });
    if (eInc) throw eInc;
    const ri = Array.isArray(inc) ? inc[0] : inc;
    if (ri?.blocat === true) blocat = true;
    else rezervare = ri?.id ?? null;
  }
  const scrisa = typeof p.parola === "string" ? p.parola : "";
  const buna = blocat ? await verificareOarba(scrisa) : await parolaPotrivita(scrisa, cont.parola_hash);
  if (!buna) {
    if (rezervare === null) {
      await admin.rpc("cont_intrare_esuata", { p_business: p.magazinId, p_cont: blocat ? null : p.contId, p_ip: ipPentruBaza(p.ip) });
    }
    return { ok: false, status: blocat ? 429 : 400, eroare: blocat ? MESAJ_PREA_MULTE : p.mesajGresita };
  }
  if (rezervare !== null) await elibereazaRezervarea(p.magazinId, rezervare);
  return { ok: true, cont };
}

/**
 * Parola noua e chiar cea de acum? Nu e o autentificare (omul a trecut deja de
 * `parolaDinCont`): refuza doar o schimbare care l-ar scoate degeaba de pe toate
 * dispozitivele.
 */
export async function parolaNouaEAceeasi(noua: string, hashActual: string | null): Promise<boolean> {
  return !!hashActual && (await parolaPotrivita(noua, hashActual));
}

// ═══ Dupa o intrare reusita ════════════════════════════════════════════════

/**
 * Deschide sesiunea si leaga comenzile. ⚠ Legarea nu are voie sa strice
 * intrarea: omul a dovedit ca e el, deci intra chiar daca legarea cade.
 */
export async function incheieIntrarea(magazinId: string, contId: string, ip: string): Promise<void> {
  await deschideSesiune(magazinId, contId, ipPentruBaza(ip));
  try {
    await leagaComenzile(magazinId, contId);
  } catch (e) {
    await logError({
      action: "cont/intra",
      message: `legarea comenzilor a esuat: ${String(e)}`,
      businessId: magazinId,
      severity: "warning",
    });
  }
}

/** Instiintarea ca parola s-a schimbat. Best-effort. */
export async function anuntaParolaSchimbata(magazin: MagazinDeCont, contId: string): Promise<void> {
  try {
    /* ⚠ Pe TOATE adresele confirmate: cine a schimbat parola dintr-o sesiune furata
       ar fi putut adauga intai adresa lui, iar emailul pleca numai pe cea mai veche. */
    const adrese = (await contacteleMele(magazin.id, contId))
      .filter((c) => c.fel === "email" && c.verificat)
      .map((c) => c.valoareBruta);
    if (adrese.length === 0) return;
    const sender = await getStoreEmailSender(createAdminClient(), magazin.id);
    for (const a of adrese) {
      await sendParolaSchimbata(a, { numeMagazin: numeleMagazinului(magazin), adresaCont: paginaDeIntrare(magazin) }, sender);
    }
  } catch (e) {
    await logError({
      action: "cont/parola",
      message: `instiintarea schimbarii parolei nu a plecat: ${String(e)}`,
      businessId: magazin.id,
      severity: "warning",
    });
  }
}
