import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { istoricStatusuri, postaGata, statusEroare, type PostaConfig } from "@/lib/posta/client";
import {
  codNumeric,
  descriereStatus,
  eStareFinala,
  esteRetur,
  statusFinalDinStari,
  trebuieSemnalat,
  ultimaStare,
} from "@/lib/posta/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea trimiterilor Poșta Română.
 *
 * ═══ CE FACE ═══
 *
 * Intreaba Posta ce s-a intamplat cu fiecare trimitere si, dupa caz:
 *   1. muta comanda pe treapta la care a ajuns coletul, prin ACEEASI tranzactie
 *      ca panoul;
 *   2. il anunta pe comerciant cand se intampla ceva ce cere o decizie omeneasca
 *      (retur, pierdere, retinere de autoritati, anulare);
 *   3. tine minte ultimul cod prelucrat, ca sa nu spuna acelasi lucru de doua ori.
 *
 * ═══ ⚠ FEREASTRA E MAI LARGA DECAT LA CURIERI ═══
 *
 * 45 de zile, nu 21. Posta nu e curier: o trimitere avizata sta la oficiu pana o
 * ridica destinatarul, iar termenul de pastrare se masoara in saptamani. Cu
 * fereastra curierilor, exact trimiterile care se termina prost — cele care stau
 * si apoi se intorc — ar iesi din urmarire chiar inainte de deznodamant.
 *
 * ═══ ⚠ FIECARE TRIMITERE E UN APEL SEPARAT ═══
 *
 * `GET /awb/{cod}/trace` primeste un singur cod. Ca la GLS si Pall-Ex, si spre
 * deosebire de eColet, unde incap zeci intr-o cerere. De aia sunt patru paze:
 * plafon pe rulare, termen verificat intre felii, patru apeluri deodata, si o
 * asteptare proprie, mult mai scurta decat rularea.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la GLS: emailul de expediere pleaca DOAR din `updateOrder`,
 * care e legata de plafoanele de instiintare ale contului. Un cron n-are
 * utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/** Cat de departe in urma ne uitam. Vezi nota din antet: posta e mai lenta. */
const ZILE = 45;

/**
 * ⚠ Plafonul pe rulare NU e decorativ: sunt N apeluri HTTP catre Posta.
 *
 * Cu rotatia dupa `posta_status_checked_at` (cele neintrebate de cel mai mult
 * timp ies primele), plafonul nu lasa niciodata aceleasi comenzi pe dinafara.
 */
const MAX_COMENZI = 120;

/**
 * ⚠ Cat asteptam o singura trimitere.
 *
 * Aici nu e nicio primejdie in a renunta prea devreme: `trace` doar CITESTE, deci
 * o reincercare la tura urmatoare nu costa nimic si nu creeaza nicio trimitere.
 */
const ASTEPTARE_MS = 12_000;

/**
 * Termenul rularii.
 *
 * ⚠ Se calculeaza din `maxDuration`, nu scris de mana: altfel cele doua numere se
 * pot departa tacut la prima marire a limitei. Si trebuie sa incapa, IMPREUNA CU
 * UN APEL INTREG, in `maxDuration` — de aia se scad si asteptarea, si o marja.
 */
const MARJA_MS = 5_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;

/** Cate apeluri deodata. Secvential, 120 de trimiteri n-ar incapea in buget. */
const DEODATA = 4;

/**
 * ⚠ Cate esecuri de autentificare pe magazin inainte de alarma.
 *
 * Un AWB proaspat pe care Posta nu l-a inregistrat inca e purtare NORMALA, nu
 * defect. O parola schimbata e altceva. Se numara pe magazin si pe fel, ca un
 * magazin sanatos sa nu ascunda unul cazut — lectia din cronul GLS.
 */
const MIN_ESECURI_ALARMA = 3;

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

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, created_at, posta_awb_number, posta_awb_at, posta_status_code, posta_status_checked_at")
    .not("posta_awb_number", "is", null)
    .neq("posta_awb_number", "")
    /*
     * ⚠ Excluderea starilor incheiate NU e acoperita de filtrul pe AWB: o comanda
     * anulata isi pastreaza numarul, deci s-ar potrivi la nesfarsit.
     */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITEREA AWB-ului, nu pe data comenzii. Pe
     * `created_at`, o comanda veche careia comerciantul ii emite AWB abia acum ar
     * fi din start in afara ferestrei: n-ar fi interogata NICIODATA.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in
     * `or(...)`: sintaxa imbricata gresita NU da eroare, da LISTA GOALA — adica
     * urmarirea ar muri complet, raportand vesel `ok: true`.
     */
    .or(`posta_awb_at.gte.${since},posta_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("posta_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `orders` ar fi `null` si ramura urmatoare ar
   * raspunde `{ ok: true, verificate: 0 }` — o rulare sanatoasa la vedere, care
   * n-a urmarit nimic.
   */
  if (eOrders) {
    await logError({
      action: "posta-tracking",
      message: `comenzile cu AWB Posta nu s-au putut citi: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  /* Perechea conditiei de mai sus: trimiterile fara ancora raman in urmarire doar
     cat timp COMANDA e in fereastra. */
  const inFereastra = orders.filter(
    (o) => o.posta_awb_at !== null || (o.created_at ?? "") >= since,
  );
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  const [{ data: settingsRows, error: eCfg }, { data: firme, error: eFirme }] = await Promise.all([
    admin.from("store_settings").select("business_id, posta_config").in("business_id", bizIds),
    admin.from("businesses").select("id, user_id").in("id", bizIds),
  ]);

  /* Fara configuratii, TOATE trimiterile ar fi sarite — zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "posta-tracking",
      message: `configuratiile Posta nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  /* Proprietarii lipsa opresc doar clopotelul, nu si urmarirea. */
  if (eFirme) {
    await logError({
      action: "posta-tracking",
      message: `proprietarii magazinelor nu s-au putut citi, notificarile nu pleaca: ${eFirme.message}`,
      severity: "warning",
    });
  }

  const configuri = new Map(
    (settingsRows ?? []).map((r) => [r.business_id, r.posta_config as PostaConfig | null]),
  );
  const proprietari = new Map((firme ?? []).map((f) => [f.id, f.user_id]));

  const termen = Date.now() + BUGET_MS;
  let verificate = 0;
  let mutate = 0;
  let semnalate = 0;
  let esuate = 0;
  /* Comenzi ramase neatinse fiindca s-a terminat timpul — pastreaza marcajul vechi,
     deci ies primele la tura urmatoare. */
  let ramase = 0;
  let faraConfig = 0;
  let sarite = 0;
  let incheiate = 0;

  const galeti = new Map<string, { necunoscute: number; autentificare: number; reusite: number; exemplu: string }>();
  const galeata = (bizId: string) => {
    let g = galeti.get(bizId);
    if (!g) { g = { necunoscute: 0, autentificare: 0, reusite: 0, exemplu: "" }; galeti.set(bizId, g); }
    return g;
  };

  for (let i = 0; i < inFereastra.length; i += DEODATA) {
    if (Date.now() >= termen) {
      ramase = inFereastra.length - i;
      break;
    }

    await Promise.all(inFereastra.slice(i, i + DEODATA).map(async (o) => {
      /**
       * „Am ajuns la trimiterea asta."
       *
       * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE.
       *
       * Marcajul e singurul lucru care face rotatia sa inainteze. Sarit pe ramura
       * de esec, o trimitere care pica de fiecare data ar ramane cu
       * `posta_status_checked_at` NULL, deci ar iesi PRIMA la fiecare rulare, la
       * nesfarsit. O suta douazeci de astfel de comenzi blocheaza urmarirea
       * intregii platforme, fara sa dea vreo eroare.
       */
      const marcheazaVerificat = async (codNou: string | null) => {
        const { error } = await admin
          .from("orders")
          .update({
            posta_status_code: codNou ?? o.posta_status_code,
            posta_status_checked_at: new Date().toISOString(),
          })
          .eq("id", o.id)
          .eq("business_id", o.business_id);
        if (error) {
          /* In `error_logs`, nu doar in `console.error`: un cron nu-l citeste nimeni. */
          await logError({
            action: "posta-tracking",
            message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Trimiterea ramane in capul cozii si va fi reluata la fiecare rulare.`,
            details: { orderId: o.id, awb: o.posta_awb_number, code: error.code },
            businessId: o.business_id,
            severity: "warning",
          });
        }
      };

      /*
       * ⚠ Trimiterile incheiate NU se scot din interogare, se dau la RAND.
       *
       * Un retur (20) nu misca statusul comenzii — decizia e a comerciantului —
       * deci comanda ramane „expediata" si se potriveste filtrului toate cele 45
       * de zile. Sarita fara sa i se atinga marcajul, si-ar pastra pentru
       * totdeauna locul in fata cozii.
       *
       * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care
       * poate fi `NULL` da `NULL`, adica ar arunca afara chiar trimiterile
       * neverificate inca — exact cele pentru care exista cronul.
       */
      if (eStareFinala(o.posta_status_code)) {
        incheiate++;
        await marcheazaVerificat(null);
        return;
      }

      const config = configuri.get(o.business_id);
      if (!postaGata(config)) {
        /* Magazinul si-a oprit integrarea, dar comenzile vechi isi pastreaza AWB-ul. */
        faraConfig++;
        await marcheazaVerificat(null);
        return;
      }

      /*
       * ⚠ Termenul se verifica si AICI, nu doar la inceputul feliei: al patrulea
       * apel al unei felii poate porni dupa ce primele trei au consumat aproape
       * tot. Sarit acum, isi pastreaza marcajul vechi si iese primul la tura
       * urmatoare.
       */
      if (Date.now() >= termen) {
        sarite++;
        return;
      }

      let stari;
      try {
        stari = await istoricStatusuri(config, o.posta_awb_number!, ASTEPTARE_MS);
      } catch (e) {
        /*
         * ⚠ DOUA GALETI, pe magazin. Un AWB proaspat pe care Posta nu-l cunoaste
         * inca (404) e purtare normala; o cadere de autentificare (401/403) e un
         * defect care omoara urmarirea magazinului aceluia.
         */
        esuate++;
        const status = statusEroare(e);
        const g = galeata(o.business_id);
        if (status === 404) g.necunoscute++;
        else { g.autentificare++; g.exemplu ||= (e as Error).message; }
        console.error("[posta-tracking] trimiterea", o.posta_awb_number, (e as Error).message);
        await marcheazaVerificat(null);
        return;
      }

      verificate++;
      galeata(o.business_id).reusite++;

      /* Un AWB inregistrat, dar fara evenimente inca: nu e defect, doar nu s-a
         intamplat nimic. Se marcheaza si se trece mai departe. */
      if (stari.length === 0) {
        await marcheazaVerificat(null);
        return;
      }

      const ultima = ultimaStare(stari);
      const codNou = codNumeric(ultima?.idStatus) !== null ? String(codNumeric(ultima?.idStatus)) : null;

      /*
       * ⚠ Statusul se calculeaza din TOT istoricul, nu doar din ultima stare.
       *
       * Intre doua treceri ale cronului pot intra mai multe evenimente, iar
       * ultimul poate fi unul administrativ („Schimbare cod", „Reambalat"). Citind
       * doar pe el, livrarea petrecuta intre timp n-ar mai fi vazuta niciodata —
       * iar la o comanda cu plata la livrare asta inseamna bani neinregistrati.
       * Lectia e a GLS-ului.
       */
      const tinta = statusFinalDinStari(o.status, stari);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id,
          businessId: o.business_id,
          status: tinta,
          sursa: "posta",
        });
        if (rez === "ok") {
          mutate++;
          /*
           * ⚠ SE ASTEAPTA, nu `void`. Intr-o functie serverless nu exista „mai
           * tarziu": Vercel opreste executia cand se intoarce raspunsul. Si nu
           * exista a doua trecere — comanda e deja pe `delivered`, deci rularea
           * urmatoare n-o mai factureaza niciodata.
           *
           * Esecul lui NU are voie sa taie tura: comanda a fost mutata corect, iar
           * factura se poate emite din panou.
           */
          try {
            await maybeAutoInvoice(
              o.business_id, o.id, tinta, o.payment_status ?? "", admin as never,
            );
          } catch (e) {
            await logError({
              action: "posta-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id, awb: o.posta_awb_number },
              businessId: o.business_id,
              severity: "warning",
            });
          }
        }
        /*
         * „reincearca" inseamna ca nu STIM daca s-a scris (lock, timeout): n-avem
         * voie sa retinem codul. „definitiv" inseamna un raspuns limpede, unde
         * reincercarea n-are ce schimba.
         */
        prelucrat = rez !== "reincearca";
      }

      /*
       * ═══ ⚠ SE SEMNALEAZA DOAR SCHIMBAREA ═══
       *
       * Memoria e un singur cod, nu o lista de evenimente ca la GLS. Deci regula e
       * simpla: se striga numai daca ULTIMUL cod cere atentie SI e altul decat cel
       * retinut. Asa aceeasi avizare nu se repeta la fiecare doua ore.
       *
       * ⚠ Ce se pierde, si de ce e acceptabil: daca intre doua treceri intra DOUA
       * evenimente care cer atentie, se striga numai al doilea. La o fereastra de
       * doua ore si la ritmul postei, cazul e rar — iar comanda ramane oricum
       * deschisa in panou, cu tot istoricul cerut live.
       *
       * ⚠ SEMNALAREA SE FACE INAINTE DE MARCAJ. Scris intai marcajul, o cadere a
       * functiei intre cele doua (Vercel taie la `maxDuration`) ar lasa comanda cu
       * codul retinut si fara nicio notificare — iar daca acel cod e final,
       * trimiterea iese pe loc din urmarire si nicio rulare viitoare nu mai repara
       * nimic. Returul ar disparea definitiv.
       */
      const schimbat = codNou !== null && codNou !== (o.posta_status_code ?? null);
      if (schimbat && trebuieSemnalat(codNou)) {
        semnalate++;
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          awb: o.posta_awb_number!,
          cod: codNou,
          descriere: descriereStatus(codNou, ultima?.statusWeb ?? ultima?.status ?? null),
        });
      }

      /*
       * ⚠ CODUL SE RETINE ABIA DUPA CE TRANZITIA A REUSIT.
       *
       * Scris inainte, un cod FINAL (4 = distribuit, 20 = returnat) ar fi ramas pe
       * comanda chiar daca tranzitia a picat — iar `eStareFinala` scoate pe loc
       * trimiterea din urmarire, deci comanda ar fi ramas „expediata" PENTRU
       * TOTDEAUNA, fara ca nimic sa semnaleze.
       */
      await marcheazaVerificat(prelucrat ? codNou : null);
    }));
  }

  /*
   * ⚠ Alarma se ridica PE MAGAZIN, si numai pentru esecuri de autentificare.
   *
   * Pe intreaga platforma, un magazin cu parola schimbata ar fi fost acoperit de
   * altul sanatos: `verificate` iesea mai mare ca zero si urmarirea primului murea
   * in tacere. Iar un magazin cu cateva AWB-uri proaspete, pe care Posta nu le are
   * inca indexate, ar fi produs o alarma CRITICA falsa.
   */
  for (const [bizId, g] of galeti) {
    if (g.autentificare >= MIN_ESECURI_ALARMA && g.reusite === 0) {
      await logError({
        action: "posta-tracking",
        message: `urmarirea Posta a esuat pentru toate cele ${g.autentificare} trimiteri verificate ale magazinului: ${g.exemplu}. Verifica utilizatorul si parola din configurare.`,
        details: { businessId: bizId, esecuri: g.autentificare },
        businessId: bizId,
        severity: "critical",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    verificate, mutate, semnalate, esuate, ramase, sarite, incheiate, faraConfig,
  });
}

/**
 * Notificarea catre comerciant.
 *
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat. „Cod 20" nu inseamna
 * nimic pentru cineva care n-a citit Anexa 2, iar o notificare pe care omul n-o
 * intelege se inchide fara sa faca nimic.
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
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = retur ? "Trimitere Posta returnata" : "Trimitere Posta care cere atentie";
  const spune = p.descriere || `status Posta ${p.cod}`;
  const mesaj = retur
    ? `${comanda}: trimiterea ${p.awb} se intoarce la tine (${spune}). Marfa vine inapoi, iar rambursul NU s-a incasat — anularea comenzii si returul banilor raman decizia ta.`
    : `${comanda}: trimiterea ${p.awb} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet.`;

  /* Fara proprietar nu exista cui trimite; ramane doar urma din loguri. */
  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "posta",
      title: titlu,
      message: mesaj,
    });
    if (error) {
      console.error("[posta-tracking] notificarea nu s-a scris:", error.message);
    }
  }

  await logError({
    action: "posta-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb, cod: p.cod },
    businessId: p.businessId,
    severity: retur ? "warning" : "info",
  });
}
