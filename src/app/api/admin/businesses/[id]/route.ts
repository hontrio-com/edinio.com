import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { is_published?: boolean };

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("businesses").update({ is_published: body.is_published }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(
    admin.id,
    body.is_published ? "business.publish" : "business.unpublish",
    "business",
    id,
  );

  return NextResponse.json({ success: true });
}
