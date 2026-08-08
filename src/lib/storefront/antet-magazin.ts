import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Datele de antet ale magazinului, citite O SINGURA DATA pe randare.
 *
 * PROBLEMA. Layout-ul magazinului interoga baza de doua ori pentru acelasi
 * rand: o data in `generateMetadata` (titlu, descriere, favicon) si o data in
 * corpul layout-ului (culoare, pixeli, banner de cookies). Amandoua cer
 * `businesses` plus o bucata din `store_settings`, pe acelasi slug, in aceeasi
 * randare. Masurat in productie: 3.135.127 de apeluri.
 *
 * `cache` din React deduplica pe durata UNEI cereri. Nu e un cache intre
 * cereri — deci nu exista nicio invechire, iar comerciantul vede modificarile
 * instantaneu, ca pana acum. Castigul e pur: doua drumuri la baza devin unul.
 *
 * Coloanele sunt REUNIUNEA celor doua liste de dinainte, nu `*`: pe langa
 * traficul de retea, `store_settings(*)` ar declansa cele 39 de decriptari de
 * credentiale la fiecare vizita pe un magazin public, degeaba.
 */
export const incarcaAntetMagazin = cache(async (slug: string) => {
  const { data } = await createAdminClient()
    .from("businesses")
    // Un singur literal, NU concatenare: supabase-js deduce tipul randului din
    // textul lui `select`, iar un sir compus ii scapa si intoarce `GenericStringError`.
    // Reuniunea antetului CU `COLOANE_BUSINESS_PUBLIC`: acelasi rand era cerut inca
    // o data de fiecare pagina de magazin, cu clientul vizitatorului. Doua
    // dus-intorsuri pe vizita pentru un rand deja adus. Vezi `incarcaMagazinul`.
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, website, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, gallery, primary_color, is_published, suspended_until, custom_domain, social, features, type, updated_at, store_settings(page_content, marketing_config, cookie_banner_config, google_analytics_config)")
    .eq("slug", slug)
    .maybeSingle();
  return data;
});

/** `store_settings` vine ca obiect sau ca tablou, dupa cum decide PostgREST. */
export function setarileDin<T>(rand: { store_settings?: T | T[] | null } | null): T | null {
  const brut = rand?.store_settings;
  if (!brut) return null;
  return Array.isArray(brut) ? (brut[0] ?? null) : brut;
}

/**
 * Randul de magazin pentru o pagina publica, plus verdictul de acces.
 *
 * DE CE EXISTA. Fiecare pagina de magazin cerea `businesses` inca o data, cu
 * clientul vizitatorului, desi `incarcaAntetMagazin` il adusese deja in aceeasi
 * randare. Doua drumuri la baza pentru acelasi rand, la fiecare vizita.
 *
 * POARTA SE MUTA IN COD, SI TREBUIE SA FIE IDENTICA. Citirea de dinainte trecea
 * prin RLS, iar politica publica e `is_published = true`: pentru un strain, un
 * magazin nepublicat intorcea NIMIC, deci pagina raspundea 404. Citit acum cu
 * cheia de serviciu, randul vine intotdeauna — asa ca refuzul trebuie scris aici,
 * altfel magazinele nepublicate ar fi devenit pagini vizibile, cu raspuns 200 si
 * indexabile.
 *
 * `null` inseamna „nu are voie sa vada": apelantul face `notFound()`, exact ca
 * pana acum.
 */
export async function incarcaMagazinul(slug: string, userId: string | undefined) {
  const rand = await incarcaAntetMagazin(slug);
  if (!rand) return null;
  const esteProprietar = !!userId && userId === rand.user_id;
  if (!rand.is_published && !esteProprietar) return null;
  /*
   * `store_settings` NU pleaca mai departe.
   *
   * Randul de antet il poarta imbricat (`marketing_config`,
   * `google_analytics_config`, `cookie_banner_config`), iar `business` ajunge
   * INTREG ca prop la componente de client — React serializeaza props-urile in
   * HTML. `pentruBrowser` taie campurile interne ale magazinului, dar nu stie de
   * un obiect imbricat care n-a existat pana acum. Fara linia asta, unificarea
   * celor doua citiri ar fi trimis configuratiile de marketing in pagina fiecarui
   * vizitator anonim — un castig de un dus-intors platit cu o scurgere.
   *
   * Paginile isi citesc oricum `store_settings` separat, cu coloanele lor.
   */
  const { store_settings: _setari, ...business } = rand;
  return { business, esteProprietar };
}
