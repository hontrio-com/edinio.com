import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { dataFanIso, getFanCourierBankTransfers, type FanCourierConfig, type VirareFan } from "@/lib/fancourier";
import type { Database } from "@/types/database.types";

/**
 * Decontarile FAN: banii incasati la livrare si virati comerciantului.
 *
 * ═══ ⚠ CE S-A DESCHIS (13.09.2026) ═══
 *
 * Platforma calcula de mult CAT ramburs sa incaseze curierul, dar nu stia niciodata daca banii
 * au si fost virati inapoi. Niciun curier din cei cincisprezece n-avea asa ceva: cele patru
 * croane `*-reconcile` privesc platile ONLINE ale cumparatorului, nu banii intorsi de curier.
 *
 * ═══ ⚠ DE CE MERGE ZI CU ZI, SI DE CE ARE CURSOR ═══
 *
 * `reports/bank-transfers` cere `date` OBLIGATORIU si raspunde pentru o SINGURA zi. Nu exista
 * interval. Deci, spre deosebire de toate celelalte croane din platforma, aici nu se poate
 * rescana o fereastra: trebuie mers zi cu zi si tinut minte unde s-a ajuns.
 *
 * ⚠ CURSORUL NU SE DEDUCE DIN TABEL. Tentatia e `max(transfer_date)` din `courier_settlements`,
 * fara nicio stare in plus. Dar o zi FARA nicio virare (weekend, sarbatoare, magazin care n-a
 * expediat) nu misca acel maxim niciodata: cronul ar reinterogat aceeasi zi la nesfarsit si
 * n-ar ajunge niciodata la ziua de azi. Cursorul se scrie explicit, in
 * `fan_courier_config.last_settlement_date`, prin `jsonb_merge_config` (ca `last_pickup_date`),
 * ca o salvare de setari facuta in acelasi timp sa nu-l stearga.
 *
 * ⚠ SI SE MUTA ABIA DUPA CE ZIUA A FOST CONSUMATA INTREAGA, inclusiv toate paginile ei. Mutat
 * mai devreme, paginile ramase n-ar mai fi cerute niciodata: bani pierduti tacut, si tocmai la
 * magazinele mari, care au mai mult de o pagina pe zi.
 *
 * ⚠ ZIUA DE AZI NU SE CONSUMA NICIODATA. Virarile se posteaza peste noapte; o zi inca deschisa,
 * memorata drept completa, ar ingropa definitiv ce soseste mai tarziu in aceeasi zi.
 *
 * ═══ ⚠ SCRIEREA E IDEMPOTENTA ═══
 *
 * O rulare intrerupta reia aceeasi zi. Cheia naturala e virarea (`business_id, courier,
 * awb_number, transfer_date`), iar suma NU e in cheie: o corectura de la curier suprascrie,
 * nu se aduna.
 */

export const maxDuration = 60;

/** Cate zile se recupereaza la prima rulare pentru un magazin. Hotarat cu proprietarul. */
const ZILE_LA_PRIMA_RULARE = 30;

/** Cate zile se consuma cel mult intr-o rulare, ca o recuperare lunga sa nu tina cronul ocupat. */
const MAX_ZILE_PE_RULARE = 10;

/** Pagini pe zi: plafon de siguranta, ca un raspuns stricat sa nu invarta la nesfarsit. */
const MAX_PAGINI_PE_ZI = 50;

/** Virari cerute deodata. FAN nu documenteaza un plafon; 100 e sub orice prag obisnuit. */
const PER_PAGINA = 100;

/** Sub `maxDuration`, cu loc de scriere la final. */
const BUGET_MS = 50_000;

/** Are magazinul cu ce intreba? Aceleasi campuri ca la emitere. */
function fanGata(config: FanCourierConfig | null | undefined): config is FanCourierConfig {
  return !!(config?.enabled && config.username && config.password && config.client_id);
}

/** „2026-09-13" dintr-un moment, in UTC. */
function ziISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Ultima zi pe care avem voie sa o consumam: IERI.
 *
 * ⚠ Se socoteste in UTC, si e destul de bine aici dinadins: cronul ruleaza la 05:27 ora
 * Romaniei, adica 02:27 sau 03:27 UTC, deci aceeasi zi calendaristica in amandoua fusurile.
 * O socoteala cu fus ar cere o biblioteca de zone pentru un castig de zero.
 */
function ieri(): string {
  return ziISO(Date.now() - 86400000);
}

/** Ziua urmatoare celei date. */
function ziuaUrmatoare(zi: string): string {
  return ziISO(Date.parse(`${zi}T00:00:00Z`) + 86400000);
}

/** Numar dintr-un camp care poate veni si ca sir. `null` cand nu se poate citi. */
function suma(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

/** Text scurt sau `null`; niciodata sirul gol, ca sa nu umple coloanele cu nimic. */
function text(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return t || null;
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const termen = Date.now() + BUGET_MS;
  const pana = ieri();

  let magazine = 0;
  let zile = 0;
  let virari = 0;
  let legate = 0;
  let esuate = 0;

  /*
   * Se citesc DOAR magazinele cu FAN pornit. `fan_courier_config` e in vederea care
   * decripteaza, deci parola vine gata de folosit.
   */
  const { data: setari, error: eSetari } = await admin
    .from("store_settings")
    .select("business_id, fan_courier_config")
    .not("fan_courier_config", "is", null);

  if (eSetari) {
    await logError({
      action: "fancourier-settlements",
      message: `configuratiile FAN Courier nu s-au putut citi: ${eSetari.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "configuratii necitite" }, { status: 503 });
  }

  for (const rand of setari ?? []) {
    if (Date.now() >= termen) break;
    const config = rand.fan_courier_config as FanCourierConfig | null;
    if (!fanGata(config)) continue;
    magazine++;

    /*
     * ⚠ Fara cursor, se porneste cu 30 de zile in urma, nu de la zero si nu de azi.
     * De la zero ar fi sute de cereri pentru zile in care magazinul nici n-avea FAN; doar de
     * azi inainte ar insemna ca o pana de trei zile a cronului pierde definitiv acele zile.
     */
    const ultima = (config.last_settlement_date ?? "").trim();
    let zi = /^\d{4}-\d{2}-\d{2}$/.test(ultima)
      ? ziuaUrmatoare(ultima)
      : ziISO(Date.now() - ZILE_LA_PRIMA_RULARE * 86400000);

    let consumate = 0;
    while (zi <= pana && consumate < MAX_ZILE_PE_RULARE && Date.now() < termen) {
      let pagina = 1;
      let adunate = 0;
      let total = 0;
      let ziuaEIntreaga = true;

      try {
        while (pagina <= MAX_PAGINI_PE_ZI) {
          const r = await getFanCourierBankTransfers(config, zi, pagina, PER_PAGINA);
          total = r.total;
          if (r.virari.length > 0) {
            virari += r.virari.length;
            legate += await scrieVirarile(admin, rand.business_id, zi, r.virari);
          }
          adunate += r.virari.length;
          /* Ultima pagina: fie n-a mai venit nimic, fie s-a strans cat spune plicul. */
          if (r.virari.length === 0 || adunate >= total) break;
          pagina++;
        }
        if (pagina > MAX_PAGINI_PE_ZI) {
          ziuaEIntreaga = false;
          await logError({
            action: "fancourier-settlements",
            message: `ziua ${zi} are peste ${MAX_PAGINI_PE_ZI} pagini de virari; cursorul NU s-a mutat.`,
            details: { zi, total },
            businessId: rand.business_id, severity: "warning",
          });
        }
      } catch (e) {
        ziuaEIntreaga = false;
        esuate++;
        console.error("[fancourier-settlements]", rand.business_id, zi, (e as Error).message);
      }

      /*
       * ⚠ CURSORUL SE MUTA DOAR PE O ZI INTREAGA. Mutat si dupa un esec sau dupa o zi taiata
       * de plafonul de pagini, ziua aceea n-ar mai fi ceruta niciodata, iar banii ei ar
       * disparea tacut din evidenta.
       */
      if (!ziuaEIntreaga) break;

      const { error: eCursor } = await admin.rpc("jsonb_merge_config", {
        p_business_id: rand.business_id,
        p_column: "fan_courier_config",
        p_patch: { last_settlement_date: zi } as never,
      });
      if (eCursor) {
        /* Nemutat, ziua se reia la rularea urmatoare: scrierea e idempotenta, deci e sigur. */
        console.error("[fancourier-settlements] cursorul nu s-a mutat:", eCursor.message);
        break;
      }

      zile++;
      consumate++;
      zi = ziuaUrmatoare(zi);
    }
  }

  console.log(
    `[fancourier-settlements] magazine ${magazine}, zile ${zile}, virari ${virari}, legate ${legate}, esuate ${esuate}`,
  );
  return NextResponse.json({ ok: true, magazine, zile, virari, legate, esuate });
}

/**
 * Scrie virarile unei zile si le leaga de comenzi. Intoarce cate au fost legate.
 *
 * ⚠ `upsert` pe cheia naturala, nu `insert`: aceeasi zi se reia ori de cate ori e nevoie.
 */
async function scrieVirarile(
  admin: ReturnType<typeof createClient<Database>>,
  businessId: string,
  zi: string,
  lista: readonly VirareFan[],
): Promise<number> {
  const randuri = [];
  for (const v of lista) {
    const awb = text(v.info?.awbNumber);
    const incasat = suma(v.info?.amountCollected);
    /*
     * ⚠ Fara AWB sau fara suma, randul NU se scrie. O virare fara numar nu se poate lega de
     * nicio comanda si n-ar fi decat o cifra orfana intr-o pagina de bani.
     */
    if (!awb || incasat === null) continue;
    randuri.push({
      business_id: businessId,
      courier: "fancourier",
      awb_number: awb,
      /* ⚠ Datele vin „27.02.2023", nu ISO. Vezi `dataFanIso`. */
      awb_date: dataFanIso(v.info?.awbDate),
      /* Ziua ceruta e autoritara: raspunsul ar putea sa n-o poarte, dar noi stim pe ce zi am cerut. */
      transfer_date: dataFanIso(v.info?.transferDate) ?? zi,
      transaction_date: dataFanIso(v.info?.transactionDate),
      amount_collected: incasat,
      content: text(v.info?.content),
      return_awb_number: text(v.info?.returnAwbNumber),
      reimbursement_awb_number: text(v.info?.reimbursementAwbNumber),
      recipient_name: text(v.recipient?.name),
      recipient_locality: text(v.recipient?.address?.locality),
      raw: v as unknown as Database["public"]["Tables"]["courier_settlements"]["Insert"]["raw"],
    });
  }
  if (randuri.length === 0) return 0;

  const { error } = await admin
    .from("courier_settlements")
    .upsert(randuri, { onConflict: "business_id,courier,awb_number,transfer_date" });
  if (error) {
    console.error("[fancourier-settlements] virarile nu s-au scris:", error.message);
    return 0;
  }

  /*
   * ⚠ LEGAREA DE COMANDA E SEPARATA, si ramane optionala.
   *
   * Un AWB emis din afara platformei nu are comanda la noi, si tocmai despre acela are
   * comerciantul cel mai mult nevoie sa afle. De aia `order_id` e anulabil si o potrivire
   * negasita nu opreste nimic.
   */
  const awburi = randuri.map((r) => r.awb_number);
  const { data: comenzi } = await admin
    .from("orders")
    .select("id, fan_courier_awb_number")
    .eq("business_id", businessId)
    .in("fan_courier_awb_number", awburi);

  let legate = 0;
  for (const c of comenzi ?? []) {
    if (!c.fan_courier_awb_number) continue;
    const { error: eLeg } = await admin
      .from("courier_settlements")
      .update({ order_id: c.id })
      .eq("business_id", businessId)
      .eq("courier", "fancourier")
      .eq("awb_number", c.fan_courier_awb_number)
      .is("order_id", null);
    if (!eLeg) legate++;
  }
  return legate;
}
