/**
 * Scrierea unei bucati din `emag_config`.
 *
 * ═══ ⚠ DE CE STA INTR-UN SINGUR LOC ═══
 *
 * `emag_config` e un singur `jsonb`. Scris cu obiectul mic in loc de intregul,
 * ar sterge acreditarile, harta categoriilor si toate marcajele magazinului —
 * adica l-ar deconecta, dintr-o actualizare de cursor.
 *
 * Functia exista de mult in cronul de sincronizare. Mutata aici fiindca a fost
 * nevoie de ea si la import: doua copii ale aceleiasi citiri-si-scrieri se
 * departeaza mai devreme sau mai tarziu, iar aici departarea inseamna un magazin
 * deconectat fara ca nimeni sa fi atins butonul de deconectare.
 *
 * ⚠ Nu e singura paza. `privat.pazeste_secretele` (migratia din 28.09) tine
 * parola chiar daca citirea de mai jos cade si scrierea pleaca fara ea. Aia e
 * plasa; asta e podeaua.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { EmagConfig } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export async function patchEmagConfig(
  admin: Admin, businessId: string, patch: Partial<EmagConfig>,
): Promise<void> {
  const { data } = await admin.from("store_settings")
    .select("emag_config").eq("business_id", businessId).maybeSingle();
  const config = ((data?.emag_config as EmagConfig) ?? {}) || {};
  await admin.from("store_settings")
    .update({ emag_config: { ...config, ...patch } as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
}
