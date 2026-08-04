import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";

/**
 * Valoarea reala a unui camp secret, pentru actiunile pornite din formular.
 *
 * DE CE EXISTA. De cand configuratiile pleaca spre browser MASCATE (vezi
 * `mascheazaConfig`), formularul nu mai are parola sau tokenul. Salvarea e
 * acoperita — `pastreazaSecretele` pastreaza valoarea veche cand primeste gol.
 * Dar pasii care VORBESC cu furnizorul pornind de la ce e in formular —
 * „conecteaza-te si adu-mi punctele de ridicare", „testeaza conexiunea" — ar
 * trimite sirul gol si ar primi „credentiale invalide". Comerciantul vede o
 * integrare aparent stricata, desi totul e salvat corect.
 *
 * Regula: ce vine de la client are intaietate (asa se poate TESTA o credentiala
 * noua inainte de a o salva); cand vine gol, cadem pe cea din baza.
 *
 * Proprietatea se verifica de fiecare data cu clientul utilizatorului, deci
 * nimeni nu poate citi secretul altui magazin trimitand alt `businessId`.
 * Intoarce sirul gol la orice esec — apelantul trateaza asta ca „lipseste".
 */
export async function secretDinConfig(
  businessId: string,
  cheieConfig: keyof typeof CAMPURI_SECRETE & string,
  camp: string,
  primitDeLaClient?: string,
): Promise<string> {
  const dinFormular = (primitDeLaClient ?? "").trim();
  if (dinFormular) return dinFormular;
  if (!businessId) return "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return "";

  const { data, error } = await supabase
    .from("store_settings").select(cheieConfig).eq("business_id", businessId).single();
  // `error` verificat explicit: fara el, un refuz de citire (drept revocat,
  // cache PostgREST vechi) ar arata identic cu „nu exista credentiala salvata",
  // iar comerciantul ar primi mesajul gresit. Vezi incidentul MFA din 04.08.2026.
  if (error || !data) return "";

  const config = (data as unknown as Record<string, unknown>)[cheieConfig];
  if (!config || typeof config !== "object") return "";
  const valoare = (config as Record<string, unknown>)[camp];
  return typeof valoare === "string" ? valoare.trim() : "";
}
