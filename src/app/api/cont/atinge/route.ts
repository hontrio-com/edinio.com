import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta, roteste } from "@/lib/cont/sesiune";
import { vineDePeMagazin } from "@/lib/cont/cerere";

/**
 * Roteste jetonul de sesiune.
 *
 * ⚠⚠ DE CE EXISTA O RUTA NUMAI PENTRU ASTA.
 *
 * Rotirea si detectia de refolosire a jetonului erau scrise complet, in baza si
 * in TypeScript, si NU le chema nimeni: `roteste()` nu era importata nicaieri,
 * deci `cont_sesiune_roteste` nu rula niciodata, deci ramura de „jeton
 * refolosit" din `cont_sesiune_verifica` nu se aprindea niciodata. Toata plasa
 * era cod mort care arata ca o aparare.
 *
 * Motivul pentru care nu se putea chema de nicaieri: un jeton nou inseamna un
 * COOKIE nou, iar o componenta de server nu poate scrie cookie-uri. Drumul
 * obisnuit al omului prin cont e numai din pagini. Deci ori se rotea dintr-o
 * ruta, ori nu se rotea deloc.
 *
 * ⚠ Se cheama O SINGURA DATA pe sesiune, de pe ecranul de cont, numai cand baza
 * a spus `trebuie_rotit` (adica jetonul are peste 24 de ore). Un cumparator
 * anonim nu atinge niciodata ruta asta, deci proba „anonimul nu plateste nimic
 * in plus" ramane adevarata.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return NextResponse.json({ rotit: false }, { status: 200 });
  if (!s.trebuieRotit) return NextResponse.json({ rotit: false }, { status: 200 });

  const rotit = await roteste(magazin.id).catch(() => false);
  return NextResponse.json({ rotit }, { status: 200 });
}
