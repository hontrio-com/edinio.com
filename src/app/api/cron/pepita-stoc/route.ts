import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { impingeStoculPeCeleLalteCanale } from "@/lib/marketplace/stoc-pe-canale";
import { MOTIV_STOC_NEFACUT } from "@/lib/pepita/ingest";
import { scoateBucata } from "@/lib/pepita/carantina";

/**
 * Duce la capat scaderea de stoc a comenzilor Pepita la care n-a apucat sa se faca.
 *
 * ═══ ⚠ DE CE NU E DE AJUNS RASPUNSUL DE ESEC CATRE EI ═══
 *
 * Ruta raspunde 503 cand stocul n-a scazut, ca ei sa retrimita. Dar „Resend order" e un buton
 * apasat de OM in panoul lor, nu o reincercare automata: documentatia lor nu descrie niciun
 * protocol de reincercare. Deci daca nimeni nu apasa, comanda ramane cu stocul neconsumat
 * pentru totdeauna, iar celelalte cinci canale vand marfa care nu mai e.
 *
 * Cronul asta e drumul care nu depinde de nimeni.
 *
 * ⚠ CE NU FACE: nu creeaza comenzi, nu atinge starea comenzii si nu trimite nimic nicaieri.
 * Cheama exact aceeasi functie din baza ca ingestul, care e idempotenta prin marcajul
 * `orders.stoc_marketplace_la`. Deci o comanda al carei stoc a scazut deja nu patateste nimic,
 * nici daca ajunge aici din greseala.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cate comenzi se repara intr-o trecere. Larg pentru o pana scurta, marginit pentru una lunga. */
const PE_TRECERE = 50;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  /*
   * ⚠ SEMNUL E PE COMANDA, nu pe randul de evidenta: `stoc_marketplace_la` il pune chiar
   * functia din baza, in aceeasi instructiune cu scaderea. Un rand de evidenta poate spune
   * orice; marcajul ala nu poate minti.
   */
  const { data, error } = await admin
    .from("pepita_comenzi")
    .select("id, business_id, external_order_id, order_id, orders!inner(id, items, stoc_marketplace_la)")
    .not("order_id", "is", null)
    .is("orders.stoc_marketplace_la", null)
    .order("primit_la")
    .limit(PE_TRECERE);

  if (error) {
    await logError({ action: "pepita/cron-stoc", message: `citirea a cazut: ${error.message}`, severity: "critical" });
    return NextResponse.json({ error: "citire" }, { status: 503 });
  }

  type Rand = {
    id: string; business_id: string; external_order_id: string; order_id: string;
    orders: { id: string; items: unknown; stoc_marketplace_la: string | null };
  };
  const randuri = (data ?? []) as unknown as Rand[];

  let reparate = 0;
  let picate = 0;

  for (const r of randuri) {
    /*
     * ⚠ CANTITATILE SE REFAC DIN `orders.items`, nu din sarcina utila a lor.
     *
     * Sarcina bruta nu se pastreaza nicaieri, dinadins: contine datele personale ale
     * cumparatorului. Iar `items` poarta deja `product_id` si `variant_title`, scrise la ingest,
     * deci e sursa completa si e chiar ce s-a comandat.
     */
    const linii = Array.isArray(r.orders?.items) ? r.orders.items as { product_id?: unknown; variant_title?: unknown; quantity?: unknown }[] : [];
    const peProdus = new Map<string, number>();
    const peVarianta = new Map<string, { product_id: string; variant_title: string; quantity: number }>();
    for (const l of linii) {
      const pid = typeof l?.product_id === "string" ? l.product_id : null;
      const qty = Number(l?.quantity);
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
      peProdus.set(pid, (peProdus.get(pid) ?? 0) + qty);
      const vt = typeof l?.variant_title === "string" && l.variant_title ? l.variant_title : null;
      if (vt) {
        const cheie = `${pid}::${vt}`;
        const e = peVarianta.get(cheie);
        if (e) e.quantity += qty;
        else peVarianta.set(cheie, { product_id: pid, variant_title: vt, quantity: qty });
      }
    }

    const { data: rez, error: eRpc } = await admin.rpc("consuma_stoc_comanda_marketplace", {
      p_order_id: r.order_id,
      p_business_id: r.business_id,
      p_produse: [...peProdus.entries()].map(([product_id, quantity]) => ({ product_id, quantity })) as never,
      p_variante: [...peVarianta.values()] as never,
    });
    const v = rez as { gasit?: boolean } | null;

    if (eRpc || v?.gasit !== true) {
      picate++;
      await logError({
        action: "pepita/cron-stoc",
        message: `reincercarea consumului a picat: ${eRpc?.message ?? "raspuns nevalid"}`,
        details: { externalId: r.external_order_id, orderId: r.order_id },
        businessId: r.business_id, severity: "critical",
      });
      continue;
    }

    reparate++;
    await impingeStoculPeCeleLalteCanale(r.business_id, [...peProdus.keys()], "pepita");

    /*
     * ⚠ SE SCOATE DIN CARANTINA DOAR CE A FOST PUS ACOLO PENTRU STOC. O comanda ajunsa in
     * carantina fiindca are o linie nelegata are alt motiv, si acela nu s-a rezolvat: trecuta
     * pe „importata", ar fi disparut din lista comerciantului cu problema nerezolvata.
     */
    const { data: randCurent } = await admin
      .from("pepita_comenzi").select("motiv").eq("id", r.id).maybeSingle();
    const motivCurent = (randCurent as { motiv: string | null } | null)?.motiv ?? null;
    if (motivCurent?.includes(MOTIV_STOC_NEFACUT)) {
      /*
       * ⚠ SE SCOATE DOAR BUCATA LUI, nu tot motivul. Motivele se aduna: aceeasi comanda poate
       * fi in carantina si pentru o linie nelegata, si pentru stocul nescazut. Comparatia pe
       * egalitate de dinainte nu recunostea un motiv compus, deci lasa in carantina tocmai
       * comenzile pe care le reparase; iar golit de tot, motivul ar fi scos din carantina o
       * comanda cu prima problema nerezolvata. Vezi `compuneMotiv`.
       */
      const ramas = scoateBucata(motivCurent, MOTIV_STOC_NEFACUT);
      await admin.from("pepita_comenzi")
        .update({
          stare: ramas ? "carantina" : "importata",
          motiv: ramas,
          prelucrat_la: new Date().toISOString(),
        } as never)
        .eq("id", r.id);
    }
  }

  return NextResponse.json({ gasite: randuri.length, reparate, picate });
}
