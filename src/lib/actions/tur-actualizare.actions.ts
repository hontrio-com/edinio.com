"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Turul actualizarii a fost inchis: `announcements_seen_at` devine „acum”, ca fereastra sa nu se mai deschida singura,
 * nici pe alt dispozitiv. Utilizatorul isi scrie doar randul lui (RLS + drept pe coloana, verificat si in productie).
 *
 * ⚠ In impersonare nu scrie nimic: turul e al comerciantului, nu al adminului care se uita in locul lui. Layoutul nici
 * nu deschide fereastra atunci; aici e a doua plasa, pentru o deschidere din legatura „Ce e nou în editor”.
 */
export async function marcheazaTurulVazut(): Promise<{ ok: boolean }> {
  if ((await cookies()).get("impersonare")?.value != null) return { ok: false };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("users_profile")
    .update({ announcements_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  return { ok: !error };
}
