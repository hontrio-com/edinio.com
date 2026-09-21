import { createAdminClient } from "@/lib/supabase/admin";
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { cheieDocument } from "@/lib/pallex/documente";
import { documentPartidei, pallexGata, type FelDocument, type PallExConfig } from "@/lib/pallex/client";
import { logError } from "@/lib/error-logger";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOCUMENTELE PALL-EX: INTAI DIN R2, APOI DE LA EI           (mutate 21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eticheta (`label`) si avizul (`note`).
 *
 * ⚠ SCOASE DIN RUTA fiindca de acum drumul e chemat si din descarcarea in masa.
 * Vezi si `@/lib/gls/eticheta-sursa`.
 *
 * ⚠ Aici, spre deosebire de GLS, cererea de la furnizor NU e periculoasa:
 * `GET /consignments/{id}/label` e o citire pura, care n-are cu ce sa descrie o
 * partida noua.
 *
 * ⚠ Documentele apar de obicei abia DUPA validarea borderoului (pasul 5 din fluxul
 * documentat de Pall-Ex). Un `null` inainte de asta nu e un defect, si de aceea
 * apelantul are un mesaj care spune ce e de facut, nu o eroare.
 */

/**
 * Documentul cerut de la Pall-Ex, cand copia din CDN lipseste.
 *
 * ⚠ Configul se citeste cu SERVICE ROLE: vederea `store_settings` nu decripteaza
 * pentru `authenticated`, deci pe clientul utilizatorului parola ar veni `enc.v1.…`
 * si Pall-Ex ar raspunde „autentificare esuata". Proprietatea magazinului se verifica
 * inainte de a se ajunge aici.
 */
async function dinPallEx(
  businessId: string, consignmentId: number, fel: FelDocument, orderId: string,
): Promise<Buffer | null> {
  try {
    const { data: settings } = await createAdminClient()
      .from("store_settings").select("pallex_config").eq("business_id", businessId).single();

    const config = settings?.pallex_config as PallExConfig | null;
    if (!pallexGata(config)) return null;

    return await documentPartidei(config, consignmentId, fel);
  } catch (e) {
    await logError({
      action: "pallex.document",
      message: `Documentul „${fel}” nu s-a putut lua de la Pall-Ex: ${(e as Error).message}`,
      details: { orderId, businessId, consignmentId, fel },
      businessId,
      severity: "warning",
    });
    return null;
  }
}

/** Documentul, din CDN daca exista, altfel de la Pall-Ex (si pus la loc in CDN). */
export async function documentPallex(
  businessId: string, orderId: string, consignmentId: number, fel: FelDocument,
): Promise<Buffer | null> {
  const cheie = cheieDocument(businessId, orderId, fel);
  const dinCdn = await getFromR2(cheie);
  if (dinCdn) return dinCdn;

  if (!Number.isInteger(consignmentId) || consignmentId <= 0) return null;

  const pdf = await dinPallEx(businessId, consignmentId, fel, orderId);
  if (!pdf) return null;

  /*
   * Se pune in CDN, ca urmatoarea descarcare sa nu mai treaca pe la Pall-Ex. Esecul
   * NU opreste raspunsul: omul are deja PDF-ul in mana.
   *
   * ⚠ `private, no-store` EXPLICIT. Implicitul lui `uploadToR2` e
   * `public, max-age=31536000, immutable`, bun pentru o poza de produs si gresit aici:
   * documentul poarta numele, adresa si telefonul cumparatorului.
   */
  try {
    await uploadToR2(pdf, cheie, "application/pdf", "private, no-store");
  } catch {
    /* Ramane doar mai lent data viitoare. */
  }
  return pdf;
}

/**
 * Numai eticheta, pentru lotul de etichete.
 *
 * ⚠ `label`, nu `note`: in document intra ce se lipeste pe colet. Avizul e alt
 * document si se ia din randul comenzii.
 */
export async function etichetaPallexPentruComanda(
  businessId: string, orderId: string,
): Promise<Uint8Array | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders").select("pallex_consignment_id")
    .eq("id", orderId).eq("business_id", businessId).maybeSingle();

  const consignmentId = Number((order as { pallex_consignment_id?: unknown } | null)?.pallex_consignment_id);
  const pdf = await documentPallex(businessId, orderId, consignmentId, "label");
  if (!pdf) return null;
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength).slice();
}
