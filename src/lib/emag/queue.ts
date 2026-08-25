import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import type { EmagConfig } from "./types";
import { PRIORITATE_OP } from "./rute";

/**
 * Coada de sincronizare eMAG.
 *
 * ⚠ ESECURILE DE AICI SE SCRIU, NU SE INGHIT.
 *
 * Punerea la coada e „fire-and-forget”: n-are voie sa arunce in apelant, fiindca
 * o pana la eMAG nu trebuie sa impiedice salvarea unui produs in magazin. Dar „nu
 * arunca" a insemnat multa vreme `catch {}` gol, adica un esec care nu lasa nicio
 * urma nicaieri.
 *
 * S-a vazut ce costa: VetDepo a schimbat preturile la 1051 de produse (21.08),
 * cererea de punere la coada a cazut, si NIMENI n-a aflat. Preturile s-au schimbat
 * in magazin, la Trendyol au ramas cele vechi, iar in panou nu scria nimic. A fost
 * gasit abia cand a intrebat comerciantul, dupa o zi.
 *
 * ⚠ `src/lib/supabase/in-nefragmentat.test.ts` SCANEAZA fisierul asta. Cauta doua
 * lucruri: `.in("…", ids)` nefragmentat si `catch {}` gol. Nu e o proba care ruleaza
 * codul — citeste sursa, fiindca defectul e invizibil si la citire, si la rulare
 * (merge la 200 de id-uri, cade la 650).
 */
function inghiteDarScrie(unde: string, businessId: string, e: unknown, detalii?: Record<string, unknown>): void {
  void logError({
    action: `emag.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId, ...detalii },
    severity: "error",
  });
}

/**
 * Felul lucrarii.
 *
 * ⚠ NU E O ETICHETA, E ALEGEREA RUTEI. eMAG are trei cai de scriere, de greutati
 * foarte diferite, iar felul de aici hotaraste pe care se merge:
 *
 *   `stoc`       -> `POST /offer/save` cu `{id, stock}`. Numai cantitatea, in lot.
 *   `pret`       -> `POST /offer/save`         pret, TVA, timp de pregatire, stare.
 *   `oferta`     -> `POST /product_offer/save` produs + documentatie. SINGURA care creeaza.
 *   `retragere`  -> `POST /offer/save` cu `status: 0`. eMAG NU are stergere de oferta.
 *   `masuratori` -> `POST /measurements/save`  dimensiuni si greutate.
 *
 * ⚠ ASTA E LECTIA TRENDYOL FACUTA STRUCTURALA. Acolo `op: 'upsert'` pe un produs
 * deja aprobat trimitea CONTINUT, nu pret: 1051 de produse au raportat succes cu
 * preturile neschimbate. Aici o schimbare de pret nu are cum sa ajunga pe ruta grea,
 * fiindca felul lucrarii e altul.
 */
export type OpEmag = "oferta" | "pret" | "stoc" | "retragere" | "masuratori";

/**
 * Configurarea magazinului, cu TREI raspunsuri.
 *
 * ═══ ⚠ „N-AM PUTUT CITI” NU E NICI „DA”, NICI „NU” ═══
 *
 * Doua raspunsuri erau de ajuns cat timp singurul lucru care depindea de asta era „pun
 * sau nu pun in coada". La retragerea de dinaintea unei stergeri nu mai e: acolo, „nu se
 * stie" trebuie sa OPREASCA stergerea, iar „magazinul nu e conectat la eMAG” trebuie s-o
 * lase sa mearga.
 *
 * Confundate, o pana de o clipa a bazei ar fi aratat exact ca un magazin fara eMAG: se
 * sterge produsul, retragerea nu se pune nicaieri, iar oferta ramane la VANZARE pe eMAG
 * pentru marfa care nu mai exista.
 */
type StareaConfigului =
  | { fel: "porneste"; config: EmagConfig }
  /**
   * Magazinul chiar nu primeste lucrari automate.
   *
   * ⚠ `deconectat` deosebeste cele doua motive, si deosebirea conteaza la retragere:
   * „n-are cont eMAG” inseamna ca nu exista nicio oferta de oprit, dar „si-a stins
   * sincronizarea automată" inseamna doar „nu-mi trimite singur schimbarile” — ofertele
   * lui sunt in continuare la vanzare acolo si trebuie oprite cand sterge produsul.
   */
  /**
   * `config` vine si aici, cand magazinul e conectat dar si-a stins sincronizarea.
   *
   * Fara el, apelantul n-avea de unde sti daca „Publica automat produsele noi" e aprins:
   * taietura se facea la `auto_sync`, iar `auto_publish` nici nu apuca sa fie citit.
   */
  | { fel: "nu"; deconectat: boolean; motiv: string; config?: EmagConfig }
  /** Nu se stie. Nimic ireversibil nu are voie sa se sprijine pe raspunsul asta. */
  | { fel: "necitit"; motiv: string };

async function configPentruCoada(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
): Promise<StareaConfigului> {
  const { data, error } = await admin
    .from("store_settings").select("emag_config").eq("business_id", businessId).single();

  /*
   * ═══ ⚠ „N-AM PUTUT CITI” NU E „NU E CONECTAT” (24.08.2026) ═══
   *
   * `error` nu se citea deloc. La o pana de o clipa a bazei, `data` vine `null`, config-ul
   * iese gol, si functia raspunde `null` — adica exact ce raspunde pentru un magazin
   * NECONECTAT. Apelantul se opreste linistit, si mișcarea de stoc nu mai intra in coada
   * NICIODATA: nimeni n-o reincearca, fiindca nimeni nu stie ca s-a pierdut.
   *
   * ⚠ E chiar tiparul care a costat 1051 de produse la Trendyol — un `catch {}` gol.
   * Aici nu era gol, era mai rau: arata ca o hotarare.
   */
  if (error) {
    inghiteDarScrie("coada-config", businessId, error, { motiv: "config necitit" });
    return { fel: "necitit", motiv: error.message };
  }

  const config = (data?.emag_config as EmagConfig) ?? {};
  if (!config.connected || !config.username || !config.password) {
    return { fel: "nu", deconectat: true, motiv: "Magazinul nu are eMAG conectat." };
  }
  if (config.auto_sync === false) {
    return { fel: "nu", deconectat: false, motiv: "Sincronizarea automată cu eMAG e oprită.", config };
  }
  return { fel: "porneste", config };
}

/**
 * O singura lucrare.
 *
 * `offerId` e id-ul produsului Edinio pentru lucrarile la nivel de produs. La
 * lucrarile pe o singura combinatie se poate trimite `<productId>::<variant_title>`,
 * fiindca unicul cozii e pe `(business_id, offer_id, op)` si altfel doua marimi ale
 * aceluiasi produs s-ar suprascrie una pe alta.
 */
export async function enqueueEmagSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: OpEmag,
  /**
   * Produs abia creat in magazin. DOAR asa se poate declansa publicarea automata.
   *
   * Fara distinctia asta, „Publică automat produsele noi” ar insemna cu totul
   * altceva decat scrie pe eticheta: orice atingere a unui produs — o marire de
   * pret in masa, o schimbare de categorie, o activare — ar trimite pe eMAG tot
   * ce a atins, adica intreg catalogul dintr-o apasare.
   */
  produsNou = false,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const stare = await configPentruCoada(admin, businessId);
    /*
     * ⚠ Aici „nu se stie” se poarta ca „nu”. La retragere NU, si acolo se desparte.
     *
     * ⚠ SI E ADEVARAT NUMAI PENTRU UN PRODUS CARE ARE DEJA OFERTA (indreptat 25.08.2026).
     * Nota de dinainte spunea, fara rezerve, ca „se reia la urmatoarea atingere a
     * produsului". Pentru un produs NOU nu se reia: urmatoarea atingere e `updateProduct`,
     * care trimite `produsNou` fals la o editare obisnuita, iar mai jos garda de pe
     * numaratoarea de oferte il opreste. Deci intentia de publicare chiar se pierde, si nu
     * o recupereaza nicio trecere automata — nici plasa, care cere `last_synced_at`.
     *
     * ⚠ Ce ramane: produsul se vede in cardul „De publicat" si se publica de acolo. Adica
     * publicarea automata se degradeaza tacut in publicare manuala. Nu e „produs pierdut",
     * dar nici ce promite comutatorul.
     */

    /*
     * ═══ „TRIMITE AUTOMAT PRETUL SI STOCUL" NU E „PUBLICA PRODUSELE NOI" (25.08.2026) ═══
     *
     * Panoul are DOUA comutatoare, si sunt independente: se poate stinge unul si lasa
     * celalalt aprins. Dar taietura se facea la `auto_sync`, iar `config.auto_publish` se
     * citea abia mai jos — deci nu apuca sa fie intrebat niciodata.
     *
     * ⚠ CE INSEMNA PENTRU COMERCIANT: cel care spune „preturile le conduc eu din panoul
     * eMAG, dar produsele noi sa plece singure" — o combinatie pe care interfata i-o
     * ingaduie — nu primea NIMIC. Nici in coada, nici in jurnal: iesirea era un `return`
     * gol. Si nu se repara singur: plasa de siguranta cere `last_synced_at is not null`,
     * iar un produs care n-a plecat niciodata n-are asa ceva. Nici reaprinderea de mai
     * tarziu nu-l recupereaza — coada se umple abia la urmatoarea ATINGERE.
     *
     * ⚠ Deosebirea era deja facuta in casa, la retragere: „`auto_sync` STINS NU E UN MOTIV
     * SA NU RETRAGEM". Publicarea n-a primit acelasi tratament, si de aia `deconectat`
     * exista deja pe tip.
     *
     * ⚠ MAGAZINUL DECONECTAT RAMANE UN „NU" ADEVARAT: acolo n-avem nici cont, nici unde
     * trimite. Se trece numai peste „mi-am stins sincronizarea".
     */
    const publicareCeruta =
      produsNou && stare.fel === "nu" && !stare.deconectat && stare.config?.auto_publish === true;

    if (stare.fel !== "porneste" && !publicareCeruta) return;
    const config = stare.fel === "porneste" ? stare.config : (stare.config as EmagConfig);

    /*
     * In mod normal se pun la coada doar produsele care au deja o oferta pe eMAG:
     * un produs nou nu se trimite nicaieri pana nu-l pregateste comerciantul.
     *
     * Cu „Publică automat” pornita, regula se inverseaza — produsul nou intra in
     * coada, iar publicarea ii construieste ofertele din maparea categoriei. Daca
     * n-are categoria mapata, elementul esueaza cu un mesaj limpede si se vede in
     * coada; nu pleaca nimic gresit la eMAG.
     */
    if (op !== "retragere" && productId && !(config.auto_publish && produsNou)) {
      /*
       * ═══ ⚠ `auto_sync` E PE OFERTA, NU DOAR PE MAGAZIN ═══
       *
       * Comutatorul din `configPentruCoada` e al MAGAZINULUI. Asta e al OFERTEI, si
       * `false` inseamna „preluata din contul lor la import”.
       *
       * Prima forma cauta doar daca exista un rand. Deci dupa primul import, orice
       * schimbare de pret din magazin ar fi plecat si peste ofertele preluate — adica
       * peste preturile pe care comerciantul le-a pus de mana in panoul eMAG. Exact
       * munca pentru care a facut importul, stearsa de prima lui modificare, tacut.
       *
       * ⚠ Paza asta NU E SINGURA, si nici nu poate fi. Un rand poate ajunge in coada
       * INAINTE ca `auto_sync` sa fie stins de un import care ruleaza chiar atunci.
       * A doua paza e in `rutaDeTrimitere`, care refuza sa trimita si scrie de ce.
       */
      const { count, error: eNumar } = await admin
        .from("emag_offers").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId).eq("auto_sync", true);

      /*
       * ⚠ O CITIRE PICATA DA `count: null`, IAR `!null` E `true`.
       *
       * Adica o pana a bazei arata identic cu „produsul n-are nicio ofertă care se
       * sincronizează" — si mișcarea se arunca tacut. Se deosebesc: la eroare se lasa sa
       * treaca mai departe, fiindca `rutaDeTrimitere` are a doua paza si refuza acolo
       * scriind de ce. Mai bine un element in coada care se opreste zgomotos, decat unul
       * care nu intra niciodata.
       */
      if (eNumar) inghiteDarScrie("coada-numar", businessId, eNumar, { productId });
      else if (!count) return;
    }

    /*
     * ⚠ `prioritate` SI `next_retry_at: null` SE SCRIU AMANDOUA, DINADINS.
     *
     * Prioritatea, fiindca de ea depinde daca o miscare de stoc trece inaintea unui
     * catalog de 20.000 (vezi `PRIORITATE_OP`).
     *
     * `next_retry_at: null` fiindca o cerere NOUA pe acelasi element inseamna ca s-a
     * schimbat ceva la produs — poate chiar campul care lipsea. Pastrata, asteptarea
     * de patru ore ar fi tinut pe loc tocmai reparatia. ⚠ Si `abandonat_la`, din
     * acelasi motiv: un element oprit definitiv se reaprinde cand omul il atinge.
     *
     * ⚠ Se rescrie NUMAI randul aceluiasi `op`: unicul e pe `(business_id, offer_id,
     * op)`, deci o miscare de stoc nu sterge asteptarea unei publicari cazute.
     */
    const { error: eScriere } = await admin.from("emag_sync_queue").upsert(
      {
        business_id: businessId, product_id: productId, offer_id: offerId, op,
        prioritate: PRIORITATE_OP[op], next_retry_at: null, abandonat_la: null, attempts: 0,
        /* ⚠ SI CONTOARELE PENELOR, SI MOTIVUL VECHI (25.08.2026).

           `pauze` nu se punea la zero niciodata — singurele lui scrieri sunt `+1` in cron.
           Deci o cerere NOUA mostenea numarul de pene al unei generatii vechi, iar la
           prima eroare trecatoare sarea direct la un `asteptareaDupaPana(pauze)` mare:
           produsul abia atins de comerciant astepta ore pentru o pana de acum o saptamana.

           `last_error` la fel: pana la prima incercare noua, panoul arata motivul unei
           incercari care nu mai are nicio legatura cu ce e in coada acum. */
        pauze: 0, last_error: null,
      },
      { onConflict: "business_id,offer_id,op" },
    );

    /*
     * ⚠ SCRIEREA CARE PICA SE SPUNE. Netratata, elementul nu intra in coada si nimeni
     * n-o afla: nici ecranul, care numara randurile din coada si vede zero; nici cronul,
     * care ia ce e acolo. `enqueueMany` face de mult `if (error) throw error`; calea de
     * un singur element era singura care tacea.
     *
     * ⚠ Nu se ARUNCA insa: se cheama cu `void` din actiuni pe produs, iar o exceptie ar
     * rupe salvarea produsului pentru o coada de marketplace.
     *
     * ⚠ SE SCRIE IN `error_logs`, SI ATAT — nu in centrul de necazuri (indreptat
     * 25.08.2026). Nota de dinainte spunea ca „centrul de necazuri o poate arata"; el
     * citeste insa `emag_offers` si `emag_sync_queue`, iar un element care N-A INTRAT in
     * coada n-are rand in niciuna. Deci comerciantul nu vede nimic; se vede doar prin
     * jurnalul de administrator de platforma.
     *
     * O nota care trimite la un ecran unde lucrul nu apare e mai rea decat lipsa ei: cine
     * o citeste se duce sa caute acolo si pleaca linistit.
     */
    if (eScriere) {
      inghiteDarScrie("coada-scriere", businessId, eScriere, { productId, op });
    }
  } catch (e) {
    inghiteDarScrie("unul", businessId, e, { productId, offerId, op });
  }
}

/**
 * Mai multe produse deodata.
 *
 * ═══ ⚠ ID-URILE SE TAIE PE BUCATI. AICI A FOST DEFECTUL ═══
 *
 * `.in("product_id", ids)` NU pleaca in corpul cererii, ci in ADRESA. Fiecare UUID
 * adauga 37 de semne, iar marginea respinge cererea cand adresa devine prea lunga.
 * Masuratoarea e in `supabase/id-chunks.ts`, facuta pe proiectul real: pragul e
 * intre 600 si 700 de id-uri, iar raspunsul e un 400 in text simplu, care nu spune
 * nimic despre id-uri.
 *
 * Defectul, gasit 21.08: VetDepo a schimbat pretul la 1051 de produse dintr-o
 * actiune in masa. `bulkProductAction` isi taia deja propriile cereri pe bucati si
 * chiar avertizeaza in comentariu despre pragul asta — dar chema coada cu toate
 * cele 1051 de id-uri deodata. Cererea a picat, `catch {}` a inghitit-o, si nu s-a
 * pus in coada NIMIC.
 *
 * ⚠ `bucatiDeIduri` se aplica DOAR citirii. Scrierea de la sfarsit e un `upsert` cu
 * corp, deci nu atinge limita de adresa; taiata si ea, ar fi insemnat mai multe
 * cereri fara niciun castig.
 *
 * ═══ ⚠ INTOARCE CATE AU INTRAT CU ADEVARAT, NU CATE S-AU CERUT ═══
 *
 * Prima forma intorcea `void`. Iar apelantul care voia sa spuna omului cate produse
 * au plecat n-avea de unde sti — asa ca spunea cate ceruse. Din patru motive intemeiate
 * coada poate primi ZERO din cele cerute: magazinul si-a stins sincronizarea automata,
 * configurarea nu s-a putut citi, niciun produs n-are inca oferta, sau toate ofertele
 * sunt preluate din contul lor.
 *
 * In toate patru, ecranul ar fi scris „400 de produse puse la rand” si nu s-ar fi pus
 * niciunul. Adica exact forma incidentului VetDepo — raspuns de succes, efect zero,
 * si nimeni nu afla — pe care tot fisierul asta e scris ca s-o previna.
 */
/**
 * Are voie produsul asta sa intre intr-o punere in masa?
 *
 * Functie curata, exportata anume ca sa poata fi probata fara baza de date. E cea mai
 * periculoasa hotarare din tot fisierul: gresita intr-un sens, nu se publica nimic;
 * gresita in celalalt, se urca un catalog intreg pe eMAG dintr-o apasare care promitea
 * altceva — iar eMAG NU sterge oferte, doar le retrage.
 *
 * ⚠ „OPRITA” BATE „PORNITA”, si asta nu e o subtilitate.
 *
 * Un produs cu variante poate avea o parte din oferte preluate din contul lor
 * (`auto_sync = false`) si o parte facute de noi. Luat drept „pornit”, o publicare in
 * masa i-ar fi rescris si pe cele preluate — adica pretul pe care comerciantul si l-a
 * pus el in panoul eMAG. Cand nu e limpede, se lasa in pace: exista „Trimite acum” pe
 * produsul anume, unde omul stie ce face.
 */
export function poateIntraInCoada(
  id: string,
  pornite: ReadonlySet<string>,
  oprite: ReadonlySet<string>,
  publicaSiFaraOferta: boolean,
): boolean {
  if (oprite.has(id)) return false;
  if (pornite.has(id)) return true;
  /* Fara nicio oferta: intra DOAR pe drumurile care spun anume „publica”. */
  return publicaSiFaraOferta;
}

export interface OptiuniCoadaMulti {
  /**
   * Ingaduie si produsele care N-AU inca nicio oferta pe eMAG.
   *
   * ═══ ⚠ SE CERE ANUME, SI NUMAI DE PE DRUMURILE CARE SPUN „PUBLICĂ” ═══
   *
   * Implicit, actiunile in masa ating doar produsele publicate deja. Paza aia e
   * importanta si ramane: „sincronizează prețurile” n-are voie sa PUBLICE produse pe
   * care nimeni nu ceruse sa le publice — ar fi urcat pe eMAG jumatate de catalog
   * dintr-o apasare care promitea altceva.
   *
   * Dar tot ea facea butonul „Publică categoria” sa nu poata publica nimic la prima
   * folosire: fara oferte, lista iesea goala si mesajul de eroare dadea vina pe
   * comutatorul de sincronizare automata — un diagnostic gresit, care trimitea omul
   * sa caute unde nu era nimic.
   *
   * ⚠ Ofertele PRELUATE raman excluse chiar si asa. Un rand cu `auto_sync = false`
   * inseamna „asta e a comerciantului, din contul lui” — iar o publicare in masa
   * n-are voie sa i-o rescrie. Deci regula e: intra produsele cu oferta pornita SI
   * cele fara nicio oferta; raman afara doar cele oprite anume.
   */
  publicaSiFaraOferta?: boolean;
}

/**
 * Ce s-a intamplat cu o punere in coada.
 *
 * ═══ ⚠ DE CE UN VERDICT SI NU UN NUMAR ═══
 *
 * `enqueueMany` intorcea `0` in TREI situatii care nu inseamna acelasi lucru: n-avea ce pune,
 * magazinul e oprit, sau scrierea a picat. Cel care cheama nu le putea deosebi.
 *
 * ⚠ CE COSTA: la propagarea setarilor, o scriere picata era stinsa ca si cum ar fi reusit —
 * iar pentru GPSR, `green_tax` si `supply_lead_time` NU exista a doua plasa. Pretul si stocul
 * le repara deriva; alea trei, nimeni.
 *
 * Invelisurile vechi raman pe `number`, ca sa nu se schimbe purtarea nicaieri altundeva.
 */
export type VerdictCoada =
  | { fel: "puse"; cate: number }
  /** N-a ramas niciun produs care sa poata intra (toate oprite, sau lista goala). */
  | { fel: "nimic"; }
  /** Magazinul e deconectat sau are sincronizarea stinsa: o hotarare a omului, nu un defect. */
  | { fel: "oprit"; }
  | { fel: "eroare"; mesaj: string };

async function enqueueManyDetaliat(
  businessId: string,
  productIds: (string | null | undefined)[],
  op: OpEmag,
  optiuni: OptiuniCoadaMulti = {},
): Promise<VerdictCoada> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return { fel: "nimic" };

    const admin = createAdminClient();
    const stare = await configPentruCoada(admin, businessId);

    /*
     * ═══ UN BUTON APASAT DE OM NU SE CARMUIESTE DE UN COMUTATOR AUTOMAT ═══
     *
     * `publicaSiFaraOferta` se pune NUMAI de pe drumurile care spun „Publică" — vezi nota
     * de la `OptiuniCoadaMulti`. Iar acolo omul tocmai a apasat, deci a cerut-o el, acum.
     * Comutatorul „Trimite automat prețul și stocul" vorbeste despre ce se intampla FARA
     * ca el sa ceara; n-are ce cauta in calea unei cereri explicite.
     *
     * ⚠ Ce pate omul pana acum: apasa „Publică" pe zece produse si primea zero puse, cu un
     * mesaj care dadea vina pe cu totul altceva. Vezi `publicaProduseleEmag`.
     *
     * ⚠ Si aici magazinul DECONECTAT ramane un „nu" adevarat.
     */
    const apasatDeOm = optiuni.publicaSiFaraOferta === true;
    const trecePeApasare = apasatDeOm && stare.fel === "nu" && !stare.deconectat;

    if (stare.fel !== "porneste" && !trecePeApasare) return { fel: "oprit" };

    /*
     * Actiunile in masa NU auto-publica: ele ating produse care exista deja, iar
     * „publicare automată” e despre produsele NOI. Vezi nota de mai sus.
     */
    /*
     * ⚠ SE CITESC TOATE RANDURILE, cu `auto_sync` cu tot — nu doar cele pornite.
     *
     * Prima forma cerea `auto_sync = true` si pastra ce gasea. Ceea ce raspunde la
     * intrebarea gresita: „care produse au oferta pornita?” in loc de „care produse
     * NU trebuie atinse?".
     *
     * Deosebirea conteaza abia la publicare, unde un produs fara nicio oferta trebuie
     * sa poata intra — dar unul cu oferta OPRITA anume nu.
     */
    const pornite = new Set<string>();
    const oprite = new Set<string>();
    for (const bucata of bucatiDeIduri(ids)) {
      const { data, error } = await admin
        .from("emag_offers").select("product_id, auto_sync")
        .eq("business_id", businessId).in("product_id", bucata);
      if (error) throw error;
      for (const r of data ?? []) {
        const rand = r as { product_id: string | null; auto_sync: boolean };
        if (!rand.product_id) continue;
        (rand.auto_sync ? pornite : oprite).add(rand.product_id);
      }
    }

    const randuri = ids
      .filter((id) => poateIntraInCoada(id, pornite, oprite, optiuni.publicaSiFaraOferta === true))
      .map((id) => ({
        business_id: businessId, product_id: id, offer_id: id, op,
        /* ⚠ Aceleasi patru campuri ca la elementul singur. Vezi nota de acolo: o
           cerere noua pe acelasi element inseamna ca s-a schimbat ceva. */
        prioritate: PRIORITATE_OP[op], next_retry_at: null, abandonat_la: null, attempts: 0,
        /* ⚠ SI CONTOARELE PENELOR, SI MOTIVUL VECHI (25.08.2026).

           `pauze` nu se punea la zero niciodata — singurele lui scrieri sunt `+1` in cron.
           Deci o cerere NOUA mostenea numarul de pene al unei generatii vechi, iar la
           prima eroare trecatoare sarea direct la un `asteptareaDupaPana(pauze)` mare:
           produsul abia atins de comerciant astepta ore pentru o pana de acum o saptamana.

           `last_error` la fel: pana la prima incercare noua, panoul arata motivul unei
           incercari care nu mai are nicio legatura cu ce e in coada acum. */
        pauze: 0, last_error: null,
      }));
    if (randuri.length === 0) return { fel: "nimic" };

    const { error } = await admin
      .from("emag_sync_queue").upsert(randuri, { onConflict: "business_id,offer_id,op" });
    if (error) throw error;
    return { fel: "puse", cate: randuri.length };
  } catch (e) {
    inghiteDarScrie("multe", businessId, e, { cate: productIds.length, op });
    return { fel: "eroare", mesaj: e instanceof Error ? e.message : "punere in coada esuata" };
  }
}

/** Invelisul vechi: numar, ca sa nu se schimbe nimic la cei ~10 chematori. */
async function enqueueMany(
  businessId: string,
  productIds: (string | null | undefined)[],
  op: OpEmag,
  optiuni: OptiuniCoadaMulti = {},
): Promise<number> {
  const r = await enqueueManyDetaliat(businessId, productIds, op, optiuni);
  return r.fel === "puse" ? r.cate : 0;
}

/**
 * Punere in coada cu VERDICT, pentru cine trebuie sa stie daca a mers.
 *
 * ⚠ Se foloseste numai acolo unde exista o intentie durabila de stins — vezi
 * `propagare.ts`. In rest, numarul e de ajuns.
 */
export function enqueueEmagStrict(
  businessId: string, productIds: (string | null | undefined)[], op: "oferta" | "pret" | "stoc",
): Promise<VerdictCoada> {
  return enqueueManyDetaliat(businessId, productIds, op);
}

/** Retrimitere completa, dupa o editare de produs. */
export function enqueueEmagSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<number> {
  return enqueueMany(businessId, productIds, "oferta");
}

/**
 * PUBLICARE ceruta anume: intra si produsele care n-au fost niciodata pe eMAG.
 *
 * ⚠ Functie separata, cu alt nume, dinadins. Un steag pus pe `enqueueEmagSyncMany` ar
 * fi fost usor de dat din greseala de pe un drum automat — iar atunci „sincronizează
 * prețurile" ar fi publicat jumatate de catalog dintr-o apasare care promitea altceva.
 *
 * Numele spune ce face. Se cheama doar din butoane pe care scrie „publică”.
 */
export function publicaPeEmagMany(
  businessId: string, productIds: (string | null | undefined)[],
): Promise<number> {
  return enqueueMany(businessId, productIds, "oferta", { publicaSiFaraOferta: true });
}

/**
 * Numai stocul, dupa ce o comanda l-a scazut.
 *
 * ⚠ Ruta cea mai usoara, dinadins. O miscare de stoc nu are voie sa atinga nici
 * pretul, nici documentatia: la eMAG, o oferta preluata de comerciant din panoul
 * lor si-ar fi pierdut modificarile la fiecare vanzare.
 */
export function enqueueEmagStocMany(businessId: string, productIds: (string | null | undefined)[]): Promise<number> {
  return enqueueMany(businessId, productIds, "stoc");
}

/** Numai pretul si starea. */
export function enqueueEmagPretMany(businessId: string, productIds: (string | null | undefined)[]): Promise<number> {
  return enqueueMany(businessId, productIds, "pret");
}

/* ══════════════════════════════════════════════════════════════════════════
   RETRAGEREA UNUI PRODUS STERS (audit 24.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pune la coada oprirea de la vanzare a ofertelor unui produs care se sterge.
 *
 * ═══ ⚠ SE CHEAMA INAINTE DE STERGERE, SI ASTA E TOT ROSTUL ═══
 *
 * Dupa stergere, `emag_offers.product_id` devine `null` (`on delete set null`), deci
 * ofertele nu se mai pot gasi dupa produs. Iar elementul pus in coada cu
 * `product_id: null` era STERS de cron inainte sa trimita ceva.
 *
 * ⚠ Rezultatul, pana azi: comerciantul stergea produsul si continua sa primeasca
 * comenzi eMAG pentru marfa pe care n-o mai avea. Anularile le platea el.
 *
 * Aici se citesc `emag_id`-urile CAT INCA SE POATE si se pune cate un element pentru
 * fiecare, cu `offer_id` = id-ul ofertei. Cronul le trimite pe cale directa.
 */
/**
 * Raspunsul retragerii de dinaintea unei stergeri.
 *
 * ═══ ⚠ „GATA” INSEAMNA DOVEDIT, NU „N-A DAT EROARE” ═══
 *
 * Singurul lucru care conteaza pentru apelant e daca are voie sa stearga produsul. Iar
 * are voie DOAR daca retragerea e scrisa durabil in baza (sau daca nu era nimic de
 * retras). Nu se asteapta dupa eMAG: e de ajuns ca lucrarea sa existe in coada, fiindca
 * de acolo cronul o duce singur pana la capat, cu reincercari.
 */
export type RezultatRetragere =
  /** Ori s-a scris retragerea, ori chiar n-avea ce sa retraga. Se poate sterge. */
  | { fel: "gata" }
  /**
   * Nu se poate DOVEDI ca retragerea a fost programata.
   *
   * ⚠ NU SE STERGE PRODUSUL. Sters aici, oferta ramane la vanzare pe eMAG pentru marfa
   * care nu mai exista in magazin, iar legatura dupa care s-ar mai fi putut gasi
   * (`emag_offers.product_id`) tocmai a fost rupta de `on delete set null`. Nu mai are
   * cine s-o repare, si nimeni nu afla pana nu vine o comanda.
   */
  | { fel: "nesigur"; motiv: string };

export async function enqueueEmagRetragereInainteDeStergere(
  businessId: string,
  productIds: string[],
): Promise<RezultatRetragere> {
  try {
    if (productIds.length === 0) return { fel: "gata" };
    const admin = createAdminClient();
    const stare = await configPentruCoada(admin, businessId);

    /*
     * ⚠ AICI SE DESPARTE „NU E CONECTAT” DE „N-AM PUTUT CITI”.
     *
     * Pana acum erau acelasi `null`, deci o pana de o clipa a bazei arata exact ca un
     * magazin fara eMAG — si stergerea mergea inainte.
     *
     * ⚠ `auto_sync` STINS NU E UN MOTIV SA NU RETRAGEM. Comutatorul acela spune „nu
     * trimite singur schimbarile mele"; nu spune „lasa ofertele la vanzare dupa ce sterg
     * produsul". Dar `configPentruCoada` le pune pe amandoua sub „nu”, deci se cere
     * anume: singurul „nu” care ingaduie stergerea e magazinul chiar neconectat.
     */
    if (stare.fel === "necitit") {
      return { fel: "nesigur", motiv: "Configurarea eMAG a magazinului nu s-a putut citi." };
    }
    /* ⚠ Numai magazinul FARA cont eMAG sare peste: acolo chiar n-are ce sa retraga. */
    if (stare.fel === "nu" && stare.deconectat) return { fel: "gata" };

    const emagIds: number[] = [];
    for (const bucata of bucatiDeIduri(productIds)) {
      const { data, error } = await admin.from("emag_offers")
        .select("emag_id").eq("business_id", businessId).in("product_id", bucata);
      /*
       * ⚠ O CITIRE PICATA DA `data: null`, IAR `(null ?? [])` E O LISTA GOALA.
       *
       * Adica arata exact ca „produsul n-are nicio oferta pe eMAG” — si atunci functia
       * raspundea „gata”, produsul se stergea, iar oferta ramanea la vanzare. E chiar
       * tiparul reparat in restul fisierului: `error` netratat care arata ca o hotarare.
       */
      if (error) {
        inghiteDarScrie("retragere-citire", businessId, error, { cate: productIds.length });
        return { fel: "nesigur", motiv: "Ofertele eMAG ale produsului nu s-au putut citi." };
      }
      for (const r of (data ?? []) as { emag_id: number }[]) emagIds.push(r.emag_id);
    }
    if (emagIds.length === 0) return { fel: "gata" };

    const randuri = emagIds.map((id) => ({
      business_id: businessId,
      /* ⚠ `product_id: null` ANUME: produsul chiar dispare, iar cronul stie sa mearga
         pe `offer_id` cand lucrarea e o retragere. */
      product_id: null,
      offer_id: String(id),
      op: "retragere" as const,
      prioritate: PRIORITATE_OP.retragere,
      next_retry_at: null,
      abandonat_la: null,
      attempts: 0,
      /* ⚠ Vezi nota de mai sus: o cerere noua nu mosteneste memoria unei pene vechi. */
      pauze: 0,
      last_error: null,
    }));

    const { error: eScriere } = await admin
      .from("emag_sync_queue").upsert(randuri, { onConflict: "business_id,offer_id,op" });
    if (eScriere) {
      inghiteDarScrie("retragere-scriere", businessId, eScriere, { cate: emagIds.length });
      return { fel: "nesigur", motiv: "Retragerea de pe eMAG nu s-a putut programa." };
    }

    return { fel: "gata" };
  } catch (e) {
    inghiteDarScrie("retragere-stergere", businessId, e, { cate: productIds.length });
    return { fel: "nesigur", motiv: "Retragerea de pe eMAG nu s-a putut programa." };
  }
}
