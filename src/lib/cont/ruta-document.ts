import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "./magazinul-cererii";
import { sesiuneCurenta } from "./sesiune";
import { comandaMea } from "./comenzi";
import { aducePdf, numeleFisierului, type MotivEsec, type SursaPdf } from "./pdf-document";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SmartbillConfig } from "@/lib/smartbill";
import { logError } from "@/lib/error-logger";

/**
 * Raspunsul comun al celor doua rute de document: factura si stornarea ei.
 *
 * ⚠ O SINGURA POARTA pentru amandoua. Scrisa de doua ori, s-ar fi despartit la
 * prima schimbare, iar stornarea ar fi ramas cu o regula de proprietate mai
 * slaba decat factura.
 *
 * ⚠⚠ PROPRIETATEA SE DOVEDESTE PRIN CHIAR FUNCTIA CARE O APARA PE ECRAN
 * (`comandaMea`), si abia DUPA aceea se citeste randul comenzii, numai coloanele
 * de document. Tot `comandaMea` spune care e documentul viu si daca e de test
 * (regula e in baza), deci ruta nu are a doua regula.
 *
 * ⚠ Esecurile raspund cu `{ motiv }` in JSON, nu cu text: butonul le citeste si
 * spune omului ce s-a intamplat, pe pagina magazinului. Inainte, omul ajungea pe
 * o pagina alba cu o fraza.
 */

const STATUS: Record<MotivEsec, number> = {
  fara_document: 404,
  document_de_test: 404,
  casa_neconectata: 409,
  furnizor_indisponibil: 502,
  nu_e_pdf: 502,
  prea_mare: 502,
};

function esec(motiv: MotivEsec) {
  return NextResponse.json({ motiv }, { status: STATUS[motiv], headers: { "Cache-Control": "private, no-store" } });
}

export async function servesteDocumentul(
  req: NextRequest,
  orderId: string,
  fel: "factura" | "storno",
): Promise<NextResponse> {
  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/factura", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ motiv: "furnizor_indisponibil" }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id);
  if (!s) return new NextResponse("Not found", { status: 404 });

  const c = await comandaMea(magazin.id, s.contId, orderId);
  if (!c || c.vedere !== "intreaga" || !c.factura) return esec("fara_document");
  const doc = c.factura;
  if (fel === "storno" && !(doc.stornata && doc.stornoDescarcabil)) return esec("fara_document");

  const admin = createAdminClient();
  const { data: rand } = await admin
    .from("orders")
    .select("smartbill_invoice_series, smartbill_invoice_number, smartbill_storno_series, smartbill_storno_number, oblio_invoice_link, oblio_storno_link, fgo_invoice_link")
    .eq("id", orderId)
    .eq("business_id", magazin.id)
    .single();
  if (!rand) return esec("fara_document");

  let sursa: SursaPdf;
  if (doc.casa === "smartbill") {
    const { data: setari } = await admin
      .from("store_settings").select("smartbill_config").eq("business_id", magazin.id).single();
    const config = setari?.smartbill_config as SmartbillConfig | null;
    /* ⚠ Aceeasi conditie ca ruta panoului: integrarea stinsa nu mai aduce nimic. */
    if (!config?.enabled) {
      await jurnal(magazin.id, orderId, fel, "casa_neconectata");
      return esec("casa_neconectata");
    }
    sursa = {
      fel: "smartbill",
      email: config.email ?? "",
      token: config.token ?? "",
      cif: config.company_vat_code ?? "",
      serie: (fel === "factura" ? rand.smartbill_invoice_series : rand.smartbill_storno_series) ?? "",
      numar: (fel === "factura" ? rand.smartbill_invoice_number : rand.smartbill_storno_number) ?? "",
    };
  } else if (doc.casa === "oblio") {
    sursa = { fel: "link", adresa: (fel === "factura" ? rand.oblio_invoice_link : rand.oblio_storno_link) ?? "" };
  } else {
    /* fGO nu pastreaza link pentru stornare; `stornoDescarcabil` e deja fals. */
    sursa = { fel: "link", adresa: rand.fgo_invoice_link ?? "" };
  }

  let rez;
  try {
    rez = await aducePdf(sursa);
  } catch (e) {
    await logError({
      action: "cont/factura",
      message: `aducerea documentului a aruncat: ${String(e)}`,
      businessId: magazin.id,
      details: { orderId, fel, casa: doc.casa },
      severity: "error",
    });
    return esec("furnizor_indisponibil");
  }
  if (!rez.ok) {
    await jurnal(magazin.id, orderId, fel, rez.motiv, doc.casa);
    return esec(rez.motiv);
  }

  const nume = fel === "factura"
    ? numeleFisierului("factura", doc.serie, doc.numar)
    : numeleFisierului("storno", doc.stornoSerie, doc.stornoNumar);

  return new NextResponse(rez.octeti, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nume}"`,
      /* ⚠ Niciodata in vreun cache: e un document cu numele si adresa omului. */
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * ⚠ FIECARE esec se scrie, nu doar exceptiile. Inainte, ramurile 409 si 502
 * taceau: comerciantul n-ar fi aflat niciodata ca cumparatorii nu-si pot lua
 * facturile. Fara date personale: doar magazinul, comanda si motivul.
 */
async function jurnal(businessId: string, orderId: string, fel: string, motiv: MotivEsec, casa?: string) {
  await logError({
    action: "cont/factura",
    message: `documentul nu s-a putut da cumparatorului: ${motiv}`,
    businessId,
    details: { orderId, fel, motiv, casa: casa ?? null },
    severity: "warning",
  });
}
