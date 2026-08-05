import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { emailUtilizator, trimiteCodMfa } from "@/lib/auth/flux-mfa";
import {
  COOKIE_ASTEPTARE,
  DURATA_ASTEPTARE_SEC,
  desigileazaSesiune,
  optiuniCookieAsteptare,
  sigileazaSesiune,
} from "@/lib/auth/sesiune-asteptare";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";

/**
 * „Trimite alt cod" de pe /login/mfa.
 *
 * DE CE EXISTA butonul: de cand poarta intreaba „sesiunea asta e confirmata?" si
 * nu „exista un cod in curs?", pagina se poate deschide si fara ca vreun cod sa
 * fi fost trimis chiar atunci — cod expirat, intoarcere dintr-o alta fila,
 * sesiune veche de dinainte de 05.08.2026. Fara retrimitere, omul ar fi ramas pe
 * un ecran care cere un cod pe care nu-l are.
 *
 * DE CE E RUTA si nu actiune de server: vezi ../verifica/route.ts.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`mfa-retrimite:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Prea multe incercari. Asteapta un minut." }, { status: 429 });
  }

  const cookieStore = await cookies();
  const asteptare = desigileazaSesiune(cookieStore.get(COOKIE_ASTEPTARE)?.value);

  if (asteptare) {
    const email = await emailUtilizator(asteptare.u);
    if (!email) {
      return NextResponse.json({ error: "Nu am putut trimite codul. Incearca din nou." }, { status: 500 });
    }
    const rezultat = await trimiteCodMfa(asteptare.u, email);
    if ("error" in rezultat) return NextResponse.json(rezultat, { status: 429 });

    /*
     * Sigiliul se reinnoieste odata cu codul.
     *
     * Altfel omul care cere un cod nou la minutul 9 ar avea 60 de secunde sa-l
     * introduca, dupa care sesiunea in asteptare dispare si trebuie sa reia
     * autentificarea. Prelungirea nu da nimic in plus cuiva care are doar parola:
     * continutul ramane cifrat si nu se transforma in sesiune fara cod, iar
     * retrimiterile sunt plafonate la 4 la 15 minute.
     *
     * Se scrie direct pe raspuns, nu prin `cookies()`: pe calea asta o scriere
     * esuata in tacere ar insemna ca omul primeste codul dar pierde sesiunea in
     * asteptare, adica un cod care nu mai deschide nimic.
     */
    const raspuns = NextResponse.json({ ok: true });
    try {
      raspuns.cookies.set(
        COOKIE_ASTEPTARE,
        sigileazaSesiune({ ...asteptare, e: Date.now() + DURATA_ASTEPTARE_SEC * 1000 }),
        optiuniCookieAsteptare(),
      );
    } catch (e) {
      console.error("[mfa] resigilarea sesiunii in asteptare a esuat", e);
    }
    return raspuns;
  }

  // Sesiune deja emisa, dar neconfirmata (vezi ../verifica/route.ts, calea veche).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sesiune expirata. Autentifica-te din nou." }, { status: 401 });
  }
  const rezultat = await trimiteCodMfa(user.id, user.email);
  if ("error" in rezultat) return NextResponse.json(rezultat, { status: 429 });
  return NextResponse.json({ ok: true });
}
