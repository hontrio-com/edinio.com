import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { sendNewSupportTicketToAdmin } from "@/lib/email";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { esteCategorieDeAles, estePrioritate } from "@/lib/support/tichete";

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fiecare tichet scrie doua randuri SI trimite un email prin Resend catre
  // adresa de suport. Doua linii: cea din memorie taie rafala fara sa atinga
  // baza, cea durabila e singura care tine intre instantele serverless.
  // Cheia e pe UTILIZATOR, nu pe IP: ruta e doar-autentificat, iar o cheie pe IP
  // ar lovi colateral mai multi comercianti din acelasi birou sau NAT.
  if (!rateLimit(`support-tichet:${user.id}`, 3, 60_000)) {
    return NextResponse.json({ error: "Prea multe tichete prea repede. Incearca peste un minut." }, { status: 429 });
  }
  if (!(await consumaLimita(`support-tichet:${user.id}`, 10, 3600)).permis) {
    return NextResponse.json({ error: "Ai deschis prea multe tichete in ultima ora. Raspunde in cele existente sau incearca mai tarziu." }, { status: 429 });
  }

  const body = await req.json() as {
    subject?: string;
    category?: string;
    priority?: string;
    content?: string;
    business_id?: string | null;
    attachment_urls?: string[];
  };

  const { subject, category, priority = "normal", content, business_id, attachment_urls = [] } = body;

  if (!subject?.trim()) return NextResponse.json({ error: "Subiectul este obligatoriu" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "Descrierea este obligatorie" }, { status: 400 });
  /*
    ⚠ CATEGORIA SI PRIORITATEA SE VERIFICA AICI, nu doar in baza. Pana acum
    orice sir ajungea la constrangerea CHECK si cadea cu 23514, adica un 500
    „Eroare la crearea tichetului" pentru ceea ce e o greseala a apelantului.
    ⚠ Si NU mai are o valoare implicita: `other` nu e una dintre cele opt
    categorii (25.09.2026), iar un tichet fara categorie aleasa nu se poate
    trimite nici din formular.
  */
  if (!esteCategorieDeAles(category)) return NextResponse.json({ error: "Alege o categorie pentru tichet." }, { status: 400 });
  if (!estePrioritate(priority)) return NextResponse.json({ error: "Prioritate invalida." }, { status: 400 });

  const supabase = await createClient();

  // `business_id` vine din corpul cererii. Verificam ca magazinul e AL LUI:
  // altfel tichetul se atasa magazinului altui comerciant, iar raspunsul si
  // emailul catre suport ii dezvaluiau numele. Daca nu e al lui, il ignoram.
  let businessName: string | null = null;
  let businessIdValidat: string | null = null;
  if (business_id) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("id, business_name, store_name")
      .eq("id", business_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (biz) {
      businessIdValidat = biz.id;
      businessName = biz.store_name ?? biz.business_name ?? null;
    }
  }

  // Create ticket
  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      business_id: businessIdValidat,
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
