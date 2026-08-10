import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { citestePartida, pallexGata, tipuriDeStatus, type PallExConfig } from "@/lib/pallex/client";
import {
  citesteMemoria,
  clasificaStatus,
  eStareFinala,
  esteRetur,
  scrieMemoria,
  statusUrmator,
  trebuieSemnalat,
} from "@/lib/pallex/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea partidelor Pall-Ex.
 *
 * ═══ CE FACE ═══
 *
 * Intreaba ClientPlus ce s-a intamplat cu fiecare partida si, dupa caz:
 *   1. muta comanda pe treapta la care a ajuns marfa (`processing` → `shipped`
 *      → `delivered`), prin ACEEASI tranzactie ca panoul;
 *   2. il anunta pe comerciant cand se intampla ceva ce cere o decizie omeneasca
 *      (retur, refuz, marfa avariata);
 *   3. ⚠ il anunta si cand NU se intampla nimic — vezi mai jos;
 *   4. completeaza codul Pall-Ex pe comanda, daca la creare inca nu exista;
 *   5. tine minte ce a vazut, ca sa nu spuna acelasi lucru de doua ori.
 *
 * ═══ ⚠ PASUL 3: TACEREA E CHIAR DEFECTUL ═══
 *
 * La ceilalti sase curieri, „am emis AWB" inseamna „coletul pleaca". La Pall-Ex nu:
 * partida intra intr-un borderou care trebuie VALIDAT, si pana atunci marfa sta in
 * depozitul comerciantului. Daca el uita sa apese, nu se intampla absolut nimic —
 * nicio eroare, niciun status, doar o comanda care nu ajunge niciodata.
 *
 * De aia cronul se uita si la partidele care stau pe loc de peste o zi si strica
 * tacerea. Avertismentul se da O SINGURA DATA per status (vezi `citesteMemoria`):
 * unul care s-ar repeta din doua in doua ore n-ar mai fi citit nici cand e adevarat.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Emailul de expediere pleaca DOAR din `updateOrder`, actiunea din panou, si e
 * legat de plafoanele de instiintare ale contului, care se sprijina pe `user.id`.
 * Un cron nu are utilizator, deci ar ocoli plafoanele si ar putea trimite, la o
 * singura rulare, sute de emailuri pe care comerciantul nu le-a cerut.
 *
 * ═══ ⚠ INTELESUL STATUSURILOR NU E PUBLICAT ═══
 *
 * `status_type_id` e un numar fara inteles fix; numele vine din
 * `/consignment_status_types`, cerut o data pe magazin si pe rulare. Fara lista,
 * nu se muta nimic — dar marcajul se scrie oricum, altfel rotatia se opreste.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * O partida care n-a ajuns nicaieri in trei saptamani nu se mai rezolva de la
 * sine, iar comanda a fost deja semnalata. Fereastra tine interogarea mica si
 * indexul folositor.
 */
const ZILE = 21;

/**
 * ⚠ Plafonul pe rulare NU e decorativ: sunt N apeluri HTTP catre Pall-Ex.
 *
 * Cu rotatia dupa `pallex_status_checked_at` (cele neintrebate de cel mai mult
 * timp ies primele), plafonul nu lasa niciodata aceleasi comenzi pe dinafara — se
 * ajunge la ele la tura urmatoare.
 */
const MAX_COMENZI = 120;

/** Termenul rularii, sub cele 60 de secunde ale functiei. */
const BUGET_MS = 50_000;

/** Cate apeluri deodata. Secvential, 120 de partide n-ar incapea in buget. */
const DEODATA = 4;

/**
 * ⚠ Cat asteptam o singura partida.
 *
 * Implicitul clientului e 45 de secunde — aproape cat toata rularea. Pe el, o
 * partida care atarna consuma tura intreaga, iar paza de termen n-apuca sa
 * intervina niciodata; si cum ea ramane prima in coada, ar taia fiecare rulare, la
 * nesfarsit. Aici nu e nicio primejdie in a renunta devreme: `GET` doar CITESTE,
 * deci reincercarea la tura urmatoare nu costa nimic si nu creeaza nicio partida.
 */
const ASTEPTARE_PARTIDA_MS = 12_000;

/**
 * Dupa cat timp fara miscare intrebam „ai validat borderoul?".
 *
 * O zi: destul cat sa nu sune pentru o partida creata seara si validata a doua zi
 * dimineata, si destul de repede cat marfa sa nu stea o saptamana in depozit.
 */
const PRAG_NEPLECAT_MS = 24 * 3600 * 1000;

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
    .select("id, business_id, status, order_number, payment_status, created_at, pallex_awb_number, pallex_consignment_id, pallex_awb_at, pallex_status_id, pallex_status_checked_at")
    /*
     * ⚠ Se filtreaza pe ID-ul ClientPlus, nu pe numarul de partida: acela e
     * singurul pe care il primeste `GET /consignments/{id}`. Predicatul indexului
     * partial e scris pe aceeasi coloana, ca planificatorul sa-l poata folosi.
     */
    .not("pallex_consignment_id", "is", null)
    /*
     * ⚠ Excluderea starilor incheiate NU e acoperita de filtrul de mai sus. O
     * comanda anulata isi pastreaza ID-ul partidei, deci s-ar potrivi la
     * nesfarsit — si am fi intrebat Pall-Ex despre ea la fiecare rulare.
     */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe CREAREA partidei, nu pe data comenzii. Pe
     * `created_at`, o comanda veche careia comerciantul ii face partida abia acum
     * ar fi din start in afara ferestrei: n-ar fi interogata NICIODATA.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in
     * `or(...)`. Sintaxa imbricata nu se poate proba fara o baza la indemana, iar
     * o greseala acolo NU da eroare: da LISTA GOALA. Adica urmarirea ar muri
     * complet, raportand vesel `ok: true`.
     */
    .or(`pallex_awb_at.gte.${since},pallex_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("pallex_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `orders` ar fi `null` si ramura urmatoare ar
   * raspunde `{ ok: true, verificate: 0 }` — o rulare perfect sanatoasa la
   * vedere, care n-a urmarit nimic.
   */
  if (eOrders) {
    await logError({
      action: "pallex-tracking",
      message: `comenzile cu partida Pall-Ex nu s-au putut citi: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  /*
   * Cernerea perechea celei din interogare: partidele fara `pallex_awb_at`
   * (dinainte de coloana) raman in urmarire doar cat timp COMANDA e in fereastra.
   */
  const inFereastra = orders.filter(
    (o) => o.pallex_awb_at !== null || (o.created_at ?? "") >= since,
  );
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  const [{ data: settingsRows, error: eCfg }, { data: firme, error: eFirme }] = await Promise.all([
    admin.from("store_settings").select("business_id, pallex_config").in("business_id", bizIds),
    admin.from("businesses").select("id, user_id").in("id", bizIds),
  ]);

  /* Fara configuratii, TOATE partidele ar fi sarite — zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "pallex-tracking",
      message: `configuratiile Pall-Ex nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  /* Proprietarii lipsa opresc doar clopotelul, nu si urmarirea. */
  if (eFirme) {
    await logError({
      action: "pallex-tracking",
      message: `proprietarii magazinelor nu s-au putut citi, notificarile nu pleaca: ${eFirme.message}`,
      severity: "warning",
    });
  }

  const configuri = new Map(
    (settingsRows ?? []).map((r) => [r.business_id, r.pallex_config as PallExConfig | null]),
  );
  const proprietari = new Map((firme ?? []).map((f) => [f.id, f.user_id]));

  /**
   * Numele statusurilor, pe magazin.
   *
   * ⚠ Se cere O SINGURA DATA pe magazin si pe rulare, nu la fiecare partida: e
   * acelasi raspuns pentru toate comenzile aceluiasi contract, si 120 de cereri
   * identice ar consuma degeaba jumatate din buget.
   *
   * ⚠ Un magazin al carui apel pica primeste `null`, si asta NU se confunda cu
   * „lista goala": pe `null` nu se muta nicio comanda (nu stim ce inseamna
   * numerele), dar marcajul se scrie oricum, ca rotatia sa inainteze.
   */
  const numeStatusuri = new Map<string, Map<number, string> | null>();
  /*
   * ⚠ Se tine minte PROMISIUNEA, nu doar rezultatul.
   *
   * Partidele se prelucreaza cate patru deodata, si toate patru pot fi ale
   * aceluiasi magazin. Cu memoria pusa abia dupa `await`, toate patru ar gasi
   * harta lipsa in acelasi moment si ar cere lista de patru ori — patru cereri
   * identice, la fiecare felie, pe un buget de cincizeci de secunde.
   */
  const inZbor = new Map<string, Promise<Map<number, string> | null>>();
  function numeleStatusurilor(businessId: string, config: PallExConfig): Promise<Map<number, string> | null> {
    const gata = numeStatusuri.get(businessId);
    if (gata !== undefined) return Promise.resolve(gata);

    const pornita = inZbor.get(businessId);
    if (pornita) return pornita;

    const cerere = tipuriDeStatus(config, ASTEPTARE_PARTIDA_MS)
      .then((lista) => {
        const harta = new Map(lista.map((t) => [t.id, t.name]));
        numeStatusuri.set(businessId, harta);
        return harta;
      })
      .catch((e: Error) => {
        console.error("[pallex-tracking] statusurile magazinului", businessId, e.message);
        /* `null` NU se confunda cu „lista goala": pe el nu se muta nicio comanda,
           dar marcajul se scrie oricum, ca rotatia sa inainteze. */
        numeStatusuri.set(businessId, null);
        return null;
      })
      .finally(() => { inZbor.delete(businessId); });

    inZbor.set(businessId, cerere);
    return cerere;
  }

  const termen = Date.now() + BUGET_MS;
  let verificate = 0;
  let mutate = 0;
  let semnalate = 0;
  let esuate = 0;
  /* Comenzi ramase neatinse fiindca s-a terminat timpul — ele pastreaza marcajul
     vechi, deci ies primele la tura urmatoare. */
  let ramase = 0;
  /* Comenzi cu partida Pall-Ex dintr-un magazin care intre timp a oprit integrarea. */
  let faraConfig = 0;
  /* Partide al caror drum s-a incheiat: nu se mai intreaba, doar se dau la rand. */
  let incheiate = 0;
  /* Partide create dar neplecate, pentru care s-a dat avertismentul. */
  let neplecate = 0;

  for (let i = 0; i < inFereastra.length; i += DEODATA) {
    if (Date.now() >= termen) {
      ramase = inFereastra.length - i;
      break;
    }

    await Promise.all(inFereastra.slice(i, i + DEODATA).map(async (o) => {
      const memorie = citesteMemoria(o.pallex_status_id);

      /**
       * „Am ajuns la partida asta."
       *
       * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE.
       *
       * Marcajul e singurul lucru care face rotatia sa inainteze. Sarit pe ramura
       * de esec, o partida care pica de fiecare data — un ID gresit, un magazin
       * care si-a oprit Pall-Ex-ul, un numar pe care ClientPlus nu-l cunoaste — ar
       * ramane cu `pallex_status_checked_at` NULL, deci ar iesi PRIMA la fiecare
       * rulare, la nesfarsit. Cu 120 de comenzi pe tura, o suta douazeci de astfel
       * de partide blocheaza urmarirea intregii platforme, fara sa dea vreo
       * eroare: cronul raporteaza vesel ca a lucrat.
       *
       * ⚠ `pallex_awb_number` se scrie doar cand chiar avem un cod NOU: la creare
       * comanda poate purta ID-ul ClientPlus, fiindca `pallex_id` nu vine in
       * raspunsul crearii.
       */
      const marcheazaVerificat = async (
        memorieNoua: string | null | undefined,
        awbNou?: string | null,
      ) => {
        /* Tipul e cel generat, nu `Record<string, unknown>`: asa o coloana scrisa
           gresit cade la compilare, nu la rulare, in mijlocul unui cron. */
        const modificari: Database["public"]["Tables"]["orders"]["Update"] = {
          pallex_status_id: memorieNoua === undefined ? o.pallex_status_id : memorieNoua,
          pallex_status_checked_at: new Date().toISOString(),
        };
        if (awbNou) modificari.pallex_awb_number = awbNou;

        const { error } = await admin
          .from("orders")
          .update(modificari)
          .eq("id", o.id)
          /* ⚠ Nu e un filtru de prisos, e AUTORIZARE. */
          .eq("business_id", o.business_id);
        if (error) {
          console.error("[pallex-tracking] marcajul nu s-a scris pentru", o.id, error.message);
        }
      };

      const config = configuri.get(o.business_id);
      if (!pallexGata(config)) {
        /* Magazinul si-a oprit Pall-Ex-ul, dar comenzile vechi isi pastreaza partida. */
        faraConfig++;
        await marcheazaVerificat(undefined);
        return;
      }

      const numeCunoscut = numeStatusuri.get(o.business_id)?.get(Number(memorie.id));

      /*
       * ⚠ Partidele incheiate NU se scot din interogare, se dau la RAND.
       *
       * Un retur nu misca statusul comenzii — decizia e a comerciantului — deci
       * comanda ramane „expediata" si se potriveste filtrului toate cele 21 de
       * zile. Sarita fara sa i se atinga marcajul, si-ar pastra pentru totdeauna
       * locul in fata cozii si ar ocupa un loc din cele 120 la FIECARE rulare.
       *
       * ⚠ Verificarea are nevoie de numele statusului, care vine din harta
       * magazinului. La prima partida a magazinului harta inca nu e ceruta, deci
       * `numeCunoscut` e nedefinit si partida se interogheaza — ceea ce e in
       * regula: raspunsul o duce oricum la aceeasi concluzie, doar cu un apel in
       * plus, o singura data.
       */
      if (numeCunoscut && eStareFinala(numeCunoscut)) {
        incheiate++;
        await marcheazaVerificat(undefined);
        return;
      }

      const harta = await numeleStatusurilor(o.business_id, config);

      let partida: Awaited<ReturnType<typeof citestePartida>>;
      try {
        partida = await citestePartida(config, Number(o.pallex_consignment_id), ASTEPTARE_PARTIDA_MS);
      } catch (e) {
        /*
         * ⚠ O partida abia creata, pe care ClientPlus n-a inregistrat-o inca, e
         * cazul obisnuit, nu un defect. Prins per partida, ca o singura exceptie
         * sa nu omoare toata tura.
         */
        esuate++;
        console.error("[pallex-tracking] partida", o.pallex_consignment_id, (e as Error).message);
        await marcheazaVerificat(undefined);
        return;
      }

      verificate++;

      /*
       * ⚠ Codul Pall-Ex se completeaza ACUM, daca lipsea.
       *
       * `POST /consignments` intoarce doar `id` si `bordereau_id`, deci comanda
       * poate purta ID-ul ClientPlus ca text. Cand `pallex_id` apare, il punem in
       * locul lui: e codul pe care il vede si il cauta clientul.
       */
      const codPallEx = partida?.pallex_id?.trim() || null;
      const awbNou = codPallEx && codPallEx !== o.pallex_awb_number ? codPallEx : null;

      const idStatus = Number.isInteger(partida?.status_type_id) ? String(partida!.status_type_id) : null;
      const nume = harta && partida?.status_type_id != null
        ? harta.get(partida.status_type_id) ?? null
        : null;

      /* ── Miscarea comenzii ─────────────────────────────────────────────── */

      const tinta = statusUrmator(o.status, nume);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id,
          businessId: o.business_id,
          status: tinta,
          sursa: "pallex",
        });
        if (rez === "ok") {
          mutate++;
          /*
           * ⚠ Facturarea automata se cheama de AICI, ca din panou si ca din lot.
           * Dispecerul e singurul loc care stie regulile magazinului; comanda
           * mutata pe `delivered` fara el ar sari peste factura, iar comerciantul
           * ar descoperi lipsa la inchiderea lunii. E idempotent, deci o a doua
           * trecere nu emite a doua factura.
           */
          void maybeAutoInvoice(
            o.business_id, o.id, tinta, o.payment_status ?? "", admin as never,
          );
        }
        /*
         * ⚠ „reincearca" inseamna ca nu STIM daca s-a scris (lock, timeout): nu
         * avem voie sa retinem statusul. „definitiv" inseamna un raspuns limpede
         * (comanda a disparut, alt magazin) — acolo reincercarea n-are ce
         * schimba, deci statusul se poate retine.
         */
        prelucrat = rez !== "reincearca";
      }

      /* ── Ce trebuie spus comerciantului ────────────────────────────────── */

      const seSchimba = idStatus !== null && idStatus !== memorie.id;
      let avertizat = memorie.avertizat;

      /*
       * ⚠ AVERTISMENTUL PENTRU MARFA CARE N-A PLECAT.
       *
       * E singurul lucru pe care il face cronul asta si nu-l face niciunul dintre
       * ceilalti: la Pall-Ex, o partida creata si nevalidata NU produce niciun
       * eveniment. Fara randurile de mai jos, comerciantul afla de la client, dupa
       * o saptamana, ca marfa e tot in depozitul lui.
       *
       * Se da o singura data per status (semnul din memorie), si numai dupa ce a
       * trecut pragul — o partida creata seara si validata dimineata nu deranjeaza
       * pe nimeni.
       */
      const deCand = o.pallex_awb_at ? Date.parse(o.pallex_awb_at) : NaN;
      /*
       * ⚠ „Nu stim ce inseamna statusul" NU e acelasi lucru cu „marfa n-a plecat".
       *
       * Prima forma scria `|| nume === null`, iar `nume` e null si cand lista de
       * statusuri a magazinului nu s-a putut citi — un singur apel picat, si toate
       * partidele lui, inclusiv cele aflate in mijlocul tarii, primeau
       * „valideaza borderoul". Un avertisment fals despre marfa care de fapt
       * merge e mai rau decat niciunul: comerciantul se duce sa valideze un
       * borderou deja validat si, a doua oara, nu mai crede avertismentul.
       *
       * Se avertizeaza deci doar cand CHIAR stim ca statusul inseamna „la
       * comerciant", sau cand partida n-are inca niciun status — cazul obisnuit
       * al unui borderou nevalidat.
       */
      const staPeLoc = nume !== null
        ? clasificaStatus(nume) === "la_comerciant"
        : partida?.status_type_id == null;
      const avertizatAcum =
        !avertizat
        && staPeLoc
        && !Number.isNaN(deCand)
        && Date.now() - deCand > PRAG_NEPLECAT_MS;
      if (avertizatAcum) {
        neplecate++;
        avertizat = true;
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          awb: o.pallex_awb_number ?? String(o.pallex_consignment_id),
          titlu: "Marfa Pall-Ex nu a plecat inca",
          mesaj:
            `${o.order_number ? `Comanda ${o.order_number}` : "O comanda"}: partida `
            + `${o.pallex_awb_number ?? o.pallex_consignment_id} a fost creata acum peste o zi si `
            + `inca nu e in reteaua Pall-Ex${nume ? ` (status: ${nume})` : ""}. `
            + "Cel mai des inseamna ca borderoul nu a fost validat — deschide comanda si valideaza-l, "
            + "altfel marfa ramane in depozitul tau.",
          severity: "warning",
        });
        semnalate++;
      }

      /*
       * ⚠ Evenimentele care cer o decizie se semnaleaza DOAR la schimbare de
       * status. Memoria e cea care face dedupe-ul: un retur ramane retur, iar
       * fara ea cronul ar striga „partida returnata" la fiecare doua ore.
       */
      if (seSchimba && trebuieSemnalat(nume)) {
        semnalate++;
        const retur = esteRetur(nume);
        const comanda = o.order_number ? `Comanda ${o.order_number}` : "O comanda";
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          awb: o.pallex_awb_number ?? String(o.pallex_consignment_id),
          titlu: retur ? "Partida Pall-Ex returnata" : "Partida Pall-Ex care cere atentie",
          mesaj: retur
            ? `${comanda}: partida ${o.pallex_awb_number} se intoarce la tine (${nume}). Marfa vine inapoi; anularea comenzii si returul banilor raman decizia ta.`
            : `${comanda}: partida ${o.pallex_awb_number} are un eveniment care cere o decizie: ${nume}.`,
          severity: retur ? "warning" : "info",
        });
      }

      /*
       * ⚠ STATUSUL SE RETINE ABIA DUPA CE TRANZITIA A REUSIT. Ordinea, nu detaliul.
       *
       * Scris inainte, un status TERMINAL ar fi ramas pe comanda chiar daca
       * tranzitia a picat. Iar `eStareFinala` scoate pe loc partida din urmarire —
       * deci comanda ar fi ramas „expediata" PENTRU TOTDEAUNA, cu livrarea stiuta
       * de noi si nescrisa nicaieri.
       *
       * ⚠ SI NU SE RETINE CAND NUMELE N-A PUTUT FI AFLAT.
       *
       * Memoria e ce face dedupe-ul semnalarilor. Avansata pe un status pe care
       * nu l-am inteles (harta magazinului picata), la rularea urmatoare — cand
       * numele chiar se stie — `seSchimba` iese fals si evenimentul nu se mai
       * semnaleaza NICIODATA: un retur inghitit in tacere. Iar daca statusul acela
       * era terminal, `eStareFinala` l-ar scoate din urmarire la tura urmatoare si
       * comanda ar ramane „expediata" pentru totdeauna, fara factura.
       *
       * Rotatia nu are de suferit: `pallex_status_checked_at` se scrie oricum.
       *
       * ⚠ Cand statusul se schimba, semnul de avertisment CADE — situatia s-a
       * miscat, deci daca partida se opreste din nou meritam sa aflam din nou.
       * Exceptie: avertismentul dat CHIAR ACUM, pentru statusul NOU. Fara
       * `avertizatAcum`, semnul se pierdea si aceeasi notificare pleca a doua oara
       * la rularea urmatoare.
       */
      const memorieNoua = prelucrat && idStatus !== null && nume !== null
        ? scrieMemoria(idStatus, seSchimba && !avertizatAcum ? false : avertizat)
        : scrieMemoria(memorie.id, avertizat);

      await marcheazaVerificat(memorieNoua, awbNou);
    }));
  }

  /*
   * ⚠ URMARIREA NU ARE VOIE SA MOARA IN TACERE.
   *
   * Cazul: comerciantul isi schimba parola ClientPlus. Fiecare apel se intoarce cu
   * 401, deci FIECARE partida cade pe ramura de esec — dar aceea scrie doar in
   * `console.error`, iar cronul raspunde `ok: true`. Urmarirea s-ar opri complet si
   * nimeni n-ar afla luni de zile.
   *
   * Zero reusite si macar un esec inseamna un defect de configurare, nu o partida
   * necunoscuta de Pall-Ex.
   */
  if (verificate === 0 && esuate > 0) {
    await logError({
      action: "pallex-tracking",
      message: `Urmarirea Pall-Ex a esuat pe TOATE cele ${esuate} partide incercate. Cel mai probabil datele de acces ClientPlus nu mai sunt valide.`,
      details: { esuate, incheiate, faraConfig },
      severity: "critical",
    });
  }

  console.log(
    `[pallex-tracking] verificate ${verificate}, mutate ${mutate}, semnalate ${semnalate}, neplecate ${neplecate}, esuate ${esuate}, incheiate ${incheiate}, faraConfig ${faraConfig}, ramase ${ramase}`,
  );
  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, neplecate, esuate, incheiate, faraConfig, ramase,
  });
}

/**
 * Il anunta pe comerciant.
 *
 * ⚠ In `notifications`, nu doar in `error_logs`. Acesta din urma se vede in
 * `/admin/logs`, adica la adminul PLATFORMEI — comerciantul nu-l deschide
 * niciodata. Un retur despre care afla doar platforma e ca si cum n-am fi aflat.
 *
 * Cheia tabelei e `user_id` (proprietarul), nu `business_id`.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null;
    businessId: string;
    orderId: string;
    orderNumber: string | null;
    awb: string;
    titlu: string;
    mesaj: string;
    severity: "warning" | "info";
  },
): Promise<void> {
  /* Fara proprietar nu exista cui trimite; ramane doar urma din loguri. */
  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "pallex",
      title: p.titlu,
      message: p.mesaj,
    });
    if (error) {
      console.error("[pallex-tracking] notificarea nu s-a scris:", error.message);
    }
  }

  await logError({
    action: "pallex-tracking",
    message: `${p.titlu}: ${p.mesaj}`,
    details: { orderId: p.orderId, awb: p.awb },
    businessId: p.businessId,
    severity: p.severity,
  });
}
