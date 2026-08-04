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
    .select("id, slug, logo_url, business_name, store_name, store_city, description, tagline, cover_url, primary_color, custom_domain, store_settings(page_content, marketing_config, cookie_banner_config, google_analytics_config)")
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
