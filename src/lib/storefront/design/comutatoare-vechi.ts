import type { SectionInstance, StoreDesign } from "./types";

/**
 * Ce sectiune de design regleaza fiecare comutator din „Editeaza magazinul".
 *
 * Cheia e din `page_content`, valoarea e id-ul sectiunii din designul derivat
 * (`defaults.ts`, unde id-urile sunt deterministe tocmai ca sa poata fi numite
 * aici).
 */
export const COMUTATOR_CATRE_SECTIUNE: Record<string, string> = {
  show_trust_strip_on_store: "usp",
  show_featured_section: "featured",
  show_shipping_progress: "shipping",
  store_benefits_section: "benefits",
  reviews_section: "reviews",
  announcement_bar: "announcement",
};

/**
 * Comutatoarele care aleg o VARIANTA, nu o stare pornit/oprit.
 *
 * „Afiseaza continutul peste banner" comuta hero-ul intre `banners` si
 * `overlay`, adica intre doua design-uri care se pot alege si din galerie.
 */
export const COMUTATOR_CATRE_VARIANTA: Record<string, string> = {
  hero_show_content: "hero",
};

/** Sectiunile reglate de cheile astea. Cheile fara pereche se ignora. */
export function sectiuniAleComutatoarelor(chei: Iterable<string>): string[] {
  return traduce(chei, COMUTATOR_CATRE_SECTIUNE);
}

/** La fel, pentru comutatoarele care aleg o varianta. */
export function sectiuniAleVariantelor(chei: Iterable<string>): string[] {
  return traduce(chei, COMUTATOR_CATRE_VARIANTA);
}

function traduce(chei: Iterable<string>, harta: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const cheie of chei) {
    const id = harta[cheie];
    if (id) out.add(id);
  }
  return [...out];
}

/**
 * Scoate semnul `enabledOverride` de pe sectiunile date.
 *
 * ⚠ ULTIMUL CARE SCRIE CASTIGA, SI ASTA TINE VII AMANDOUA COMUTATOARELE.
 *
 * Aceeasi sectiune are doua controale: ochiul din editorul de design, care scrie
 * `enabledOverride`, si comutatorul vechi din „Editeaza magazinul", care scrie in
 * `page_content`. Semnul explicit bate derivarea — asa si trebuie, altfel ochiul
 * s-ar anula singur la fiecare citire — dar consecinta era ca, dupa prima
 * folosire a ochiului, comutatorul vechi murea TACUT: se misca, se salva, arata
 * „Salvat", si nu schimba nimic, pentru totdeauna.
 *
 * Reparatia nu e sa ascundem comutatorul, ci sa-i dam inapoi dreptul de a vorbi:
 * cand comerciantul il foloseste, el spune ceva la fel de explicit ca ochiul, iar
 * semnul mai vechi nu mai are ce apara.
 */
export function faraSemnPeSectiuni(
  design: StoreDesign,
  idsPornitOprit: string[],
  idsVarianta: string[] = [],
): StoreDesign {
  if (idsPornitOprit.length === 0 && idsVarianta.length === 0) return design;
  const tintePornire = new Set(idsPornitOprit);
  const tinteVarianta = new Set(idsVarianta);

  const curata = (s: SectionInstance): SectionInstance => {
    let out = s;
    if (tintePornire.has(s.id) && s.enabledOverride !== undefined) {
      const { enabledOverride: _semn, ...rest } = out;
      out = rest;
    }
    if (tinteVarianta.has(s.id) && out.variantOverride !== undefined) {
      const { variantOverride: _semn, ...rest } = out;
      out = rest;
    }
    return out;
  };

  return {
    ...design,
    chrome: { ...design.chrome, announcement: design.chrome.announcement && curata(design.chrome.announcement) },
    home: design.home.map(curata),
  };
}
