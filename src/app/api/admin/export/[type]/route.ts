import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient, listAllAuthUsers } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit";

type ExportType = "users" | "invoices" | "orders";

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(",");
}

async function exportUsers(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data: profiles, error } = await adminClient
    .from("users_profile")
    .select("id, full_name, plan, role, created_at, suspended_until")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Fetch auth users for emails and last sign in
  const authUsers: Record<string, { email: string; last_sign_in_at: string | null }> = {};
  if (profiles && profiles.length > 0) {
    const authList = await listAllAuthUsers(adminClient);
    for (const u of authList) {
      authUsers[u.id] = {
        email: u.email ?? "",
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    }
  }

  // Fetch business counts per user
  const { data: businesses } = await adminClient
    .from("businesses")
    .select("user_id");

  const businessCounts: Record<string, number> = {};
  if (businesses) {
    for (const b of businesses) {
      businessCounts[b.user_id] = (businessCounts[b.user_id] ?? 0) + 1;
    }
  }

  const headers = ["ID", "Email", "Nume", "Plan", "Rol", "Creat la", "Ultima autentificare", "Afaceri", "Suspendat pana la"];
  const rows = (profiles ?? []).map((p) => {
    const auth = authUsers[p.id];
    return toCsvRow([
      p.id,
      auth?.email ?? "",
      p.full_name,
      p.plan,
      p.role,
      p.created_at,
      auth?.last_sign_in_at ?? "",
      businessCounts[p.id] ?? 0,
      p.suspended_until ?? "",
    ]);
  });

  return [toCsvRow(headers), ...rows].join("\r\n");
}

async function exportInvoices(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data: invoices, error } = await adminClient
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Fetch user names
  const userIds = [...new Set((invoices ?? []).map((i) => i.user_id))];
  const userNames: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("users_profile")
      .select("id, full_name")
      .in("id", userIds);

    if (profiles) {
      for (const p of profiles) {
        userNames[p.id] = p.full_name;
      }
    }
  }

  const headers = ["ID", "Utilizator", "Nume utilizator", "Plan", "Suma", "Moneda", "Status", "SmartBill serie", "SmartBill numar", "Stripe Invoice ID", "Creat la"];
  const rows = (invoices ?? []).map((inv) =>
    toCsvRow([
      inv.id,
      inv.user_id,
      userNames[inv.user_id] ?? "",
      inv.plan,
      inv.amount,
      inv.currency,
      inv.status,
      inv.smartbill_series ?? "",
      inv.smartbill_number ?? "",
      inv.stripe_invoice_id ?? "",
      inv.created_at,
    ])
  );

  return [toCsvRow(headers), ...rows].join("\r\n");
}

async function exportOrders(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data: orders, error } = await adminClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Fetch business names
  const businessIds = [...new Set((orders ?? []).map((o) => o.business_id))];
  const businessNames: Record<string, string> = {};
  if (businessIds.length > 0) {
    const { data: businesses } = await adminClient
      .from("businesses")
      .select("id, business_name")
      .in("id", businessIds);

    if (businesses) {
      for (const b of businesses) {
        businessNames[b.id] = b.business_name;
      }
    }
  }

  const headers = ["ID", "Numar comanda", "Afacere", "Client", "Telefon client", "Email client", "Total", "Status", "Metoda plata", "Status plata", "Creat la"];
  const rows = (orders ?? []).map((ord) =>
    toCsvRow([
      ord.id,
      ord.order_number,
      businessNames[ord.business_id] ?? "",
      ord.customer_name,
      ord.customer_phone,
      ord.customer_email ?? "",
      ord.total,
      ord.status,
      ord.payment_method,
      ord.payment_status,
      ord.created_at,
    ])
  );

  return [toCsvRow(headers), ...rows].join("\r\n");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await params;

  if (!["users", "invoices", "orders"].includes(type)) {
    return NextResponse.json({ error: "Tip export invalid. Folositi: users, invoices, orders" }, { status: 400 });
  }

  const exportType = type as ExportType;
  const adminClient = createAdminClient();

  try {
    let csv: string;

    switch (exportType) {
      case "users":
        csv = await exportUsers(adminClient);
        break;
      case "invoices":
        csv = await exportInvoices(adminClient);
        break;
      case "orders":
        csv = await exportOrders(adminClient);
        break;
    }

    const auditAction: AuditAction = `export.${exportType}`;
    await logAudit(admin.id, auditAction, "export", null, { type: exportType });

    const now = new Date().toISOString().slice(0, 10);
    const filename = `${exportType}_${now}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eroare la export";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
