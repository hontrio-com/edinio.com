import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAdvertPaidFeatures, isOlxError, type OlxResult } from "./client";
import { loadOlxContext } from "./sync";
import { eAtarnata, PRAG_ATARNATA_MS } from "@/lib/operatii/registru";
import type { OlxPaidFeature } from "./types";

type Db = SupabaseClient<Database>;

/**
 * PLATILE CARE AU RAMAS NELAMURITE, SI SINGURA CALE PRIN CARE SE INCHID SINGURE
 * ══════════════════════════════════════════════════════════════════════════ (02.09.2026)
 *
 * ⚠ DE CE STA AICI, SI NU IN `olx.actions.ts`. Actiunile incep toate cu `guard()`, care face
 * `supabase.auth.getUser()` pe clientul cu cookie-uri. Intr-un CRON nu exista cookie: raspunsul ar
 * fi „Neautorizat" pe fiecare rand, la fiecare trecere, si nimeni nu s-ar plange — un pas care
 * pare sa lucreze si nu lucreaza niciodata. Aceeasi orbire ca a veghii care arata zero.
 *
 * ⚠ Si nu se putea nici exporta de acolo: tot ce se exporta dintr-un modul `"use server"` devine
 * un capat public. Aceeasi lectie ca la `logError`.
 *
 * ⚠ CE FACE SI CE NU FACE. Inchide un rand cand efectul CHIAR se vede la ei si se poate lega de
 * randul asta. NU deblocheaza nimic, niciodata. Fiecare dovada negativa pe care o putem lua de la
 * OLX s-a dovedit nesigura:
 *
 *   * ruta `/adverts/{id}/paid-features` intoarce si intrarile EXPIRATE, deci prezenta codului nu
 *     dovedeste nimic si absenta lui nu dovedeste nici atat;
 *   * un `200` cu corp stricat iese din `call` ca `{ data: {} }`, iar citit ca lista goala ar da
 *     acelasi verdict ca un raspuns bun si gol;
 *   * pachetele nu se pot lega de o cumparare anume — raspunsul lor spune cate ai, nu cand le-ai
 *     luat, iar sloturile se consuma singure pe masura ce cronul publica anunturi.
 *
 * Deblocarea o ia omul, asumat, din panou. Dovada pozitiva inchide un caz; lipsa dovezii nu
 * deschide unul.
 */

/** O plata catre OLX al carei rezultat n-a fost confirmat. */
export interface OlxPlataNelamurita {
  id: string;
  cheie: string;
  creatLa: string;
  ultimaEroare: string | null;
  /** Ce anume s-a incercat, citit din cheie: `promovare:123:top_ad:<intentie>`. */
  descriere: string;
  /** `necunoscut` = apelul s-a incheiat si raspunsul a fost neinteligibil. */
  stare: "in_curs" | "necunoscut";
}

/** Ce am aflat despre o plata nelamurita. */
export type LamurireOlx =
  | { stare: "intrat"; mesaj: string }
  | { stare: "inca-nu-stim"; mesaj: string };

/**
 * Ce ne-au raspuns ei, cu deosebirea care conteaza: „stiu" fata de „n-am putut afla".
 *
 * ⚠ `404` INSEAMNA „AM AFLAT: NU E NIMIC ACOLO", nu „n-am putut verifica". E chiar raspunsul lor
 * pentru un anunt care n-a fost promovat niciodata — adica pentru prima promovare a fiecarui anunt.
 * Numarat drept pana, ar inchide usa exact in cazul obisnuit.
 *
 * ⚠ Si un `200` poate fi de necitit. `call` intoarce `{ data: {} }` pentru un corp stricat si
 * `{ data: undefined }` pentru `204`. Luate drept lista goala, ar fi devenit „am verificat, nu e
 * nimic" — un verdict pe o cale prin care n-a trecut niciodata vreo informatie.
 */
export type CeStim<T> = { stiu: true; date: T[] } | { stiu: false; motiv: string };

export function citesteLista<T>(r: OlxResult<T[]> | { error: string }): CeStim<T> {
  if ("error" in r && !("status" in r)) return { stiu: false, motiv: r.error };
  const rr = r as OlxResult<T[]>;
  if (isOlxError(rr)) {
    if (rr.status === 404) return { stiu: true, date: [] };
    return { stiu: false, motiv: rr.error };
  }
  if (!Array.isArray(rr.data)) return { stiu: false, motiv: "raspuns fără listă" };
  return { stiu: true, date: rr.data };
}

/**
 * Promovarea asta e ACTIVA acum pe anuntul asta?
 *
 * ⚠ PREZENTA CODULUI NU E DOVADA. Ruta lor intoarce si promovarile EXPIRATE — se vede in
 * `getOlxPromovariAnunt`, unde „expirata" se calculeaza tocmai din `valid_to` trecut. Cautat doar
 * dupa `code`, orice anunt promovat vreodata ar parea promovat pentru totdeauna.
 *
 * ⚠ Si cand `valid_to` LIPSESTE, raspunsul nu e „a expirat", ci „e activa". Tipul lor spune ca
 * data vine numai pe cele active; citita ca expirare, ar fi lasat sa se cumpere peste una vie.
 */
export function promovareaEActiva(lista: OlxPaidFeature[], code: string, acum = Date.now()) {
  return lista.find((f) => {
    if (f.code !== code) return false;
    const pana = (f as { valid_to?: unknown }).valid_to;
    if (typeof pana !== "string") return true;
    const t = Date.parse(pana);
    return !Number.isFinite(t) || t > acum;
  });
}

/**
 * Cheia, pe intelesul omului. `plata:olx:promovare:123:top_ad:<intentie>`.
 *
 * ⚠ SE CITESTE POZITIONAL, si de-aia id-ul intentiei sta la COADA. Pus in fata, `b[2]` ar deveni
 * un id, nicio ramura nu s-ar mai potrivi, si orice plata nelamurita ar raspunde pe veci „inca nu
 * stim" — cu descrierea aratata omului ca sir brut.
 */
export function descrieCheiaDePlata(cheie: string): string {
  const b = cheie.split(":");
  if (b[2] === "promovare") return `Promovare „${b[4] ?? "?"}" pe anunțul ${b[3] ?? "?"}`;
  if (b[2] === "pachet-anunt") return `Pachet pentru anunțul ${b[3] ?? "?"}`;
  if (b[2] === "pachet-categorie") return `Pachet de ${b[4] ?? "?"} anunțuri în categoria ${b[3] ?? "?"}`;
  return cheie;
}

/**
 * Platile care atarna, pentru un magazin.
 *
 * ⚠ PRAGUL E AL REGISTRULUI, nu unul nou. `eAtarnata` exista tocmai ca sa nu se arate ca „ramasa
 * neterminata" chiar operatia care TOCMAI a plecat, si sa nu i se puna alaturi un buton care,
 * apasat atunci, ar debloca o operatie care CHIAR se executa. Aceeasi constanta hotaraste si ce se
 * numara, si ce se arata, si ce accepta butonul.
 */
export async function platiNelamurite(
  admin: Db, businessId: string, acum = Date.now(),
): Promise<{ plati: OlxPlataNelamurita[]; error?: string }> {
  const { data, error } = await admin
    .from("operatii_externe")
    .select("id, cheie, stare, creat_la, ultima_eroare")
    .eq("business_id", businessId).eq("furnizor", "olx").eq("fel", "plata")
    .in("stare", ["in_curs", "necunoscut"])
    .order("creat_la", { ascending: true }).limit(50);
  if (error) return { plati: [], error: "Nu am putut citi plățile în așteptare." };
  const randuri = (data ?? []) as {
    id: string; cheie: string; stare: string; creat_la: string; ultima_eroare: string | null;
  }[];
  return {
    plati: randuri
      .map((r) => ({
        id: r.id, cheie: r.cheie, creatLa: r.creat_la, ultimaEroare: r.ultima_eroare,
        descriere: descrieCheiaDePlata(r.cheie),
        stare: r.stare as "in_curs" | "necunoscut",
      }))
      .filter((p) => eAtarnata({ stare: p.stare, creatLa: p.creatLa }, acum)),
  };
}

/**
 * Intreaba OLX daca plata a intrat, si inchide randul cand se vede ca da.
 *
 * ⚠ NU DEBLOCHEAZA NICIODATA. Vezi nota de sus: „dovada pozitiva poate inchide, lipsa dovezii nu
 * poate deschide".
 */
export async function lamurestePlata(
  admin: Db, businessId: string, operatieId: string,
): Promise<LamurireOlx | { error: string }> {
  const { data, error } = await admin
    .from("operatii_externe").select("id, cheie, stare, creat_la, tinta_idempotenta")
    .eq("id", operatieId).eq("business_id", businessId)
    .eq("furnizor", "olx").eq("fel", "plata").maybeSingle();
  if (error) return { error: "Nu am putut citi operația." };
  if (!data) return { error: "Operația nu mai există." };
  if (!["in_curs", "necunoscut"].includes(String(data.stare))) {
    return { stare: "intrat", mesaj: "Operația s-a lămurit deja pe alt drum. Reîncarcă pagina." };
  }

  const nascut = Date.parse(String(data.creat_la));
  /*
   * ⚠ RABDARE INAINTE DE ORICE INTREBARE. OLX nu arata pe loc ce tocmai a primit, iar un `GET` prea
   * devreme e chiar felul de raspuns care nu inseamna nimic.
   *
   * ⚠ SI PRAGUL DE AICI E AL INTARZIERII LOR, nu o potrivire cu cel al panoului. Comentariul de
   * dinainte sustinea ca e „acelasi dupa care randul apare in panou" — si era fals tocmai pentru
   * `necunoscut`, adica starea pe care functia asta o lamureste cel mai des: `eAtarnata` o arata
   * PE LOC, fara niciun prag. Se imprumuta doar CIFRA, fiindca e o margine buna pentru cat le ia
   * lor sa aseze un efect; nu se imprumuta si motivul.
   *
   * ⚠ Afirmatia falsa apucase deja sa fie copiata in `renuntaLaOlxPlata`, unde n-avea niciun
   * temei. Asa se raspandeste: o motivare scrisa langa cod devine fapt pentru cine o citeste.
   */
  if (Number.isFinite(nascut) && Date.now() - nascut < PRAG_ATARNATA_MS) {
    return {
      stare: "inca-nu-stim",
      mesaj: "Plata a plecat acum câteva momente. Mai așteaptă un minut și verifică din nou.",
    };
  }

  const bucati = String(data.cheie).split(":");
  if (bucati[2] !== "promovare") {
    /*
     * ⚠ PACHETELE NU SE POT DOVEDI DE AICI, si asta se spune, nu se ascunde intr-un `null`.
     * Raspunsul lor spune cate pachete ai, nu cand le-ai luat; iar sloturile se consuma singure, pe
     * masura ce cronul publica anunturi. Orice verdict construit pe numarul asta ar fi ghicit. Omul
     * are in schimb ce-i trebuie ca sa hotarasca: soldul si pachetele, in panou.
     */
    return {
      stare: "inca-nu-stim",
      mesaj: "Pachetele nu se pot lega de o cumpărare anume prin API. Uită-te la pachetele și soldul din panou; dacă pachetul e acolo, plata a intrat.",
    };
  }

  const advertId = Number(bucati[3]);
  const cod = bucati[4];
  if (!Number.isFinite(advertId) || !cod) {
    return { stare: "inca-nu-stim", mesaj: "Nu am putut citi ce anume s-a cumpărat." };
  }

  /*
   * ⚠ CONTEXTUL SE IA CU `loadOlxContext`, nu cu `withToken`. Al doilea incepe cu `guard()`, adica
   * o sesiune de OM — si atunci pasul din cron n-ar lamuri niciodata nimic, tacut.
   */
  const rCtx = await loadOlxContext(admin, businessId);
  if (rCtx.stare !== "gata") {
    return { stare: "inca-nu-stim", mesaj: "Conexiunea OLX nu e disponibilă acum. Încearcă din nou peste câteva minute." };
  }

  const stim = citesteLista<OlxPaidFeature>(await getAdvertPaidFeatures(rCtx.ctx.token, advertId));
  if (!stim.stiu) {
    return { stare: "inca-nu-stim", mesaj: `Nu am putut întreba OLX acum (${stim.motiv}). Încearcă din nou peste câteva minute.` };
  }

  if (!promovareaEActiva(stim.date, cod)) {
    /*
     * ⚠ AICI NU SE DEBLOCHEAZA NIMIC. „Nu se vede" poate insemna si ca ei inca n-au asezat-o, si ca
     * s-a cumparat una scurta care intre timp a expirat. Amandoua ar fi trimis omul sa plateasca a
     * doua oara. Iesirea e a lui, cu butonul de renuntare, unde scrie ce isi asuma.
     */
    return {
      stare: "inca-nu-stim",
      mesaj: "La OLX nu se vede promovarea. Verifică în contul tău de pe olx.ro: dacă nici acolo nu e, deblochează cumpărarea de mai jos.",
    };
  }

  /*
   * ⚠ SI DOVADA POZITIVA POATE FI A ALTCUIVA. Daca omul a mai incercat o data si a doua incercare a
   * reusit, promovarea pe care o vedem acum e a EI. Inchisa pe randul vechi, registrul ar spune ca
   * au intrat amandoua cand a intrat una — sau ar binecuvanta tacut o plata dubla.
   *
   * Deci: cand mai exista un rand deschis pentru acelasi anunt si acelasi cod, nu se inchide
   * niciunul automat. Un singur martor nu poate fi revendicat de doua randuri.
   */
  /*
   * ⚠ SE CAUTA PE TINTA, NU CU `LIKE` PESTE CHEIE (03.09.2026).
   *
   * Tiparul era `plata:olx:promovare:123:top_ad:%` — iar in `LIKE`, `_` e JOCHER de un caracter.
   * Deci `top_ad` prindea si `top-ad`, si `topXad`. Gresala e prudenta (prinde prea mult, nu prea
   * putin), deci n-ar fi platit singura de doua ori — dar ar fi numarat drept „mai multe cumparari
   * deschise" o plata care se putea dovedi, ar fi lasat-o `necunoscut`, si l-ar fi impins pe om
   * catre singurul buton ramas: cel de deblocare, adica exact cel care duce la a doua plata.
   *
   * `tinta_idempotenta` e chiar coloana facuta pentru asta: potrivire exacta, acelasi cantar dupa
   * care baza refuza a doua rezervare, si o citire pozitionala a cheii mai putin.
   */
  const tinta = (data as { tinta_idempotenta?: string | null }).tinta_idempotenta;
  const { data: frati, error: eFrati } = tinta
    ? await admin
        .from("operatii_externe").select("id")
        .eq("business_id", businessId).eq("furnizor", "olx").eq("fel", "plata")
        .in("stare", ["in_curs", "necunoscut"])
        .eq("tinta_idempotenta", tinta)
    /* ⚠ Randurile de dinainte de incuietoarea semantica n-au tinta. Acolo nu se poate deosebi, deci
       nu se inchide nimic automat: un singur martor n-are voie sa fie revendicat de doua randuri. */
    : { data: null as { id: string }[] | null, error: null };
  if (!tinta) {
    return {
      stare: "inca-nu-stim",
      mesaj: "Promovarea se vede la OLX, dar cumpărarea asta e dinainte de blocarea pe țintă și nu pot spune sigur că e a ei. Verifică soldul pe olx.ro.",
    };
  }
  if (eFrati) return { error: "Nu am putut verifica dacă mai sunt cumpărări deschise pe același anunț." };
  if ((frati ?? []).length > 1) {
    return {
      stare: "inca-nu-stim",
      mesaj: "Promovarea se vede la OLX, dar sunt mai multe cumpărări deschise pentru același anunț și nu pot spune care dintre ele a intrat. Verifică soldul pe olx.ro.",
    };
  }

  const { data: rez, error: eIncheiere } = await admin.rpc("incheie_operatie_externa", {
    p_id: operatieId, p_business_id: businessId, p_stare: "reusit", p_eroare: null,
  });
  const r = rez as { gasit?: boolean; deja?: boolean; stare?: string } | null;
  /*
   * ⚠ SE CITESTE RASPUNSUL RPC-ULUI, NU DOAR `error`. `incheie_operatie_externa` nu se plange pe un
   * rand deja asezat: intoarce `{ gasit: true, deja: true }` fara eroare. Citit doar pe `error`,
   * codul spunea „Plata a intrat, operatia e inchisa" pe un rand pe care nu scrisese nimic — chiar
   * capcana pe care `cuRegistru` o verifica la el cu `gasit === true && deja !== true`.
   */
  if (eIncheiere || r?.gasit !== true) return { error: "Nu am putut încheia operația." };
  if (r.deja === true) {
    return { stare: "intrat", mesaj: `Operația se lămurise deja pe alt drum (${r.stare ?? "?"}). Reîncarcă pagina.` };
  }
  return { stare: "intrat", mesaj: "Plata a intrat la OLX. Operația e închisă." };
}
