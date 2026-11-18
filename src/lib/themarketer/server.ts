import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import type { TheMarketerConfig } from "./config";

/**
 * Configurarea theMarketer a magazinului, citita cu cheia de serviciu (deci DECRIPTATA: `rest_key` si
 * `cheie_feed` in clar). Numai pe server, si numai dupa ce apelantul a hotarat ca are voie.
 *
 * ⚠ O CITIRE CAZUTA ARUNCA. Nu e „nu are theMarketer”: coada trebuie sa reincerce (nu sa sara
 * evenimentul), iar o salvare din panou nu are voie sa scrie peste o configurare pe care n-a citit-o
 * (vezi „citirea cazuta rescrie tot JSON-ul”).
 */
export async function citesteConfig(businessId: string): Promise<TheMarketerConfig | null> {
  const { data, error } = await createAdminClient()
    .from("store_settings")
    .select("themarketer_config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`configurarea theMarketer nu s-a putut citi: ${error.message}`);
  const c = (data as { themarketer_config?: unknown } | null)?.themarketer_config;
  return c && typeof c === "object" ? (c as TheMarketerConfig) : null;
}

export type CampStare =
  | "citit_produse_la" | "citit_categorii_la" | "citit_branduri_la" | "citit_comenzi_la"
  | "ultim_cod_la" | "ultim_webhook_la";

/**
 * Insemneaza o clipa in `themarketer_stare` (o citire de feed, un cod, un webhook). Atinge NUMAI campul
 * dat. ⚠ Nu arunca si nu se asteapta cu miza: un marcaj nescris nu e motiv sa nu plece feedul.
 */
export async function insemneaza(businessId: string, camp: CampStare): Promise<void> {
  try {
    await createAdminClient()
      .from("themarketer_stare")
      .upsert({ business_id: businessId, [camp]: new Date().toISOString() } as never, { onConflict: "business_id" });
  } catch {
    /* Marcajul e informativ. */
  }
}

/** Scrie ultima eroare, ca panoul s-o poata arata. Nu arunca. */
export async function scrieEroarea(businessId: string, mesaj: string): Promise<void> {
  try {
    await createAdminClient()
      .from("themarketer_stare")
      .upsert(
        { business_id: businessId, ultima_eroare: mesaj.slice(0, 500), ultima_eroare_la: new Date().toISOString() } as never,
        { onConflict: "business_id" },
      );
  } catch {
    /* Jurnalul de erori o are oricum. */
  }
}

/** O eroare care trebuie sa ajunga si la om (panou), si in jurnal. */
export async function semnaleaza(businessId: string, actiune: string, mesaj: string, detalii?: Record<string, unknown>): Promise<void> {
  await scrieEroarea(businessId, mesaj);
  await logError({ action: `themarketer.${actiune}`, message: mesaj, businessId, details: detalii, severity: "warning" });
}
