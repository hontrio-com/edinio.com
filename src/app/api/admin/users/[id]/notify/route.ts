import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { logAudit } from "@/lib/audit";
import { buildAdminNotifyHtml } from "@/lib/email";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FROM = process.env.EMAIL_FROM ?? "Edinio <noreply@edinio.com>";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { subject: string; message: string };

  if (!body.subject?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: "Subiect si mesaj obligatorii" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: authUser } = await adminClient.auth.admin.getUserById(id);
  const { data: profile } = await adminClient.from("users_profile").select("full_name").eq("id", id).single();

  if (!authUser?.user?.email) return NextResponse.json({ error: "Email negasit" }, { status: 404 });

  const { error } = await getResend().emails.send({
    from: FROM,
    to: authUser.user.email,
    subject: body.subject.trim(),
    html: buildAdminNotifyHtml(profile?.full_name ?? "", body.message.trim()),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin.id, "user.notify", "user", id, {
    subject: body.subject.trim(),
    to_email: authUser.user.email,
  });

  return NextResponse.json({ success: true });
}
