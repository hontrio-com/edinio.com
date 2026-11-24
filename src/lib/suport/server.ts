import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { citesteSuport, type SuportConfig } from "./config";

/**
 * Configurarea chatului de suport a magazinului, citita cu cheia de serviciu (deci DECRIPTATA: cele trei
 * secrete in clar). Numai pe server, si numai dupa ce apelantul a hotarat ca are voie.
 *
 * ⚠ O CITIRE CAZUTA ARUNCA. Nu e „nu are chat”: o salvare din panou nu are voie sa scrie peste o
 * configurare pe care n-a citit-o (vezi „citirea cazuta rescrie tot JSON-ul”), iar ruta de identitate
 * trebuie sa raspunda „nu stiu”, nu sa semneze cu un secret gol.
 *
 * `null` = magazinul nu are inca nicio configurare de chat.
 */
export async function citesteSuportDinBaza(businessId: string): Promise<SuportConfig | null> {
  const { data, error } = await createAdminClient()
    .from("store_settings")
    .select("suport_config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`configurarea chatului nu s-a putut citi: ${error.message}`);
  const brut = (data as { suport_config?: unknown } | null)?.suport_config;
  return brut && typeof brut === "object" ? citesteSuport(brut) : null;
}
