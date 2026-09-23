import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { comandaMea } from "@/lib/cont/comenzi";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteChiarPdf, eDocumentDeTest } from "@/lib/billing/factura-comenzii";
import { fetchMerchantPdf, getMerchantInvoicePdfUrl, type SmartbillConfig } from "@/lib/smartbill";
import { logError } from "@/lib/error-logger";

/**
 * Factura unei comenzi, pentru CUMPARATOR.
 *
 * ⚠⚠ EDINIO NU GAZDUIESTE NICIUN DOCUMENT FISCAL. Cele trei case emit la ele, iar
 * pe randul comenzii raman seria, numarul si, cand furnizorul o da, o adresa
 * catre documentul LOR. Deci PDF-ul se aduce viu, la fiecare cerere, pe server.
 *
 * ⚠⚠ SI NU SE FOLOSESTE `facturaComenzii()`. Ajutorul acela cere si numarul, si
 * adresa, iar `smartbill_invoice_url` e GOL la toate cele 286 de facturi emise
 * vreodata in productie: pentru SmartBill ar fi intors `null` la tot istoricul.
 * Adresa se compune din CIF plus serie plus numar, ca in ruta panoului.
 *
 * ⚠⚠ TREI GARZI PE OCTETII VENITI, si niciuna nu e optionala:
 *   1. `esteChiarPdf` - o adresa care cere autentificare nu raspunde cu eroare,
 *      raspunde 200 cu pagina de login. `fetchMerchantPdf` NU verifica nimic:
 *      intoarce ce a venit. Nici ruta panoului nu verifica; aici nu se poate.
 *   2. `eDocumentDeTest` - un PDF de sandbox fGO e valid si are numar si serie,
 *      deci prima garda nu-l prinde. Se recunoaste din LINK, nu din configurarea
 *      de acum: magazinul poate fi trecut pe productie dupa ce a emis in test.
 *   3. `vedere` - o comanda legata doar pe numarul ei nu deschide factura.
 *
 * ⚠ Catre om nu pleaca NICIODATA adresa furnizorului, ci numai octetii, cu
 * `no-store`. SmartBill intoarce doua adrese cu regimuri opuse si cea de editare
 * e o pagina de login.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/factura", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return new NextResponse("Serviciu indisponibil temporar", { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id);
  if (!s) return new NextResponse("Not found", { status: 404 });

  /*
    ⚠ PROPRIETATEA SE DOVEDESTE PRIN CHIAR FUNCTIA CARE O APARA PE ECRAN. O
    citire separata „dupa order_id" ar fi fost a doua regula, si s-ar fi despartit
    de prima.
  */
  const c = await comandaMea(magazin.id, s.contId, orderId);
  if (!c || c.vedere !== "intreaga" || !c.factura) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();

  /*
    ⚠ Abia ACUM se citeste randul comenzii, si numai coloanele de factura. Pana
    aici nu s-a atins nimic din `orders`: proprietatea a fost dovedita intai.
  */
  const { data: rand } = await admin
    .from("orders")
    .select("smartbill_invoice_series, smartbill_invoice_number, oblio_invoice_link, fgo_invoice_link")
    .eq("id", orderId)
    .eq("business_id", magazin.id)
    .single();
  if (!rand) return new NextResponse("Not found", { status: 404 });

  let octeti: ArrayBuffer | null = null;
  let adresa = "";

  try {
    if (c.factura.casa === "smartbill") {
      const { data: setari } = await admin
        .from("store_settings").select("smartbill_config").eq("business_id", magazin.id).single();
      const config = setari?.smartbill_config as SmartbillConfig | null;
      if (!config?.email || !config.token || !config.company_vat_code) {
        return new NextResponse("Factura nu se poate descarca acum.", { status: 409 });
      }
      if (!rand.smartbill_invoice_series || !rand.smartbill_invoice_number) {
        return new NextResponse("Not found", { status: 404 });
      }
      adresa = getMerchantInvoicePdfUrl(config.company_vat_code, rand.smartbill_invoice_series, rand.smartbill_invoice_number);
      const rez = await fetchMerchantPdf(config, adresa);
      if ("error" in rez) return new NextResponse("Factura nu se poate descarca acum.", { status: 502 });
      octeti = rez;
    } else {
      /*
        Oblio si fGO pastreaza o adresa pe rand. Se aduce tot de pe SERVER, ca sa
        nu ajunga niciodata la om, si trece prin aceleasi garzi: `link` al lui
        Oblio pare public (are jeton in interogare), dar documentatia lor nu o
        spune, iar pe productie sunt zece documente cu totul.
      */
      adresa = (c.factura.casa === "oblio" ? rand.oblio_invoice_link : rand.fgo_invoice_link) ?? "";
      if (!adresa) return new NextResponse("Not found", { status: 404 });
      const raspuns = await fetch(adresa, { cache: "no-store" });
      if (!raspuns.ok) return new NextResponse("Factura nu se poate descarca acum.", { status: 502 });
      octeti = await raspuns.arrayBuffer();
    }
  } catch (e) {
    await logError({
      action: "cont/factura",
      message: `aducerea facturii a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return new NextResponse("Factura nu se poate descarca acum.", { status: 502 });
  }

  if (eDocumentDeTest(adresa)) {
    /* ⚠ Un document de sandbox arata ca unul fiscal si trece de garda de PDF.
       Nu are ce cauta in mana cumparatorului. */
    return new NextResponse("Factura nu se poate descarca acum.", { status: 409 });
  }
  if (!octeti || !esteChiarPdf(octeti)) {
    return new NextResponse("Factura nu se poate descarca acum.", { status: 502 });
  }

  /* ⚠ Numele se curata inainte sa intre intr-un ANTET, ca in ruta panoului. */
  const numeSigur = `Factura_${[c.factura.serie, c.factura.numar].filter(Boolean).join("")}.pdf`
    .replace(/[^A-Za-z0-9._-]/g, "_");

  return new NextResponse(octeti, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${numeSigur}"`,
      /* ⚠ Niciodata in vreun cache: e un document cu numele si adresa omului. */
      "Cache-Control": "private, no-store",
    },
  });
}
