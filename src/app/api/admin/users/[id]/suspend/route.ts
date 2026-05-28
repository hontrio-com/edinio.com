import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { suspended_until?: string | null; admin_notes?: string };

  const adminClient = createAdminClient();

  const update: { suspended_until?: string | null; admin_notes?: string } = {};
  if ("suspended_until" in body) update.suspended_until = body.suspended_until ?? null;
  if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;

  const { error } = await adminClient.from("users_profile").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isSuspend = !!body.suspended_until;
  await logAudit(admin.id, isSuspend ? "user.suspend" : "user.unsuspend", "user", id, {
    suspended_until: body.suspended_until ?? null,
    admin_notes: body.admin_notes,
  });

  return NextResponse.json({ success: true });
}
