import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { PAYMENT_METHOD_DEFAULT_LABELS, PAYMENT_PROCESSOR_TYPES, type PaymentMethodType } from "@/lib/payment-methods";
import { marfaAPlecatFaraBani, mesajulPentruComerciant } from "@/lib/orders/marfa-a-plecat-fara-bani";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import type { Database } from "@/types/database.types";

/**
 * ⚠⚠ MARFA CARE A PLECAT FARA BANI CONFIRMATI.
 *
 * Regula sta in `lib/orders/marfa-a-plecat-fara-bani.ts`, cu tot cu motivele. Aici e doar
 * scanarea si spusul.
 *
 * ═══ ⚠ FEREASTRA TINE LOC DE MEMORIE ═══
 *
 * Nu exista coloana „i-am spus deja", si nici nu e nevoie de una: se semnaleaza doar comenzile
 * ATINSE in ultimele `ore` (implicit 26, peste cadenta zilnica), deci fiecare e spusa o data,
 * chiar dupa ce s-a intamplat. O comanda care ramane asa la nesfarsit NU se re-striga: omul a
 * fost deja anuntat, iar o alarma repetata zilnic e o alarma pe care nu o mai citeste nimeni.
 *
 * ⚠ `?ore=` largeste fereastra pentru o trecere manuala peste istoric, exact ca la maturatoarea
 * de cupoane. Prima rulare peste cele doua cazuri vechi (32 si 22 de zile) se face asa.
 *
 * ═══ ⚠ SI SE SCRIE LA CLOPOTEL, NU DOAR IN JURNAL ═══
 *
 * Lectia din 16.09: cinci cronuri din saptesprezece calculau corect ca ceva merita spus si o
 * scriau intr-un jurnal pe care comerciantul nu-l deschide niciodata. `semnaleazaExpedierea` le
 * face pe amandoua, in ordinea buna.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cat de departe in urma se uita implicit. Peste cadenta zilnica, ca sa nu scape nimic. */
const ORE_IMPLICIT = 26;
const MAX_COMENZI = 500;

export async function GET(req: NextRequest) {
  /*
   * ⚠ `verificaCron` intoarce `boolean`, nu un raspuns: scris `const refuz = verificaCron(req);
   * if (refuz) return refuz;` (tiparul altor rute), cronul ar fi rulat DOAR pentru cine NU e
   * autorizat, si ar fi intors `true` in loc de un raspuns. `tsc --noEmit` a trecut; a cazut abia
   * la `npm run build`, care verifica si tipurile rutelor generate de Next.
   */
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const ore = Math.min(Math.max(Number(req.nextUrl.searchParams.get("ore")) || ORE_IMPLICIT, 1), 24 * 365);
  const de = new Date(Date.now() - ore * 3600_000).toISOString();

  /*
   * ⚠ Filtrul larg in SQL, hotararea in regula PURA.
   *
   * Se cer starile in care marfa a plecat si metodele online; restul (rambursul, restituirile,
   * comenzile anulate) le taie `marfaAPlecatFaraBani`, care e probata. Pus tot in interogare,
   * conditia ar fi trait in doua locuri si s-ar fi despartit de proba.
   */
  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select("id, business_id, order_number, payment_method, payment_status, status, total, updated_at")
    .in("status", ["shipped", "delivered"])
    .in("payment_method", [...PAYMENT_PROCESSOR_TYPES])
    .neq("payment_status", "paid")
    .gte("updated_at", de)
    .order("updated_at", { ascending: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ Citirea PRINCIPALA nu are voie sa taca: fara `error`, o baza cazuta ar da `comenzi` null,
   * bucla n-ar rula, si cronul ar raspunde vesel „zero de semnalat". Lectia de la maturatoarea
   * de cupoane, si de la cronurile de urmarire.
   */
  if (eComenzi) {
    await logError({
      action: "plati-neconfirmate",
      message: `citirea comenzilor a esuat: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const deSemnalat = (comenzi ?? []).filter(marfaAPlecatFaraBani);
  if (deSemnalat.length === 0) {
    return NextResponse.json({ ok: true, cercetate: comenzi?.length ?? 0, semnalate: 0 });
  }

  const proprietari = await proprietariiMagazinelor(admin, deSemnalat.map((o) => o.business_id));

  let semnalate = 0;
  for (const o of deSemnalat) {
    const metoda = PAYMENT_METHOD_DEFAULT_LABELS[o.payment_method as PaymentMethodType]
      ?? (o.payment_method ?? "procesator");
    await semnaleazaExpedierea(admin, {
      userId: proprietari.get(o.business_id) ?? null,
      businessId: o.business_id,
      orderId: o.id,
      tip: "warning",
      titlu: "Marfa expediata, plata neconfirmata",
      mesaj: mesajulPentruComerciant({ orderNumber: o.order_number, total: o.total, metoda }),
      actiune: "plati-neconfirmate",
      detalii: { metoda: o.payment_method, stare: o.status, starePlata: o.payment_status },
    });
    semnalate++;
  }

  return NextResponse.json({ ok: true, cercetate: comenzi?.length ?? 0, semnalate, ore });
}
