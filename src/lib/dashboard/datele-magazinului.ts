/**
 * Datele magazinului din Setari > General: ce vad clientii (numele, sloganul,
 * contactul, adresa, retelele sociale) si datele firmei.
 *
 * Pana la 24.10.2026 jumatate din ele se editau din „Editeaza magazinul", iar
 * telefonul si emailul aveau DOUA campuri, in doua ecrane, peste aceleasi
 * coloane: cine le schimba intr-unul vedea valoarea veche in celalalt, iar prima
 * salvare de acolo o scria inapoi. Acum au un singur loc.
 *
 * Regulile stau aici, nu in componenta: o actiune de server primeste orice
 * trimite browserul, deci ele se aplica pe server (`updateGeneralSettings`).
 * Ecranul doar le arata inainte.
 */

export const LIMITE_DATE = {
  numeMagazin: 100,
  slogan: 120,
  descriere: 600,
  denumireFirma: 100,
  link: 300,
} as const;

export const RETELE_SOCIALE = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type ReteaSociala = (typeof RETELE_SOCIALE)[number];

export const NUME_RETEA: Record<ReteaSociala, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/** Ce trimite ecranul. Totul text, ca sa nu existe doua forme ale aceluiasi gol. */
export type DateleGenerale = {
  store_name: string;
  tagline: string;
  description: string;
  phone: string;
  /** Numarul de WhatsApp asa cum l-a hotarat ecranul: acelasi cu telefonul, altul, sau gol. */
  whatsapp: string;
  email: string;
  store_address: string;
  store_city: string;
  store_county: string;
  social: Partial<Record<ReteaSociala, string>>;
  butoane: { whatsapp: boolean; apel: boolean };
  business_name: string;
  cui: string;
  reg_com: string;
  address: string;
  city: string;
  county: string;
};

/** Coloanele din `businesses` scrise de Setari > General, gata de UPDATE. */
export type ColoaneGenerale = {
  business_name: string;
  store_name: string | null;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  store_address: string | null;
  store_city: string | null;
  store_county: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  cui: string | null;
  reg_com: string | null;
};

export type DateGeneralePregatite =
  | {
      ok: true;
      coloane: ColoaneGenerale;
      /** Doar retelele de mai sus; `null` = reteaua se scoate. Restul cheilor din `social` nu se ating. */
      retele: Record<ReteaSociala, string | null>;
      butoane: { floating_whatsapp: boolean; floating_call: boolean };
    }
  | { ok: false; eroare: string };

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sauNull(v: string): string | null {
  return v === "" ? null : v;
}

const FORMA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Un link de retea sociala, adus la o adresa web sau refuzat.
 *
 * Fara schema („instagram.com/magazin") primeste `https://`, fiindca asa scriu
 * oamenii si asa il cere si ecranul. Orice alta schema decat http(s) se refuza:
 * linkul ajunge ca `href` in subsolul fiecarei pagini, deci un `javascript:`
 * nu are ce cauta acolo, oricine l-ar fi scris.
 */
export function normalizeazaLinkSocial(valoare: unknown): { url: string | null } | { eroare: string } {
  const t = text(valoare);
  if (!t) return { url: null };
  if (t.length > LIMITE_DATE.link) return { eroare: "este prea lung" };
  const areSchema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[a-z][a-z0-9+.-]*:[^0-9]/i.test(t);
  const cuSchema = areSchema ? t : `https://${t.replace(/^\/+/, "")}`;
  let adresa: URL;
  try {
    adresa = new URL(cuSchema);
  } catch {
    return { eroare: "nu pare o adresă web" };
  }
  if (adresa.protocol !== "https:" && adresa.protocol !== "http:") {
    return { eroare: "trebuie să înceapă cu https://" };
  }
  if (!adresa.hostname.includes(".")) return { eroare: "nu pare o adresă web" };
  return { url: cuSchema };
}

/**
 * Verifica si curata ce a trimis ecranul. Primeste `unknown`, fiindca asta
 * primeste o actiune de server, oricat ar spune tipul din semnatura ei.
 */
export function pregatesteDateleGenerale(intrare: unknown): DateGeneralePregatite {
  const d = (intrare && typeof intrare === "object" ? intrare : {}) as Record<string, unknown>;

  const business_name = text(d.business_name);
  if (!business_name) return { ok: false, eroare: "Denumirea firmei este obligatorie." };
  if (business_name.length > LIMITE_DATE.denumireFirma) {
    return { ok: false, eroare: `Denumirea firmei are ${business_name.length} de caractere. Limita este ${LIMITE_DATE.denumireFirma}.` };
  }

  const store_name = text(d.store_name);
  if (store_name.length > LIMITE_DATE.numeMagazin) {
    return { ok: false, eroare: `Numele magazinului are ${store_name.length} de caractere. Limita este ${LIMITE_DATE.numeMagazin}.` };
  }
  const tagline = text(d.tagline);
  if (tagline.length > LIMITE_DATE.slogan) {
    return { ok: false, eroare: `Sloganul are ${tagline.length} de caractere. Limita este ${LIMITE_DATE.slogan}.` };
  }
  const description = text(d.description);
  if (description.length > LIMITE_DATE.descriere) {
    return { ok: false, eroare: `Descrierea are ${description.length} de caractere. Limita este ${LIMITE_DATE.descriere}.` };
  }

  const email = text(d.email);
  if (email && !FORMA_EMAIL.test(email)) {
    return { ok: false, eroare: "Adresa de email nu pare corectă. Verifică să aibă forma nume@domeniu.ro." };
  }

  const socialBrut = (d.social && typeof d.social === "object" ? d.social : {}) as Record<string, unknown>;
  const retele = {} as Record<ReteaSociala, string | null>;
  for (const retea of RETELE_SOCIALE) {
    const rezultat = normalizeazaLinkSocial(socialBrut[retea]);
    if ("eroare" in rezultat) {
      return { ok: false, eroare: `Linkul de ${NUME_RETEA[retea]} ${rezultat.eroare}. Scrie-l complet, de exemplu https://${retea}.com/magazinul-tau.` };
    }
    retele[retea] = rezultat.url;
  }

  const butoaneBrut = (d.butoane && typeof d.butoane === "object" ? d.butoane : {}) as Record<string, unknown>;

  return {
    ok: true,
    coloane: {
      business_name,
      store_name: sauNull(store_name),
      tagline: sauNull(tagline),
      description: sauNull(description),
      phone: sauNull(text(d.phone)),
      whatsapp: sauNull(text(d.whatsapp)),
      email: sauNull(email),
      store_address: sauNull(text(d.store_address)),
      store_city: sauNull(text(d.store_city)),
      store_county: sauNull(text(d.store_county)),
      address: sauNull(text(d.address)),
      city: sauNull(text(d.city)),
      county: sauNull(text(d.county)),
      cui: sauNull(text(d.cui)),
      reg_com: sauNull(text(d.reg_com)),
    },
    retele,
    butoane: {
      floating_whatsapp: butoaneBrut.whatsapp === true,
      floating_call: butoaneBrut.apel === true,
    },
  };
}

/** Ce citeste pagina de setari din `businesses`. */
export type RandBusinessGeneral = {
  business_name?: string | null;
  store_name?: string | null;
  tagline?: string | null;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  store_address?: string | null;
  store_city?: string | null;
  store_county?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  cui?: string | null;
  reg_com?: string | null;
  social?: unknown;
  features?: unknown;
};

/**
 * Valorile cu care se deschide ecranul.
 *
 * ⚠ Butoanele flotante se citesc EXACT ca in magazin (`header-settings.ts`):
 * WhatsApp-ul e pornit cat timp nu l-a stins nimeni, apelul doar daca l-a pornit
 * cineva. Citite altfel, comutatorul ar arata o stare, magazinul alta, iar prima
 * salvare ar schimba magazinul fara ca omul sa fi atins ceva.
 */
export function dateleMagazinuluiDinRand(rand: RandBusinessGeneral | null | undefined): DateleGenerale {
  const r = rand ?? {};
  const social = (r.social && typeof r.social === "object" && !Array.isArray(r.social) ? r.social : {}) as Record<string, unknown>;
  const features = (r.features && typeof r.features === "object" && !Array.isArray(r.features) ? r.features : {}) as Record<string, unknown>;
  const linkuri: Partial<Record<ReteaSociala, string>> = {};
  for (const retea of RETELE_SOCIALE) {
    if (typeof social[retea] === "string") linkuri[retea] = social[retea] as string;
  }
  return {
    store_name: r.store_name ?? "",
    tagline: r.tagline ?? "",
    description: r.description ?? "",
    phone: r.phone ?? "",
    whatsapp: r.whatsapp ?? "",
    email: r.email ?? "",
    store_address: r.store_address ?? "",
    store_city: r.store_city ?? "",
    store_county: r.store_county ?? "",
    social: linkuri,
    butoane: {
      whatsapp: features.floating_whatsapp !== false,
      apel: features.floating_call === true,
    },
    business_name: r.business_name ?? "",
    cui: r.cui ?? "",
    reg_com: r.reg_com ?? "",
    address: r.address ?? "",
    city: r.city ?? "",
    county: r.county ?? "",
  };
}

/**
 * Retelele noi peste `social` din baza. Cheile pe care ecranul nu le are
 * (`website`, de exemplu) raman cum erau; o retea golita dispare.
 */
export function imbinaRetelele(
  existent: unknown,
  retele: Record<ReteaSociala, string | null>,
): Record<string, string> {
  const baza = (existent && typeof existent === "object" && !Array.isArray(existent) ? existent : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [cheie, valoare] of Object.entries(baza)) {
    if (typeof valoare === "string" && valoare) out[cheie] = valoare;
  }
  for (const retea of RETELE_SOCIALE) {
    const url = retele[retea];
    if (url) out[retea] = url;
    else delete out[retea];
  }
  return out;
}

/**
 * Comutatoarele butoanelor flotante peste `features` din baza.
 *
 * Restul cheilor (`show_gallery`, `show_about`, `show_contact`) le citeste
 * designul magazinului, iar ecranul asta nu le are: raman exact cum sunt.
 */
export function imbinaButoanele(
  existent: unknown,
  butoane: { floating_whatsapp: boolean; floating_call: boolean },
): Record<string, unknown> {
  const baza = (existent && typeof existent === "object" && !Array.isArray(existent) ? existent : {}) as Record<string, unknown>;
  return { ...baza, ...butoane };
}
