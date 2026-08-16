import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { ASTEPTARE_MS, upsGata, urmareste, type UpsConfig, type UrmarireUps } from "@/lib/ups/client";
import {
  codStatus, descriereStatus, eCombinatieNecunoscuta, eLivrat, eStareFinala, statusUrmator,
  tipStatus, trebuieSemnalat,
} from "@/lib/ups/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor UPS.
 *
 * ═══ ⚠ CRONUL E SINGURA CALE PRACTICA, SI NU DIN LIPSA DE WEBHOOK ═══
 *
 * UPS ARE webhook — „UPS Track Alert API v2" — si, spre deosebire de FedEx, nu cere
 * contract separat. Si totusi nu se poate folosi aici, din patru motive care se aduna:
 *
 *   1. **Abonamentul pe colet expira in 14 zile.** Verbatim: „Each tracking number
 *      subscription is valid for 14 days. If the package has not been delivered within
 *      14 days, you must resubscribe". Un retur blocat in vama trece usor de doua
 *      saptamani — adica exact coletele pentru care ai nevoie de urmarire.
 *   2. **In v2, adresa de webhook si credentiala NU se mai trimit prin API**, ci se
 *      configureaza de mana in portalul lor („Manage Webhook Credentials"). Deci sunt
 *      ale APLICATIEI, nu ale magazinului — iar mesajul lor nu poarta niciun numar de
 *      cont si niciun camp de referinta. Am primi un numar 1Z pe care nu-l putem lega
 *      de o comanda.
 *   3. **Mediul lor de test „will not create any subscription"** — bucla nu se poate
 *      proba deloc inainte de productie.
 *   4. **Sarcina utila e croita pentru Statele Unite**: `activityLocation.postalCode`
 *      are `pattern: ^\\d{5}(?:[-\\s]\\d{4})?$`, iar un cod postal romanesc de sase
 *      cifre nici nu trece.
 *
 * ═══ ⚠ AICI SE INTREABA CATE UN SINGUR AWB, SPRE DEOSEBIRE DE FEDEX ═══
 *
 * Urmarirea UPS e un `GET` cu numarul in cale. Nu exista varianta de lot:
 * `/track/v1/shipment/details/` pagineaza COLETELE unei singure expedieri, nu expedieri
 * diferite. Deci 120 de comenzi inseamna 120 de apeluri — ca la Shipo si Packeta, si
 * spre deosebire de FedEx, unde 30 incapeau intr-o cerere.
 *
 * ═══ ⚠ SI `D` NU INSEAMNA „LIVRAT" ═══
 *
 * Vezi `statusuri.ts`: tipul `D` acopera „loaded on delivery vehicle, out for delivery,
 * delivered". Livrarea se dovedeste cu `deliveryDate[type=DEL]` sau cu prezenta lui
 * `deliveryInformation` — altfel comanda ar trece pe „Livrata" si s-ar factura automat
 * in timp ce coletul e in masina.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la ceilalti: emailul de expediere pleaca DOAR din `updateOrder`,
 * care e legata de plafoanele de instiintare ale contului. Un cron n-are utilizator,
 * deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * 45 de zile, ca la Shipo, Packeta si FedEx. Regula lor de pastrare e mai generoasa
 * („Data is rolled off after the **120 day** retention period"), dar ce conteaza aici e
 * cat poate dura un RETUR international: un colet blocat in vama si intors la expeditor
 * depaseste usor 30 de zile.
 */
const ZILE = 45;

/**
 * ⚠ Plafonul e mai mic decat la FedEx, si nu din prudenta.
 *
 * Acolo o cerere ducea 30 de numere; aici fiecare expediere e un apel. Cu bugetul de
 * mai jos si 20 de secunde de asteptare pe apel, mai mult n-ar apuca sa plece — iar
 * comenzile ramase ar fi numarate corect in `ramase` si luate la rularea urmatoare.
 */
const MAX_COMENZI = 60;

/**
 * ⚠ TREBUIE SA FIE ASTEPTAREA REALA A APELULUI, nu una dorita.
 *
 * Se importa chiar constanta clientului (`ASTEPTARE_MS`), ca sa nu se poata departa una
 * de alta: scrisa mai mica aici, bugetul ar iesi prea mare, ultimul apel ar porni la
 * timp si tot ar depasi `maxDuration`, iar Vercel taie functia INAINTE de marcaj — deci
 * expedierile acelea ar ramane in capul cozii la fiecare rulare, la nesfarsit.
 * (Defectul a fost prins la Packeta.)
 */
const MARJA_MS = 5_000;
/*
 * ⚠ Se rezerva DOUA asteptari, nu una, plus cea de autentificare.
 *
 * `apel()` reincearca o singura data pe 401 („token expirat"), iar reincercarea inseamna
 * o cerere de token PLUS a doua cerere de urmarire. Cu o singura asteptare rezervata,
 * ultimul apel pornit chiar sub termen putea ajunge la ~55 de secunde, Vercel taia
 * functia INAINTE de marcaj, iar comanda ramanea cu marcajul vechi — deci iesea prima
 * si la rularea urmatoare, unde se repeta acelasi 401 lent. (Defectul a fost prins la
 * Packeta, in forma lui simpla.)
 */
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS * 2 - 15_000 - MARJA_MS;

/** ⚠ Cate esecuri pe magazin inainte de alarma. Un AWB proaspat pe care ei inca nu-l
    cunosc e purtare normala; chei rotite sunt altceva. */
const MIN_ESECURI_ALARMA = 3;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  ups_awb_number: string | null;
  ups_awb_at: string | null;
  ups_status_type: string | null;
  ups_status_code: string | null;
  ups_status_checked_at: string | null;
};

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
  const since = new Date(Date.now() - ZILE * 86400000).toISOString();

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, ups_awb_number, ups_awb_at, ups_status_type, ups_status_code, ups_status_checked_at")
    .not("ups_awb_number", "is", null)
    .neq("ups_awb_number", "")
    /* ⚠ Comenzile incheiate isi pastreaza numarul AWB, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii: altfel o comanda veche
     * careia i se emite AWB-ul abia acum n-ar fi interogata niciodata. Si e scrisa cu
     * DOI termeni simpli — o sintaxa imbricata gresita nu da eroare, da LISTA GOALA,
     * adica urmarirea moare raportand vesel `ok: true`.
     */
    .or(`ups_awb_at.gte.${since},ups_awb_at.is.null`)
    .order("ups_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT". */
  if (eOrders) {
    await logError({
      action: "ups-tracking",
      message: `citirea comenzilor a esuat: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citirea comenzilor a esuat" }, { status: 500 });
  }

  const lista = (orders ?? []) as Comanda[];
  if (lista.length === 0) return NextResponse.json({ ok: true, verificate: 0 });

  const businessIds = [...new Set(lista.map((o) => o.business_id))];
  const [{ data: setari }, { data: afaceri }] = await Promise.all([
    admin.from("store_settings").select("business_id, ups_config").in("business_id", businessIds),
    admin.from("businesses").select("id, user_id").in("id", businessIds),
  ]);
  const configuri = new Map<string, UpsConfig | null>(
    (setari ?? []).map((s) => [s.business_id as string, (s.ups_config ?? null) as UpsConfig | null]),
  );
  const proprietari = new Map<string, string | null>(
    (afaceri ?? []).map((b) => [b.id as string, (b.user_id ?? null) as string | null]),
  );

  let verificate = 0, mutate = 0, semnalate = 0, esuate = 0;
  let sarite = 0, incheiate = 0, faraConfig = 0, faraRaspuns = 0;
  /* ⚠ Perechile (tip, cod) pe care nu le cunoastem inca. Vezi la finalul fisierului. */
  const necunoscute = new Set<string>();

  const galeti = new Map<string, { esecuri: number; reusite: number; exemplu: string }>();
  const galeata = (bizId: string) => {
    let g = galeti.get(bizId);
    if (!g) { g = { esecuri: 0, reusite: 0, exemplu: "" }; galeti.set(bizId, g); }
    return g;
  };

  /**
   * „Am ajuns la expedierea asta."
   *
   * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE. Marcajul e singurul
   * lucru care face rotatia sa inainteze; sarit pe ramura de esec, o expediere care pica
   * de fiecare data ar ramane cu marcajul NULL, deci ar iesi PRIMA la fiecare rulare, la
   * nesfarsit — si saizeci de astfel de comenzi ar bloca urmarirea intregii platforme,
   * fara nicio eroare.
   */
  const marcheazaVerificat = async (o: Comanda, tipNou: string | null, codNou: string | null) => {
    const { error } = await admin
      .from("orders")
      .update({
        ups_status_type: tipNou ?? o.ups_status_type,
        ups_status_code: codNou ?? o.ups_status_code,
        ups_status_checked_at: new Date().toISOString(),
      })
      .eq("id", o.id)
      .eq("business_id", o.business_id);
    if (error) {
      await logError({
        action: "ups-tracking",
        message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Expedierea ramane in capul cozii.`,
        details: { orderId: o.id, awb: o.ups_awb_number },
        businessId: o.business_id,
        severity: "warning",
      });
    }
  };

  /*
   * Cine chiar merita intrebat, grupat pe magazin.
   *
   * ⚠ Expedierile incheiate NU se scot din interogare, se dau la RAND. Un retur sau o
   * anulare nu misca statusul comenzii — decizia e a comerciantului — deci comanda ramane
   * „expediata" si se potriveste filtrului toate cele 45 de zile. Sarita fara sa i se
   * atinga marcajul, si-ar pastra locul in fata.
   *
   * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care poate fi
   * `NULL` da `NULL`, adica ar arunca afara chiar expedierile neverificate inca — exact
   * cele pentru care exista cronul.
   *
   * ⚠ Gruparea pe magazin ramane obligatorie chiar daca fiecare AWB e un apel: fiecare
   * magazin are contul lui si tokenul lui, iar un AWB al magazinului A cerut cu tokenul
   * magazinului B nu se gaseste.
   */
  const peMagazin = new Map<string, Comanda[]>();
  for (const o of lista) {
    if (eStareFinala(o.ups_status_type, o.ups_status_code)) {
      incheiate++;
      await marcheazaVerificat(o, null, null);
      continue;
    }
    if (!upsGata(configuri.get(o.business_id))) {
      faraConfig++;
      await marcheazaVerificat(o, null, null);
      continue;
    }
    const grup = peMagazin.get(o.business_id) ?? [];
    grup.push(o);
    peMagazin.set(o.business_id, grup);
  }

  for (const [bizId, comenzi] of peMagazin) {
    const config = configuri.get(bizId)!;

    for (let i = 0; i < comenzi.length; i++) {
      if (Date.now() >= termen) {
        sarite += comenzi.length - i;
        break;
      }

      const o = comenzi[i];

      let raspunsuri: UrmarireUps[];
      try {
        raspunsuri = await urmareste(config, o.ups_awb_number!);
      } catch (e) {
        esuate++;
        const g = galeata(bizId);
        g.esecuri++;
        g.exemplu ||= (e as Error).message;
        console.error("[ups-tracking] apel picat:", (e as Error).message);
        await marcheazaVerificat(o, null, null);
        continue;
      }

      /*
       * ⚠ Un AWB pentru care ei n-au intors NIMIC nu e nici succes, nici esec de retea.
       * Cel mai des inseamna „prea nou": un colet abia creat nu apare imediat in
       * urmarire, iar `urmareste()` transforma 404-ul lor in lista goala tocmai ca sa se
       * poata deosebi cazul asta de o cadere.
       */
      const u = raspunsuri.find((x) => x.awb === o.ups_awb_number) ?? raspunsuri[0];
      if (!u) {
        faraRaspuns++;
        await marcheazaVerificat(o, null, null);
        continue;
      }

      verificate++;
      galeata(bizId).reusite++;

      const tipNou = tipStatus(u.tip);
      const codNou = codStatus(u.cod);

      /* Se strang perechile noi, ca sa poata creste tabelul din trafic real. */
      if (eCombinatieNecunoscuta(tipNou, codNou)) necunoscute.add(`${tipNou ?? "-"}/${codNou ?? "-"}`);

      /*
       * Un AWB inregistrat, dar fara stare inca: nu e defect.
       *
       * ⚠ DAR SE INTREABA SI `eLivrat`, nu doar `tipNou`. In `Tracking.yaml` NICIUN camp
       * al raspunsului nu e `required` — nici macar `status.type`. Un raspuns cu
       * `{code: "FS", description: "Delivered"}` si FARA `type` ar fi intrat pe ramura
       * asta, si-ar fi scris `FS` pe comanda si ar fi sarit tranzitia. La rularea
       * urmatoare `eStareFinala` ar fi vazut chiar acel `FS`, ar fi socotit expedierea
       * incheiata si ar fi scos-o din urmarire — comanda ramanea „Expediata" pentru
       * totdeauna, nefacturata automat, si nimeni n-avea de unde afla de ce.
       */
      if (tipNou === null && !eLivrat(tipNou, codNou, u.livratLa, u.areDovadaLivrarii)) {
        await marcheazaVerificat(o, null, codNou);
        continue;
      }

      const tinta = statusUrmator(o.status, tipNou, codNou, u.livratLa, u.areDovadaLivrarii);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id,
          businessId: o.business_id,
          status: tinta,
          sursa: "ups",
        });
        if (rez === "ok") {
          mutate++;
          /* ⚠ SE ASTEAPTA, nu `void`: intr-o functie serverless nu exista „mai tarziu".
             Si nu exista a doua trecere — comanda e deja pe `delivered`, deci
             `statusUrmator` va intoarce `null` la fiecare rulare viitoare. */
          try {
            await maybeAutoInvoice(o.business_id, o.id, tinta, o.payment_status ?? "", admin as never);
          } catch (e) {
            await logError({
              action: "ups-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id, awb: o.ups_awb_number },
              businessId: o.business_id,
              severity: "warning",
            });
          }
        }
        prelucrat = rez !== "reincearca";
      }

      /*
       * ⚠ SE SEMNALEAZA DOAR SCHIMBAREA, si INAINTE de marcaj.
       *
       * Scris intai marcajul, o cadere a functiei intre cele doua ar lasa comanda cu
       * starea retinuta si fara notificare — iar daca acea stare e finala, expedierea
       * iese pe loc din urmarire si nicio rulare viitoare nu mai repara nimic.
       *
       * ⚠ Comparatia se face pe valoarea NORMALIZATA a celei vechi: coloana poate purta
       * „mv" scris de mana, iar `tipNou` e mereu majuscule. Fara normalizare, aceeasi
       * stare s-ar resemnala la fiecare rulare.
       */
      /*
       * ⚠ SE COMPARA PERECHEA (tip, cod), NU DOAR TIPUL.
       *
       * Toate exceptiile UPS au acelasi tip — `X`. Comparat doar pe tip, a DOUA exceptie
       * a aceleiasi expedieri n-ar mai fi ajuns niciodata la comerciant: „adresa
       * incompleta" si, doua zile mai tarziu, „coletul se intoarce la expeditor" sunt
       * amandoua `X`, iar a doua ar fi trecut in tacere. Returul e chiar cazul in care
       * omul TREBUIE anuntat, si e singurul semnal pe care UPS il da pentru el — ei
       * n-au niciun tip de retur.
       */
      const vechi = `${tipStatus(o.ups_status_type) ?? ""}/${codStatus(o.ups_status_code) ?? ""}`;
      const acum = `${tipNou ?? ""}/${codNou ?? ""}`;
      if (tipNou !== null && acum !== vechi && trebuieSemnalat(tipNou)) {
        semnalate++;
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          awb: o.ups_awb_number!,
          tip: tipNou,
          descriere: descriereStatus(tipNou, codNou, u.descriere),
        });
      }

      /*
       * ⚠ Starea se retine ABIA dupa ce tranzitia a reusit: scrisa inainte, un tip FINAL
       * ar fi ramas pe comanda chiar daca tranzitia a picat, iar `eStareFinala` ar fi
       * scos expedierea din urmarire pentru totdeauna.
       */
      await marcheazaVerificat(o, prelucrat ? tipNou : null, prelucrat ? codNou : null);
    }
  }

  /*
   * ⚠ Alarma se ridica PE MAGAZIN. Pe intreaga platforma, un magazin cu cheile rotite ar
   * fi fost acoperit de altul sanatos, iar urmarirea lui ar fi murit in tacere.
   */
  for (const [bizId, g] of galeti) {
    if (g.esecuri >= MIN_ESECURI_ALARMA && g.reusite === 0) {
      await logError({
        action: "ups-tracking",
        message: `urmarirea UPS a esuat pentru toate cele ${g.esecuri} expedieri verificate ale magazinului: ${g.exemplu}. Verifica Client ID, Client Secret si numarul de cont din configurare.`,
        details: { businessId: bizId, esecuri: g.esecuri },
        businessId: bizId,
        severity: "critical",
      });
    }
  }

  /*
   * ⚠ PERECHILE NOI SE SCRIU IN JURNAL, si asta e singurul fel in care tabelul poate
   * creste corect.
   *
   * UPS **nu publica** enumerarea lui `status.code` pentru API-ul REST, iar tabelul de
   * 687 de coduri de pe site-ul lor e alt vocabular (`FS` — codul pe care ei insisi il
   * dau ca exemplu pentru „Delivered" — nici nu apare in el). Deci nu se ghiceste: se
   * strang perechile reale si, peste cateva saptamani, `CODURI` se completeaza din ele.
   *
   * `info`, nu `warning`: nu e un defect, e material de lucru.
   */
  if (necunoscute.size > 0) {
    await logError({
      action: "ups-tracking",
      message: `perechi (tip/cod) UPS pe care nu le cunoastem inca: ${[...necunoscute].join(", ")}`,
      details: { perechi: [...necunoscute] },
      severity: "info",
    });
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, esuate, sarite, incheiate, faraConfig, faraRaspuns,
    necunoscute: [...necunoscute],
  });
}

/**
 * Notificarea catre comerciant.
 *
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat: „X" nu inseamna nimic pentru
 * cineva care n-a citit nomenclatorul UPS, iar o notificare pe care omul n-o intelege se
 * inchide fara sa faca nimic.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null;
    businessId: string;
    orderId: string;
    orderNumber: string | null;
    awb: string;
    tip: string;
    descriere: string;
  },
): Promise<void> {
  const anulat = p.tip === "MV";
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = anulat ? "AWB UPS anulat" : "Expediere UPS care cere atentie";
  const spune = p.descriere || `status UPS ${p.tip}`;

  const mesaj = anulat
    /* ⚠ Anularea vazuta de cron s-a facut in ALTA parte decat panoul nostru: al nostru
       scoate numarul de pe comanda, deci coletul ar fi iesit din interogare. Comanda
       poarta un AWB mort — omul trebuie sa afle. */
    ? `${comanda}: AWB-ul ${p.awb} figureaza ANULAT la UPS, dar comanda il poarta in continuare. Daca anularea a fost intentionata, sterge AWB-ul din pagina comenzii; altfel emite unul nou.`
    /* ⚠ Si se spune limpede ca o exceptie NU inseamna esec: „something out of the normal
       happened to your package, but it may still be delivered on time". */
    : `${comanda}: expedierea ${p.awb} are o exceptie pe traseu: ${spune}. UPS spune ca un colet cu exceptie poate ajunge totusi la timp — deschide comanda pentru istoricul complet inainte de a lua o decizie.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "ups",
      title: titlu,
      message: mesaj,
    });
    if (error) console.error("[ups-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "ups-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb, tip: p.tip },
    businessId: p.businessId,
    severity: anulat ? "warning" : "info",
  });
}
