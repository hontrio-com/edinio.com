"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { eroareNesigura, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { ziuaInRomania } from "@/lib/utils/zile-lucratoare";
import {
  campuriDezlegareFan,
  configPentruAwbEmis,
  contextulAwbEmis,
  createFanCourierAwb,
  deleteFanCourierAwb,
  createFanCourierPickupOrder,
  deleteFanCourierPickupOrder,
  loadFanCourierAccount,
  tipPunctFan,
  type FanCourierConfig,
  type FanCourierAwbInput,
  type FanCourierPickupInput,
  type FanCourierBranch,
} from "@/lib/fancourier";
import { poartaAwbPropriu } from "@/lib/orders/poarta-awb";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveFanCourierConfig(
  businessId: string,
  config: FanCourierConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Citirea se face cu SERVICE ROLE. De aici valoarea nu pleaca spre curier — se
  // scrie doar la loc, si `privat.cripteaza` e idempotenta, deci randul din baza ar
  // ramane corect si citit cifrat. Se citeste totusi decriptat fiindca asta e
  // contractul lui `pastreazaSecretele` (secrete.ts): altfel `configFinal` tine
  // `enc.v1.…`, si primul care adauga dupa salvare un apel catre curier sau un
  // `return { config }` rupe integrarea in tacere. Proprietatea e dovedita mai sus.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("fan_courier_config").eq("business_id", businessId).maybeSingle();
  const configVechiSalvat = vechi?.fan_courier_config as FanCourierConfig | null;
  const configImbinat = pastreazaSecretele("fan_courier_config", config, vechi?.fan_courier_config) as FanCourierConfig;
  /*
   * ⚠ EVIDENTA RIDICARII E A SERVERULUI, nu a browserului.
   *
   * Scrierea de aici inlocuieste coloana INTREAGA, iar formularul caraia `last_pickup_*`
   * printr-o fotografie luata la randarea paginii. Deci: fila de Setari deschisa la 09:00,
   * ridicare programata la 09:20 din ecranul de Comenzi (scrisa cu petic atomic), o bifa
   * salvata la 09:30 din fila veche, si id-ul ridicarii dispare. Butonul „Anuleaza
   * ridicarea existenta" nu se mai randeaza, anularea raspunde „nu exista o ridicare
   * programata", iar soferul vine a doua zi degeaba. Invers e si mai rau: o fila deschisa
   * INAINTE de anulare rescrie inapoi un id mort, pe care nimic nu-l mai poate sterge.
   *
   * Valul asta a mutat deja cele doua scrieri de ridicare pe `jsonb_merge_config` tocmai
   * ca sa nu se mai calce; salvarea din Setari ramasese pe drumul vechi.
   */
  const configFinal: FanCourierConfig = {
    ...configImbinat,
    last_pickup_date: configVechiSalvat?.last_pickup_date ?? null,
    last_pickup_id: configVechiSalvat?.last_pickup_id ?? null,
    last_pickup_client_id: configVechiSalvat?.last_pickup_client_id ?? null,
  };

  /*
   * ⚠ NU SE SALVEAZA „ACTIV" FARA CE TREBUIE CA SA FUNCTIONEZE.
   *
   * `pastreazaSecretele` pastreaza parola veche cand formularul trimite gol,
   * corect, fiindca ecranul o primeste mascata. Dar cand nu exista NICIO parola
   * veche, rezultatul e o configurare cu `enabled: true` si `password: ""`.
   *
   * Ce se vedea: bifa verde „FAN Courier activ" pe ecranul de setari, coloana FAN
   * in lista de comenzi, optiunea FAN in checkout, si fiecare actiune de server
   * raspunzand „FAN Courier nu este configurat complet". Trei ecrane spuneau una
   * si serverul alta, iar comerciantul nu avea de unde sti ce lipseste.
   *
   * Se verifica REZULTATUL imbinarii, nu ce a trimis formularul: numai el stie
   * daca a ramas ceva salvat dedesubt.
   */
  if (configFinal.enabled) {
    const lipsa = [
      !configFinal.username?.trim() && "username-ul selfAWB",
      !configFinal.password?.trim() && "parola selfAWB",
      !configFinal.client_id && "sucursala expeditoare",
    ].filter(Boolean) as string[];
    if (lipsa.length > 0) {
      return { error: `Nu pot activa FAN Courier fara ${lipsa.join(", ")}. Completeaza si apasa din nou.` };
    }
  }

  const { error } = await supabase.from("store_settings").update({
    fan_courier_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectFanCourier(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  /*
   * ⚠ DECONECTAREA E IREVERSIBILA PENTRU CE E DEJA IN AER.
   *
   * Golirea configului sterge username, parola, `client_id` SI `last_pickup_id`.
   * Dupa ea, `getConfigAndOrder` si `getOwnedFanConfig` raspund „FAN Courier nu
   * este configurat complet", deci:
   *   - AWB-urile vii nu se mai pot anula, nici tipari;
   *   - ridicarea programata nu se mai poate anula, si nici nu se mai stie ce id
   *     avea, fiindca el traia chiar in configul sters;
   *   - comenzile raman needitabile, fiindca poarta cere anularea AWB-ului intai.
   *
   * Curierul insa nu afla nimic: coletele pleaca, rambursul se incaseaza, si
   * comerciantul nu mai are de unde interveni decat sunand la FAN.
   *
   * Deci se REFUZA cat timp mai e ceva de inchis, cu numarul lucrurilor de
   * inchis in mesaj. Acelasi tipar ca la `disconnectOlx`.
   */
  const admin = createAdminClient();
  const [{ count: awburiVii }, { data: setari }] = await Promise.all([
    admin.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("fan_courier_awb_number", "is", null),
    admin.from("store_settings").select("fan_courier_config").eq("business_id", businessId).maybeSingle(),
  ]);

  const configVechi = setari?.fan_courier_config as FanCourierConfig | null;
  const opriri: string[] = [];
  if (awburiVii && awburiVii > 0) {
    opriri.push(`${awburiVii} ${awburiVii === 1 ? "comanda are AWB FAN activ" : "comenzi au AWB FAN activ"}`);
  }
  /*
   * ⚠ DOAR O RIDICARE CARE MAI E IN FATA, nu simpla prezenta a id-ului.
   *
   * `last_pickup_id` se goleste EXCLUSIV la anulare, deci un comerciant care a chemat
   * curierul o data, soferul a venit si ziua a trecut, ramanea cu un id mort in config
   * si nu mai putea deconecta NICIODATA. Mai rau: butonul „Anuleaza ridicarea existenta"
   * din modal se randeaza doar sub `hasActivePickup`, adica tocmai pentru o zi viitoare,
   * deci pentru una trecuta nu exista nicio cale de a scoate id-ul.
   *
   * ⚠ Ziua se ia cu `ziuaInRomania()`, nu cu `new Date()`: serverul ruleaza pe UTC, iar
   * seara tarziu ar socoti alta zi decat ecranul.
   */
  const ziuaRidicarii = (configVechi?.last_pickup_date ?? "").trim();
  if (configVechi?.last_pickup_id && ziuaRidicarii >= ziuaInRomania()) {
    opriri.push(`o ridicare programata pentru ${ziuaRidicarii}`);
  }
  if (opriri.length > 0) {
    return {
      error:
        `Nu poti deconecta FAN Courier cat timp ${opriri.join(" si ")}. `
        + "Anuleaza ridicarea din fereastra „Cheama curierul”, iar AWB-urile ramase scoate-le "
        + "cu „Detaseaza AWB” din fereastra de editare a comenzii. Dupa deconectare nu s-ar mai "
        + "putea nici anula, nici tipari.",
    };
  }

  const { data: randuri, error } = await supabase.from("store_settings").update({
    fan_courier_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId).select("business_id");

  if (error) return { error: error.message };
  /*
   * ⚠ SI RANDURILE, nu doar eroarea. Asta e butonul de REVOCARE a credentialelor:
   * un „succes" peste zero randuri modificate i-ar spune omului ca parola nu mai
   * e la noi, cand ea e in continuare in baza. Aici esecul CHIAR se intoarce ca
   * eroare, spre deosebire de scrierile de dupa un efect extern.
   */
  if (!randuri || randuri.length === 0) {
    await logError({
      action: "fancourier.disconnect",
      message: "Deconectarea FAN Courier nu a modificat niciun rand: credentialele au ramas in baza.",
      details: { businessId }, businessId, severity: "critical",
    });
    return { error: "Deconectarea nu s-a aplicat. Reincarca pagina si incearca din nou." };
  }
  return { success: true };
}

export async function loadFanCourierAccountAction(
  businessId: string,
  username: string,
  password: string,
): Promise<{ branches: FanCourierBranch[] } | { error: string }> {
  const parola = await secretDinConfig(businessId, "fan_courier_config", "password", password);
  if (!parola) return { error: "Completeaza parola selfAWB." };
  return loadFanCourierAccount(username, parola);
}

// ─── AWB actions ──────────────────────────────────────────────────────────────

async function getConfigAndOrder(businessId: string, orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  // Configul se citeste cu service role: vederea public.store_settings nu mai
  // decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola
  // selfAWB ar veni `enc.v1.…` si FAN ar respinge orice AWB. Service role
  // OCOLESTE RLS — de aceea proprietatea magazinului se verifica mai sus.
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings")
      .select("fan_courier_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "FAN Courier nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createFanCourierAwbAction(
  businessId: string,
  orderId: string,
  input: FanCourierAwbInput,
): Promise<{ awbNumber: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };

  /* ⚠ POARTA E PRIMA, INAINTE de orice apel la curier: un refuz de dupa emitere ar fi un
     colet deja platit si o eticheta deja tiparita. Vezi `src/lib/orders/poarta-awb.ts`. */
  const refuzAwb = await poartaAwbPropriu(businessId, orderId, "fancourier");
  if (refuzAwb) return { error: refuzAwb };

  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { fan_courier_awb_number?: string | null };
  if (orderData.fan_courier_awb_number) return { error: "AWB FAN Courier a fost deja creat" };

  /*
   * ⚠ `intern-awb` E PENTRU ROMANIA, si nimeni nu verifica asta.
   *
   * Endpoint-ul se numeste chiar asa, iar exportul are alt drum la FAN
   * (`extern-awb`, cu `deliveryMode` si `contentType`), pe care platforma nu il
   * foloseste deloc. O comanda cu adresa in alta tara pleca totusi pe ruta
   * interna: judetul si localitatea straine nu se gasesc in nomenclatorul lor,
   * deci fie FAN refuza cu un mesaj criptic, fie, mai rau, potriveste ceva si
   * coletul pleaca in Romania, catre o adresa care seamana.
   *
   * Se refuza aici, cu numele tarii in mesaj, nu cu „localitate invalida".
   */
  /*
   * ⚠ TIPUL PUNCTULUI SE INGUSTEAZA AICI, FIINDCA VINE DIN BROWSER.
   *
   * `createFanCourierAwbAction` primeste `FanCourierAwbInput` de-a dreptul de la client
   * (fereastra din panou il construieste), iar tipurile TypeScript nu sunt o validare la
   * rulare: un `pickupPointType` inventat ar ajunge nefiltrat pana la numele serviciului
   * trimis catre FAN. Acelasi rationament ca la `retea` in `getLockers`.
   *
   * Un tip nerecunoscut NU se corecteaza tacut la „fanbox": ar insemna un colet plecat in
   * alta retea decat cea aleasa. Se refuza.
   */
  if (input.pickupPointType !== undefined && tipPunctFan(input.pickupPointType) === null) {
    return { error: "FAN Courier: tipul punctului de ridicare nu e recunoscut (FANbox, PayPoint sau oficiu)." };
  }

  /*
   * ⚠ VALOAREA ASIGURATA SE CALCULEAZA PE SERVER, nu se ia din browser.
   *
   * Vine din SUBTOTALUL marfii, nu din total: transportul si taxa de ramburs n-au ce cauta
   * intr-o despagubire. Si doar cand comerciantul a cerut asigurare; altfel `undefined`, adica
   * exact purtarea de pana azi.
   *
   * ⚠ Nu se accepta de la apelant nici daca ar trimite-o: e un camp de BANI care schimba ce
   * factureaza curierul, iar fereastra din panou ruleaza in browserul comerciantului. Aceeasi
   * hotarare ca la Cargus (`cargus.actions.ts:164`).
   */
  const inputImbogatit: FanCourierAwbInput = {
    ...input,
    declaredValue: config.declared_value_enabled ? (Number(order.subtotal) || undefined) : undefined,
  };

  const adresa = (orderData.shipping_address ?? {}) as { country?: string | null };
  const tara = (adresa.country ?? "RO").trim().toUpperCase();
  if (tara && tara !== "RO" && tara !== "ROU" && tara !== "ROMANIA" && tara !== "ROMÂNIA") {
    return {
      error: `FAN Courier emite din platforma doar expedieri interne, iar comanda are adresa in ${tara}. `
        + "Foloseste un curier cu livrare internationala (DHL, FedEx, UPS, DPD, Packeta).",
    };
  }

  /*
   * ⚠ FAN e, impreuna cu Woot, curierul cel mai expus: nu trimitem nicio referinta
   * a noastra in payloadul `intern-awb`, deci un AWB creat si nesalvat local ramane
   * complet ANONIM la ei — nu poate fi nici gasit, nici legat inapoi. Registrul
   * local e singurul strat care poate opri a doua apasare.
   *
   * In plus, `fanFetch` reincearca AUTOMAT orice cerere pe 401, inclusiv POST-ul de
   * creare: daca FAN raspunde 401 dupa ce a inregistrat AWB-ul, un singur apel poate
   * produce DOUA. Rezervarea nu opreste asta (e in interiorul aceluiasi apel), dar
   * macar a doua APASARE nu mai adauga o a treia.
   */
  const r = await cuRegistru(
    createAdminClient(),
    { businessId, orderId, fel: "awb", furnizor: "fancourier", cheie: cheieOperatie("awb", "fancourier", orderId) },
    async () => {
      const creata = await createFanCourierAwb(config, inputImbogatit);
      /*
       * ⚠ IN `detalii`, NU IN `valoare`.
       *
       * Registrul pastreaza DOAR `referinta` si `detalii` (`registru.ts:307`), iar
       * varianta `deja` a rezultatului nici macar nu are camp `valoare` (`:142`).
       * Comentariul de dinainte promitea ca tariful si sucursala „calatoresc in
       * `valoare`, ca sa fie regasite pe ramura `deja`", si exact acolo se pierdeau.
       * FAN era singurul curier care nu seta `detalii`; Packeta si Cargus il seteaza de mult.
       */
      return {
        referinta: creata.awbNumber,
        detalii: {
          clientId: config.client_id, tariff: creata.tariff, vat: creata.vat,
        } as unknown as import("@/types/database.types").Json,
        valoare: creata,
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, si nu din uitare.
     *
     * Aici statea `async () => !!orderData.<coloana>` — dar `orderData` se
     * citeste INAINTE, iar mai sus exista un `return` care opreste totul daca
     * numarul exista deja. Deci in clipa apelului predicatul era garantat fals:
     * literalmente `async () => false`.
     *
     * Iar `false` pe ramura `deja` inseamna „elibereaza slotul si REIA", adica
     * inca un apel la curier. Si `deja` apare exact in cazul pentru care exista
     * registrul: AWB creat, scrierea pe comanda pierduta. Adica paza se
     * transforma tocmai acolo in AL DOILEA COLET REAL, FACTURAT.
     *
     * Fara callback, `deja` ADOPTA referinta din registru si o scrie inapoi pe
     * comanda — ce face codul de mai jos oricum.
     *
     * ⚠ Schimbul, pe fata: cazul prost devine o comanda care poarta un AWB
     * anulat (vizibil, si deja strigat in `/admin/logs` de `marcheazaAnulata`
     * cand eliberarea pica), in loc de un colet platit de doua ori.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  const creata = r.fel === "facut" ? r.valoare : null;
  const awbNumber = creata ? creata.awbNumber : (r.referinta ?? "");

  /*
   * ⚠ PE RAMURA `deja`, CONTEXTUL SE CITESTE DIN REGISTRU.
   *
   * `deja` apare exact in cazul pentru care exista registrul: AWB creat la FAN, scrierea
   * pe comanda pierduta. Pana acum, la reluare se scria sucursala DE ACUM. Daca intre
   * timp comerciantul si-a mutat punctul de lucru in Setari, comanda ramanea pironita cu
   * sucursala GRESITA, iar `configPentruAwbEmis` trimitea apoi anularea si eticheta pe
   * contul pe care FAN il refuza. Cu fotografia din registru, reluarea spune adevarul.
   *
   * ⚠ `Number(...)`: `client_id` din configurare e „o promisiune, nu o garantie" (vezi
   * `fancourier.ts`), iar prin `detalii` trece ca `Json`, deci un sir ar ajunge intr-o
   * coloana `bigint`.
   */
  const context = contextulAwbEmis({
    creata,
    clientIdCurent: config.client_id,
    dinRegistru: r.fel === "deja" ? r.detalii : null,
  });

  /*
   * ⚠ SI SUCURSALA, SI COSTUL, in aceeasi scriere.
   *
   * `fan_courier_awb_client_id` e fotografia contextului: anularea si eticheta
   * o folosesc pe ea, nu configurarea de acum, deci o schimbare de sucursala nu
   * mai lasa AWB-urile vechi de negasit. `fan_courier_cost`/`_vat` sunt singura
   * urma a ce a costat coletul cu adevarat; fara ele nicio subcotare nu se vede.
   *
   * Pe ramura `deja` valorile vin din registru; raman `null` doar cand nici registrul
   * nu le are (randuri scrise inainte de reparatia asta). Nu se inventeaza nimic.
   *
   * ⚠ TOATE TREI SE SCRIU NECONDITIONAT, cu valoarea rezolvata, chiar cand e `null`.
   * Sub un spread conditionat, un `update` care omite cheia nu scrie `null`, ci LASA ce
   * era pe rand: o comanda dezlegata si reexpediata ar fi pastrat sucursala si banii
   * AWB-ului ANTERIOR, iar anularea celui nou ar fi plecat pe contul celui vechi.
   */
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    fan_courier_awb_number: awbNumber,
    fan_courier_awb_client_id: context.clientId,
    fan_courier_cost: context.tariff,
    fan_courier_vat: context.vat,
    /*
     * ⚠ CLIPA EMITERII, si fara ea urmarirea n-ar porni niciodata (13.09.2026).
     *
     * Cronul de urmarire cere starile doar pentru AWB-urile din ultimele saptamani, iar
     * fereastra se masoara de aici. Lasata `null`, coloana ar fi ajuns intr-un filtru care
     * n-ar fi potrivit nimic, si cronul ar fi rulat cuminte fara sa intrebe de nimeni.
     *
     * ⚠ E momentul in care AWB-ul ajunge PE COMANDA, nu neaparat cel in care l-a creat FAN:
     * pe ramura `deja` a registrului, numarul vine dintr-o incercare anterioara. Diferenta e
     * de secunde si nu conteaza pentru o fereastra de saptamani, dar coloana asta nu e o
     * marturie despre FAN, ci despre noi.
     */
    fan_courier_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    /* ⚠ SI PE MAGAZIN, ca la anulare: fara filtru, „zero randuri" ar putea
       insemna si „alta comanda", nu doar „scriere pierduta", iar alarma critica
       de mai jos ar fi ambigua exact acolo unde trebuie citita. */
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "fancourier.createAwb",
      message: `AWB FAN Courier creat (${awbNumber}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return { awbNumber };
}

// ─── Pickup (courier order) actions ──────────────────────────────────────────

async function getOwnedFanConfig(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  // Service role, ca in getConfigAndOrder: parola selfAWB pleaca la FAN, iar
  // clientul utilizatorului o primeste cifrata. Proprietatea magazinului e
  // verificata chiar deasupra, fiindca service role sare peste RLS.
  // Configul asta se scrie mai jos la loc (last_pickup_*) cu parola in clar in
  // el — corect: declansatorul de pe vedere o cripteaza inapoi la scriere.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("fan_courier_config").eq("business_id", businessId).single();

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "FAN Courier nu este configurat complet" as const };
  }
  return { supabase, config };
}

export async function createFanCourierPickupAction(
  businessId: string,
  input: FanCourierPickupInput,
): Promise<{ orderId: string } | { error: string }> {
  const ctx = await getOwnedFanConfig(businessId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config } = ctx;

  /*
   * ⚠ CONFIGUL TINE O SINGURA RIDICARE, deci serverul refuza a doua.
   *
   * `last_pickup_date`/`last_pickup_id` sunt o pereche, nu o lista. O a doua ridicare
   * pentru ALTA zi suprascrie id-ul primei, iar prima nu se mai poate anula din panou
   * niciodata: `cancelFanCourierPickupAction` n-are decat id-ul din config. Modalul doar
   * AVERTIZA (`hasActivePickup`), butonul ramanea apasabil, si pe server nu era nimic.
   *
   * ⚠ `>` STRICT, si aceeasi zi e lasata sa treaca: „seara zilei de ridicare programez
   * pentru maine" e o miscare legitima si obisnuita, iar o a doua apasare pe ACEEASI zi
   * e duplicat curat, pe care registrul il prinde oricum prin cheie.
   *
   * ⚠ Ziua se ia cu `ziuaInRomania()`: pe server `new Date()` e UTC, si seara tarziu ar
   * socoti alta zi decat ecranul comerciantului.
   */
  const ziuaRezervata = (config.last_pickup_date ?? "").trim();
  if (config.last_pickup_id && ziuaRezervata > ziuaInRomania() && ziuaRezervata !== input.pickupDate) {
    return {
      error:
        `Ai deja o ridicare programata pentru ${ziuaRezervata} (comanda #${config.last_pickup_id}). `
        + "Panoul tine minte o singura ridicare, deci anuleaz-o intai: altfel a doua nu ar mai putea "
        + "fi anulata de aici.",
    };
  }

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId: null,
      fel: "ridicare",
      furnizor: "fancourier",
      /*
       * ⚠ CHEIA E ZIUA, SI ATAT: nu mai larga decat memoria.
       *
       * A avut o vreme si sucursala in ea, ca sa poata exista doua ridicari in aceeasi
       * zi la doua puncte de lucru. Dar configul tine o SINGURA pereche
       * `last_pickup_date`/`last_pickup_id`: cu cheia larga, a doua ridicare chiar pleca
       * la FAN, iar id-ul primei se pierdea la scriere, deci prima ramanea vie la ei si
       * nedetectabila din platforma. O identitate mai larga decat evidenta nu apara nimic,
       * doar muta paguba dintr-un refuz suparator intr-o pierdere tacuta.
       *
       * ⚠ Se schimba in AMANDOUA locurile deodata (aici si la anulare): cu una singura
       * schimbata, anularea n-ar mai nimeri randul, si ziua ar ramane blocata definitiv.
       */
      cheie: cheieOperatie("ridicare", "fancourier", input.pickupDate),
    },
    async () => {
      const idRidicare = await createFanCourierPickupOrder(config, input);
      /*
       * `createFanCourierPickupOrder` intoarce deliberat sir GOL cand raspunsul e
       * 2xx dar fara id („an error-free 2xx counts as accepted even without one").
       * Inchis ca `reusit` cu referinta goala, randul ar fi blocat ziua definitiv:
       * anularea raspunde „nu exista o ridicare care sa poata fi anulata" (n-are
       * `last_pickup_id`), deci nici slotul nu s-ar mai putea elibera vreodata.
       * Ridicarea EXISTA la FAN, doar ca nu-i stim numarul — adica fix „nu stim".
       */
      if (!idRidicare) {
        throw eroareNesigura("FAN Courier a acceptat ridicarea dar nu a returnat id-ul ei. Verifica in contul FAN inainte de a programa alta pe aceeasi zi.");
      }
      return { referinta: String(idRidicare), valoare: { orderId: idRidicare } };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  const idRidicare = r.fel === "facut" ? r.valoare.orderId : (r.referinta ?? "");

  // Remember the last pickup so the UI can warn about duplicates / allow cancel.
  /*
   * ⚠ SI RANDURILE, ca la fratii ei.
   *
   * Era singura scriere de dupa un efect extern care se uita DOAR la `error`.
   * Un update care nu prinde niciun rand nu e eroare in PostgREST: ridicarea
   * exista la FAN, `last_pickup_id` nu se scrie nicaieri, iar anularea raspunde
   * apoi „nu exista o ridicare programata care sa poata fi anulata". Soferul vine,
   * comerciantul nu stie de ce nu poate anula, si nimeni nu afla nimic.
   */
  /*
   * ⚠ PETIC, NU CONFIGUL INTREG.
   *
   * Aici statea `{ ...config, last_pickup_* }`, adica intreaga configurare
   * rescrisa dintr-o copie citita cu secunde inainte, cu apelul catre FAN la
   * mijloc. O salvare facuta intre timp din ecranul de setari (alta sucursala,
   * ePOD bifat, parola rotita) era stearsa fara ca nimeni sa afle. Si invers:
   * o salvare concurenta stergea ridicarea.
   *
   * `jsonb_merge_config` imbina IN Postgres, pe randul incuiat, deci se scriu
   * doar cele doua campuri atinse. Aceeasi unealta ca la eMAG, OLX si Pepita.
   */
  const { error: eScriere } = await createAdminClient().rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "fan_courier_config",
    p_patch: {
      last_pickup_date: input.pickupDate,
      last_pickup_id: idRidicare || null,
      /* ⚠ SI SUCURSALA CU CARE S-A CERUT, ca anularea sa plece pe contul care a cerut-o,
         nu pe cel din configurarea de atunci. Aceeasi fotografie ca `fan_courier_awb_client_id`. */
      last_pickup_client_id: config.client_id,
    } as never,
  });

  if (eScriere) {
    await logError({
      action: "fancourier.pickup",
      message: `Ridicare FAN ceruta (${idRidicare || "fara id"}), dar configul NU s-a actualizat: ${eScriere.message}. Ridicarea nu va putea fi anulata din panou.`,
      details: { businessId, pickupDate: input.pickupDate },
      businessId,
      severity: "critical",
    });
  }

  return { orderId: idRidicare };
}

export async function cancelFanCourierPickupAction(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getOwnedFanConfig(businessId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config } = ctx;

  if (!config.last_pickup_id) {
    return { error: "Nu exista o ridicare programata din platforma care sa poata fi anulata." };
  }

  // Ziua pe care o elibereaza anularea trebuie citita INAINTE ca `last_pickup_date`
  // sa fie golit: ea e chiar discriminantul cheii din registru.
  const ziuaAnulata = config.last_pickup_date;
  /*
   * ⚠ SUCURSALA CU CARE S-A CERUT RIDICAREA, nu cea din configurarea de acum.
   *
   * `??` nu e decorativ: o ridicare programata inainte de reparatia asta n-are campul,
   * si acolo sucursala curenta e singura presupunere, adica exact purtarea de pana azi.
   */
  const sucursalaRidicarii = config.last_pickup_client_id ?? config.client_id;

  try {
    await deleteFanCourierPickupOrder(
      configPentruAwbEmis(config, sucursalaRidicarii), config.last_pickup_id);

    /*
     * ⚠ Tot petic. `null` pe o cale NEsecreta scoate cheia din configurare (vezi
     * `2027-01-06-null-pe-un-secret-inseamna-sterge.sql`); `password` e singurul
     * camp secret al lui `fan_courier_config`, si nu e atins aici.
     */
    const { error: eRidicare } = await createAdminClient().rpc("jsonb_merge_config", {
      p_business_id: businessId,
      p_column: "fan_courier_config",
      p_patch: { last_pickup_date: null, last_pickup_id: null, last_pickup_client_id: null } as never,
    });

    /*
     * Acelasi tipar ca la AWB-uri: ridicarea e deja stearsa la FAN, deci esecul
     * scrierii nu se intoarce ca eroare — dar nici nu are voie sa treaca tacut.
     * Fara semnal, configul ar pastra un `last_pickup_id` mort, iar interfata i-ar
     * arata comerciantului o ridicare programata care nu mai exista.
     */
    if (eRidicare) {
      await logError({
        action: "fancourier.deletePickup",
        message: `Ridicarea FAN ${config.last_pickup_id} a fost stearsa la curier, dar configul NU s-a actualizat: ${eRidicare.message}`,
        details: { businessId, pickupId: config.last_pickup_id, code: eRidicare?.code },
        businessId, severity: "critical",
      });
    }

    /*
     * Fara eliberare, reprogramarea pe ACEEASI zi ar fi primit `deja` si ar fi scris
     * inapoi id-ul ridicarii STERSE — adica exact invierea pe care registrul o
     * inchide in alte parti. Interfata chiar la asta indeamna: anulezi si programezi
     * din nou, de obicei tot pentru azi.
     */
    if (ziuaAnulata) {
      const eliberat = await marcheazaAnulata(
        createAdminClient(), businessId,
        cheieOperatie("ridicare", "fancourier", ziuaAnulata));
      if (!eliberat) {
        await logError({
          action: "fancourier.cancelPickup",
          /* ⚠ Efectul ADEVARAT, masurat: `rezerva_operatie_externa` intoarce `motiv='reusit'`
             pentru un rand ramas asa, iar `registru.ts` il traduce in `{ fel: "deja" }`, NU in
             „blocat". Deci reprogramarea pe aceeasi zi nu e refuzata: ea NU cheama FAN deloc,
             adopta id-ul ridicarii ANULATE si raspunde ca si cum ar fi programat. Soferul nu
             vine, si nimeni nu afla. Textul de dinainte spunea pe dos. */
          message: `Ridicare FAN anulata pentru ${ziuaAnulata}, dar slotul din registru NU s-a eliberat. O reprogramare pe aceeasi zi va adopta TACUT id-ul ridicarii anulate, fara sa cheme FAN: randul trebuie inchis din /api/admin/operatii.`,
          details: { businessId, ziuaAnulata },
          businessId,
          severity: "critical",
        });
      }
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Dezlegarea AWB-ului (cand curierul refuza anularea) ─────────────────────

/**
 * Scoate AWB-ul de pe comanda dupa ce a incercat sa-l anuleze la FAN.
 *
 * ⚠ DE CE E NEVOIE, DESI FAN ARE ENDPOINT DE ANULARE.
 *
 * Anularea la FAN merge doar pana in clipa in care coletul e preluat, chiar asa
 * scrie si pe ecranul nostru. Dupa aceea DELETE-ul raspunde constant „nu", iar
 * `deleteFanCourierAwbAction` intoarce eroare de fiecare data. Numarul ramanea
 * atunci lipit de comanda PENTRU TOTDEAUNA, si odata cu el:
 *   - comanda nu se mai putea edita (`updateOrderDetails` refuza cat timp poarta AWB);
 *   - nu se mai putea emite alt AWB, nici la FAN, nici la alt curier;
 *   - slotul din registru ramanea ocupat.
 * Adica o comanda inghetata de o eticheta care si-a facut deja treaba. Acelasi
 * leac ca la Colete Online, Posta, Packeta si DHL.
 *
 * ⚠ SI DEOSEBIREA CARE CONTEAZA, fata de DHL: aici NU se dezleaga la orice esec.
 *
 *   FAN a REFUZAT (`esuat`)      -> stim ca AWB-ul traieste la ei -> se dezleaga,
 *                                   si mesajul spune ca ramane de rezolvat acolo.
 *   NU STIM (`necunoscut`)       -> se OPRESTE. O dezlegare aici ar sterge singura
 *                                   urma a unui AWB care poate tocmai s-a anulat,
 *                                   sau poate nu; comanda ar primi alt curier si ar
 *                                   putea pleca de doua ori.
 *
 * ⚠ NU trece prin `getConfigAndOrder`, si asta e o hotarare, aceeasi ca la DHL,
 * Posta si Packeta: acela cere integrarea configurata COMPLET, deci un comerciant
 * care tocmai a deconectat FAN sau caruia FAN i-a rotit parola ar fi primit „nu e
 * configurat complet" si n-ar mai fi putut scoate niciodata numarul de pe comanda.
 * Fundatura produsa chiar de actiunea gandita sa scoata din fundaturi.
 */
export async function dezleagaFanAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; mesaj: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const admin = createAdminClient();
  const [{ data: order }, { data: setari }] = await Promise.all([
    admin.from("orders").select("id, fan_courier_awb_number, fan_courier_awb_client_id, tracking_number")
      .eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("fan_courier_config").eq("business_id", businessId).maybeSingle(),
  ]);
  if (!order) return { error: "Comanda negasita" };
  const awb = (order.fan_courier_awb_number ?? "").trim();
  if (!awb) return { error: "Comanda nu are AWB FAN Courier." };

  // ─── (a) Se incearca anularea la FAN, cat timp mai avem cu ce ──────────────
  const config = setari?.fan_courier_config as FanCourierConfig | null;
  const potIncerca = !!(config?.enabled && config.username && config.password && config.client_id);

  let despreCurier: string;
  /*
   * ⚠ DISCRIMINANTUL: a incetat coletul sa existe la FAN, sau ramane viu?
   *
   * Numai cand anularea a REUSIT nu mai e nimic de facturat. Pe celelalte doua iesiri,
   * refuzul dovedit si „nici n-am avut cu ce cere", coletul pleaca si va aparea pe factura
   * lunara: atunci tariful, TVA-ul si sucursala sunt singura urma care leaga factura de
   * comanda, si tocmai ele se stergeau.
   */
  let anulatLaFan = false;
  if (!potIncerca) {
    despreCurier = "Integrarea FAN nu mai e configurata, deci anularea nu s-a putut cere.";
  } else {
    try {
      await deleteFanCourierAwb(configPentruAwbEmis(config!, order.fan_courier_awb_client_id), awb);
      anulatLaFan = true;
      despreCurier = `AWB-ul ${awb} a fost anulat la FAN.`;
    } catch (e) {
      if (verdictFurnizor(e) === "necunoscut") {
        return {
          error:
            `Nu stim daca AWB-ul ${awb} s-a anulat la FAN: ${(e as Error).message} `
            + "Verifica in contul selfAWB si incearca din nou. Numarul NU a fost scos de pe comanda, "
            + "ca sa nu ramana un colet in aer despre care nimeni nu mai stie.",
        };
      }
      despreCurier = `FAN a refuzat anularea (${(e as Error).message}), deci AWB-ul ${awb} ramane viu la ei.`;
    }
  }

  // ─── (b) Dezlegarea locala, care se face si dupa un refuz dovedit ─────────
  const { data: randuri, error } = await admin.from("orders").update({
    /* ⚠ Regula sta in `campuriDezlegareFan`, ca sa poata fi PROBATA: aici e „use server",
       deci un test ar fi avut nevoie de module mockuite. Vezi nota de acolo. */
    ...campuriDezlegareFan(anulatLaFan, order.tracking_number === awb),
    updated_at: new Date().toISOString(),
    /* ⚠ SI PE AWB-UL CITIT, ca la sora ei de la anulare: intre citire si scriere sta un apel
       la FAN, iar daca in rastimp comanda a primit ALT numar, dintr-o reemitere pornita in
       alta fila, un update nefiltrat l-ar fi sters pe cel NOU, pe care nu l-a anulat nimeni. */
  }).eq("id", orderId).eq("business_id", businessId)
    .eq("fan_courier_awb_number", awb)
    .select("id");

  if (error || !randuri || randuri.length === 0) {
    return {
      error: `${despreCurier} Dar numarul nu s-a putut scoate de pe comanda, `
        + "sau intre timp comanda a primit alt AWB. Reincarca pagina si verifica.",
    };
  }

  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "fancourier", orderId));
  if (!eliberat) {
    await logError({
      action: "fancourier.dezleaga",
      message: "AWB FAN dezlegat, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
      details: { orderId, businessId, awb },
      businessId, severity: "critical",
    });
  }

  return {
    success: true,
    mesaj: `${despreCurier} Numarul a fost scos de pe comanda, care poate fi acum editata sau expediata cu alt curier.`,
  };
}

export async function deleteFanCourierAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    fan_courier_awb_number?: string | null;
    fan_courier_awb_client_id?: number | null;
  };
  if (!orderData.fan_courier_awb_number) return { error: "Nu exista AWB FAN Courier pentru aceasta comanda" };

  try {
    // Pe sucursala CU CARE S-A EMIS, nu pe cea din configurarea de acum.
    await deleteFanCourierAwb(
      configPentruAwbEmis(config, orderData.fan_courier_awb_client_id),
      orderData.fan_courier_awb_number,
    );

    /*
     * ⚠ SI PE AWB-UL CITIT, nu doar pe comanda.
     *
     * Intre citire si scriere pot trece secunde: apelul catre FAN sta la mijloc.
     * Daca in rastimp comanda a primit ALT numar, o reemitere dintr-o alta fila,
     * dupa ce prima anulare parea cazuta, un `update` nefiltrat ar fi sters
     * numarul CEL NOU, pe care nu l-a anulat nimeni. Coletul acela ar fi ramas viu
     * la FAN, fara nicio urma in Edinio.
     *
     * Zero randuri modificate inseamna acum si „intre timp s-a schimbat", nu doar
     * „scriere pierduta", si de aceea alarma de mai jos spune ce numar astepta.
     */
    const { data: randuri, error: eScriere } = await supabase.from("orders").update({
      fan_courier_awb_number: null,
      fan_courier_awb_client_id: null,
      fan_courier_cost: null,
      fan_courier_vat: null,
      /*
       * ⚠ SI URMA URMARIRII, nu doar numarul (13.09.2026).
       *
       * Lasate in urma, cele trei ar fi descris un colet care nu mai e al comenzii: pagina
       * ar fi aratat o stare veche pe o comanda fara AWB, iar o reemitere ar fi pornit cu
       * `status_code`-ul celui anulat, deci pana la prima verificare comanda ar fi parut
       * deja livrata. Se sterg impreuna cu numarul, din acelasi `update`.
       */
      fan_courier_awb_at: null,
      fan_courier_status_code: null,
      fan_courier_status_checked_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId)
      .eq("fan_courier_awb_number", orderData.fan_courier_awb_number)
      .select("id");
    /*
     * Scrierea locala se VERIFICA, dar esecul ei NU devine eroare catre om.
     *
     * AWB-ul e deja ANULAT la curier. Un „Eroare la actualizare" l-ar trimite pe
     * comerciant sa apese din nou, iar a doua anulare cade la curier cu „AWB
     * inexistent" si arata ca un sistem stricat. Deci se raporteaza succes si se
     * striga in `/admin/logs`: acolo ramane singura dovada ca o comanda mai poarta
     * un numar de transport care nu mai exista.
     *
     * `.eq("business_id")` nu e decorativ: fara el, zero randuri ar putea insemna
     * si „alta comanda", nu doar „scriere pierduta", si alarma ar fi ambigua.
     */
    if (eScriere || !randuri || randuri.length === 0) {
      await logError({
        action: "fancourier.deleteAwb",
        message: `AWB FAN Courier ${orderData.fan_courier_awb_number} a fost anulat la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, awb: orderData.fan_courier_awb_number, code: eScriere?.code },
        businessId, severity: "critical",
      });
    }

    // Fara eliberare, emiterea urmatoare ar adopta chiar AWB-ul sters.
    const eliberat = await marcheazaAnulata(createAdminClient(), businessId, cheieOperatie("awb", "fancourier", orderId));
    if (!eliberat) {
      await logError({
        action: "fancourier.deleteAwb",
        message: "AWB FAN Courier sters, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, awb: orderData.fan_courier_awb_number },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
