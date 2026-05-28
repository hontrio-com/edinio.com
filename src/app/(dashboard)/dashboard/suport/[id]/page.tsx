import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SupportTicketClient } from "@/components/dashboard/SupportTicketClient";

export const metadata = { title: "Tichet suport | Edinio" };

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: ticket }, { data: messages }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!ticket) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <SupportTicketClient
        ticket={ticket}
        initialMessages={(messages ?? []).map((m) => ({ ...m, attachments: m.attachments as { url: string; name: string }[] | null }))}
        userId={user.id}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
