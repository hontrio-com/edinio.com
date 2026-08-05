import { NextResponse } from "next/server";
import { MESAJ_REFUZ, idSesiuneCurenta, sesiuneNeconfirmataPentru } from "./stare-mfa";

/**
 * Poarta MFA pentru codul care ruleaza IN cererea Next.js: Server Components,
 * Server Actions si handlere de ruta. Foloseste cookie-urile cererii curente
 * (`next/headers`), deci NU poate fi importat din `src/proxy.ts` — acolo se
 * foloseste `./poarta-mfa.ts`, care lucreaza pe obiectul `NextRequest`.
 *
 * Semantica („sesiunea ASTA a fost confirmata cu al doilea factor?", nu „exista
 * un cod in curs?") e explicata pe larg in `./mfa.ts`.
 */

/**
 * Varianta pentru Server Components si Server Actions.
 *
 * `userId` se da cand apelantul l-a obtinut deja (layout-ul de dashboard, garda
 * de admin), ca sa nu mai facem un `getUser()` in plus.
 */
export async function sesiuneCurentaNeconfirmata(userId?: string): Promise<boolean> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  let id = userId;
  if (!id) {
    const { data: { user } } = await supabase.auth.getUser();
    // Fara utilizator nu e nimic de aparat aici: cererea e oricum respinsa de
    // garda de autentificare a apelantului.
    if (!user) return false;
    id = user.id;
  }

  return sesiuneNeconfirmataPentru(id, await idSesiuneCurenta(supabase));
}

/**
 * AL DOILEA STRAT pentru rutele de API care scot DATE (export, PDF-uri, liste).
 *
 * Poarta din proxy le acopera deja pe toate. Asta e plasa de siguranta pentru
 * cazul in care cineva umbla la `config.matcher` din src/proxy.ts si scoate din
 * nou `api/` — exact greseala care a produs constatarea 2 din audit. Rutele
 * astea intorc catalogul complet, facturi si documente fiscale, deci merita
 * verificarea de doua ori.
 *
 * Se cheama DUPA verificarea de autentificare a rutei: cine nu are sesiune
 * primeste 401 de acolo, nu 403 de aici.
 */
export async function refuzaDacaMfaNeconfirmat(userId?: string): Promise<NextResponse | null> {
  if (!(await sesiuneCurentaNeconfirmata(userId))) return null;
  return NextResponse.json({ error: MESAJ_REFUZ, mfa: "neconfirmat" }, { status: 403 });
}
