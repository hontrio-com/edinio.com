import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import {
  ASTEPTARE_MS, fedexGata, MAX_AWB_PE_CERERE, urmareste,
  type FedexConfig, type UrmarireFedex,
} from "@/lib/fedex/client";
import {
  codStatus, descriereStatus, eStareFinala, esteRetur, statusUrmator, trebuieSemnalat,
} from "@/lib/fedex/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor FedEx.
 *
 * ═══ ⚠ CRONUL E SINGURA CALE, SI NU DIN LIPSA DE WEBHOOK ═══
 *
 * FedEx ARE webhook — Advanced Integrated Visibility. Dar nu ne e disponibil, si
 * asta e scris de ei, nu dedus:
 *   - „Subscriptions currently require U.S. based FedEx 9-digit account for billing";
 *   - „At this point, we do not offer webhooks for customers outside the United States";
 *   - e produs cu plata, 199-1.499 $/luna dupa volum.
 *
 * Deci nu are rost sa fie asteptat. Daca cronul ruleaza prost, nimeni nu afla ca un
 * colet a fost livrat, refuzat sau returnat.
 *
 * ═══ ⚠ AICI SE INTREABA 30 DE AWB-URI DEODATA ═══
 *
 * Spre deosebire de Shipo, Posta si Packeta — unde fiecare expediere e un apel —
 * `POST /track/v1/trackingnumbers` accepta pana la 30 de numere intr-o cerere
 * (peste, raspunde `TRACKING.TRACKINGNUMBERS.LIMITEXCEEDED`). Asta schimba
 * economia rularii: 120 de comenzi inseamna 4 apeluri, nu 120.
 *
 * ⚠ Dar tot cere gruparea PE MAGAZIN: fiecare magazin are contul lui si tokenul
 * lui, iar un AWB al magazinului A cerut cu tokenul magazinului B nu se gaseste.
 *
 * ═══ ⚠ RASPUNSUL POATE „REUSI" SI SA CONTINA ESECURI ═══
 *
 * `trackResults[].error` e o eroare PE NUMAR, intr-un raspuns 200. Un client care
 * s-ar opri la statusul HTTP ar citi „nu exista AWB-ul" ca „nicio schimbare".
 * Tratata in `urmareste()`, si ce ramane aici e ca un AWB cu eroare sa fie numarat
 * ca esec, nu ca verificare reusita.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la ceilalti: emailul de expediere pleaca DOAR din
 * `updateOrder`, care e legata de plafoanele de instiintare ale contului. Un cron
 * n-are utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * 45 de zile, ca la Shipo si Packeta. Regula lor de pastrare e mai generoasa
 * („Tracking information is available for 90 days after delivery"), dar ce conteaza
 * aici e cat poate dura un RETUR international: un colet blocat in vama si intors
 * la expeditor depaseste usor 30 de zile, iar o fereastra mai scurta l-ar pierde
 * chiar in intervalul in care se decide daca marfa vine inapoi.
 */
const ZILE = 45;

/** ⚠ 30 e plafonul LOR pe cerere. Peste, `TRACKING.TRACKINGNUMBERS.LIMITEXCEEDED`. */
const PE_CERERE = MAX_AWB_PE_CERERE;

/** Cu 30 pe cerere, 120 de comenzi inseamna cel mult 4 apeluri pe magazin. */
const MAX_COMENZI = 120;

/**
 * ⚠ TREBUIE SA FIE ASTEPTAREA REALA A APELULUI, nu una dorita.
 *
 * Se importa chiar constanta clientului (`ASTEPTARE_MS`), ca sa nu se poata departa
 * una de alta: scrisa mai mica aici, bugetul ar iesi prea mare, ultima felie ar
 * porni la timp si tot ar depasi `maxDuration`, iar Vercel taie functia INAINTE de
 * marcaj — deci expedierile acelea ar ramane in capul cozii la fiecare rulare, la
 * nesfarsit. (Defectul a fost prins la Packeta.)
 */
const MARJA_MS = 5_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;

/** ⚠ Cate esecuri pe magazin inainte de alarma. Un AWB proaspat pe care ei inca
    nu-l cunosc e purtare normala („It takes up to 24 hours for a new package to
    show up in the system"); chei rotite sunt altceva. */
const MIN_ESECURI_ALARMA = 3;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  fedex_awb_number: string | null;
  fedex_awb_at: string | null;
  fedex_status_code: string | null;
  fedex_status_checked_at: string | null;
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
    .select("id, business_id, status, order_number, payment_status, fedex_awb_number, fedex_awb_at, fedex_status_code, fedex_status_checked_at")
    .not("fedex_awb_number", "is", null)
    .neq("fedex_awb_number", "")
    /* ⚠ Comenzile incheiate isi pastreaza numarul AWB, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii: altfel o comanda
     * veche careia i se emite AWB-ul abia acum n-ar fi interogata niciodata.
     * Si e scrisa cu DOI termeni simpli — o sintaxa imbricata gresita nu da eroare,
     * da LISTA GOALA, adica urmarirea moare raportand vesel `ok: true`.
     */
    .or(`fedex_awb_at.gte.${since},fedex_awb_at.is.null`)
    .order("fedex_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT". */
  if (eOrders) {
    await logError({
      action: "fedex-tracking",
      message: `citirea comenzilor a esuat: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citirea comenzilor a esuat" }, { status: 500 });
  }

  const lista = (orders ?? []) as Comanda[];
  if (lista.length === 0) return NextResponse.json({ ok: true, verificate: 0 });

  const businessIds = [...new Set(lista.map((o) => o.business_id))];
  const [{ data: setari }, { data: afaceri }] = await Promise.all([
    admin.from("store_settings").select("business_id, fedex_config").in("business_id", businessIds),
    admin.from("businesses").select("id, user_id").in("id", businessIds),
  ]);
  const configuri = new Map<string, FedexConfig | null>(
    (setari ?? []).map((s) => [s.business_id as string, (s.fedex_config ?? null) as FedexConfig | null]),
  );
  const proprietari = new Map<string, string | null>(
    (afaceri ?? []).map((b) => [b.id as string, (b.user_id ?? null) as string | null]),
  );

  /*
   * ⚠ NU EXISTA `sarite` AICI, spre deosebire de cronurile celorlalti curieri.
   *
   * La ei fiecare expediere e un apel, deci termenul se verifica si INAINTE de
   * fiecare apel din felie, iar ce ramane netrimis din felia curenta se numara
   * separat. La FedEx o cerere duce 30 de numere: ori pleaca toata felia, ori niciun
   * numar din ea — nu exista „sarita in interiorul feliei". Tot ce n-a apucat sa
   * plece intra in `ramase`.
   *
   * Contorul exista o vreme, mostenit din sablon, si raporta VESNIC zero. Un numar
   * care nu se schimba niciodata e mai rau decat lipsa lui: cine se uita in raspunsul
   * cronului crede ca a masurat ceva.
   */
  let verificate = 0, mutate = 0, semnalate = 0, esuate = 0;
  let ramase = 0, incheiate = 0, faraConfig = 0, faraRaspuns = 0;

  const galeti = new Map<string, { esecuri: number; reusite: number; exemplu: string }>();
  const galeata = (bizId: string) => {
    let g = galeti.get(bizId);
    if (!g) { g = { esecuri: 0, reusite: 0, exemplu: "" }; galeti.set(bizId, g); }
    return g;
  };

  /**
   * „Am ajuns la expedierea asta."
   *
   * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE. Marcajul e
   * singurul lucru care face rotatia sa inainteze; sarit pe ramura de esec, o
   * expediere care pica de fiecare data ar ramane cu marcajul NULL, deci ar iesi
   * PRIMA la fiecare rulare, la nesfarsit — si o suta douazeci de astfel de comenzi
   * ar bloca urmarirea intregii platforme, fara nicio eroare.
   */
  const marcheazaVerificat = async (o: Comanda, codNou: string | null) => {
    const { error } = await admin
      .from("orders")
      .update({
        fedex_status_code: codNou ?? o.fedex_status_code,
        fedex_status_checked_at: new Date().toISOString(),
      })
      .eq("id", o.id)
      .eq("business_id", o.business_id);
    if (error) {
      await logError({
        action: "fedex-tracking",
        message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Expedierea ramane in capul cozii.`,
        details: { orderId: o.id, awb: o.fedex_awb_number },
        businessId: o.business_id,
        severity: "warning",
      });
    }
  };

  /*
   * Cine chiar merita intrebat, grupat pe magazin.
   *
   * ⚠ Expedierile incheiate NU se scot din interogare, se dau la RAND. Un retur sau
   * o anulare nu misca statusul comenzii — decizia e a comerciantului — deci comanda
   * ramane „expediata" si se potriveste filtrului toate cele 45 de zile. Sarita fara
   * sa i se atinga marcajul, si-ar pastra locul in fata.
   *
   * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care poate fi
   * `NULL` da `NULL`, adica ar arunca afara chiar expedierile neverificate inca —
   * exact cele pentru care exista cronul.
   */
  const peMagazin = new Map<string, Comanda[]>();
  for (const o of lista) {
    if (eStareFinala(o.fedex_status_code)) {
      incheiate++;
      await marcheazaVerificat(o, null);
      continue;
    }
    if (!fedexGata(configuri.get(o.business_id))) {
      faraConfig++;
      await marcheazaVerificat(o, null);
      continue;
    }
    const grup = peMagazin.get(o.business_id) ?? [];
    grup.push(o);
    peMagazin.set(o.business_id, grup);
  }

  for (const [bizId, comenzi] of peMagazin) {
    const config = configuri.get(bizId)!;

    for (let i = 0; i < comenzi.length; i += PE_CERERE) {
      if (Date.now() >= termen) {
        ramase += comenzi.length - i;
        break;
      }

      const felie = comenzi.slice(i, i + PE_CERERE);
      const awburi = felie.map((o) => o.fedex_awb_number!).filter(Boolean);

      let raspunsuri: UrmarireFedex[];
      try {
        raspunsuri = await urmareste(config, awburi);
      } catch (e) {
        /*
         * ⚠ Un apel picat inseamna ca TOATE cele 30 de expedieri din felie raman
         * neverificate. Fiecare isi primeste marcajul, altfel felia asta ar iesi
         * prima si la rularea urmatoare, si urmatoarea.
         */
        esuate += felie.length;
        const g = galeata(bizId);
        g.esecuri += felie.length;
        g.exemplu ||= (e as Error).message;
        console.error("[fedex-tracking] felie picata:", (e as Error).message);
        for (const o of felie) await marcheazaVerificat(o, null);
        continue;
      }

      const dupaAwb = new Map(raspunsuri.map((r) => [r.awb, r]));

      for (const o of felie) {
        const u = dupaAwb.get(o.fedex_awb_number!);

        /*
         * ⚠ Un AWB pentru care ei n-au intors NIMIC nu e nici succes, nici esec de
         * retea. Cel mai des inseamna „prea nou": documentatia lor spune „It takes
         * up to 24 hours for a new package/order to show up in the system."
         */
        if (!u) {
          faraRaspuns++;
          await marcheazaVerificat(o, null);
          continue;
        }

        if (u.eroare) {
          esuate++;
          const g = galeata(bizId);
          g.esecuri++;
          g.exemplu ||= u.eroare;
          await marcheazaVerificat(o, null);
          continue;
        }

        verificate++;
        galeata(bizId).reusite++;

        /*
         * ⚠ Se citeste `latestStatusDetail`, NU ultimul `scanEvent`.
         *
         * Primul e starea EXPEDIERII, un rezumat tinut de ei. Al doilea e un
         * eveniment dintre zecile de pe drum, iar FedEx spune el insusi ca
         * evenimentele pot sosi in ALTA ordine („must look at the scan event time
         * stamp for the correct order"). La GLS lectia a fost aceeasi: ultimul
         * eveniment poate fi administrativ, iar o livrare petrecuta intre timp nu
         * s-ar mai vedea niciodata.
         */
        const codNou = codStatus(u.cod);
        /* Un AWB inregistrat, dar fara stare inca: nu e defect. */
        if (codNou === null && !u.livratLa) { await marcheazaVerificat(o, null); continue; }

        const tinta = statusUrmator(o.status, codNou, u.livratLa);
        let prelucrat = true;
        if (tinta) {
          const rez = await tranzitieComandaMarketplace(admin, {
            orderId: o.id,
            businessId: o.business_id,
            status: tinta,
            sursa: "fedex",
          });
          if (rez === "ok") {
            mutate++;
            /* ⚠ SE ASTEAPTA, nu `void`: intr-o functie serverless nu exista „mai
               tarziu". Si nu exista a doua trecere — comanda e deja pe `delivered`,
               deci `statusUrmator` va intoarce `null` la fiecare rulare viitoare. */
            try {
              await maybeAutoInvoice(o.business_id, o.id, tinta, o.payment_status ?? "", admin as never);
            } catch (e) {
              await logError({
                action: "fedex-tracking",
                message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
                details: { orderId: o.id, awb: o.fedex_awb_number },
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
         * Scris intai marcajul, o cadere a functiei intre cele doua ar lasa comanda
         * cu codul retinut si fara notificare — iar daca acel cod e final, expedierea
         * iese pe loc din urmarire si nicio rulare viitoare nu mai repara nimic.
         *
         * ⚠ Comparatia se face pe valoarea NORMALIZATA a celei vechi: coloana poate
         * purta „dl" scris de mana, iar `codNou` e mereu majuscule. Fara normalizare,
         * aceeasi stare s-ar resemnala la fiecare rulare.
         */
        const vechi = codStatus(o.fedex_status_code);
        if (codNou !== null && codNou !== vechi && trebuieSemnalat(codNou)) {
          semnalate++;
          await semnaleaza(admin, {
            userId: proprietari.get(o.business_id) ?? null,
            businessId: o.business_id,
            orderId: o.id,
            orderNumber: o.order_number,
            awb: o.fedex_awb_number!,
            cod: codNou,
            descriere: descriereStatus(codNou, u.descriere),
          });
        }

        /*
         * ⚠ Codul se retine ABIA dupa ce tranzitia a reusit: scris inainte, un cod
         * FINAL ar fi ramas pe comanda chiar daca tranzitia a picat, iar
         * `eStareFinala` ar fi scos expedierea din urmarire pentru totdeauna.
         */
        await marcheazaVerificat(o, prelucrat ? codNou : null);
      }
    }
  }

  /*
   * ⚠ Alarma se ridica PE MAGAZIN. Pe intreaga platforma, un magazin cu cheile
   * rotite ar fi fost acoperit de altul sanatos, iar urmarirea lui ar fi murit in
   * tacere.
   */
  for (const [bizId, g] of galeti) {
    if (g.esecuri >= MIN_ESECURI_ALARMA && g.reusite === 0) {
      await logError({
        action: "fedex-tracking",
        message: `urmarirea FedEx a esuat pentru toate cele ${g.esecuri} expedieri verificate ale magazinului: ${g.exemplu}. Verifica API Key, Secret Key si numarul de cont din configurare.`,
        details: { businessId: bizId, esecuri: g.esecuri },
        businessId: bizId,
        severity: "critical",
      });
    }
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, esuate, ramase, incheiate, faraConfig, faraRaspuns,
  });
}

/**
 * Notificarea catre comerciant.
 *
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat: „RS" nu inseamna nimic
 * pentru cineva care n-a citit nomenclatorul FedEx, iar o notificare pe care omul
 * n-o intelege se inchide fara sa faca nimic.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null;
    businessId: string;
    orderId: string;
    orderNumber: string | null;
    awb: string;
    cod: string;
    descriere: string;
  },
): Promise<void> {
  const retur = esteRetur(p.cod);
  const anulat = p.cod === "CA";
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = retur ? "Colet FedEx returnat" : anulat ? "AWB FedEx anulat" : "Expediere FedEx care cere atentie";
  const spune = p.descriere || `status FedEx ${p.cod}`;

  const mesaj = retur
    /* ⚠ La FedEx nu exista ramburs, deci nu exista nici bani de intors — spre
       deosebire de textul de la Shipo si SmartShip. Marfa e singurul lucru in joc. */
    ? `${comanda}: coletul ${p.awb} se intoarce la tine (${spune}). FedEx nu are cod pentru „retur incheiat", deci urmareste-l pana ajunge; anularea comenzii si returul banilor raman decizia ta.`
    : anulat
      /* ⚠ Anularea vazuta de cron s-a facut in ALTA parte decat panoul nostru: al
         nostru scoate numarul de pe comanda, deci coletul ar fi iesit din
         interogare. Comanda poarta un AWB mort — omul trebuie sa afle. */
      ? `${comanda}: AWB-ul ${p.awb} figureaza ANULAT la FedEx, dar comanda il poarta in continuare. Daca anularea a fost intentionata, sterge AWB-ul din pagina comenzii; altfel emite unul nou.`
      : `${comanda}: expedierea ${p.awb} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "fedex",
      title: titlu,
      message: mesaj,
    });
    if (error) console.error("[fedex-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "fedex-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb, cod: p.cod },
    businessId: p.businessId,
    severity: retur || anulat ? "warning" : "info",
  });
}
