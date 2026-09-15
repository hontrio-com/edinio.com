import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { getRepayments, getWootToken, type WootConfig, type WootRamburs } from "@/lib/woot";
import { sumaRambursului, ziuaVirarii } from "@/lib/shipping/ramburs-woot";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import type { Database } from "@/types/database.types";

/**
 * Rambursurile Woot: banii incasati de curier de la cumparator, si drumul lor inapoi.
 *
 * ═══ ⚠ CE S-A DESCHIS (15.09.2026) ═══
 *
 * Masurat in productie: prin Woot au plecat 199 de comenzi cu ramburs, aproape 15.600 lei, si
 * nimic din platforma nu spunea vreodata daca banii au fost chiar virati. 192 dintre ele stau si
 * azi pe `payment_status = 'unpaid'`, fiindca nimeni nu le-a spus altceva niciodata.
 *
 * ═══ ⚠ DE CE AICI SE POATE HOTARI, SI LA URMARIREA COLETULUI NU ═══
 *
 * Fiindca aici starile sunt DOCUMENTATE, chiar in specificatia lor, pe campul `status_id` al
 * schemei `Repayment`: `0=Cancelled, 1=Unpicked, 2=Picked up, 3=Paid, 4=External`. La starile unei
 * COMENZI nu exista nicio enumerare nicaieri, si de aceea cronul `woot-tracking` inregistreaza si
 * nu hotaraste. Aceeasi integrare, doua drumuri, doua purtari, si deosebirea nu e de gust: e a
 * documentatiei lor.
 *
 * ═══ DOUA SCRIERI, FIINDCA SUNT DOUA INTREBARI ═══
 *
 *   1. „Mi-au virat banii?" → un rand in `courier_settlements`, tabelul deschis de FAN, care se
 *      vede in `/dashboard/settlements` fara nicio schimbare de interfata: e generic pe `courier`.
 *      Numai starea 3 scrie acolo, fiindca `transfer_date` inseamna chiar ziua virarii.
 *   2. „Unde sunt banii de pe comanda asta?" → starea si suma LOR pe comanda, inclusiv „incasat de
 *      curier, inca nevirat", care in tabelul de decontari n-ar avea ce cauta.
 *
 * ⚠ CE NU FACE: nu atinge `payment_status`. „Virat" chiar inseamna ca banii au ajuns, iar cele 192
 * de comenzi ar deveni „platite" dintr-o scriere. Dar `payment_status` declanseaza si facturarea
 * automata: o singura interpretare gresita ar emite facturi in lant. Trecerea aia merita lotul ei.
 *
 * ═══ ⚠ DE CE ZILNIC, SI NU LA DOUA ORE ═══
 *
 * Virarile se fac in loturi, la zile distanta; o intrebare pe ora n-ar afla nimic nou si ar arde
 * apeluri. Acelasi ritm ca `fancourier-settlements`, care tot bani numara.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma se cere lista.
 *
 * ⚠ MULT MAI MULT DECAT PASUL CRONULUI (60 de zile fata de o zi), si dinadins: rambursul se misca
 * in saptamani, nu in ore, iar o fereastra larga inseamna ca o rulare pierduta nu pierde nimic
 * definitiv. Se recitesc randuri deja stiute, dar scrierea e idempotenta pe cheia naturala.
 */
const ZILE = 60;

/** Rambursuri pe pagina. Plafonul lor documentat e 250. */
const PER_PAGINA = 250;

/** Pagini pe magazin: plafon de siguranta, ca un raspuns stricat sa nu invarta la nesfarsit. */
const MAX_PAGINI = 20;

/** Sub `maxDuration`, cu loc de scriere la final. */
const BUGET_MS = 50_000;

type ComandaLegata = {
  id: string;
  woot_order_id: string | null;
  woot_awb_number: string | null;
  woot_cod_status_id: number | null;
  customer_name: string | null;
};

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const inceput = Date.now();
  const deLa = new Date(inceput - ZILE * 86400000).toISOString().slice(0, 10);

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, woot_config");

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „NICIUN MAGAZIN DE VERIFICAT". Fara `error`
   * destructurat, `setari` ar fi `null`, bucla n-ar avea peste ce merge, iar raspunsul ar fi
   * `{ ok: true }`: o rulare sanatoasa la vedere, care n-a numarat niciun leu.
   */
  if (eCfg) {
    await logError({
      action: "woot-repayments",
      message: `configuratiile Woot nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  let magazine = 0, rambursuri = 0, virate = 0, peComenzi = 0, esuate = 0, ramase = 0;

  for (const rand of setari ?? []) {
    const config = rand.woot_config as WootConfig | null;
    if (!config?.enabled || !config.public_key || !config.secret_key) continue;
    if (Date.now() - inceput > BUGET_MS) { ramase++; continue; }

    magazine++;
    let lista: WootRamburs[];
    try {
      lista = await toateRambursurile(config, deLa);
    } catch (e) {
      esuate++;
      await logError({
        action: "woot-repayments",
        message: `rambursurile Woot nu s-au putut citi: ${(e as Error).message}`,
        businessId: rand.business_id,
        severity: "warning",
      });
      continue;
    }

    rambursuri += lista.length;
    const r = await scrieRambursurile(admin, rand.business_id, lista);
    virate += r.virate;
    peComenzi += r.peComenzi;
  }

  console.log(
    `[woot-repayments] magazine ${magazine}, rambursuri ${rambursuri}, virate ${virate}, `
    + `pe comenzi ${peComenzi}, esuate ${esuate}, ramase ${ramase}`,
  );
  return NextResponse.json({ ok: true, magazine, rambursuri, virate, peComenzi, esuate, ramase });
}

/**
 * Lista intreaga, pagina cu pagina.
 *
 * ⚠ OPRIREA NU SE BAZEAZA DOAR PE `total`. Se opreste si cand o pagina vine goala, si la plafonul
 * de pagini: un `total` stricat de la ei ar invarti altfel bucla pana cade cronul, iar noi am
 * raporta o eroare de retea in loc de un raspuns ciudat.
 */
async function toateRambursurile(config: WootConfig, deLa: string): Promise<WootRamburs[]> {
  const token = await getWootToken(config.public_key, config.secret_key);
  const toate: WootRamburs[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINI; pagina++) {
    const { list, total } = await getRepayments(token, { page: pagina, limit: PER_PAGINA, date_from: deLa });
    if (list.length === 0) break;
    toate.push(...list);
    if (toate.length >= total) break;
  }
  return toate;
}

/** Cele doua scrieri: decontarile si starea de pe comanda. */
async function scrieRambursurile(
  admin: ReturnType<typeof createClient<Database>>,
  businessId: string,
  lista: readonly WootRamburs[],
): Promise<{ virate: number; peComenzi: number }> {
  /*
   * ⚠ IDENTITATEA E `order_id`-UL LOR, fiindca rambursul NU poarta numarul AWB: schema
   * `Repayment` n-are asa ceva. Numarul tiparit pe colet se ia din comanda noastra.
   */
  const peIdulLor = new Map<string, WootRamburs>();
  for (const r of lista) {
    const id = String(r?.order_id ?? "").trim();
    if (id && id !== "0") peIdulLor.set(id, r);
  }
  if (peIdulLor.size === 0) return { virate: 0, peComenzi: 0 };

  /* ⚠ Pe bucati: o lista lunga pusa intreaga intr-un `.in()` intra in ADRESA cererii si o rupe. */
  const comenzi: ComandaLegata[] = [];
  for (const bucata of bucatiDeIduri([...peIdulLor.keys()])) {
    const { data, error } = await admin
      .from("orders")
      .select("id, woot_order_id, woot_awb_number, woot_cod_status_id, customer_name")
      /* ⚠ Nu e filtru de prisos, e AUTORIZARE: cronul citeste cu rol de serviciu, iar
         identificatorii vin de la un furnizor, nu din baza noastra. */
      .eq("business_id", businessId)
      .in("woot_order_id", bucata);
    if (error) {
      await logError({
        action: "woot-repayments",
        message: `comenzile pentru rambursuri nu s-au putut citi: ${error.message}`,
        businessId,
        severity: "warning",
      });
      return { virate: 0, peComenzi: 0 };
    }
    comenzi.push(...(data ?? []) as ComandaLegata[]);
  }

  /* ── 1. Starea rambursului, pe comanda ─────────────────────────────────── */

  let peComenzi = 0;
  const acum = new Date().toISOString();
  for (const c of comenzi) {
    /* ⚠ Identificatorul se ia o data si se cere sa existe: pus mai jos intr-un `.eq`, un `null`
       n-ar da eroare, n-ar potrivi nimic, si scrierea ar cadea tacut. Vezi `scrieUrmarirea`. */
    const idLor = (c.woot_order_id ?? "").trim();
    const r = idLor ? peIdulLor.get(idLor) : undefined;
    if (!r) continue;
    const stare = Number(r.status_id);
    if (!Number.isInteger(stare)) continue;

    /*
     * ⚠ Se scrie doar ce s-a SCHIMBAT. Un magazin cu sute de rambursuri ar face altfel sute de
     * scrieri identice la fiecare rulare, in fiecare zi, pe cel mai mare tabel al platformei.
     */
    if (c.woot_cod_status_id === stare) continue;

    const { error } = await admin
      .from("orders")
      .update({
        woot_cod_status_id: stare,
        woot_cod_value: sumaRambursului(r),
        woot_cod_updated_at: acum,
      })
      .eq("id", c.id)
      .eq("business_id", businessId)
      /* ⚠ Si pe expedierea pe care am citit-o: intre citire si scriere comerciantul poate anula
         AWB-ul si emite altul, iar starea rambursului vechi n-are ce cauta pe cel nou. */
      .eq("woot_order_id", idLor);
    if (!error) peComenzi++;
  }

  /* ── 2. Banii VIRATI, in pagina de decontari ───────────────────────────── */

  const randuri = [];
  for (const c of comenzi) {
    const r = peIdulLor.get((c.woot_order_id ?? "").trim());
    const zi = ziuaVirarii(r);
    const suma = sumaRambursului(r);
    /*
     * ⚠ Fara ZIUA virarii sau fara suma, randul NU se scrie. `transfer_date` inseamna chiar ziua
     * in care au plecat banii; inlocuita cu „azi", ar fi o data inventata intr-o pagina de bani,
     * iar ea e si cheie: ziua gresita face un al doilea rand pentru aceiasi bani.
     */
    if (!zi || suma === null) continue;
    /* Numarul tiparit pe colet, cand il stim; altfel identificatorul expedierii la ei, care e
       singurul lucru dupa care comerciantul o mai poate cauta in contul lui. */
    const awb = (c.woot_awb_number ?? "").trim() || (c.woot_order_id ?? "").trim();
    if (!awb) continue;

    randuri.push({
      business_id: businessId,
      courier: "woot",
      awb_number: awb,
      transfer_date: zi,
      amount_collected: suma,
      recipient_name: c.customer_name,
      order_id: c.id,
      raw: r as unknown as Database["public"]["Tables"]["courier_settlements"]["Insert"]["raw"],
    });
  }

  if (randuri.length === 0) return { virate: 0, peComenzi };

  /* ⚠ `upsert` pe cheia naturala, nu `insert`: fereastra de 60 de zile reciteste in fiecare zi
     aceleasi virari, iar ele nu au voie sa se adune. */
  const { error } = await admin
    .from("courier_settlements")
    .upsert(randuri, { onConflict: "business_id,courier,awb_number,transfer_date" });

  if (error) {
    await logError({
      action: "woot-repayments",
      message: `decontarile Woot nu s-au putut scrie: ${error.message}`,
      businessId,
      severity: "warning",
    });
    return { virate: 0, peComenzi };
  }
  return { virate: randuri.length, peComenzi };
}
