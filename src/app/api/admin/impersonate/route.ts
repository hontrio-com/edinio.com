import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { claimuriDinToken } from "@/lib/auth/mfa";
import { confirmaSesiuneaMfa } from "@/lib/auth/flux-mfa";

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

  /*
   * SESIUNEA IMPRUMUTATA TRAIESTE EXACT CAT MARCAJUL — o ora.
   *
   * Inainte, `verifyOtp` scria cookie-uri de sesiune cu implicitele
   * @supabase/ssr: 400 de zile. Marcajul `impersonare`, care aprinde bara
   * galbena, avea insa maxAge de o ora. Dupa 60 de minute bara disparea, dar
   * sesiunea imprumutata ramanea perfect valida: adminul continua sa lucreze in
   * contul comerciantului fara niciun semn, iar in jurnale totul aparea ca facut
   * de comerciant (constatarea 22 din audit).
   *
   * Alegerea corecta e ca marcajul sa MARGINEASCA sesiunea, nu invers. De aceea
   * cookie-urile de sesiune primesc aici acelasi `maxAge`.
   *
   * `updateSession` reimprospateaza tokenul la fiecare navigare si rescrie
   * cookie-urile — cu implicitele bibliotecii, deci fereastra se poate intinde
   * cat timp adminul e activ. Marcajul insa nu se re-emite, iar bara ramane
   * legata de el; la disparitia lui `esteImpersonare` devine fals si `logout`
   * ramane oricum la un clic distanta in topbar.
   */
  const DURATA_IMPERSONARE_SEC = 60 * 60;

  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { maxAge: DURATA_IMPERSONARE_SEC },
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            raspuns.cookies.set(name, value, { ...options, maxAge: DURATA_IMPERSONARE_SEC }),
          ),
      },
    },
  );

  const { data: sesiuneNoua, error: eroareOtp } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (eroareOtp) {
    return NextResponse.json({ error: "Nu am putut porni sesiunea de impersonare." }, { status: 500 });
  }

  /*
   * Sesiunea imprumutata se marcheaza ca trecuta de al doilea factor.
   *
   * De la 05.08.2026 poarta MFA intreaba „sesiunea ASTA a fost confirmata?".
   * Sesiunea creata aici e noua (alt `session_id`), deci fara marcajul de mai jos
   * administratorul ar ateriza pe /login/mfa si i s-ar cere codul trimis pe
   * emailul VICTIMEI — adica impersonarea ar deveni inutilizabila exact pentru
   * conturile care au nevoie cel mai des de suport.
   *
   * De ce e legitim: al doilea factor a fost deja cerut si trecut — al
   * administratorului, in `requireAdminApi()` de la inceputul rutei. Preluarea e
   * o decizie deliberata a unui operator deja verificat, si e scrisa in jurnalul
   * de audit cateva linii mai sus.
   *
   * Ce NU facem: nu deschidem o portita pe baza cookie-ului `impersonare`.
   * Cookie-urile vin de la client — o poarta care s-ar uita la el ar putea fi
   * ocolita trimitand pur si simplu cookie-ul.
   *
   * Marcarea se face in LISTA de sesiuni confirmate, deci sesiunile proprii ale
   * comerciantului raman valide: preluarea pentru suport nu il da afara din
   * contul lui.
   */
  const idSesiuneImprumutata = claimuriDinToken(sesiuneNoua?.session?.access_token)?.session_id;
  if (idSesiuneImprumutata) {
    await confirmaSesiuneaMfa(body.userId, idSesiuneImprumutata);
  } else {
    console.error("[impersonate] sesiunea imprumutata nu a putut fi identificata", { userId: body.userId });
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
