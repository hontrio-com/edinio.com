import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_ASTEPTARE } from "@/lib/auth/sesiune-asteptare";

/**
 * Iesirea din cont.
 *
 * DE CE E RUTA si nu actiune de server (cum era `logout`): deconectarea trebuie
 * sa mearga MAI ALES dintr-o sesiune pe care poarta MFA o refuza — altfel omul
 * ramane inchis intr-un panou care nu-i raspunde la nimic, fara nicio usa. Iar
 * poarta opreste, prin constructie, orice actiune de server intr-o sesiune
 * neconfirmata (src/lib/auth/poarta-mfa.ts).
 *
 * Formularele trimit direct aici cu `method="post"`, deci functioneaza si fara
 * JavaScript. Raspunsul e 303, ca browserul sa continue cu GET.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  // Poate sa nu existe nicio sesiune (om aflat intre parola si cod): nu e o
  // eroare, doar nu avem ce revoca.
  await supabase.auth.signOut().catch(() => {});

  revalidatePath("/", "layout");
  const raspuns = NextResponse.redirect(new URL("/login", req.nextUrl.origin), 303);

  /*
   * Stergerea se face pe RASPUNS, nu prin `cookies()`.
   *
   * `signOut` curata prin adaptorul comun, care inghite in tacere erorile de
   * scriere. Pe o ruta de deconectare tacerea e inacceptabila: omul ar crede ca a
   * iesit, si ar ramane conectat. Aici stergerea e explicita si nu poate esua pe
   * ascuns.
   */
  const cookieStore = await cookies();
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("auth-token")) raspuns.cookies.delete(c.name);
  }
  raspuns.cookies.delete(COOKIE_ASTEPTARE);
  raspuns.cookies.delete("mfa_pending");
  raspuns.cookies.delete("onboarding_done");
  raspuns.cookies.delete("impersonare");
  return raspuns;
}
