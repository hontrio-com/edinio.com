import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreEmailSender } from "@/lib/email/sender";
import { sendCodCont, sendParolaSchimbata, type ScopCodCont } from "@/lib/email";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";
import { amprentaCodului, amprentaJetonului, codNou, jetonNou, optiuniCookie } from "./jeton";
import { curataContClientConfig } from "./config";
import { parolaPotrivita, verificareOarba } from "./parola";
import { deschideSesiune } from "./sesiune";
import { leagaComenzile } from "./comenzi";
import type { MagazinDeCont } from "./magazinul-cererii";
import { ipPentruBaza } from "./cerere";

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
  "Daca adresa poate fi folosita, ti-am trimis un cod pe email. Scrie-l mai jos.";
export const MESAJ_INTRARE_GRESITA =
  "Email sau parola gresita. Dupa mai multe incercari gresite, intrarea se opreste 15 minute; poti folosi oricand „Ai uitat parola?”.";
export const MESAJ_PREA_MULTE = "Prea multe incercari. Asteapta cateva minute si reia.";

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
 * ⚠ Cookie-ul se pune INTOTDEAUNA, si cand nu s-a trimis nimic: prezenta lui nu
 * are voie sa spuna daca adresa are cont.
 */
export async function pornestePas(p: {
  magazin: MagazinDeCont;
  scop: ScopPas;
  email: string;
  ip: string;
  contId?: string | null;
  parolaHash?: string | null;
}): Promise<{ trimis: boolean; motiv: string }> {
  const { jeton, amprenta } = jetonNou();
  (await cookies()).set(COOKIE_PAS, jeton, { ...optiuniCookie(), maxAge: MINUTE_PAS * 60 });

  if (!rateLimit(`contPas:ip:${p.ip}`, 10, 60_000)) return { trimis: false, motiv: "rafala" };
  const lim = await consumaLimita(`cont:pas:ip:${p.ip}`, 20, 3600, 900);
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
  if (!r?.ok) return { trimis: false, motiv: r?.motiv ?? "necunoscut" };

  return trimiteCodul(p.magazin, r.destinatie ?? p.email, cod, p.scop);
}

async function trimiteCodul(
  magazin: MagazinDeCont,
  destinatie: string,
  cod: string,
  scop: ScopCodCont,
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

/** Un cod nou pe aceeasi provocare. Aceleasi plafoane ca primul. */
export async function retrimitePas(p: { magazin: MagazinDeCont; ip: string }): Promise<{ trimis: boolean; motiv: string; scop: string | null }> {
  const jeton = (await cookies()).get(COOKIE_PAS)?.value;
  if (!jeton) return { trimis: false, motiv: "fara-provocare", scop: null };
  if (!rateLimit(`contPas:ip:${p.ip}`, 10, 60_000)) return { trimis: false, motiv: "rafala", scop: null };

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
  const t = await trimiteCodul(p.magazin, r.destinatie, cod, r.scop as ScopCodCont);
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

  if (!rateLimit(`contVerif:ip:${p.ip}`, 20, 60_000)) return { ok: false, motiv: "rafala", contId: null, scop: null, contNou: false };
  const lim = await consumaLimita(`cont:verif:ip:${p.ip}`, 40, 3600, 900);
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
      return "Codul nu e bun. Mai incearca o data.";
    case "prea-multe-incercari":
      return "Prea multe incercari gresite. Cere un cod nou.";
    case "fara-cod":
    case "fara-provocare":
    case "provocare-incheiata":
      return "Codul a expirat sau a fost deja folosit. Cere unul nou.";
    case "fara-parola":
      return "Scrie si parola noua.";
    case "rafala":
    case "limita-ip":
      return MESAJ_PREA_MULTE;
    default:
      return "Nu am putut verifica codul. Incearca din nou.";
  }
}

// ═══ Dispozitivele de incredere ════════════════════════════════════════════

async function dispozitivCunoscut(businessId: string, contId: string): Promise<boolean> {
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

export type RezultatIntrare =
  | { rezultat: "intrat"; contId: string }
  | { rezultat: "cod" }
  | { rezultat: "refuzat"; mesaj: string };

export async function intraCuParola(p: {
  magazin: MagazinDeCont & { contClientConfig: unknown };
  email: string;
  parola: string;
  ip: string;
}): Promise<RezultatIntrare> {
  if (!rateLimit(`contParola:ip:${p.ip}`, 10, 60_000)) {
    return { rezultat: "refuzat", mesaj: MESAJ_PREA_MULTE };
  }
  const lim = await consumaLimita(`cont:parola:ip:${p.ip}`, 40, 900, 900);
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

  /*
    ⚠⚠ Fara cont, fara parola sau blocat: ACEEASI munca si ACELASI raspuns ca la o
    parola gresita. Blocajul pe cont nu se spune pe fata: altfel cinci incercari
    ar fi aflat daca adresa are cont.
  */
  const potrivita = contId && r?.parola_hash && !r.blocat
    ? await parolaPotrivita(p.parola, r.parola_hash)
    : await verificareOarba(p.parola);

  if (!potrivita || !contId) {
    await admin.rpc("cont_intrare_esuata", { p_business: p.magazin.id, p_cont: contId, p_ip: ip });
    return { rezultat: "refuzat", mesaj: MESAJ_INTRARE_GRESITA };
  }

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
    const { data } = await createAdminClient().rpc("cont_parola_contului", { p_business: magazin.id, p_cont: contId });
    const r = Array.isArray(data) ? data[0] : data;
    if (!r?.email) return;
    const sender = await getStoreEmailSender(createAdminClient(), magazin.id);
    await sendParolaSchimbata(r.email, { numeMagazin: numeleMagazinului(magazin), adresaCont: paginaDeIntrare(magazin) }, sender);
  } catch (e) {
    await logError({
      action: "cont/parola",
      message: `instiintarea schimbarii parolei nu a plecat: ${String(e)}`,
      businessId: magazin.id,
      severity: "warning",
    });
  }
}
