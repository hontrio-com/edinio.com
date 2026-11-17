import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { easybillGata, type EasybillConfig } from "./config";
import { pdfFactura, type AcreditariEasybill } from "./client";

/*
 * FARA "use server" AICI, INTENTIONAT: intr-un modul „use server” fiecare export devine un capat
 * HTTP public. Functiile de mai jos citesc configurarea cu cheia de SERVICIU dupa un `businessId`
 * primit ca argument; expuse, ar fi lasat pe oricine sa ceara PDF-urile altui magazin.
 */

/** Acreditarile, din configurarea DECRIPTATA (citita cu cheia de serviciu). */
export function acreditari(c: EasybillConfig): AcreditariEasybill {
  return { username: c.username, password: c.password };
}

/**
 * Configurarea easybill a magazinului, DECRIPTATA.
 *
 * ⚠ CU CHEIA DE SERVICIU, si numai dupa ce apelantul a dovedit dreptul asupra magazinului. Pe
 * clientul comerciantului vederea `store_settings` NU decripteaza: parola ar fi sosit `enc.v1.…`,
 * iar easybill ar fi raspuns „utilizator sau parola gresite” pentru o parola buna.
 *
 * `null` = nu e configurata complet, sau citirea a picat. Apelantii o trateaza ca „neconectat”.
 */
export async function configurareaMagazinului(
  admin: SupabaseClient,
  businessId: string,
): Promise<EasybillConfig | null> {
  const { data, error } = await admin
    .from("store_settings").select("easybill_config").eq("business_id", businessId).maybeSingle();
  if (error || !data) return null;
  const c = (data as { easybill_config?: unknown }).easybill_config;
  return easybillGata(c) ? c : null;
}

/**
 * PDF-ul unui document easybill al magazinului, pentru urcarea la marketplace si contul
 * cumparatorului.
 *
 * Intoarce forma ceruta de `urcaFacturaLaEmag` / `urcaFacturaLaTrendyol`: octetii, sau o eroare
 * citibila. Verificarea `%PDF-` se face oricum si acolo; aici, in `pdfFactura`.
 */
export async function pdfDocumentAlMagazinului(
  admin: SupabaseClient,
  businessId: string,
  cheie: string,
): Promise<ArrayBuffer | { error: string }> {
  const config = await configurareaMagazinului(admin, businessId);
  if (!config) return { error: "easybill nu mai e conectat la acest magazin, deci PDF-ul facturii nu se poate aduce." };
  try {
    return await pdfFactura(acreditari(config), cheie);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nu am putut aduce PDF-ul de la easybill." };
  }
}
