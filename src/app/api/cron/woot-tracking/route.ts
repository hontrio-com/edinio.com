import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { getOrderHistory, getWootToken, type WootConfig } from "@/lib/woot";
import {
  eStareFinalaWoot, eStareNecunoscutaWoot, esteReturWoot, statusUrmatorWoot, trebuieSemnalatWoot,
  ultimulEvenimentWoot, type StareWoot,
} from "@/lib/shipping/statusuri-woot";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import { scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import {
  proprietariiMagazinelor, semnaleazaExpedierea, stareaSaSchimbat,
} from "@/lib/orders/semnalarea-ajunge-la-om";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor Woot.
 *
 * ═══ ⚠ CE S-A DESCHIS (15.09.2026) ═══
 *
 * Woot duce 96% din expedierile platformei (172 AWB reusite; DPD 3, Sameday 1, ceilalti
 * paisprezece ZERO) si era SINGURUL curier cu trafic adevarat pe care nu-l intreba nimeni
 * niciodata nimic dupa emitere. Paisprezece cronuri de urmarire, si niciunul pentru el: chiar
 * pentru curieri care n-au emis in viata lor niciun AWB. Comerciantul afla de un retur cand
 * coletul ajungea inapoi.
 *
 * ═══ ⚠⚠ CE FACE, SI MAI ALES CE NU FACE ═══
 *
 * INREGISTREAZA. Nu muta starea comenzii si nu declanseaza facturarea automata, spre deosebire
 * de toti ceilalti. Si nu e o scurtatura, e singura purtare onesta azi: in specificatia lor
 * (22 de cai) NU exista nicio enumerare a starilor unei comenzi, iar din exemplele lor se vede
 * doar capatul de jos (1 „Comanda primita", 2 „AWB generat", 3 „Ridicat de curier"). Care numar
 * inseamna „livrat" nu se stie de nicaieri, iar ghicit ar emite facturi pe comenzi nelivrate.
 * Motivul intreg si drumul catre harta stau in `@/lib/shipping/statusuri-woot`.
 *
 * Ce castiga comerciantul de azi: eticheta LOR, in romana, pe comanda, langa AWB. Ce castiga
 * platforma: perechile (numar, eticheta) din expedieri adevarate, din care harta se va citi
 * masurata, nu presupusa.
 *
 * ═══ ⚠ UN APEL PE EXPEDIERE, deci bugetul e adevaratul plafon ═══
 *
 * `history` e per comanda: nu exista forma de lot, cum are FAN. De aceea plafonul pe rulare e
 * mic si exista SI un buget de timp: o rulare taiata de platforma la jumatate ar lasa comenzile
 * neatinse fara marcaj, iar ele ies oricum primele la rularea urmatoare, prin rotatie.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la Sameday, GLS si Posta: emailul pleaca DOAR din `updateOrder`, care e
 * legat de plafoanele de instiintare ale contului. Un cron n-are utilizator, deci le-ar ocoli.
 */

export const maxDuration = 60;

/** Cat de departe in urma se mai intreaba. Un colet mai vechi de atat nu se mai misca. */
const ZILE = 21;

/**
 * ⚠ Plafonul pe rulare nu e decorativ: sunt N apeluri HTTP catre ei, unul pe expediere.
 *
 * Cu rotatia dupa `woot_status_checked_at` (cele neintrebate de cel mai mult timp ies primele),
 * plafonul nu lasa niciodata aceleasi comenzi pe dinafara.
 */
const MAX_COMENZI = 120;

/** Sub `maxDuration`, cu loc de scriere la final. */
const BUGET_MS = 50_000;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  created_at: string | null;
  woot_order_id: string | null;
  woot_awb_at: string | null;
  woot_status_id: number | null;
  woot_status_checked_at: string | null;
};

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const inceput = Date.now();
  const since = new Date(inceput - ZILE * 86400000).toISOString();

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select(
      "id, business_id, status, order_number, payment_status, created_at,"
      + " woot_order_id, woot_awb_at, woot_status_id, woot_status_checked_at",
    )
    /* ⚠ IDENTITATEA E `woot_order_id`, nu numarul AWB: el e cheia cu care se cere istoricul, se
       cere eticheta si se anuleaza, iar `woot_awb_number` chiar lipseste la platile cu cardul. */
    .not("woot_order_id", "is", null)
    .neq("woot_order_id", "")
    /* ⚠ Excluderea starilor incheiate NU e acoperita de filtrul de mai sus: o comanda livrata isi
       pastreaza identificatorul, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii. Pe `created_at`, o comanda veche
     * careia comerciantul ii emite AWB abia acum ar fi din start in afara ferestrei: n-ar fi
     * intrebata NICIODATA.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in `or(...)`: sintaxa
     * imbricata gresita NU da eroare, da LISTA GOALA, adica urmarirea ar muri complet raportand
     * vesel `ok: true`.
     */
    /*
     * ⚠ FEREASTRA INTREAGA, INTR-UN SINGUR LOC (15.09.2026, dupa prima rulare adevarata).
     *
     * Forma de dinainte avea doi termeni simpli, iar restul conditiei („fara ceas de emitere,
     * dar comanda e proaspata") statea in memorie, dupa citire. Masurat pe prima rulare: din
     * cele 120 de randuri cerute, doar DOUASPREZECE treceau de filtrul din memorie, fiindca
     * `woot_awb_at` e NULL pe toate expedierile dinainte de migratie, deci termenul
     * `is.null` lasa sa treaca si cele 111 comenzi vechi. Lotul se dilua, iar ordonarea dupa un
     * ceas care e NULL peste tot nu putea prefera pe nimeni.
     *
     * ⚠ SI DE CE E SIGUR SA FIE IMBRICAT, desi comentariul surorilor lui spune ca un `and(...)`
     * in `or(...)` scris gresit NU da eroare, ci LISTA GOALA: fiindca forma asta a fost
     * INCERCATA pe PostgREST-ul adevarat inainte de a fi scrisa aici. Intoarce 92 de randuri,
     * toate in fereastra, fata de 120 din care 12 erau bune. Cine o schimba, o incearca la fel.
     */
    .or(`woot_awb_at.gte.${since},and(woot_awb_at.is.null,created_at.gte.${since})`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("woot_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `comenzi` ar fi `null` si ramura urmatoare ar raspunde
   * `{ ok: true, verificate: 0 }`: o rulare sanatoasa la vedere, care n-a urmarit nimic.
   */
  if (eComenzi) {
    await logError({
      action: "woot-tracking",
      message: `expedierile Woot nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const toate = (comenzi ?? []) as unknown as Comanda[];
  /*
   * ⚠ ACELASI FILTRU, DAR ACUM E O PLASA, NU O PARTE A REGULII.
   *
   * De cand fereastra intreaga sta in interogare, randul asta n-ar trebui sa mai scoata NIMIC.
   * Ramane fiindca e ieftin si fiindca, daca cineva slabeste candva conditia de mai sus, expedierile
   * din afara ferestrei ar fi altfel intrebate in tacere. Diferenta se si NUMARA, mai jos.
   */
  const inFereastra = toate.filter((o) => o.woot_awb_at !== null || (o.created_at ?? "") >= since);
  if (inFereastra.length !== toate.length) {
    console.warn(
      `[woot-tracking] interogarea a adus ${toate.length} randuri, dar ${toate.length - inFereastra.length} `
      + "erau in afara ferestrei: conditia din interogare nu mai acopera tot.",
    );
  }
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, scrise: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  /* Cheile pleaca la furnizor, deci se citesc cu rol de SERVICIU: clientul comerciantului le
     primeste cifrate si autentificarea Woot ar esua. Vezi `loadConfig` din `woot.actions.ts`. */
  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, woot_config").in("business_id", bizIds);

  /* Fara configuratii, TOATE expedierile ar fi sarite: zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "woot-tracking",
      message: `configuratiile Woot nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map<string, WootConfig>();
  for (const r of setari ?? []) {
    const c = r.woot_config as WootConfig | null;
    if (c?.enabled && c.public_key && c.secret_key) configuri.set(r.business_id, c);
  }

  /*
   * ⚠ TOKENUL SE IA O SINGURA DATA PE MAGAZIN, si esecul lui se tine minte.
   *
   * Fara harta asta, un magazin cu chei gresite ar fi cerut un token la FIECARE din cele 120 de
   * expedieri ale lui: o suta douazeci de autentificari picate intr-o rulare, la ei in jurnal si
   * in bugetul nostru de timp. `getWootToken` are cache in modul, dar el pastreaza doar
   * REUSITELE.
   */
  const tokenuri = new Map<string, string | null>();
  async function tokenul(businessId: string, config: WootConfig): Promise<string | null> {
    if (tokenuri.has(businessId)) return tokenuri.get(businessId) ?? null;
    try {
      const t = await getWootToken(config.public_key, config.secret_key);
      tokenuri.set(businessId, t);
      return t;
    } catch (e) {
      tokenuri.set(businessId, null);
      await logError({
        action: "woot-tracking",
        message: `autentificarea Woot a esuat, expedierile magazinului raman neurmarite: ${(e as Error).message}`,
        businessId,
        severity: "warning",
      });
      return null;
    }
  }

  /* ⚠ Proprietarii, o singura data pe rulare: fara `user_id` notificarea n-are unde sa mearga. */
  const proprietari = await proprietariiMagazinelor(admin, inFereastra.map((o) => o.business_id));

  let verificate = 0, scrise = 0, faraConfig = 0, esuate = 0, faraStare = 0, ramase = 0;
  let mutate = 0, semnalate = 0, incheiate = 0;
  /* ⚠ Numerele pe care harta nu le stie inca: se strang ca sa poata creste din trafic. */
  const necunoscute = new Set<string>();

  for (const o of inFereastra) {
    /*
     * ⚠ BUGETUL SE VERIFICA INAINTEA APELULUI, nu dupa. Cele ramase nu primesc marcaj, deci ies
     * primele la rularea urmatoare, prin chiar rotatia de mai sus.
     */
    if (Date.now() - inceput > BUGET_MS) { ramase++; continue; }

    const config = configuri.get(o.business_id);
    const marcaj = { woot_status_checked_at: new Date().toISOString() };

    /*
     * ⚠ FARA STARE NOUA, SE SCRIE DOAR MARCAJUL, NECONDITIONAT.
     *
     * Aici se ajunge de pe drumurile care nu afla nimic: magazin fara configurare, identificator
     * stricat, apel picat, istoric gol. Ele nu aduc nicio stare, deci n-au ce ateriza gresit pe
     * alta expediere, iar o conditie ar putea doar sa impiedice marcajul, adica sa infometeze
     * coada. `business_id` nu e filtru de prisos, e AUTORIZARE: cronul scrie cu rol de serviciu.
     */
    async function doarMarcajul() {
      await admin.from("orders").update(marcaj).eq("id", o.id).eq("business_id", o.business_id);
    }

    if (!config) {
      /* Magazinul si-a oprit integrarea, dar comenzile vechi isi pastreaza expedierea. */
      faraConfig++;
      await doarMarcajul();
      continue;
    }

    const token = await tokenul(o.business_id, config);
    if (!token) { esuate++; await doarMarcajul(); continue; }

    /* Identificatorul e text in baza, dar intreg la ei. Unul stricat nu se trimite nicaieri. */
    const wootId = Number((o.woot_order_id ?? "").trim());
    if (!Number.isInteger(wootId) || wootId <= 0) { esuate++; await doarMarcajul(); continue; }

    let stare: StareWoot | null;
    try {
      stare = ultimulEvenimentWoot(await getOrderHistory(token, wootId));
    } catch (e) {
      esuate++;
      console.error("[woot-tracking]", o.woot_order_id, (e as Error).message);
      await doarMarcajul();
      continue;
    }

    verificate++;

    /* Expedierea exista, dar n-are inca niciun eveniment: legitim, si nu e o eroare. */
    if (!stare || (stare.statusId === null && !stare.eticheta)) {
      faraStare++;
      await doarMarcajul();
      continue;
    }

    /*
     * ⚠ STAREA SE SCRIE PE EXPEDIEREA PE CARE AM CITIT-O.
     *
     * Intre citirea lotului si randul asta a trecut un apel la Woot, iar tura are pana la 120 de
     * comenzi. Daca intre timp comerciantul a anulat expedierea si a emis din nou, starea de aici
     * e a celei VECHI. Scrisa orbeste, ar arata comerciantului starea unui colet mort ca fiind a
     * celui viu. Vezi `scrieUrmarirea`.
     */
    const r = await scrieUrmarirea(admin, {
      orderId: o.id,
      businessId: o.business_id,
      identitate: { coloana: "woot_order_id", valoare: o.woot_order_id },
      stare: {
        woot_status_id: stare.statusId ?? o.woot_status_id,
        ...(stare.eticheta ? { woot_status_label: stare.eticheta } : {}),
      },
      marcaj,
      actiune: "woot-tracking",
      orderNumber: o.order_number,
    });
    if (r.scris) scrise++;

    /*
     * ═══ ⚠ DE AZI CRONUL SI HOTARASTE, NU DOAR INREGISTREAZA (15.09.2026) ═══
     *
     * Antetul acestui fisier spunea, pe buna dreptate, ca nu muta nimic: Woot nu publica nicaieri
     * ce inseamna numerele lui de stare. Ce s-a schimbat nu e documentatia lor, ci faptul ca avem
     * MASURATOARE: cronul insusi a strans perechile (numar, eticheta) de pe expedieri adevarate, si
     * `10` vine cu „Expedierea ta a fost livrata cu success". Harta, cu numarul de aparitii langa
     * fiecare cod, sta in `@/lib/shipping/statusuri-woot`.
     *
     * ⚠ CE NU E IN HARTA NU MISCA NIMIC: un numar nevazut inca lasa comanda pe loc si se NUMARA
     * mai jos, ca harta sa creasca din trafic, nu din presupuneri.
     *
     * ⚠ SI STAREA N-A ATERIZAT INSEAMNA CA NICI TRANZITIA N-ARE CE CAUTA: `r.scris` e fals cand
     * expedierea s-a schimbat sub noi, iar atunci starea citita e a coletului VECHI.
     */
    if (!r.scris) continue;

    if (eStareNecunoscutaWoot(stare.statusId)) {
      necunoscute.add(String(stare.statusId));
      continue;
    }

    const tinta = statusUrmatorWoot(o.status, stare.statusId);
    if (tinta) {
      const rez = await tranzitieComandaMarketplace(admin, {
        orderId: o.id,
        businessId: o.business_id,
        status: tinta,
        sursa: "woot",
        expediere: { coloana: "woot_order_id", valoare: o.woot_order_id },
      });
      if (rez === "ok") {
        mutate++;
        if (tinta === "delivered") {
          /*
           * ⚠ MASURAT INAINTE DE A FI CABLAT: singurul magazin cu expedieri Woot are facturarea
           * automata pe `confirmed`, nu pe `delivered`, deci randul asta NU emite nicio factura
           * pentru el. Ramane fiindca e purtarea corecta pentru orice magazin viitor care alege
           * `delivered`, si fiindca asa fac toti ceilalti cronuri.
           *
           * ⚠ Nu se lasa sa arunce: o facturare picata n-are voie sa opreasca urmarirea celorlalte
           * colete, dar nici sa treaca tacut.
           */
          try {
            await maybeAutoInvoice(o.business_id, o.id, tinta, o.payment_status ?? "", admin as never);
          } catch (e) {
            await logError({
              action: "woot-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe livrat, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id }, businessId: o.business_id, severity: "warning",
            });
          }
        }
      }
    }

    /*
     * ⚠⚠ SE SEMNALEAZA DOAR SCHIMBAREA, SI SEMNALUL AJUNGE LA OM.
     *
     * Pana azi randurile astea scriau numai in `error_logs`, pe care comerciantul nu-l vede,
     * si o faceau la FIECARE rulare: jurnalul are aceleasi patru retururi la 02:59, 04:59 si
     * 06:59. Adica Woot — singurul transportator cu trafic adevarat — decidea ca ceva merita
     * spus, si nu spunea nimanui. Vezi `semnalarea-ajunge-la-om`.
     */
    const retur = esteReturWoot(stare.statusId);
    if (trebuieSemnalatWoot(stare.statusId) && stareaSaSchimbat(o.woot_status_id, stare.statusId)) {
      semnalate++;
      const spune = stare.eticheta || `stare Woot ${stare.statusId}`;
      const comanda = o.order_number ? `Comanda ${o.order_number}` : "O comanda";
      await semnaleazaExpedierea(admin, {
        userId: proprietari.get(o.business_id) ?? null,
        businessId: o.business_id,
        orderId: o.id,
        orderNumber: o.order_number,
        awb: o.woot_order_id,
        tip: "woot",
        titlu: retur ? "Colet Woot returnat" : "Expediere Woot care cere atentie",
        mesaj: retur
          ? `${comanda}: coletul ${o.woot_order_id} se intoarce la tine (${spune}). Rambursul nu se mai incaseaza, iar anularea comenzii si returul banilor raman decizia ta.`
          : `${comanda}: expedierea ${o.woot_order_id} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet.`,
        actiune: "woot-tracking",
        detalii: { woot_order_id: o.woot_order_id, stare: stare.statusId },
      });
    }

    if (eStareFinalaWoot(stare.statusId)) incheiate++;
  }

  /*
   * ⚠ NUMERELE IN JURNALUL PLATFORMEI, nu doar in corpul raspunsului. Vercel pastreaza statusul
   * cererii, nu si ce a intors ea, deci fara randul asta o rulare care atinge 12 comenzi din 120
   * arata identic cu una care le-a atins pe toate. Prima rulare adevarata a facut chiar asta, si
   * n-am avut de unde afla de ce. Acelasi leac ca la `fancourier-settlements`.
   */
  console.log(
    `[woot-tracking] candidati ${inFereastra.length}, verificate ${verificate}, scrise ${scrise}, `
    + `mutate ${mutate}, semnalate ${semnalate}, incheiate ${incheiate}, `
    + `fara config ${faraConfig}, fara stare ${faraStare}, esuate ${esuate}, ramase ${ramase}`
    /* ⚠ Numerele pe care harta nu le stie inca: din ele creste ea, deci se scriu pe nume. */
    + (necunoscute.size ? `, stari NECUNOSCUTE: ${[...necunoscute].sort().join(", ")}` : ""),
  );
  return NextResponse.json({
    ok: true, candidati: inFereastra.length, verificate, scrise, mutate, semnalate, incheiate,
    faraConfig, faraStare, esuate, ramase, necunoscute: [...necunoscute].sort(),
  });
}
