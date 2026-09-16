import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import {
  statusAwbSameday, statusuriPeIntervalSameday, type SamedayConfig, type SamedayStareAwb,
} from "@/lib/sameday/client";
import { cereOmul, eStareFinala, statusUrmator } from "@/lib/sameday/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import {
  proprietariiMagazinelor, semnaleazaExpedierea, stareaSaSchimbat,
} from "@/lib/orders/semnalarea-ajunge-la-om";
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

/**
 * Cate retururi se intreaba pe rulare.
 *
 * Mult mai mic decat plafonul drumului dus, si dinadins: masurat pe 15.09.2026, ZERO AWB-uri de
 * retur emise in toata viata platformei. Un plafon mare aici ar fi doar timp luat din cele 60 de
 * secunde ale rutei, pe o coada care azi e goala.
 */
const MAX_RETURURI = 40;

type Retur = {
  id: string;
  business_id: string;
  order_number: string | null;
  created_at: string | null;
  sameday_return_awb_number: string | null;
  sameday_return_awb_at: string | null;
  sameday_return_status_id: number | null;
  sameday_return_status_checked_at: string | null;
};

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

  /*
   * COLETELE CARE SE INTORC, citite AICI ca sa imparta configurarile si `status-sync`.
   *
   * Doua deosebiri fata de drumul dus, amandoua dinadins:
   *
   *   1. NU se filtreaza pe `status`-ul comenzii. Returul traieste taman pe comenzile INCHEIATE
   *      (`delivered`, uneori `refunded`); copiat orbeste filtrul fratelui lui, n-ar vedea nimic.
   *   2. Conditia de iesire e `sameday_return_incheiat_la is null`, nu starea comenzii: un retur
   *      ajuns nu mai are ce spune, iar marcajul opreste si semnalul de a doua oara.
   */
  const { data: retururiBrute, error: eRetur } = await admin
    .from("orders")
    .select(
      "id, business_id, order_number, created_at, sameday_return_awb_number,"
      + " sameday_return_awb_at, sameday_return_status_id, sameday_return_status_checked_at",
    )
    .not("sameday_return_awb_number", "is", null)
    .neq("sameday_return_awb_number", "")
    .is("sameday_return_incheiat_la", null)
    .or(`sameday_return_awb_at.gte.${since},sameday_return_awb_at.is.null`)
    .order("sameday_return_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_RETURURI);

  /* Ca la fratele de deasupra: o citire picata NU are voie sa raporteze „zero de verificat". */
  if (eRetur) {
    await logError({
      action: "sameday-tracking",
      message: `retururile Sameday nu s-au putut citi: ${eRetur.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const retururi = ((retururiBrute ?? []) as unknown as Retur[])
    .filter((r) => r.sameday_return_awb_at !== null || (r.created_at ?? "") >= since);

  /* Nimic de facut pe niciuna din cozi: nu se mai cer nici configurarile. */
  if (inFereastra.length === 0 && retururi.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0, retururi: 0 });
  }

  /* Configurarile se incarca O SINGURA DATA, pentru amandoua cozile. */
  const bizIds = [...new Set([
    ...inFereastra.map((o) => o.business_id),
    ...retururi.map((r) => r.business_id),
  ])];

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

  /* ⚠ Proprietarii, o singura data pe rulare: fara `user_id` notificarea n-are unde sa mearga. */
  const proprietari = await proprietariiMagazinelor(admin, inFereastra.map((o) => o.business_id));

  let verificate = 0, mutate = 0, semnalate = 0, incheiate = 0, faraConfig = 0, esuate = 0, sarite = 0;

  for (const o of inFereastra) {
    const config = configuri.get(o.business_id);

    async function marcheazaVerificat(stare: SamedayStareAwb | null) {
      const marcaj = { sameday_status_checked_at: new Date().toISOString() };

      /*
       * ⚠ FARA STARE NOUA, SE SCRIE DOAR MARCAJUL, NECONDITIONAT.
       *
       * Aici se ajunge de pe drumurile care nu ating furnizorul sau nu afla nimic: magazin fara
       * config, AWB nemiscat, apel picat, 404. Ele nu aduc nicio stare, deci n-au ce ateriza
       * gresit pe alta expediere, iar o conditie ar putea doar sa impiedice marcajul, adica sa
       * infometeze coada. Vezi `scrieUrmarirea`.
       *
       * ⚠ `business_id` NU E UN FILTRU DE PRISOS, E AUTORIZARE (14.09.2026).
       *
       * Randul asta era singurul scriitor de urmarire de pe platforma care scria dupa `id` gol.
       * Ceilalti doisprezece frati ai lui il au, iar cronul Pall-Ex are chiar propozitia asta
       * scrisa deasupra.
       */
      if (!stare) {
        await admin.from("orders").update(marcaj).eq("id", o.id).eq("business_id", o.business_id);
        return;
      }

      /*
       * ⚠ SI CU STARE, SE SCRIE PE EXPEDIEREA PE CARE AM CITIT-O (14.09.2026).
       *
       * Intre citirea lotului si randul asta a trecut un apel la Sameday, iar tura are 120 de
       * comenzi. Daca intre timp comerciantul a detasat AWB-ul si a emis din nou, starea de aici
       * e a expedierii VECHI: scrisa orbeste, un status FINAL ar scoate expedierea NOUA din
       * urmarire pentru totdeauna, tacut.
       *
       * ⚠ Ordinea din fisierul asta NU se schimba: la Sameday marcajul se scrie INAINTEA
       * tranzitiei, spre deosebire de ceilalti. Se desparte doar starea de marcaj, nu si sirul.
       */
      const stareNoua: Database["public"]["Tables"]["orders"]["Update"] = {
        sameday_status_id: stare.statusId ?? o.sameday_status_id,
        ...(stare.eticheta ? { sameday_status_label: stare.eticheta } : {}),
      };

      await scrieUrmarirea(admin, {
        orderId: o.id,
        businessId: o.business_id,
        identitate: { coloana: "sameday_awb_number", valoare: o.sameday_awb_number },
        stare: stareNoua,
        marcaj,
        actiune: "sameday-tracking",
        orderNumber: o.order_number,
      });
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
        expediere: { coloana: "sameday_awb_number", valoare: o.sameday_awb_number },
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

    /*
     * ⚠⚠ SE SEMNALEAZA DOAR SCHIMBAREA, SI SEMNALUL AJUNGE LA OM.
     *
     * Pana azi randurile astea scriau numai in `error_logs`, pe care comerciantul nu-l vede,
     * si o faceau la fiecare rulare. Sameday e unul dintre cele trei transportatoare care au
     * miscat vreodata un colet. Vezi `semnalarea-ajunge-la-om`.
     */
    const deSpus = cereOmul(stare);
    if (deSpus && stareaSaSchimbat(o.sameday_status_id, stare.statusId)) {
      semnalate++;
      const comanda = o.order_number ? `Comanda ${o.order_number}` : "O comanda";
      await semnaleazaExpedierea(admin, {
        userId: proprietari.get(o.business_id) ?? null,
        businessId: o.business_id,
        orderId: o.id,
        orderNumber: o.order_number,
        awb: o.sameday_awb_number,
        tip: "sameday",
        titlu: "Expediere Sameday care cere atentie",
        mesaj: `${comanda}: expedierea ${o.sameday_awb_number} cere o decizie: ${deSpus} Deschide comanda pentru istoricul complet.`,
        actiune: "sameday-tracking",
        detalii: { incercari: stare.incercariDeLivrare, stare: stare.statusId },
      });
    }

    if (eStareFinala(stare)) incheiate++;
  }

  /*
   * ═══ COLETELE CARE SE INTORC ═══
   *
   * ⚠ RETURUL NU MUTA COMANDA, SI NU DIN PRUDENTA.
   *
   * Pe drumul dus, „livrat" inseamna ca s-a incheiat cu bine. Pe drumul de intors inseamna EXACT
   * PE DOS: marfa a ajuns inapoi la comerciant. Ce urmeaza e o hotarare de BANI (se returneaza
   * plata? se reexpediaza? se refuza returul?), iar aia nu se ia de la un transportator. Aici se
   * inregistreaza si se SEMNALEAZA, si atat.
   */
  let returVerificate = 0, returIncheiate = 0, returEsuate = 0;

  for (const r of retururi) {
    const config = configuri.get(r.business_id);
    const acumIso = new Date().toISOString();

    /* Ca la drumul dus: marcajul se scrie NECONDITIONAT, altfel coada se infometeaza. */
    async function marcheazaReturul(petic: Record<string, unknown>) {
      await admin.from("orders").update(petic as never)
        .eq("id", r.id).eq("business_id", r.business_id);
    }

    if (!config) {
      await marcheazaReturul({ sameday_return_status_checked_at: acumIso });
      continue;
    }

    /*
     * ⚠ Acelasi ocol ieftin ca la drumul dus, cu aceeasi paza: un retur neintrebat vreodata
     * primeste apelul oricum, altfel ar ramane nevazut pentru totdeauna.
     */
    const setMiscate = miscate.get(r.business_id);
    const nicicandIntrebat = r.sameday_return_status_checked_at === null;
    if (setMiscate && !nicicandIntrebat && !setMiscate.has(r.sameday_return_awb_number!)) {
      await marcheazaReturul({ sameday_return_status_checked_at: acumIso });
      continue;
    }

    let stare: SamedayStareAwb | null;
    try {
      stare = await statusAwbSameday(config, r.sameday_return_awb_number!);
    } catch (e) {
      returEsuate++;
      console.error("[sameday-tracking] retur", r.sameday_return_awb_number, (e as Error).message);
      await marcheazaReturul({ sameday_return_status_checked_at: acumIso });
      continue;
    }

    if (!stare) {
      /* 404: nu-l cunosc. Nu e o cadere de retea si nu se reincearca la nesfarsit. */
      await marcheazaReturul({ sameday_return_status_checked_at: acumIso });
      continue;
    }

    returVerificate++;

    /*
     * ⚠ Starea se scrie pe RETURUL pe care l-am citit, nu orbeste pe comanda.
     *
     * Intre citirea lotului si randul asta a trecut un apel la Sameday. Daca intre timp
     * comerciantul a detasat returul si a emis altul, starea de aici e a celui VECHI: scrisa
     * orbeste, un marcaj de incheiere ar scoate returul NOU din urmarire pentru totdeauna.
     */
    await scrieUrmarirea(admin, {
      orderId: r.id,
      businessId: r.business_id,
      identitate: { coloana: "sameday_return_awb_number", valoare: r.sameday_return_awb_number },
      stare: {
        sameday_return_status_id: stare.statusId ?? r.sameday_return_status_id,
        ...(stare.eticheta ? { sameday_return_status_label: stare.eticheta } : {}),
        /* ⚠ Marcajul de incheiere pleaca ODATA cu starea, pe aceeasi conditie de identitate:
           scris separat, ar fi putut ateriza pe returul nou. */
        ...(eStareFinala(stare) ? { sameday_return_incheiat_la: acumIso } : {}),
      } as Database["public"]["Tables"]["orders"]["Update"],
      marcaj: { sameday_return_status_checked_at: acumIso },
      actiune: "sameday-tracking-retur",
      orderNumber: r.order_number,
    });

    /*
     * ⚠ SEMNALUL PLEACA O SINGURA DATA, si de-aia exista `sameday_return_incheiat_la`.
     *
     * Fara marcaj, randul asta s-ar fi repetat la fiecare doua ore, la nesfarsit, pentru fiecare
     * retur ajuns, adica exact zgomotul care ineaca jurnalul.
     */
    if (eStareFinala(stare)) {
      returIncheiate++;
      await logError({
        action: "sameday-tracking-retur",
        message: stare.livrat
          ? `${r.order_number ?? r.id}: coletul de retur a ajuns inapoi la tine. Hotaraste ce se intampla cu plata.`
          : `${r.order_number ?? r.id}: Sameday a anulat returul${stare.motiv ? `: ${stare.motiv}` : ""}. Verifica daca trebuie reemis.`,
        details: { awbRetur: r.sameday_return_awb_number, livrat: stare.livrat },
        businessId: r.business_id,
        severity: "warning",
      });
    }
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, incheiate, faraConfig, esuate, sarite,
    returVerificate, returIncheiate, returEsuate,
  });
}
