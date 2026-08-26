import type { SupabaseClient } from "@supabase/supabase-js";
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
  const { data: ss } = await admin.from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  await admin.from("store_settings")
    .update({ aboutyou_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
}
