import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

/**
 * Randul `businesses` asa cum are voie sa ajunge in BROWSER.
 *
 * ---------------------------------------------------------------------------
 * PROBLEMA (audit 05.08.2026, constatarile 16 si 26)
 *
 * Paginile publice faceau `businesses.select("*")` si dadeau randul INTREG mai
 * departe catre `StorePageShell` si `MiniStoreRenderer`, care sunt componente de
 * CLIENT. Randul intreg ajungea deci in payload-ul RSC din HTML-ul fiecarei
 * pagini de magazin, cu tot cu campuri care nu se randeaza nicaieri:
 * `user_id`, `suspended_until`, `lat`, `lng`, `niche_id`, datele de creare.
 *
 * ---------------------------------------------------------------------------
 * CE NU SE POATE REPARA AICI, si de ce (ca sa nu se reincerce)
 *
 * 1. `email`, `phone`, `address`, `city`, `cui`, `reg_com` RAMAN publice. Nu e o
 *    scapare: se afiseaza deliberat in subsolul fiecarui magazin, ca cerinta
 *    ANPC/Netopia (FooterCentered.tsx, FooterColumns.tsx). Un magazin publicat
 *    isi publica datele de firma — asta e definitia lui.
 *
 * 2. „Registrul complet de comercianti intr-o singura cerere" — partea cu
 *    adevarat suparatoare din constatarea 16 — NU se inchide cu granturi pe
 *    coloane, fiindca exact coloanele de la punctul 1 sunt cele cautate. Ar cere
 *    o restrictie pe RANDURI, iar politica publica exista tocmai ca vitrinele sa
 *    fie citibile de oricine. E o consecinta a modelului, nu un defect.
 *
 * 3. `user_id` si `suspended_until` NU pot fi revocate de la rolul `anon`, desi
 *    auditul le numeste „pur interne". Sunt citite de codul de SERVER al
 *    paginilor publice, care ruleaza cu clientul vizitatorului, adica tot ca
 *    `anon`: `user_id` pentru `isOwner` (previzualizarea proprietarului si
 *    citirea profilului lui), `suspended_until` pentru a decide daca magazinul e
 *    suspendat. O revocare ar fi rupt exact aplicarea suspendarii. Verificat in
 *    (public)/[slug]/page.tsx:165,193, [pageSlug]/page.tsx:96,
 *    checkout/page.tsx:48,79, cos/page.tsx:59,96 si catalog/pagina-magazin.tsx:226.
 *    De aceea sunt scoase AICI, la granita cu browserul, nu in baza.
 *
 * Ce ramane si se poate revoca din baza sunt cele patru coloane care nu se
 * citesc nicaieri pe calea publica: `lat`, `lng`, `niche_id`, `created_at`.
 * Vezi migrations/2026-08-05-DUPA-DEPLOY-coloane-businesses.sql.
 */
/**
 * Coloanele pe care paginile publice le CER din baza.
 *
 * E lista completa MINUS `lat`, `lng`, `niche_id` si `created_at` — singurele
 * patru care nu se citesc nicaieri pe calea publica, deci singurele care pot fi
 * revocate de la rolul `anon` (vezi migratia DUPA-DEPLOY).
 *
 * DE CE CONTEAZA ca nu mai scrie `*`: cu granturi pe coloane, un `select("*")`
 * cere Postgres toate coloanele si pica intreg cu „permission denied", nu doar
 * pentru cele revocate. Adica exact tiparul care a rupt productia pe 04.08.2026.
 * Lista de aici si migratia trebuie sa ramana in oglinda.
 *
 * SE SCRIE PE UN SINGUR RAND, oricat de lung. Concatenat cu `+`, TypeScript
 * deduce `string` in loc de tipul-literal, iar supabase-js nu mai poate deriva
 * forma randului: interogarea ajunge sa se tipeze `GenericStringError` si tot
 * fisierul se umple de erori care nu spun ce s-a intamplat.
 */
export const COLOANE_BUSINESS_PUBLIC = "id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, website, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, gallery, primary_color, is_published, suspended_until, custom_domain, social, features, type, updated_at";

/** Campurile care nu au ce cauta in browser. Un singur loc, folosit si de tip, si de taiere. */
type CampuriInterne =
  | "user_id"
  | "suspended_until"
  | "lat"
  | "lng"
  | "niche_id"
  | "created_at"
  | "updated_at";

export type BusinessPublic = Omit<Business, CampuriInterne>;

/**
 * Randul asa cum il primeste codul de SERVER al paginilor publice: tot ce cere
 * `COLOANE_BUSINESS_PUBLIC`, adica si `user_id` / `suspended_until` / `updated_at`,
 * de care are nevoie (proprietar, suspendare, sitemap). Din el se taie
 * `pentruBrowser` inainte de granita cu clientul.
 */
export type BusinessCitit = Omit<Business, "lat" | "lng" | "niche_id" | "created_at">;

/**
 * Taie campurile interne inainte ca randul sa treaca granita catre client.
 *
 * Se cheama in componenta de SERVER, cat mai aproape de locul unde randul e dat
 * ca prop. Logica de server de dinainte de apel foloseste in continuare randul
 * intreg — `isOwner`, suspendarea si citirea profilului proprietarului au nevoie
 * de el.
 */
/**
 * Generic pe intrare, nu fixat pe randul complet: unele pagini isi citesc deja
 * magazinul cu o lista de coloane mai scurta (pagina de produs), iar o semnatura
 * legata de `Row` le-ar fi respins tocmai pe cele care sunt DEJA in regula.
 */
export function pentruBrowser<T extends Partial<Business>>(business: T): Omit<T, CampuriInterne> {
  const {
    user_id: _userId,
    suspended_until: _suspendat,
    lat: _lat,
    lng: _lng,
    niche_id: _nisa,
    created_at: _creat,
    updated_at: _actualizat,
    ...public_
  } = business;
  return public_;
}
