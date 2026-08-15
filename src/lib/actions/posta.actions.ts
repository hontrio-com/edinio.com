"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  awbExista,
  borderouNou,
  istoricStatusuri,
  nomenclatorStatusuri,
  postaGata,
  probaConexiune,
  salveazaAwb,
  unitatiLivrare,
  type PostaConfig,
  type RezultatProba,
  type StarePosta,
} from "@/lib/posta/client";
import {
  avertismenteExpediere,
  corpExpediere,
  lipsuriExpediere,
  type AdresaPosta,
  type DateExpediere,
} from "@/lib/posta/expediere";
import { codutiNecunoscute, descriereStatus } from "@/lib/posta/statusuri";
import { avertismentePlaja, codurileRamase, problemePlaja, type PlajaConfig } from "@/lib/posta/plaja";
import { cheileNomenclatorului, unitatiIncomplete } from "@/lib/posta/unitati";
import { adaugaZileLucratoare, ziuaInRomania } from "@/lib/utils/zile-lucratoare";
import type { Json } from "@/types/database.types";

/**
 * Actiunile Poșta Română.
 *
 * ⚠ SCRISE FARA SA FI ATINS VREODATA API-UL LOR. Nu exista mediu de test si nu
 * exista cont pe care sa probam; sase endpointuri din sapte n-au raspunsul
 * documentat. Fiecare loc in care nu stim ce vine inapoi e insemnat mai jos, si in
 * fiecare purtarea aleasa e aceeasi: **nu raportam succes daca nu-l putem dovedi.**
 *
 * ⚠ Nu e curier: nu vine nimeni sa ridice. Comerciantul emite AWB-urile, apoi DUCE
 * coletele la oficiu. De aceea nu exista aici nicio actiune de „programeaza
 * ridicarea", si de aceea `dataPrezentarePresetata` inseamna ziua in care le duce.
 */

// ─── Configurare ──────────────────────────────────────────────────────────────

/**
 * Proprietarul magazinului. Se verifica INAINTE de orice citire cu service role.
 *
 * ⚠ Discriminantul e `ok`, nu prezenta lui `error`: cu o uniune pe „are camp
 * error", TypeScript nu poate ingusta, iar `supabase` ramane „possibly undefined".
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

export async function savePostaConfig(
  businessId: string,
  config: PostaConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
   * primeste mascate, deci o salvare obisnuita nu trebuie sa le stearga. Fara
   * asta, mascarea ar distruge integrarea la prima apasare pe „Salveaza".
   */
  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  // Proprietatea magazinului e dovedita mai sus. Vezi src/lib/integrari/secrete.ts.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("posta_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("posta_config", config, vechi?.posta_config);

  const { error } = await supabase.from("store_settings").update({
    posta_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectPosta(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    posta_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune.
 *
 * ⚠ Doua CITIRI, si niciuna nu creeaza nimic — spre deosebire de un „test" care ar
 * emite un AWB si ar factura un colet la fiecare apasare.
 *
 * ⚠ Si intoarce TREI raspunsuri, nu doua. Vezi `probaConexiune` din client: daca
 * nomenclatorul se dovedeste public, o bifa verde n-ar dovedi nimic despre user si
 * parola — si atunci comerciantul ar afla ca nu e conectat abia la prima expediere,
 * exact capcana platita la eColet.
 */
export async function testPostaConnectionAction(
  businessId: string,
  config: PostaConfig,
): Promise<RezultatProba | { fel: "eroare"; mesaj: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { fel: "eroare", mesaj: ctx.error };

  /* Parola poate veni mascata din formular: se ia cea salvata. */
  const parola = await secretDinConfig(businessId, "posta_config", "password", config.password);
  if (!config.username?.trim()) return { fel: "eroare", mesaj: "Completeaza utilizatorul Postei." };
  if (!parola) return { fel: "eroare", mesaj: "Completeaza parola." };

  return probaConexiune({ ...config, password: parola });
}

/**
 * Diagnosticul integrarii, pentru pagina de configurare.
 *
 * ⚠ EXISTA TOCMAI FIINDCA NU AM VAZUT NICIODATA RASPUNSURILE LOR.
 *
 * Trei masuratori pe care nicio documentatie nu ni le poate da:
 *   - ce coduri de status au aparut la ei si nu sunt in tabelul nostru;
 *   - cate oficii au ramas fara denumire (adica: am ghicit gresit numele
 *     campurilor din nomenclator, iar selectorul din checkout e inutilizabil);
 *   - cum se cheama de fapt cheile nomenclatorului.
 *
 * La primul comerciant cu cont adevarat, pagina asta spune in cateva secunde ce ar
 * fi cerut altfel o sesiune de sapat prin loguri.
 */
export async function diagnosticPostaAction(
  businessId: string,
): Promise<
  | {
      ok: true;
      statusuriNoi: { cod: number; nume: string }[];
      unitati: number;
      unitatiFaraNume: number;
      cheiUnitati: { cheie: string; exemplu: string }[];
    }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!postaGata(config)) return { ok: false, error: "Posta Romana nu este configurata complet." };

  try {
    const [statusuri, unitati] = await Promise.all([
      nomenclatorStatusuri(config),
      unitatiLivrare(config),
    ]);
    return {
      ok: true,
      statusuriNoi: codutiNecunoscute(statusuri),
      unitati: unitati.length,
      unitatiFaraNume: unitatiIncomplete(unitati),
      cheiUnitati: cheileNomenclatorului(unitati),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Configurarea, citita cu SERVICE ROLE.
 *
 * ⚠ Vederea `public.store_settings` nu decripteaza pentru `authenticated`, deci pe
 * clientul comerciantului parola ar sosi `enc.v1.…` si Posta ar respinge orice
 * cerere. Service role ocoleste RLS — de aceea proprietatea se verifica INAINTE,
 * la fiecare apelant.
 */
async function configDinBaza(businessId: string): Promise<PostaConfig | null> {
  const { data } = await createAdminClient()
    .from("store_settings").select("posta_config").eq("business_id", businessId).single();
  return (data?.posta_config ?? null) as PostaConfig | null;
}

// ─── Plaja de coduri ──────────────────────────────────────────────────────────

export async function getPostaPlajaAction(
  businessId: string,
): Promise<{ ok: true; plaja: (PlajaConfig & { urmator: number; ramase: number }) | null } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { data } = await createAdminClient()
    .from("posta_plaja").select("*").eq("business_id", businessId).maybeSingle();
  if (!data) return { ok: true, plaja: null };

  const plaja: PlajaConfig = {
    prefix: data.prefix, deLa: data.de_la, panaLa: data.pana_la, cifre: data.cifre,
  };
  return { ok: true, plaja: { ...plaja, urmator: data.urmator, ramase: codurileRamase(plaja, data.urmator) } };
}

/**
 * Salveaza plaja de coduri.
 *
 * ⚠ `urmator` NU se poate cobori dintr-o salvare obisnuita: ar reda coduri deja
 * folosite, iar Posta ar primi acelasi AWB de doua ori. Se muta doar cand se
 * schimba chiar intervalul, si atunci porneste de la capatul lui.
 */
export async function savePostaPlajaAction(
  businessId: string,
  plaja: PlajaConfig | null,
): Promise<{ success: true; avertismente: string[] } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const admin = createAdminClient();

  if (!plaja) {
    const { error } = await admin.from("posta_plaja").delete().eq("business_id", businessId);
    return error ? { error: error.message } : { success: true, avertismente: [] };
  }

  const probleme = problemePlaja(plaja);
  if (probleme.length) return { error: probleme.join("; ") };

  const { data: veche } = await admin
    .from("posta_plaja").select("de_la, pana_la, prefix, cifre, urmator")
    .eq("business_id", businessId).maybeSingle();

  const acelasiInterval = veche
    && veche.de_la === plaja.deLa && veche.pana_la === plaja.panaLa
    && veche.prefix === plaja.prefix && veche.cifre === plaja.cifre;

  const urmator = acelasiInterval ? veche.urmator : plaja.deLa;

  const { error } = await admin.from("posta_plaja").upsert({
    business_id: businessId,
    prefix: plaja.prefix,
    de_la: plaja.deLa,
    pana_la: plaja.panaLa,
    cifre: plaja.cifre,
    urmator,
    updated_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  return { success: true, avertismente: avertismentePlaja(plaja) };
}

// ─── Context pentru AWB ───────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const admin = createAdminClient();
  const [{ data: settings }, { data: order }, { data: firma }] = await Promise.all([
    admin.from("store_settings").select("posta_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    supabase
      .from("businesses")
      .select("business_name, store_name, store_address, store_city, store_county, address, city, county, phone, email")
      .eq("id", businessId)
      .single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.posta_config ?? null) as PostaConfig | null;
  if (!postaGata(config)) {
    return {
      error:
        "Posta Romana nu e configurata complet. Ai nevoie de utilizator, parola si de codul "
        + "de trimitere din contract.",
    };
  }

  return { supabase, admin, config, order, firma };
}

export type DateAwbPosta = {
  destinatar: AdresaPosta;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareMarfa?: number;
  /** Livrare la oficiu. Cand e pornita, `idOficiuPR` e obligatoriu. */
  postRestant?: boolean;
  idOficiuPR?: string | null;
  /** Ziua in care comerciantul duce coletele la oficiu („AAAA-LL-ZZ"). */
  dataPrezentare?: string | null;
  oraPrezentare?: string | null;
  /** Suprascrie bifele din configurare, pentru comanda asta. */
  servicii?: PostaConfig["servicii"];
};

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

export async function createPostaAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbPosta,
): Promise<{ awb: string; avertismente: string[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order, firma } = ctx;

  const comanda = order as typeof order & { posta_awb_number?: string | null };
  if (comanda.posta_awb_number) return { error: "AWB-ul Postei a fost deja creat pentru comanda asta." };

  /*
   * ⚠ Expeditorul NU vine din browser.
   *
   * Se compune pe server, din datele magazinului — si numai daca omul a cerut
   * anume alta adresa de ridicare. Implicitul e sa NU-l trimitem deloc:
   * documentatia spune ca datele lipsa „se vor completa automat cu detaliile
   * contului după care se face apelul", adica din contract, care e sursa
   * adevarata. Trimis de noi, ar putea sa nu se potriveasca cu contractul.
   */
  const expeditor: AdresaPosta | null = config.expeditor && Object.keys(config.expeditor).length > 0
    ? {
        nume: config.expeditor.nume || firma?.store_name || firma?.business_name || "",
        strada: config.expeditor.adresa || firma?.store_address || firma?.address || "",
        oras: config.expeditor.localitate || firma?.store_city || firma?.city || "",
        judet: config.expeditor.judet || firma?.store_county || firma?.county || null,
        codPostal: config.expeditor.codPostal ?? null,
        telefon: config.expeditor.telefon || firma?.phone || null,
        email: config.expeditor.email || firma?.email || null,
        persoanaContact: config.expeditor.persoanaDeContact ?? null,
      }
    : null;

  /* Ziua in care comerciantul duce coletele la oficiu. */
  const dataPrezentare = (date.dataPrezentare ?? "").trim()
    || adaugaZileLucratoare(ziuaInRomania(), config.zile_pana_la_prezentare ?? 0);

  const dateExpediere: DateExpediere = {
    expeditor,
    destinatar: date.destinatar,
    greutateKg: date.greutateKg,
    codTrimitere: config.cod_trimitere,
    continut: date.continut,
    ramburs: date.ramburs,
    valoareMarfa: date.valoareMarfa,
    modValoare: config.valoare_declarata ?? "minim",
    postRestant: date.postRestant,
    idOficiuPR: date.idOficiuPR,
    /* Bifele vin din contract (configurare); comanda poate doar sa le completeze. */
    servicii: { ...config.servicii, ...date.servicii },
    tipMandat: config.tip_mandat,
    tipAchitareRamburs: config.tip_achitare_ramburs,
    tipPersoana: areFirma(order) ? "JURIDICA" : "FIZICA",
    idComanda: String(order.order_number ?? orderId),
    nrFactura: numarFactura(order),
    obiectRamburs: date.continut ?? null,
    dataPrezentare,
    oraPrezentare: date.oraPrezentare,
  };

  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din
   * registru: o comanda careia ii lipseste strada n-are de ce sa ocupe un slot.
   * Si mai ales: refuzul Postei ar veni intr-un format pe care documentatia nu-l
   * descrie, deci n-am avea ce sa-i spunem comerciantului.
   */
  const lipsuri = lipsuriExpediere(dateExpediere);
  if (lipsuri.length) {
    return { error: `Nu se poate emite AWB-ul: ${lipsuri.join("; ")}.` };
  }

  const avertismente = avertismenteExpediere(dateExpediere);

  const corp = corpExpediere(dateExpediere);

  // ── Apelul, sub protectia registrului ──────────────────────────────────────

  const r = await cuRegistru(
    admin,
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "posta",
      cheie: cheieOperatie("awb", "posta", orderId),
    },
    async () => {
      /*
       * ⚠ CODUL DIN PLAJA SE ALOCA AICI, INAUNTRUL REGISTRULUI.
       *
       * De ce inauntru: registrul poate raspunde „deja" (operatia s-a facut) sau
       * „blocat" (o incercare identica e in curs) FARA sa cheme niciodata functia
       * asta. Alocat inainte, fiecare astfel de apasare ar fi ars un cod degeaba —
       * si tocmai cand comerciantul apasa de mai multe ori, adica exact atunci cand
       * registrul isi face treaba.
       *
       * De ce tot inainte de apelul HTTP: cu codul stiut, garda de idempotenta e
       * chiar el, iar confirmarea „chiar s-a creat?" se ia din `GET /api/awb/{cod}`,
       * o citire gratuita. Fara plaja, codul il genereaza ei si depindem de un
       * raspuns pe care documentatia nu-l descrie.
       */
      const codAlocat = await alocaCodDinPlaja(admin, businessId);

      /*
       * ⚠ Si borderoul se creeaza tot AICI, din acelasi motiv.
       *
       * `POST /borderou/new` CREEAZA ceva la ei. Chemat inaintea registrului,
       * fiecare apasare respinsa cu „deja"/„blocat" ar fi lasat in urma un
       * borderou gol — iar noi n-avem cu ce sa-l stergem: API-ul lor n-are nici
       * metoda de anulare, nici de prezentare.
       *
       * ⚠ Si nu OPRESTE emiterea daca pica: borderoul e o inlesnire, nu o
       * conditie. `"idBorderou": null` e chiar in exemplul lor.
       */
      let idBorderou: number | null = null;
      if (config.foloseste_borderou) {
        try {
          idBorderou = await borderouNou(config);
        } catch (e) {
          avertismente.push(
            `Borderoul nu s-a putut crea (${(e as Error).message}). AWB-ul s-a emis fara borderou.`,
          );
        }
      }

      const corpFinal = {
        ...corp,
        ...(codAlocat ? { codAwb: codAlocat } : {}),
        idBorderou,
      };

      const rezultat = await salveazaAwb(config, corpFinal);

      /*
       * ⚠ AICI E LOCUL CEL MAI PERICULOS DIN TOATA INTEGRAREA.
       *
       * `POST /api/awb` a raspuns 2xx, deci trimiterea aproape sigur exista. Dar
       * documentatia NU descrie raspunsul, deci s-ar putea sa nu-i fi gasit codul.
       *
       * Fara plaja n-avem alta sursa: se arunca `necunoscut`, ceea ce lasa randul
       * blocat in registru si scoate cazul la om. Un „a esuat" ar debloca
       * reincercarea si ar produce a doua trimitere, reala si facturata.
       */
      if (!rezultat.cod) {
        throw new Error(
          "Posta a raspuns la emitere, dar n-am recunoscut niciun cod AWB in raspuns. "
          + "Verifica in aplicatia lor daca trimiterea s-a creat, inainte sa incerci din nou.",
        );
      }

      return {
        referinta: rezultat.cod,
        /* ⚠ Raspunsul brut ramane in registru: la prima expediere reala, el e
           singura dovada a formei adevarate. Vezi `citesteCodAwb`. */
        detalii: {
          idBorderou,
          dinPlaja: !!codAlocat,
          raspuns: rezultat.brut as Json,
        } as Json,
        valoare: { awb: rezultat.cod, idBorderou },
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, dinadins — aceeasi hotarare ca la GLS si Pall-Ex.
     *
     * Predicatul pe care l-ar trimite ceilalti se citeste dintr-un obiect luat
     * INAINTE de un `return` timpuriu, deci e constant fals; iar `false` pe ramura
     * `deja` inseamna „elibereaza slotul si REIA", adica a doua trimitere reala.
     * Fara callback, `deja` ADOPTA rezultatul din registru si il scrie inapoi pe
     * comanda.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as { idBorderou?: unknown } | null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");
  const borderou = r.fel === "facut"
    ? r.valoare.idBorderou
    : (Number.isInteger(Number(dinRegistru?.idBorderou)) ? Number(dinRegistru?.idBorderou) : null);

  if (!awb) {
    return {
      error:
        "Operatia figureaza ca reusita in registru, dar fara numar AWB. "
        + "Verifica in aplicatia Postei si scrie numarul pe comanda.",
    };
  }

  // ── Scrierea pe comanda ────────────────────────────────────────────────────

  /* `.eq("business_id")` nu e de prisos: fara el, zero randuri modificate ar putea
     insemna si „alta comanda", nu doar „scriere pierduta". */
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    posta_awb_number: awb,
    posta_borderou_id: borderou,
    posta_oficiu_id: date.postRestant ? (date.idOficiuPR ?? null) : null,
    /* Ancora ferestrei de urmarire. Vezi `posta_awb_at` din migratia 02.09. */
    posta_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Trimiterea EXISTA la Posta. Un esec de scriere nu are voie sa se intoarca la
   * om ca eroare — l-ar trimite sa apese din nou, iar registrul ar raspunde „deja"
   * si ar reface doar scrierea. Se alarmeaza, si se raporteaza succes.
   */
  const scrisPeComanda = !eScriere && !!randuri && randuri.length > 0;
  if (!scrisPeComanda) {
    await logError({
      action: "posta.createAwb",
      message: `AWB Posta creat (${awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Numarul e in registrul de operatii externe; o noua apasare pe „Creeaza AWB" il adopta si reface scrierea.`,
      details: { orderId, businessId, awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    /*
     * Marketplace-ul trebuie sa afle numarul de urmarire, ca la ceilalti opt
     * transportatori. Se cheama DUPA ce scrierea a prins un rand: coada citeste
     * numarul din baza.
     */
    void enqueueAboutYouShip(businessId, orderId);
  }

  return { awb, avertismente };
}

/**
 * Urmatorul cod din plaja magazinului, sau `null` daca nu lucreaza cu plaja.
 *
 * ⚠ ARUNCA `eroareRefuz` LA EPUIZARE, si asta e ales cu grija.
 *
 * Verdictul „esuat" din registru nu inseamna „furnizorul a spus nu", inseamna
 * **dovedit ca nu s-a intamplat nimic** — iar aici chiar nu s-a intamplat: n-am
 * apucat sa chemam Posta. Cu verdictul asta randul NU blocheaza, deci comerciantul
 * poate reincerca imediat ce primeste o plaja noua. Cu „necunoscut" (implicitul),
 * comanda ar fi ramas blocata pentru o problema care nu e a Postei.
 */
async function alocaCodDinPlaja(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("posta_aloca_cod", { p_business_id: businessId });
  if (error) throw eroareRefuz(`Nu s-a putut lua un cod din plaja: ${error.message}`);

  const cod = (data as string | null) ?? null;
  if (cod) return cod;

  /*
   * `null` inseamna DOUA lucruri diferite: magazinul n-are plaja (si atunci e in
   * regula, codul il genereaza Posta), sau plaja s-a epuizat — si aia trebuie spusa.
   */
  const { data: plaja } = await admin
    .from("posta_plaja").select("urmator, pana_la").eq("business_id", businessId).maybeSingle();
  if (plaja && plaja.urmator > plaja.pana_la) {
    throw eroareRefuz(
      "S-au terminat codurile AWB din plaja alocata. Cere alta plaja de la Posta si "
      + "actualizeaz-o in configurare.",
    );
  }
  return null;
}

/**
 * Comanda e pe firma? Atunci `tipPersoana` pleaca „JURIDICA".
 *
 * Sursa e `orders.billing_company` (jsonb), acelasi loc din care se compune si
 * partea de facturare — vezi `invoiceParty`. Comenzile obisnuite il au `null`.
 */
function areFirma(order: Record<string, unknown>): boolean {
  const firma = (order.billing_company ?? null) as { company_name?: unknown; cui?: unknown } | null;
  if (!firma) return false;
  return !!(String(firma.company_name ?? "").trim() || String(firma.cui ?? "").trim());
}

/** Numarul facturii, de pe oricare dintre casele de facturare. */
function numarFactura(order: Record<string, unknown>): string | null {
  for (const camp of ["smartbill_invoice_number", "oblio_invoice_number", "fgo_invoice_number"]) {
    const v = order[camp];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// ─── Dezlegarea AWB-ului ──────────────────────────────────────────────────────

/**
 * Scoate AWB-ul de pe comanda si elibereaza slotul din registru.
 *
 * ═══ ⚠ NU E O ANULARE, SI INTERFATA TREBUIE SA SPUNA ASTA ═══
 *
 * API-ul Postei **nu are metoda de anulare**. Statusul 56 „Anulat" exista in
 * nomenclatorul lor, deci anularea exista la ei — dar nu prin API-ul asta. Deci
 * actiunea de fata NU atinge Posta deloc: comerciantul trebuie sa anuleze
 * trimiterea la oficiu sau in aplicatia lor.
 *
 * ⚠ Atunci de ce exista? Fiindca fara ea comanda ramane blocata. Registrul tine
 * slotul ocupat cat timp operatia figureaza reusita, deci o reemitere ar primi
 * „deja" si ar scrie inapoi acelasi numar. Un AWB gresit ar ramane pe comanda
 * pentru totdeauna, si nimic din panou n-ar putea sa-l scoata.
 *
 * ⚠ Se verifica INTAI daca trimiterea mai exista la ei, si daca EXISTA se refuza —
 * altfel un click gresit ar sterge evidenta unui colet care chiar pleaca, iar
 * comerciantul ar ramane cu marfa in drum si fara nimic de urmarit.
 */
export async function dezleagaPostaAwbAction(
  businessId: string,
  orderId: string,
  /** Comerciantul confirma ca a anulat trimiterea la Posta. */
  confirmatAnulatLaPosta: boolean,
): Promise<{ success: true; mesaj: string } | { error: string }> {
  /*
   * ⚠ NU trece prin `configSiComanda`, si asta e o hotarare.
   *
   * Aceea cere integrarea CONFIGURATA COMPLET. Dar dezlegarea e singurul fel in
   * care o comanda blocata se poate repara din panou — iar un comerciant care si-a
   * oprit intre timp integrarea Postei ar fi ramas cu comanda blocata pentru
   * totdeauna, fara nimic de apasat nicaieri. Fundatura, produsa chiar de reparatia
   * gandita sa scoata din fundaturi.
   *
   * Deci: proprietatea se verifica (obligatoriu), configurarea se citeste daca
   * exista, iar verificarea la Posta se face doar cand avem cu ce.
   */
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;
  const admin = createAdminClient();

  const { data: order } = await supabase
    .from("orders").select("id, posta_awb_number").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda negasita" };

  const config = await configDinBaza(businessId);

  const comanda = order as typeof order & { posta_awb_number?: string | null };
  const awb = (comanda.posta_awb_number ?? "").trim();
  if (!awb) return { error: "Comanda nu are AWB de la Posta." };

  if (!confirmatAnulatLaPosta) {
    return {
      error:
        "API-ul Postei nu are metoda de anulare. Anuleaza intai trimiterea la oficiu sau in "
        + "aplicatia lor, apoi bifeaza confirmarea — abia atunci se poate scoate numarul de pe comanda.",
    };
  }

  /*
   * ⚠ Daca trimiterea inca exista la ei, NU o dezlegam.
   *
   * `awbExista` intoarce trei valori: da, nu, si „n-am putut afla". Numai un „da"
   * limpede opreste — o cadere de retea nu are voie sa blocheze o reparatie, dar
   * nici sa treaca drept dovada ca trimiterea a disparut.
   *
   * ⚠ Fara configurare nu se poate intreba deloc. Atunci se merge inainte, pe
   * confirmarea omului: e chiar cazul comerciantului care a deconectat integrarea
   * si acum incearca sa-si descurce o comanda veche.
   */
  const exista = postaGata(config) ? await awbExista(config, awb) : null;
  if (exista === true) {
    return {
      error:
        `Trimiterea ${awb} inca figureaza la Posta. Anuleaz-o la ei mai intai; daca ai facut-o `
        + "deja, asteapta sa se actualizeze si incearca din nou.",
    };
  }

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    posta_awb_number: null,
    posta_borderou_id: null,
    posta_oficiu_id: null,
    posta_awb_at: null,
    posta_status_code: null,
    posta_status_checked_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    return { error: `Numarul nu s-a putut scoate de pe comanda: ${eScriere?.message ?? "niciun rand modificat"}` };
  }

  /*
   * ⚠ Eliberarea slotului vine DUPA scrierea pe comanda, si numai daca aceasta a
   * prins un rand. Invers, am fi deschis reemiterea pentru o comanda care inca
   * poarta AWB-ul vechi — iar a doua emitere ar fi fost o trimitere reala in plus.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "posta", orderId));

  return {
    success: true,
    mesaj: eliberat
      ? `AWB-ul ${awb} a fost scos de pe comanda. Poti emite altul.`
      : `AWB-ul ${awb} a fost scos de pe comanda, dar slotul din registru n-a putut fi eliberat. `
        + "Daca reemiterea da „operatie deja efectuata”, scrie-ne.",
  };
}

// ─── Urmarire, pentru panou ───────────────────────────────────────────────────

export type StareAfisata = {
  cod: number | null;
  descriere: string;
  unitate: string | null;
  data: string | null;
};

/**
 * Istoricul unei trimiteri, pentru pagina comenzii.
 *
 * ⚠ Citire pura. Se cere LIVE cand comerciantul deschide comanda, ca la GLS:
 * cronul tine minte doar ultimul cod prelucrat, nu tot drumul.
 */
export async function getPostaTraceAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; stari: StareAfisata[] } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const awb = ((order as { posta_awb_number?: string | null }).posta_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda nu are AWB de la Posta." };

  try {
    const stari = await istoricStatusuri(config, awb);
    return { ok: true, stari: stari.map(laStareAfisata).reverse() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/*
 * ⚠ NU se exporta. Intr-un modul „use server" fiecare export devine un endpoint
 * HTTP inregistrat in manifestul global — vezi `use-server-expune-fiecare-export`.
 * Un ajutor de formatare n-are ce cauta acolo, si oricum exporturile trebuie sa
 * fie functii `async`.
 */
function laStareAfisata(s: StarePosta): StareAfisata {
  const cod = Number(s?.idStatus);
  return {
    cod: Number.isInteger(cod) && cod > 0 ? cod : null,
    /* Denumirea din tabelul nostru; necunoscuta, se arata ce au trimis ei. */
    descriere: descriereStatus(s?.idStatus, s?.statusWeb ?? s?.status ?? null),
    unitate: (s?.unitatePostala ?? "").trim() || null,
    data: (s?.data ?? s?.dataInregistrare ?? "").trim() || null,
  };
}
