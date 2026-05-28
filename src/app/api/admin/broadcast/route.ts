import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

interface BroadcastBody {
  subject: string;
  message: string;
  filter?: {
    plan?: string;
    role?: string;
  };
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as BroadcastBody;

  if (!body.subject || !body.message) {
    return NextResponse.json({ error: "subject si message sunt obligatorii" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Build query to find matching users
  let query = adminClient.from("users_profile").select("id");

  if (body.filter?.plan) {
    query = query.eq("plan", body.filter.plan);
  }
  if (body.filter?.role) {
    query = query.eq("role", body.filter.role);
  }

  const { data: users, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const recipientCount = users?.length ?? 0;

  // Fetch emails from auth for the matched users
  let recipientEmails: string[] = [];
  if (recipientCount > 0) {
    const userIds = users!.map((u) => u.id);
    const { data: authList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (authList?.users) {
      recipientEmails = authList.users
        .filter((u) => userIds.includes(u.id) && u.email)
        .map((u) => u.email!);
    }
  }

  // Log the broadcast attempt (email sending to be implemented when service is configured)
  await logAudit(admin.id, "broadcast.send", "broadcast", null, {
    subject: body.subject,
    message: body.message,
    filter: body.filter ?? null,
    recipients: recipientCount,
    recipient_emails: recipientEmails,
  });

  return NextResponse.json({ success: true, recipients: recipientCount });
}
