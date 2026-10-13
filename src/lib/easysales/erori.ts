/**
 * Ce inseamna un raspuns easySales, intr-un singur loc.
 *
 * ═══ FORMELE ERORILOR LOR [A: exemplele colectiei] ═══
 *
 *   validare  `{message, errors: {camp: [mesaje]}}`, fara `success`        (12 exemple)
 *   business  `{success: false, message, data: null}`
 *   OAuth     `{success: false, error, error_description, hint, message}`
 *   hibrid    `{success: false, message, errors}`                          (422 la `archive/bulk`)
 *   general   `{success: false, message}`                                  (sectiunea Errors)
 *
 * Pentru 401, 403, 404, 405, 429 si 5xx colectia n-are NICIUN corp de exemplu. Deci forma se
 * citeste dupa chei, iar codul HTTP hotaraste familia.
 *
 * ═══ ⚠ MOTIVUL UNUI 403 NU ARE ALT SEMN DECAT TEXTUL ═══
 *
 * Tabelul lor generic spune la 403 „Authorization will not help and the request SHOULD NOT be
 * repeated". Aceeasi documentatie da insa 403 si cand tokenului ii lipseste un scope, si cand
 * `website_token` e invalid [A: Archive product], iar ghidul adauga „The website has been
 * deactivated" si „Invalid website token". Ordinea in care se citeste textul (planul, §4.6):
 *
 *   1. „Orders limit exceeded"  - plafonul de comenzi, al carui cod HTTP NU e documentat (poate fi
 *                                 chiar 403), de-aia se verifica INAINTEA codului;
 *   2. website dezactivat;
 *   3. website token invalid;
 *   4. scope lipsa;
 *   5. orice alt 403 - definitiv, NU „parola gresita".
 *
 * ⚠ Niciun 403 nu duce la o reemitere de token: ea ar revoca tokenul in uz, iar 403-ul are si alte
 * cauze. Clasificatorul doar NUMESTE; hotararile le iau apelantii.
 *
 * ⚠ La SCRIERE, o cadere de retea sau un timp expirat inseamna `necunoscut`, NU `esuat`: cererea
 * poate sa fi ajuns la ei. Reluarea oarba ar putea dubla o comanda.
 */

export type Verdict =
  | "reusit"
  | "trecatoare"
  | "necunoscut"
  | "neautorizat"
  | "plafon"
  | "website_dezactivat"
  | "website_token_invalid"
  | "scope_lipsa"
  | "interzis"
  | "negasit"
  | "metoda"
  | "validare"
  | "refuz"
  | "json_invalid";

export interface Clasificare {
  verdict: Verdict;
  /** Mesajul lor (sau al nostru), scurt. Fara corpuri, fara date personale. */
  mesaj: string;
  /** Erorile pe camp, aplatizate: „order.order_id: The order.order id field is required.". */
  campuri: string[];
  /** Ceva ce nu e o forma documentata (ex. 200 cu `success: false`). Se jurnalizeaza. */
  anomalie?: string;
}

const LUNGIME_MESAJ = 300;

function scurt(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > LUNGIME_MESAJ ? `${t.slice(0, LUNGIME_MESAJ - 1)}…` : t;
}

function obiect(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Erorile pe camp, din `errors`, oricum ar fi venit (obiect de liste, lista, sir). */
export function campurileErorii(corp: unknown): string[] {
  const c = obiect(corp);
  if (!c) return [];
  const e = c.errors;
  const out: string[] = [];
  if (Array.isArray(e)) {
    for (const x of e) {
      if (typeof x === "string") out.push(scurt(x));
      else if (obiect(x)) {
        const o = x as Record<string, unknown>;
        const m = typeof o.message === "string" ? o.message : JSON.stringify(o).slice(0, 120);
        const sku = typeof o.sku === "string" ? `${o.sku}: ` : "";
        out.push(scurt(`${sku}${m}`));
      }
    }
    return out.slice(0, 20);
  }
  const eo = obiect(e);
  if (eo) {
    for (const [camp, v] of Object.entries(eo)) {
      const lista = Array.isArray(v) ? v : [v];
      for (const m of lista) if (typeof m === "string") out.push(scurt(`${camp}: ${m}`));
    }
  }
  return out.slice(0, 20);
}

/** Textul principal al unui corp de eroare: `message`, apoi descrierea OAuth, apoi codul ei. */
export function mesajulLor(corp: unknown): string {
  const c = obiect(corp);
  if (!c) return typeof corp === "string" ? scurt(corp) : "";
  for (const k of ["message", "error_description", "error", "hint"]) {
    const v = c[k];
    if (typeof v === "string" && v.trim()) return scurt(v);
  }
  return "";
}

/** Tot textul in care pot sta motivele unui refuz, ca sa se caute in el. */
function textulDeCautat(corp: unknown, mesaj: string, campuri: string[]): string {
  const c = obiect(corp);
  const extra = c ? ["hint", "error", "error_description"].map((k) => (typeof c[k] === "string" ? c[k] : "")).join(" ") : "";
  return `${mesaj} ${extra} ${campuri.join(" ")}`.toLowerCase();
}

const RE_PLAFON = /orders?\s+limit\s+exceeded/;
const RE_DEZACTIVAT = /website\s+has\s+been\s+deactivated/;
const RE_WEBSITE_TOKEN = /invalid\s+website\s+token/;
/* Laravel Passport, la un scope lipsa: „Invalid scope(s) provided." Textul exact se strange in E0
   (M-AUTH-4); pana atunci, orice 403 care pomeneste un scope. */
const RE_SCOPE = /\bscopes?\b/;
const RE_JSON_INVALID = /invalid\s+json/;

/**
 * Verdictul unui raspuns primit. Pura: nu atinge reteaua, baza sau ceasul.
 *
 * @param scriere cererea schimba ceva la ei? (Conteaza numai la caderi fara raspuns.)
 */
export function clasificaRaspuns(p: { status: number; corp: unknown }): Clasificare {
  const campuri = campurileErorii(p.corp);
  const mesaj = mesajulLor(p.corp);
  const text = textulDeCautat(p.corp, mesaj, campuri);
  const cu = (verdict: Verdict, anomalie?: string): Clasificare =>
    ({ verdict, mesaj, campuri, ...(anomalie ? { anomalie } : {}) });

  /* ⚠ INAINTEA codului: plafonul poate veni pe orice cod (IPOTEZA, M-COM-6). */
  if (p.status >= 400 && RE_PLAFON.test(text)) return cu("plafon");

  if (p.status >= 200 && p.status < 300) {
    const c = obiect(p.corp);
    if (c && c.success === false) {
      /* Documentatia pune `success: false` numai pe 400 si 422. Un 200 asa e o plasa a noastra. */
      if (RE_PLAFON.test(text)) return cu("plafon", "200 cu success:false");
      return cu("refuz", "200 cu success:false");
    }
    return cu("reusit");
  }

  if (p.status === 401) return cu("neautorizat");

  if (p.status === 403) {
    if (RE_DEZACTIVAT.test(text)) return cu("website_dezactivat");
    if (RE_WEBSITE_TOKEN.test(text)) return cu("website_token_invalid");
    if (RE_SCOPE.test(text)) return cu("scope_lipsa");
    return cu("interzis");
  }

  if (p.status === 404) return cu("negasit");
  if (p.status === 405) return cu("metoda");
  if (p.status === 429) return cu("trecatoare");
  if (p.status >= 500) return cu("trecatoare");

  if (p.status === 422) return cu(campuri.length > 0 ? "validare" : "refuz");
  if (p.status === 400 && RE_JSON_INVALID.test(text)) return cu("json_invalid");
  return cu("refuz");
}

/**
 * O cerere care n-a primit niciun raspuns: retea, DNS, timp expirat.
 *
 * ⚠ La citire e trecatoare. La SCRIERE e `necunoscut`: comanda poate sa fi intrat la ei, iar o
 * reluare oarba ar dubla-o. Cine scrie trebuie sa recupereze (planul, §5.1.5).
 */
export function clasificaCaderea(scriere: boolean, eroare: unknown): Clasificare {
  const nume = eroare instanceof Error ? eroare.name : "";
  const expirat = nume === "TimeoutError" || nume === "AbortError";
  const mesaj = expirat ? "easySales nu a răspuns la timp." : "Nu am putut ajunge la easySales.";
  return { verdict: scriere ? "necunoscut" : "trecatoare", mesaj, campuri: [] };
}

/** Verdictele care nu ard nicio incercare: se reiau fara sa se numere. */
export function eTrecatoare(v: Verdict): boolean {
  return v === "trecatoare";
}

/** Verdictele care tin de token sau de conexiune, nu de elementul trimis. */
export function tineDeConexiune(v: Verdict): boolean {
  return v === "neautorizat" || v === "website_dezactivat" || v === "website_token_invalid" || v === "scope_lipsa";
}

/** Defecte ale noastre: cer alarma, nu o reincercare. */
export function eDefectulNostru(v: Verdict): boolean {
  return v === "metoda" || v === "json_invalid";
}

/** Textul pentru comerciant, in romana, fara sa ghiceasca ce nu stim. */
export function mesajPentruOm(c: Clasificare): string {
  switch (c.verdict) {
    case "reusit": return "Gata.";
    case "trecatoare": return "easySales nu a putut răspunde acum. Reîncercăm automat.";
    case "necunoscut": return "Nu știm încă dacă cererea a ajuns la easySales. Verificăm înainte de orice reluare.";
    case "neautorizat": return "easySales a refuzat autentificarea Edinio. Verificăm tokenul și, dacă e nevoie, îți cerem să reconectezi.";
    case "plafon": return "easySales a refuzat comanda: plafonul lunar de comenzi al abonamentului tău easySales este atins.";
    case "website_dezactivat": return "Website-ul Edinio din easySales este dezactivat. Pornește-l din easySales, la Integrări, Magazine.";
    case "website_token_invalid": return "Tokenul website-ului nu mai este valabil (a fost reîmprospătat sau website-ul a fost șters). Copiază tokenul nou din easySales și lipește-l în Edinio.";
    case "scope_lipsa": return "Accesul dat de easySales nu acoperă această operație.";
    case "interzis": return c.mesaj ? `easySales a refuzat cererea: ${c.mesaj}` : "easySales a refuzat cererea.";
    case "negasit": return "easySales nu găsește înregistrarea cerută.";
    case "metoda": return "Cererea Edinio către easySales a fost greșită. Am fost anunțați și reparăm.";
    case "json_invalid": return "Cererea Edinio către easySales a fost greșită. Am fost anunțați și reparăm.";
    case "validare": return c.campuri.length
      ? `easySales a refuzat datele: ${c.campuri.slice(0, 3).join("; ")}`
      : (c.mesaj ? `easySales a refuzat datele: ${c.mesaj}` : "easySales a refuzat datele.");
    case "refuz": return c.mesaj ? `easySales a refuzat cererea: ${c.mesaj}` : "easySales a refuzat cererea.";
  }
}
