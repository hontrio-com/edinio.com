import type { SupabaseClient } from "@supabase/supabase-js";
import { randCitit } from "@/lib/supabase/rand-citit";
import type { Database, Json } from "@/types/database.types";
import type { OlxConfig } from "./types";

type Db = SupabaseClient<Database>;

/**
 * Scrie un petic peste configurarea OLX a magazinului.
 *
 * ═══ ⚠ CITESTE-MODIFICA-SCRIE PIERDEA SCRIERI CONCURENTE (29.08.2026, noaptea) ═══
 *
 * OLX era singura integrare din cele cinci care nu folosea `jsonb_merge_config`: si cronul, si
 * actiunile, si reimprospatarea tokenului citeau configul intreg, il modificau in memorie si il
 * scriau inapoi. Doua scrieri care se suprapun se calca:
 *
 *     A citeste configul (are refresh token R1)
 *     B reimprospateaza tokenul si scrie R2
 *     A salveaza numarul de telefon — si rescrie TOT configul, cu R1
 *     -> R2 e pierdut, iar conexiunea OLX moare la urmatoarea reimprospatare
 *
 * Cel mai scump e chiar tokenul, fiindca el se roteste: pierdut, nu se mai poate recupera decat
 * printr-o reconectare de mana.
 *
 * ⚠ `jsonb_merge_config` face imbinarea IN BAZA, deci nimeni nu mai citeste ca sa scrie.
 */
export async function patchOlxConfig(admin: Db, businessId: string, patch: Partial<OlxConfig>): Promise<void> {
  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "olx_config",
    /* `OlxConfig` e jsonb valid, dar tipul lui n-are semnatura de index. */
    p_patch: patch as unknown as Json,
  });
  if (!error) return;

  /*
   * ⚠ STRICT, si aici mai mult ca oriunde: calea asta face chiar CITESTE-MODIFICA-SCRIE. Inghitita,
   * o citire picata dadea `{}`, iar scrierea de dedesubt ar fi pus peste configul intreg un obiect
   * din care lipseste TOT — tokenul, maparea de categorii, setarile. Adica deconectarea
   * magazinului, dintr-o clipa proasta a bazei.
   */
  const ss = randCitit<{ olx_config: unknown }>("olx.configDeCarpit", await admin
    .from("store_settings").select("olx_config").eq("business_id", businessId).single());
  const config = (ss?.olx_config as OlxConfig) ?? {};
  const { error: eScriere } = await admin.from("store_settings")
    .update({ olx_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
  if (eScriere) throw new Error(`configul OLX nu s-a putut scrie: ${eScriere.message}`);
}
