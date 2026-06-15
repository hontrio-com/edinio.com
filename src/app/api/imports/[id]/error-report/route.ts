import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Download a CSV of the rows that failed or were skipped during an import.
// Auth + ownership are enforced by RLS (owner-only SELECT on product_import_rows).

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  // RLS scopes this to imports owned by the caller.
  const { data: job } = await supabase.from("product_imports").select("id, file_name").eq("id", id).single();
  if (!job) return NextResponse.json({ error: "Import negasit" }, { status: 404 });

  const { data: rows } = await supabase
    .from("product_import_rows")
    .select("row_index, parsed, external_id, status, error")
    .eq("import_id", id)
    .in("status", ["failed", "skipped"])
    .order("row_index", { ascending: true });

  const headers = ["Rand", "Produs", "ID extern", "Status", "Eroare"];
  const body = (rows ?? []).map((r) => {
    const parsed = (r.parsed ?? {}) as { name?: string };
    return toRow([r.row_index + 1, parsed.name ?? "", r.external_id ?? "", r.status, r.error ?? ""]);
  });
  const csv = [toRow(headers), ...body].join("\r\n");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="erori_import_${date}.csv"`,
    },
  });
}
