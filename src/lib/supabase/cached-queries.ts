import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached user lookup — deduplicated per request via React.cache.
 * When layout + page both call this in the same render, only ONE auth API call is made.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Fetch the user current business + full store_settings in a single JOIN query.
 * Eliminates the sequential waterfall (2 round trips) into 1.
 * React.cache deduplicates this per-request across layout and page.
 *
 * RAMANE PE CLIENTUL COMERCIANTULUI, DINADINS. Nu o muta pe `createAdminClient()`.
 *
 * E locul spre care se intinde mana primul, fiindca `store_settings(*)` aduce
 * toate cele 24 de coloane criptate si alimenteaza ~22 de pagini din
 * /dashboard/features. Exact de aceea nu trebuie mutata: pe service role ar
 * incarca in clar TOATE credentialele magazinului la fiecare randare a fiecarei
 * pagini de integrari — adica fix expunerea pe care migratia din 2026-08-05 o
 * inchide — si ar renunta si la RLS pe drumul cel mai umblat din panou.
 *
 * S-a verificat, consumator cu consumator, ca niciunul nu are nevoie de textul
 * in clar. Toti fac unul din trei lucruri, si toate trei supravietuiesc unui
 * `enc.v1.…`, fiindca e un sir NEGOL:
 *   - `mascheazaConfig(...)` goleste campul secret si raspunde „e configurat?"
 *     dupa `length > 0` (dpd, cargus, fan-courier, sameday, woot, colete, oblio,
 *     fgo, smartbill, smso, netopia, ipay, klarna, revolut);
 *   - `toPublic*Config(...)` intoarce `connected: !!api_key` (mailchimp, brevo,
 *     klaviyo);
 *   - steaguri derivate prin adevar/fals (features/page.tsx, stripe, pixelii).
 * Niciunul nu duce vreo valoare la un furnizor si niciunul nu o scrie inapoi.
 *
 * SINGURA EXCEPTIE, si e instructiva: features/notice/page.tsx NU mai ia
 * `notice_config` de aici. `notice_config.webhook_secret` e criptat in baza, dar
 * NU e mascat (comerciantul trebuie sa-l vada, intra in URL-ul de webhook pe care
 * il lipeste la notice.ro), deci e singurul camp de pe drumul asta care chiar are
 * nevoie de textul in clar. Se citeste punctual cu `createAdminClient()` si abia
 * apoi trece prin `mascheazaConfig` — exact tiparul de mai jos.
 *
 * DACA vreodata un consumator nou chiar are nevoie de secretul in clar, NU-l
 * adauga aici: citeste-l punctual cu `createAdminClient()` pe calea aceea, dupa
 * ce ai dovedit proprietatea. Vezi tiparul din dashboard/settings/page.tsx.
 */
export const getCachedBusinessWithSettings = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, store_settings(*)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  if (!data) return { business: null, settings: null };
  const settings = Array.isArray(data.store_settings)
    ? (data.store_settings[0] ?? null)
    : (data.store_settings ?? null);
  return { business: { id: data.id }, settings };
});
