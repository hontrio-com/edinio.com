import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { sesiuneExpirata, vineDePeMagazin } from "@/lib/cont/cerere";
import { anuleazaComanda, mesajulAnularii } from "@/lib/cont/date";
import { dupaAnulareaDinCont } from "@/lib/cont/anulare";
import { logError } from "@/lib/error-logger";
import { esteUuid } from "@/lib/supabase/ids";

/**
 * Anularea unei comenzi `pending`, din contul cumparatorului (H5).
 *
 * ⚠⚠ Treaba se face IN BAZA, prin `aplica_tranzitia_comenzii`, niciodata printr-un
 * `update` pe `status`. Acolo stau eliberarea stocului, desfacerea cuponului si
 * cele doua declansatoare de email marketing. Ruta asta nu face decat sa dovedeasca
 * cine cere si sa duca raspunsul inapoi.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return sesiuneExpirata();

  const corp = await req.json().catch(() => null);
  const orderId = typeof corp?.orderId === "string" ? corp.orderId : "";
  if (corp?.actiune !== "anuleaza" || !esteUuid(orderId)) {
    return NextResponse.json({ eroare: "Cerere nevalida." }, { status: 400 });
  }

  try {
    const r = await anuleazaComanda(magazin.id, s.contId, orderId);
    if (!r.ok) return NextResponse.json({ eroare: mesajulAnularii(r.motiv) }, { status: 400 });
    /* Emailul de stare, anuntul catre comerciant si GA4, ca la anularea din panou. */
    dupaAnulareaDinCont(magazin, orderId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    await logError({
      action: "cont/comanda",
      message: `anularea a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut anula comanda. Incearca din nou." }, { status: 500 });
  }
}
