import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInvoicePdfUrl, getSmartbillAuthHeader, isSmartbillConfigured } from "@/lib/smartbill";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  // RLS ensures the invoice belongs to the authenticated user
  const { data: invoice } = await supabase
    .from("invoices")
    .select("smartbill_series, smartbill_number, plan")
    .eq("id", id)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Factura negasita" }, { status: 404 });
  }

  if (!invoice.smartbill_series || !invoice.smartbill_number) {
    return NextResponse.json({ error: "PDF indisponibil" }, { status: 404 });
  }

  if (!isSmartbillConfigured()) {
    return NextResponse.json({ error: "Serviciu indisponibil" }, { status: 503 });
  }

  const pdfUrl = getInvoicePdfUrl(invoice.smartbill_series, invoice.smartbill_number);

  try {
    const sbRes = await fetch(pdfUrl, {
      headers: {
        Authorization: getSmartbillAuthHeader(),
        Accept: "application/octet-stream",
      },
    });

    if (!sbRes.ok) {
      console.error("[invoice/pdf] Smartbill error:", sbRes.status);
      return NextResponse.json({ error: "PDF indisponibil" }, { status: 502 });
    }

    const pdfBuffer = await sbRes.arrayBuffer();
    const filename = `factura-${invoice.smartbill_series}-${invoice.smartbill_number}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[invoice/pdf] Fetch error:", err);
    return NextResponse.json({ error: "Eroare server" }, { status: 500 });
  }
}
