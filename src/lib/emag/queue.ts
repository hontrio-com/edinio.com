import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import type { EmagConfig } from "./types";

/**
 * Coada de sincronizare eMAG.
 *
 * ⚠ ESECURILE DE AICI SE SCRIU, NU SE INGHIT.
 *
 * Punerea la coada e „fire-and-forget": n-are voie sa arunce in apelant, fiindca
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
 *   `stoc`       -> `PATCH /offer_stock/{id}`  numai cantitatea. Cea mai usoara.
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

/** Configurarea, si daca magazinul primeste lucrari in coada. */
async function configPentruCoada(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
): Promise<EmagConfig | null> {
  const { data } = await admin
    .from("store_settings").select("emag_config").eq("business_id", businessId).single();
  const config = (data?.emag_config as EmagConfig) ?? {};
  if (!config.connected || !config.username || !config.password) return null;
  if (config.auto_sync === false) return null;
  return config;
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
   * Fara distinctia asta, „Publică automat produsele noi" ar insemna cu totul
   * altceva decat scrie pe eticheta: orice atingere a unui produs — o marire de
   * pret in masa, o schimbare de categorie, o activare — ar trimite pe eMAG tot
   * ce a atins, adica intreg catalogul dintr-o apasare.
   */
  produsNou = false,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const config = await configPentruCoada(admin, businessId);
    if (!config) return;

    /*
     * In mod normal se pun la coada doar produsele care au deja o oferta pe eMAG:
     * un produs nou nu se trimite nicaieri pana nu-l pregateste comerciantul.
     *
     * Cu „Publică automat" pornita, regula se inverseaza — produsul nou intra in
     * coada, iar publicarea ii construieste ofertele din maparea categoriei. Daca
     * n-are categoria mapata, elementul esueaza cu un mesaj limpede si se vede in
     * coada; nu pleaca nimic gresit la eMAG.
     */
    if (op !== "retragere" && productId && !(config.auto_publish && produsNou)) {
      /*
       * ═══ ⚠ `auto_sync` E PE OFERTA, NU DOAR PE MAGAZIN ═══
       *
       * Comutatorul din `configPentruCoada` e al MAGAZINULUI. Asta e al OFERTEI, si
       * `false` inseamna „preluata din contul lor la import".
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
      const { count } = await admin
        .from("emag_offers").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId).eq("auto_sync", true);
      if (!count) return;
    }

    await admin.from("emag_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
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
 */
async function enqueueMany(
  businessId: string,
  productIds: (string | null | undefined)[],
  op: OpEmag,
): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;

    const admin = createAdminClient();
    const config = await configPentruCoada(admin, businessId);
    if (!config) return;

    /*
     * Actiunile in masa NU auto-publica: ele ating produse care exista deja, iar
     * „publicare automată" e despre produsele NOI. Vezi nota de mai sus.
     */
    const cuOferta = new Set<string>();
    for (const bucata of bucatiDeIduri(ids)) {
      /* ⚠ `auto_sync: true` — ofertele PRELUATE nu intra in coada. Vezi nota lunga
         din `enqueueEmagSync`; aici e aceeasi regula, pe drumul in masa. */
      const { data, error } = await admin
        .from("emag_offers").select("product_id")
        .eq("business_id", businessId).eq("auto_sync", true).in("product_id", bucata);
      if (error) throw error;
      for (const r of data ?? []) {
        const pid = (r as { product_id: string | null }).product_id;
        if (pid) cuOferta.add(pid);
      }
    }

    const randuri = ids
      .filter((id) => cuOferta.has(id))
      .map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op }));
    if (randuri.length === 0) return;

    const { error } = await admin
      .from("emag_sync_queue").upsert(randuri, { onConflict: "business_id,offer_id,op" });
    if (error) throw error;
  } catch (e) {
    inghiteDarScrie("multe", businessId, e, { cate: productIds.length, op });
  }
}

/** Retrimitere completa, dupa o editare de produs. */
export function enqueueEmagSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "oferta");
}

/**
 * Numai stocul, dupa ce o comanda l-a scazut.
 *
 * ⚠ Ruta cea mai usoara, dinadins. O miscare de stoc nu are voie sa atinga nici
 * pretul, nici documentatia: la eMAG, o oferta preluata de comerciant din panoul
 * lor si-ar fi pierdut modificarile la fiecare vanzare.
 */
export function enqueueEmagStocMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "stoc");
}

/** Numai pretul si starea. */
export function enqueueEmagPretMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "pret");
}
