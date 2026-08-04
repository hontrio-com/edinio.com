import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";

/**
 * Impersonare de cont, pentru suport.
 *
 * Ruta asta emite o CREDENTIALA DE AUTENTIFICARE COMPLETA pentru contul tinta,
 * deci e cel mai periculos punct de pe platforma. Intariri fata de varianta
 * initiala:
 *
 *  - garda cere doua surse independente de rol (claim din JWT + coloana blocata
 *    in baza); inainte se sprijinea doar pe coloana, iar aceea era scriibila de
 *    orice utilizator;
 *  - tokenul NU mai pleaca inapoi in raspuns. Inainte, URL-ul cu `token_hash`
 *    ajungea in corpul JSON, adica in istoricul de retea al browserului, in
 *    logurile oricarui proxy si in orice extensie care citeste raspunsuri.
 *    Acum il verificam server-side si punem direct cookie-urile de sesiune;
 *  - nu se poate impersona alt administrator;
 *  - limita de rata, ca o sesiune de admin furata sa nu poata parcurge toate
 *    conturile intr-un minut.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`impersonate:${admin.id}`, 5, 60_000) || !rateLimit(`impersonate-ip:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Prea multe incercari. Asteapta un minut." }, { status: 429 });
  }

  const body = await req.json() as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  if (body.userId === admin.id) {
    return NextResponse.json({ error: "Esti deja conectat cu acest cont." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(body.userId);
  if (userError || !userData.user) return NextResponse.json({ error: "Utilizator negasit" }, { status: 404 });

  // Un administrator nu poate prelua contul altui administrator: altfel un
  // singur cont de suport compromis inseamna toate conturile de suport.
  const tintaEsteAdmin =
    (userData.user.app_metadata as Record<string, unknown> | undefined)?.role === "admin";
  if (tintaEsteAdmin) {
    await logAudit(admin.id, "user.impersonate_refuzat", "user", body.userId, { motiv: "tinta e admin" });
    return NextResponse.json({ error: "Nu poti impersona un alt administrator." }, { status: 403 });
  }

  const email = userData.user.email;
  if (!email) return NextResponse.json({ error: "Utilizatorul nu are email" }, { status: 400 });

  const { data, error } = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? "Eroare la generarea linkului" }, { status: 500 });
  }

  await logAudit(admin.id, "user.impersonate", "user", body.userId, { email });

  // Tokenul se consuma AICI, server-side, si raspunsul duce inapoi doar
  // cookie-urile de sesiune. Clientul nu vede niciodata `hashed_token`.
  const raspuns = NextResponse.json({ success: true, redirectTo: "/dashboard" });

  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) => raspuns.cookies.set(name, value, options)),
      },
    },
  );

  const { error: eroareOtp } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (eroareOtp) {
    return NextResponse.json({ error: "Nu am putut porni sesiunea de impersonare." }, { status: 500 });
  }

  // Marcaj vizibil pentru UI + urma in loguri ca sesiunea curenta e imprumutata.
  raspuns.cookies.set("impersonare", admin.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // o ora, nu 400 de zile ca sesiunea normala
    secure: process.env.NODE_ENV === "production",
  });

  return raspuns;
}
