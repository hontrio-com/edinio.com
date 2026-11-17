import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuzaDacaMfaNeconfirmat } from "@/lib/auth/cere-mfa";
import { pdfFactura } from "@/lib/easybill/client";
import { acreditari, configurareaMagazinului } from "@/lib/easybill/server";

/**
 * PDF-ul unui document easybill (factura sau stornarea legata de comanda), pentru comerciant.
 *
 * ⚠ PRIN NOI, NU PRIN EI. easybill da PDF-ul numai pe API, cu sesiunea contului
 * (`downloadInvoice_fct`); nu exista o adresa a documentului pe care s-o deschida browserul. Ruta
 * dovedeste proprietarul, citeste configurarea cu cheia de serviciu si aduce octetii.
 *
 * ⚠ GARZILE, in ordine: sesiunea, poarta MFA (al doilea strat; primul e in proxy: e un document
 * fiscal cu datele cumparatorului), proprietarul comenzii, apoi configurarea. Marimea si antetul
 * `%PDF-` le verifica `pdfFactura`.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat." }, { status: 401 });

  const refuz = await refuzaDacaMfaNeconfirmat(user.id);
  if (refuz) return refuz;

  const orderId = req.nextUrl.searchParams.get("orderId");
  const tip = req.nextUrl.searchParams.get("type");
  if (!orderId || (tip !== "invoice" && tip !== "storno")) {
    return NextResponse.json({ error: "Parametri lipsă: orderId și type (invoice sau storno)." }, { status: 400 });
  }

  const { data: comanda } = await supabase
    .from("orders")
    .select("business_id, easybill_invoice_key, easybill_invoice_series, easybill_invoice_number, easybill_storno_key, easybill_storno_series, easybill_storno_number")
    .eq("id", orderId)
    .maybeSingle();
  if (!comanda) return NextResponse.json({ error: "Comanda negăsită." }, { status: 404 });

  const { data: magazin } = await supabase
    .from("businesses").select("id").eq("id", comanda.business_id).eq("user_id", user.id).maybeSingle();
  if (!magazin) return NextResponse.json({ error: "Acces interzis." }, { status: 403 });

  const cheie = tip === "invoice" ? comanda.easybill_invoice_key : comanda.easybill_storno_key;
  if (!cheie) {
    return NextResponse.json({ error: tip === "invoice" ? "Comanda nu are factură easybill." : "Comanda nu are stornare easybill." }, { status: 400 });
  }

  /* ⚠ Cu cheia de SERVICIU, dupa dovada de proprietar de mai sus: pe clientul comerciantului
     parola ar fi sosit `enc.v1.…`. */
  const config = await configurareaMagazinului(createAdminClient(), comanda.business_id);
  if (!config) return NextResponse.json({ error: "easybill nu este configurat." }, { status: 400 });

  let octeti: ArrayBuffer;
  try {
    octeti = await pdfFactura(acreditari(config), cheie);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Nu am putut aduce PDF-ul de la easybill." }, { status: 502 });
  }

  const serie = tip === "invoice" ? comanda.easybill_invoice_series : comanda.easybill_storno_series;
  const numar = tip === "invoice" ? comanda.easybill_invoice_number : comanda.easybill_storno_number;
  const baza = tip === "invoice" ? "Factura" : "Stornare";
  /* ⚠ Numele intra intr-un ANTET: se pastreaza doar ce are ce cauta intr-un nume de fisier. */
  const nume = `${baza}_${[serie, numar].filter(Boolean).join("") || cheie}.pdf`.replace(/[^A-Za-z0-9._-]/g, "_");

  return new NextResponse(octeti, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nume}"`,
      /* Un document cu numele si adresa cumparatorului: in niciun cache. */
      "Cache-Control": "private, no-store",
    },
  });
}
