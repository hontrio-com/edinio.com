"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { poartaAwbPropriu } from "@/lib/orders/poarta-awb";
import { motivContInactiv } from "@/lib/subscription-server";
import {
  anuleazaExpediereaCuriera,
  cautaDupaReferintaCuriera,
  creeazaExpediereaCuriera,
  curieraGata,
  etichetaCuriera,
  probaConexiuneCuriera,
  stariCuriera,
  type AwbGasit,
  type CurieraConfig,
  type ExpediereCreata,
  type RezultatProbaCuriera,
} from "@/lib/curiera/client";
import { etichetaPeA5 } from "@/lib/curiera/eticheta-a5";
import {
  lipsuriExpediereCuriera,
  parametriExpediereCuriera,
  referintaCuriera,
  type DateAwbCuriera,
  type DateExpediereCuriera,
} from "@/lib/curiera/expediere";
import { awbLamuritDupaReferinta, hotarareaDezlegarii, type IncercareaAnularii } from "@/lib/curiera/dezlegare";
import { normalizeazaStatus } from "@/lib/curiera/statusuri";
import type { Json } from "@/types/database.types";

/**
 * Actiunile Curiera.
 *
 * ⚠ Fisier „use server": FIECARE export e un capat public, deci aici stau numai functiile
 * async. Tipurile si regulile pure sunt in `src/lib/curiera/`, unde se si probeaza.
 *
 * ⚠ Curiera NU refuza o expediere gresita: o pune in ciorna si da totusi un numar (vezi
 * antetul din `client.ts`). De aceea tot ce stim ca le trebuie se verifica aici, INAINTE de
 * registru (`lipsuriExpediereCuriera`), iar ciorna refuzata e tratata de client ca refuz.
 */

// ─── Proprietarul ─────────────────────────────────────────────────────────────

/**
 * Proprietarul magazinului. Se verifica INAINTE de orice citire cu service role.
 * Discriminantul e `ok`, ca TypeScript sa poata ingusta (vezi `gls.actions.ts`).
 */
type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

async function proprietar(businessId: string): Promise<Proprietar> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { ok: false, error: "Acces interzis" };

  return { ok: true, supabase };
}

/**
 * Cheia venita din formular. ⚠ Textul-inlocuitor al campului mascat NU e o cheie: trimis mai
 * departe, ar fi fost salvat sau probat la Curiera drept cheia comerciantului.
 */
function cheiaPrimita(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s === PLACEHOLDER_SECRET_SALVAT.trim() ? "" : s;
}

// ─── Configurare ──────────────────────────────────────────────────────────────

export async function saveCurieraConfig(
  businessId: string,
  config: CurieraConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const primit: CurieraConfig = { ...config, api_key: cheiaPrimita(config?.api_key) };

  /*
   * Cheia venita GOALA isi pastreaza valoarea salvata: formularul o primeste mascata.
   *
   * ⚠ Configul vechi se citeste cu SERVICE ROLE (pe clientul comerciantului cheia vine
   * `enc.v1.…`, iar `pastreazaSecretele` ar „pastra" cifrul), dupa dovada proprietatii.
   * ⚠ Si citirea picata OPRESTE salvarea: luata drept „nimic salvat", ar fi scris peste cheie
   * un camp gol (lectia Trendyol din 24.08.2026, `configDinBaza` din posta.actions.ts).
   */
  const { data: vechi, error: eVechi } = await createAdminClient()
    .from("store_settings").select("curiera_config").eq("business_id", businessId).maybeSingle();
  if (eVechi) return { error: `Configurarea salvata nu s-a putut citi (${eVechi.message}). Nu am salvat nimic.` };
  const configFinal = pastreazaSecretele("curiera_config", primit, vechi?.curiera_config);

  const { error } = await supabase.from("store_settings").update({
    curiera_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectCuriera(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  /*
   * ⚠ ZONA SE STINGE ODATA CU CONFIGURAREA. Checkoutul nu mai vinde Curiera fara configurare
   * (`curieraGata`), dar zona ramanea pornita: la un magazin care o avea SINGURA, lista de livrare
   * iesea goala, iar formularul cerea totusi o metoda, deci nu se mai putea plasa nicio comanda.
   * Setari o arata stinsa si blocata (nu mai e integrata), iar blocul „Curierii" din pagini o
   * arata mai departe. Stinsa aici, toate trei spun acelasi lucru; la reconectare se porneste din
   * nou din Setari > Livrare, cum spune si ghidul.
   */
  const { data: rand, error: eCitire } = await ctx.supabase
    .from("store_settings").select("shipping_zones").eq("business_id", businessId).maybeSingle();
  if (eCitire) return { error: `Setarile de livrare nu s-au putut citi (${eCitire.message}). Nu am deconectat nimic.` };
  const zone = rand?.shipping_zones;
  const curieraPornita = !!zone && typeof zone === "object" && !Array.isArray(zone)
    && ((zone as Record<string, { enabled?: unknown } | undefined>).curiera?.enabled === true);

  const { error } = await ctx.supabase.from("store_settings").update({
    curiera_config: null,
    ...(curieraPornita
      ? {
          shipping_zones: {
            ...(zone as Record<string, unknown>),
            curiera: { ...((zone as Record<string, Record<string, unknown>>).curiera), enabled: false },
          } as unknown as Json,
        }
      : {}),
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune. NU salveaza nimic si nu creeaza nimic la Curiera: `test_connection` si
 * `me` sunt citiri AUTENTIFICATE (fara cheie raspund BAD_LOGIN, masurat), deci bifa verde
 * dovedeste chiar cheia, nu doar ca serverul lor raspunde.
 *
 * Cheia goala sau mascata inseamna „foloseste-o pe cea salvata".
 */
export async function testCurieraConnectionAction(
  businessId: string,
  apiKey: string,
): Promise<{ ok: true; proba: RezultatProbaCuriera } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const cheie = await secretDinConfig(businessId, "curiera_config", "api_key", cheiaPrimita(apiKey));
  if (!cheie) return { ok: false, error: "Completeaza cheia API din contul Curiera." };

  try {
    return { ok: true, proba: await probaConexiuneCuriera({ api_key: cheie }) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /* ⚠ Configul pe SERVICE ROLE: vederea nu decripteaza cheia pentru `authenticated`. */
  const admin = createAdminClient();
  const [{ data: setari, error: eSetari }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("curiera_config").eq("business_id", businessId).maybeSingle(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (eSetari) return { error: `Configurarea Curiera nu s-a putut citi: ${eSetari.message}` };
  if (!order) return { error: "Comanda negasita" };

  const config = (setari?.curiera_config ?? null) as CurieraConfig | null;
  /* ⚠ Regula sta in `curieraGata`, una singura pentru actiune, lot, pagini si cron. */
  if (!curieraGata(config)) {
    return {
      error:
        "Curiera nu e configurata complet: ai nevoie de cheia API si de adresa de ridicare "
        + "(nume, telefon, adresa, oras, judet).",
    };
  }

  return { supabase, admin, config, order };
}

/**
 * Lamurirea unei emiteri al carei raspuns s-a pierdut, cu o singura citire dupa referinta.
 * Orice citire picata da `null`, adica „nu stim". Regula e in `awbLamuritDupaReferinta`.
 */
async function lamuresteDupaReferinta(
  admin: ReturnType<typeof createAdminClient>,
  config: CurieraConfig,
  businessId: string,
  cheie: string,
  referinta: string,
  deLa: Date,
): Promise<AwbGasit | null> {
  const [gasite, cunoscute] = await Promise.all([
    /* ⚠ Ciornele refuzate (cu motive) nu ies de aici deloc: vezi `cautaDupaReferintaCuriera`. */
    cautaDupaReferintaCuriera(config, referinta, deLa).catch(() => null),
    /* AWB-urile pe care comanda le-a mai purtat (randurile anulate isi pastreaza referinta). */
    admin.from("operatii_externe").select("referinta_externa")
      .eq("business_id", businessId).eq("cheie", cheie)
      .then(({ data, error }) => (error ? null : (data ?? []).map((r) => r.referinta_externa ?? ""))),
  ]);
  const awb = awbLamuritDupaReferinta(gasite ? gasite.map((g) => g.awb) : null, cunoscute);
  if (!awb) return null;
  /* Starea merge mai departe, ca un cont care porneste in ciorna sa-si primeasca avertismentul
     si pe drumul lamurit, nu doar pe cel direct. */
  return gasite?.find((g) => g.awb === awb.trim()) ?? { awb, stare: "" };
}

const AVERTISMENT_CIORNA =
  "Contul tau Curiera porneste expedierile in ciorna: confirma expedierea in contul Curiera ca sa fie ridicata.";

export async function createCurieraAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbCuriera,
): Promise<{ awb: string; avertismente: string[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };

  /* ⚠ POARTA E PRIMA, INAINTE de orice apel la curier: un refuz de dupa emitere ar fi un
     colet deja platit si o eticheta deja tiparita. Vezi `src/lib/orders/poarta-awb.ts`. */
  const refuzAwb = await poartaAwbPropriu(businessId, orderId, "curiera");
  if (refuzAwb) return { error: refuzAwb };

  const { supabase, admin, config, order } = ctx;
  if ((order.curiera_awb_number ?? "").trim()) {
    return { error: "AWB-ul Curiera a fost deja creat pentru comanda asta." };
  }

  /* ⚠ Referinta o pune SERVERUL, din numarul citit din baza: dupa ea se lamureste un raspuns
     pierdut, deci nu are voie sa vina din browser (spread-ul de mai jos o suprascrie). */
  const referinta = referintaCuriera(businessId, order.order_number);
  const dateExpediere: DateExpediereCuriera = { ...date, referinta };

  /* ⚠ SINGURA PLASA: Curiera nu refuza un camp lipsa, face o ciorna care nu pleaca. Si o
     comanda incompleta n-are de ce sa ocupe un slot in registru. */
  const lipsuri = lipsuriExpediereCuriera(config, dateExpediere);
  if (lipsuri.length > 0) {
    return { error: `AWB-ul Curiera nu se poate emite, lipseste: ${lipsuri.join("; ")}.` };
  }
  const parametri = parametriExpediereCuriera(config, dateExpediere);

  const cheie = cheieOperatie("awb", "curiera", orderId);
  /* Ancora cautarii dupa referinta: tot ce s-ar fi putut crea de apasarea asta e de acum incolo. */
  const clipaEmiterii = new Date();

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "curiera", cheie },
    async () => {
      let creata: ExpediereCreata;
      let lamurita = false;
      try {
        creata = await creeazaExpediereaCuriera(config, parametri);
      } catch (e) {
        /*
         * ⚠⚠ UN RASPUNS PIERDUT SE LAMURESTE CU O CITIRE, O SINGURA DATA.
         *
         * Pe `necunoscut` (termen depasit, corp gol) expedierea poate exista la ei. `get_shipments`
         * poarta `customer_reference` (masurat), deci exact un AWB viu nou cu referinta noastra e
         * dovada ca s-a creat. Altfel eroarea iese NESCHIMBATA, `necunoscut`, si randul
         * blocheaza: o reincercare oarba ar fi al doilea colet facturat.
         */
        if (verdictFurnizor(e) !== "necunoscut") throw e;
        const gasit = await lamuresteDupaReferinta(admin, config, businessId, cheie, referinta, clipaEmiterii);
        if (!gasit) throw e;
        creata = { awb: gasit.awb, stare: gasit.stare, pret: null, pretCuTva: null, numere: [gasit.awb] };
        lamurita = true;
      }
      return {
        referinta: creata.awb,
        /* ⚠ Fara date ale cumparatorului: registrul se citeste din panoul de operatii. */
        detalii: {
          referinta,
          stare: creata.stare || null,
          numere: creata.numere,
          pret: creata.pret,
          pretCuTva: creata.pretCuTva,
          serviciu: parametri.service_type ?? null,
          punct: parametri.to_delivery_location ?? null,
          ramburs: Number(parametri.ramburs ?? 0),
          lamuritaDupaReferinta: lamurita,
        } as Json,
        valoare: { awb: creata.awb, stare: creata.stare, lamurita },
      };
    },
    /* Clientul marcheaza singur verdictul: `failed` si ciorna refuzata = `esuat`, restul `necunoscut`. */
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, dinadins, ca la GLS si Posta: predicatul s-ar citi dintr-o
     * comanda luata inaintea `return`-ului de mai sus, deci ar fi mereu fals, iar fals pe
     * `deja` inseamna „elibereaza si REEMITE". Fara el, `deja` adopta numarul din registru.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "").trim();
  if (!awb) {
    return {
      error:
        "Operatia figureaza reusita in registru, dar fara numar AWB. "
        + "Verifica in contul Curiera si scrie numarul pe comanda.",
    };
  }

  /*
   * ⚠ `deja` ADOPTA numarul din registru, dar numarul poate fi mort: o dezlegare care l-a anulat
   * la Curiera si n-a apucat sa elibereze slotul. Adoptat orb, comanda ar purta un AWB anulat,
   * raportat „emis", pe care `print` il refuza. O citire la CURIER (nu pe comanda, deci nu e
   * capcana lui `legaturaVie`) lamureste: anulat acolo = slotul se elibereaza si omul reia.
   */
  if (r.fel === "deja") {
    const stari = await stariCuriera(config, [awb]).catch(() => null);
    const aici = stari?.find((s) => s.no && s.cerut === awb);
    if (aici && normalizeazaStatus(aici.status) === "anulat") {
      const eliberat = await marcheazaAnulata(admin, businessId, cheie);
      return {
        error: eliberat
          ? `AWB-ul ${awb}, ramas in registru pentru comanda asta, e anulat la Curiera. L-am scos din registru: apasa din nou ca sa emiti unul nou.`
          : `AWB-ul ${awb}, ramas in registru pentru comanda asta, e anulat la Curiera, dar registrul nu s-a putut elibera. Incearca din nou peste un minut.`,
      };
    }
  }

  const avertismente: string[] = [];
  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as { stare?: unknown } | null;
  const stare = r.fel === "facut" ? r.valoare.stare : (typeof dinRegistru?.stare === "string" ? dinRegistru.stare : "");
  /* ⚠ Starea `initial` singura nu e refuz: contul se poate seta sa porneasca expedierile API in
     ciorna. Dar atunci nu vine nimeni sa ridice pana nu confirma omul, deci i se spune. */
  if (["initial", "draft"].includes(stare.trim().toLowerCase())) avertismente.push(AVERTISMENT_CIORNA);
  if (r.fel === "facut" && r.valoare.lamurita) {
    avertismente.push(
      `Raspunsul Curiera nu a ajuns, dar expedierea cu referinta ${referinta} exista la ei: `
      + "am citit-o inapoi si am legat-o de comanda. Verifica-i starea in contul Curiera.",
    );
  }

  /*
   * ⚠ Starea coletului ANTERIOR se goleste odata cu scrierea celui nou: lasata, o stare finala
   * veche l-ar fi scos pe cel nou din urmarire, iar memoria semnalarilor l-ar fi facut mut.
   * `null`, nu `[]`, la memorie: „n-am inregistrat nimic" e chiar starea coletului nou.
   */
  const acum = new Date().toISOString();
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    curiera_awb_number: awb,
    /* Ancora ferestrei cronului de urmarire si a contului cumparatorului. */
    curiera_awb_at: acum,
    curiera_reference: referinta,
    curiera_status_code: null,
    curiera_status_label: null,
    curiera_status_at: null,
    curiera_status_checked_at: null,
    curiera_evenimente_semnalate: null,
    updated_at: acum,
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Coletul EXISTA la Curiera. Scrierea picata nu se intoarce ca eroare: omul ar apasa din
   * nou, iar registrul raspunde `deja` si reface doar scrierea. Se striga, si se raporteaza
   * succes.
   */
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "curiera.createAwb",
      message: `AWB Curiera creat (${awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Numarul e in registrul de operatii externe; o noua apasare il adopta si reface scrierea.`,
      details: { orderId, businessId, awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    /* Marketplace-ul afla numarul de urmarire DUPA ce el exista in baza: coada il citeste de acolo. */
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return { awb, avertismente };
}

// ─── Dezlegarea AWB-ului ──────────────────────────────────────────────────────

/**
 * Incearca anularea la Curiera, apoi scoate AWB-ul de pe comanda si elibereaza slotul.
 *
 * ⚠ Semantica FAN (`dezleagaFanAwbAction`): cheia de client anuleaza doar pana la ridicare, deci
 * dupa ridicare refuzul e sigur, iar fara dezlegare comanda ar ramane inghetata. Pe „nu stim"
 * se OPRESTE. Regula e in `hotarareaDezlegarii`, probata acolo.
 *
 * ⚠ NU trece prin `configSiComanda`: aceea cere integrarea completa, iar un comerciant care a
 * deconectat Curiera trebuie sa poata totusi scoate numarul de pe comanda (lectia DHL, Posta,
 * FAN).
 */
export async function dezleagaCurieraAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; mesaj: string; anulatLaCuriera: boolean } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const admin = createAdminClient();
  const [{ data: order, error: eComanda }, { data: setari, error: eSetari }] = await Promise.all([
    admin.from("orders").select("id, curiera_awb_number")
      .eq("id", orderId).eq("business_id", businessId).maybeSingle(),
    admin.from("store_settings").select("curiera_config").eq("business_id", businessId).maybeSingle(),
  ]);
  if (eComanda) return { error: `Comanda nu s-a putut citi: ${eComanda.message}` };
  if (!order) return { error: "Comanda negasita" };
  const numarPeComanda = order.curiera_awb_number ?? "";
  const awb = numarPeComanda.trim();
  if (!awb) return { error: "Comanda nu are AWB Curiera." };
  /* ⚠ Configurarea NECITITA nu e configurarea LIPSA: luata drept lipsa, am dezlega fara sa
     cerem anularea pe care o puteam cere, si coletul ar pleca mai departe. */
  if (eSetari) {
    return {
      error:
        `Configurarea Curiera nu s-a putut citi (${eSetari.message}), deci anularea nu s-a putut cere. `
        + "Numarul NU a fost scos de pe comanda; incearca din nou peste un minut.",
    };
  }

  /*
   * Anularea cere doar cheia, nu toata configurarea: o integrare oprita dar cu cheia inca
   * salvata poate opri coletul, si e mai bine s-o faca decat sa-l lase sa plece.
   */
  const config = (setari?.curiera_config ?? null) as CurieraConfig | null;
  let incercare: IncercareaAnularii;
  if (!config || !(config.api_key ?? "").trim()) {
    incercare = { fel: "fara_config" };
  } else {
    try {
      incercare = { fel: "raspuns", rezultat: await anuleazaExpediereaCuriera(config, awb) };
    } catch (e) {
      const verdict = verdictFurnizor(e);
      incercare = { fel: "eroare", verdict, mesaj: (e as Error).message };
      /* ⚠ „Nu stim" NU dezleaga (vezi `hotarareaDezlegarii`), dar se si scrie in jurnal: un AWB
         care poate s-a anulat, poate nu, trebuie sa-l vada si suportul, nu doar cine a apasat. */
      if (verdict === "necunoscut") {
        await logError({
          action: "curiera.dezleaga",
          message: `Anularea AWB-ului Curiera ${awb} a ramas fara raspuns sigur: ${(e as Error).message} Numarul ramane pe comanda.`,
          details: { orderId, businessId, awb },
          businessId,
          severity: "warning",
        });
      }
    }
  }

  const hotarare = hotarareaDezlegarii(awb, incercare);
  if (!hotarare.dezleaga) return { error: hotarare.eroare };

  const { data: randuri, error } = await admin.from("orders").update({
    /* ⚠ TOATE coloanele coletului, nu doar numarul: o stare finala veche ar fi scos coletul
       urmator din urmarire, iar memoria semnalarilor l-ar fi facut mut. `null` la memorie. */
    curiera_awb_number: null,
    curiera_awb_at: null,
    curiera_reference: null,
    curiera_status_code: null,
    curiera_status_label: null,
    curiera_status_at: null,
    curiera_status_checked_at: null,
    curiera_evenimente_semnalate: null,
    updated_at: new Date().toISOString(),
    /* ⚠ SI PE AWB-UL CITIT: intre citire si scriere sta apelul la Curiera, iar un numar NOU
       emis in rastimp din alta fila nu are voie sa fie sters. */
  }).eq("id", orderId).eq("business_id", businessId)
    .eq("curiera_awb_number", numarPeComanda)
    .select("id");

  if (error || !randuri || randuri.length === 0) {
    return {
      error: `${hotarare.despreCurier} Dar numarul nu s-a putut scoate de pe comanda, `
        + "sau intre timp comanda a primit alt AWB. Reincarca pagina si verifica.",
    };
  }

  /* ⚠ Eliberarea vine DUPA scrierea pe comanda. Fara ea, emiterea urmatoare ar adopta chiar
     AWB-ul dezlegat, iar alt curier ar fi refuzat de indexul „un AWB viu pe comanda". */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "curiera", orderId));
  if (!eliberat) {
    await logError({
      action: "curiera.dezleaga",
      message:
        `AWB Curiera ${awb} dezlegat, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda `
        + "va readopta numarul din registru; daca el e anulat la Curiera, emiterea il elibereaza si cere o noua apasare.",
      details: { orderId, businessId, awb, anulatLaCuriera: hotarare.anulatLaCuriera },
      businessId,
      severity: "critical",
    });
  }

  /*
   * ⚠ Coada „poate fi expediata cu alt curier" se spune NUMAI cand coletul a incetat sa existe
   * la Curiera. Cu cheia de client (anulare doar pana la ridicare), refuzul e drumul OBISNUIT dupa
   * fiecare ridicare: acolo omul trebuie oprit, nu invitat la al doilea colet. Fereastra arata
   * atunci un avertisment, nu un mesaj de reusita (`anulatLaCuriera`).
   */
  return {
    success: true,
    anulatLaCuriera: hotarare.anulatLaCuriera,
    mesaj: hotarare.anulatLaCuriera
      ? `${hotarare.despreCurier} Numarul a fost scos de pe comanda, care poate fi acum editata sau expediata cu alt curier.`
      : `${hotarare.despreCurier} Numarul a fost scos de pe comanda, ca sa poata fi editata; nu emite alt AWB pana nu esti sigur ca acest colet nu pleaca.`,
  };
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta PDF, ceruta de la Curiera la FIECARE descarcare (`print` e o citire pura). Nu se
 * pastreaza nicaieri un document cu numele, adresa si telefonul cumparatorului.
 *
 * ⚠ Si trece prin poarta contului, ca rutele de eticheta (`poarta-eticheta.ts`): fiecare
 * cerere foloseste integrarea comerciantului, iar un magazin suspendat nu o mai are.
 */
export async function getCurieraEtichetaAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; base64: string; nume: string; avertisment?: string } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const oprit = await motivContInactiv(businessId);
  if (oprit) return { ok: false, error: oprit };

  const admin = createAdminClient();
  const [{ data: order, error: eComanda }, { data: setari, error: eSetari }] = await Promise.all([
    admin.from("orders").select("id, curiera_awb_number")
      .eq("id", orderId).eq("business_id", businessId).maybeSingle(),
    admin.from("store_settings").select("curiera_config").eq("business_id", businessId).maybeSingle(),
  ]);
  const eCitire = eComanda ?? eSetari;
  if (eCitire) return { ok: false, error: `Nu am putut citi comanda sau configurarea: ${eCitire.message}` };
  if (!order) return { ok: false, error: "Comanda negasita" };

  const awb = (order.curiera_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda n-are AWB Curiera." };

  /* Eticheta cere doar cheia: si o integrare oprita trebuie sa-si poata tipari coletele emise. */
  const config = (setari?.curiera_config ?? null) as CurieraConfig | null;
  if (!config || !(config.api_key ?? "").trim()) {
    return {
      ok: false,
      error: "Integrarea Curiera nu mai are cheie API, deci eticheta nu se poate cere. Descarc-o din contul Curiera.",
    };
  }

  const nume = `AWB-Curiera-${awb.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
  let pdf: Buffer;
  try {
    /* ⚠ `a5` NU se trimite la Curiera: il ignora tacut si da A6. Se cere A6 si se mareste aici. */
    pdf = await etichetaCuriera(config, awb, config.dimensiune_eticheta === "a4" ? "a4" : "a6");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (config.dimensiune_eticheta !== "a5") return { ok: true, base64: pdf.toString("base64"), nume };

  try {
    return { ok: true, base64: (await etichetaPeA5(pdf)).toString("base64"), nume };
  } catch (e) {
    /* Eticheta A6 e buna si e deja aici: o marire picata nu are voie sa lase coletul fara ea.
       Dar se SPUNE, ca omul sa nu tipareasca pe A5 crezand ca e marita. */
    return {
      ok: true,
      base64: pdf.toString("base64"),
      nume,
      avertisment: `Eticheta nu s-a putut mari pe A5 (${(e as Error).message}), deci ai primit-o in A6, cum o da Curiera.`,
    };
  }
}
