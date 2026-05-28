import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { sendNewSupportTicketToAdmin } from "@/lib/email";

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    subject?: string;
    category?: string;
    priority?: string;
    content?: string;
    business_id?: string | null;
    attachment_urls?: string[];
  };

  const { subject, category = "other", priority = "normal", content, business_id, attachment_urls = [] } = body;

  if (!subject?.trim()) return NextResponse.json({ error: "Subiectul este obligatoriu" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "Descrierea este obligatorie" }, { status: 400 });

  const supabase = await createClient();

  // Get business name for email
  let businessName: string | null = null;
  if (business_id) {
    const { data: biz } = await supabase.from("businesses").select("business_name, store_name").eq("id", business_id).single();
    businessName = biz?.store_name ?? biz?.business_name ?? null;
  }

  // Create ticket
  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      business_id: business_id ?? null,
      subject: subject.trim(),
      category,
      priority,
      status: "open",
    })
    .select()
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Eroare la crearea tichetului" }, { status: 500 });
  }

  // Create first message
  const { error: msgError } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticket.id,
      sender_type: "user",
      content: content.trim(),
      attachments: attachment_urls.map((url) => ({ url, name: url.split("/").pop() ?? "fisier" })),
    });

  if (msgError) {
    return NextResponse.json({ error: "Eroare la salvarea mesajului" }, { status: 500 });
  }

  // Send email to admin (fire & forget)
  sendNewSupportTicketToAdmin({
    ticketId: ticket.id,
    subject: subject.trim(),
    category,
    priority,
    userEmail: user.email ?? "",
    businessName,
    content: content.trim(),
  }).catch(() => {});

  return NextResponse.json({ ticket }, { status: 201 });
}
