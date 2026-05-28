import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { baseTemplateForTest } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { email } = await req.json() as { email?: string };
  if (!email) return NextResponse.json({ error: "Adresa de email lipseste." }, { status: 400 });

  // Check env vars
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY nu este setat in Environments." }, { status: 500 });
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const from = `Edinio.com <${fromEmail}>`;

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: "Test notificare Edinio",
    html: baseTemplateForTest(from),
  });

  if (error) {
    return NextResponse.json({
      error: `Resend error: ${error.message ?? "Eroare necunoscuta"}`,
    }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message_id: data?.id,
    from: fromEmail,
    to: email,
  });
}
