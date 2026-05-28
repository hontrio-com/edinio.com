import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "Edinio <noreply@edinio.ro>";

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

  const { error } = await resend.emails.send({
    from: FROM,
    to: authUser.user.email,
    subject: body.subject.trim(),
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1AB554;margin-bottom:8px;">Edinio</h2>
        <p style="color:#52525b;font-size:14px;margin-bottom:4px;">Buna ${profile?.full_name ?? ""},</p>
        <div style="color:#18181b;font-size:15px;line-height:1.6;white-space:pre-wrap;margin:16px 0;">${body.message.trim()}</div>
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
        <p style="color:#a1a1aa;font-size:12px;">Acesta este un mesaj de la echipa Edinio.</p>
      </div>
    `,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
