import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta, stergeCookieContului } from "@/lib/cont/sesiune";
import { sesiuneExpirata, vineDePeMagazin } from "@/lib/cont/cerere";
import { parolaDinCont } from "@/lib/cont/autentificare";
import { clientIp } from "@/lib/utils/rate-limit";
import { stergeContul } from "@/lib/cont/date";
import { pregatesteCerereaDeStergere, trimiteCerereaDeStergere } from "@/lib/cont/cerere-stergere";
import { logError } from "@/lib/error-logger";

/**
 * Stergerea contului.
 *
 * ⚠⚠ STERGE CONTUL, NU COMENZILE. Venitul lunilor incheiate nu scade retroactiv
 * si facturile nu raman fara nimic in spate. Stergerea DATELOR din comenzi e cu
 * totul altceva (`customer_anonymize`) si o porneste comerciantul.
 *
 * ⚠ Si NU atinge dezabonarile: omul care cere stergerea e de multe ori chiar cel
 * care ceruse sa nu mai primeasca mesaje.
 *
 * ⚠ Se cere confirmarea scrisa („STERGE") in corp, nu doar o apasare: e
 * ireversibil, si un buton apasat din greseala nu are drum inapoi.
 *
 * ⚠⚠ Si PAROLA contului, cand are una: altfel oricine gasea contul deschis pe un
 * calculator strain il putea sterge, cu tot cu legaturile comenzilor.
 *
 * ⚠ Cu `cereStergereaDatelor: true`, magazinul primeste INAINTEA stergerii o
 * cerere de anonimizare a comenzilor (pregatita inainte, trimisa dupa). Nu se face
 * automat: comenzile sunt ale comerciantului, cu facturi si retururi deschise.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return sesiuneExpirata();

  const corp = await req.json().catch(() => null);
  if (corp?.confirmare !== "STERGE") {
    return NextResponse.json({ eroare: "Scrie STERGE ca sa confirmi." }, { status: 400 });
  }

  try {
    const v = await parolaDinCont({
      magazinId: magazin.id, contId: s.contId, parola: corp?.parola, ip: clientIp(req),
      mesajGresita: "Parola contului nu e buna.",
    });
    if (!v.ok) return NextResponse.json({ eroare: v.eroare }, { status: v.status });

    /* Datele pentru cerere se citesc INAINTE (dupa stergere nu mai sunt), dar cererea
       pleaca abia DUPA ce stergerea a reusit. */
    const vreaCerere = corp?.cereStergereaDatelor === true;
    const cerere = vreaCerere ? await pregatesteCerereaDeStergere(magazin, s.contId) : null;
    const r = await stergeContul(magazin.id, s.contId);
    const cerereTrimisa = vreaCerere && r.ok ? await trimiteCerereaDeStergere(magazin.id, cerere) : null;
    /* ⚠ Cookie-ul se sterge oricum: epoca s-a ridicat, deci sesiunea e moarta
       si fara el, dar un cookie ramas ar fi aratat ecrane de „nu esti autentificat"
       fara sa spuna de ce. */
    await stergeCookieContului();
    return NextResponse.json({ ok: r.ok, comenziRamase: r.comenziRamase, cerereTrimisa }, { status: 200 });
  } catch (e) {
    await logError({
      action: "cont/sterge",
      message: `stergerea contului a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut sterge contul. Incearca din nou." }, { status: 500 });
  }
}
