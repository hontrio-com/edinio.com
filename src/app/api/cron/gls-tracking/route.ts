import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { stariColet, CODURI_COLET_NEGASIT as CODURI_COLET_NECUNOSCUT, type GlsConfig } from "@/lib/gls/client";
import { dataDinNet } from "@/lib/gls/data-net";
import {
  eStareFinala,
  esteRetur,
  statusFinalDinStari,
  trebuieSemnalat,
  ultimaStare,
  type StareCitita,
} from "@/lib/gls/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor GLS.
 *
 * ═══ CE FACE ═══
 *
 * Intreaba MyGLS ce s-a intamplat cu fiecare colet expediat si, dupa caz:
 *   1. muta comanda pe treapta la care a ajuns coletul (`processing` → `shipped`
 *      → `delivered`), prin ACEEASI tranzactie ca panoul;
 *   2. il anunta pe comerciant cand se intampla ceva ce cere o decizie omeneasca
 *      (retur, refuz, adresa gresita, colet distrus);
 *   3. tine minte ce a vazut, ca sa nu spuna acelasi lucru de doua ori.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Emailul de expediere pleaca DOAR din `updateOrder`, actiunea din panou, si e
 * legat de plafoanele de instiintare ale contului (200/ora, 20/comanda/zi), care
 * se sprijina pe `user.id`. Un cron nu are utilizator, deci ar ocoli plafoanele
 * si ar putea trimite, la o singura rulare, sute de emailuri pe care
 * comerciantul nu le-a cerut si nu le vede venind.
 *
 * Aceeasi hotarare ca la comenzile de marketplace (`tranzitieComandaMarketplace`
 * nu trimite nimic). Daca vreodata se decide ca instiintarea automata e dorita,
 * ea are nevoie de plafon propriu si de o bifa a comerciantului — nu de un rand
 * adaugat aici.
 *
 * ═══ ⚠ FIECARE COLET E UN APEL HTTP SEPARAT ═══
 *
 * `GetParcelStatuses` primeste UN singur `ParcelNumber`. Pe implicitul clientului
 * (60 de secunde, cat toata rularea), un singur colet care atarna ar consuma tura
 * intreaga. De aia sunt PATRU paze: plafon pe rulare, termen verificat intre
 * felii, patru apeluri deodata, si o asteptare proprie, mult mai scurta.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * Un colet care n-a ajuns nicaieri in trei saptamani nu se mai rezolva de la
 * sine, iar comanda a fost deja semnalata. Fereastra tine interogarea mica si
 * indexul folositor.
 */
const ZILE = 21;

/**
 * ⚠ Plafonul pe rulare NU e decorativ: sunt N apeluri HTTP catre GLS.
 *
 * Cu rotatia dupa `gls_status_checked_at` (cele neintrebate de cel mai mult timp
 * ies primele), plafonul nu lasa niciodata aceleasi comenzi pe dinafara — se
 * ajunge la ele la tura urmatoare.
 */
const MAX_COMENZI = 120;

/**
 * ⚠ Cat asteptam un singur colet.
 *
 * Implicitul clientului e 60 de secunde — exact cat dureaza toata rularea. Pe el,
 * un colet care atarna consuma intreaga tura, iar paza de termen de mai jos
 * n-apuca sa intervina niciodata; si cum coletul acela ramane primul in coada,
 * ar taia fiecare rulare, la nesfarsit.
 *
 * 12 secunde e mult peste orice raspuns sanatos al MyGLS si lasa loc pentru mai
 * multe felii intr-o tura. Aici nu e nicio primejdie in a renunta prea devreme:
 * `GetParcelStatuses` doar CITESTE, deci o reincercare la tura urmatoare nu
 * costa nimic si nu creeaza niciun colet.
 */
const ASTEPTARE_COLET_MS = 12_000;

/**
 * Termenul rularii.
 *
 * ⚠ TREBUIE SA INCAPA, IMPREUNA CU UN APEL INTREG, IN `maxDuration`.
 *
 * Era 50s la un `maxDuration` de 60s, cu o asteptare pe colet de 12s. Verificarea
 * de termen se face la INCEPUTUL feliei, deci o felie pornita la 49,9s se putea
 * intinde pana la ~62s — adica Vercel oprea functia in mijlocul ei. Iar acolo se
 * pierdeau chiar semnalarile: marcajul „am vazut" apuca sa se scrie, notificarea
 * nu (vezi ordinea din bucla).
 *
 * `maxDuration - asteptare - marja` inchide gaura din calcul, iar termenul se
 * verifica acum si INAINTE de fiecare colet, nu doar la inceputul feliei.
 *
 * ⚠ Se calculeaza din `maxDuration`, nu scris de mana: altfel cele doua numere
 * se pot departa tacut la prima marire a limitei.
 */
const MARJA_MS = 5_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_COLET_MS - MARJA_MS;

/** Cate apeluri deodata. Secvential, 120 de colete n-ar incapea in buget. */
const DEODATA = 4;

/** Aceeasi regula de „configurat complet" ca in gls.actions.ts. */
function glsGata(c: GlsConfig | null | undefined): c is GlsConfig {
  return !!(c?.enabled && c.username && c.password && c.client_number);
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

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, created_at, gls_awb_number, gls_awb_at, gls_status_code, gls_status_checked_at, gls_evenimente_semnalate")
    .not("gls_awb_number", "is", null)
    .neq("gls_awb_number", "")
    /*
     * ⚠ Excluderea starilor incheiate NU e acoperita de filtrul pe AWB. O comanda
     * anulata isi pastreaza numarul de colet, deci s-ar potrivi la nesfarsit — si
     * am fi intrebat GLS despre ea la fiecare rulare, ca sa aflam de fiecare data
     * ca `statusUrmator` refuza oricum s-o miste. Aceeasi lectie ca la cronurile
     * de reconciliere a platilor.
     */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITEREA AWB-ului, nu pe data comenzii.
     *
     * Pe `created_at`, o comanda veche careia comerciantul ii emite AWB abia
     * acum ar fi din start in afara ferestrei: coletul ei n-ar fi interogat
     * NICIODATA, si nici returul lui n-ar fi semnalat vreodata.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in
     * `or(...)`. Sintaxa imbricata nu se poate proba fara o baza la indemana, iar
     * o greseala acolo NU da eroare: da LISTA GOALA. Adica urmarirea ar muri
     * complet, raportand vesel `ok: true`. Aceeasi lectie ca la supapa
     * registrului, unde un `.or(...)` gresit ar fi ascuns panoul cu totul.
     *
     * `gls_awb_at` e null doar pe AWB-uri emise inainte de coloana (azi: niciunul
     * — coloana vine odata cu integrarea). Sunt lasate sa intre si se cern mai
     * jos, in JavaScript, unde regula se vede si se poate proba.
     */
    .or(`gls_awb_at.gte.${since},gls_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("gls_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `orders` ar fi `null` si ramura urmatoare ar
   * raspunde `{ ok: true, verificate: 0 }` — o rulare perfect sanatoasa la
   * vedere, care n-a urmarit niciun colet.
   */
  if (eOrders) {
    await logError({
      action: "gls-tracking",
      message: `comenzile cu AWB GLS nu s-au putut citi: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  /*
   * Cernerea perechea celei de mai sus: coletele fara `gls_awb_at` (dinainte de
   * coloana) raman in urmarire doar cat timp COMANDA e in fereastra. Fara ea, o
   * comanda veche cu AWB vechi ar fi ramas in coada pentru totdeauna.
   */
  const inFereastra = orders.filter(
    (o) => o.gls_awb_at !== null || (o.created_at ?? "") >= since,
  );
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  const [{ data: settingsRows, error: eCfg }, { data: firme, error: eFirme }] = await Promise.all([
    admin.from("store_settings").select("business_id, gls_config").in("business_id", bizIds),
    admin.from("businesses").select("id, user_id").in("id", bizIds),
  ]);

  /* Fara configuratii, TOATE coletele ar fi sarite — zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "gls-tracking",
      message: `configuratiile GLS nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  /* Proprietarii lipsa opresc doar clopotelul, nu si urmarirea. */
  if (eFirme) {
    await logError({
      action: "gls-tracking",
      message: `proprietarii magazinelor nu s-au putut citi, notificarile nu pleaca: ${eFirme.message}`,
      severity: "warning",
    });
  }

  const configuri = new Map(
    (settingsRows ?? []).map((r) => [r.business_id, r.gls_config as GlsConfig | null]),
  );
  const proprietari = new Map((firme ?? []).map((f) => [f.id, f.user_id]));

  const termen = Date.now() + BUGET_MS;
  let verificate = 0;
  let mutate = 0;
  let semnalate = 0;
  let esuate = 0;
  /* Comenzi ramase neatinse fiindca s-a terminat timpul — ele raman cu marcajul
     vechi, deci ies primele la tura urmatoare. */
  let ramase = 0;
  /* Comenzi cu AWB GLS dintr-un magazin care intre timp a oprit integrarea. */
  let faraConfig = 0;
  /* Colete la care s-a ajuns, dar pentru care nu mai era timp in tura. */
  let sarite = 0;
  /* Colete al caror drum s-a incheiat: nu se mai intreaba, doar se dau la rand. */
  let incheiate = 0;

  /*
   * ⚠ Esecurile se numara PE MAGAZIN, si pe fel.
   *
   * Alarma dinainte era `verificate === 0 && esuate > 0`, adica pe intreaga
   * platforma. Cu doua magazine pe GLS, unul care isi schimba parola nu mai
   * declansa nimic: coletele celuilalt reuseau, `verificate` iesea mai mare ca
   * zero, iar urmarirea primului murea in tacere. Si invers, un singur magazin cu
   * cinci AWB-uri proaspete, pe care GLS nu le are inca indexate, producea o
   * alarma CRITICA falsa despre datele de acces.
   */
  const galeti = new Map<string, { negasite: number; autentificare: number; reusite: number; exemplu: string }>();
  const galeata = (bizId: string) => {
    let g = galeti.get(bizId);
    if (!g) { g = { negasite: 0, autentificare: 0, reusite: 0, exemplu: "" }; galeti.set(bizId, g); }
    return g;
  };

  for (let i = 0; i < inFereastra.length; i += DEODATA) {
    if (Date.now() >= termen) {
      ramase = inFereastra.length - i;
      break;
    }

    await Promise.all(inFereastra.slice(i, i + DEODATA).map(async (o) => {
      /**
       * „Am ajuns la coletul asta."
       *
       * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE.
       *
       * Marcajul e singurul lucru care face rotatia sa inainteze. Sarit pe ramura
       * de esec, un colet care pica de fiecare data — un AWB gresit, un magazin
       * care si-a oprit GLS-ul, un numar pe care GLS nu-l cunoaste — ar ramane cu
       * `gls_status_checked_at` NULL, deci ar iesi PRIMUL la fiecare rulare, la
       * nesfarsit. Cu 120 de comenzi pe tura, o suta douazeci de astfel de colete
       * blocheaza urmarirea intregii platforme, fara sa dea vreo eroare: cronul
       * raporteaza vesel ca a lucrat.
       *
       * Aceeasi capcana ca la marcajul de timp din ingestul de marketplace, unde
       * un singur pachet otravit ingheta fereastra intregului magazin.
       */
      const marcheazaVerificat = async (
        codNou: string | null,
        semnalate?: string[],
      ) => {
        const { error } = await admin
          .from("orders")
          .update({
            gls_status_code: codNou ?? o.gls_status_code,
            gls_status_checked_at: new Date().toISOString(),
            ...(semnalate ? { gls_evenimente_semnalate: semnalate } : {}),
          })
          .eq("id", o.id)
          .eq("business_id", o.business_id);
        if (error) {
          /*
           * ⚠ In `error_logs`, nu doar in `console.error`.
           *
           * Marcajul e singurul lucru care face rotatia sa inainteze. Daca nu se
           * scrie, coletul ramane vesnic in capul cozii si consuma un loc din
           * plafon la FIECARE rulare — iar semnalarile lui se repeta la nesfarsit.
           * Un `console.error` intr-un cron nu-l citeste nimeni niciodata.
           */
          await logError({
            action: "gls-tracking",
            message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Coletul ramane in capul cozii si va fi reluat la fiecare rulare.`,
            details: { orderId: o.id, awb: o.gls_awb_number, code: error.code },
            businessId: o.business_id,
            severity: "warning",
          });
        }
      };

      /*
       * ⚠ Coletele incheiate NU se scot din interogare, se dau la RAND.
       *
       * Un retur (23/40) nu misca statusul comenzii — decizia e a comerciantului
       * — deci comanda ramane „expediata" si se potriveste filtrului toate cele
       * 21 de zile. Sarita fara sa i se atinga marcajul, ea si-ar pastra pentru
       * totdeauna locul in fata cozii si ar ocupa un loc din cele 120 la FIECARE
       * rulare. O suta douazeci de retururi ar opri urmarirea intregii platforme.
       *
       * Marcajul o trimite la coada, fara sa coste vreun apel la GLS.
       *
       * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care
       * poate fi `NULL` da `NULL`, adica ar arunca afara chiar coletele
       * neverificate inca — exact cele pentru care exista cronul.
       */
      if (eStareFinala(o.gls_status_code)) {
        incheiate++;
        await marcheazaVerificat(null);
        return;
      }

      const config = configuri.get(o.business_id);
      if (!glsGata(config)) {
        /* Magazinul si-a oprit GLS-ul, dar comenzile vechi isi pastreaza AWB-ul. */
        faraConfig++;
        await marcheazaVerificat(null);
        return;
      }

      /*
       * ⚠ Termenul se verifica si AICI, nu doar la inceputul feliei.
       *
       * Cele patru colete ale unei felii pornesc deodata, dar cel de-al patrulea
       * poate ajunge la apel dupa ce primele trei au consumat aproape tot ce mai
       * era. Fara verificarea asta, un apel de 12 secunde pornit la limita duce
       * functia peste `maxDuration`, iar Vercel o taie exact intre semnalare si
       * marcaj. Sarit acum, coletul isi pastreaza marcajul vechi, deci iese
       * primul la tura urmatoare.
       */
      if (Date.now() >= termen) {
        sarite++;
        return;
      }

      let stari: StareCitita[];
      try {
        const brute = await stariColet(config, o.gls_awb_number!, ASTEPTARE_COLET_MS);
        stari = brute.map((s) => ({
          cod: s.StatusCode,
          data: dataDinNet(s.StatusDate),
          descriere: s.StatusDescription ?? null,
        }));
      } catch (e) {
        /*
         * ⚠ `stariColet` ARUNCA la colet negasit — chiar pe asta se sprijina
         * proba de conexiune din panou. Un AWB proaspat, pe care GLS nu l-a
         * inregistrat inca, e cazul obisnuit, nu un defect. Prins per colet, ca o
         * singura exceptie sa nu omoare toata tura.
         *
         * ⚠ Se pun in DOUA galeti, pe magazin. Vezi alarma de la sfarsit: un
         * „colet necunoscut" e purtare normala, o cadere de autentificare e un
         * defect care omoara urmarirea magazinului aceluia.
         */
        esuate++;
        const cauze = (e as { cauze?: number[] }).cauze ?? [];
        const doarNegasit = cauze.length > 0 && cauze.every((c) => CODURI_COLET_NECUNOSCUT.has(c));
        const g = galeata(o.business_id);
        if (doarNegasit) g.negasite++;
        else { g.autentificare++; g.exemplu ||= (e as Error).message; }
        console.error("[gls-tracking] colet", o.gls_awb_number, (e as Error).message);
        await marcheazaVerificat(null);
        return;
      }

      verificate++;
      galeata(o.business_id).reusite++;
      const ultima = ultimaStare(stari);
      const codNou = ultima?.cod?.trim() || null;

      /*
       * Statusul se calculeaza din TOATE starile, nu doar din ultima: istoricul
       * contine si evenimente care nu descriu inaintarea coletului (vama,
       * incercari esuate), iar `statusFinalDinStari` pastreaza treapta cea mai
       * inalta atinsa. Vezi comentariul de acolo.
       */
      const tinta = statusFinalDinStari(o.status, stari);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id,
          businessId: o.business_id,
          status: tinta,
          sursa: "gls",
        });
        if (rez === "ok") {
          mutate++;
          /*
           * ⚠ Facturarea automata se cheama de AICI, ca din panou si ca din lot.
           *
           * Dispecerul e singurul loc care stie regulile magazinului (la ce status
           * se factureaza, cu ce furnizor). Comanda mutata pe `delivered` fara el
           * ar sari peste factura, iar comerciantul ar descoperi lipsa la
           * inchiderea lunii — nu la comanda.
           *
           * E idempotent (iese daca exista deja orice factura), deci o a doua
           * trecere nu emite a doua factura. Cu client de SISTEM: cronul n-are
           * sesiune, exact ca la facturarea dupa plata.
           *
           * ⚠ SE ASTEAPTA. Era `void`, adica „porneste si uita" — numai ca intr-o
           * functie serverless nu exista „mai tarziu": Vercel opreste executia
           * cand se intoarce raspunsul, iar promisiunea nepornita ramane
           * nerulata. Emiterea unei facturi cere mai multe drumuri pana la casa
           * de facturare, deci era exact genul de lucru care nu apuca sa se
           * termine. Si nu exista a doua trecere: comanda e deja pe `delivered`,
           * deci rularea urmatoare n-o mai muta si n-o mai factureaza niciodata.
           *
           * Esecul lui NU are voie sa taie tura: comanda a fost mutata corect,
           * iar factura se poate emite din panou.
           */
          try {
            await maybeAutoInvoice(
              o.business_id, o.id, tinta, o.payment_status ?? "", admin as never,
            );
          } catch (e) {
            await logError({
              action: "gls-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id, awb: o.gls_awb_number },
              businessId: o.business_id,
              severity: "warning",
            });
          }
        }
        /*
         * ⚠ „reincearca" inseamna ca nu STIM daca s-a scris (lock, timeout): nu
         * avem voie sa retinem codul. „definitiv" inseamna un raspuns limpede
         * (comanda a disparut, alt magazin) — acolo reincercarea n-are ce
         * schimba, deci codul se poate retine.
         */
        prelucrat = rez !== "reincearca";
      }

      /*
       * ═══ ⚠ SE SEMNALEAZA CE N-AM SPUS INCA, NU CE E „MAI NOU" ═══
       *
       * Varianta dintai compara DATA EVENIMENTULUI (ceasul GLS) cu
       * `gls_status_checked_at` (ceasul NOSTRU). Sunt doua ceasuri diferite, iar
       * intre ele sta intarzierea cu care GLS publica scanarile: soferul
       * inregistreaza refuzul la 09:12, evenimentul apare in API la 12:30, iar
       * noi verificasem la 11:41 — deci starea, desi abia aparuta, are data mai
       * VECHE decat marcajul si se filtreaza. Refuzul si returul, exact
       * evenimentele care cer o decizie omeneasca, se pierdeau asa.
       *
       * Acum tinem minte CE am spus, nu CAND am intrebat. Cheia e `cod|data`.
       */
      const cheieEveniment = (st: StareCitita) => `${st.cod?.trim() ?? ""}|${st.data ?? ""}`;
      const dejaSpuse = new Set(
        Array.isArray(o.gls_evenimente_semnalate)
          ? (o.gls_evenimente_semnalate as unknown[]).map(String)
          : [],
      );

      /*
       * ⚠ La PRIMA vedere a coletului nu se scoate tot istoricul.
       *
       * Un AWB emis acum doua saptamani, ajuns abia acum in cron, are un teanc de
       * evenimente demult rezolvate. Se semnaleaza doar starea CURENTA, iar
       * restul se trec ca „spuse" fara sa fie strigate.
       */
      /*
       * ⚠ Se citeste COLOANA, nu marcajul de rotatie.
       *
       * Conditia era `!o.gls_status_checked_at && dejaSpuse.size === 0`. Numai ca
       * migratia adauga coloana GOALA pe toate comenzile existente: acelea AU
       * `gls_status_checked_at` (sunt urmarite de saptamani), deci n-ar fi fost
       * „prima vedere", iar `dejaSpuse` gol nu filtra nimic — la prima rulare de
       * dupa migratie fiecare colet urmarit si-ar fi strigat TOT istoricul de
       * evenimente deodata, cate o notificare de fiecare.
       *
       * `null` in coloana raspunde exact la intrebarea pusa: „am inregistrat
       * vreodata ce am spus despre coletul asta?"
       */
      const primaVedere = o.gls_evenimente_semnalate == null;
      const deSemnalat = primaVedere
        ? (trebuieSemnalat(codNou) && ultima ? [ultima] : [])
        : stari.filter((st) => trebuieSemnalat(st.cod) && !dejaSpuse.has(cheieEveniment(st)));

      /*
       * ⚠ SEMNALAREA SE FACE INAINTE DE MARCAJ. Ordinea, nu detaliul.
       *
       * Scris intai marcajul, o cadere a functiei intre cele doua (Vercel taie la
       * `maxDuration`) lasa comanda cu `gls_status_code = "23"` si fara nicio
       * notificare — iar `eStareFinala("23")` scoate pe loc coletul din urmarire,
       * deci nicio rulare viitoare nu mai repara nimic. Returul dispare definitiv.
       *
       * Invers, cel mai rau caz e o notificare repetata. Alegerea e limpede.
       */
      for (const st of deSemnalat) {
        const cod = st.cod?.trim();
        if (!cod) continue;
        semnalate++;
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          awb: o.gls_awb_number!,
          cod,
          descriere: st.descriere?.trim() || "",
        });
      }

      /*
       * Lista se rescrie din TOATE starile vazute acum, nu doar din cele
       * semnalate: altfel un eveniment care azi nu e „de semnalat" ar deveni unul
       * nou daca maine il adaugam in lista. Taiata la 200, cu cele mai recente
       * pastrate — istoricul unui colet are cateva zeci de linii, iar fereastra
       * de urmarire e oricum de 21 de zile.
       */
      const toateCheile = [...new Set([...dejaSpuse, ...stari.map(cheieEveniment)])];
      const pastrate = toateCheile.slice(-200);

      /*
       * ⚠ CODUL SE RETINE ABIA DUPA CE TRANZITIA A REUSIT. Ordinea, nu detaliul.
       *
       * Scris inainte, un cod TERMINAL (5 = livrat, 23 = retur) ar fi ramas pe
       * comanda chiar daca tranzitia a picat. Iar `eStareFinala` scoate pe loc
       * coletul din urmarire — deci comanda ar fi ramas „expediata" PENTRU
       * TOTDEAUNA, cu livrarea stiuta de noi si nescrisa nicaieri, si fara nicio
       * rulare viitoare care s-o mai poata repara.
       *
       * `null` pastreaza codul vechi si muta doar marcajul de verificare: rotatia
       * inainteaza, iar tura urmatoare reia coletul de unde a ramas.
       */
      await marcheazaVerificat(prelucrat ? codNou : null, pastrate);
    }));
  }

  /*
   * ⚠ URMARIREA NU ARE VOIE SA MOARA IN TACERE. Dar nici sa strige degeaba.
   *
   * Cazul de prins: comerciantul isi schimba parola MyGLS. Fiecare apel se
   * intoarce cu `ErrorCode -1, "Unauthorized."`, deci fiecare colet cade pe
   * ramura de esec — care scrie doar in `console.error`, iar cronul raspunde
   * `ok: true`. Urmarirea magazinului aceluia se opreste complet si nimeni n-ar
   * afla luni de zile: comenzile raman „expediate" si niciun retur nu mai e
   * semnalat.
   *
   * ⚠ Alarma se da PE MAGAZIN, si numai pentru esecuri de AUTENTIFICARE:
   *
   *   - pe platforma, un magazin picat era acoperit de altul care mergea
   *     (`verificate > 0` pe total), deci alarma nu pornea niciodata;
   *   - iar cateva AWB-uri proaspete, pe care GLS nu le are inca indexate,
   *     produceau o alarma CRITICA falsa despre datele de acces.
   */
  for (const [bizId, g] of galeti) {
    if (g.autentificare === 0 || g.reusite > 0) continue;
    await logError({
      action: "gls-tracking",
      message:
        `Urmarirea GLS a esuat pe toate cele ${g.autentificare} colete ale acestui magazin, `
        + `din motive care NU inseamna „colet necunoscut". Cel mai probabil datele de acces MyGLS `
        + `nu mai sunt valide. Raspunsul GLS: ${g.exemplu || "necunoscut"}`,
      details: { autentificare: g.autentificare, negasite: g.negasite, incheiate, faraConfig },
      businessId: bizId,
      severity: "critical",
    });
  }

  /*
   * ⚠ O COADA CARE NU SE GOLESTE E TOT UN DEFECT.
   *
   * `ramase` ajungea doar intr-un `console.log` si in corpul raspunsului, unde nu
   * se uita nimeni. Cand MyGLS raspunde lent, o tura apuca doar o parte din
   * plafon, iar restul asteapta inca doua ore — la fiecare rulare. Un retur poate
   * astepta zile intregi asa, fara ca nimic sa para stricat.
   */
  if (ramase + sarite > MAX_COMENZI / 3) {
    await logError({
      action: "gls-tracking",
      message: `Urmarirea GLS n-a apucat ${ramase + sarite} din ${inFereastra.length} colete in tura asta (buget ${Math.round(BUGET_MS / 1000)}s). Coada creste, iar semnalarea returului intarzie.`,
      details: { ramase, sarite, verificate, esuate, incheiate },
      severity: "warning",
    });
  }

  console.log(
    `[gls-tracking] verificate ${verificate}, mutate ${mutate}, semnalate ${semnalate}, esuate ${esuate}, incheiate ${incheiate}, faraConfig ${faraConfig}, ramase ${ramase}, sarite ${sarite}`,
  );
  return NextResponse.json({ ok: true, verificate, mutate, semnalate, esuate, incheiate, faraConfig, ramase, sarite });
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
    cod: string;
    descriere: string;
  },
): Promise<void> {
  const retur = esteRetur(p.cod);
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = retur ? "Colet GLS returnat" : "Colet GLS care cere atentie";
  /* Textul GLS daca exista; cifra e ultima rezerva, fiindca singura nu spune nimic. */
  const spune = p.descriere || `cod GLS ${p.cod}`;
  const mesaj = retur
    ? `${comanda}: coletul ${p.awb} se intoarce la tine (${spune}). Marfa vine inapoi, iar rambursul NU s-a incasat — anularea comenzii si returul banilor raman decizia ta.`
    : `${comanda}: coletul ${p.awb} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru starile complete.`;

  /* Fara proprietar nu exista cui trimite; ramane doar urma din loguri. */
  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "gls",
      title: titlu,
      message: mesaj,
    });
    if (error) {
      console.error("[gls-tracking] notificarea nu s-a scris:", error.message);
    }
  }

  await logError({
    action: "gls-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb, cod: p.cod },
    businessId: p.businessId,
    severity: retur ? "warning" : "info",
  });
}
