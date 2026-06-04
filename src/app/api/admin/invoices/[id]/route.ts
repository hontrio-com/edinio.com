import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSmartbillInvoice } from "@/lib/smartbill";
import { logAudit } from "@/lib/audit";

// PATCH: update invoice status (cancel = void)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { status: string };

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("invoices").update({ status: body.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin.id, "invoice.cancel", "invoice", id, {
    new_status: body.status,
  });

  return NextResponse.json({ success: true });
}

// DELETE: permanently delete invoice
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin.id, "invoice.delete", "invoice", id);

  return NextResponse.json({ success: true });
}

// PUT: retry SmartBill for an invoice missing series/number
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();

  const { data: invoice } = await adminClient
    .from("invoices")
    .select("id, user_id, plan, amount, smartbill_series")
    .eq("id", id)
    .single();

  if (!invoice) return NextResponse.json({ error: "Factura negasita" }, { status: 404 });
  if (invoice.smartbill_series) return NextResponse.json({ error: "Factura are deja serie SmartBill" }, { status: 400 });

  // Fetch client info
  const [{ data: bizData }, { data: profileData }, { data: authData }] = await Promise.all([
    adminClient.from("businesses").select("business_name, address, city, county, cui").eq("user_id", invoice.user_id).maybeSingle(),
    adminClient.from("users_profile").select("full_name").eq("id", invoice.user_id).maybeSingle(),
    adminClient.auth.admin.getUserById(invoice.user_id),
  ]);

  const userEmail = authData?.user?.email ?? "";
  const clientName = bizData?.business_name || profileData?.full_name || userEmail || "Client";

  const productName = invoice.plan === "domain" ? `Domeniu (factura #${invoice.id.slice(0, 8)})` : `Abonament Edinio ${invoice.plan}`;

  const sbResult = await createSmartbillInvoice(
    {
      name: clientName,
      email: userEmail,
      vatCode: bizData?.cui ?? undefined,
      address: bizData?.address ?? undefined,
      city: bizData?.city ?? undefined,
      county: bizData?.county ?? undefined,
    },
    { name: productName, price: Number(invoice.amount), quantity: 1 }
  );

  if ("error" in sbResult) {
    await adminClient.from("invoices").update({ smartbill_error: sbResult.error }).eq("id", id);
    return NextResponse.json({ error: sbResult.error }, { status: 500 });
  }

  await adminClient.from("invoices").update({
    smartbill_series: sbResult.series ?? null,
    smartbill_number: sbResult.number ?? null,
    smartbill_error: null,
  }).eq("id", id);

  await logAudit(admin.id, "invoice.smartbill_retry", "invoice", id, {
    series: sbResult.series,
    number: sbResult.number,
  });

  return NextResponse.json({ success: true, series: sbResult.series, number: sbResult.number });
}

// POST: reissue invoice (create duplicate with pending status)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();

  const { data: invoice } = await adminClient
    .from("invoices")
    .select("user_id, plan, amount, currency")
    .eq("id", id)
    .single();

  if (!invoice) return NextResponse.json({ error: "Factura negasita" }, { status: 404 });

  const { data: newInvoice, error } = await adminClient
    .from("invoices")
    .insert({
      user_id: invoice.user_id,
      plan: invoice.plan,
      amount: invoice.amount,
      currency: invoice.currency,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin.id, "invoice.reissue", "invoice", id, {
    new_invoice_id: newInvoice?.id,
    plan: invoice.plan,
    amount: invoice.amount,
  });

  return NextResponse.json({ invoice: newInvoice }, { status: 201 });
}
