/**
 * Identitatea publica a magazinului: adresa si datele de contact.
 *
 * ═══ ⚠ DE CE EXISTA FISIERUL ASTA ═══
 *
 * `businesses` are DOUA familii de coloane pentru acelasi lucru:
 *
 *   `address`, `city`, `county`              adresa FIRMEI (Setari > General >
 *                                            „Datele magazinului")
 *   `store_address`, `store_city`,           adresa MAGAZINULUI (Editeaza
 *   `store_county`                           magazinul)
 *
 * Sunt doua ecrane diferite, iar comerciantul completeaza de regula unul singur.
 * Cine citeste doar o familie vede un magazin fara adresa, desi omul a completat
 * totul — si asta chiar s-a intamplat: datele structurate (JSON-LD) de tip
 * `Store` se uitau NUMAI la `store_city`, deci un magazin care completase
 * „Datele magazinului" aparea in Google fara nicio adresa. Masurat pe productie
 * la 14.08.2026: 3 din 70 de magazine publicate erau exact in situatia asta, iar
 * emailul nu se emitea la NICIUNUL din cele 29 care il aveau.
 *
 * Precedenta e cea deja folosita la emiterea AWB-urilor (`gls.actions.ts`:
 * `firma?.store_address || firma?.address`): magazinul bate firma, fiindca ala e
 * locul de unde pleaca marfa si unde vine clientul. Definita O SINGURA DATA
 * aici, ca sa nu mai poata exista doua raspunsuri la aceeasi intrebare.
 *
 * ⚠ Campurile astea sunt DELIBERAT publice — se afiseaza in subsolul fiecarui
 * magazin ca cerinta ANPC/Netopia. Vezi `business-public.ts`, care explica de ce
 * `email`, `phone`, `address`, `city`, `cui` si `reg_com` raman citibile de
 * oricine. Deci a le pune si in datele structurate nu expune nimic nou.
 */

/** Ce ne trebuie din rand. Tinut minimal, ca sa poata fi chemat de oriunde. */
export type IdentitateBusiness = {
  address?: string | null;
  city?: string | null;
  county?: string | null;
  store_address?: string | null;
  store_city?: string | null;
  store_county?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Primul text nevid, dupa `trim`. */
function primul(...valori: (string | null | undefined)[]): string {
  for (const v of valori) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return "";
}

export type AdresaPublica = {
  strada: string;
  oras: string;
  judet: string;
};

/**
 * Adresa publica a magazinului, din oricare dintre cele doua familii de coloane.
 *
 * Campurile se iau INDEPENDENT unul de altul: un magazin poate avea strada
 * completata la „Editeaza magazinul" si orasul la „Datele magazinului". Luate ca
 * bloc, ar fi iesit jumatate de adresa.
 */
export function adresaPublica(b: IdentitateBusiness): AdresaPublica {
  return {
    strada: primul(b.store_address, b.address),
    oras: primul(b.store_city, b.city),
    judet: primul(b.store_county, b.county),
  };
}

/**
 * Adresa in forma `PostalAddress` de schema.org, sau `null` daca nu stim nimic.
 *
 * ⚠ Se emite daca exista MACAR O bucata, nu doar cand exista orasul. Varianta
 * dinainte cerea `store_city` si arunca restul: un magazin cu strada si judetul
 * completate, dar fara oras in coloana aia anume, nu avea deloc adresa in datele
 * structurate.
 *
 * `addressCountry` ramane „RO": platforma vinde in Romania, si e singura valoare
 * pe care o putem afirma fara sa ghicim.
 */
export function adresaPostalaJsonLd(
  b: IdentitateBusiness,
): Record<string, string> | null {
  const a = adresaPublica(b);
  if (!a.strada && !a.oras && !a.judet) return null;
  return {
    "@type": "PostalAddress",
    ...(a.strada ? { streetAddress: a.strada } : {}),
    ...(a.oras ? { addressLocality: a.oras } : {}),
    ...(a.judet ? { addressRegion: a.judet } : {}),
    addressCountry: "RO",
  };
}

/**
 * Datele de contact pentru datele structurate.
 *
 * ⚠ `email` lipsea cu totul din blocul `Store`, desi e completat in panou si se
 * afiseaza oricum in subsol. Google il foloseste in panoul de cunostinte, iar
 * pentru un magazin e chiar semnalul de „se poate lua legatura cu cineva".
 */
export function contactJsonLd(b: IdentitateBusiness): Record<string, string> {
  const email = (b.email ?? "").trim();
  const telefon = (b.phone ?? "").trim();
  return {
    ...(telefon ? { telephone: telefon } : {}),
    ...(email ? { email } : {}),
  };
}
