import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDomainToVercel } from "@/lib/vercel";

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    orderId: string;
    status: string;
    admin_notes?: string;
  };

  const { orderId, status, admin_notes } = body;

  if (!orderId || !status) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const validStatuses = ["pending", "processing", "completed", "cancelled", "refunded"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Status invalid" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get the order first
  const { data: order } = await supabase
    .from("domain_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Comanda nu a fost gasita" }, { status: 404 });
  }

  // Update order status
  const { error } = await supabase
    .from("domain_orders")
    .update({
      status,
      admin_notes: admin_notes ?? null,
    })
    .eq("id", orderId);

  if (error) {
    return NextResponse.json({ error: "Eroare la actualizare" }, { status: 500 });
  }

  // If completed, create domain record and connect to business
  if (status === "completed") {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + order.period);

    await supabase.from("domains").insert({
      business_id: order.business_id,
      user_id: order.user_id,
      domain: order.domain,
      status: "active",
      source: "purchased",
      expiry_date: expiryDate.toISOString().split("T")[0],
      auto_renew: true,
    });

    await supabase
      .from("businesses")
      .update({ custom_domain: order.domain })
      .eq("id", order.business_id);

    // Add domain to Vercel project for SSL + routing
    await addDomainToVercel(order.domain);
  }

  return NextResponse.json({ success: true });
}
