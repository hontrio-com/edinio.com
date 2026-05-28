import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, ROLES } from "@/lib/plans";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { plan?: string; role?: string };

  if (body.plan && !(PLANS as readonly string[]).includes(body.plan)) {
    return NextResponse.json({ error: "Plan invalid" }, { status: 400 });
  }
  if (body.role && !(ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json({ error: "Rol invalid" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Fetch old values for audit trail
  const { data: oldProfile } = await adminClient
    .from("users_profile")
    .select("plan, role")
    .eq("id", id)
    .single();

  const updates: { plan?: string; role?: string } = {};
  if (body.plan) updates.plan = body.plan;
  if (body.role) updates.role = body.role;

  const { error } = await adminClient.from("users_profile").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.plan) {
    await logAudit(admin.id, "user.plan_change", "user", id, {
      old_plan: oldProfile?.plan,
      new_plan: body.plan,
    });
  }
  if (body.role) {
    await logAudit(admin.id, "user.role_change", "user", id, {
      old_role: oldProfile?.role,
      new_role: body.role,
    });
  }

  return NextResponse.json({ success: true });
}
