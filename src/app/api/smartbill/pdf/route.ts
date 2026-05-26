import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchMerchantPdf,
  getMerchantInvoicePdfUrl,
  getMerchantEstimatePdfUrl,
  type SmartbillConfig,
} from "@/lib/smartbill";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const orderId = searchParams.get("orderId");
  const docType = searchParams.get("type") as "invoice" | "estimate" | "storno" | null;

  if (!orderId || !docType) {
    return NextResponse.json({ error: "Parametri lipsa: orderId si type sunt necesari." }, { status: 400 });
  }

  // Fetch order and verify ownership
  const { data: order } = await supabase
    .from("orders")
    .select("business_id, smartbill_invoice_number, smartbill_invoice_series, smartbill_estimate_number, smartbill_estimate_series, smartbill_storno_number, smartbill_storno_series")
    .eq("id", orderId)
    .single();

  if (!order) return NextResponse.json({ error: "Comanda negasita." }, { status: 404 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis." }, { status: 403 });

  // Fetch SmartBill config
  const { data: settings } = await supabase
    .from("store_settings").select("smartbill_config").eq("business_id", order.business_id).single();

  const config = settings?.smartbill_config as SmartbillConfig | null;
  if (!config?.enabled || !config.email || !config.token || !config.company_vat_code) {
    return NextResponse.json({ error: "SmartBill nu este configurat." }, { status: 400 });
  }

  // Determine which document to fetch
  let pdfUrl: string;
  let filename: string;

  if (docType === "invoice") {
    if (!order.smartbill_invoice_series || !order.smartbill_invoice_number) {
      return NextResponse.json({ error: "Aceasta comanda nu are factura." }, { status: 400 });
    }
    pdfUrl = getMerchantInvoicePdfUrl(
      config.company_vat_code,
      order.smartbill_invoice_series,
      order.smartbill_invoice_number
    );
    filename = `Factura_${order.smartbill_invoice_series}${order.smartbill_invoice_number}.pdf`;
  } else if (docType === "estimate") {
    if (!order.smartbill_estimate_series || !order.smartbill_estimate_number) {
      return NextResponse.json({ error: "Aceasta comanda nu are proforma." }, { status: 400 });
    }
    pdfUrl = getMerchantEstimatePdfUrl(
      config.company_vat_code,
      order.smartbill_estimate_series,
      order.smartbill_estimate_number
    );
    filename = `Proforma_${order.smartbill_estimate_series}${order.smartbill_estimate_number}.pdf`;
  } else if (docType === "storno") {
    if (!order.smartbill_storno_series || !order.smartbill_storno_number) {
      return NextResponse.json({ error: "Aceasta comanda nu are storno." }, { status: 400 });
    }
    pdfUrl = getMerchantInvoicePdfUrl(
      config.company_vat_code,
      order.smartbill_storno_series,
      order.smartbill_storno_number
    );
    filename = `Storno_${order.smartbill_storno_series}${order.smartbill_storno_number}.pdf`;
  } else {
    return NextResponse.json({ error: "Tip document invalid. Valori acceptate: invoice, estimate, storno." }, { status: 400 });
  }

  const pdf = await fetchMerchantPdf(config, pdfUrl);
  if ("error" in pdf) {
    return NextResponse.json({ error: pdf.error }, { status: 502 });
  }

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
