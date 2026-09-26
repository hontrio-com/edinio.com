import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SupportClient, type TichetDinLista } from "@/components/dashboard/SupportClient";
import { acumCatTimp } from "@/lib/utils/format";
import { mediana, stareaTichetului, timpiDePrimRaspuns } from "@/lib/support/tichete";

export const metadata = { title: "Suport | Edinio" };

/*
  ═══════════════════════════════════════════════════════════════════════════
  SUPORT: LISTA TICHETELOR                                        (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠⚠ MESAJELE VIN ODATA CU TICHETELE, intr-o singura citire. Starea pe care o
  vede comerciantul („Asteapta raspunsul tau" / „La echipa Edinio") se judeca
  dupa cine a scris ULTIMUL (vezi `stareaTichetului`), iar timpul de raspuns
  dupa PRIMUL mesaj al echipei. Niciuna nu sta pe randul tichetului.

  ⚠ Se poate aduce tot: masurat pe 25.09.2026, productia are 7 tichete si cel
  mult 4 mesaje pe tichet. Daca vreodata un cont trece de sute, asta devine o
  functie in baza, nu o lista mai lunga aici.
*/
export default async function SupportPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: tichete }, { data: businesses }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, created_at, updated_at, subject, category, priority, status, has_unread_reply, business_id, support_messages(sender_type, content, created_at)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("businesses")
      .select("id, business_name, store_name")
      .eq("user_id", user.id),
  ]);

  const acum = new Date();
  const toate = (tichete ?? []).map((t) => ({
    ...t,
    mesaje: [...(t.support_messages ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  }));

  const lista: TichetDinLista[] = toate.map((t) => {
    const ultimul = t.mesaje.at(-1) ?? null;
    const ultimulMesajDe = ultimul?.sender_type === "agent" ? "agent" : ultimul ? "user" : null;
    return {
      id: t.id,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      business_id: t.business_id,
      has_unread_reply: t.has_unread_reply,
      stare: stareaTichetului({ status: t.status, ultimulMesajDe }),
      /* ⚠ Taiat aici, nu pe ecran: un mesaj lung n-are ce cauta intreg in pagina. */
      ultimulMesaj: ultimul ? ultimul.content.replace(/\s+/g, " ").trim().slice(0, 180) : "",
      ultimulMesajDe,
      mesaje: t.mesaje.length,
      /*
        ⚠ Timpul relativ se scrie PE SERVER. Scris in browser, „acum 3 minute"
        de la server si „acum 4 minute" de la client ar fi fost o nepotrivire de
        hidratare la fiecare incarcare.
      */
      cand: acumCatTimp(t.updated_at, acum),
    };
  });

  const timpRaspuns = mediana(timpiDePrimRaspuns(toate));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SupportClient
        tichete={lista}
        timpRaspunsMs={timpRaspuns}
        businesses={businesses ?? []}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
