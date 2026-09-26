import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SupportTicketClient } from "@/components/dashboard/SupportTicketClient";

export const metadata = { title: "Tichet suport" };

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: ticket }, { data: messages }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("*, businesses(business_name, store_name)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!ticket) notFound();

  const { businesses: magazin, ...tichet } = ticket;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SupportTicketClient
        ticket={tichet}
        numeMagazin={magazin ? magazin.store_name ?? magazin.business_name : null}
        initialMessages={(messages ?? []).map((m) => ({ ...m, attachments: m.attachments as { url: string; name: string }[] | null }))}
      />
    </div>
  );
}
