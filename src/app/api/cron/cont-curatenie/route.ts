import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

/**
 * Curatenia zonei de cont: retentia, pe bune.
 *
 * ⚠⚠ EXISTA FIINDCA INDEXURILE EXISTAU DEJA. Cele patru indexuri `*_curatenie`
 * fusesera facute in migratia de temelie pentru un cron care nu era scris. Un
 * index fara cititor e o promisiune goala, iar retentia promisa in sablonul de
 * confidentialitate al FIECARUI magazin („date tehnice: maxim 12 luni") nu se
 * tine singura.
 *
 * Ce sterge, si de ce atat:
 *   - sesiuni incheiate, sau expirate, de peste 30 de zile (poarta IP-uri; pana pe
 *     24.09.2026 cele expirate de care nu se mai atingea nimeni ramaneau pe veci);
 *   - coduri expirate de peste o zi (o zi ca sa se poata vedea, la nevoie, ca a
 *     fost cerut unul);
 *   - `cont_jurnal` mai vechi de 12 luni, fiindca poarta IP-uri;
 *   - contacte blocate al caror termen a trecut: un blocaj care nu se scurge nu
 *     e retentie, e o pedeapsa pe viata pusa pe o data personala;
 *   - instiintari deja trimise, mai vechi de 30 de zile;
 *   - dispozitivele de incredere expirate.
 *
 * ⚠ NU atinge randurile conturilor sterse: raman GOALE (fara contacte, parola,
 * sesiuni sau jurnal), numai cu data stergerii, ca sa se poata raspunde
 * la „de ce nu mai pot intra", si fiindca randul e deja golit de date.
 *
 * ⚠ Cronul isi scrie urma in raspuns, si esecul ajunge in `error_logs`: cinci
 * din cele saptesprezece cronuri ale casei semnalau unde nu ajungea nimeni.
 */
export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { data, error } = await createAdminClient().rpc("cont_curatenie");
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) ?? null;
    const sters = {
      sesiuni: Number(r?.sesiuni ?? 0),
      coduri: Number(r?.coduri ?? 0),
      jurnal: Number(r?.jurnal ?? 0),
      blocate: Number(r?.blocate ?? 0),
      instiintari: Number(r?.instiintari ?? 0),
      dispozitive: Number(r?.dispozitive ?? 0),
    };
    console.log("[cron] cont-curatenie", sters);
    return NextResponse.json({ ok: true, sters });
  } catch (e) {
    await logError({
      action: "cron/cont-curatenie",
      message: `curatenia zonei de cont a esuat: ${String(e)}`,
      severity: "error",
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
