import { NextRequest, NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { magazinulCereriiDeCont } from "@/lib/cont/magazinul-cererii";
import { vineDePeMagazin } from "@/lib/cont/cerere";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { citesteFiltrele, parametriiFiltrelor } from "@/lib/cont/cautare-comenzi";
import { numeleRaportului, RAPORT_MAX, raportulComenzilor, tabelulRaportului } from "@/lib/cont/raport-comenzi";
import { foaiaExportului } from "@/lib/orders/export-comenzi";
import { ziuaDeAzi } from "@/lib/zi-romaneasca";
import { logError } from "@/lib/error-logger";

/**
 * Raportul de comenzi al contului, ca fisier .xlsx (cerut de un magazin, 23.11.2026).
 *
 * Da TOATE comenzile filtrului de pe ecran (cautare, stare, perioada), nu pagina: filtrele
 * vin din formular cu aceleasi nume ca in adresa listei si se citesc cu aceeasi functie
 * (`citesteFiltrele`), deci raportul si lista nu pot vorbi despre comenzi diferite.
 *
 * ⚠ E un POST prin formular, ca exportul din „Datele mele” (`/api/cont/export`): merge si fara
 * JavaScript si capata poarta de origine. Fisierul poarta nume, telefoane si adrese.
 *
 * ⚠ `no-store`, din acelasi motiv.
 *
 * ⚠ Formularul navigheaza: la eroare omul se intoarce in lista, cu filtrele lui si cu un mesaj,
 * nu ramane pe o pagina alba; fara sesiune, la intrare.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });

  /* Campurile formularului poarta numele din adresa: `q`, `stare`, `perioada`, `de_la`, `pana_la`. */
  const camp = async (): Promise<Record<string, string>> => {
    try {
      const f = await req.formData();
      const out: Record<string, string> = {};
      for (const nume of ["q", "stare", "perioada", "de_la", "pana_la"]) {
        const v = f.get(nume);
        if (typeof v === "string") out[nume] = v;
      }
      return out;
    } catch {
      return {};
    }
  };
  const filtre = citesteFiltrele(await camp());
  const inapoi = (motiv: string) => {
    const p = parametriiFiltrelor(filtre);
    return NextResponse.redirect(new URL(`/cont/comenzi?${p ? `${p}&` : ""}raport=${motiv}`, req.nextUrl.origin), 303);
  };

  let s;
  try {
    s = await sesiuneCurenta(magazin.id);
  } catch {
    return inapoi("eroare");
  }
  if (!s) return NextResponse.redirect(new URL("/cont/intra", req.nextUrl.origin), 303);

  try {
    const { randuri, total } = await raportulComenzilor(magazin.id, s.contId, filtre);
    if (randuri.length === 0) return inapoi("gol");
    const tabel = tabelulRaportului(randuri);
    /* ⚠ Plafonul se SPUNE in fisier, nu se taie in tacere: un raport cu 2.000 din 2.600 de comenzi
       care arata intreg i-ar strica omului socoteala. */
    const foaie = foaiaExportului(tabel);
    if (total > randuri.length) {
      foaie.push([{ value: `Raportul arata primele ${RAPORT_MAX} din ${total} de comenzi. Restrange perioada pentru restul.`, fontWeight: "bold" }]);
    }
    const corp = await writeXlsxFile(foaie, {
      sheet: "Comenzi",
      columns: tabel.latimi.map((width) => ({ width })),
      stickyRowsCount: 1,
    }).toBuffer();
    return new NextResponse(new Uint8Array(corp), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${numeleRaportului(magazin.slug, filtre, ziuaDeAzi())}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    await logError({
      action: "cont/comenzi/raport",
      message: `raportul de comenzi a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return inapoi("eroare");
  }
}
