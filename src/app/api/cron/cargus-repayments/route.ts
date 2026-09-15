import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { rambursuriCargus, type CargusConfig, type RambursCargus } from "@/lib/cargus";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import type { Database } from "@/types/database.types";

/**
 * Reconcilierea rambursurilor Cargus.
 *
 * ═══ ⚠ DE CE AICI SE POATE HOTARI, SI LA URMARIREA COLETULUI NU ═══
 *
 * Fiindca aici campurile sunt STRUCTURATE si documentate, chiar in specificatia lor
 * (`CashAccount/GetByDate`): `RepaymentValue`, `RepaymentDate`, `DeductionDate`, `DeductionId`.
 * La starile unei EXPEDITII nu exista nicio enumerare nicaieri, si de aceea cronul
 * `cargus-tracking` inregistreaza si nu hotaraste. Aceeasi integrare, doua drumuri, doua
 * purtari, si deosebirea nu e de gust: e a documentatiei lor.
 *
 * ═══ ⚠ DOUA DATE, SI NU INSEAMNA ACELASI LUCRU ═══
 *
 * `RepaymentDate` e cand s-a INCASAT banul de la cumparator. `DeductionDate` e cand a plecat
 * ordinul de plata catre comerciant. Un ramburs incasat dar inca nevirat are prima si n-o are
 * pe a doua.
 *
 * ⚠ In `courier_settlements` se scrie NUMAI ce a fost VIRAT, fiindca `transfer_date` inseamna
 * chiar ziua virarii, e `not null` si intra in cheia unica. Un ramburs incasat si nevirat ar
 * trebui sa imprumute o data care nu exista, iar tabelul ar ajunge sa spuna ca banii au sosit
 * cand n-au sosit. Se lasa afara, si intra la urmatoarea rulare, cand chiar pleaca ordinul.
 *
 * ═══ ⚠ CE NU FACE ═══
 *
 * Nu atinge `payment_status`. „Virat" chiar inseamna ca banii au ajuns, dar `payment_status`
 * declanseaza si facturarea automata: o singura interpretare gresita ar emite facturi in lant.
 * Aceeasi cumpana ca la Woot.
 *
 * ⚠ Si nu scrie nimic pe comenzi: Cargus nu are inca o coloana de stare a rambursului pe
 * comanda, iar una noua ar cere o migratie pentru un drum cu ZERO trafic masurat. Cand apar
 * rambursuri adevarate, se adauga.
 *
 * ═══ ⚠ DE CE ZILNIC, SI NU LA DOUA ORE ═══
 *
 * Virarile se fac in loturi, la zile distanta; o intrebare pe ora n-ar afla nimic nou si ar
 * arde apeluri. Acelasi ritm ca `fancourier-settlements` si `woot-repayments`, care tot bani
 * numara.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma se cere lista.
 *
 * ⚠ MULT MAI MULT DECAT PASUL CRONULUI (60 de zile fata de o zi), si dinadins: rambursul se
 * misca in saptamani, nu in ore, iar o fereastra larga inseamna ca o rulare pierduta nu pierde
 * nimic. `upsert`-ul pe cheia naturala face recitirea nevinovata.
 */
const ZILE = 60;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, cargus_config");

  /* ⚠ O citire picata NU are voie sa raporteze „zero magazine": ar fi o rulare sanatoasa la
     vedere, care n-a reconciliat nimic. */
  if (eCfg) {
    await logError({
      action: "cargus-repayments",
      message: `configuratiile Cargus nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const acum = new Date();
  const deLa = new Date(acum.getTime() - ZILE * 86400000);

  let magazine = 0, virate = 0, incasateNevirate = 0, esuate = 0;

  for (const rand of setari ?? []) {
    const config = rand.cargus_config as CargusConfig | null;
    if (!config?.enabled || !config.username || !config.password || !config.subscription_key) continue;
    magazine++;

    let lista: RambursCargus[];
    try {
      lista = await rambursuriCargus(config, deLa, acum);
    } catch (e) {
      esuate++;
      await logError({
        action: "cargus-repayments",
        message: `rambursurile Cargus nu s-au putut citi: ${(e as Error).message}`,
        businessId: rand.business_id,
        severity: "warning",
      });
      continue;
    }

    const r = await scrieDecontarile(admin, rand.business_id, lista);
    virate += r.virate;
    incasateNevirate += r.incasateNevirate;
  }

  return NextResponse.json({ ok: true, magazine, virate, incasateNevirate, esuate });
}

async function scrieDecontarile(
  admin: ReturnType<typeof createClient<Database>>,
  businessId: string,
  lista: RambursCargus[],
): Promise<{ virate: number; incasateNevirate: number }> {
  /* Numai cele VIRATE ajung in tabel. Vezi nota din antet. */
  const platite = lista.filter((x) => x.ziuaVirarii !== null && x.suma > 0);
  const incasateNevirate = lista.filter((x) => x.ziuaVirarii === null && x.suma > 0).length;
  if (platite.length === 0) return { virate: 0, incasateNevirate };

  /*
   * Comanda, cautata dupa AWB, ca randul de decontare sa duca inapoi la ea.
   *
   * ⚠ `.in()` se sparge in bucati: adresa unei cereri PostgREST are o lungime, iar o lista
   * lunga de AWB-uri o depaseste tacut. Vezi `limita-in-postgrest-adresa`.
   */
  const awburi = [...new Set(platite.map((x) => x.awb))];
  const comenzi = new Map<string, { id: string; customer_name: string | null }>();
  for (const bucata of bucatiDeIduri(awburi)) {
    const { data, error } = await admin
      .from("orders")
      .select("id, customer_name, cargus_awb_number")
      .eq("business_id", businessId)
      .in("cargus_awb_number", bucata);
    /* ⚠ O citire picata aici NU opreste decontarea: randul se scrie si fara `order_id`, iar
       comerciantul tot isi vede banii. Legatura se reface la rulare urmatoare. */
    if (error) {
      await logError({
        action: "cargus-repayments",
        message: `comenzile Cargus nu s-au putut citi pentru decontare: ${error.message}`,
        businessId,
        severity: "warning",
      });
      break;
    }
    for (const c of data ?? []) {
      const awb = (c.cargus_awb_number ?? "").trim();
      if (awb) comenzi.set(awb, { id: c.id, customer_name: c.customer_name });
    }
  }

  const randuri = platite.map((x) => {
    const c = comenzi.get(x.awb);
    return {
      business_id: businessId,
      courier: "cargus",
      awb_number: x.awb,
      awb_date: x.ziuaAwb,
      transfer_date: x.ziuaVirarii!,
      /* Ziua in care banul a fost luat de la cumparator: alta intrebare decat virarea. */
      transaction_date: x.ziuaIncasarii,
      amount_collected: x.suma,
      recipient_name: x.destinatar ?? c?.customer_name ?? null,
      recipient_locality: x.localitate,
      order_id: c?.id ?? null,
      raw: x.brut as unknown as Database["public"]["Tables"]["courier_settlements"]["Insert"]["raw"],
    };
  });

  /* ⚠ `upsert` pe cheia naturala, nu `insert`: fereastra de 60 de zile reciteste in fiecare zi
     aceleasi virari, iar ele nu au voie sa se adune. */
  const { error } = await admin
    .from("courier_settlements")
    .upsert(randuri, { onConflict: "business_id,courier,awb_number,transfer_date" });

  if (error) {
    await logError({
      action: "cargus-repayments",
      message: `decontarile Cargus nu s-au putut scrie: ${error.message}`,
      businessId,
      severity: "warning",
    });
    return { virate: 0, incasateNevirate };
  }
  return { virate: randuri.length, incasateNevirate };
}
