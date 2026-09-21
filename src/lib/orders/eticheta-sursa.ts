import { createAdminClient } from "@/lib/supabase/admin";
import { getWootToken, getOrderAwb, type WootConfig } from "@/lib/woot";
import { getCargusAwbPdf, type CargusConfig } from "@/lib/cargus";
import { getSamedayAwbLabel, type SamedayConfig } from "@/lib/sameday/client";
import { configPentruAwbEmis, getFanCourierAwbLabel, type FanCourierConfig } from "@/lib/fancourier";
import { getDpdAwbPdf, type DpdConfig } from "@/lib/dpd";
import { getCOToken, getCOOrderAwb, type COConfig } from "@/lib/colete";
import { getDhlEtichetaAction } from "@/lib/actions/dhl.actions";
import { getFedexEtichetaAction } from "@/lib/actions/fedex.actions";
import { getUpsEtichetaAction } from "@/lib/actions/ups.actions";
import { getShipoEtichetaAction } from "@/lib/actions/shipo.actions";
import { getSmartshipLabelAction } from "@/lib/actions/smartship.actions";
import { getPacketaLabelAction } from "@/lib/actions/packeta.actions";
import { getInnoshipLabelAction } from "@/lib/actions/innoship.actions";
import { etichetaGlsPentruComanda } from "@/lib/gls/eticheta-sursa";
import { etichetaEcoletPentruComanda } from "@/lib/ecolet/eticheta-sursa";
import { etichetaPallexPentruComanda } from "@/lib/pallex/eticheta-sursa";
import { NUMELE_CURIERULUI, NU_INTRA_IN_DOCUMENT, type CurierEticheta } from "./etichete-lot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OCTETII UNEI ETICHETE, DE LA ORICARE DINTRE CEI SAISPREZECE   (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un singur loc care stie „cum se cere eticheta comenzii asteia". Pana acum stia
 * fiecare ruta in parte, si numai pentru curierul ei.
 *
 * ⚠ NU SE CHEAMA RUTELE, SI NU SE COPIAZA CE FAC ELE. Cele sase drumuri simple merg
 * la aceeasi functie de biblioteca pe care o cheama si ruta; cele sapte cu actiune
 * proprie cheama CHIAR actiunea pe care o apasa omul in fereastra; iar cele trei cu
 * copie in CDN (GLS, eColet, Pall-Ex) si-au mutat ajutorul din ruta intr-un fisier de
 * biblioteca, pe care il folosesc acum si ruta, si lotul. Asa nu exista nicaieri doua
 * socoteli care se pot departa una de alta.
 *
 * ⚠ CE E PDF SE HOTARASTE DIN OCTETI, NU DIN CE SPUNE CURIERUL. UPS trimite GIF, GLS
 * si eColet pot trimite ZPL, iar un curier picat trimite o pagina HTML de eroare cu
 * `Content-Type: application/pdf`. Lipita in document, aia ar fi dat un fisier stricat
 * sau o pagina goala — iar o pagina goala se vede abia la imprimanta, cu coletul pe
 * masa. Deci se citesc primii patru octeti, si atat.
 */

/** Semnatura unui PDF adevarat. Aceeasi regula ca in `raspuns-eticheta.ts`. */
const SEMNATURA_PDF = [0x25, 0x50, 0x44, 0x46] as const;

export function ePdf(octeti: Uint8Array): boolean {
  if (octeti.byteLength < SEMNATURA_PDF.length) return false;
  for (let i = 0; i < SEMNATURA_PDF.length; i++) if (octeti[i] !== SEMNATURA_PDF[i]) return false;
  return true;
}

export type Eticheta =
  | { ok: true; octeti: Uint8Array }
  | { ok: false; motiv: string };

/** Base64 → octeti, fara sa arunce pe un sir stricat. */
function dinBase64(b64: string | null | undefined): Uint8Array | null {
  if (!b64 || typeof b64 !== "string") return null;
  try {
    const b = Buffer.from(b64, "base64");
    return b.byteLength > 0 ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice() : null;
  } catch { return null; }
}

/** Buffer/ArrayBuffer → octetii EXACTI ai documentului, nu blocul din spate. */
function octetiiExacti(continut: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  /*
   * ⚠ Niciodata `vedere.buffer`: un `Buffer` din Node e o vedere peste un bloc comun,
   * si `.buffer` ar da blocul intreg. Exact defectul masurat pe patru rute in
   * 09.09.2026 (PDF de 34 de octeti servit dintr-un bloc de 8192). Vezi
   * `raspuns-eticheta.ts`.
   */
  return ArrayBuffer.isView(continut)
    ? new Uint8Array(continut.buffer, continut.byteOffset, continut.byteLength).slice()
    : new Uint8Array(continut);
}

/** Configul magazinului, citit O SINGURA DATA pentru tot lotul. */
export type SetariCurieri = Record<string, unknown>;

export const COLOANELE_DE_CONFIG =
  "woot_config, cargus_config, sameday_config, fan_courier_config, dpd_config, colete_config";

export async function setarileCurierilor(businessId: string): Promise<SetariCurieri> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings").select(COLOANELE_DE_CONFIG)
    .eq("business_id", businessId).maybeSingle();
  return (data ?? {}) as SetariCurieri;
}

/**
 * Eticheta unei comenzi, de la curierul care o tine.
 *
 * @param comanda randul comenzii, cu coloanele de expediere deja citite
 * @param format A4 sau eticheta mica; cine nu stie decat una o da pe aceea
 */
export async function etichetaComenzii(
  businessId: string,
  comanda: Record<string, unknown>,
  curier: CurierEticheta,
  format: "A4" | "A6",
  setari: SetariCurieri,
): Promise<Eticheta> {
  /* ⚠ Cei stiuti dinainte ca nu dau PDF se opresc AICI, fara sa se mai ceara nimic de
     la curier: o cerere al carei raspuns oricum nu poate fi folosit costa timp din
     bugetul lotului si un apel din pragul de rata al curierului. */
  const stiutDinainte = NU_INTRA_IN_DOCUMENT[curier];
  if (stiutDinainte) return { ok: false, motiv: stiutDinainte };

  const orderId = String(comanda.id ?? "");

  try {
    const octeti = await adu(businessId, orderId, comanda, curier, format, setari);
    if (!octeti) {
      return { ok: false, motiv: `${NUMELE_CURIERULUI[curier]} nu a întors nicio etichetă pentru comanda asta.` };
    }
    if (!ePdf(octeti)) {
      /* Vezi nota din capul fisierului: se judeca din octeti, nu din declaratii. */
      return {
        ok: false,
        motiv: `Eticheta de la ${NUMELE_CURIERULUI[curier]} nu e un PDF, deci nu poate intra în documentul lipit. `
          + "Descarc-o din rândul comenzii.",
      };
    }
    return { ok: true, octeti };
  } catch (e) {
    return { ok: false, motiv: `${NUMELE_CURIERULUI[curier]}: ${(e as Error).message}` };
  }
}

/* ── Drumul fiecarui curier ─────────────────────────────────────────────── */

async function adu(
  businessId: string,
  orderId: string,
  comanda: Record<string, unknown>,
  curier: CurierEticheta,
  format: "A4" | "A6",
  setari: SetariCurieri,
): Promise<Uint8Array | null> {
  const sir = (cheie: string): string => String(comanda[cheie] ?? "").trim();

  switch (curier) {
    /* ── Cele care merg direct la biblioteca curierului ─────────────────── */

    case "woot": {
      const c = setari.woot_config as WootConfig | null;
      if (!c?.public_key || !c?.secret_key) return null;
      const token = await getWootToken(c.public_key, c.secret_key);
      const { pdf } = await getOrderAwb(token, Number(sir("woot_order_id")), format);
      return dinBase64(pdf);
    }

    case "cargus": {
      const c = setari.cargus_config as CargusConfig | null;
      if (!c?.enabled) return null;
      /* La ei `0` e A4 si `1` e eticheta de 10x14. */
      return octetiiExacti(await getCargusAwbPdf(c, sir("cargus_awb_number"), format === "A4" ? 0 : 1));
    }

    case "sameday": {
      const c = setari.sameday_config as SamedayConfig | null;
      if (!c?.enabled) return null;
      return octetiiExacti(await getSamedayAwbLabel(c, sir("sameday_awb_number"), format));
    }

    case "fancourier": {
      const c = setari.fan_courier_config as FanCourierConfig | null;
      if (!c?.enabled) return null;
      /*
       * ⚠ Pe SUCURSALA CU CARE S-A EMIS, nu pe cea de acum: dupa o schimbare de
       * sucursala, contul curent nu mai recunoaste AWB-urile vechi si eticheta nu se
       * mai poate scoate. Aceeasi regula ca in ruta de eticheta FAN.
       */
      const clientId = comanda.fan_courier_awb_client_id as number | null | undefined;
      return octetiiExacti(await getFanCourierAwbLabel(
        configPentruAwbEmis(c, clientId ?? null), sir("fan_courier_awb_number"),
      ));
    }

    case "dpd": {
      const c = setari.dpd_config as DpdConfig | null;
      if (!c?.enabled) return null;
      return octetiiExacti(await getDpdAwbPdf(c, sir("dpd_awb_number"), format));
    }

    case "colete": {
      const c = setari.colete_config as COConfig | null;
      if (!c?.client_id || !c?.client_secret) return null;
      const token = await getCOToken(c.client_id, c.client_secret);
      return octetiiExacti(await getCOOrderAwb(token, c.sandbox ?? false, sir("colete_order_id"), format));
    }

    /* ── Cele cu copie in CDN, prin ajutorul comun cu ruta lor ──────────── */

    case "gls": return await etichetaGlsPentruComanda(businessId, orderId);
    case "ecolet": return await etichetaEcoletPentruComanda(businessId, orderId);
    case "pallex": return await etichetaPallexPentruComanda(businessId, orderId);

    /* ── Cele care au deja o actiune proprie, chemata de fereastra ──────── */

    case "dhl": {
      const r = await getDhlEtichetaAction(businessId, orderId);
      return r.ok ? dinBase64(r.base64) : null;
    }
    case "fedex": {
      const r = await getFedexEtichetaAction(businessId, orderId);
      return r.ok ? dinBase64(r.base64) : null;
    }
    case "ups": {
      /* Nu se ajunge aici: UPS e oprit mai sus, eticheta lui e GIF. Ramane pentru
         ziua in care vor da si PDF, ca sa nu fie nevoie de doua modificari. */
      const r = await getUpsEtichetaAction(businessId, orderId);
      return r.ok ? dinBase64(r.base64) : null;
    }
    case "shipo": {
      const r = await getShipoEtichetaAction(businessId, orderId);
      return r.ok ? dinBase64(r.base64) : null;
    }
    case "smartship": {
      const r = await getSmartshipLabelAction(businessId, orderId);
      return r.ok ? dinBase64(r.pdfBase64) : null;
    }
    case "packeta": {
      const r = await getPacketaLabelAction(businessId, orderId);
      return "error" in r ? null : dinBase64(r.pdf);
    }
    case "innoship": {
      const r = await getInnoshipLabelAction(businessId, orderId);
      /*
       * ⚠ Innoship da o LISTA de etichete (cate una pe colet), nu una singura. Se ia
       * prima: documentul lipit are o pagina pe comanda, iar celelalte colete se scot
       * din randul comenzii. Altfel numarul de pagini n-ar mai fi numarul de comenzi,
       * si nimeni n-ar sti ce lipseste.
       */
      return r.ok ? dinBase64(r.etichete?.[0]) : null;
    }
  }
}
