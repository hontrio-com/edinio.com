import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { sendSupportReplyToAdmin } from "@/lib/email";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fiecare raspuns trimite un email prin Resend catre adresa de suport, pe cheia
  // PLATFORMEI — exact motivul pentru care ruta de creare tichet are doua plafoane.
  // Aici nu exista niciunul: un cont gratuit deschidea un tichet si apoi bucla
  // POST-ul pe mesaje, inundand casuta de suport si arzand cota de trimitere
  // partajata de toti comerciantii. Aceleasi doua linii, aceeasi cheie pe
  // UTILIZATOR (o cheie pe IP ar lovi colateral un birou intreg).
  if (!rateLimit(`support-mesaj:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Prea multe mesaje prea repede. Incearca peste un minut." }, { status: 429 });
  }
  if (!(await consumaLimita(`support-mesaj:${user.id}`, 60, 3600)).permis) {
    return NextResponse.json({ error: "Ai trimis prea multe mesaje in ultima ora. Incearca mai tarziu." }, { status: 429 });
  }

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

  // Textul brut de la Postgres nu pleaca la client: numele tabelului, al coloanei
  // si al constrangerii nu spun nimic apelantului, dar sunt exact ce ii trebuie
  // cuiva care cartografiaza schema. Detaliul merge in jurnal, ca peste tot.
  if (error) {
    await logError({
      action: "support.adaugaMesaj",
      message: error.message,
      details: { code: error.code, ticketId },
      userId: user.id,
    });
    return NextResponse.json({ error: "Eroare la salvare. Incearca din nou." }, { status: 500 });
  }

  // Notify admin (fire & forget)
  sendSupportReplyToAdmin({
    ticketId,
    subject: ticket.subject,
    userEmail: user.email ?? "",
    content: content.trim(),
  }).catch(() => {});

  return NextResponse.json({ message }, { status: 201 });
}
