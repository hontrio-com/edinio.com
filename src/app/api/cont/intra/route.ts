import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { incheieIntrarea, intraCuParola, MESAJ_INTRARE_GRESITA } from "@/lib/cont/autentificare";
import { LUNGIME_MAXIMA } from "@/lib/cont/parola";
import { logError } from "@/lib/error-logger";
import { clientIp } from "@/lib/utils/rate-limit";
import { vineDePeMagazin } from "@/lib/cont/cerere";

/**
 * „Intru cu emailul si parola."
 *
 * Raspunde `{ ok: true }` cand omul a intrat (dispozitiv cunoscut), `{ pas: "cod" }`
 * cand trebuie si codul de pe email, si 400 cu ACELASI text pentru parola
 * gresita, adresa fara cont si contul blocat (vezi `intraCuParola`).
 *
 * ⚠ E RUTA, nu actiune de server, si din doua motive:
 *   1. numai o ruta (sau o actiune) poate SCRIE un cookie; o componenta de
 *      server nu poate, iar `src/lib/supabase/server.ts` arata ce se intampla
 *      atunci: eroarea se inghite in tacere;
 *   2. actiunile de server trec toate prin poarta MFA din proxy, care ruleaza
 *      la FIECARE POST. Pentru un cumparator poarta iese pe prima linie (nu are
 *      cookie `sb-`), dar un COMERCIANT care isi rasfoieste propriul magazin
 *      are, si atunci intrarea lui ca si cumparator ar depinde de starea MFA a
 *      contului lui de panou. Pe o ruta, lucrurile raman despartite.
 *
 * ⚠ Nici emailul, nici parola nu ajung in `logError`.
 */
export async function POST(req: NextRequest) {
  /*
    ⚠ Poarta de origine, inaintea oricarei citiri: `req.json()` nu se uita la
    `Content-Type`, deci un formular de pe alt site putea trimite corpul asta cu
    cookie-ul omului. Raspunsul e 403 sec, fara sa spuna de ce.
  */
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/intra", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ eroare: "Serviciu indisponibil temporar." }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const email = typeof corp?.email === "string" ? corp.email.trim() : "";
  const parola = typeof corp?.parola === "string" ? corp.parola : "";
  if (!email || !parola) {
    return NextResponse.json({ eroare: "Scrie adresa de email si parola." }, { status: 400 });
  }
  /* O parola mai lunga decat se poate alege nu e a nimanui: refuzata fara calcul. */
  if ([...parola].length > LUNGIME_MAXIMA) {
    return NextResponse.json({ eroare: MESAJ_INTRARE_GRESITA }, { status: 400 });
  }

  const ip = clientIp(req);
  try {
    const r = await intraCuParola({ magazin, email, parola, ip });
    if (r.rezultat === "intrat") {
      await incheieIntrarea(magazin.id, r.contId, ip);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (r.rezultat === "cod") {
      return NextResponse.json(
        { pas: "cod", mesaj: "Ti-am trimis un cod pe email, ca sa confirmam ca esti tu." },
        { status: 200 },
      );
    }
    return NextResponse.json({ eroare: r.mesaj }, { status: 400 });
  } catch (e) {
    await logError({
      action: "cont/intra",
      message: `intrarea a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut deschide contul. Incearca din nou." }, { status: 500 });
  }
}
