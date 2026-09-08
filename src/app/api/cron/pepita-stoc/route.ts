import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { reproceseaza } from "@/lib/pepita/ingest";

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
 * ═══ ⚠ SI DE CE CHEAMA `reproceseaza`, IN LOC SA-SI FACA SOCOTEALA LUI ═══
 *
 * Pana pe 08.09.2026 cronul isi refacea singur cantitatile din `orders.items` si chema direct
 * functia de consum. Doua adevaruri despre aceeasi comanda, si al doilea n-avea niciuna dintre
 * pazele primului:
 *
 *   - `orders.items` poate sa nu mai fie ce ne-au trimis ei. Adaugarea unei linii de mana din
 *     panou e permisa, iar `revendicaStocul` scade deja marfa la salvare. Cronul refacea setul
 *     din `items`, deci consuma A DOUA OARA linia adaugata, si la o anulare se dadea inapoi
 *     mai putin decat se luase: bucati care dispar definitiv din stoc.
 *   - o comanda anulata inainte de orice consum ramane cu marcajul gol si FARA
 *     `stoc_eliberat_la` (n-avea ce elibera), deci cronul ii scadea stocul pentru o expediere
 *     care nu mai are loc niciodata.
 *   - motivele carantinei se recalculeaza, in loc sa se stearga doar bucata de stoc.
 *
 * `reproceseaza` le are pe toate, fiindca e aceeasi functie pe care o cheama si butonul
 * „Reprocesează" din panou, si retrimiterea lor.
 *
 * ⚠ CE NU FACE: nu creeaza comenzi, nu atinge starea comenzii si nu trimite nimic nicaieri.
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
   *
   * ⚠ `status` SI `stoc_eliberat_la` SE CER ANUME. Necerute, ar veni `undefined`, iar filtrele
   * de mai jos ar tace exact pe randurile pentru care exista.
   */
  const { data, error } = await admin
    .from("pepita_comenzi")
    .select("id, business_id, external_order_id, order_id, orders!inner(id, status, stoc_marketplace_la, stoc_eliberat_la)")
    .not("order_id", "is", null)
    .is("orders.stoc_marketplace_la", null)
    /*
     * ⚠ SI NU PE COMENZILE MOARTE.
     *
     * Comanda al carei consum a picat la sosire ramane cu `stoc_marketplace_la` NULL. Daca
     * intre timp comerciantul o anuleaza, `elibereaza_stoc_comanda` iese cu „necunoscut" si
     * NU pune `stoc_eliberat_la`, fiindca n-are ce elibera: `stoc_rezervat` e tot NULL. Deci
     * randul ramanea in interogarea asta pentru totdeauna, si prima rulare care prindea baza
     * sanatoasa scadea stocul pentru o comanda care nu pleaca niciodata.
     *
     * Cele doua verificari nu se acopera una pe alta: `stoc_eliberat_la` prinde comanda
     * anulata DUPA un consum reusit, statusul o prinde pe cea anulata inainte.
     */
    .not("orders.status", "in", "(cancelled,refunded)")
    .is("orders.stoc_eliberat_la", null)
    .order("primit_la")
    .limit(PE_TRECERE);

  if (error) {
    await logError({ action: "pepita/cron-stoc", message: `citirea a cazut: ${error.message}`, severity: "critical" });
    return NextResponse.json({ error: "citire" }, { status: 503 });
  }

  type Rand = { id: string; business_id: string; external_order_id: string; order_id: string };
  const randuri = (data ?? []) as unknown as Rand[];

  /* Moneda magazinului se citeste o data pe magazin, nu o data pe comanda. */
  const monede = new Map<string, string>();
  async function monedaMagazinului(businessId: string): Promise<string> {
    const stiuta = monede.get(businessId);
    if (stiuta) return stiuta;
    const { data: setari } = await admin
      .from("store_settings").select("currency").eq("business_id", businessId).maybeSingle();
    const m = String((setari as { currency?: string } | null)?.currency ?? "RON").toUpperCase();
    monede.set(businessId, m);
    return m;
  }

  let reparate = 0;
  let picate = 0;
  let sarite = 0;

  for (const r of randuri) {
    try {
      const rezultat = await reproceseaza(
        admin,
        { businessId: r.business_id, monedaMagazin: await monedaMagazinului(r.business_id) },
        r.external_order_id,
      );

      if (!rezultat.ok) {
        /*
         * Refuzurile lui `reproceseaza` sunt hotarari, nu pene: liniile nu mai corespund cu ce
         * ne-au trimis ei, sau comanda n-a fost scrisa niciodata. Se numara si se scriu, ca sa
         * nu para ca cronul le-a rezolvat, dar nu sunt esecuri de reincercat.
         */
        sarite++;
        await logError({
          action: "pepita/cron-stoc",
          message: `reprocesarea a refuzat comanda: ${rezultat.mesaj}`,
          details: { externalId: r.external_order_id, orderId: r.order_id },
          businessId: r.business_id, severity: "warning",
        });
        continue;
      }

      if (rezultat.stocEsuat) {
        picate++;
        await logError({
          action: "pepita/cron-stoc",
          message: "reincercarea consumului a picat",
          details: { externalId: r.external_order_id, orderId: r.order_id },
          businessId: r.business_id, severity: "critical",
        });
        continue;
      }

      reparate++;
    } catch (e) {
      /*
       * ⚠ O comanda cazuta nu opreste trecerea. `reproceseaza` arunca la o pana de baza, iar
       * fara `try` aici prima pana ar fi lasat neatinse toate comenzile de dupa ea.
       */
      picate++;
      await logError({
        action: "pepita/cron-stoc",
        message: `reprocesarea a cazut: ${e instanceof Error ? e.message : String(e)}`,
        details: { externalId: r.external_order_id, orderId: r.order_id },
        businessId: r.business_id, severity: "critical",
      });
    }
  }

  return NextResponse.json({ gasite: randuri.length, reparate, picate, sarite });
}
