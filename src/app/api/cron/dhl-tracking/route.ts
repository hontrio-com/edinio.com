import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import {
  ASTEPTARE_MS, dhlGata, MAX_AWB_PE_CERERE, urmareste,
  type DhlConfig, type UrmarireDhl,
} from "@/lib/dhl/client";
import {
  codStatus, descriereStatus, eCombinatieNecunoscuta, eLivrat, eStareFinala, esteRetur,
  statusUrmator, trebuieSemnalat,
} from "@/lib/dhl/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor DHL Express.
 *
 * ═══ ⚠ CRONUL E SINGURA CALE, SI ASTA SE POATE DOVEDI ═══
 *
 * DHL ARE un Push API de urmarire. DHL Express NU e printre serviciile lui. Verbatim din
 * PDF-ul lor „Shipment Tracking Unified - Push API 101 for Externals", sectiunea „Service
 * availability as of June of 2025":
 *   „DHL Express / Subscription by shipment ID: **No** / Subscription by account ID: **No**"
 * Confirmat independent de articolul lor de suport.
 *
 * ⚠⚠ SI E EXACT TIPARUL „INTEGRARE CARE NU FACE NIMIC". Enumerarea `service` din OpenAPI-ul
 * lor de push contine `express` — e chiar EXEMPLUL din schema. Deci `POST /subscription` cu
 * `service: express` trece de validare si raspunde `201 Created`. Dupa care nu soseste
 * niciodata nicio instiintare. Cine leaga push-ul pe baza enumerarii primeste un raspuns de
 * succes si zero efect, iar comenzile raman „Expediate" pentru totdeauna.
 *
 * Chiar daca ar fi fost suportat, tot n-ar fi mers la o platforma cu multe magazine: cheia e
 * a APLICATIEI (`DHL-API-Key` de portal), nu a contului DHL al comerciantului; un abonament
 * duce cel mult 10 AWB-uri (`maxItems: 10`); iar handlerul trebuie sa raspunda 200 in 5
 * secunde, altfel dupa trei esecuri abonamentul se dezactiveaza si anuntul pleaca pe emailul
 * contactului tehnic al contului DHL — nu in aplicatie. N-am afla ca s-a oprit.
 *
 * ═══ ⚠⚠ RITMUL E LA TREI ORE, SI NU DIN PRUDENTA ═══
 *
 * In `vercel.json` cronul asta e programat `11`, din TREI in TREI ore — adica OPT treceri pe
 * zi. Aproape toti ceilalti curieri sunt din doua in doua ore, adica DOUASPREZECE. Aici nu
 * se poate, si e scris de ei:
 *   „we allow up to **10 fetches per shipment per day**. We also expect these calls to be
 *   done in an **even way throughout the day**."
 *
 * ⚠ Cine „aliniaza" cronul asta cu restul, ca sa arate tabelul frumos, il duce la 12 treceri
 * pe zi — peste plafonul lor declarat, si cu cererile ingramadite, nu intinse. Raspunsul lor
 * la depasire e un 429 pe care specificatia nu-l documenteaza deloc (zero aparitii in cei
 * 1,2 MB de OpenAPI), deci nu s-ar citi ca „am depasit cota", ci ca o cadere oarecare.
 *
 * ═══ ⚠ AICI SE INTREABA 200 DE AWB-URI DEODATA ═══
 *
 * `GET /tracking` accepta pana la 200 de numere pe cerere („Supports up to 200 tracking
 * numbers", `maxItems: 200`). Fata de UPS (UN numar pe apel) si FedEx (30), asta face ca
 * numarul de apeluri sa nu mai fie constrangerea — vezi `MAX_COMENZI`, unde se explica ce
 * ramane scump.
 *
 * ⚠ Dar tot cere gruparea PE MAGAZIN: fiecare magazin are contul lui si credentialele lui,
 * iar un AWB al magazinului A cerut cu utilizatorul magazinului B nu se gaseste.
 *
 * ═══ ⚠⚠ `OK` E LIVRAREA. `WC` NU E ═══
 *
 * La UPS, `type: "D"` acoperea „incarcat in masina, iesit la livrare, SAU livrat", si citit
 * gresit trecea comanda pe „Livrata" cu coletul inca in masina. La DHL cele doua sunt
 * separate: `WC` = „With delivering courier" (iesit la livrare), `OK` = „Delivery", pe care
 * ghidul lor il numeste chiar „final disposition event (such as OK event)".
 *
 * ⚠ Si mai exista o clasa proprie: `PD` (livrare partiala) si `DD` (livrat avariat) SUNT
 * livrari si totusi NU inchid comanda. Vezi `eLivrat()` si ramurile din `semnaleaza()`.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la ceilalti: emailul de expediere pleaca DOAR din `updateOrder`, care
 * e legata de plafoanele de instiintare ale contului. Un cron n-are utilizator, deci ar
 * ocoli plafoanele.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * 45 de zile, ca la Shipo, Packeta, FedEx si UPS. Ce conteaza aici nu e regula lor de
 * pastrare, ci cat poate dura un RETUR international: un colet oprit in vama („Customs
 * clearance delay") si intors la expeditor depaseste usor 30 de zile, iar o fereastra mai
 * scurta l-ar pierde chiar in intervalul in care se decide daca marfa vine inapoi.
 */
const ZILE = 45;

/**
 * ⚠ 200 e plafonul LOR pe cerere, si depasirea lui NU e o eroare.
 *
 * DHL nu raspunde „prea multe numere": ia tacut primele 200 si ignora restul. De aceea
 * `urmareste()` imparte si el in transe, nu doar cronul — vezi comentariul de acolo.
 */
const PE_CERERE = MAX_AWB_PE_CERERE;

/**
 * ⚠ PLAFONUL NU VINE DE LA DHL, VINE DE LA FEREASTRA FUNCTIEI.
 *
 * La FedEx sunt 120 fiindca o cerere duce 30 de numere, deci patru apeluri pe magazin. Aici
 * o cerere duce 200, deci numarul de APELURI nu mai constrange nimic: orice magazin realist
 * se acopera cu unul singur.
 *
 * Ce ramane scump e ce se intampla DUPA raspuns. Fiecare comanda din felie primeste cel
 * putin un `update` in Supabase, iar cele care se misca mai primesc tranzitia si facturarea
 * automata. Toate seriale, toate in aceeasi fereastra de 60 de secunde.
 *
 * ⚠ Si termenul se verifica INTRE felii, nu inauntrul lor: o felie pornita merge pana la
 * capat. Cu 200 de comenzi intr-o singura felie, scrierile de dupa un apel lent ar putea
 * trece de `maxDuration`, iar Vercel taie functia INAINTE de marcaje — exact acele comenzi
 * ar iesi primele si la rularea urmatoare, unde s-ar repeta acelasi lucru, la nesfarsit.
 *
 * 150 lasa loc: un apel dus pana la plafonul de asteptare plus 150 de scrieri incap in buget
 * cu marja, si tot inseamna un singur apel pe magazin.
 */
const MAX_COMENZI = 150;

/**
 * ⚠ TREBUIE SA FIE ASTEPTAREA REALA A APELULUI, nu una dorita.
 *
 * Se importa chiar constanta clientului (`ASTEPTARE_MS`), ca sa nu se poata departa una de
 * alta: scrisa mai mica aici, bugetul ar iesi prea mare, ultima felie ar porni la timp si
 * tot ar depasi `maxDuration`, iar Vercel taie functia INAINTE de marcaj — deci expedierile
 * acelea ar ramane in capul cozii la fiecare rulare, la nesfarsit. (Defectul a fost prins la
 * Packeta.)
 */
const MARJA_MS = 5_000;
/*
 * ⚠ O SINGURA asteptare rezervata, spre deosebire de UPS.
 *
 * Acolo se rezervau doua plus inca cincisprezece secunde, fiindca `apel()` reincerca o data
 * pe 401 si reincercarea cerea intai un token nou. La DHL autentificarea e `Basic`, trimisa
 * preemptiv cu fiecare cerere: fara token, fara expirare, fara reincercare pe 401. Deci
 * formula e cea simpla, de la FedEx.
 */
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;

/** ⚠ Cate esecuri pe magazin inainte de alarma. Un AWB proaspat pe care ei inca nu-l cunosc
    e purtare normala; credentiale schimbate sunt altceva. */
const MIN_ESECURI_ALARMA = 3;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  dhl_awb_number: string | null;
  dhl_awb_at: string | null;
  dhl_status_code: string | null;
  dhl_status_checked_at: string | null;
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
    .select("id, business_id, status, order_number, payment_status, dhl_awb_number, dhl_awb_at, dhl_status_code, dhl_status_checked_at")
    .not("dhl_awb_number", "is", null)
    .neq("dhl_awb_number", "")
    /* ⚠ Comenzile incheiate isi pastreaza numarul AWB, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii: altfel o comanda veche
     * careia i se emite AWB-ul abia acum n-ar fi interogata niciodata. Si e scrisa cu DOI
     * termeni simpli — o sintaxa imbricata gresita nu da eroare, da LISTA GOALA, adica
     * urmarirea moare raportand vesel `ok: true`.
     */
    .or(`dhl_awb_at.gte.${since},dhl_awb_at.is.null`)
    .order("dhl_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT". */
  if (eOrders) {
    await logError({
      action: "dhl-tracking",
      message: `citirea comenzilor a esuat: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citirea comenzilor a esuat" }, { status: 500 });
  }

  const lista = (orders ?? []) as Comanda[];
  if (lista.length === 0) return NextResponse.json({ ok: true, verificate: 0 });

  const businessIds = [...new Set(lista.map((o) => o.business_id))];
  const [{ data: setari }, { data: afaceri }] = await Promise.all([
    admin.from("store_settings").select("business_id, dhl_config").in("business_id", businessIds),
    admin.from("businesses").select("id, user_id").in("id", businessIds),
  ]);
  const configuri = new Map<string, DhlConfig | null>(
    (setari ?? []).map((s) => [s.business_id as string, (s.dhl_config ?? null) as DhlConfig | null]),
  );
  const proprietari = new Map<string, string | null>(
    (afaceri ?? []).map((b) => [b.id as string, (b.user_id ?? null) as string | null]),
  );

  /*
   * ⚠ SE NUMARA `ramase`, NU `sarite` — si diferenta nu e de gust.
   *
   * La curierii unde fiecare expediere e un apel (UPS, Shipo, Packeta), termenul se verifica
   * si INAINTE de fiecare apel din felie, deci exista cu adevarat „expedieri sarite dintr-o
   * felie inceputa". Aici o cerere duce pana la 200 de numere: ori pleaca toata felia, ori
   * niciun numar din ea. Tot ce n-a apucat sa plece intra in `ramase`.
   *
   * Contorul `sarite` a existat o vreme la FedEx, mostenit din sablon, si raporta VESNIC
   * zero. Un numar care nu se schimba niciodata e mai rau decat lipsa lui: cine se uita in
   * raspunsul cronului crede ca a masurat ceva.
   */
  let verificate = 0, mutate = 0, semnalate = 0, esuate = 0;
  let ramase = 0, incheiate = 0, faraConfig = 0, faraRaspuns = 0;
  /* ⚠ Codurile pe care nu le cunoastem inca. Vezi la finalul functiei. */
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
   * lucru care face rotatia sa inainteze; sarit pe ramura de esec, o expediere care pica de
   * fiecare data ar ramane cu marcajul NULL, deci ar iesi PRIMA la fiecare rulare, la
   * nesfarsit — si o suta cincizeci de astfel de comenzi ar bloca urmarirea intregii
   * platforme, fara nicio eroare.
   *
   * ⚠ O SINGURA coloana de status, spre deosebire de UPS. Acolo era nevoie de doua (`type`
   * si `code`) fiindca tipul avea enumerare publicata si codul nu. La DHL vocabularul e unul
   * singur: cele 65 de valori din `trackingEventCode`.
   */
  const marcheazaVerificat = async (o: Comanda, codNou: string | null) => {
    const { error } = await admin
      .from("orders")
      .update({
        dhl_status_code: codNou ?? o.dhl_status_code,
        dhl_status_checked_at: new Date().toISOString(),
      })
      .eq("id", o.id)
      .eq("business_id", o.business_id);
    if (error) {
      await logError({
        action: "dhl-tracking",
        message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Expedierea ramane in capul cozii.`,
        details: { orderId: o.id, awb: o.dhl_awb_number },
        businessId: o.business_id,
        severity: "warning",
      });
    }
  };

  /*
   * Cine chiar merita intrebat, grupat pe magazin.
   *
   * ⚠ Expedierile incheiate NU se scot din interogare, se dau la RAND. Un retur sau o
   * expediere oprita nu misca statusul comenzii — decizia e a comerciantului — deci comanda
   * ramane „expediata" si se potriveste filtrului toate cele 45 de zile. Sarita fara sa i se
   * atinga marcajul, si-ar pastra locul in fata.
   *
   * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care poate fi `NULL`
   * da `NULL`, adica ar arunca afara chiar expedierile neverificate inca — exact cele pentru
   * care exista cronul.
   */
  const peMagazin = new Map<string, Comanda[]>();
  for (const o of lista) {
    if (eStareFinala(o.dhl_status_code)) {
      incheiate++;
      await marcheazaVerificat(o, null);
      continue;
    }
    if (!dhlGata(configuri.get(o.business_id))) {
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
      const awburi = felie.map((o) => o.dhl_awb_number!).filter(Boolean);

      let raspunsuri: UrmarireDhl[];
      try {
        raspunsuri = await urmareste(config, awburi);
      } catch (e) {
        /*
         * ⚠ Un apel picat inseamna ca TOATE expedierile din felie raman neverificate.
         * Fiecare isi primeste marcajul, altfel felia asta ar iesi prima si la rularea
         * urmatoare, si la urmatoarea.
         */
        esuate += felie.length;
        const g = galeata(bizId);
        g.esecuri += felie.length;
        g.exemplu ||= (e as Error).message;
        console.error("[dhl-tracking] felie picata:", (e as Error).message);
        for (const o of felie) await marcheazaVerificat(o, null);
        continue;
      }

      const dupaAwb = new Map(raspunsuri.map((r) => [r.awb, r]));

      for (const o of felie) {
        /*
         * ⚠ Se cauta pe valoarea TAIATA de spatii, fiindca exact aia a plecat la ei.
         *
         * `urmareste()` face `trim()` pe fiecare numar inainte de cerere, iar DHL intoarce in
         * `shipmentTrackingNumber` chiar ce a primit. Cautat cu valoarea bruta din coloana, un
         * singur spatiu ramas la import sau la lipire n-ar da nicio eroare: comanda ar cadea la
         * `faraRaspuns` la fiecare rulare si ar ramane „Expediata" pentru totdeauna.
         */
        const u = dupaAwb.get((o.dhl_awb_number ?? "").trim());

        /*
         * ⚠ Un AWB pentru care ei n-au intors NIMIC nu e nici succes, nici esec de retea.
         * `urmareste()` transforma 404-ul lor in lista goala tocmai ca sa se poata deosebi
         * cazul asta de o cadere. Cel mai des inseamna „prea nou": un colet abia manifestat
         * poate lipsi cateva ore din urmarire.
         *
         * ⚠⚠ DAR MAI INSEAMNA SI ALTCEVA, SI ACELA NU SE VEDE NICAIERI: un magazin lasat pe
         * mediul de TEST nu-si poate urmari NICIODATA coletele. Verbatim: „when testing the
         * Tracking service, only the waybill numbers below are loaded and any production
         * waybill numbers **or ones created via shipment will not be trackable**." Cererea
         * reuseste, raspunsul e gol, alarma de mai jos nu se ridica (n-a esuat nimic) — deci
         * comanda ramane „Expediata" pentru totdeauna, fara niciun semnal. Semnul din
         * raspunsul cronului e `faraRaspuns` mare cu `verificate` zero.
         */
        if (!u) {
          faraRaspuns++;
          await marcheazaVerificat(o, null);
          continue;
        }

        verificate++;
        galeata(bizId).reusite++;

        /*
         * ⚠ `cod` e `typeCode`-ul celui mai RECENT eveniment, ales de client dupa timp, nu
         * ultimul din tablou. DHL nu garanteaza ordinea lui `events[]`, iar la GLS si FedEx
         * lectia a fost aceeasi: ultimul element poate fi unul administrativ, iar o livrare
         * petrecuta intre timp n-ar mai fi vazuta niciodata.
         */
        const codNou = codStatus(u.cod);

        /* Se strang codurile noi, ca sa poata creste tabelul din trafic real. */
        if (eCombinatieNecunoscuta(codNou)) necunoscute.add(codNou ?? "-");

        /*
         * Un AWB inregistrat, dar fara stare inca: nu e defect.
         *
         * ⚠ DAR SE INTREABA SI `eLivrat`, nu doar `codNou`. Niciun camp al raspunsului lor de
         * urmarire nu e `required` — nici macar `typeCode`. Un raspuns cu data evenimentului
         * `OK` sau cu semnatar, dar fara cod citibil, ar fi intrat pe ramura asta si ar fi
         * sarit tranzitia; comanda ramanea „Expediata" pentru totdeauna, nefacturata automat,
         * si nimeni n-avea de unde afla de ce.
         */
        if (codNou === null && !eLivrat(codNou, u.livratLa, u.areDovadaLivrarii)) {
          await marcheazaVerificat(o, null);
          continue;
        }

        const tinta = statusUrmator(o.status, codNou, u.livratLa, u.areDovadaLivrarii);
        let prelucrat = true;
        if (tinta) {
          const rez = await tranzitieComandaMarketplace(admin, {
            orderId: o.id,
            businessId: o.business_id,
            status: tinta,
            sursa: "dhl",
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
                action: "dhl-tracking",
                message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
                details: { orderId: o.id, awb: o.dhl_awb_number },
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
         * Scris intai marcajul, o cadere a functiei intre cele doua ar lasa comanda cu codul
         * retinut si fara notificare — iar daca acel cod e final (`RT`, `SS`, `CS`, `CA`,
         * `DS`, `TP`), expedierea iese pe loc din urmarire si nicio rulare viitoare nu mai
         * repara nimic.
         *
         * ⚠ Comparatia se face pe valoarea NORMALIZATA a celei vechi: coloana poate purta
         * „ok" scris de mana, iar `codNou` e mereu majuscule. Fara normalizare, aceeasi stare
         * s-ar resemnala la fiecare rulare.
         *
         * ⚠ Se compara CODUL, si e de ajuns — spre deosebire de UPS, unde toate exceptiile
         * aveau acelasi tip `X` si a doua exceptie a aceleiasi expedieri s-ar fi pierdut. La
         * DHL fiecare situatie are codul ei: `NH`, `BA`, `CD`, `RT` sunt patru coduri
         * diferite, deci fiecare trecere noua se vede.
         */
        const vechi = codStatus(o.dhl_status_code);
        if (codNou !== null && codNou !== vechi && trebuieSemnalat(codNou)) {
          semnalate++;
          await semnaleaza(admin, {
            userId: proprietari.get(o.business_id) ?? null,
            businessId: o.business_id,
            orderId: o.id,
            orderNumber: o.order_number,
            awb: o.dhl_awb_number!,
            cod: codNou,
            descriere: descriereStatus(codNou, u.descriere),
          });
        }

        /*
         * ⚠ Codul se retine ABIA dupa ce tranzitia a reusit: scris inainte, un cod FINAL ar
         * fi ramas pe comanda chiar daca tranzitia a picat, iar `eStareFinala` ar fi scos
         * expedierea din urmarire pentru totdeauna.
         */
        await marcheazaVerificat(o, prelucrat ? codNou : null);
      }
    }
  }

  /*
   * ⚠ Alarma se ridica PE MAGAZIN. Pe intreaga platforma, un magazin cu credentialele
   * schimbate ar fi fost acoperit de altul sanatos, iar urmarirea lui ar fi murit in tacere.
   */
  for (const [bizId, g] of galeti) {
    if (g.esecuri >= MIN_ESECURI_ALARMA && g.reusite === 0) {
      await logError({
        action: "dhl-tracking",
        message: `urmarirea DHL a esuat pentru toate cele ${g.esecuri} expedieri verificate ale magazinului: ${g.exemplu}. Verifica utilizatorul si parola MyDHL API — cele primite de la consultantul DHL Express, nu „API Key" si „API Secret" din portalul pentru dezvoltatori — numarul de cont si mediul ales (test sau productie).`,
        details: { businessId: bizId, esecuri: g.esecuri },
        businessId: bizId,
        severity: "critical",
      });
    }
  }

  /*
   * ⚠ CODURILE NOI SE SCRIU IN JURNAL, si asta e singurul fel in care tabelul poate creste
   * corect.
   *
   * Enumerarea celor 65 de coduri e INCHISA CA DATE — publicata de ei in
   * `ExpressReferenceData`, foaia `trackingEventCode` — dar DESCHISA CA SI CONTRACT: in
   * OpenAPI campul e `typeCode: {type: string, example: PU}`, fara `enum`, iar DHL a adaugat
   * `PY` si `SM` pe 4 iunie 2024, apoi `SD`, `EM` si `MF`, fara preaviz. Deci un cod
   * necunoscut nu e o eroare si nu misca starea comenzii: se aduna aici si tabelul din
   * `statusuri.ts` se completeaza din trafic real.
   *
   * `info`, nu `warning`: nu e un defect, e material de lucru.
   */
  if (necunoscute.size > 0) {
    await logError({
      action: "dhl-tracking",
      message: `coduri de status DHL pe care nu le cunoastem inca: ${[...necunoscute].join(", ")}`,
      details: { coduri: [...necunoscute] },
      severity: "info",
    });
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, esuate, ramase, incheiate, faraConfig, faraRaspuns,
    necunoscute: [...necunoscute],
  });
}

/**
 * Expedieri incheiate FARA livrare, altele decat returul.
 *
 * ⚠ Nu e o „anulare" — DHL Express NU ARE anulare de expediere. `delete:` apare o singura
 * data in toata specificatia lor, pe `/pickups/{dispatchConfirmationNumber}`, adica pe
 * RIDICARE. Deci un AWB ajuns aici a fost oprit de ei sau de vama, iar comanda il poarta in
 * continuare si nimeni nu-l poate „sterge" la DHL.
 *
 * ⚠ `TP` („Transferred to third party") e in lista dinadins: coletul poate ajunge foarte
 * bine la client, dar DHL nu mai raporteaza NIMIC dupa el. E terminal din punctul de vedere
 * al vizibilitatii, nu al marfii — si tocmai de aceea cere om.
 */
const OPRITE_FARA_LIVRARE = new Set(["SS", "CS", "CA", "DS", "TP"]);

/**
 * Notificarea catre comerciant.
 *
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat: „PD" nu inseamna nimic pentru
 * cineva care n-a citit nomenclatorul DHL, iar o notificare pe care omul n-o intelege se
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
    cod: string;
    descriere: string;
  },
): Promise<void> {
  /* ⚠ Aici returul e REAL, spre deosebire de UPS, unde `esteRetur()` intoarce mereu `false`
     fiindca API-ul lor n-are niciun tip de retur. `RT` = „Returned to consignor", in chiar
     nomenclatorul DHL. */
  const retur = esteRetur(p.cod);
  const partiala = p.cod === "PD";
  const avariat = p.cod === "DD";
  const oprita = OPRITE_FARA_LIVRARE.has(p.cod);
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const spune = p.descriere || `status DHL ${p.cod}`;

  const titlu = retur
    ? "Colet DHL returnat"
    : partiala
      ? "Livrare DHL PARTIALA"
      : avariat
        ? "Colet DHL livrat avariat"
        : oprita
          ? "Expediere DHL incheiata fara livrare"
          : "Expediere DHL care cere atentie";

  const mesaj = retur
    /* ⚠ La DHL nu exista ramburs cu origine Romania, deci nu exista bani de incasat de la
       curier — spre deosebire de textul de la Shipo si SmartShip. Dar comanda poate fi
       platita online, si atunci restituirea ramane o hotarare a comerciantului. */
    ? `${comanda}: coletul ${p.awb} se intoarce la tine (${spune}). DHL nu vinde plata la livrare din Romania, deci n-ai bani de incasat de la curier; daca insa comanda a fost platita online, restituirea si anularea raman decizia ta.`
    : partiala
      /* ⚠ CEA MAI SCUMPA DINTRE ELE. `PD` e o LIVRARE, si tocmai de aceea e periculoasa:
         trecuta pe „Livrata", comanda s-ar inchide cu marfa nelivrata si s-ar factura
         integral. `eLivrat()` o refuza dinadins, deci aici trebuie spus limpede ce lipseste
         si ca nu s-a facturat nimic automat. */
      ? `${comanda}: DHL raporteaza LIVRARE PARTIALA pentru ${p.awb} — o parte din colete a ajuns la client, restul nu. Comanda NU a fost trecuta pe „Livrata" si NU s-a emis nicio factura automat. Verifica ce lipseste si deschide reclamatie la DHL inainte de a inchide comanda.`
      : avariat
        ? `${comanda}: coletul ${p.awb} a ajuns la client, dar DHL il raporteaza AVARIAT. Comanda NU a fost trecuta pe „Livrata" si NU s-a facturat automat, fiindca urmeaza fie un retur, fie o despagubire. Deschide reclamatie la DHL si intelege-te cu clientul asupra inlocuirii.`
        : oprita
          /* ⚠ Nu se spune „anuleaza AWB-ul", cum se spune la ceilalti: la DHL nu se poate.
             Singurul lucru care se poate anula e RIDICAREA, si numai daca a fost ceruta. */
          ? `${comanda}: expedierea ${p.awb} s-a incheiat la DHL fara livrare (${spune}), dar comanda o poarta in continuare. DHL nu are anulare de expediere, deci AWB-ul nu se mai poate folosi si nu se poate sterge la ei: dezleaga-l din pagina comenzii si emite unul nou, sau anuleaza comanda.`
          : `${comanda}: expedierea ${p.awb} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet inainte de a lua o hotarare.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "dhl",
      title: titlu,
      message: mesaj,
    });
    if (error) console.error("[dhl-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "dhl-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb, cod: p.cod },
    businessId: p.businessId,
    severity: retur || partiala || avariat || oprita ? "warning" : "info",
  });
}
