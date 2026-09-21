import { createAdminClient } from "@/lib/supabase/admin";
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { cheieEticheta, felulEtichetei } from "@/lib/ecolet/documente";
import { citesteExpedierea, ecoletGata, eticheta, type EcoletConfig } from "@/lib/ecolet/client";
import { logError } from "@/lib/error-logger";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETA ECOLET: INTAI DIN R2, APOI DE LA EI               (mutata 21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SCOASA DIN RUTA fiindca de acum e chemata si din descarcarea in masa. A doua
 * copie a drumului asta s-ar fi despartit de prima la prima reparatie. Vezi si
 * `@/lib/gls/eticheta-sursa`.
 *
 * ⚠ Cererea catre eColet NU e periculoasa: `GET /order/{id}/download-waybill` e o
 * citire pura, care n-are cu ce sa descrie o expediere noua. (La GLS era altfel —
 * acolo a doua chemare a metodei de emitere ar fi creat un al doilea colet real.)
 *
 * ⚠ POATE FI ZPL, NU DOAR PDF. `waybill_extension` din `GET /order/{id}` spune care.
 * Servit cu tipul gresit, browserul incearca sa deschida ZPL ca PDF si arata o pagina
 * goala — un defect care pare al nostru si nu e. De aceea extensia intra si in cheia
 * din R2: cele doua feluri n-au voie sa ajunga in acelasi fisier.
 */

export type EtichetaEcolet = { octeti: Buffer; ext: string; tip: string };

/**
 * Octetii etichetei si felul ei, sau `null`.
 *
 * Se cheama DUPA ce s-a dovedit proprietatea magazinului si ca expedierea exista.
 */
export async function etichetaEcolet(
  businessId: string, orderId: string, orderIdEcolet: number,
): Promise<EtichetaEcolet | null> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("ecolet_config").eq("business_id", businessId).single();
  const config = settings?.ecolet_config as EcoletConfig | null;
  if (!ecoletGata(config)) return null;

  /*
   * ⚠ Felul etichetei se afla INAINTE de a cauta in CDN: extensia face parte din
   * cheie, deci cautand-o pe cea gresita am fi ratat mereu copia salvata si am fi
   * intrebat eColet de fiecare data.
   *
   * Citirea asta e ieftina si nu creeaza nimic; daca pica, se presupune PDF — cazul
   * obisnuit — si cel mai rau lucru care se intampla e o descarcare in plus.
   */
  let extensie = "pdf";
  try {
    const expediere = await citesteExpedierea(config, orderIdEcolet);
    extensie = felulEtichetei(expediere?.waybill_extension).ext;
  } catch {
    /* Ramane pdf. */
  }

  const { ext, tip } = felulEtichetei(extensie);
  const cheie = cheieEticheta(businessId, orderId, ext);
  let octeti = await getFromR2(cheie);

  if (!octeti) {
    try {
      const raspuns = await eticheta(config, orderIdEcolet);
      octeti = raspuns?.octeti ?? null;
    } catch (e) {
      await logError({
        action: "ecolet.eticheta",
        message: `Eticheta eColet nu s-a putut lua: ${(e as Error).message}`,
        details: { orderId, businessId, orderIdEcolet },
        businessId, severity: "warning",
      });
      octeti = null;
    }
    if (!octeti) return null;

    /* Se pune in CDN. Esecul nu opreste raspunsul: omul are deja fisierul. */
    try {
      /* ⚠ `private, no-store` EXPLICIT. Implicitul lui `uploadToR2` e
         `public, max-age=31536000, immutable`, iar eticheta poarta numele, adresa si
         telefonul cumparatorului. */
      await uploadToR2(octeti, cheie, tip, "private, no-store");
    } catch {
      /* Ramane doar mai lent data viitoare. */
    }
  }

  return { octeti, ext, tip };
}

/**
 * Numai octetii, pentru lotul de etichete.
 *
 * Citeste singura expedierea de pe comanda: lotul are randul, dar nu vrem doua
 * locuri care sa stie cum se cheama coloanele eColet.
 */
export async function etichetaEcoletPentruComanda(
  businessId: string, orderId: string,
): Promise<Uint8Array | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders").select("ecolet_order_id")
    .eq("id", orderId).eq("business_id", businessId).maybeSingle();

  const orderIdEcolet = Number((order as { ecolet_order_id?: unknown } | null)?.ecolet_order_id);
  if (!Number.isInteger(orderIdEcolet) || orderIdEcolet <= 0) return null;

  const r = await etichetaEcolet(businessId, orderId, orderIdEcolet);
  if (!r) return null;
  const b = r.octeti;
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
}
