import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminSupportTicketClient } from "@/components/admin/AdminSupportTicketClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Tichet suport" };

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: ticket }, { data: messages }, { data: profile }] = await Promise.all([
    admin.from("support_tickets").select("*").eq("id", id).single(),
    admin.from("support_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    admin.from("users_profile").select("full_name").then(async (r) => {
      const t = await admin.from("support_tickets").select("user_id").eq("id", id).single();
      if (!t.data) return { data: null };
      return admin.from("users_profile").select("id, full_name").eq("id", t.data.user_id).single();
    }),
  ]);

  if (!ticket) notFound();

  // Get user email
  const { data: authUser } = await admin.auth.admin.getUserById(ticket.user_id);

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <AdminSupportTicketClient
        ticket={ticket}
        initialMessages={(messages ?? []).map((m) => ({ ...m, attachments: m.attachments as { url: string; name: string }[] | null }))}
        userName={profile?.full_name ?? "Utilizator"}
        userEmail={authUser?.user?.email ?? ""}
      />
    </div>
  );
}
