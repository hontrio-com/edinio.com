import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { baseTemplateForTest } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita, mesajLimita } from "@/lib/utils/limita-durabila";

/**
 * Trimite un email de proba, ca sa se vada ca notificarile functioneaza.
 *
 * ERA UN RELEU DE EMAIL DESCHIS: destinatarul se lua din corpul cererii, singura
 * conditie era sa existe o sesiune (deci orice cont gratuit), si nu exista nicio
 * limita. Adica: cont nou → POST cu {"email":"victima@..."} in bucla → mesaje
 * trimise pe cheia Resend a platformei, de pe domeniul Edinio. Costa bani si,
 * mai grav, arde reputatia de expeditor a domeniului (SPF/DKIM) — ceea ce trimite
 * la spam si emailurile REALE ale tuturor comerciantilor.
 *
 * Acum destinatarul e INTOTDEAUNA adresa contului autentificat (singurul lucru cu
 * sens pentru un test de notificare), plus doua plafoane.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  if (!user.email) {
    return NextResponse.json({ error: "Contul tau nu are o adresa de email." }, { status: 400 });
  }

  // Cheia principala e UTILIZATORUL, nu IP-ul: doar pe IP, doi comercianti din
  // acelasi birou sau NAT isi imparteau cosul si se blocau reciproc. Cheia pe IP
  // ramane, cu buget mai larg — singura care mai conteaza cand cineva isi face
  // zece conturi gratuite ca sa obtina zece bugete noi.
  if (!rateLimit(`notif-test:${user.id}`, 5, 60_000) || !rateLimit(`notif-test-ip:${clientIp(req)}`, 15, 60_000)) {
    return NextResponse.json({ error: "Prea multe incercari." }, { status: 429 });
  }

  const lim = await consumaLimita(`notif-test:${user.id}`, 3, 3600);
  if (!lim.permis) {
    return NextResponse.json(
      { error: mesajLimita(lim, "Ai trimis deja cateva emailuri de test. Incearca peste o ora.") },
      { status: 429 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY nu este setat in Environments." }, { status: 500 });
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const from = `Edinio.com <${fromEmail}>`;

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Destinatarul NU se ia din corpul cererii. Vezi comentariul de sus.
  const { data, error } = await resend.emails.send({
    from,
    to: user.email,
    subject: "Test notificare Edinio",
    html: baseTemplateForTest(from),
  });

  if (error) {
    return NextResponse.json({
      error: `Resend error: ${error.message ?? "Eroare necunoscuta"}`,
    }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message_id: data?.id,
    from: fromEmail,
    to: user.email,
  });
}
