import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";
import { claimuriDinToken } from "@/lib/auth/mfa";
import { idSesiuneCurenta } from "@/lib/auth/stare-mfa";
import { confirmaSesiuneaMfa, verificaCodMfa } from "@/lib/auth/flux-mfa";
import { COOKIE_ASTEPTARE, desigileazaSesiune } from "@/lib/auth/sesiune-asteptare";
import { COOKIE_SESIUNE, cuDurataNoastra } from "@/lib/supabase/cookie-sesiune";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";

/**
 * Verificarea codului din email — pasul doi al autentificarii.
 *
 * DE CE E RUTA SI NU ACTIUNE DE SERVER: e singurul pas care trebuie sa mearga
 * cand sesiunea NU e (inca) confirmata, iar poarta din proxy opreste orice
 * actiune de server intr-o astfel de sesiune. O scutire pe calea /login/mfa nu
 * era o solutie: id-ul unei actiuni se rezolva dintr-un manifest GLOBAL, nu pe
 * pagina, deci un POST catre calea scutita, cu id-ul oricarei alte actiuni din
 * aplicatie, ar fi executat-o (vezi src/lib/auth/poarta-mfa.ts).
 *
 * Prefixul /api/auth/ e pe lista de scutiri a portii, si contine EXACT cei trei
 * pasi care scot omul dintr-o sesiune neconfirmata: verificarea, retrimiterea si
 * iesirea din cont.
 */
export async function POST(req: NextRequest) {
  // Plafon grosier pe IP, in fata a orice: aici se ghiceste un cod de 6 cifre.
  // Plafonul fin, per utilizator si durabil, e in `verificaCodMfa`.
  if (!rateLimit(`mfa-verifica:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Prea multe incercari. Asteapta un minut." }, { status: 429 });
  }

  const corp = (await req.json().catch(() => null)) as { cod?: unknown } | null;
  const cod = typeof corp?.cod === "string" ? corp.cod.trim() : "";
  if (!/^\d{6}$/.test(cod)) {
    return NextResponse.json({ error: "Cod incorect sau expirat." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const asteptare = desigileazaSesiune(cookieStore.get(COOKIE_ASTEPTARE)?.value);

  /*
   * CALEA NORMALA: sesiunea nu exista inca. Tokenurile stau sigilate in cookie
   * de la `login()`, si devin sesiune abia daca respectivul cod e corect.
   */
  if (asteptare) {
    const rezultat = await verificaCodMfa(asteptare.u, cod);
    if ("error" in rezultat) return NextResponse.json(rezultat, { status: 400 });

    /*
     * Cookie-urile de sesiune se STRANG si se pun pe raspuns explicit, nu prin
     * `cookies()`.
     *
     * Adaptorul comun din src/lib/supabase/server.ts inghite in tacere orice
     * eroare de scriere (are nevoie, fiindca acelasi client se foloseste si din
     * Server Components, unde scrierea e interzisa). Aici tacerea ar fi cea mai
     * proasta varianta cu putinta: `setSession` ar raspunde „am reusit", omul ar
     * fi trimis in panou fara cookie-uri, si s-ar intoarce la /login/mfa la
     * nesfarsit, cu codul corect in mana.
     */
    const deScris: { name: string; value: string; options?: Record<string, unknown> }[] = [];
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: COOKIE_SESIUNE,
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c) { deScris.push(...c); },
        },
      },
    );

    /*
     * Abia ACUM se emite sesiunea. Ordinea nu e negociabila: verificarea codului
     * e mai sus, deci un cod gresit nu ajunge niciodata sa scrie vreun cookie.
     *
     * `refreshSession` si nu `setSession`: sigiliul poarta DOAR refresh tokenul,
     * ca sa nu depinda de marimea JWT-ului (vezi sesiune-asteptare.ts). Tokenul e
     * nefolosit — cookie-urile nu s-au scris niciodata — deci rotatia il accepta,
     * iar `session_id` se pastreaza peste reimprospatare.
     */
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: asteptare.r,
    });
    if (error || !data.session) {
      console.error("[mfa] emiterea sesiunii dupa verificare a esuat", {
        userId: asteptare.u, mesaj: error?.message,
      });
      const expirat = NextResponse.json(
        { error: "Sesiune expirata. Autentifica-te din nou." },
        { status: 401 },
      );
      // Si `mfa_pending`: fara el, omul ar ramane cu un cookie care il trimite
      // la /login/mfa din orice atingere de panou, dar fara sigiliul care ar
      // face pagina aceea utila.
      expirat.cookies.delete(COOKIE_ASTEPTARE);
      expirat.cookies.delete("mfa_pending");
      return expirat;
    }

    const idSesiune = claimuriDinToken(data.session.access_token)?.session_id;
    if (!idSesiune) {
      console.error("[mfa] sesiunea emisa nu a putut fi identificata", { userId: asteptare.u });
      return NextResponse.json({ error: "Nu am putut finaliza autentificarea. Incearca din nou." }, { status: 500 });
    }
    await confirmaSesiuneaMfa(asteptare.u, idSesiune);
    revalidatePath("/", "layout");

    const raspuns = NextResponse.json({
      catre: rezultat.onboardingFinalizat ? "/dashboard" : "/onboarding/details",
    });
    for (const { name, value, options } of deScris) raspuns.cookies.set(name, value, cuDurataNoastra(options));
    raspuns.cookies.delete(COOKIE_ASTEPTARE);
    raspuns.cookies.delete("mfa_pending");
    if (rezultat.onboardingFinalizat) {
      raspuns.cookies.set("onboarding_done", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
    } else {
      raspuns.cookies.delete("onboarding_done");
    }
    return raspuns;
  }

  /*
   * CALEA VECHE: sesiune deja emisa, dar neconfirmata.
   *
   * Doua cazuri reale: sesiunile deschise INAINTE de 05.08.2026 (cand parola
   * emitea sesiunea pe loc), si cazul in care sigilarea a esuat la login si
   * sesiunea a fost scrisa ca plasa de siguranta. Fara ramura asta, oamenii
   * respectivi ar fi ramas blocati intre o poarta care ii refuza si o pagina de
   * cod care nu ii poate ajuta.
   */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesiune expirata. Autentifica-te din nou." }, { status: 401 });
  }

  const rezultat = await verificaCodMfa(user.id, cod);
  if ("error" in rezultat) return NextResponse.json(rezultat, { status: 400 });

  const idSesiune = await idSesiuneCurenta(supabase);
  if (!idSesiune) {
    console.error("[mfa] sesiunea curenta nu a putut fi identificata la verificare", { userId: user.id });
    return NextResponse.json({ error: "Nu am putut finaliza autentificarea. Incearca din nou." }, { status: 500 });
  }
  await confirmaSesiuneaMfa(user.id, idSesiune);
  revalidatePath("/", "layout");

  const raspuns = NextResponse.json({
    catre: rezultat.onboardingFinalizat ? "/dashboard" : "/onboarding/details",
  });
  raspuns.cookies.delete("mfa_pending");
  return raspuns;
}
