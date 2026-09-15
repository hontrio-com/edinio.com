import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { evenimenteCargus, urmarireCargus, type CargusConfig, type StareCargus } from "@/lib/cargus";
import { scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor Cargus.
 *
 * ═══ DE CE A EXISTAT O GAURA AICI ═══
 *
 * Clientul Cargus se oprea la creare, anulare, tiparire si ridicare. Comerciantul nu afla
 * niciodata din Edinio ce s-a intamplat cu coletul dupa ce a plecat, desi API-ul lor o spune
 * pe doua cai.
 *
 * ═══ ⚠ DOUA RUTE, FOLOSITE FIECARE LA CE E BUNA ═══
 *
 * `AwbTrace/GetDeltaEvents?FromDate&ToDate` intoarce, INTR-O SINGURA CERERE, tot ce s-a miscat
 * in cont intr-un interval. `AwbTrace/WithRedirect?barCode=[lista]` intoarce starea unor AWB-uri
 * anume, mai multe pe cerere.
 *
 * Deci: o cerere de interval pe magazin spune CINE s-a miscat, si numai cei ramasi pe dinafara
 * primesc intrebarea pe nume. La un magazin cu cincizeci de colete in drum, deosebirea e intre
 * cincizeci de cereri si doua.
 *
 * ⚠ DATELE LOR SUNT AMERICANE PE RUTA ASTA (`mm-dd-yyyy`), spre deosebire de `CashAccount`,
 * care le cere ISO. Trimise invers, cele doua nu dau eroare: intervalul cerut e ALTUL, iar
 * cronul raporteaza linistit „zero de verificat". Vezi `shipping/datele-cargus.ts`.
 *
 * ═══ ⚠ DE CE INREGISTREAZA SI NU HOTARASTE ═══
 *
 * Fiindca ei NU publica nicio enumerare de stari. In toata documentatia V3 (68 de pagini)
 * statusul apare ca TEXT liber; singurul exemplu din ea e „Tiparit". Nu exista niciun tabel de
 * coduri, asa cum are DPD in „Appendix 1", si niciun boolean cumulativ, asa cum are Sameday in
 * `expeditionSummary.delivered`.
 *
 * Un `switch` pe textul lor ar fi o presupunere imbracata in logica, iar prima formulare
 * neprevazuta ar cadea tacut pe ramura implicita. Aceeasi cumpana s-a luat la Woot, si acolo a
 * iesit bine: cronul a strans perechile din trafic, iar harta s-a scris DIN DATE.
 *
 * ⚠ De-aia fiecare formulare NOUA se striga pe nume in jurnal: asa creste vocabularul, si abia
 * pe el se va putea cabla mutarea comenzii.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la GLS, Posta si Sameday: emailul de expediere pleaca DOAR din
 * `updateOrder`, care e legata de plafoanele de instiintare ale contului. Un cron n-are
 * utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/** Cat de departe in urma ne uitam. Un colet Cargus nu traieste mai mult de atat. */
const ZILE = 21;

/**
 * ⚠ Plafonul pe rulare nu e decorativ: sunt N apeluri HTTP catre ei.
 *
 * Cu rotatia dupa `cargus_status_checked_at` (cele neintrebate de cel mai mult timp ies
 * primele), plafonul nu lasa niciodata aceleasi comenzi pe dinafara.
 */
const MAX_COMENZI = 120;

/**
 * Cat inapoi intreaba `GetDeltaEvents`.
 *
 * ⚠ MULT MAI MULT DECAT PASUL CRONULUI (48h fata de 2h), si dinadins: o suprapunere de
 * douazeci si patru de ori inseamna ca un eveniment se poate pierde numai daca cronul e oprit
 * doua zile. Iar cand chiar se pierde, comanda tot ajunge intrebata pe nume prin rotatie.
 */
const FEREASTRA_EVENIMENTE_MS = 48 * 60 * 60 * 1000;

/**
 * Cate AWB-uri pe o cerere `WithRedirect`.
 *
 * ⚠ ALEGEREA NOASTRA, NU A LOR: documentatia lor nu publica niciun plafon aici (exemplul are
 * doua). Zece e acelasi numar cu cel pe care DPD il documenteaza, si e destul de mic cat sa nu
 * riste un refuz pe lungimea adresei.
 */
const LOT = 10;

type Comanda = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  created_at: string | null;
  cargus_awb_number: string | null;
  cargus_awb_at: string | null;
  cargus_status: string | null;
  cargus_status_checked_at: string | null;
};

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select(
      "id, business_id, status, order_number, created_at,"
      + " cargus_awb_number, cargus_awb_at, cargus_status, cargus_status_checked_at",
    )
    .not("cargus_awb_number", "is", null)
    .neq("cargus_awb_number", "")
    /*
     * ⚠ Excluderea starilor incheiate NU e acoperita de filtrul pe AWB: o comanda anulata isi
     * pastreaza numarul, deci s-ar potrivi la nesfarsit.
     */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITEREA AWB-ului, nu pe data comenzii. Pe `created_at`, o
     * comanda veche careia comerciantul ii emite AWB abia acum ar fi din start in afara
     * ferestrei: n-ar fi interogata NICIODATA.
     *
     * ⚠ Conditia e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat in `or(...)`:
     * sintaxa imbricata gresita NU da eroare, da LISTA GOALA, adica urmarirea ar muri complet,
     * raportand vesel `ok: true`.
     */
    .or(`cargus_awb_at.gte.${since},cargus_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("cargus_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /*
   * ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT".
   *
   * Fara `error` destructurat, `comenzi` ar fi `null` si ramura urmatoare ar raspunde
   * `{ ok: true, verificate: 0 }`: o rulare sanatoasa la vedere, care n-a urmarit nimic.
   */
  if (eComenzi) {
    await logError({
      action: "cargus-tracking",
      message: `comenzile cu AWB Cargus nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const toate = (comenzi ?? []) as unknown as Comanda[];
  /* Perechea conditiei de mai sus: comenzile fara ancora raman in urmarire doar cat timp
     COMANDA e in fereastra. */
  const inFereastra = toate.filter((o) => o.cargus_awb_at !== null || (o.created_at ?? "") >= since);
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, scrise: 0, formulariNoi: [] });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, cargus_config").in("business_id", bizIds);

  /* Fara configuratii, TOATE comenzile ar fi sarite: zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: "cargus-tracking",
      message: `configuratiile Cargus nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map<string, CargusConfig>();
  for (const r of setari ?? []) {
    const c = r.cargus_config as CargusConfig | null;
    if (c?.enabled && c.username && c.password && c.subscription_key) configuri.set(r.business_id, c);
  }

  /*
   * ═══ PASUL IEFTIN: cine s-a miscat, o cerere pe magazin ═══
   *
   * ⚠ Daca apelul pica, NU se opreste urmarirea: harta ramane fara magazinul acela, iar mai jos
   * asta inseamna „nu stiu cine s-a miscat, deci intreaba-i pe nume". O optimizare care se
   * strica n-are voie sa devina o urmarire care nu mai vede nimic.
   */
  const acum = new Date();
  const deLa = new Date(acum.getTime() - FEREASTRA_EVENIMENTE_MS);
  const dinInterval = new Map<string, Map<string, StareCargus>>();

  for (const [businessId, config] of configuri) {
    try {
      const stari = await evenimenteCargus(config, deLa, acum);
      dinInterval.set(businessId, new Map(stari.map((s) => [s.awb, s])));
    } catch (e) {
      console.error("[cargus-tracking] GetDeltaEvents", businessId, (e as Error).message);
    }
  }

  let verificate = 0, scrise = 0, faraConfig = 0, esuate = 0;
  /* ⚠ Vocabularul lor, strans din trafic: de aici se va scrie harta. Vezi antetul. */
  const formulariNoi = new Set<string>();

  /** Cei care n-au aparut in interval si trebuie intrebati pe nume, pe magazin. */
  const deIntrebat = new Map<string, Comanda[]>();

  for (const o of inFereastra) {
    const config = configuri.get(o.business_id);
    if (!config) {
      /* Magazinul si-a oprit integrarea, dar comenzile vechi isi pastreaza AWB-ul. */
      faraConfig++;
      await marcheaza(o, null);
      continue;
    }
    const stare = dinInterval.get(o.business_id)?.get(o.cargus_awb_number!.trim());
    if (stare) {
      verificate++;
      if (await scrie(o, stare)) scrise++;
      continue;
    }
    const lista = deIntrebat.get(o.business_id) ?? [];
    lista.push(o);
    deIntrebat.set(o.business_id, lista);
  }

  /* ═══ PASUL PE NUME, in loturi, doar pentru cei ramasi ═══ */
  for (const [businessId, lista] of deIntrebat) {
    const config = configuri.get(businessId)!;
    for (let i = 0; i < lista.length; i += LOT) {
      const lot = lista.slice(i, i + LOT);
      let stari: StareCargus[];
      try {
        stari = await urmarireCargus(config, lot.map((o) => o.cargus_awb_number!.trim()));
      } catch (e) {
        esuate += lot.length;
        console.error("[cargus-tracking] WithRedirect", businessId, (e as Error).message);
        /*
         * ⚠ MARCAJUL SE SCRIE SI CAND APELUL A PICAT, pentru TOATE cele cerute. Altfel aceleasi
         * comenzi ar sta vesnic in capul cozii si restul n-ar fi intrebat niciodata. Aceeasi
         * lectie ca la lotul de zece al DPD-ului.
         */
        for (const o of lot) await marcheaza(o, null);
        continue;
      }

      const dupaAwb = new Map(stari.map((s) => [s.awb, s]));
      for (const o of lot) {
        const stare = dupaAwb.get(o.cargus_awb_number!.trim());
        if (!stare) {
          /* Ei nu-l cunosc, sau nu l-au intors. Nu e o cadere de retea: se marcheaza si gata. */
          await marcheaza(o, null);
          continue;
        }
        verificate++;
        if (await scrie(o, stare)) scrise++;
      }
    }
  }

  return NextResponse.json({
    ok: true, verificate, scrise, faraConfig, esuate,
    /* ⚠ Formularile noi se raporteaza pe nume: din ele se va scrie harta. */
    formulariNoi: [...formulariNoi],
  });

  /**
   * Marcajul singur, pentru drumurile care nu afla nimic.
   *
   * ⚠ SE SCRIE NECONDITIONAT. Aici se ajunge de pe drumurile care nu ating furnizorul sau nu
   * afla nimic: magazin fara config, apel picat, AWB necunoscut. Ele nu aduc nicio stare, deci
   * n-au ce ateriza gresit pe alta expediere, iar o conditie ar putea doar sa impiedice
   * marcajul, adica sa infometeze coada. Vezi `scrieUrmarirea`.
   *
   * ⚠ `business_id` NU E UN FILTRU DE PRISOS, E AUTORIZARE: cronul scrie cu rol de SERVICIU,
   * deci RLS nu-l opreste. Vezi `scrierile-de-urmarire-poarta-magazinul.test.ts`.
   */
  async function marcheaza(o: Comanda, _stare: null) {
    await admin.from("orders")
      .update({ cargus_status_checked_at: new Date().toISOString() })
      .eq("id", o.id).eq("business_id", o.business_id);
  }

  /** Starea lor, scrisa pe expedierea pe care am citit-o. Intoarce `true` cand chiar s-a scris. */
  async function scrie(o: Comanda, stare: StareCargus): Promise<boolean> {
    if (stare.stare && stare.stare !== o.cargus_status) formulariNoi.add(stare.stare);

    /*
     * ⚠ SE SCRIE PE EXPEDIEREA PE CARE AM CITIT-O.
     *
     * Intre citirea lotului si randul asta a trecut un apel la Cargus, iar tura are 120 de
     * comenzi. Daca intre timp comerciantul a detasat AWB-ul si a emis din nou, starea de aici
     * e a expedierii VECHI: scrisa orbeste, ea ar arata drumul altui colet.
     */
    const r = await scrieUrmarirea(admin, {
      orderId: o.id,
      businessId: o.business_id,
      identitate: { coloana: "cargus_awb_number", valoare: o.cargus_awb_number },
      stare: {
        ...(stare.stare ? { cargus_status: stare.stare } : {}),
        ...(stare.ultimulEvenimentLa ? { cargus_status_at: stare.ultimulEvenimentLa } : {}),
        ...(stare.confirmatLa ? { cargus_confirmat_la: stare.confirmatLa } : {}),
        ...(stare.confirmatDe ? { cargus_confirmat_de: stare.confirmatDe } : {}),
      } as Database["public"]["Tables"]["orders"]["Update"],
      marcaj: { cargus_status_checked_at: new Date().toISOString() },
      actiune: "cargus-tracking",
      orderNumber: o.order_number,
    });
    return r.scris;
  }
}
