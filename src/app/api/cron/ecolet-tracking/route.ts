import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import {
  citesteExpedierea,
  ecoletGata,
  stareaTrimiterii,
  statusuriInLot,
  MAX_AWB_PE_CERERE,
  type EcoletConfig,
} from "@/lib/ecolet/client";
import {
  clasificaStatus,
  eStareFinala,
  esteRetur,
  statusUrmator,
  trebuieSemnalat,
} from "@/lib/ecolet/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor eColet — si finalizarea celor ramase in emitere.
 *
 * ═══ DOUA TREBURI, NU UNUL ═══
 *
 *   A. **Finalizeaza emiterile atarnate.** eColet raspunde la `send-order` doar cu
 *      `order_to_send_id`; AWB-ul apare mai tarziu. Formularul incearca o data pe
 *      loc, dar daca eColet e mai lent, comanda ramane fara numar. Aici se reia.
 *   B. **Urmareste expedierile cu AWB**, prin `POST /order/get-statuses-for-many-orders`.
 *
 * ═══ ⚠ DE CE E ALTFEL DECAT CRONUL GLS SAU PALL-EX ═══
 *
 * Acolo fiecare colet cere un apel HTTP, deci plafonul e 120 de comenzi pe rulare
 * si patru apeluri deodata. Aici incap zeci de AWB-uri intr-o singura cerere, deci
 * se poate lucra pe mult mai multe comenzi cu mult mai putine apeluri.
 *
 * ⚠ Lotul se face PE MAGAZIN, nu pe platforma: tokenul e al contului
 * comerciantului. Un lot amestecat ar cere statusurile unui magazin cu tokenul
 * altuia — si eColet ar raspunde, cinstit, ca nu le cunoaste.
 *
 * ⚠ SI CEA MAI PERICULOASA CAPCANA A VARIANTEI IN LOT: raspunsul poate sa NU
 * contina toate AWB-urile cerute. Unul pe care eColet nu-l cunoaste lipseste pur
 * si simplu. Marcajul trebuie scris pentru TOATE cele CERUTE, nu doar pentru cele
 * intoarse — altfel cele necunoscute raman cu marcaj gol, ies primele la fiecare
 * rulare si blocheaza permanent capul cozii.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Emailul de expediere pleaca DOAR din `updateOrder`, care e legat de plafoanele
 * pe `user.id`. Un cron n-are utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/** Cat de departe in urma ne uitam. */
const ZILE = 21;

/** Cate comenzi pe rulare. Mult peste GLS/Pall-Ex, fiindca statusurile vin in lot. */
const MAX_COMENZI = 600;

/** Cate emiteri neterminate se reiau pe rulare. Fiecare cere apeluri proprii. */
const MAX_EMITERI = 40;

/** Termenul rularii, sub cele 60 de secunde ale functiei. */
const BUGET_MS = 50_000;

/** Cat asteptam un apel. Sub bugetul rularii, ca o cerere atarnata sa nu ia tura. */
const ASTEPTARE_MS = 12_000;

/** Sub atat, un AWB necunoscut e doar unul proaspat, nu un token strain. */
const MIN_NECUNOSCUTE_ALARMA = 5;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();
  const termen = Date.now() + BUGET_MS;

  /* Configuratiile se citesc o data, pentru amandoua treburile. */
  const configuri = new Map<string, EcoletConfig | null>();
  async function configul(bizIds: string[]): Promise<void> {
    const lipsa = bizIds.filter((id) => !configuri.has(id));
    if (lipsa.length === 0) return;
    const { data, error } = await admin
      .from("store_settings").select("business_id, ecolet_config").in("business_id", lipsa);
    if (error) {
      await logError({
        action: "ecolet-tracking",
        message: `configuratiile eColet nu s-au putut citi: ${error.message}`,
        severity: "critical",
      });
      /* Se marcheaza ca necunoscute, ca sa nu se reincerce la nesfarsit in tura asta. */
      for (const id of lipsa) configuri.set(id, null);
      return;
    }
    for (const id of lipsa) configuri.set(id, null);
    for (const r of data ?? []) configuri.set(r.business_id, r.ecolet_config as EcoletConfig | null);
  }

  let finalizate = 0;
  let esuateEmiteri = 0;
  let verificate = 0;
  let mutate = 0;
  let semnalate = 0;
  let esuate = 0;
  let necunoscute = 0;
  let faraConfig = 0;

  /*
   * ⚠ SOCOTEALA SE TINE SI PE MAGAZIN, nu doar pe total.
   *
   * Alarmele de mai jos sunt pornite pe „nicio verificare reusita". Cu un singur
   * numarator global, un magazin mare si sanatos umple `verificate` si ACOPERA la
   * nesfarsit magazinul vecin caruia i-a expirat tokenul: fiecare lot al lui cade,
   * dar conditia globala nu se mai indeplineste niciodata si nimeni nu afla.
   */
  const socoteala = new Map<string, { verificate: number; esuate: number; necunoscute: number }>();
  const socotesc = (b: string) => {
    let x = socoteala.get(b);
    if (!x) { x = { verificate: 0, esuate: 0, necunoscute: 0 }; socoteala.set(b, x); }
    return x;
  };

  // ═══ A. Emiterile ramase fara AWB ═══════════════════════════════════════════

  const { data: emiteri, error: eEmiteri } = await admin
    .from("orders")
    .select("id, business_id, ecolet_order_to_send_id, ecolet_awb_at")
    .not("ecolet_order_to_send_id", "is", null)
    .is("ecolet_awb_number", null)
    .gte("ecolet_awb_at", since)
    /*
     * ⚠ Ordonarea e pe COLOANA PE CARE O SCRIE `daLaRand`, nu pe `ecolet_awb_at`.
     *
     * Prima forma sorta dupa data emiterii — care nu se rescrie niciodata — deci
     * marcajul de rotatie nu misca nimic: 40 de emiteri blocate definitiv (token
     * expirat, magazin deconectat) raman cele mai vechi, ocupa toate sloturile la
     * fiecare rulare, si emiterile atarnate ale tuturor celorlalte magazine nu se
     * finalizeaza niciodata.
     */
    .order("ecolet_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_EMITERI);

  if (eEmiteri) {
    await logError({
      action: "ecolet-tracking",
      message: `emiterile eColet neterminate nu s-au putut citi: ${eEmiteri.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (emiteri && emiteri.length > 0) {
    await configul([...new Set(emiteri.map((o) => o.business_id))]);

    for (const o of emiteri) {
      if (Date.now() >= termen) break;

      /*
       * MARCAJ DE ROTATIE SI AICI, PE COLOANA DUPA CARE E ORDONATA COADA.
       *
       * Fara el, 40 de emiteri blocate definitiv (magazin deconectat, expediere pe
       * care eColet n-o mai stie) ar sta vesnic in fata si ar infometa orice
       * emitere noua — aceeasi capcana ca la urmarire, doar pe alta coada.
       *
       * ⚠ Se scrie pe FIECARE iesire din bucla, inclusiv pe cele care nu ating
       * furnizorul: o iesire nemarcata reface exact blocajul pe care il repara.
       *
       * Ca efect secundar, cand emiterea capata AWB si trece in partea B, intra
       * acolo cu marcajul proaspat, adica la coada — corect, tocmai a fost citita.
       */
      const daLaRand = async () => {
        await admin.from("orders")
          .update({ ecolet_status_checked_at: new Date().toISOString() })
          .eq("id", o.id).eq("business_id", o.business_id);
      };

      const config = configuri.get(o.business_id);
      if (!ecoletGata(config)) { await daLaRand(); continue; }

      try {
        const stare = await stareaTrimiterii(config, Number(o.ecolet_order_to_send_id), ASTEPTARE_MS);
        if (!stare) { await daLaRand(); continue; }

        if (stare.status === "error") {
          /*
           * ⚠ Brokerul a refuzat: nu exista niciun transport. Se sterge
           * identificatorul, ca garda din actiune sa nu mai blocheze o reincercare
           * dupa corectare, si se pastreaza motivul pe comanda.
           *
           * Slotul din registru NU se elibereaza de aici: cheia lui e per comanda,
           * iar `deleteEcoletAwbAction` si actiunea de creare stiu sa se descurce.
           * Un cron care elibereaza sloturi ar putea debloca o emitere pe care
           * omul tocmai o incearca.
           */
          esuateEmiteri++;
          await admin.from("orders").update({
            ecolet_order_to_send_id: null,
            ecolet_send_state: "error",
            ecolet_send_error: (stare.error ?? "eColet a refuzat expedierea").slice(0, 500),
            ecolet_awb_at: null,
          }).eq("id", o.id).eq("business_id", o.business_id);
          continue;
        }

        if (stare.status !== "ordered" || !stare.order_id) { await daLaRand(); continue; }

        /* Cu termenul cronului, nu cu implicitul de 25s al clientului: acela e de
           doua ori bugetul pe apel, deci o singura expediere ar lua toata tura. */
        const expediere = await citesteExpedierea(config, stare.order_id, ASTEPTARE_MS);
        const awb = expediere?.awb?.trim() || null;
        if (!awb) {
          await admin.from("orders").update({
            ecolet_order_id: stare.order_id,
            ecolet_send_state: "ordered",
          }).eq("id", o.id).eq("business_id", o.business_id);
          await daLaRand();
          continue;
        }

        const { data: randuri, error: eAwb } = await admin.from("orders").update({
          ecolet_order_id: stare.order_id,
          ecolet_awb_number: awb,
          ecolet_send_state: "ordered",
          ecolet_send_error: null,
          tracking_number: awb,
        }).eq("id", o.id).eq("business_id", o.business_id).select("id");

        /*
         * ⚠ SCRIEREA CARE NU PRINDE E SINGURA IESIRE CARE NU-SI SCOATE RANDUL DIN
         * COADA.
         *
         * Celelalte doua iesiri „reusite" il scot prin chiar ce scriu: refuzul
         * goleste `ecolet_order_to_send_id`, iar AWB-ul umple `ecolet_awb_number` —
         * si amandoua coloanele sunt in filtrul cozii. Aici, daca UPDATE-ul cade,
         * randul ramane cu marcajul NEATINS: cu ordonarea `nulls first` inseamna
         * capul cozii, la fiecare rulare, pentru totdeauna — si nicio alta emitere
         * atarnata nu se mai finalizeaza vreodata.
         *
         * AWB-ul e deja emis si citit, deci pierderea lui trebuie sa si TIPE: nu se
         * mai reface de nicaieri decat din panoul eColet.
         */
        if (eAwb || !randuri || randuri.length === 0) {
          await daLaRand();
          await logError({
            action: "ecolet-tracking",
            message: `AWB-ul eColet ${awb} a fost emis, dar NU s-a putut scrie pe comanda: ${eAwb?.message ?? "niciun rand modificat"}. Expedierea exista si e facturata.`,
            details: { orderId: o.id, awb, orderIdEcolet: stare.order_id, code: eAwb?.code },
            businessId: o.business_id, severity: "critical",
          });
          continue;
        }

        if (randuri.length > 0) {
          finalizate++;
          /*
           * ⚠ Marketplace-ul afla numarul ABIA ACUM. La ceilalti curieri apelul se
           * face din actiunea de creare, unde AWB-ul exista pe loc; aici nu exista,
           * deci fara randul asta o comanda About You ar ramane neexpediata la ei,
           * cu „skipped" raportat ca succes.
           */
          void enqueueAboutYouShip(o.business_id, o.id);
        }
      } catch (e) {
        console.error("[ecolet-tracking] finalizare", o.id, (e as Error).message);
        await daLaRand();
      }
    }
  }

  // ═══ B. Urmarirea, in LOT ═══════════════════════════════════════════════════

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, ecolet_awb_number, ecolet_status_code, ecolet_status_checked_at")
    .not("ecolet_awb_number", "is", null)
    .neq("ecolet_awb_number", "")
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    .or(`ecolet_awb_at.gte.${since},ecolet_awb_at.is.null`)
    .order("ecolet_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT": ar fi o rulare
   * perfect sanatoasa la vedere, care n-a urmarit nimic.
   */
  if (eComenzi) {
    await logError({
      action: "ecolet-tracking",
      message: `comenzile cu AWB eColet nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (comenzi && comenzi.length > 0) {
    await configul([...new Set(comenzi.map((o) => o.business_id))]);

    /* Gruparea pe magazin: tokenul e al contului comerciantului. */
    const peMagazin = new Map<string, typeof comenzi>();
    for (const o of comenzi) {
      const lista = peMagazin.get(o.business_id) ?? [];
      lista.push(o);
      peMagazin.set(o.business_id, lista);
    }

    const proprietari = new Map<string, string>();
    const { data: firme } = await admin
      .from("businesses").select("id, user_id").in("id", [...peMagazin.keys()]);
    for (const f of firme ?? []) proprietari.set(f.id, f.user_id);

    for (const [businessId, lista] of peMagazin) {
      if (Date.now() >= termen) break;
      const config = configuri.get(businessId);
      if (!ecoletGata(config)) {
        /*
         * MARCAJ CHIAR SI AICI. Un magazin care si-a oprit integrarea isi
         * pastreaza comenzile cu AWB; sarite fara marcaj, ele raman cu
         * `ecolet_status_checked_at` NULL, ies PRIMELE la fiecare rulare si, cu
         * 600 pe tura, blocheaza urmarirea intregii platforme - exact blocajul
         * despre care antetul fisierului spune ca e evitat.
         */
        faraConfig += lista.length;
        await admin.from("orders")
          .update({ ecolet_status_checked_at: new Date().toISOString() })
          .in("id", lista.map((o) => o.id)).eq("business_id", businessId);
        continue;
      }

      for (let i = 0; i < lista.length; i += MAX_AWB_PE_CERERE) {
        if (Date.now() >= termen) break;
        const felie = lista.slice(i, i + MAX_AWB_PE_CERERE);

        /**
         * ⚠ MARCAJUL SE SCRIE PENTRU TOATE CELE CERUTE.
         *
         * eColet omite din raspuns AWB-urile pe care nu le cunoaste. Marcand doar
         * ce s-a intors, alea ar ramane cu `ecolet_status_checked_at` NULL, ar iesi
         * primele la fiecare rulare si ar bloca permanent capul cozii — exact
         * blocajul platit deja la cronul GLS.
         */
        const marcheaza = async (ids: string[], cod?: string | null) => {
          if (ids.length === 0) return;
          const modificari: Database["public"]["Tables"]["orders"]["Update"] = {
            ecolet_status_checked_at: new Date().toISOString(),
          };
          if (cod !== undefined) modificari.ecolet_status_code = cod;
          const { error } = await admin
            .from("orders").update(modificari).in("id", ids).eq("business_id", businessId);
          if (error) console.error("[ecolet-tracking] marcajul nu s-a scris:", error.message);
        };

        let raspuns: Awaited<ReturnType<typeof statusuriInLot>>;
        try {
          raspuns = await statusuriInLot(config, felie.map((o) => o.ecolet_awb_number!), ASTEPTARE_MS);
        } catch (e) {
          esuate += felie.length;
          socotesc(businessId).esuate += felie.length;
          console.error("[ecolet-tracking] lot", businessId, (e as Error).message);
          /* Marcaj si pe esec, ca rotatia sa inainteze. */
          await marcheaza(felie.map((o) => o.id));
          continue;
        }

        const dupaAwb = new Map(raspuns.map((r) => [r.awb, r]));
        const neintoarse: string[] = [];

        for (const o of felie) {
          const r = dupaAwb.get(o.ecolet_awb_number!);
          if (!r) { neintoarse.push(o.id); continue; }

          verificate++;
          socotesc(businessId).verificate++;
          const ultimul = r.statuses?.[r.statuses.length - 1];
          const numeReal = ultimul?.real_name ?? null;
          const cheieScurta = (r.status ?? ultimul?.name ?? "").trim() || null;
          /*
           * ⚠ MEMORIA STA PE CLASA, nu pe text.
           *
           * Prima forma lipea cheia scurta de textul ultimului eveniment, ca sa
           * prinda si evenimentele vizibile doar in text. Dar `real_name` se
           * schimba la fiecare scanare, deci `seSchimba` ieseaadevarat mereu: un
           * singur retur producea patru notificari („Refused by recipient",
           * „Return in transit", „Arrived at return hub", „Returned to sender"), si
           * iesirea devreme pentru starile finale nu mai taia nimic.
           *
           * Memoria tine acum CLASA evenimentului plus cheia scurta: se schimba
           * cand se schimba intelesul, nu cand se schimba fraza.
           */
          const clasa = clasificaStatus(cheieScurta, numeReal);
          const cod = [cheieScurta, clasa].filter(Boolean).join("|") || null;
          const seSchimba = !!cod && cod !== o.ecolet_status_code;

          if (eStareFinala(cheieScurta, numeReal) && !seSchimba) { await marcheaza([o.id]); continue; }

          const tinta = statusUrmator(o.status, cheieScurta, numeReal);
          let prelucrat = true;
          if (tinta) {
            const rez = await tranzitieComandaMarketplace(admin, {
              orderId: o.id, businessId, status: tinta, sursa: "ecolet",
            });
            if (rez === "ok") {
              mutate++;
              void maybeAutoInvoice(businessId, o.id, tinta, o.payment_status ?? "", admin as never);
            }
            prelucrat = rez !== "reincearca";
          }

          if (seSchimba && trebuieSemnalat(cheieScurta, numeReal)) {
            semnalate++;
            await semnaleaza(admin, {
              userId: proprietari.get(businessId) ?? null,
              businessId, orderId: o.id, orderNumber: o.order_number,
              awb: o.ecolet_awb_number!,
              retur: esteRetur(cheieScurta, numeReal),
              spune: numeReal || cod || "",
            });
          }

          /* ⚠ Statusul se retine ABIA dupa ce tranzitia a reusit. */
          await marcheaza([o.id], prelucrat ? cod : undefined);
        }

        necunoscute += neintoarse.length;
        socotesc(businessId).necunoscute += neintoarse.length;
        await marcheaza(neintoarse);
      }
    }
  }

  /*
   * ⚠ URMARIREA NU ARE VOIE SA MOARA IN TACERE. Un token expirat face fiecare lot
   * sa cada, iar ramurile de esec scriu doar in `console.error`.
   */
  if (verificate === 0 && esuate > 0) {
    await logError({
      action: "ecolet-tracking",
      message: `Urmarirea eColet a esuat pe TOATE cele ${esuate} expedieri incercate. Cel mai probabil tokenul nu mai e valid.`,
      details: { esuate, necunoscute },
      severity: "critical",
    });
  } else if (verificate === 0 && necunoscute >= MIN_NECUNOSCUTE_ALARMA) {
    /*
     * Al doilea fel de moarte tacuta, propriu variantei in LOT: apelul REUSESTE
     * (200) dar eColet nu recunoaste niciun AWB - cazul in care comerciantul si-a
     * facut cont nou si a lipit tokenul nou peste expedierile vechi. Fara ramura
     * asta, urmarirea magazinului e moarta la nesfarsit, cu `ok: true`.
     *
     * Pragul exista ca sa nu tipe pentru un singur AWB proaspat, pe care eColet
     * inca nu l-a inregistrat - cazul obisnuit si nevinovat.
     */
    await logError({
      action: "ecolet-tracking",
      message: `eColet nu recunoaste niciunul dintre cele ${necunoscute} AWB-uri interogate. Cel mai probabil tokenul apartine altui cont decat cel cu care s-au emis expedierile.`,
      details: { necunoscute, faraConfig },
      severity: "warning",
    });
  }

  /*
   * ⚠ Si acum, MAGAZIN CU MAGAZIN — pentru cele pe care totalul le-a ascuns.
   *
   * Se sare peste cazul in care alarma globala tocmai a tipat pentru acelasi
   * lucru, ca sa nu se scrie de doua ori acelasi incident.
   */
  if (verificate > 0) {
    for (const [businessId, c] of socoteala) {
      if (c.verificate > 0) continue;
      if (c.esuate > 0) {
        await logError({
          action: "ecolet-tracking",
          message: `Urmarirea eColet a esuat pe TOATE cele ${c.esuate} expedieri ale acestui magazin. Cel mai probabil tokenul lui nu mai e valid.`,
          details: { esuate: c.esuate, necunoscute: c.necunoscute },
          businessId, severity: "critical",
        });
      } else if (c.necunoscute >= MIN_NECUNOSCUTE_ALARMA) {
        await logError({
          action: "ecolet-tracking",
          message: `eColet nu recunoaste niciunul dintre cele ${c.necunoscute} AWB-uri ale acestui magazin. Cel mai probabil tokenul apartine altui cont decat cel cu care s-au emis expedierile.`,
          details: { necunoscute: c.necunoscute },
          businessId, severity: "warning",
        });
      }
    }
  }

  console.log(
    `[ecolet-tracking] finalizate ${finalizate}, esuateEmiteri ${esuateEmiteri}, verificate ${verificate}, mutate ${mutate}, semnalate ${semnalate}, esuate ${esuate}, necunoscute ${necunoscute}, faraConfig ${faraConfig}`,
  );
  return NextResponse.json({
    ok: true, finalizate, esuateEmiteri, verificate, mutate, semnalate, esuate, necunoscute, faraConfig,
  });
}

/**
 * Il anunta pe comerciant.
 *
 * ⚠ In `notifications`, nu doar in `error_logs`: acesta din urma se vede in
 * `/admin/logs`, adica la adminul PLATFORMEI, pe care comerciantul nu-l deschide.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null; businessId: string; orderId: string;
    orderNumber: string | null; awb: string; retur: boolean; spune: string;
  },
): Promise<void> {
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = p.retur ? "Expediere eColet returnata" : "Expediere eColet care cere atentie";
  const mesaj = p.retur
    ? `${comanda}: expedierea ${p.awb} se intoarce la tine (${p.spune}). Marfa vine inapoi; anularea comenzii si returul banilor raman decizia ta.`
    : `${comanda}: expedierea ${p.awb} are un eveniment care cere o decizie: ${p.spune}.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId, type: "ecolet", title: titlu, message: mesaj,
    });
    if (error) console.error("[ecolet-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "ecolet-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb },
    businessId: p.businessId,
    severity: p.retur ? "warning" : "info",
  });
}
