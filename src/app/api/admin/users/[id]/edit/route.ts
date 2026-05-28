import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { full_name?: string; email?: string };

  const adminClient = createAdminClient();

  if (body.full_name?.trim()) {
    await adminClient.from("users_profile").update({ full_name: body.full_name.trim() }).eq("id", id);
  }

  if (body.email?.trim()) {
    const { error } = await adminClient.auth.admin.updateUserById(id, { email: body.email.trim() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(admin.id, "user.edit", "user", id, {
    full_name: body.full_name?.trim() || undefined,
    email: body.email?.trim() || undefined,
  });

  return NextResponse.json({ success: true });
}
