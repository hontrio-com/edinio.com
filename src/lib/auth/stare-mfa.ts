import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { claimuriDinToken, sesiuneNeconfirmata, type ProfilMfa } from "./mfa";

/**
 * Nucleul portii MFA: citirea starii din baza. Fara nimic din Next.js.
 *
 * DE CE E UN FISIER SEPARAT: `poarta-mfa.ts` e importat de `src/proxy.ts`, iar
 * `cere-mfa.ts` foloseste `next/headers` (cookie-urile cererii). `next/headers`
 * nu are ce cauta in pachetul proxy-ului. Nucleul comun sta aici, ca sa poata fi
 * folosit din amandoua fara sa le amestece dependintele.
 *
 * Semantica („sesiunea ASTA a fost confirmata?", nu „exista un cod in curs?") e
 * explicata pe larg in `./mfa.ts`.
 *
 * NIMIC din ce e aici nu se aplica utilizatorilor fara MFA pornit: prima
 * intrebare pusa e chiar `mfa_email_enabled`, iar raspunsul „stins" iese pe loc.
 */

export const MESAJ_REFUZ =
  "Autentificarea in doi pasi nu a fost finalizata pentru aceasta sesiune.";

/**
 * Citeste starea MFA cu SERVICE ROLE.
 *
 * De ce service role si nu clientul utilizatorului: `mfa_confirmat_la` si
 * `mfa_sesiune_confirmata` sunt coloane privilegiate — nu sunt in lista alba de
 * SELECT a rolului `authenticated` (vezi migrations/2026-08-05-poarta-mfa.sql),
 * tocmai ca sa nu poata fi nici citite, nici scrise din browser.
 *
 * DEGRADAREA LA EROARE e partea delicata, si e scrisa dinadins asa:
 *
 *   - daca interogarea completa esueaza (coloane inca inexistente fiindca
 *     migratia nu a fost aplicata, cache-ul PostgREST invechit, o pana), NU
 *     raspundem „e in regula". Asta ar reface exact gaura pe care o inchidem.
 *   - dar nici nu blocam pe toata lumea: reincercam cu o singura coloana
 *     (`mfa_email_enabled`, care exista de mult), si daca aceea spune limpede ca
 *     MFA e STINS, lasam cererea sa treaca. Conturile fara al doilea factor —
 *     adica marea majoritate — nu pot fi doborate de o problema de schema.
 *     Asta e lectia din 04.08.2026 (migratie aplicata fara codul ei: onboarding,
 *     MFA si domeniile s-au rupt in tacere).
 *   - raman blocate doar conturile cu MFA pornit, adica exact cele pentru care
 *     „nu stiu" trebuie sa insemne „nu intri".
 */
async function citesteStareaMfa(userId: string): Promise<ProfilMfa | null> {
  let admin: SupabaseClient<Database>;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    admin = createAdminClient();
  } catch (e) {
    console.error("[stare-mfa] clientul de service role nu a putut fi creat", e);
    return null;
  }

  const { data, error } = await admin
    .from("users_profile")
    .select("mfa_email_enabled, mfa_confirmat_la, mfa_sesiune_confirmata")
    .eq("id", userId)
    .maybeSingle();

  if (!error) return data as ProfilMfa | null;

  console.error("[stare-mfa] citirea starii MFA a esuat", {
    userId,
    cod: error.code,
    mesaj: error.message,
  });

  const { data: minim, error: eroareMinim } = await admin
    .from("users_profile")
    .select("mfa_email_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (!eroareMinim && minim && minim.mfa_email_enabled === false) {
    return { mfa_email_enabled: false };
  }
  return null;
}

/**
 * Nucleul: sesiunea identificata prin `idSesiune` a trecut de al doilea factor?
 * Adevarat = NU a trecut = opreste cererea.
 */
export async function sesiuneNeconfirmataPentru(
  userId: string,
  idSesiune: string | null | undefined,
): Promise<boolean> {
  const profil = await citesteStareaMfa(userId);
  return sesiuneNeconfirmata(profil, idSesiune);
}

/**
 * `session_id`-ul sesiunii curente, dintr-un client legat de cookie-urile cererii.
 *
 * `getSession()` citeste din cookie-uri (si reimprospateaza tokenul daca a
 * expirat) — nu e o sursa de identitate de incredere, si nici nu e folosita ca
 * atare: din token luam DOAR `session_id`, iar identitatea vine de la apelant,
 * care a obtinut-o cu `getUser()`.
 */
export async function idSesiuneCurenta(
  supabase: Pick<SupabaseClient<Database>, "auth">,
): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return claimuriDinToken(session?.access_token)?.session_id ?? null;
}

