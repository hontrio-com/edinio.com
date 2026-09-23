import { createAdminClient } from "@/lib/supabase/admin";
import { bareHost } from "@/lib/platform-hosts";
import { originaEsteNumaiAMagazinului, conturilePornite } from "./origine";

export type MagazinDeCont = {
  id: string;
  slug: string;
  store_name: string | null;
  business_name: string | null;
  custom_domain: string | null;
  custom_domain_healthy: boolean | null;
  suspended_until: string | null;
  user_id: string;
};

/**
 * Din ce magazin vine o cerere catre `/api/cont/**`, si are voie sa vina?
 *
 * ⚠⚠ MAGAZINUL SE IA DIN ANTETUL `Host`, SI DIN NIMIC ALTCEVA.
 *
 * Nu exista `?magazin=<slug>` si nu exista un camp in corp. Motivul nu e
 * eleganta: `cont_cere_cod` cheltuie creditul de SMS al comerciantului, iar daca
 * tinta s-ar alege din cerere, un strain ar putea alege din adresa URL al cui
 * credit se consuma. Cu gazda ca singura sursa, tinta e chiar magazinul pe care
 * omul il are deschis.
 *
 * ⚠ Si merge tocmai fiindca `src/proxy.ts:179` scoate `/api/**` DEVREME, inainte
 * de rescrierea pe `/{slug}`: ruta nu primeste niciodata slugul in cale, deci nu
 * exista tentatia de a-l citi de acolo.
 *
 * Intoarce `null` cand cererea nu are ce cauta aici, si NU spune de ce: ruta
 * raspunde la fel in toate cazurile.
 */
export async function magazinulCereriiDeCont(
  host: string | null,
): Promise<(MagazinDeCont & { contClientConfig: unknown }) | null> {
  const m = await magazinulDupaGazda(host);
  if (!m) return null;
  if (!conturilePornite(m.contClientConfig)) return null;
  return m;
}

/**
 * Acelasi lucru, DAR fara poarta comutatorului din Setari.
 *
 * ⚠ Exista pentru IESIREA din cont, care trebuie sa mearga MAI ALES cand ceva
 * s-a stricat: daca ar cere functia aprinsa, comerciantul care o stinge ar lasa
 * fiecare cumparator cu un cookie pe care nu-l mai poate scoate de nicaieri.
 * Acelasi rationament ca la iesirea din panou, care e ruta tocmai ca sa mearga
 * si dintr-o sesiune pe care poarta MFA o refuza.
 *
 * ⚠ Poarta de ORIGINE ramane si aici: pe gazda platformei nu se atinge nimic.
 */
export async function magazinulDupaGazda(
  host: string | null,
): Promise<(MagazinDeCont & { contClientConfig: unknown }) | null> {
  const gazda = bareHost(host ?? "");
  if (!gazda) return null;

  const { data, error } = await createAdminClient()
    .from("businesses")
    .select("id, slug, store_name, business_name, custom_domain, custom_domain_healthy, suspended_until, user_id, is_published, store_settings(cont_client_config)")
    .eq("custom_domain", gazda)
    .maybeSingle();

  /* ⚠ O pana de baza NU inseamna „nu e magazin". Apelantul raspunde 503, nu 404. */
  if (error) throw error;
  if (!data || data.is_published !== true) return null;

  const magazin: MagazinDeCont = {
    id: data.id,
    slug: data.slug,
    store_name: data.store_name,
    business_name: data.business_name,
    custom_domain: data.custom_domain,
    custom_domain_healthy: data.custom_domain_healthy,
    suspended_until: data.suspended_until,
    user_id: data.user_id,
  };

  /*
    ⚠ Aceeasi poarta ca pe pagini, ceruta de doua ori dinadins: o ruta de API nu
    se randeaza prin layout, deci daca n-ar cere-o ea insasi n-ar cere-o nimeni.
    Pe gazda platformei, `custom_domain` nu se potriveste cu `Host`, deci
    interogarea de mai sus nu gaseste nimic si iesim inainte de aici.
  */
  if (!originaEsteNumaiAMagazinului(host, magazin)) return null;

  const setari = Array.isArray(data.store_settings) ? data.store_settings[0] : data.store_settings;
  return { ...magazin, contClientConfig: setari?.cont_client_config ?? null };
}

/**
 * Magazinul e oprit? (suspendat, sau abonamentul proprietarului expirat)
 *
 * ⚠ ACEEASI REGULA CA LA `/cos` SI `/checkout`
 * (`src/app/(public)/[slug]/cos/page.tsx:107-119`), litera cu litera, inclusiv
 * faptul ca `suspended_until` se citeste ca „activ pana la": randul e oprit cand
 * data a TRECUT, nu cat timp nu a trecut.
 *
 * ⚠ De ce NU e scrisa in SQL, langa `cont_sesiune_verifica`: ar fi fost a treia
 * copie a unei reguli care hotaraste daca un magazin mai poate lua bani. Sta
 * intr-un singur loc, in TypeScript, si de aici o cheama si zona de cont.
 */
export async function magazinulEOprit(magazin: MagazinDeCont): Promise<boolean> {
  if (magazin.suspended_until && new Date(magazin.suspended_until) < new Date()) return true;

  const { data } = await createAdminClient()
    .from("users_profile")
    .select("plan, plan_expires_at")
    .eq("id", magazin.user_id)
    .single();

  if ((data?.plan === "free" || data?.plan === "trial") && data?.plan_expires_at) {
    return new Date(data.plan_expires_at) < new Date();
  }
  return false;
}
