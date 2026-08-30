import { requireAdmin } from "@/lib/admin-guard";
import { Suspense, type ComponentProps } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminSupportTicketClient } from "@/components/admin/AdminSupportTicketClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Tichet suport" };

type Tichet = ComponentProps<typeof AdminSupportTicketClient>["ticket"];

/**
 * Tichetul se citeste AICI, nu sub `<Suspense>`.
 *
 * E o cautare dupa cheia primara si de ea atarna `notFound()` — mutata in copil,
 * coaja ar pleca spre browser inaintea unui 404. Conversatia si contul de
 * autentificare al autorului (un dus-intors separat catre GoTrue, care se
 * astepta pana acum in serie) curg dupa cadru.
 */
export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  /* ⚠ Paza pe FIECARE pagina, nu doar in aspect. Vezi nota din layout. */
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: ticket } = await admin.from("support_tickets").select("*").eq("id", id).single();

  if (!ticket) notFound();

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Suspense fallback={<ScheletTichet />}>
        <Conversatie id={id} ticket={ticket} />
      </Suspense>
    </div>
  );
}

function ScheletTichet() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32" />

      {/* antetul tichetului */}
      <Skeleton className="h-[130px] rounded-2xl" />

      {/* mesajele */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* caseta de raspuns */}
      <Skeleton className="h-[136px] rounded-2xl" />
    </div>
  );
}

async function Conversatie({ id, ticket }: { id: string; ticket: Tichet }) {
  const admin = createAdminClient();

  const [{ data: messages }, { data: profile }] = await Promise.all([
    admin.from("support_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    admin.from("users_profile").select("full_name").then(async (r) => {
      const t = await admin.from("support_tickets").select("user_id").eq("id", id).single();
      if (!t.data) return { data: null };
      return admin.from("users_profile").select("id, full_name").eq("id", t.data.user_id).single();
    }),
  ]);

  // Get user email
  const { data: authUser } = await admin.auth.admin.getUserById(ticket.user_id);

  return (
    <AdminSupportTicketClient
      ticket={ticket}
      initialMessages={(messages ?? []).map((m) => ({ ...m, attachments: m.attachments as { url: string; name: string }[] | null }))}
      userName={profile?.full_name ?? "Utilizator"}
      userEmail={authUser?.user?.email ?? ""}
    />
  );
}
