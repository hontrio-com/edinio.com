"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randCitit } from "@/lib/supabase/rand-citit";
import type { Json } from "@/types/database.types";
import { gpsrLipsuri, type GpsrConfig, type GpsrDate } from "@/lib/gpsr";

/*
 * ⚠ FIECARE EXPORT DINTR-UN MODUL "use server" E UN ENDPOINT PUBLIC. De-aia aici sunt doar cele
 * doua actiuni, si amandoua isi verifica intai omul; ajutoarele pure stau in `src/lib/gpsr`.
 */

async function guard(businessId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu ești autentificat." };
  const { data, error } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou." };
  if (!data) return { error: "Magazin negăsit." };
  return { ok: true };
}

/**
 * Producatorul si persoana responsabila din UE, pentru tot catalogul.
 *
 * ⚠ NU E O SETARE DE OLX, desi de acolo se ajunge azi la ea: acelasi lucru il cer si eMAG, si
 * About You. De-aia sta intr-o coloana a ei, nu in `olx_config` — mutata mai tarziu, ar fi trebuit
 * migrata din trei locuri.
 */
export async function loadGpsrConfig(businessId: string): Promise<GpsrConfig | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  /* ⚠ Strict: o pana citita ca „gol" l-ar pune pe om sa completeze din nou ce a scris deja. */
  const rand = randCitit<{ gpsr_config: unknown }>("gpsr.config", await admin
    .from("store_settings").select("gpsr_config").eq("business_id", businessId).maybeSingle());
  return ((rand?.gpsr_config as GpsrConfig) ?? {});
}

export async function saveGpsrConfig(
  businessId: string, input: GpsrConfig,
): Promise<{ success: true; lipsuri: string[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  /*
   * ⚠ SE CURATA AICI, NU IN ECRAN. O actiune de server se poate chema cu orice, printr-un POST
   * direct — iar de-aici pleaca o declaratie LEGALA catre marketplace-uri.
   */
  const persoana = (p: unknown) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const camp = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, 300) : "");
    /* ⚠ `country` e cerut de OLX si se aduce la forma lor: doua litere mari. */
    const tara = camp("country").toUpperCase().slice(0, 2);
    const out = {
      name: camp("name"), country: tara,
      address: camp("address"), email: camp("email"), phone: camp("phone"),
    };
    return Object.values(out).some((x) => x !== "") ? out : undefined;
  };
  const curat: GpsrConfig = {
    manufacturer: persoana(input.manufacturer),
    contact_person: persoana(input.contact_person),
    warning_and_safety: (input.warning_and_safety ?? "").trim().slice(0, 2000) || undefined,
  };

  const admin = createAdminClient();
  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "gpsr_config",
    p_patch: curat as unknown as Json,
  });
  if (error) return { error: `Nu am putut salva datele de siguranță: ${error.message}` };

  revalidatePath("/dashboard/features/olx");
  revalidatePath("/dashboard/products");
  /*
   * ⚠ SE INTORC SI LIPSURILE, ca omul sa afle ACUM ce mai trebuie — nu din refuzul furnizorului,
   * peste doua zile, intr-un mesaj scris de ei.
   */
  return { success: true, lipsuri: gpsrLipsuri(curat as GpsrDate) };
}
