import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSmartbillAuthHeader } from "@/lib/smartbill";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cif = process.env.SMARTBILL_CIF!;
  const series = process.env.SMARTBILL_SERIES!;
  const auth = getSmartbillAuthHeader();

  // Try creating a DRAFT invoice to see exact Smartbill error
  const today = new Date().toISOString().split("T")[0];
  const body = {
    companyVatCode: cif,
    client: {
      name: "Test Client",
      country: "Romania",
      isTaxPayer: false,
      saveToDb: false,
    },
    isDraft: true,
    issueDate: today,
    seriesName: series,
    currency: "RON",
    language: "RO",
    precision: 2,
    sendEmail: false,
    products: [
      {
        name: "Test Abonament",
        measuringUnitName: "luna",
        currency: "RON",
        quantity: 1,
        price: 1,
        isService: true,
        saveToDb: false,
      },
    ],
  };

  try {
    const res = await fetch("https://ws.smartbill.ro/SBORO/api/invoice", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();

    return NextResponse.json({
      requestSent: { ...body, companyVatCode: "***" },
      smartbillStatus: res.status,
      smartbillResponse: responseText,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
