import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont } from "@/lib/cont/magazinul-cererii";
import { vineDePeMagazin } from "@/lib/cont/cerere";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { exportulMeu } from "@/lib/cont/date";
import { logError } from "@/lib/error-logger";

/**
 * Datele omului, la cerere (art. 15).
 *
 * ⚠ Contine SI retururile, SI jurnalul: tocmai cele doua lucruri pe care le
 * pastram despre el si pe care nu le vede nicaieri altundeva. Un export care le
 * lasa afara e mai rau decat niciunul.
 *
 * ⚠ E un POST, nu un GET, si nu din pedanterie: un `<a href>` catre o cale
 * interna e refuzat de lint (ar cere `<Link>`, care ar naviga in loc sa descarce),
 * iar un POST prin formular merge si fara JavaScript SI capata poarta de origine.
 * Exportul aduna tot ce stim despre om intr-un singur fisier; merita poarta.
 *
 * ⚠ `no-store`: fisierul poarta tot ce stim despre om.
 *
 * ⚠ Formularul navigheaza: un 500 in text simplu ar fi lasat omul pe o pagina
 * alba. La eroare se intoarce la „Datele mele", cu mesaj; fara sesiune, la intrare.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });

  const inapoiCuEroare = () => NextResponse.redirect(new URL("/cont/date?eroare=export", req.nextUrl.origin), 303);

  let s;
  try {
    s = await sesiuneCurenta(magazin.id);
  } catch {
    return inapoiCuEroare();
  }
  if (!s) return NextResponse.redirect(new URL("/cont/intra", req.nextUrl.origin), 303);

  try {
    const date = await exportulMeu(magazin.id, s.contId);
    const corp = JSON.stringify({ magazin: magazin.slug, generat_la: new Date().toISOString(), date }, null, 2);
    return new NextResponse(corp, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="datele-mele-${magazin.slug}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    await logError({
      action: "cont/export",
      message: `exportul a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return inapoiCuEroare();
  }
}
