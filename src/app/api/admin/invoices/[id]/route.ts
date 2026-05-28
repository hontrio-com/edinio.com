import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH: update invoice status (cancel = void)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { status: string };

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("invoices").update({ status: body.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  return NextResponse.json({ success: true });
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

  return NextResponse.json({ invoice: newInvoice }, { status: 201 });
}
