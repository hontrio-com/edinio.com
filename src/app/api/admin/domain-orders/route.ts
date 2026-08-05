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

  // If completed, create domain record and connect to business.
  // DOAR la PRIMA trecere in „completed": acelasi PATCH trimite si admin_notes,
  // deci o simpla corectare de nota pe o comanda deja finalizata reintra aici.
  // Fara garda, mai insera un rand in `domains` cu alt expiry_date calculat din
  // now() — doua scadente contradictorii pentru acelasi domeniu, vizibile
  // clientului in panoul lui — si rescria `custom_domain` peste un domeniu pe
  // care comerciantul l-ar fi schimbat intre timp.
  // Garda acopera DOAR scrierile in baza; apelul la Vercel e mai jos, in afara
  // ei, ca sa ramana reluabil.
  if (status === "completed" && order.status !== "completed") {
    // Scadenta se numara de la data comenzii (momentul platii), nu de la now():
    // asa iese aceeasi valoare oricand s-ar re-rula finalizarea.
    const expiryDate = order.created_at ? new Date(order.created_at) : new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + order.period);

    const domainRow = {
      business_id: order.business_id,
      user_id: order.user_id,
      domain: order.domain,
      status: "active",
      source: "purchased",
      expiry_date: expiryDate.toISOString().split("T")[0],
      auto_renew: true,
    };

    // Upsert manual (citeste apoi scrie), nu `.upsert({ onConflict })`: pe
    // `domains` nu exista UNIQUE pe (business_id, domain) in productie, iar
    // onConflict fara constrangere cade cu 42P10. Vezi migratia
    // 2026-08-05-domenii-fara-duplicat.sql, neaplicata inca.
    const { data: existingDomain } = await supabase
      .from("domains")
      .select("id")
      .eq("business_id", order.business_id)
      .eq("domain", order.domain)
      .limit(1)
      .maybeSingle();

    const { error: domainError } = existingDomain
      ? await supabase.from("domains").update(domainRow).eq("id", existingDomain.id)
      : await supabase.from("domains").insert(domainRow);

    if (domainError) {
      console.error("[domain-orders] domains write failed:", domainError);
    }

    await supabase
      .from("businesses")
      .update({ custom_domain: order.domain })
      .eq("id", order.business_id);
  }

  // Vercel (SSL + rutare) se reia la FIECARE salvare pe „completed", nu doar la
  // prima tranzitie. Esecul de aici e tranzitoriu si NU pica cererea, iar
  // resalvarea comenzii e singura cale prin care adminul il poate relua — sub
  // garda de mai sus acel retry nu mai facea nimic si domeniul PLATIT ramanea
  // fara certificat, tacut. Reapelarea e sigura: `addOne` din lib/vercel.ts
  // trateaza „deja in proiectul nostru" drept succes.
  if (status === "completed") {
    const vercelResult = await addDomainToVercel(order.domain);
    if (!vercelResult.success) {
      console.error("[domain-orders] Vercel add failed:", vercelResult.error);
    }
  }

  return NextResponse.json({ success: true });
}
