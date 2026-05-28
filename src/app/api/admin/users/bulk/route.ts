import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, ROLES } from "@/lib/plans";
import { logAudit } from "@/lib/audit";

interface BulkBody {
  user_ids: string[];
  action: "change_plan" | "change_role";
  value: string;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as BulkBody;

  if (!Array.isArray(body.user_ids) || body.user_ids.length === 0) {
    return NextResponse.json({ error: "user_ids must be a non-empty array" }, { status: 400 });
  }

  if (!body.action || !body.value) {
    return NextResponse.json({ error: "action and value are required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  if (body.action === "change_plan") {
    if (!(PLANS as readonly string[]).includes(body.value)) {
      return NextResponse.json({ error: "Plan invalid" }, { status: 400 });
    }

    const { error } = await adminClient
      .from("users_profile")
      .update({ plan: body.value })
      .in("id", body.user_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log audit for each user
    await Promise.all(
      body.user_ids.map((userId) =>
        logAudit(admin.id, "user.bulk_plan_change", "user", userId, {
          plan: body.value,
          bulk: true,
          batch_size: body.user_ids.length,
        })
      )
    );

    return NextResponse.json({ success: true, affected: body.user_ids.length });
  }

  if (body.action === "change_role") {
    if (!(ROLES as readonly string[]).includes(body.value)) {
      return NextResponse.json({ error: "Rol invalid" }, { status: 400 });
    }

    const { error } = await adminClient
      .from("users_profile")
      .update({ role: body.value })
      .in("id", body.user_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log audit for each user
    await Promise.all(
      body.user_ids.map((userId) =>
        logAudit(admin.id, "user.role_change", "user", userId, {
          role: body.value,
          bulk: true,
          batch_size: body.user_ids.length,
        })
      )
    );

    return NextResponse.json({ success: true, affected: body.user_ids.length });
  }

  return NextResponse.json({ error: "Actiune invalida" }, { status: 400 });
}
