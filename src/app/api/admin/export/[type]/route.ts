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

/**
 * Exporturile trebuie sa fie COMPLETE: PostgREST taie silentios orice raspuns
 * la 1000 de randuri, deci citim in ferestre .range(). Spre deosebire de
 * fetchAllRows (log + partial), aici o eroare ARUNCA — un CSV partial care
 * arata complet e mai periculos decat un export esuat.
 */
async function fetchAllOrThrow<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function exportUsers(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const profiles = await fetchAllOrThrow((from, to) =>
    adminClient
      .from("users_profile")
      .select("id, full_name, plan, role, created_at, suspended_until")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  // Fetch auth users for emails and last sign in
  const authUsers: Record<string, { email: string; last_sign_in_at: string | null }> = {};
  if (profiles.length > 0) {
    const authList = await listAllAuthUsers(adminClient);
    for (const u of authList) {
      authUsers[u.id] = {
        email: u.email ?? "",
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    }
  }

  // Fetch business counts per user
  const businesses = await fetchAllOrThrow((from, to) =>
    adminClient.from("businesses").select("user_id").order("id").range(from, to)
  );

  const businessCounts: Record<string, number> = {};
  for (const b of businesses) {
    businessCounts[b.user_id] = (businessCounts[b.user_id] ?? 0) + 1;
  }

  const headers = ["ID", "Email", "Nume", "Plan", "Rol", "Creat la", "Ultima autentificare", "Afaceri", "Suspendat pana la"];
  const rows = profiles.map((p) => {
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
  const invoices = await fetchAllOrThrow((from, to) =>
    adminClient
      .from("invoices")
      .select("id, user_id, plan, amount, currency, status, smartbill_series, smartbill_number, stripe_invoice_id, created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  // Fetch user names (windowed full read — .in() cu >1000 de id-uri se
  // trunchiaza si el si depaseste limita de URL)
  const userNames: Record<string, string> = {};
  if (invoices.length > 0) {
    const profiles = await fetchAllOrThrow((from, to) =>
      adminClient.from("users_profile").select("id, full_name").order("id").range(from, to)
    );
    for (const p of profiles) {
      userNames[p.id] = p.full_name;
    }
  }

  const headers = ["ID", "Utilizator", "Nume utilizator", "Plan", "Suma", "Moneda", "Status", "SmartBill serie", "SmartBill numar", "Stripe Invoice ID", "Creat la"];
  const rows = invoices.map((inv) =>
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
  const orders = await fetchAllOrThrow((from, to) =>
    adminClient
      .from("orders")
      .select("id, order_number, business_id, customer_name, customer_phone, customer_email, total, status, payment_method, payment_status, created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  // Fetch business names (windowed full read, vezi nota din exportInvoices)
  const businessNames: Record<string, string> = {};
  if (orders.length > 0) {
    const businesses = await fetchAllOrThrow((from, to) =>
      adminClient.from("businesses").select("id, business_name").order("id").range(from, to)
    );
    for (const b of businesses) {
      businessNames[b.id] = b.business_name;
    }
  }

  const headers = ["ID", "Numar comanda", "Afacere", "Client", "Telefon client", "Email client", "Total", "Status", "Metoda plata", "Status plata", "Creat la"];
  const rows = orders.map((ord) =>
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
