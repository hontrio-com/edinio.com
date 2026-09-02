import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, credentialeCorporate } from "@/lib/google-analytics/oauth";
import type { Json } from "@/types/database.types";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  LEGATURA EDINIO -> GA4, PENTRU RAPOARTELE DIN ADMIN
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ASTA E CONTUL NOSTRU, nu al vreunui comerciant. Legatura fiecarui client sta
  in `store_settings.google_analytics_config`, per magazin, si n-are nicio treaba
  cu randurile de aici. Aceeasi granita ca la pixeli.

  ⚠ SE REFOLOSESTE APLICATIA GOOGLE CARE EXISTA DEJA (`lib/google-analytics/
  oauth.ts`), cu acelasi `redirect_uri` si acelasi scope `analytics.readonly`.
  Deci nu trebuie inregistrat nimic nou in Google Cloud, si nu se reia nicio
  verificare a ecranului de consimtamant.

  ═══ ⚠ UNDE STA JETONUL, SI DE CE ACOLO ═══

  In `platform_settings`, care are RLS pornit si ZERO politici — adica `anon` si
  `authenticated` nu citesc din ea nimic, niciodata. Numai cheia de serviciu, care
  ocoleste RLS, ajunge la rand. Verificat in baza pe 02.09.2026.

  ⚠ SI TOTUSI NU E DE AJUNS. `/api/admin/settings` intoarce `select("*")` din
  aceeasi tabela, transformat in `{cheie: valoare}` — deci fara o taiere anume,
  jetonul de reimprospatare ar fi plecat catre browserul oricarui administrator.
  Un `refresh_token` Google nu expira: cine il are are contul, pana la revocare.
  Taierea se face acolo, si o proba o pazeste.
*/

/** Cheia randului din `platform_settings`. */
export const CHEIE_CONEXIUNE = "edinio_ga4_admin";

export type ConexiuneGa4Admin = {
  /** ⚠ SECRET. Nu pleaca niciodata catre browser. Vezi `pentruBrowser`. */
  refresh_token: string;
  email_conectat?: string;
  /** Id-ul NUMERIC al proprietatii GA4 (nu `G-…`). */
  property_id?: string;
  property_name?: string;
  cont_google?: string;
  /** Codul `G-…` al fluxului web, doar ca sa putem arata ca e chiar al nostru. */
  masurare_id?: string;
  conectat_la?: string;
};

/** Ce vede browserul: tot, mai putin jetonul. */
export type ConexiuneVizibila = Omit<ConexiuneGa4Admin, "refresh_token"> & { conectat: true };

/**
 * ⚠ FUNCTIA ASTA E SINGURUL DRUM CATRE BROWSER.
 *
 * Nu se intoarce niciodata `ConexiuneGa4Admin` dintr-o ruta. Tipul de iesire nici
 * nu are campul, deci o scapare cade la compilare, nu in productie.
 */
export function pentruBrowser(c: ConexiuneGa4Admin): ConexiuneVizibila {
  const { refresh_token: _jeton, ...restul } = c;
  void _jeton;
  return { ...restul, conectat: true };
}

export async function citesteConexiune(): Promise<ConexiuneGa4Admin | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", CHEIE_CONEXIUNE)
    .maybeSingle();

  const v = data?.value as ConexiuneGa4Admin | null | undefined;
  return v && typeof v.refresh_token === "string" && v.refresh_token ? v : null;
}

/*
  ⚠ AMANDOUA SCRIU CU `.throwOnError()`, si nu e de forma.

  ⚠ MASURAT pe 03.09.2026 cu supabase-js 2.106.1: o scriere respinsa NU arunca —
  se rezolva cu `{ data: null, error: {...} }`. Fara randul asta, salvarea putea
  cadea in tacere, iar intoarcerea din OAuth ducea omul la `?ga=gata` desi
  jetonul nu se scrisese nicaieri. Al doilea „Conecteaza" ar fi dat acelasi
  rezultat, si nimeni n-ar fi stiut de ce.
*/
export async function scrieConexiune(c: ConexiuneGa4Admin, idAdmin: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("platform_settings").upsert(
    {
      key: CHEIE_CONEXIUNE,
      value: c as unknown as Json,
      updated_at: new Date().toISOString(),
      updated_by: idAdmin,
    },
    { onConflict: "key" },
  ).throwOnError();
}

export async function stergeConexiune(): Promise<void> {
  const admin = createAdminClient();
  await admin.from("platform_settings").delete().eq("key", CHEIE_CONEXIUNE).throwOnError();
}

/**
 * Un jeton de acces proaspat, sau `null` daca legatura nu mai e buna.
 *
 * ⚠ `null` INSEAMNA „RECONECTEAZA", nu „incearca din nou". Un `refresh_token`
 * Google se poate stinge singur: daca omul retrage accesul din contul lui, daca
 * isi schimba parola, sau daca aplicatia sta in „Testing" si trec sapte zile.
 * Paginile care il cer trebuie sa arate butonul de reconectare, nu o eroare
 * tehnica pe care nimeni n-o poate repara.
 */
export async function tokenDeAcces(): Promise<string | null> {
  const c = await citesteConexiune();
  if (!c) return null;
  /*
    ⚠ CU CREDITELE CARE AU CERUT JETONUL. Un `refresh_token` apartine aplicatiei
    care l-a obtinut: cerut sub alta, Google raspunde `invalid_grant`.

    ⚠ DECI IN ZIUA IN CARE SE ADAUGA VARIABILELE CORPORATE, legatura salvata nu
    mai merge si ecranul cere reconectare. Nu e un defect — e felul in care
    lucreaza Google — dar e scris aici ca sa nu para unul.
  */
  return getAccessToken(c.refresh_token, credentialeCorporate());
}
