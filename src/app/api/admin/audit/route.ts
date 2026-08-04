import { NextRequest, NextResponse, connection } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

interface AuditLog {
  id: string;
  /**
   * Poate fi null: adminul care a facut actiunea poate fi sters ulterior, iar
   * cheia strina e ON DELETE SET NULL. Coloana a fost facuta nullabila in baza
   * pe 23 iulie, cand s-a reparat stergerea adminilor, dar tipul de aici a ramas
   * pe `string` pana la regenerarea fisierului de tipuri.
   */
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: unknown;
  created_at: string;
  admin_name?: string;
}

export async function GET(req: NextRequest) {
  // Ruta citeste date la fiecare cerere — ca pana acum. `connection()` spune
  // asta explicit, ca prerandarea sa nu o execute in timpul build-ului.
  await connection();
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const action = searchParams.get("action");
  const targetType = searchParams.get("target_type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();

  // Build query for logs
  let query = adminClient
    .from("admin_audit_log")
    .select("*", { count: "exact" });

  if (action) {
    query = query.eq("action", action);
  }
  if (targetType) {
    query = query.eq("target_type", targetType);
  }
  if (from) {
    query = query.gte("created_at", from);
  }
  if (to) {
    query = query.lte("created_at", to);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: logs, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Collect unique admin IDs to fetch names
  /* `filter(Boolean)` curata valorile, dar nu ingusteaza tipul, deci ramaneau
     `null`-uri in tip si `.in()` le refuza. */
  const adminIds = [
    ...new Set((logs ?? []).map((l: AuditLog) => l.admin_id).filter((id): id is string => !!id)),
  ];

  let adminNames: Record<string, string> = {};
  if (adminIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("users_profile")
      .select("id, full_name")
      .in("id", adminIds);

    if (profiles) {
      adminNames = Object.fromEntries(
        profiles.map((p: { id: string; full_name: string }) => [p.id, p.full_name])
      );
    }
  }

  // Attach admin name to each log
  const enrichedLogs = (logs ?? []).map((log: AuditLog) => ({
    ...log,
    admin_name: log.admin_id ? adminNames[log.admin_id] ?? null : null,
  }));

  return NextResponse.json({ logs: enrichedLogs, total: count ?? 0 });
}
