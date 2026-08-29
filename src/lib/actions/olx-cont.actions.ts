"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMerchantToken } from "@/lib/olx/oauth";
import { addAdvertLogo, addBusinessLogo, addBusinessBanner, deleteAdvertLogo,
  deleteBusinessBanner, deleteBusinessLogo, getAdvertLogos, getAdvertPaidFeatures, getBilling,
  getBusinessBanners, getBusinessLogos, getBusinessProfile, isOlxError, updateBusinessProfile,
} from "@/lib/olx/client";
import type { OlxBillingEntry, OlxBusinessProfile, OlxConfig, OlxImagineCont, OlxPaidFeature } from "@/lib/olx/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const FEATURE_PATH = "/dashboard/features/olx";

/*
 * Aceleasi trei ajutoare ca in `olx.actions.ts`, rescrise aici fiindca acolo sunt private si un
 * fisier `"use server"` n-are voie sa exporte decat functii asincrone — deci nu pot fi imprumutate.
 * Daca se schimba tiparul acolo, se schimba si aici.
 */

/**
 * ⚠ PROPRIETATEA SE DOVEDESTE INAINTE DE SERVICE ROLE. Citirile de mai jos ocolesc RLS, deci
 * singura oprire dintre un `businessId` strain si configul altcuiva e verificarea asta.
 */
async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  /*
   * ⚠ SE CITESTE SI `error`, nu doar `data` (02.09.2026). `supabase-js` nu arunca: o citire cazuta
   * intoarce `data: null`, adica exact ce intoarce si „magazinul nu e al tau". Confundate, o pana
   * de baza ii spunea comerciantului ca magazinul lui nu exista.
   *
   * ⚠ Si `maybeSingle`, nu `single`: `single` transforma „zero randuri" in EROARE, deci pana si
   * varianta corecta de mai sus ar fi raportat o pana acolo unde raspunsul e legitim.
   */
  const { data, error } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou peste câteva momente." };
  if (!data) return { error: "Magazin negăsit" };
  return { supabase, userId: user.id };
}

/**
 * ⚠ O CITIRE CAZUTA NU ARE VOIE SA ARATE CA O CONFIGURARE GOALA. Un `{}` inchipuit ar spune aici
 * „contul nu e de firma" si „nu e conectat" — adica ecranul ar ascunde profilul unei firme
 * conectate, si nimeni n-ar afla de ce. `maybeSingle`, fiindca un magazin fara rand e legitim.
 */
async function loadConfig(businessId: string): Promise<OlxConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("olx_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return ((data?.olx_config as OlxConfig) ?? {}) || {};
}

/**
 * ⚠ ARUNCAREA CERE UN LOC DE CADERE (02.09.2026)
 *
 * `loadConfig` arunca dinadins cand baza nu raspunde, ca o configurare necitita sa nu se poata
 * confunda cu una goala. Dar nimeni nu prindea aruncarea aici: ea urca prin actiunea de server si
 * ajungea in ecran ca eroare nedigerata, fara niciun cuvant despre ce s-a intamplat.
 */
async function withToken<T>(businessId: string, fn: (token: string, config: OlxConfig) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  let config: OlxConfig;
  try {
    config = await loadConfig(businessId);
  } catch {
    return { error: "Nu am putut citi setările OLX. Încearcă din nou peste câteva momente." };
  }
  if (!config.connected || !config.refresh_token) return { error: "Conectează mai întâi contul OLX." };
  const tok = await ensureMerchantToken(admin, businessId, config);
  if ("error" in tok) return { error: tok.error };
  return fn(tok.token, tok.config);
}

/* ── Citiri aparate din raspunsurile lor ──────────────────────────────────────────
 *
 * ⚠ FORMELE DE MAI JOS NU SUNT GARANTATE. Aceleasi rute intorc `amount` cand numar, cand obiect,
 * si sar campuri pe conturi care nu le au. Tipurile din `types.ts` sunt ce am vazut, nu un
 * contract; de aceea totul trece prin cititoarele astea, care primesc `unknown`.
 *
 * ⚠ CE LIPSESTE RAMANE LIPSA. Un zero pus in locul unei sume necitite e o AFIRMATIE — „operatia
 * asta n-a costat nimic" — si comerciantul isi face socoteala pe ea.
 */

function textSauNimic(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function numarSauNimic(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  /* Sirul apare la ei pe sumele cu zecimale („12.50"). `Number("")` da 0, de-aia se cere si textul. */
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Suma unei linii de facturare, in cele doua forme in care am vazut-o. */
function citesteSuma(brut: unknown): { valoare: number | null; moneda: string | null } {
  const direct = numarSauNimic(brut);
  if (direct !== null) return { valoare: direct, moneda: null };
  if (typeof brut === "object" && brut !== null) {
    const o = brut as { value?: unknown; amount?: unknown; currency?: unknown };
    /* `value` e ce am vazut; `amount` e forma pe care o folosesc in alta parte pe aceeasi ruta. */
    return {
      valoare: numarSauNimic(o.value) ?? numarSauNimic(o.amount),
      moneda: textSauNimic(o.currency),
    };
  }
  return { valoare: null, moneda: null };
}

/** O data ISO de la ei, pastrata ca text doar daca chiar se poate citi ca data. */
function dataSauNimic(v: unknown): string | null {
  const t = textSauNimic(v);
  if (t === null) return null;
  return Number.isNaN(Date.parse(t)) ? null : t;
}

// ── Profil de firma ───────────────────────────────────────────────────────────────
/** Ce arata si ce trimite ecranul. Logo si banner sunt numai de vazut: incarcarea lor nu trece prin API. */
export interface OlxProfilFirma {
  nume: string | null;
  descriere: string | null;
  website: string | null;
  telefon: string | null;
  telefonAlDoilea: string | null;
  strada: string | null;
  numar: string | null;
  codPostal: string | null;
  oras: string | null;
  subdomeniu: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
}

export interface OlxProfilFirmaRezultat {
  /** `false` inseamna „contul nu e de firma", nu „n-am putut citi". Ecranul nu arata nimic atunci. */
  esteFirma: boolean;
  profil: OlxProfilFirma | null;
}

function citesteProfil(d: OlxBusinessProfile): OlxProfilFirma {
  const media = (v: unknown): string | null => {
    /* Am vazut si `{ url }`, si sirul gol pe conturile fara logo. Amandoua se citesc ca lipsa. */
    if (typeof v === "string") return textSauNimic(v);
    if (typeof v === "object" && v !== null) return textSauNimic((v as { url?: unknown }).url);
    return null;
  };
  return {
    nume: textSauNimic(d.name),
    descriere: textSauNimic(d.description),
    /*
     * ⚠ SCHEMA E A LOR (01.09.2026). Era `website`, `phone`, `address: string` — nume firesti si
     * niciunul al lor. Ei cer `website_url`, `phones: string[]` si o adresa DESFACUTA. Citita
     * gresit, formularul aparea gol pe un profil care CHIAR avea datele completate.
     */
    website: textSauNimic(d.website_url),
    telefon: textSauNimic(Array.isArray(d.phones) ? d.phones[0] : undefined),
    telefonAlDoilea: textSauNimic(Array.isArray(d.phones) ? d.phones[1] : undefined),
    strada: textSauNimic(d.address?.street),
    numar: textSauNimic(d.address?.number),
    codPostal: textSauNimic(d.address?.postcode),
    oras: textSauNimic(d.address?.city),
    subdomeniu: textSauNimic(d.subdomain),
    logoUrl: media(d.logo),
    bannerUrl: media(d.banner),
  };
}

export async function getOlxProfilFirma(businessId: string): Promise<OlxProfilFirmaRezultat | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  let config: OlxConfig;
  try {
    config = await loadConfig(businessId);
  } catch {
    return { error: "Nu am putut citi configurarea OLX." };
  }
  /*
   * ⚠ SE VERIFICA INAINTE DE CERERE. Pe un cont particular ruta lor raspunde `403`, iar eroarea
   * aia ar aparea in ecran ca o defectiune — cand de fapt totul e in regula, doar ca profilul de
   * firma nu exista pentru contul asta.
   */
  if (config.advertiser_type !== "business") return { esteFirma: false, profil: null };

  /*
   * ⚠ RASPUNSUL LOR SE CITESTE INAUNTRUL LUI `withToken`. Afara, `"error" in res` prinde si
   * caderea de sesiune, si eroarea venita de la OLX, cu acelasi ram — deci orice ramura scrisa
   * dupa ea (mesaj lamurit, `404` inteles ca gol) e cod mort care nu se executa niciodata.
   */
  const res = await withToken(businessId, async (token): Promise<{ profil: OlxProfilFirma } | { error: string }> => {
    const r = await getBusinessProfile(token);
    if (isOlxError(r)) return { error: `Nu am putut citi profilul de firmă de la OLX: ${r.error}` };
    /* Raspuns fara corp: profilul exista, dar e gol. Formularul se arata, doar ca necompletat. */
    return { profil: citesteProfil(r.data ?? {}) };
  });
  if ("error" in res) return res;
  return { esteFirma: true, profil: res.profil };
}

export interface OlxProfilFirmaInput {
  nume?: string;
  descriere?: string;
  website?: string;
  telefon?: string;
  telefonAlDoilea?: string;
  strada?: string;
  numar?: string;
  codPostal?: string;
  oras?: string;
  subdomeniu?: string;
}

export async function salveazaOlxProfilFirma(
  businessId: string, input: OlxProfilFirmaInput,
): Promise<{ success: true; profil: OlxProfilFirma } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  let config: OlxConfig;
  try {
    config = await loadConfig(businessId);
  } catch {
    return { error: "Nu am putut citi configurarea OLX." };
  }
  /*
   * ⚠ SI LA SCRIERE, NU DOAR LA CITIRE. Actiunea de server e o adresa: cine n-o cheama din ecran
   * n-a trecut prin nicio ascundere de formular.
   */
  if (config.advertiser_type !== "business") {
    return { error: "Contul OLX nu este de firmă. Schimbă tipul contului în setările OLX de mai sus." };
  }

  /*
   * ⚠ PETIC, NU PROFIL INTREG. Cheia lipsa dintr-un `PUT` nu se atinge la ei; una trimisa goala
   * STERGE. Ce n-a atins omul in formular nici nu pleaca — altfel o descriere pe care ecranul
   * n-a apucat s-o incarce ar sterge descrierea adevarata a firmei.
   */
  /*
   * ⚠ SE CITESTE PROFILUL DE ACUM, si nu din comoditate. Telefoanele si adresa sunt o LISTA si un
   * OBIECT la ei: trimise pe jumatate, jumatatea lipsa se sterge. Deci ce n-a atins omul se ia de
   * la ei, nu se lasa gol.
   *
   * ⚠ O citire picata opreste salvarea. Mai bine ii spunem sa reincerce decat sa-i stergem al
   * doilea telefon fiindca n-am putut afla care era.
   */
  let profilCitit: OlxProfilFirma | null = null;
  if (input.telefon !== undefined || input.telefonAlDoilea !== undefined
      || input.strada !== undefined || input.numar !== undefined
      || input.codPostal !== undefined || input.oras !== undefined) {
    const acum = await withToken(businessId, async (token): Promise<{ profil: OlxProfilFirma } | { error: string }> => {
      const r = await getBusinessProfile(token);
      if (isOlxError(r)) return { error: r.error };
      return { profil: citesteProfil(r.data ?? {}) };
    });
    if ("error" in acum) {
      return { error: "Nu am putut citi profilul de la OLX ca să nu ștergem ce nu ai atins. Încearcă din nou." };
    }
    profilCitit = acum.profil;
  }

  const corp: Partial<OlxBusinessProfile> = {};
  if (input.nume !== undefined) corp.name = input.nume.trim();
  if (input.descriere !== undefined) corp.description = input.descriere.trim();
  if (input.website !== undefined) corp.website_url = input.website.trim();
  /*
   * ⚠ TELEFOANELE SUNT O LISTA la ei, si o lista se trimite INTREAGA: trimisa cu unul singur, l-ar
   * sterge pe al doilea. De-aia se trimite doar cand omul a atins vreunul dintre ele, si atunci se
   * compune din amandoua — cel neatins luat din profilul citit.
   */
  if (input.telefon !== undefined || input.telefonAlDoilea !== undefined) {
    const unu = (input.telefon ?? profilCitit?.telefon ?? "").trim();
    const doi = (input.telefonAlDoilea ?? profilCitit?.telefonAlDoilea ?? "").trim();
    corp.phones = [unu, doi].filter(Boolean);
  }
  /* ⚠ Adresa la fel: e un obiect, si cheia lipsa dintr-un obiect trimis inseamna „sterge". */
  if (input.strada !== undefined || input.numar !== undefined
      || input.codPostal !== undefined || input.oras !== undefined) {
    corp.address = {
      street: (input.strada ?? profilCitit?.strada ?? "").trim() || undefined,
      number: (input.numar ?? profilCitit?.numar ?? "").trim() || undefined,
      postcode: (input.codPostal ?? profilCitit?.codPostal ?? "").trim() || undefined,
      city: (input.oras ?? profilCitit?.oras ?? "").trim() || undefined,
    };
  }
  if (input.subdomeniu !== undefined) corp.subdomain = input.subdomeniu.trim();
  if (Object.keys(corp).length === 0) return { error: "Nu ai modificat nimic." };

  const res = await withToken(businessId, async (token): Promise<{ profil: OlxProfilFirma } | { error: string }> => {
    const r = await updateBusinessProfile(token, corp);
    if (isOlxError(r)) {
      /* Validarile lor spun exact ce camp le-a displacut (subdomeniu deja luat, telefon nevalid). */
      const detalii = r.validation?.map((v) => v.detail ?? v.title).filter(Boolean).join(" ");
      return { error: detalii ? `${r.error} ${detalii}` : r.error };
    }
    /*
     * ⚠ Se intoarce ce a RAMAS la ei, nu ce a trimis omul. Ei normalizeaza subdomeniul si taie
     * descrierea; ecranul care si-ar pastra propriile valori ar arata altceva decat e salvat.
     */
    return { profil: citesteProfil(r.data ?? {}) };
  });
  if ("error" in res) return res;
  revalidatePath(FEATURE_PATH);
  return { success: true, profil: res.profil };
}

// ── Istoric de facturare ──────────────────────────────────────────────────────────
export interface OlxLinieFacturare {
  /** Cheie de randare. Al lor cand exista, altfel pozitia — ei sar `id` pe unele linii. */
  cheie: string;
  data: string | null;
  descriere: string | null;
  tip: string | null;
  /** `null` inseamna „n-am putut citi suma", nu „zero". Ecranul o arata ca lipsa. */
  suma: number | null;
  moneda: string | null;
}

/** Ultimele intrari din istoricul de facturare al contului OLX. */
export async function getOlxFacturare(
  businessId: string, limit = 30,
): Promise<{ linii: OlxLinieFacturare[] } | { error: string }> {
  /* ⚠ Marginit: e o lista de citit langa sold, nu un export contabil. */
  const cate = Math.min(Math.max(Math.trunc(limit) || 30, 1), 100);
  const res = await withToken(businessId, async (token): Promise<{ brute: OlxBillingEntry[] } | { error: string }> => {
    /* ⚠ `page`, si ea incepe de la UNU. `offset` nu e un parametru al lor aici. */
    const r = await getBilling(token, { page: 1, limit: cate });
    if (isOlxError(r)) return { error: `Nu am putut citi facturarea de la OLX: ${r.error}` };
    /* Conturile fara nicio miscare intorc corp gol, nu lista goala. */
    const brute: OlxBillingEntry[] = Array.isArray(r.data) ? r.data : [];
    return { brute };
  });
  if ("error" in res) return res;

  return {
    linii: res.brute.map((e, i) => {
      /*
       * ⚠ NUMELE SUNT ALE LOR (01.09.2026). Cautam `created_at`, `description`, `amount`, `type` —
       * nume firesti, si niciunul al lor. Exemplul lor are `id`, `name`, `date`, `price`,
       * `advert_id`. Citita gresit, tabela s-ar fi umplut cu „necunoscut" pe randuri care CHIAR
       * aveau date — si nimeni n-ar fi banuit ca de vina e citirea, nu contul.
       *
       * ⚠ Formele vechi raman citite ca a doua incercare: daca ei le si trimit, nu stricam nimic.
       */
      const suma = typeof e.price === "number" ? { valoare: e.price, moneda: null } : citesteSuma(e.amount);
      return {
        cheie: e.id != null ? String(e.id) : `linie-${i}`,
        data: dataSauNimic(e.date ?? e.created_at),
        descriere: textSauNimic(e.name ?? e.description),
        tip: e.advert_id != null ? `Anunț ${e.advert_id}` : null,
        suma: suma.valoare,
        moneda: suma.moneda,
      };
    }),
  };
}

// ── Promovarile active ale unui anunt ─────────────────────────────────────────────
export interface OlxPromovareActiva {
  cod: string;
  nume: string | null;
  /** Pana cand tine. `null` cand ei n-au spus — se arata asa, nu se inventeaza o zi. */
  validPanaLa: string | null;
  /** `valid_to` deja trecut: promovarea a fost, dar nu mai e. Se poate cumpara din nou. */
  expirata: boolean;
}

/**
 * Ce promovari are DEJA anuntul asta.
 *
 * ⚠ ROSTUL E SA NU CUMPERE A DOUA OARA CE ARE. Ecranul de promovare ofera aceleasi coduri
 * indiferent ce e activ pe anunt, iar OLX nu refuza o promovare dublata: o ia, o plateste si o
 * pune peste cea in curs. Lista asta, langa butonul de cumparare, e singurul loc unde omul poate
 * vedea inainte de plata ca „Evidentiaza" e activa inca patru zile.
 *
 * ⚠ LIPSA UNEI DATE NU SE CITESTE CA „EXPIRATA". `valid_to` nu vine pe toate intrarile; taiate
 * dupa el, ar fi cazut din lista tocmai promovarile despre care stim cel mai putin — si exact
 * alea s-ar fi cumparat a doua oara. Se marcheaza `expirata` NUMAI cand ei au dat o data si ea a
 * si trecut; restul pleaca spre ecran ca active, cu termenul spus sau cu „nu se stie".
 */
export async function getOlxPromovariAnunt(
  businessId: string, advertId: number,
): Promise<{ promovari: OlxPromovareActiva[] } | { error: string }> {
  if (!Number.isFinite(advertId) || advertId <= 0) return { error: "Anunț nevalid." };
  const res = await withToken(businessId, async (token): Promise<{ brute: OlxPaidFeature[] } | { error: string }> => {
    const r = await getAdvertPaidFeatures(token, advertId);
    /* Un anunt fara nicio promovare raspunde `404` la ei — asta e „nimic activ", nu o defectiune. */
    if (isOlxError(r)) {
      if (r.status === 404) return { brute: [] };
      return { error: `Nu am putut citi promovările anunțului: ${r.error}` };
    }
    return { brute: Array.isArray(r.data) ? r.data : [] };
  });
  if ("error" in res) return res;

  const acum = Date.now();
  return {
    promovari: res.brute
      .map((f) => {
        const cod = textSauNimic(f.code);
        if (cod === null) return null;
        const validPanaLa = dataSauNimic(f.valid_to);
        return {
          cod,
          nume: textSauNimic(f.name) ?? textSauNimic(f.type),
          validPanaLa,
          expirata: validPanaLa !== null && Date.parse(validPanaLa) <= acum,
        };
      })
      .filter((p): p is OlxPromovareActiva => p !== null),
  };
}

/* ── Logo si banner ──────────────────────────────────────────────────────── */

/**
 * Pune un logo sau un banner pe contul de firma.
 *
 * ═══ COMENTARIUL NOSTRU SPUNEA CA NU SE POATE (01.09.2026) ═══
 *
 * Ecranul ii spunea comerciantului „logo-ul si bannerul se schimba din contul tau de pe olx.ro" —
 * o afirmatie despre API-ul LOR, scrisa de noi, si falsa. Rutele exista de mult.
 *
 * ⚠ E cel mai insidios fel de neadevar din depozitul asta: nu se strica nimic, nimeni nu vede o
 * eroare, iar cine citeste mai tarziu il ia drept fapt si nici nu mai verifica. Aceeasi lectie ca
 * la „precautia noastra nu e regula lor".
 *
 * ⚠ SE TRIMITE O ADRESA, nu un fisier: OLX aduce imaginea de la noi. Deci trebuie sa fie o adresa
 * publica — cele din biblioteca de media a magazinului sunt.
 */
export async function puneOlxLogoFirma(
  businessId: string, url: string,
): Promise<{ success: true } | { error: string }> {
  return puneImagineCont(businessId, url, "logo");
}

export async function puneOlxBannerFirma(
  businessId: string, url: string,
): Promise<{ success: true } | { error: string }> {
  return puneImagineCont(businessId, url, "banner");
}

async function puneImagineCont(
  businessId: string, url: string, fel: "logo" | "banner",
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  /* ⚠ Numai adrese publice `https`: OLX vine sa ia imaginea, deci una locala n-ar avea de unde. */
  if (!ADRESA_PUBLICA.test(url)) {
    return { error: "Adresa imaginii trebuie să fie publică și să înceapă cu https." };
  }
  const cont = await tipDeCont(businessId);
  if ("error" in cont) return cont;
  if (!cont.firma) return { error: "Contul OLX nu este de firmă." };
  const res = await withToken(businessId, async (token): Promise<{ ok: true } | { error: string }> => {
    const r = fel === "logo" ? await addBusinessLogo(token, url) : await addBusinessBanner(token, url);
    if (isOlxError(r)) return { error: r.error };
    return { ok: true };
  });
  if ("error" in res) return { error: res.error };
  revalidatePath("/dashboard/features/olx");
  return { success: true };
}

/**
 * ⚠ OLX NU PRIMESTE FISIERUL, VINE SI-L IA. Deci orice imagine trimisa spre ei — logo de firma,
 * banner, logo de anunt — trebuie sa stea la o adresa publica. Una din biblioteca magazinului e;
 * una de pe calculatorul comerciantului, nu.
 */
const ADRESA_PUBLICA = /^https:\/\//i;

/**
 * E cont de firma? Cu locul de cadere pentru aruncarea lui `loadConfig`.
 *
 * ⚠ `loadConfig` arunca dinadins cand baza nu raspunde, ca o configurare necitita sa nu se poata
 * confunda cu una goala. Chemat direct dintr-o actiune, aruncarea urca in ecran ca eroare
 * nedigerata; asa a stat pana acum in `puneImagineCont`.
 */
async function tipDeCont(businessId: string): Promise<{ firma: boolean } | { error: string }> {
  try {
    const config = await loadConfig(businessId);
    return { firma: config.advertiser_type === "business" };
  } catch {
    return { error: "Nu am putut citi setările OLX. Încearcă din nou peste câteva momente." };
  }
}

/* ── Ce logo si ce banner sunt ACUM pe cont ───────────────────────────────── */

/**
 * ═══ SE PUTEA PUNE, DAR NU SE PUTEA VEDEA (02.09.2026) ═══
 *
 * Runda trecuta s-a reparat comentariul care spunea ca logo-ul nu se poate schimba prin API si s-a
 * legat butonul de „pune". Dar a ramas un ecran din care se poate ADAUGA la nesfarsit si din care
 * nu se vede nimic: nici cate sunt, nici care e cel viu, nici cum se scoate unul.
 *
 * ⚠ Un „pune" fara „vezi" si „scoate" nu e o functie intreaga, e o supapa intr-un singur sens. Al
 * doilea logo pus peste primul e o intrebare careia ecranul nu-i raspundea: care se vede la ei?
 */
export interface OlxImaginiCont {
  logos: OlxImagineCont[];
  banners: OlxImagineCont[];
}

export async function getOlxImaginiFirma(
  businessId: string,
): Promise<OlxImaginiCont | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const cont = await tipDeCont(businessId);
  if ("error" in cont) return cont;
  if (!cont.firma) return { logos: [], banners: [] };
  return withTokenSauEroare<OlxImaginiCont>(businessId, async (token) => {
    const [l, b] = await Promise.all([getBusinessLogos(token), getBusinessBanners(token)]);
    /*
     * ⚠ O CITIRE PICATA NU E O LISTA GOALA. Aratata ca goala, ecranul ar spune „n-ai niciun logo"
     * unui cont care are unul, iar omul ar pune al doilea peste primul.
     */
    if (isOlxError(l)) return { error: l.error };
    if (isOlxError(b)) return { error: b.error };
    return {
      logos: Array.isArray(l.data) ? l.data : [],
      banners: Array.isArray(b.data) ? b.data : [],
    };
  });
}

export async function stergeOlxImagineFirma(
  businessId: string, fel: "logo" | "banner", imagineId: number,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const r = await withTokenSauEroare<{ ok: true }>(businessId, async (token) => {
    const res = fel === "logo"
      ? await deleteBusinessLogo(token, imagineId)
      : await deleteBusinessBanner(token, imagineId);
    if (isOlxError(res)) return { error: res.error };
    return { ok: true as const };
  });
  if ("error" in r) return r;
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * Inlocuieste logo-ul sau bannerul: pune intai ce e nou, apoi scoate ce era.
 *
 * ⚠ ORDINEA E TOATA INTELEPCIUNEA AICI. Sters intai, un „pune" picat ar lasa profilul GOL — adica
 * mai rau decat inainte de apasare, si tocmai in vitrina firmei. Pus intai, cel mai rau lucru care
 * se poate intampla e ca raman doua, si se vede in lista ca mai e unul de scos.
 */
export async function inlocuiesteOlxImagineFirma(
  businessId: string, fel: "logo" | "banner", url: string, vechiId: number,
): Promise<{ success: true } | { error: string }> {
  const pus = await puneImagineCont(businessId, url, fel);
  if ("error" in pus) return pus;
  const sters = await stergeOlxImagineFirma(businessId, fel, vechiId);
  if ("error" in sters) {
    return { error: `${fel === "logo" ? "Logo-ul" : "Bannerul"} nou e pus, dar cel vechi n-a putut fi scos: ${sters.error}` };
  }
  return { success: true };
}

/* ── Logo pe un anunt anume ───────────────────────────────────────────────── */

/**
 * ⚠ RUTELE EXISTAU IN CLIENT SI NU AJUNGEAU LA NIMENI (02.09.2026). `getAdvertLogos`,
 * `addAdvertLogo` si `deleteAdvertLogo` erau scrise, si chiar probate pe fir, dar nicio actiune de
 * server nu le chema — deci comerciantul n-avea de unde sa le atinga. Cod care exista si nu se
 * poate folosi arata, dintr-un inventar de functii, exact ca o functie livrata.
 */
export async function getOlxLogosAnunt(
  businessId: string, advertId: number,
): Promise<{ logos: OlxImagineCont[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  return withTokenSauEroare<{ logos: OlxImagineCont[] }>(businessId, async (token) => {
    const r = await getAdvertLogos(token, advertId);
    if (isOlxError(r)) return { error: r.error };
    return { logos: Array.isArray(r.data) ? r.data : [] };
  });
}

export async function puneOlxLogoAnunt(
  businessId: string, advertId: number, url: string,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!ADRESA_PUBLICA.test(url.trim())) {
    return { error: "Adresa imaginii trebuie să fie publică și să înceapă cu https." };
  }
  const r = await withTokenSauEroare<{ ok: true }>(businessId, async (token) => {
    const res = await addAdvertLogo(token, advertId, url.trim());
    if (isOlxError(res)) return { error: res.error };
    return { ok: true as const };
  });
  if ("error" in r) return r;
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function stergeOlxLogoAnunt(
  businessId: string, advertId: number, logoId: number,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const r = await withTokenSauEroare<{ ok: true }>(businessId, async (token) => {
    const res = await deleteAdvertLogo(token, advertId, logoId);
    if (isOlxError(res)) return { error: res.error };
    return { ok: true as const };
  });
  if ("error" in r) return r;
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * `withToken`, dar cu tipul turtit la „ori rodul, ori o eroare".
 *
 * ⚠ `withToken` intoarce `T | { error: string }`, iar cand `T` are el insusi o ramura cu `error`
 * cele doua nu se mai pot deosebi la citire. Se aplatizeaza o singura data, aici, ca fiecare
 * apelant sa nu repete verificarea si sa n-o uite tocmai unul.
 */
async function withTokenSauEroare<T extends object>(
  businessId: string, fn: (token: string) => Promise<T | { error: string }>,
): Promise<T | { error: string }> {
  const r = await withToken(businessId, (token) => fn(token));
  return r as T | { error: string };
}
