import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import {
  statusAwbSameday, statusuriPeIntervalSameday, type SamedayConfig, type SamedayStareAwb,
} from "@/lib/sameday/client";
import { cereOmul, eStareFinala, statusUrmator } from "@/lib/sameday/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor Sameday.
 *
 * ═══ DE CE A EXISTAT O GAURA AICI ═══
 *
 * Sameday era singurul curier din doisprezece fara urmarire, desi API-ul lor o ofera pe doua
 * cai. Potrivirea era exacta si se vedea in schema: cei unsprezece curieri cu cron aveau
 * fiecare o coloana `*_awb_at`; Sameday avea doar `sameday_awb_number`. Comerciantul nu afla
 * niciodata din Edinio daca un colet a fost livrat, refuzat sau s-a intors.
 *
 * ═══ ⚠ DOUA RUTE, FOLOSITE FIECARE LA CE E BUNA ═══
 *
 * `status-sync` intoarce, INTR-O SINGURA CERERE, tot ce s-a miscat in cont intr-un interval.
 * `awb/{awb}/status` intoarce sumarul unei expeditii, dar cere un apel de fiecare colet.
 *
 * Deci: o cerere `status-sync` pe magazin spune CINE s-a miscat, si numai aceia primesc
 * apelul amanuntit. La un magazin cu cincizeci de colete in drum, deosebirea e intre
 * cincizeci de cereri si doua.
 *
 * ⚠ SI TOTUSI SUMARUL, NU EVENIMENTUL. `status-sync` da evenimentul, iar un eveniment
 * administrativ („Reambalat") venit dupa livrare ar ascunde livrarea. De-aia hotararea se ia
 * mereu din `expeditionSummary`, care e cumulativ. Lectia e platita la GLS si scrisa intreaga
 * in `posta/statusuri.ts`.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la GLS si Posta: emailul de expediere pleaca DOAR din `updateOrder`,
 * care e legata de plafoanele de instiintare ale contului. Un cron n-are utilizator, deci ar
 * ocoli plafoanele.
 */

export const maxDuration = 60;

/** Cat de departe in urma ne uitam. Un colet Sameday nu traieste mai mult de atat. */
const ZILE = 21;

/**
 * ⚠ Plafonul pe rulare nu e decorativ: sunt N apeluri HTTP catre ei.
 *
 * Cu rotatia dupa `sameday_status_checked_at` (cele neintrebate de cel mai mult timp ies
 * primele), plafonul nu lasa niciodata aceleasi comenzi pe dinafara.
 */
const MAX_COMENZI = 120;

/**
 * Cat inapoi intreaba `status-sync`.
 *
 * ⚠ MULT MAI MULT DECAT PASUL CRONULUI (6h fata de 2h), si dinadins: o suprapunere de trei
 * ori inseamna ca un eveniment se poate pierde numai daca cronul e oprit sase ore. Iar cand
 * chiar se pierde, comanda tot ajunge intrebata amanuntit la randul ei prin rotatie.
 */
const FEREASTRA_SYNC_MS = 6 * 60 * 60 * 1000;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  created_at: string | null;
  sameday_awb_number: string | null;
  sameday_awb_at: string | null;
  sameday_status_id: number | null;
  sameday_status_checked_at: string | null;
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
      + " sameday_awb_number, sameday_awb_at, sameday_status_id, sameday_status_checked_at",
    )
    .not("sameday_awb_number", "is", null)
    .neq("sameday_awb_number", "")
    /*
     * ⚠ Excluderea starilor incheiate NU e acoperita de filtrul pe AWB: o comanda anulata isi
     * pastreaza numarul, deci s-ar potrivi la nesfarsit.
     */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITEREA AWB-ului, nu pe data comenzii. Pe `created_at`, o
     * comanda veche careia comerciantul ii emite AWB abia acum ar fi din start in afara
     * ferestrei: n-ar fi interogata NICIODATA.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in `or(...)`:
     * sintaxa imbricata gresita NU da eroare, da LISTA GOALA — adica urmarirea ar muri
     * complet, raportand vesel `ok: true`.
     */
    .or(`sameday_awb_at.gte.${since},sameday_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("sameday_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `comenzi` ar fi `null` si ramura urmatoare ar raspunde
   * `{ ok: true, verificate: 0 }` — o rulare sanatoasa la vedere, care n-a urmarit nimic.
   */
  if (eComenzi) {
    await logError({
      action: "sameday-tracking",
      message: `comenzile cu AWB Sameday nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const toate = (comenzi ?? []) as unknown as Comanda[];
  /* Perechea conditiei de mai sus: comenzile fara ancora raman in urmarire doar cat timp
     COMANDA e in fereastra. */
  const inFereastra = toate.filter((o) => o.sameday_awb_at !== null || (o.created_at ?? "") >= since);
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, sameday_config").in("business_id", bizIds);

  /* Fara configuratii, TOATE comenzile ar fi sarite — zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "sameday-tracking",
      message: `configuratiile Sameday nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map<string, SamedayConfig>();
  for (const r of setari ?? []) {
    const c = r.sameday_config as SamedayConfig | null;
    if (c?.enabled && c.username && c.password) configuri.set(r.business_id, c);
  }

  /*
   * ═══ PASUL IEFTIN: cine s-a miscat, o cerere pe magazin ═══
   *
   * ⚠ Daca apelul pica, NU se opreste urmarirea: multimea ramane `null`, iar mai jos asta
   * inseamna „nu stiu cine s-a miscat, deci intreaba-i pe toti". O optimizare care se strica
   * n-are voie sa devina o urmarire care nu mai vede nimic.
   */
  const miscate = new Map<string, Set<string> | null>();
  const acum = new Date();
  const deLa = new Date(acum.getTime() - FEREASTRA_SYNC_MS);

  for (const [businessId, config] of configuri) {
    try {
      const schimbari = await statusuriPeIntervalSameday(config, deLa, acum);
      miscate.set(businessId, new Set(schimbari.map((s) => s.awbNumber)));
    } catch (e) {
      miscate.set(businessId, null);
      console.error("[sameday-tracking] status-sync", businessId, (e as Error).message);
    }
  }

  let verificate = 0, mutate = 0, semnalate = 0, incheiate = 0, faraConfig = 0, esuate = 0, sarite = 0;

  for (const o of inFereastra) {
    const config = configuri.get(o.business_id);

    async function marcheazaVerificat(stare: SamedayStareAwb | null) {
      const petic: Record<string, unknown> = { sameday_status_checked_at: new Date().toISOString() };
      if (stare) {
        petic.sameday_status_id = stare.statusId ?? o.sameday_status_id;
        if (stare.eticheta) petic.sameday_status_label = stare.eticheta;
      }
      await admin.from("orders").update(petic as never).eq("id", o.id);
    }

    if (!config) {
      /* Magazinul si-a oprit integrarea, dar comenzile vechi isi pastreaza AWB-ul. */
      faraConfig++;
      await marcheazaVerificat(null);
      continue;
    }

    /*
     * ⚠ SE SARE APELUL AMANUNTIT doar cand STIM ca nu s-a miscat nimic.
     *
     * O comanda neintrebata vreodata primeste apelul oricum: la ea `status-sync` n-are ce
     * eveniment sa arate daca AWB-ul s-a emis inaintea ferestrei, iar sarind-o ar ramane
     * nevazuta pentru totdeauna.
     */
    const setMiscate = miscate.get(o.business_id);
    const nicicandIntrebata = o.sameday_status_checked_at === null;
    if (setMiscate && !nicicandIntrebata && !setMiscate.has(o.sameday_awb_number!)) {
      sarite++;
      await marcheazaVerificat(null);
      continue;
    }

    let stare: SamedayStareAwb | null;
    try {
      stare = await statusAwbSameday(config, o.sameday_awb_number!);
    } catch (e) {
      esuate++;
      console.error("[sameday-tracking]", o.sameday_awb_number, (e as Error).message);
      await marcheazaVerificat(null);
      continue;
    }

    /* ⚠ `null` inseamna 404: ei nu cunosc AWB-ul. Nu e o eroare de retea si nu se
       reincearca la nesfarsit — se marcheaza si se trece mai departe. */
    if (!stare) {
      await marcheazaVerificat(null);
      continue;
    }

    verificate++;
    await marcheazaVerificat(stare);

    const tinta = statusUrmator(o.status, stare);
    if (tinta) {
      const r = await tranzitieComandaMarketplace(admin, {
        orderId: o.id,
        businessId: o.business_id,
        status: tinta,
        sursa: "sameday",
      });
      /* ⚠ `RezultatTranzitie` e un SIR (`ok` | `reincearca` | `definitiv`), nu un obiect cu
         `.ok`. Scris ca obiect, conditia ar fi fost mereu adevarata si am fi numarat drept
         mutate si comenzile pe care tranzactia le-a refuzat. */
      if (r === "ok") {
        mutate++;
        /* Factura automata, la fel ca la ceilalti curieri: se emite la livrare.
           ⚠ Nu se lasa sa arunce: o facturare picata n-are voie sa opreasca urmarirea
           celorlalte colete, dar nici sa treaca tacut. */
        if (tinta === "delivered") {
          try {
            await maybeAutoInvoice(
              o.business_id, o.id, tinta, o.payment_status ?? "", admin as never,
            );
          } catch (e) {
            await logError({
              action: "sameday-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe livrat, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id },
              businessId: o.business_id,
              severity: "warning",
            });
          }
        }
      }
    }

    const deSpus = cereOmul(stare);
    if (deSpus) {
      semnalate++;
      await logError({
        action: "sameday-tracking",
        message: `${o.order_number ?? o.id}: ${deSpus}`,
        details: { awb: o.sameday_awb_number, incercari: stare.incercariDeLivrare },
        businessId: o.business_id,
        severity: "warning",
      });
    }

    if (eStareFinala(stare)) incheiate++;
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, incheiate, faraConfig, esuate, sarite,
  });
}
