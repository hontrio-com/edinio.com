/**
 * Problemele unui produs, asa cum le arata panoul.
 *
 * ═══ ⚠ DE CE (masurat 17.09.2026) ═══
 *
 * Google intoarce ACEEASI problema o data pe fiecare suprafata (`reportingContext`): SHOPPING_ADS,
 * DISPLAY_ADS, FREE_LISTINGS, DEMAND_GEN_ADS, VIDEO_ADS, DEMAND_GEN_ADS_DISCOVER_SURFACE. La `mokka`,
 * cele 228 de probleme stocate erau 38 de produse × 2 probleme × 6 suprafete, iar panoul le arata pe
 * toate: sase randuri identice sub fiecare produs.
 *
 * Aici se strang dupa `code` + `attribute`, cu severitatea cea mai grava dintre suprafete si cu lista
 * suprafetelor afectate.
 *
 * ⚠ Linkul „cum rezolv” e `documentation` (proto v1, `ProductStatus.ItemLevelIssue`). Problemele scrise
 * inainte de 17.09.2026 pot avea doar `documentationUri`, deci se citesc amandoua.
 */

export interface ProblemaStocata {
  code?: string;
  severity?: string;
  resolution?: string;
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  documentationUri?: string;
  applicableCountries?: string[];
}

export interface ProblemaDeAfisat {
  cheie: string;
  severitate: "DISAPPROVED" | "DEMOTED" | "NOT_IMPACTED";
  titlu: string;
  detaliu?: string;
  link?: string;
  suprafete: string[];
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEMELE SE SCRIU IN ROMANA                                 (23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ SEMNALAT DE EL: „ba scrie in engleza, ba in romana". Pe fisa unui produs
 * respins se vedea:
 *
 *   Unclaimed website: Verifying and claiming your store's website are essential
 *   steps in setting up your Merchant Center account   cum rezolv
 *   Afectează: reclame Shopping, listări gratuite, Demand Gen
 *
 * Adica textul problemei in engleza, iar tot ce scriem noi in jurul lui in romana.
 * Cel mai prost amestec cu putinta: omul crede ca jumatate din ecran nu e pentru el.
 *
 * ⚠ DE CE NU SE CERE PUR SI SIMPLU IN ROMANA DE LA EI. La problemele de CONT se
 * poate, si chiar o cerem: `listAccountIssues` trimite `languageCode=ro`. La
 * problemele de PRODUS nu exista un asemenea parametru: `accounts.products.get`
 * intoarce `itemLevelIssues` cu textul in engleza, si atat. Vezi
 * `src/lib/google-merchant/client.ts`.
 *
 * ⚠ CHEIA E `code`, NU TEXTUL. Textul lor se schimba fara sa anunte nimeni, si
 * atunci o potrivire pe text ar fi cazut in tacere inapoi pe engleza. Codurile
 * sunt identificatori si stau pe loc.
 *
 * ⚠ CE NU E IN DICTIONAR RAMANE IN ENGLEZA, dinadins: mai bine textul lor decat o
 * traducere inventata de noi despre o regula a lor pe care n-am citit-o.
 *
 * ═══ MASURAT PE PRODUCTIE, 23.09.2026 ═══
 *
 * Toate cele 18 coduri care exista azi in `gmc_products.issues`, cu cate aparitii:
 *   homepage_not_claimed 6.520 · policy_enforcement_account_disapproval 6.520
 *   missing_potentially_required_attribute 5.402 · misrepresentation 312
 *   image_too_small_for_high_resolution 288 · image_link_pending_crawl 190
 *   description_short 50 · title_all_caps 30 · attribute_pending_review 14
 *   item_missing_required_attribute 10 · missing_shipping_no_account_shipping_exist 10
 *   pending_initial_policy_review_free_listings 10 · attribute_violated_discovery_ads_policy 8
 *   image_link_broken 5 · guns_parts_policy_violation 5 · low_image_quality 5
 *   image_link_internal_error 5 · violated_discovery_ads_policy_experiment2 4
 */
const TEXTE_RO: Record<string, { titlu: string; detaliu: string }> = {
  homepage_not_claimed: {
    titlu: "Site-ul magazinului nu e revendicat",
    detaliu: "Verifică și revendică adresa magazinului în Merchant Center. Fără asta, Google nu arată niciun produs.",
  },
  policy_enforcement_account_disapproval: {
    titlu: "Produsele nu se arată clienților",
    detaliu: "Contul are probleme de configurare sau de politici. Rezolvă-le în Merchant Center și cere o reverificare.",
  },
  /*
    ⚠ ACELASI COD POARTA ATRIBUTE DIFERITE, si de-aia titlul lui se compune, nu se
    scrie fix. Masurat: acelasi `missing_potentially_required_attribute` vine si ca
    „Missing certification attribute", si ca „Missing unit pricing measure". Un titlu
    fix ar fi spus „certificare" peste o problema de pret pe unitate.

    ⚠ NUMELE ATRIBUTULUI RAMANE AL LOR, netradus: asa il gaseste comerciantul in
    Merchant Center si in feed. E un nume de camp, nu o propozitie.
  */
  missing_potentially_required_attribute: {
    titlu: "Lipsește un atribut cerut",
    detaliu: "Pentru unele categorii, Google sau legea cer un atribut pe care produsul nu îl are. Adaugă-l în fișa produsului.",
  },
  misrepresentation: {
    titlu: "Informații care induc în eroare",
    detaliu: "Google consideră că datele despre firmă, model de business sau politici nu sunt clare. Se rezolvă în Merchant Center.",
  },
  image_too_small_for_high_resolution: {
    titlu: "Poza e prea mică",
    detaliu: "Folosește o imagine de cel puțin 500 x 500 pixeli.",
  },
  image_link_pending_crawl: {
    titlu: "Poza încă nu se poate arăta",
    detaliu: "Google are nevoie de până la 3 zile ca să preia imaginea. Nu ai nimic de făcut.",
  },
  description_short: {
    titlu: "Descrierea e prea scurtă",
    detaliu: "Descrierea nu atinge numărul minim de caractere cerut de Google. Scrie mai multe despre produs.",
  },
  title_all_caps: {
    titlu: "Prea multe majuscule în titlu",
    detaliu: "Scrie titlul normal, nu cu majuscule peste tot.",
  },
  attribute_pending_review: {
    titlu: "Poza e în verificare",
    detaliu: "Google poate lua până la 5 zile ca să verifice imaginea. Nu ai nimic de făcut.",
  },
  item_missing_required_attribute: {
    titlu: "Lipsește poza produsului",
    detaliu: "Produsul n-are nicio imagine, iar Google o cere obligatoriu. Adaugă una din fișa produsului.",
  },
  missing_shipping_no_account_shipping_exist: {
    titlu: "Lipsesc datele de livrare",
    detaliu: "Adaugă costul și termenul de livrare în Merchant Center, ca să le vadă cumpărătorul.",
  },
  pending_initial_policy_review_free_listings: {
    titlu: "Prima verificare e în curs",
    detaliu: "Google verifică produsul pentru listările gratuite. Poate dura până la 3 zile lucrătoare.",
  },
  attribute_violated_discovery_ads_policy: {
    titlu: "Imagine nepotrivită",
    detaliu: "Pozele trebuie să arate chiar produsul, să fie de bună calitate și să respecte regulile Google.",
  },
  image_link_broken: {
    titlu: "Format de imagine neacceptat",
    detaliu: "Folosește o imagine JPEG, PNG sau GIF.",
  },
  guns_parts_policy_violation: {
    titlu: "Arme sau piese de armă",
    detaliu: "Google nu acceptă anumite arme funcționale, piesele lor sau instrucțiuni de asamblare.",
  },
  low_image_quality: {
    titlu: "Poză de calitate slabă",
    detaliu: "Una dintre imaginile produsului e de calitate prea slabă. Înlocuiește-o cu una mai clară.",
  },
  image_link_internal_error: {
    titlu: "Poza n-a fost procesată",
    detaliu: "Nu ai nimic de făcut. Google reia procesarea imaginii în cel mult 3 zile.",
  },
  violated_discovery_ads_policy_experiment2: {
    titlu: "Imagine nepotrivită pentru YouTube Shopping",
    detaliu: "Pozele trebuie să respecte regulile de calitate ale reclamelor YouTube Shopping.",
  },
};

/**
 * Textul problemei pe romaneste, daca il stim; altfel chiar textul lui Google.
 *
 * ⚠ NU se intoarce niciodata gol: un titlu gol ar fi un rand fara nimic pe el, iar
 * comerciantul ar vedea o problema despre care nu i se spune nimic.
 */
function textulProblemei(p: ProblemaStocata): { titlu: string; detaliu?: string } {
  const ro = p.code ? TEXTE_RO[p.code] : undefined;
  if (!ro) return { titlu: p.description || p.code || "Problemă", detaliu: p.detail || undefined };
  /* ⚠ Numele atributului se lipeste de titlu cand exista: fara el, doua probleme
     deosebite (certificare si pret pe unitate) ar fi scris acelasi rand. */
  const titlu = p.attribute ? `${ro.titlu}: ${p.attribute}` : ro.titlu;
  return { titlu, detaliu: ro.detaliu };
}

const GRAVITATE: Record<string, number> = { DISAPPROVED: 3, DEMOTED: 2, NOT_IMPACTED: 1 };

function severitateCunoscuta(s: string | undefined): ProblemaDeAfisat["severitate"] {
  const v = String(s ?? "").toUpperCase();
  return v === "DISAPPROVED" || v === "DEMOTED" ? v : "NOT_IMPACTED";
}

/** Ordinea: intai ce respinge produsul, apoi ce il retrogradeaza, apoi restul. */
export function problemeDeAfisat(probleme: ProblemaStocata[] | null | undefined): ProblemaDeAfisat[] {
  const dupaCheie = new Map<string, ProblemaDeAfisat>();
  for (const p of probleme ?? []) {
    if (!p || typeof p !== "object") continue;
    const cheie = `${p.code ?? p.description ?? ""}|${p.attribute ?? ""}`;
    const severitate = severitateCunoscuta(p.severity);
    const link = p.documentation || p.documentationUri || undefined;
    const existenta = dupaCheie.get(cheie);
    if (!existenta) {
      const text = textulProblemei(p);
      dupaCheie.set(cheie, {
        cheie, severitate,
        titlu: text.titlu,
        detaliu: text.detaliu,
        link,
        suprafete: p.reportingContext ? [p.reportingContext] : [],
      });
      continue;
    }
    if (GRAVITATE[severitate] > GRAVITATE[existenta.severitate]) existenta.severitate = severitate;
    if (!existenta.link && link) existenta.link = link;
    if (!existenta.detaliu) existenta.detaliu = textulProblemei(p).detaliu;
    if (p.reportingContext && !existenta.suprafete.includes(p.reportingContext)) existenta.suprafete.push(p.reportingContext);
  }
  return [...dupaCheie.values()].sort((a, b) => GRAVITATE[b.severitate] - GRAVITATE[a.severitate]);
}

/** Numele pe romaneste ale suprafetelor, pentru panou. Una necunoscuta se arata cum vine. */
const SUPRAFETE: Record<string, string> = {
  SHOPPING_ADS: "reclame Shopping",
  FREE_LISTINGS: "listări gratuite",
  DISPLAY_ADS: "reclame Display",
  DEMAND_GEN_ADS: "Demand Gen",
  DEMAND_GEN_ADS_DISCOVER_SURFACE: "Demand Gen (Discover)",
  VIDEO_ADS: "reclame video",
  LOCAL_INVENTORY_ADS: "inventar local",
  FREE_LOCAL_LISTINGS: "listări locale gratuite",
  CLOUD_RETAIL: "Cloud Retail",
  LOCAL_CLOUD_RETAIL: "Cloud Retail local",
};

export function numeleSuprafetei(context: string): string {
  return SUPRAFETE[context] ?? context;
}
