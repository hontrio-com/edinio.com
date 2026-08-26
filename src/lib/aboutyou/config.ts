import type { SupabaseClient } from "@supabase/supabase-js";
import { randCitit } from "@/lib/supabase/rand-citit";
import type { Database, Json } from "@/types/database.types";
import type { AboutYouConfig } from "./types";

type Db = SupabaseClient<Database>;

/**
 * Scrie un petic peste configurarea About You a magazinului.
 *
 * ⚠ MUTATA AICI DIN CRON PE 26.08.2026, cand a fost nevoie de ea si din `sync.ts` (cursorul de
 * reconciliere). Scrisa a doua oara, cele doua s-ar fi despartit la prima schimbare — chiar
 * tiparul care a lasat cinci cozi cu apararea pusa pe doua.
 */
export async function patchAboutYouConfig(admin: Db, businessId: string, patch: Partial<AboutYouConfig>) {
  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "aboutyou_config",
    // `AboutYouConfig` e jsonb valid, dar tipul lui nu are semnatura de index.
    p_patch: patch as unknown as Json,
  });
  if (!error) return;
  // Cadere de siguranta daca functia lipseste inca din baza.
  /*
   * ⚠ STRICT, si aici mai mult ca oriunde: calea asta face CITESTE-MODIFICA-SCRIE. Inghitita,
   * o citire picata dadea `{}`, iar scrierea de dedesubt ar fi pus peste configul intreg un
   * obiect din care lipseste TOT — cheia API, secretul de webhook, nomenclatoarele. Adica
   * deconectarea magazinului, dintr-o clipa proasta a bazei.
   */
  const ss = randCitit<{ aboutyou_config: unknown }>("aboutyou.configDeCarpit", await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single());
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  const { error: eScriere } = await admin.from("store_settings")
    .update({ aboutyou_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
  if (eScriere) throw new Error(`configul About You nu s-a putut scrie: ${eScriere.message}`);
}
