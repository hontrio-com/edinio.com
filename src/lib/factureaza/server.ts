import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eDocumentDeTestFactureaza, factureazaGata, mediul, type FactureazaConfig } from "./config";
import { pdfFactura, type AcreditariFactureaza } from "./client";

/*
 * FARA "use server" AICI, INTENTIONAT: intr-un modul „use server” fiecare export devine un capat
 * HTTP public. Functiile de mai jos citesc configurarea cu cheia de SERVICIU dupa un `businessId`
 * primit ca argument; expuse, ar fi lasat pe oricine sa ceara PDF-urile altui magazin.
 */

/** Acreditarile, din configurarea DECRIPTATA (citita cu cheia de serviciu). */
export function acreditari(c: FactureazaConfig): AcreditariFactureaza {
  return { api_key: c.api_key, mediu: mediul(c) };
}

/**
 * Configurarea Factureaza.ro a magazinului, DECRIPTATA.
 *
 * ⚠ CU CHEIA DE SERVICIU, si numai dupa ce apelantul a dovedit dreptul asupra magazinului. Pe
 * clientul comerciantului vederea `store_settings` NU decripteaza: cheia ar fi sosit `enc.v1.…`, iar
 * Factureaza.ro ar fi raspuns 401 pentru o cheie buna (capcana care a rupt About You pe 07.08.2026).
 *
 * `null` = nu e configurata complet, sau citirea a picat. Apelantii o trateaza ca „neconectat”.
 */
export async function configurareaMagazinului(
  admin: SupabaseClient,
  businessId: string,
): Promise<FactureazaConfig | null> {
  const { data, error } = await admin
    .from("store_settings").select("factureaza_config").eq("business_id", businessId).maybeSingle();
  if (error || !data) return null;
  const c = (data as { factureaza_config?: unknown }).factureaza_config;
  return factureazaGata(c) ? c : null;
}

/** Ce i se spune cand documentul comenzii e unul de test. Aceeasi idee ca `DOCUMENT_DE_TEST`. */
export const DOCUMENT_FACTUREAZA_DE_TEST =
  "Factura comenzii a fost emisa in modul de TEST al Factureaza.ro (sandbox), deci nu e un document "
  + "fiscal. NU s-a urcat la marketplace. Treci pe Real in configurarea Factureaza.ro si emite factura "
  + "din nou.";

/**
 * PDF-ul unui document Factureaza.ro al magazinului, pentru urcarea la marketplace (cronurile eMAG
 * si Trendyol). Intoarce forma ceruta de `urcaFacturaLaEmag` / `urcaFacturaLaTrendyol`: octetii,
 * sau o eroare citibila.
 *
 * ⚠⚠ UN DOCUMENT DE TEST NU SE ADUCE NICIODATA AICI, oricare ar fi mediul de acum: chiar cu
 * integrarea inca pe Test, sandbox-ul i-ar fi dat PDF-ul fara greutate, iar el ar fi plecat la eMAG
 * drept factura fiscala. Garda e pe CHEIA documentului (vezi `config.ts`), inainte de orice cerere.
 */
export async function pdfDocumentAlMagazinului(
  admin: SupabaseClient,
  businessId: string,
  cheie: string,
): Promise<ArrayBuffer | { error: string }> {
  if (eDocumentDeTestFactureaza(cheie)) return { error: DOCUMENT_FACTUREAZA_DE_TEST };
  const config = await configurareaMagazinului(admin, businessId);
  if (!config) return { error: "Factureaza.ro nu mai e conectat la acest magazin, deci PDF-ul facturii nu se poate aduce." };
  try {
    return await pdfFactura(acreditari(config), cheie);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nu am putut aduce PDF-ul de la Factureaza.ro." };
  }
}
