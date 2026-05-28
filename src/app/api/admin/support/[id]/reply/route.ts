import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAgentReplyToUser } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: ticketId } = await params;
  const body = await req.json() as { content?: string; status?: string };

  if (!body.content?.trim()) return NextResponse.json({ error: "Continut invalid" }, { status: 400 });

  const adminClient = createAdminClient();

  // Get ticket
  const { data: ticket } = await adminClient.from("support_tickets").select("subject, user_id, status").eq("id", ticketId).single();
  if (!ticket) return NextResponse.json({ error: "Tichet negasit" }, { status: 404 });

  // Insert agent message
  const { data: message, error } = await adminClient.from("support_messages").insert({
    ticket_id: ticketId,
    sender_type: "agent",
    content: body.content.trim(),
    attachments: [],
  }).select().single();

  if (error) return NextResponse.json({ error: "Eroare la salvarea mesajului" }, { status: 500 });

  // Update ticket status
  const newStatus = body.status ?? ticket.status;
  await adminClient.from("support_tickets").update({
    status: newStatus,
    has_unread_reply: true,
  }).eq("id", ticketId);

  // Send email to user
  const { data: authUser } = await adminClient.auth.admin.getUserById(ticket.user_id);
  if (authUser?.user?.email) {
    sendAgentReplyToUser({
      to: authUser.user.email,
      ticketId,
      subject: ticket.subject,
      content: body.content.trim(),
    }).catch(() => {});
  }

  await logAudit(admin.id, "ticket.reply", "ticket", ticketId, {
    message_id: message?.id,
  });
  if (newStatus !== ticket.status) {
    await logAudit(admin.id, "ticket.status_change", "ticket", ticketId, {
      old_status: ticket.status,
      new_status: newStatus,
    });
  }

  return NextResponse.json({ message }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: ticketId } = await params;
  const body = await req.json() as { status?: string };

  const adminClient = createAdminClient();
  const { data: oldTicket } = await adminClient.from("support_tickets").select("status").eq("id", ticketId).single();

  const { error } = await adminClient.from("support_tickets").update({ status: body.status }).eq("id", ticketId);
  if (error) return NextResponse.json({ error: "Eroare la actualizare" }, { status: 500 });

  await logAudit(admin.id, "ticket.status_change", "ticket", ticketId, {
    old_status: oldTicket?.status,
    new_status: body.status,
  });

  return NextResponse.json({ success: true });
}
