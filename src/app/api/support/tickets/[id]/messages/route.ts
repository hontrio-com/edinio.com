import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { sendSupportReplyToAdmin } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: ticketId } = await params;
  const body = await req.json() as { content?: string; attachment_urls?: string[] };

  const { content, attachment_urls = [] } = body;
  if (!content?.trim()) return NextResponse.json({ error: "Mesajul nu poate fi gol" }, { status: 400 });

  const supabase = await createClient();

  // Verify ticket belongs to user
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, subject, status")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Tichet negasit" }, { status: 404 });
  if (ticket.status === "closed") return NextResponse.json({ error: "Tichetul este inchis" }, { status: 403 });

  const { data: message, error } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticketId,
      sender_type: "user",
      content: content.trim(),
      attachments: attachment_urls.map((url) => ({ url, name: url.split("/").pop() ?? "fisier" })),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify admin (fire & forget)
  sendSupportReplyToAdmin({
    ticketId,
    subject: ticket.subject,
    userEmail: user.email ?? "",
    content: content.trim(),
  }).catch(() => {});

  return NextResponse.json({ message }, { status: 201 });
}
