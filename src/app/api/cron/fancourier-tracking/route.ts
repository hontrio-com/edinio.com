import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { getFanCourierTracking, type FanCourierConfig } from "@/lib/fancourier";
import {
  eStareFinala,
  esteRetur,
  statusUrmator,
  trebuieSemnalat,
  ultimulEveniment,
} from "@/lib/fancourier/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor FAN Courier.
 *
 * ═══ ⚠ CE S-A DESCHIS (13.09.2026) ═══
 *
 * FAN nu era intrebat NICIODATA ce s-a intamplat cu un AWB dupa emitere. Comanda ramanea
 * „Expediata" pana cand suna clientul, iar un retur sau o adresa gresita se aflau cu zile
 * intarziere, cand coletul era deja inapoi. Doisprezece curieri aveau deja bucla asta; FAN
 * si Woot erau singurii fara.
 *
 * ═══ ⚠ UN SINGUR TREAB, NU DOUA CA LA ECOLET ═══
 *
 * Cronul eColet are si o parte A, care finalizeaza emiterile atarnate: acolo `send-order`
 * raspunde doar cu un id, iar numarul AWB apare mai tarziu. La FAN, `intern-awb` intoarce
 * numarul PE LOC, in aceeasi cerere, deci nu exista emitere atarnata.
 *
 * ⚠ De aceea aici NU se cheama `enqueueAboutYouShip`: la eColet el exista tocmai fiindca
 * marketplace-ul afla numarul abia din cron. La FAN il afla din actiunea de creare, unde e
 * chemat deja. Chemat si aici, ar fi anuntat a doua oara aceeasi expediere.
 *
 * ═══ ⚠ SE CITESTE CODUL, NU TEXTUL ═══
 *
 * FAN publica un tabel de coduri stabil (`reports/awb-events`): `S2` livrat, `S43` retur,
 * `S42` adresa gresita. eColet, in schimb, da nume libere, si de aia modulul lui are liste
 * de cuvinte si o lista de negatii („not delivered" contine „delivered").
 *
 * Urmarea practica se vede in `fan_courier_status_code`: eColet tine acolo perechea
 * `text|clasa`, fiindca `real_name` i se schimba la fiecare scanare si, fara compozitie, un
 * singur retur producea PATRU notificari. Codul FAN e stabil prin constructie, deci aici se
 * tine chiar codul. Mai putin de intretinut, si acelasi efect.
 *
 * ═══ ⚠ RASPUNSUL POATE FI MAI SCURT DECAT CEREREA ═══
 *
 * Un AWB necunoscut contului lipseste pur si simplu din `data`, fara vreo eroare. Marcajul
 * se scrie deci pentru TOATE cele cerute, nu doar pentru cele intoarse: altfel ele raman cu
 * `fan_courier_status_checked_at` NULL, ies primele la fiecare rulare si blocheaza permanent
 * capul cozii. Blocajul asta a fost deja platit o data, la cronul GLS.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Emailul de expediere pleaca DOAR din `updateOrder`, care e legat de plafoanele pe
 * `user.id`. Un cron n-are utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/** Cat de departe in urma se mai intreaba. Un colet mai vechi de atat nu se mai misca. */
const ZILE = 21;

/** Comenzi pe rulare. Loturile fiind mari, incap multe cu putine apeluri. */
const MAX_COMENZI = 400;

/**
 * ⚠ AWB-uri PE CERERE, si plafonul e al nostru, nu al lor.
 *
 * `awb[]` se repeta in adresa (`?awb[]=...&awb[]=...`), deci un lot mare produce un URL
 * lung. FAN nu documenteaza nicio limita, dar serverele si intermediarii au una, si cand o
 * ating taie cererea fara sa spuna de ce. 25 de AWB-uri inseamna cateva sute de caractere:
 * departe de orice prag obisnuit, si tot de saisprezece ori mai putine apeluri decat unul
 * pe colet.
 */
const MAX_AWB_PE_CERERE = 25;

/** Sub `maxDuration`, cu loc de scriere la final. */
const BUGET_MS = 50_000;

/** De la cate AWB-uri nerecunoscute devine un semnal, si nu un caz nevinovat. */
const MIN_NECUNOSCUTE_ALARMA = 5;

/** Are magazinul cu ce intreba? Aceleasi trei campuri cerute si la emitere. */
function fanGata(config: FanCourierConfig | null | undefined): config is FanCourierConfig {
  return !!(config?.enabled && config.username && config.password && config.client_id);
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

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();
  const termen = Date.now() + BUGET_MS;

  let verificate = 0;
  let mutate = 0;
  let semnalate = 0;
  let esuate = 0;
  let necunoscute = 0;
  let faraConfig = 0;

  /*
   * ⚠ SOCOTEALA SE TINE SI PE MAGAZIN, nu doar pe total.
   *
   * Alarmele de mai jos pornesc pe „nicio verificare reusita". Cu un singur numarator
   * global, un magazin mare si sanatos umple `verificate` si ACOPERA la nesfarsit magazinul
   * vecin caruia i-au expirat datele de acces: fiecare lot al lui cade, dar conditia globala
   * nu se mai indeplineste niciodata si nimeni nu afla.
   */
  const socoteala = new Map<string, { verificate: number; esuate: number; necunoscute: number }>();
  const socotesc = (b: string) => {
    let x = socoteala.get(b);
    if (!x) { x = { verificate: 0, esuate: 0, necunoscute: 0 }; socoteala.set(b, x); }
    return x;
  };

  /*
   * ⚠ `fan_courier_awb_at.is.null` ramane in filtru, si nu din uitare.
   *
   * Coloana a fost adaugata pe 13.09.2026; orice AWB emis inaintea ei e `null`. Fara ramura
   * asta, exact comenzile de dinainte n-ar fi urmarite niciodata, tacut. (Masurat atunci:
   * zero AWB-uri FAN in productie, deci multimea e goala azi, dar filtrul trebuie sa fie
   * corect, nu norocos.)
   */
  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, fan_courier_awb_number, fan_courier_status_code")
    .not("fan_courier_awb_number", "is", null)
    .neq("fan_courier_awb_number", "")
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    .or(`fan_courier_awb_at.gte.${since},fan_courier_awb_at.is.null`)
    .order("fan_courier_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT": ar fi o rulare perfect
   * sanatoasa la vedere, care n-a urmarit nimic.
   */
  if (eComenzi) {
    await logError({
      action: "fancourier-tracking",
      message: `comenzile cu AWB FAN Courier nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (comenzi && comenzi.length > 0) {
    /* Gruparea pe magazin: datele de acces sunt ale contului comerciantului. */
    const peMagazin = new Map<string, typeof comenzi>();
    for (const o of comenzi) {
      const lista = peMagazin.get(o.business_id) ?? [];
      lista.push(o);
      peMagazin.set(o.business_id, lista);
    }

    const configuri = new Map<string, FanCourierConfig | null>();
    const { data: setari, error: eSetari } = await admin
      .from("store_settings").select("business_id, fan_courier_config").in("business_id", [...peMagazin.keys()]);
    if (eSetari) {
      await logError({
        action: "fancourier-tracking",
        message: `configuratiile FAN Courier nu s-au putut citi: ${eSetari.message}`,
        severity: "critical",
      });
      return NextResponse.json({ ok: false, error: "configuratii necitite" }, { status: 503 });
    }
    for (const r of setari ?? []) configuri.set(r.business_id, r.fan_courier_config as FanCourierConfig | null);

    const proprietari = new Map<string, string>();
    const { data: firme } = await admin
      .from("businesses").select("id, user_id").in("id", [...peMagazin.keys()]);
    for (const f of firme ?? []) proprietari.set(f.id, f.user_id);

    for (const [businessId, lista] of peMagazin) {
      if (Date.now() >= termen) break;
      const config = configuri.get(businessId);

      if (!fanGata(config)) {
        /*
         * ⚠ MARCAJ CHIAR SI AICI. Un magazin care si-a oprit integrarea isi pastreaza
         * comenzile cu AWB; sarite fara marcaj, ele raman cu `fan_courier_status_checked_at`
         * NULL, ies PRIMELE la fiecare rulare si, cu 400 pe tura, pot bloca urmarirea
         * intregii platforme.
         */
        faraConfig += lista.length;
        await admin.from("orders")
          .update({ fan_courier_status_checked_at: new Date().toISOString() })
          .in("id", lista.map((o) => o.id)).eq("business_id", businessId);
        continue;
      }

      for (let i = 0; i < lista.length; i += MAX_AWB_PE_CERERE) {
        if (Date.now() >= termen) break;
        const felie = lista.slice(i, i + MAX_AWB_PE_CERERE);

        /** Marcajul de rotatie. Se scrie pentru TOATE cele cerute. Vezi antetul. */
        const marcheaza = async (ids: string[], cod?: string | null) => {
          if (ids.length === 0) return;
          const modificari: Database["public"]["Tables"]["orders"]["Update"] = {
            fan_courier_status_checked_at: new Date().toISOString(),
          };
          if (cod !== undefined) modificari.fan_courier_status_code = cod;
          const { error } = await admin
            .from("orders").update(modificari).in("id", ids).eq("business_id", businessId);
          if (error) console.error("[fancourier-tracking] marcajul nu s-a scris:", error.message);
        };

        let raspuns: Awaited<ReturnType<typeof getFanCourierTracking>>;
        try {
          raspuns = await getFanCourierTracking(config, felie.map((o) => o.fan_courier_awb_number!));
        } catch (e) {
          esuate += felie.length;
          socotesc(businessId).esuate += felie.length;
          console.error("[fancourier-tracking] lot", businessId, (e as Error).message);
          /* Marcaj si pe esec, ca rotatia sa inainteze. */
          await marcheaza(felie.map((o) => o.id));
          continue;
        }

        const dupaAwb = new Map(raspuns.map((r) => [String(r.awbNumber ?? "").trim(), r]));
        const neintoarse: string[] = [];

        for (const o of felie) {
          const r = dupaAwb.get(o.fan_courier_awb_number!.trim());
          if (!r) { neintoarse.push(o.id); continue; }

          verificate++;
          socotesc(businessId).verificate++;

          /*
           * ⚠ ULTIMUL EVENIMENT SE IA DUPA DATA, nu dupa pozitie. Exemplul din documentatie
           * e ordonat crescator, ceea ce invita la „ultimul din lista", dar ordinea nu e
           * garantata nicaieri. Vezi `ultimulEveniment`.
           */
          const ultimul = ultimulEveniment(r.events);
          const cod = (ultimul?.id ?? "").trim() || null;
          const seSchimba = !!cod && cod !== o.fan_courier_status_code;

          /* O stare finala nemodificata nu mai cere nimic: doar marcajul, ca sa treaca randul. */
          if (eStareFinala(cod) && !seSchimba) { await marcheaza([o.id]); continue; }

          const tinta = statusUrmator(o.status, cod);
          let prelucrat = true;
          if (tinta) {
            const rez = await tranzitieComandaMarketplace(admin, {
              orderId: o.id, businessId, status: tinta, sursa: "fancourier",
            });
            if (rez === "ok") {
              mutate++;
              void maybeAutoInvoice(businessId, o.id, tinta, o.payment_status ?? "", admin as never);
            }
            prelucrat = rez !== "reincearca";
          }

          if (seSchimba && trebuieSemnalat(cod)) {
            semnalate++;
            await semnaleaza(admin, {
              userId: proprietari.get(businessId) ?? null,
              businessId, orderId: o.id, orderNumber: o.order_number,
              awb: o.fan_courier_awb_number!,
              retur: esteRetur(cod),
              /* Numele vine de la FAN si e doar pentru ochii omului; hotararea a luat-o codul. */
              spune: (ultimul?.name ?? "").trim() || cod || "",
            });
          }

          /*
           * ⚠ Codul se retine ABIA dupa ce tranzitia a reusit.
           *
           * ⚠ SI SE SCRIE PE AWB-UL PE CARE L-AM CITIT (14.09.2026). Intre citirea lotului si
           * randul asta a trecut un apel la FAN, iar tura are 400 de comenzi. Daca intre timp
           * comanda a primit alt AWB, codul de aici e al expedierii VECHI: scris orbeste, unul
           * FINAL ar scoate expedierea NOUA din urmarire pentru totdeauna, tacut.
           *
           * ⚠ Marcajul in LOT de mai sus ramane neatins: acolo nu exista o singura identitate de
           * pus in conditie, si tocmai el apara coada. Vezi `scrieUrmarirea`.
           */
          if (prelucrat && cod !== null) {
            await scrieUrmarirea(admin, {
              orderId: o.id,
              businessId,
              identitate: { coloana: "fan_courier_awb_number", valoare: o.fan_courier_awb_number },
              stare: { fan_courier_status_code: cod },
              marcaj: { fan_courier_status_checked_at: new Date().toISOString() },
              actiune: "fancourier-tracking",
              orderNumber: o.order_number,
            });
          } else {
            await marcheaza([o.id]);
          }
        }

        necunoscute += neintoarse.length;
        socotesc(businessId).necunoscute += neintoarse.length;
        await marcheaza(neintoarse);
      }
    }
  }

  /*
   * ⚠ URMARIREA NU ARE VOIE SA MOARA IN TACERE. Date de acces schimbate fac fiecare lot sa
   * cada, iar ramurile de esec scriu doar in `console.error`.
   */
  if (verificate === 0 && esuate > 0) {
    await logError({
      action: "fancourier-tracking",
      message: `Urmarirea FAN Courier a esuat pe TOATE cele ${esuate} expedieri incercate. Cel mai probabil datele de acces nu mai sunt valide.`,
      details: { esuate, necunoscute },
      severity: "critical",
    });
  } else if (verificate === 0 && necunoscute >= MIN_NECUNOSCUTE_ALARMA) {
    /*
     * Al doilea fel de moarte tacuta, propriu variantei in LOT: apelul REUSESTE (200), dar
     * FAN nu recunoaste niciun AWB. Cazul obisnuit e comerciantul care si-a schimbat contul
     * sau sucursala si a lipit datele noi peste expedierile vechi.
     *
     * Pragul exista ca sa nu tipe pentru un singur AWB proaspat, pe care FAN inca nu l-a
     * inregistrat: cazul obisnuit si nevinovat.
     */
    await logError({
      action: "fancourier-tracking",
      message: `FAN Courier nu recunoaste niciunul dintre cele ${necunoscute} AWB-uri interogate. Cel mai probabil contul sau sucursala difera de cele cu care s-au emis expedierile.`,
      details: { necunoscute, faraConfig },
      severity: "warning",
    });
  }

  /*
   * ⚠ Si acum, MAGAZIN CU MAGAZIN, pentru cele pe care totalul le-a ascuns. Se sare peste
   * cazul in care alarma globala tocmai a tipat pentru acelasi lucru.
   */
  if (verificate > 0) {
    for (const [businessId, c] of socoteala) {
      if (c.verificate > 0) continue;
      if (c.esuate > 0) {
        await logError({
          action: "fancourier-tracking",
          message: `Urmarirea FAN Courier a esuat pe TOATE cele ${c.esuate} expedieri ale acestui magazin. Cel mai probabil datele lui de acces nu mai sunt valide.`,
          details: { esuate: c.esuate, necunoscute: c.necunoscute },
          businessId, severity: "critical",
        });
      } else if (c.necunoscute >= MIN_NECUNOSCUTE_ALARMA) {
        await logError({
          action: "fancourier-tracking",
          message: `FAN Courier nu recunoaste niciunul dintre cele ${c.necunoscute} AWB-uri ale acestui magazin. Cel mai probabil contul sau sucursala difera de cele cu care s-au emis expedierile.`,
          details: { necunoscute: c.necunoscute },
          businessId, severity: "warning",
        });
      }
    }
  }

  console.log(
    `[fancourier-tracking] verificate ${verificate}, mutate ${mutate}, semnalate ${semnalate}, esuate ${esuate}, necunoscute ${necunoscute}, faraConfig ${faraConfig}`,
  );
  return NextResponse.json({ ok: true, verificate, mutate, semnalate, esuate, necunoscute, faraConfig });
}

/**
 * Il anunta pe comerciant.
 *
 * ⚠ In `notifications`, nu doar in `error_logs`: acesta din urma se vede in `/admin/logs`,
 * adica la adminul PLATFORMEI, pe care comerciantul nu-l deschide.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null; businessId: string; orderId: string;
    orderNumber: string | null; awb: string; retur: boolean; spune: string;
  },
): Promise<void> {
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = p.retur ? "Expediere FAN Courier returnata" : "Expediere FAN Courier care cere atentie";
  const mesaj = p.retur
    ? `${comanda}: expedierea ${p.awb} se intoarce la tine (${p.spune}). Marfa vine inapoi; anularea comenzii si returul banilor raman decizia ta.`
    : `${comanda}: expedierea ${p.awb} are un eveniment care cere o decizie: ${p.spune}.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId, type: "fancourier", title: titlu, message: mesaj,
    });
    if (error) console.error("[fancourier-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "fancourier-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb },
    businessId: p.businessId,
    severity: p.retur ? "warning" : "info",
  });
}
