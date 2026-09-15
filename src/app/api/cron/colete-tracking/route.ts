import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { getCOToken, statusCOOrder, type COConfig } from "@/lib/colete";
import {
  codulColete, eStareFinalaColete, eCodNecunoscutColete, eticheta,
  statusUrmatorColete, ultimulEvenimentColete,
} from "@/lib/shipping/statusuri-colete";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor Colete Online.
 *
 * ═══ DE CE A EXISTAT O GAURA AICI ═══
 *
 * Clientul se oprea la cotare, emitere, eticheta si dezlegare. Comerciantul nu afla niciodata
 * din Edinio ce s-a intamplat cu coletul dupa ce a plecat, desi ei au
 * `GET /order/status/{uniqueId}`.
 *
 * ═══ ⚠ O CERERE PE ORA PER COLET, SI O SPUN EI ═══
 *
 * „The requests to this endpoint are limited to once every hour for each uniqueId/awb. If you
 * want to update the status in real time use the order status change notify extra option."
 *
 * De aceea cronul merge la DOUA ore, nu mai des: asa nu atinge niciodata plafonul, oricat de
 * multe colete ar fi in drum. ⚠ Si de aceea nu exista „reincearca imediat": un `429` inseamna
 * ca noi am gresit ritmul, nu ca ei sunt cazuti.
 *
 * ⚠ NU EXISTA CERERE IN LOT. Fiecare colet se intreaba pe numele lui, spre deosebire de
 * Sameday (`status-sync`) sau Cargus (`GetDeltaEvents`), care intorc tot ce s-a miscat dintr-o
 * data. De aici si plafonul pe rulare: fiecare comanda din lot e un apel HTTP.
 *
 * ═══ ⚠ AICI COMANDA CHIAR SE MUTA, spre deosebire de Woot si Cargus ═══
 *
 * Fiindca ei dau un `code` NUMERIC plus numele in romana pe fiecare eveniment. `20800` se
 * cheama, la ei, „Colet livrat". Nu e o deducere de-a noastra, e eticheta lor.
 *
 * ⚠ DAR TABELUL NU E PUBLICAT: in toata specificatia lor exista UN SINGUR exemplu de istoric,
 * pe un drum fericit. Ce nu e in `statusuri-colete.ts` nu misca nimic si se strange pe nume in
 * raspunsul cronului, ca harta sa creasca din trafic adevarat. Codurile de refuz sau retur nu
 * apar in exemplul lor, deci nu se ghicesc.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la GLS, Posta, Sameday si Cargus: emailul de expediere pleaca DOAR din
 * `updateOrder`, care e legata de plafoanele de instiintare ale contului. Un cron n-are
 * utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/** Cat de departe in urma ne uitam. Un colet nu traieste mai mult de atat. */
const ZILE = 21;

/**
 * ⚠ Plafonul pe rulare cantareste mai mult aici decat la ceilalti: la ei nu exista cerere in
 * lot, deci fiecare comanda din lista e un apel HTTP separat.
 *
 * Cu rotatia dupa `colete_status_checked_at` (cele neintrebate de cel mai mult timp ies
 * primele), plafonul nu lasa niciodata aceleasi comenzi pe dinafara.
 */
const MAX_COMENZI = 60;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  created_at: string | null;
  colete_awb_number: string | null;
  colete_unique_id: string | null;
  colete_order_id: string | null;
  colete_awb_at: string | null;
  colete_status_code: number | null;
  colete_status_checked_at: string | null;
};

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select(
      "id, business_id, status, order_number, payment_status, created_at,"
      + " colete_awb_number, colete_unique_id, colete_order_id, colete_awb_at, colete_status_code,"
      + " colete_status_checked_at",
    )
    .not("colete_awb_number", "is", null)
    .neq("colete_awb_number", "")
    /*
     * ⚠ Excluderea starilor incheiate NU e acoperita de filtrul pe AWB: o comanda anulata isi
     * pastreaza numarul, deci s-ar potrivi la nesfarsit.
     */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii. Pe `created_at`, o comanda
     * veche careia comerciantul ii emite AWB abia acum ar fi din start in afara ferestrei:
     * n-ar fi interogata NICIODATA.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in `or(...)`:
     * sintaxa imbricata gresita NU da eroare, da LISTA GOALA, adica urmarirea ar muri complet,
     * raportand vesel `ok: true`.
     */
    .or(`colete_awb_at.gte.${since},colete_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("colete_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `comenzi` ar fi `null` si ramura urmatoare ar raspunde
   * `{ ok: true, verificate: 0 }`: o rulare sanatoasa la vedere, care n-a urmarit nimic.
   */
  if (eComenzi) {
    await logError({
      action: "colete-tracking",
      message: `comenzile cu AWB Colete Online nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const toate = (comenzi ?? []) as unknown as Comanda[];
  /* Perechea conditiei de mai sus: comenzile fara ancora raman in urmarire doar cat timp
     COMANDA e in fereastra. */
  const inFereastra = toate.filter((o) => o.colete_awb_at !== null || (o.created_at ?? "") >= since);
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, coduriNoi: [] });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, colete_config").in("business_id", bizIds);

  /* Fara configuratii, TOATE comenzile ar fi sarite: zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "colete-tracking",
      message: `configuratiile Colete Online nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map<string, COConfig>();
  for (const r of setari ?? []) {
    const c = r.colete_config as COConfig | null;
    if (c?.client_id && c.client_secret) configuri.set(r.business_id, c);
  }

  /*
   * ⚠ Jetonul se ia O SINGURA DATA pe magazin, nu pe comanda: `getCOToken` e o cerere catre
   * `auth.colete-online.ro`, iar la saizeci de comenzi ale aceluiasi magazin ar fi saizeci de
   * autentificari degeaba.
   */
  const jetoane = new Map<string, string | null>();
  async function jetonul(businessId: string, config: COConfig): Promise<string | null> {
    if (jetoane.has(businessId)) return jetoane.get(businessId)!;
    try {
      const t = await getCOToken(config.client_id, config.client_secret);
      jetoane.set(businessId, t);
      return t;
    } catch (e) {
      jetoane.set(businessId, null);
      console.error("[colete-tracking] autentificare", businessId, (e as Error).message);
      return null;
    }
  }

  let verificate = 0, mutate = 0, incheiate = 0, faraConfig = 0, esuate = 0;
  /* ⚠ Codurile pe care nu le stim, stranse pe nume: din ele creste harta. Vezi antetul. */
  const coduriNoi = new Set<string>();

  for (const o of inFereastra) {
    const config = configuri.get(o.business_id);
    if (!config) {
      /* Magazinul si-a oprit integrarea, dar comenzile vechi isi pastreaza AWB-ul. */
      faraConfig++;
      await marcheaza(o);
      continue;
    }

    const token = await jetonul(o.business_id, config);
    if (!token) { esuate++; await marcheaza(o); continue; }

    /*
     * ⚠ `uniqueId` intai: documentatia lor spune ca numai el merge mereu („If the order has
     * no awb, only searching by the uniqueId will work"). Numarul de AWB e doar rezerva.
     *
     * ⚠ SI DOUA COLOANE PENTRU EL, fiindca pana pe 15.09.2026 doar `colete_order_id` era
     * scrisa, desi `colete_unique_id` are numele potrivit. Comenzile vechi o au goala.
     */
    const identificator = (o.colete_unique_id ?? "").trim()
      || (o.colete_order_id ?? "").trim()
      || (o.colete_awb_number ?? "").trim();
    if (!identificator) { await marcheaza(o); continue; }

    let stare: Awaited<ReturnType<typeof statusCOOrder>>;
    try {
      stare = await statusCOOrder(token, config.sandbox ?? false, identificator);
    } catch (e) {
      esuate++;
      console.error("[colete-tracking]", identificator, (e as Error).message);
      await marcheaza(o);
      continue;
    }

    if (!stare) { await marcheaza(o); continue; }

    const ultim = ultimulEvenimentColete(stare.istoric);
    const cod = codulColete(ultim);
    if (eCodNecunoscutColete(cod)) coduriNoi.add(`${cod}=${eticheta(ultim) || "?"}`);

    verificate++;
    const scris = await scrie(o, ultim, cod);
    if (eStareFinalaColete(cod)) incheiate++;

    /*
     * ⚠ TRANZITIA DOAR DUPA CE STAREA CHIAR S-A SCRIS. `scrieUrmarirea` refuza scrierea cand
     * intre citire si acum expedierea s-a schimbat; mutata oricum, comanda ar fi dusa de
     * starea unui colet care nu mai e al ei.
     */
    if (!scris) continue;

    const tinta = statusUrmatorColete(o.status, cod);
    if (!tinta) continue;

    const r = await tranzitieComandaMarketplace(admin, {
      orderId: o.id,
      businessId: o.business_id,
      status: tinta,
      sursa: "colete",
      expediere: { coloana: "colete_awb_number", valoare: o.colete_awb_number },
    });
    /* ⚠ `RezultatTranzitie` e un SIR (`ok` | `reincearca` | `definitiv`), nu un obiect cu
       `.ok`. Scris ca obiect, conditia ar fi fost mereu adevarata. */
    if (r !== "ok") continue;
    mutate++;

    if (tinta === "delivered") {
      /* ⚠ Nu se lasa sa arunce: o facturare picata n-are voie sa opreasca urmarirea celorlalte
         colete, dar nici sa treaca tacut. */
      try {
        await maybeAutoInvoice(o.business_id, o.id, tinta, o.payment_status ?? "", admin as never);
      } catch (e) {
        await logError({
          action: "colete-tracking",
          message: `comanda ${o.order_number ?? o.id} a trecut pe livrat, dar facturarea automata a esuat: ${(e as Error).message}`,
          details: { orderId: o.id },
          businessId: o.business_id,
          severity: "warning",
        });
      }
    }
  }

  return NextResponse.json({
    ok: true, verificate, mutate, incheiate, faraConfig, esuate,
    /* ⚠ Codurile noi se raporteaza pe nume: din ele se va creste harta. */
    coduriNoi: [...coduriNoi],
  });

  /**
   * Marcajul singur, pentru drumurile care nu afla nimic.
   *
   * ⚠ SE SCRIE NECONDITIONAT. Aici se ajunge de pe drumurile care nu ating furnizorul sau nu
   * afla nimic: magazin fara config, autentificare picata, apel picat. Ele nu aduc nicio stare,
   * deci n-au ce ateriza gresit pe alta expediere, iar o conditie ar putea doar sa impiedice
   * marcajul, adica sa infometeze coada. Vezi `scrieUrmarirea`.
   *
   * ⚠ `business_id` NU E UN FILTRU DE PRISOS, E AUTORIZARE: cronul scrie cu rol de SERVICIU,
   * deci RLS nu-l opreste.
   */
  async function marcheaza(o: Comanda) {
    await admin.from("orders")
      .update({ colete_status_checked_at: new Date().toISOString() })
      .eq("id", o.id).eq("business_id", o.business_id);
  }

  /** Starea lor, scrisa pe expedierea pe care am citit-o. `true` cand chiar s-a scris. */
  async function scrie(
    o: Comanda,
    ultim: ReturnType<typeof ultimulEvenimentColete>,
    cod: string | null,
  ): Promise<boolean> {
    const numar = cod !== null ? Number(cod) : null;
    const text = eticheta(ultim);
    const cand = typeof ultim?.dateTime === "string" ? ultim.dateTime : null;

    /*
     * ⚠ SE SCRIE PE EXPEDIEREA PE CARE AM CITIT-O.
     *
     * Intre citirea lotului si randul asta a trecut un apel la ei. Daca intre timp
     * comerciantul a dezlegat AWB-ul si a emis din nou, starea de aici e a expedierii VECHI:
     * scrisa orbeste, un cod FINAL ar scoate expedierea NOUA din urmarire pentru totdeauna.
     */
    const r = await scrieUrmarirea(admin, {
      orderId: o.id,
      businessId: o.business_id,
      identitate: { coloana: "colete_awb_number", valoare: o.colete_awb_number },
      stare: {
        ...(numar !== null && Number.isFinite(numar) ? { colete_status_code: numar } : {}),
        ...(text ? { colete_status_label: text } : {}),
        ...(cand ? { colete_status_at: cand } : {}),
      } as Database["public"]["Tables"]["orders"]["Update"],
      marcaj: { colete_status_checked_at: new Date().toISOString() },
      actiune: "colete-tracking",
      orderNumber: o.order_number,
    });
    return r.scris;
  }
}
