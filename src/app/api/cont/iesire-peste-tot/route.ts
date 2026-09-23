import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta, stergeCookieContului } from "@/lib/cont/sesiune";
import { vineDePeMagazin } from "@/lib/cont/cerere";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

/**
 * „Iesi de pe toate dispozitivele": inchide TOATE sesiunile contului, si pe cea
 * de aici.
 *
 * ⚠ Functia exista in baza din migratia sesiunilor (`cont_iesi_de_peste_tot`
 * ridica epoca, deci orice jeton emis inainte moare la urmatoarea verificare),
 * dar n-o chema nimeni. Omul care si-a uitat contul deschis pe un calculator
 * strain n-avea nicio usa.
 *
 * ⚠ SPRE DEOSEBIRE de iesirea simpla, cere `Origin`: o cerere straina care iti
 * inchide TOATE sesiunile e mai mult decat o suparare, iar formularul nostru
 * trimite `Origin` la POST.
 *
 * Raspunsul e 303 spre intrare, ca formularul sa mearga si fara JavaScript.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (s) {
    const { error } = await createAdminClient().rpc("cont_iesi_de_peste_tot", {
      p_business: magazin.id,
      p_cont: s.contId,
    });
    if (error) {
      await logError({
        action: "cont/iesire-peste-tot",
        message: `inchiderea tuturor sesiunilor a esuat: ${error.message}`,
        businessId: magazin.id,
        severity: "error",
      });
      return NextResponse.redirect(new URL("/cont/date", req.nextUrl.origin), 303);
    }
  }

  /* Cookie-ul de aici se sterge oricum; jetonul lui oricum a murit odata cu epoca. */
  await stergeCookieContului();
  return NextResponse.redirect(new URL("/cont/intra", req.nextUrl.origin), 303);
}
