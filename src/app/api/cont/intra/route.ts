import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { verificaCod, mesajulRefuzului, type FelContact } from "@/lib/cont/cod";
import { deschideSesiune } from "@/lib/cont/sesiune";
import { logError } from "@/lib/error-logger";

/**
 * „Am codul, lasa-ma inauntru."
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
 */
export async function POST(req: NextRequest) {
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
  const fel: FelContact = corp?.fel === "telefon" ? "telefon" : "email";
  const destinatie = typeof corp?.destinatie === "string" ? corp.destinatie : "";
  const cod = typeof corp?.cod === "string" ? corp.cod.trim() : "";

  if (!destinatie.trim() || !/^\d{6}$/.test(cod)) {
    return NextResponse.json({ eroare: "Codul are sase cifre." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "necunoscut";

  try {
    const r = await verificaCod(magazin, fel, destinatie, cod, ip);
    if (!r.ok || !r.contId) {
      return NextResponse.json({ eroare: mesajulRefuzului(r.motiv) }, { status: 400 });
    }
    await deschideSesiune(magazin.id, r.contId, ip === "necunoscut" ? null : ip);
    return NextResponse.json({ ok: true }, { status: 200 });
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
