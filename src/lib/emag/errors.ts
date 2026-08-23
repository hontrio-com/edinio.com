/**
 * Ce inseamna un raspuns de la eMAG.
 *
 * ═══ DE CE E UN FISIER INTREG PENTRU O INTREBARE ═══
 *
 * Fiindca eMAG raspunde `HTTP 200` aproape mereu, iar adevarul e in corp, si
 * fiindca documentatia lor contine o exceptie pe care daca o citesti gresit
 * strici integrarea in doua feluri opuse:
 *
 *     „Every API request must have a response with «isError»: false. Exception:
 *      in the event of a documentation error when saving a product, the API
 *      returns «isError»: true but the new offer is still saved and processed."
 *
 * Adica `isError: true` NU inseamna „n-am facut nimic". Uneori inseamna „am
 * facut, dar am si observatii".
 *
 * ═══ CE AR IESI DIN FIECARE CITIRE GRESITA ═══
 *
 * Luat drept ESEC: oferta exista deja la ei, iar noi o retrimitem. Nu iese un
 * duplicat — `id`-ul e al nostru si retrimiterea e o actualizare — dar coada nu
 * se goleste niciodata, iar cele 3 cereri pe secunda ale magazinului se duc pe o
 * eroare care nu se repara singura.
 *
 * Luat drept REUSITA CURATA: pierdem `doc_errors`, iar comerciantul vede „trimis"
 * la nesfarsit pentru un produs pe care eMAG nu-l va publica. Exact ce s-a
 * intamplat la Trendyol cand motivul respingerii n-a fost aratat.
 *
 * De aceea exista o a treia stare, `reusit_cu_observatii`, care nu are
 * corespondent la niciun alt furnizor din Edinio.
 */

import type { EmagRaspuns } from "./types";

export type VerdictEmag =
  /** `isError: false`. S-a facut, fara observatii. */
  | "reusit"
  /**
   * HTTP 200 cu `isError: true`. eMAG A PROCESAT cererea si are observatii.
   * ⚠ NU se reincearca automat: se scriu observatiile si se arata omului.
   */
  | "reusit_cu_observatii"
  /** A inteles si a refuzat. Nu s-a intamplat nimic, reincercarea e libera. */
  | "refuz"
  /** 429, 408, 5xx, retea cazuta. ⚠ NU arde o incercare. */
  | "trecatoare"
  /** 401. Acreditarile nu mai merg; se opreste magazinul, nu elementul. */
  | "chei";

export interface Clasificare {
  verdict: VerdictEmag;
  /** Mesajele lui eMAG, normalizate la text. */
  mesaje: string[];
  /** Un singur rand, pentru `last_error` si pentru ecran. */
  mesaj: string;
}

/**
 * Mesajele, oricum ar veni.
 *
 * OpenAPI-ul lor declara `messages: string[]`, dar in practica sosesc si obiecte
 * (`{ message }`, `{ text }`, `{ field, message }`). Se normalizeaza aici, o
 * data, ca restul codului sa nu mai puna niciun `typeof`.
 */
export function mesajeEmag(corp: unknown): string[] {
  const m = (corp as EmagRaspuns | undefined)?.messages;
  if (!Array.isArray(m)) return [];
  const out: string[] = [];
  for (const x of m) {
    if (typeof x === "string") {
      if (x.trim()) out.push(x.trim());
      continue;
    }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const text = [o.message, o.text, o.error, o.description].find((v) => typeof v === "string" && v.trim());
      const camp = typeof o.field === "string" && o.field.trim() ? `${o.field}: ` : "";
      if (typeof text === "string") out.push(`${camp}${text.trim()}`);
      else out.push(JSON.stringify(x).slice(0, 300));
    }
  }
  return out;
}

/**
 * Rutele la care exceptia din documentatie se aplica.
 *
 * ⚠ Lista e INCHISA dinadins. Exceptia e scrisa numai despre salvarea unui
 * produs; luata larg, ar fi ascuns refuzuri adevarate pe comenzi si pe AWB, unde
 * un „am procesat cu observatii" inventat de noi ar fi insemnat o comanda
 * neconfirmata sau un AWB neemis, raportate drept reusite.
 */
const RUTE_CU_OBSERVATII: readonly string[] = ["/product_offer/save"] as const;

export function poarteObservatii(cale: string): boolean {
  return RUTE_CU_OBSERVATII.some((r) => cale.startsWith(r));
}

/**
 * Verdictul.
 *
 * ⚠ SE DECIDE PE CODUL HTTP SI PE FORMA CORPULUI, NICIODATA PE TEXTUL MESAJULUI.
 * Mesajele lor sunt localizate si se schimba sub noi. La Trendyol, potrivirea pe
 * text a facut ca cinci minute de 429 sa goleasca definitiv coada unui magazin.
 *
 * `cale` intra in socoteala fiindca exceptia din documentatie e scrisa despre o
 * anume ruta, nu despre API in general.
 */
export function clasificaRaspuns(status: number, corp: unknown, cale: string): Clasificare {
  const mesaje = mesajeEmag(corp);
  const unRand = mesaje.length ? mesaje.join(" · ").slice(0, 500) : "";

  /* Retea cazuta, raspuns necitibil: `status` 0 il pune clientul. */
  if (status === 0) {
    return { verdict: "trecatoare", mesaje, mesaj: unRand || "eMAG nu a răspuns." };
  }

  if (status === 401 || status === 403) {
    /*
     * ⚠ 403 intra tot aici, si nu la refuz. La eMAG, 403 inseamna de obicei ca
     * apelul a venit de la un IP nealbit sau ca utilizatorul n-are drept de API —
     * amandoua sunt probleme de CONT, nu de continutul cererii. Tratat ca refuz,
     * fiecare produs din coada ar fi ars cinci incercari degeaba.
     */
    return {
      verdict: "chei",
      mesaje,
      mesaj:
        unRand ||
        "eMAG a refuzat autentificarea. Verifică utilizatorul și parola de API, " +
          "și că adresa IP a Edinio este trecută în lista albă din contul tău eMAG.",
    };
  }

  if (status === 429) {
    return { verdict: "trecatoare", mesaje, mesaj: unRand || "Prea multe cereri către eMAG. Se reia singur." };
  }

  if (status === 408 || status >= 500) {
    return { verdict: "trecatoare", mesaje, mesaj: unRand || `eMAG a răspuns cu ${status}. Se reia singur.` };
  }

  if (status >= 400) {
    return { verdict: "refuz", mesaje, mesaj: unRand || `eMAG a refuzat cererea (${status}).` };
  }

  /* De aici in jos: HTTP 200. Adevarul e in corp. */
  const eEroare = (corp as EmagRaspuns | undefined)?.isError === true;

  if (!eEroare) {
    return { verdict: "reusit", mesaje, mesaj: unRand };
  }

  /*
   * ⚠ AICI E EXCEPTIA. HTTP 200 inseamna ca cererea a ajuns si a fost procesata.
   * Pe salvarea unui produs, documentatia spune limpede ca oferta E SALVATA chiar
   * si asa. Deci nu se reincearca: se scriu observatiile si se arata.
   *
   * Pe orice alta ruta, un `isError` la 200 e un refuz obisnuit.
   */
  if (poarteObservatii(cale)) {
    return {
      verdict: "reusit_cu_observatii",
      mesaje,
      mesaj: unRand || "eMAG a acceptat oferta, dar are observații la documentație.",
    };
  }

  return { verdict: "refuz", mesaje, mesaj: unRand || "eMAG a refuzat cererea." };
}

/**
 * Arde sau nu o incercare din coada?
 *
 * ⚠ Un verdict trecator NU arde. Altfel, o pana de cateva minute la ei goleste
 * cozile tuturor magazinelor, iar produsele raman nesincronizate fara ca nimeni
 * sa stie. E lectia scrisa in `src/lib/trendyol/sync.ts:81`.
 */
export function ardeIncercare(v: VerdictEmag): boolean {
  return v === "refuz";
}

/** Elementul a fost dus la capat si iese din coada? */
export function sAIncheiat(v: VerdictEmag): boolean {
  return v === "reusit" || v === "reusit_cu_observatii";
}

/**
 * Mesaje in romana pentru cele mai dese refuzuri.
 *
 * Se potriveste pe forme STABILE, nu pe fraze intregi, si orice nepotrivire cade
 * inapoi pe textul lor — mai bine un mesaj in engleza decat unul inventat de noi.
 */
export function mesajOmenesc(brut: string): string {
  const t = (brut || "").toLowerCase();

  if (!t) return "";

  if (t.includes("rate limit")) {
    return "Prea multe cereri către eMAG. Se reia singur peste puțin.";
  }
  if (t.includes("maximum input vars")) {
    return "Cererea către eMAG a fost prea mare. Se împarte în loturi mai mici și se reia.";
  }
  if (t.includes("vat") && (t.includes("invalid") || t.includes("not found"))) {
    return "Cota de TVA trimisă nu există în contul tău eMAG. Alege alta în setările integrării.";
  }
  if (t.includes("category") && t.includes("not allowed")) {
    return "Nu ai acces la această categorie eMAG. Cere-l din panoul eMAG sau alege altă categorie.";
  }
  if (t.includes("ean")) {
    return `eMAG are o observație la codul EAN: ${brut}`;
  }
  if (t.includes("part_number_key")) {
    return `eMAG are o observație la produsul la care încerci să atașezi oferta: ${brut}`;
  }
  if (t.includes("characteristic")) {
    return `Lipsește sau nu se potrivește o caracteristică cerută de categorie: ${brut}`;
  }
  if (t.includes("sale_price") || t.includes("min_sale_price") || t.includes("max_sale_price")) {
    return `eMAG a respins prețul: ${brut}`;
  }

  return brut;
}
