import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { getDpdTracking, type DpdConfig } from "@/lib/dpd";
import {
  eStareFinalaDpd, esteReturDpd, statusUrmatorDpd, trebuieSemnalatDpd, ultimaOperatie,
} from "@/lib/shipping/statusuri-dpd";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { marcheazaLotul, scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import {
  proprietariiMagazinelor, semnaleazaExpedierea, stareaSaSchimbat,
} from "@/lib/orders/semnalarea-ajunge-la-om";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor DPD.
 *
 * ═══ ⚠ CE S-A DESCHIS (15.09.2026) ═══
 *
 * DPD e al DOILEA curier al platformei dupa trafic si era, alaturi de Woot, fara nicio bucla de
 * urmarire. Auditul din 05.07.2026 il numea deja: „fara tracking (shipment/info)". Comenzile
 * ramaneau pe starea la care le lasase emiterea.
 *
 * ═══ ⚠ AICI COMANDA CHIAR SE MUTA, SI DE ACEEA ═══
 *
 * DPD isi PUBLICA tabelul de coduri („Appendix 1 - Track And Trace Operation Codes"). La Woot nu
 * exista nicio enumerare nicaieri, si de aceea cronul lui inregistreaza si nu hotaraste. Aceeasi
 * platforma, doua purtari, si deosebirea nu e de gust: e a documentatiei lor.
 *
 * ⚠⚠ „Livrat" e codul **-14**, NEGATIV, iar `14` inseamna in tabelul lor de exceptii „Refused by
 * recipient - not ordered". Toata grija hartii sta in `@/lib/shipping/statusuri-dpd`.
 *
 * ═══ ⚠ LOTUL E DE ZECE, SI E AL LOR ═══
 *
 * `track` primeste cel mult zece colete pe cerere, scris in documentatia lor. Un lot mai mare nu da
 * o eroare limpede, ci un raspuns pe care nu-l intelegi.
 *
 * ⚠ RASPUNSUL POATE FI MAI SCURT DECAT CEREREA: un numar necunoscut contului vine cu `error`-ul lui
 * sau lipseste. Marcajul se scrie deci pentru TOATE cele cerute, nu doar pentru cele intoarse;
 * altfel ele raman cu `dpd_status_checked_at` NULL, ies primele la fiecare rulare si blocheaza
 * permanent capul cozii. Blocajul asta a fost platit o data, la cronul GLS.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la ceilalti: emailul pleaca DOAR din `updateOrder`, care e legat de
 * plafoanele de instiintare ale contului. Un cron n-are utilizator, deci le-ar ocoli.
 */

export const maxDuration = 60;

/** Cat de departe in urma se mai intreaba. Un colet mai vechi de atat nu se mai misca. */
const ZILE = 21;

/** Comenzi pe rulare. Cu zece pe cerere, 200 inseamna cel mult douazeci de apeluri. */
const MAX_COMENZI = 200;

/** ⚠ Plafonul LOR, scris in documentatie: „Allowed are up to 10 parcels". */
const COLETE_PE_CERERE = 10;

/** Sub `maxDuration`, cu loc de scriere la final. */
const BUGET_MS = 50_000;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  created_at: string | null;
  dpd_awb_number: string | null;
  dpd_awb_at: string | null;
  dpd_status_code: number | null;
  dpd_status_checked_at: string | null;
};

/** Are magazinul cu ce intreba? Aceleasi campuri ca la emitere. */
function dpdGata(config: DpdConfig | null | undefined): config is DpdConfig {
  return !!(config?.enabled && config.username && config.password);
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const inceput = Date.now();
  const since = new Date(inceput - ZILE * 86400000).toISOString();

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select(
      "id, business_id, status, order_number, payment_status, created_at,"
      + " dpd_awb_number, dpd_awb_at, dpd_status_code, dpd_status_checked_at",
    )
    .not("dpd_awb_number", "is", null)
    .neq("dpd_awb_number", "")
    /* ⚠ Starile incheiate NU sunt acoperite de filtrul pe AWB: o comanda livrata isi pastreaza
       numarul, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii, si ⚠ conditia e scrisa cu DOI
     * termeni simpli: un `and(...)` imbricat gresit in `or(...)` NU da eroare, da LISTA GOALA, adica
     * urmarirea moare complet raportand vesel `ok: true`.
     */
    /*
     * ⚠ FEREASTRA INTREAGA, INTR-UN SINGUR LOC (15.09.2026, dupa prima rulare adevarata).
     *
     * Forma de dinainte avea doi termeni simpli, iar restul conditiei („fara ceas de emitere,
     * dar comanda e proaspata") statea in memorie, dupa citire. Masurat pe prima rulare: din
     * cele 120 de randuri cerute, doar DOUASPREZECE treceau de filtrul din memorie, fiindca
     * `dpd_awb_at` e NULL pe toate expedierile dinainte de migratie, deci termenul
     * `is.null` lasa sa treaca si cele 111 comenzi vechi. Lotul se dilua, iar ordonarea dupa un
     * ceas care e NULL peste tot nu putea prefera pe nimeni.
     *
     * ⚠ SI DE CE E SIGUR SA FIE IMBRICAT, desi comentariul surorilor lui spune ca un `and(...)`
     * in `or(...)` scris gresit NU da eroare, ci LISTA GOALA: fiindca forma asta a fost
     * INCERCATA pe PostgREST-ul adevarat inainte de a fi scrisa aici. Intoarce 92 de randuri,
     * toate in fereastra, fata de 120 din care 12 erau bune. Cine o schimba, o incearca la fel.
     */
    .or(`dpd_awb_at.gte.${since},and(dpd_awb_at.is.null,created_at.gte.${since})`)
    .order("dpd_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O citire picata n-are voie sa raporteze „zero de verificat". */
  if (eComenzi) {
    await logError({
      action: "dpd-tracking",
      message: `comenzile cu AWB DPD nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const toate = (comenzi ?? []) as unknown as Comanda[];
  /*
   * ⚠ ACELASI FILTRU, DAR ACUM E O PLASA, NU O PARTE A REGULII.
   *
   * De cand fereastra intreaga sta in interogare, randul asta n-ar trebui sa mai scoata NIMIC.
   * Ramane fiindca e ieftin si fiindca, daca cineva slabeste candva conditia de mai sus, coletele
   * din afara ferestrei ar fi altfel intrebate in tacere. Diferenta se si NUMARA, mai jos.
   */
  const inFereastra = toate.filter((o) => o.dpd_awb_at !== null || (o.created_at ?? "") >= since);
  if (inFereastra.length !== toate.length) {
    console.warn(
      `[dpd-tracking] interogarea a adus ${toate.length} randuri, dar ${toate.length - inFereastra.length} `
      + "erau in afara ferestrei: conditia din interogare nu mai acopera tot.",
    );
  }
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];
  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, dpd_config").in("business_id", bizIds);

  /* Fara configuratii, TOATE comenzile ar fi sarite: zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "dpd-tracking",
      message: `configuratiile DPD nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map<string, DpdConfig>();
  for (const r of setari ?? []) {
    const c = r.dpd_config as DpdConfig | null;
    if (dpdGata(c)) configuri.set(r.business_id, c);
  }

  /* Pe magazin, fiindca fiecare intreaba cu credentialele lui. */
  const peMagazin = new Map<string, Comanda[]>();
  for (const o of inFereastra) {
    if (!configuri.has(o.business_id)) continue;
    const lista = peMagazin.get(o.business_id) ?? [];
    lista.push(o);
    peMagazin.set(o.business_id, lista);
  }

  /* ⚠ Proprietarii, o singura data pe rulare: fara `user_id` notificarea n-are unde sa mearga. */
  const proprietari = await proprietariiMagazinelor(admin, inFereastra.map((o) => o.business_id));

  let verificate = 0, mutate = 0, semnalate = 0, incheiate = 0, esuate = 0, necunoscute = 0, ramase = 0;

  for (const [businessId, lista] of peMagazin) {
    const config = configuri.get(businessId)!;

    for (let i = 0; i < lista.length; i += COLETE_PE_CERERE) {
      if (Date.now() - inceput > BUGET_MS) { ramase += lista.length - i; break; }

      const felie = lista.slice(i, i + COLETE_PE_CERERE);
      const marcaj = { dpd_status_checked_at: new Date().toISOString() };

      let raspuns: Awaited<ReturnType<typeof getDpdTracking>>;
      try {
        raspuns = await getDpdTracking(config, felie.map((o) => o.dpd_awb_number!));
      } catch (e) {
        esuate += felie.length;
        console.error("[dpd-tracking]", businessId, (e as Error).message);
        /* ⚠ Si pe esec marcajul se scrie: altfel felia asta ramane in capul cozii pentru
           totdeauna si blocheaza urmarirea intregului magazin. */
        await marcheazaLotul(admin, { ids: felie.map((o) => o.id), businessId, marcaj, actiune: "dpd-tracking" });
        continue;
      }

      /* ⚠ MARCAJUL PENTRU TOATE CELE CERUTE, nu doar pentru cele intoarse. Vezi antetul. */
      await marcheazaLotul(admin, { ids: felie.map((o) => o.id), businessId, marcaj, actiune: "dpd-tracking" });

      const peAwb = new Map(raspuns.map((p) => [p.parcelId, p]));

      for (const o of felie) {
        const p = peAwb.get((o.dpd_awb_number ?? "").trim());
        if (!p) { necunoscute++; continue; }
        if (p.error) { esuate++; continue; }

        const op = ultimaOperatie(p.operations);
        const cod = Number.isInteger(op?.operationCode) ? (op!.operationCode as number) : null;
        if (cod === null) continue;

        verificate++;
        const eticheta = typeof op?.description === "string" ? op.description.trim() : "";

        /*
         * ⚠ STAREA SE SCRIE PE COLETUL PE CARE L-AM CITIT. Intre citirea lotului si randul asta
         * sta un apel la DPD; daca intre timp comerciantul a detasat AWB-ul si a emis din nou,
         * starea de aici e a coletului VECHI.
         */
        const scrisa = await scrieUrmarirea(admin, {
          orderId: o.id,
          businessId,
          identitate: { coloana: "dpd_awb_number", valoare: o.dpd_awb_number },
          stare: {
            dpd_status_code: cod,
            ...(eticheta ? { dpd_status_label: eticheta } : {}),
          },
          marcaj,
          actiune: "dpd-tracking",
          orderNumber: o.order_number,
        });
        /* Starea n-a ajuns pe comanda, deci nici tranzitia n-are ce cauta acolo. */
        if (!scrisa.scris) continue;

        const tinta = statusUrmatorDpd(o.status, cod);
        if (tinta) {
          const rez = await tranzitieComandaMarketplace(admin, {
            orderId: o.id,
            businessId,
            status: tinta,
            sursa: "dpd",
            expediere: { coloana: "dpd_awb_number", valoare: o.dpd_awb_number },
          });
          if (rez === "ok") {
            mutate++;
            if (tinta === "delivered") {
              /* ⚠ Nu se lasa sa arunce: o facturare picata n-are voie sa opreasca urmarirea
                 celorlalte colete, dar nici sa treaca tacut. */
              try {
                await maybeAutoInvoice(businessId, o.id, tinta, o.payment_status ?? "", admin as never);
              } catch (e) {
                await logError({
                  action: "dpd-tracking",
                  message: `comanda ${o.order_number ?? o.id} a trecut pe livrat, dar facturarea automata a esuat: ${(e as Error).message}`,
                  details: { orderId: o.id }, businessId, severity: "warning",
                });
              }
            }
          }
        }

        /*
         * ⚠⚠ SE SEMNALEAZA DOAR SCHIMBAREA, SI SEMNALUL AJUNGE LA OM.
         *
         * Pana azi randurile astea scriau numai in `error_logs`, pe care comerciantul nu-l vede,
         * si o faceau la fiecare rulare. DPD e unul dintre cele trei transportatoare care au
         * miscat vreodata un colet. Vezi `semnalarea-ajunge-la-om`.
         */
        if (trebuieSemnalatDpd(cod) && stareaSaSchimbat(o.dpd_status_code, cod)) {
          semnalate++;
          const retur = esteReturDpd(cod);
          const spune = eticheta || `operatie DPD ${cod}`;
          const comanda = o.order_number ? `Comanda ${o.order_number}` : "O comanda";
          await semnaleazaExpedierea(admin, {
            userId: proprietari.get(businessId) ?? null,
            businessId,
            orderId: o.id,
            orderNumber: o.order_number,
            awb: o.dpd_awb_number,
            tip: "dpd",
            titlu: retur ? "Colet DPD returnat" : "Expediere DPD care cere atentie",
            mesaj: retur
              ? `${comanda}: coletul ${o.dpd_awb_number} se intoarce la tine (${spune}). Rambursul nu se mai incaseaza, iar anularea comenzii si returul banilor raman decizia ta.`
              : `${comanda}: expedierea ${o.dpd_awb_number} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet.`,
            actiune: "dpd-tracking",
            detalii: { cod, exceptii: op?.exceptionCodes ?? [] },
          });
        }

        if (eStareFinalaDpd(cod)) incheiate++;
      }
    }
  }

  /* ⚠ Si aici numerele in jurnal: o rulare partiala arata altfel doar daca o scrie cineva. */
  console.log(
    `[dpd-tracking] candidati ${inFereastra.length}, verificate ${verificate}, mutate ${mutate}, `
    + `semnalate ${semnalate}, incheiate ${incheiate}, esuate ${esuate}, necunoscute ${necunoscute}, ramase ${ramase}`,
  );
  return NextResponse.json({
    ok: true, candidati: inFereastra.length, verificate, mutate, semnalate, incheiate, esuate, necunoscute, ramase,
  });
}
