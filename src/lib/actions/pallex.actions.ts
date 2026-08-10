"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  citesteBorderou,
  citestePartida,
  creeazaPartida,
  pallexGata,
  probaConexiune,
  stergePartida,
  tipuriDeStatus,
  valideazaBorderou,
  BORDEROU_NEVALIDAT,
  type PallExConfig,
  type PaletPallEx,
  type ServiciiPallEx,
  type TipPartida,
} from "@/lib/pallex/client";
import {
  adaugaZileLucratoare,
  inainteDe,
  lipsuriAdresa,
  oraNormalizata,
  partidaPallEx,
  ziuaInRomania,
  ORA_DESCHIDERE_IMPLICITA,
  ORA_INCHIDERE_IMPLICITA,
  type AdresaComanda,
} from "@/lib/pallex/expediere";
import { clasificaStatus, EXPLICATIE_CLASIFICARE, trebuieSemnalat } from "@/lib/pallex/statusuri";
import { cheieDocument } from "@/lib/pallex/documente";
import { deleteFromR2 } from "@/lib/r2";
import type { Json } from "@/types/database.types";

/**
 * Actiunile Pall-Ex (ClientPlus).
 *
 * ⚠ Nu exista mediu de test la Pall-Ex si niciun endpoint fara autentificare:
 * prima verificare pe fir e o partida REALA, facturata. De aceea fiecare apel
 * care creeaza ceva trece prin registrul de operatii externe, iar tot ce se poate
 * verifica fara retea sta in module pure, cu probe (`src/lib/pallex/`).
 *
 * ⚠ TOATE exporturile unui fisier „use server" sunt endpointuri POST publice.
 * Nimic din ce e mai jos nu e „ajutor intern": fiecare isi verifica singur
 * proprietatea magazinului.
 */

// ─── Proprietate ──────────────────────────────────────────────────────────────

/**
 * Proprietarul magazinului. Se verifica INAINTE de orice citire cu service role.
 *
 * ⚠ Discriminantul e `ok`, nu prezenta lui `error`: cu o uniune pe „are camp
 * error", TypeScript nu poate ingusta, fiindca `error: string` cuprinde si sirul
 * gol. Aceeasi forma ca la GLS.
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

// ─── Configurare ──────────────────────────────────────────────────────────────

export async function savePallexConfig(
  businessId: string,
  config: PallExConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
   * primeste mascate, deci o salvare obisnuita nu trebuie sa le stearga. Fara
   * asta, mascarea ar distruge integrarea la prima apasare pe „Salveaza".
   *
   * ⚠ Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului
   * vederea intoarce `enc.v1.…`, iar `pastreazaSecretele` l-ar „pastra" ca atare
   * — adica ar trimite textul cifrat pe post de parola la urmatorul apel.
   */
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("pallex_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("pallex_config", config, vechi?.pallex_config);

  const { error } = await supabase.from("store_settings").update({
    pallex_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectPallex(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    pallex_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export type StatusAratat = {
  id: number;
  nume: string;
  urmare: string;
  semnalat: boolean;
};

/**
 * Proba de conexiune, care aduce si vocabularul real de statusuri.
 *
 * ⚠ Face o CITIRE (`/consignment_status_types`), nu o creare. Un „testeaza
 * conexiunea" care ar face o partida ar produce un transport real la fiecare
 * apasare — iar butonul se apasa de zece ori pana ies datele bune.
 *
 * ⚠ Lista de statusuri se intoarce catre panou DINADINS, si nu ca ornament.
 * Pall-Ex nu publica nicaieri ce statusuri are, iar `src/lib/pallex/statusuri.ts`
 * le interpreteaza dupa NUME, adica pe o presupunere. Aratate una langa alta —
 * numele adevarat al instalarii lui si ce facem noi cu el — presupunerea aia
 * devine ceva ce comerciantul poate verifica FARA sa expedieze nimic.
 */
export async function testPallexConnectionAction(
  businessId: string,
  config: PallExConfig,
): Promise<{ ok: true; statusuri: StatusAratat[] } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  if (!config.username?.trim()) return { error: "Completeaza utilizatorul ClientPlus." };
  /* Parola poate veni mascata din formular: se ia cea salvata. */
  const parola = await secretDinConfig(businessId, "pallex_config", "password", config.password);
  if (!parola) return { error: "Completeaza parola ClientPlus." };

  const cuParola = { ...config, password: parola };
  const r = await probaConexiune(cuParola);
  if (!r.ok) return { error: r.eroare };

  let statusuri: StatusAratat[] = [];
  try {
    statusuri = (await tipuriDeStatus(cuParola)).map((t) => ({
      id: t.id,
      nume: t.name,
      urmare: EXPLICATIE_CLASIFICARE[clasificaStatus(t.name)],
      semnalat: trebuieSemnalat(t.name),
    }));
  } catch {
    /* Conexiunea e buna — asta e tot ce promite butonul. Lista e un plus. */
  }

  return { ok: true, statusuri };
}

// ─── Context pentru partida ───────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * ⚠ Configul se citeste cu SERVICE ROLE. Vederea `public.store_settings` nu
   * decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola ar
   * veni `enc.v1.…` si Pall-Ex ar raspunde „autentificare esuata" — fara nimic in
   * mesaj despre cauza reala. Service role ocoleste RLS, de aceea proprietatea
   * magazinului s-a verificat mai sus.
   */
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }, { data: firma }] = await Promise.all([
    admin.from("store_settings").select("pallex_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    /* ⚠ Aceeasi lista de campuri ca in `bulk-orders.actions.ts`: desincronizata,
       lotul si emiterea din panou ar da erori diferite pentru aceeasi comanda. */
    supabase
      .from("businesses")
      .select("business_name, store_name, store_address, store_city, store_county, address, city, county, phone, email")
      .eq("id", businessId)
      .single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.pallex_config as PallExConfig | null;
  if (!pallexGata(config)) return { error: "Pall-Ex nu este configurat complet" as const };

  return { supabase, config, order, firma };
}

/** Coloanele Pall-Ex de pe comanda, pe care tipurile generate nu le expun peste tot. */
type ComandaPallex = {
  pallex_awb_number?: string | null;
  pallex_consignment_id?: number | null;
  pallex_bordereau_id?: number | null;
};

export type DatePallEx = {
  destinatar: AdresaComanda;
  /*
   * ⚠ EXPEDITORUL NU VINE DIN BROWSER.
   *
   * Se compune pe server, din datele magazinului si din configurare. Altfel
   * oricine cu o sesiune de comerciant ar putea crea o partida pe contractul
   * Pall-Ex al magazinului cu orice adresa de ridicare — inclusiv una straina, pe
   * cheltuiala lui.
   */
  numarPaleti: number;
  greutateKg: number;
  paleti?: PaletPallEx[];
  /** „AAAA-LL-ZZ". Lipsa, se calculeaza din configurare. */
  dataRidicare?: string | null;
  dataLivrare?: string | null;
  oraDeschidereLivrare?: string | null;
  oraInchidereLivrare?: string | null;
  valoare?: number;
  observatii?: string | null;
  servicii?: ServiciiPallEx;
  /**
   * ⚠ „Am inteles ca Pall-Ex NU incaseaza la livrare."
   *
   * Vezi verificarea din `createPallexAwbAction`. Nu e o formalitate: fara ea,
   * marfa pleaca si nu exista NICIO cale prin care banii sa se intoarca.
   */
  confirmaFaraIncasare?: boolean;
};

// ─── Crearea partidei ─────────────────────────────────────────────────────────

export async function createPallexAwbAction(
  businessId: string,
  orderId: string,
  date: DatePallEx,
): Promise<
  | { awb: string; consignmentId: number; bordereauId: number | null; validat: boolean }
  | { error: string }
> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, firma } = ctx;

  const comanda = order as typeof order & ComandaPallex;
  if (comanda.pallex_awb_number) return { error: "Partida Pall-Ex a fost deja creata" };

  /*
   * ⚠ Expeditorul se compune AICI, din datele magazinului — nu vine din browser.
   *
   * `store_*` sunt adresa publica a magazinului (de unde se ridica marfa); daca
   * lipsesc, se cade pe adresa firmei. Codul postal si judetul vin din
   * CONFIGURAREA Pall-Ex: in `businesses` nu exista niciun camp de cod postal,
   * iar amandoua sunt `required` la ClientPlus.
   */
  const expeditor: AdresaComanda = {
    nume: firma?.store_name || firma?.business_name || "",
    strada: firma?.store_address || firma?.address || "",
    oras: firma?.store_city || firma?.city || "",
    judet: config.expeditor_judet || firma?.store_county || firma?.county || null,
    codPostal: config.expeditor_cod_postal ?? null,
    contact: config.expeditor_contact || null,
    telefon: firma?.phone ?? null,
  };

  /*
   * ⚠ Toate verificarile care NU ating Pall-Ex raman INAINTEA rezervarii in
   * registru: o comanda fara cod postal n-are de ce sa ocupe un slot.
   *
   * Si se enumera TOATE lipsurile deodata, nu prima. La Pall-Ex sunt cinci campuri
   * obligatorii pe fiecare adresa, iar raspunsul lui la lipsa (422 cu `meta`) nu
   * are niciun text — un mesaj pe rand ar fi insemnat cinci drumuri pana la
   * formular pentru aceeasi comanda.
   */
  const lipsuri = [
    ...lipsuriAdresa(expeditor, "expeditor"),
    ...lipsuriAdresa(date.destinatar, "destinatar"),
  ];
  if (lipsuri.length > 0) {
    const dinConfigurare = lipsuri.some((l) => l.includes("expeditor"));
    return {
      error:
        `Pall-Ex cere si campurile astea: ${lipsuri.join(", ")}.`
        + (dinConfigurare
          ? " Datele expeditorului se completeaza in setarile magazinului si in configurarea Pall-Ex (cod postal si judet de ridicare)."
          : ""),
    };
  }

  /*
   * ⚠⚠ PALL-EX NU INCASEAZA LA LIVRARE.
   *
   * API-ul (OpenAPI 1.0.5) nu are NICIUN camp de ramburs — nici pe partida, nici
   * pe palet. Nu e o scapare a documentatiei: sunt 32 de campuri si sapte servicii
   * optionale, si niciunul nu e incasare.
   *
   * Deci pe o comanda cu bani neincasati, marfa pleaca si NU exista nicio cale
   * prin care ei sa se mai intoarca. Nu e o greseala pe care s-o poata repara
   * cineva a doua zi: paletul e la client, si numai o discutie cu el mai poate
   * face ceva.
   *
   * Nu blocam de tot — comerciantul poate sa fi incasat prin transfer, sau sa fi
   * hotarat asa — dar cerem sa spuna explicit ca stie. `rambursDeIncasat`
   * raspunde dupa BANI, nu dupa metoda de plata: o comanda cu card ramasa
   * neplatita intra si ea aici, si e chiar cazul care s-a intamplat in productie.
   */
  const deIncasat = rambursDeIncasat({ payment_status: order.payment_status, total: order.total });
  if (deIncasat > 0 && !date.confirmaFaraIncasare) {
    return {
      error:
        `Comanda are ${deIncasat.toFixed(2)} lei neincasati, iar Pall-Ex NU incaseaza la livrare `
        + "(nu are ramburs, deloc). Incaseaza banii inainte, sau bifeaza in formular ca trimiti oricum.",
    };
  }

  // ── Datele si ferestrele orare ──────────────────────────────────────────────

  const azi = ziuaInRomania();
  const dataRidicare = (date.dataRidicare ?? "").trim()
    || adaugaZileLucratoare(azi, config.zile_pana_la_ridicare ?? 1);
  const dataLivrare = (date.dataLivrare ?? "").trim()
    || adaugaZileLucratoare(dataRidicare, config.zile_pana_la_livrare ?? 2);

  /*
   * ⚠ Verificate AICI, nu lasate pe seama lui Pall-Ex.
   *
   * Raspunsul lui la o data imposibila e `{"status": 422, "meta":
   * ["collection_date"]}` — fara niciun text. Comerciantul ar fi primit „Pall-Ex a
   * respins datele: data de ridicare" fara sa afle CE e in neregula cu ea.
   */
  if (inainteDe(dataRidicare, azi)) {
    return { error: `Data de ridicare (${dataRidicare}) e in trecut. Alege o zi de azi incolo.` };
  }
  if (inainteDe(dataLivrare, dataRidicare)) {
    return { error: `Data de livrare (${dataLivrare}) e inaintea celei de ridicare (${dataRidicare}).` };
  }

  const ora = (
    dinFormular: string | null | undefined,
    dinConfig: string | undefined,
    implicit: string,
  ) => oraNormalizata(dinFormular) ?? oraNormalizata(dinConfig) ?? implicit;

  const partida = partidaPallEx({
    referinta: String(order.order_number ?? orderId),
    tip: (config.tip_partida ?? 3) as TipPartida,
    expeditor,
    destinatar: date.destinatar,
    dataRidicare,
    oraDeschidereRidicare: ora(null, config.ora_deschidere, ORA_DESCHIDERE_IMPLICITA),
    oraInchidereRidicare: ora(null, config.ora_inchidere, ORA_INCHIDERE_IMPLICITA),
    dataLivrare,
    oraDeschidereLivrare: ora(date.oraDeschidereLivrare, config.ora_deschidere_livrare, ORA_DESCHIDERE_IMPLICITA),
    oraInchidereLivrare: ora(date.oraInchidereLivrare, config.ora_inchidere_livrare, ORA_INCHIDERE_IMPLICITA),
    numarPaleti: date.numarPaleti,
    greutateKg: date.greutateKg,
    paleti: date.paleti,
    valoare: date.valoare,
    observatii: date.observatii,
    /* Serviciile de RIDICARE tin de depozitul comerciantului, deci vin din
       configurare; cele de LIVRARE tin de comanda si vin din formular. */
    servicii: {
      liftLaRidicare: config.servicii?.liftLaRidicare,
      accesRestrictionatLaRidicare: config.servicii?.accesRestrictionatLaRidicare,
      ...date.servicii,
    },
  });

  // ── Apelul, sub protectia registrului ───────────────────────────────────────

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "pallex",
      cheie: cheieOperatie("awb", "pallex", orderId),
    },
    async () => {
      const creata = await creeazaPartida(config, partida);

      /*
       * ⚠ Codul pe care il vede clientul (`pallex_id`, „C202012345678") NU vine in
       * raspunsul crearii: acela are doar `id` si `bordereau_id`. Se cere printr-o
       * citire, imediat.
       *
       * Si citirea aceea NU are voie sa strice nimic daca pica: partida EXISTA
       * deja. De aia e prinsa, iar comanda primeste pe moment ID-ul ClientPlus ca
       * numar — cronul de urmarire il inlocuieste cu codul adevarat cand apare.
       */
      let pallexId: string | null = null;
      let barcode: string | null = null;
      let borderou = creata.bordereau_id;
      try {
        const citita = await citestePartida(config, creata.id);
        pallexId = citita?.pallex_id?.trim() || null;
        barcode = citita?.pallex_barcode?.trim() || null;
        if (borderou === null && Number.isInteger(citita?.bordereau_id)) {
          borderou = citita!.bordereau_id!;
        }
      } catch {
        /* Ramane pe ID-ul ClientPlus; cronul completeaza. */
      }

      const awb = pallexId || String(creata.id);
      return {
        referinta: awb,
        detalii: { consignmentId: creata.id, bordereauId: borderou, pallexId, barcode },
        valoare: { awb, consignmentId: creata.id, bordereauId: borderou },
      };
    },
    /* `apel` marcheaza singur refuzurile (4xx) si nesigurantele (5xx, timeout). */
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, dinadins — vezi comentariul din `gls.actions.ts`.
     *
     * Predicatul pe care il trimit ceilalti curieri e citit dintr-un obiect luat
     * INAINTE de un `return` timpuriu, deci e constant fals; iar `false` pe ramura
     * `deja` inseamna „elibereaza slotul si REIA", adica a doua partida reala si
     * facturata. Fara callback, `deja` ADOPTA rezultatul din registru si il scrie
     * inapoi pe comanda — iar cazul de care s-ar fi temut predicatul (o anulare a
     * carei eliberare s-a pierdut) se repara singur: comanda primeste inapoi un
     * ID care nu mai exista, comerciantul incearca sa-l anuleze, Pall-Ex raspunde
     * 404, iar `deletePallexAwbAction` trateaza asta ca disparut si elibereaza.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  /*
   * Pe `deja`, partida exista de la o incercare careia i s-a pierdut scrierea.
   * ID-urile se iau din registru, ca legatura sa se refaca — fara ele comanda ar
   * ramane cu un numar pe care nimeni nu-l mai poate nici anula, nici descarca.
   */
  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as
    { consignmentId?: unknown; bordereauId?: unknown } | null;
  const rezultat = r.fel === "facut"
    ? r.valoare
    : {
        awb: r.referinta ?? "",
        consignmentId: Number(dinRegistru?.consignmentId) || 0,
        bordereauId: Number(dinRegistru?.bordereauId) || null,
      };

  // ── Scrierea pe comanda ─────────────────────────────────────────────────────

  /* `.eq("business_id")` nu e de prisos: fara el, zero randuri modificate ar putea
     insemna si „alta comanda", nu doar „scriere pierduta", iar alarma de mai jos
     ar fi ambigua exact acolo unde trebuie sa fie limpede. */
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    pallex_awb_number: rezultat.awb,
    pallex_consignment_id: rezultat.consignmentId || null,
    pallex_bordereau_id: rezultat.bordereauId,
    /* Ancora ferestrei de urmarire. Vezi `pallex_awb_at` din migratia 30.08. */
    pallex_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Partida EXISTA la Pall-Ex. Un esec de scriere nu mai are voie sa se intoarca
   * la om ca eroare — l-ar trimite sa apese din nou, iar a doua apasare ar
   * factura al doilea transport. Registrul retine deja operatia, deci reincercarea
   * o adopta si reface doar scrierea.
   */
  const scrisPeComanda = !eScriere && !!randuri && randuri.length > 0;
  if (!scrisPeComanda) {
    await logError({
      action: "pallex.createAwb",
      message: `Partida Pall-Ex creata (${rezultat.awb}, id ${rezultat.consignmentId}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Borderoul NU s-a validat automat, deci marfa nu pleaca pana la o noua apasare pe „Creeaza partida" (care adopta partida existenta din registru).`,
      details: { orderId, businessId, awb: rezultat.awb, consignmentId: rezultat.consignmentId, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    /*
     * ⚠ Marketplace-ul trebuie sa afle numarul de urmarire, ca la ceilalti sase
     * curieri. Fara randul asta, o comanda de pe About You expediata cu Pall-Ex
     * ramane la ei fara AWB: clientul n-are ce urmari, iar About You o socoteste
     * neexpediata — cu penalizarile de rigoare. Si nimic n-ar semnala, fiindca
     * noi raportam „reusit".
     *
     * Se cheama DUPA ce scrierea a prins un rand: coada citeste numarul din baza.
     */
    void enqueueAboutYouShip(businessId, orderId);
  }

  // ── Validarea borderoului, daca a cerut-o comerciantul ──────────────────────

  /*
   * ⚠ NU SE VALIDEAZA CAND SCRIEREA PE COMANDA A PICAT.
   *
   * Validarea e IREVERSIBILA si porneste si partidele altor comenzi din acelasi
   * borderou. Facuta chiar in clipa in care stim ca ne-am pierdut evidenta, ar
   * insemna marfa plecata definitiv pe o comanda care nu poarta niciun numar —
   * si comerciantul ar primi in acelasi timp mesajul „marfa poate pleca".
   *
   * Aceeasi regula ca la anulare, unde `marcheazaAnulata` e conditionat tot de
   * `scrisPeComanda`. Reapasarea adopta partida din registru, reface scrierea, si
   * abia atunci se poate valida.
   */
  let validat = false;
  if (scrisPeComanda && config.valideaza_automat && rezultat.bordereauId) {
    try {
      await valideazaBorderou(config, rezultat.bordereauId);
      validat = true;
    } catch (e) {
      /*
       * NU e o eroare pentru om: partida exista si e in regula, doar n-a plecat
       * inca. Butonul „Valideaza borderoul" ramane la indemana.
       */
      await logError({
        action: "pallex.valideazaAutomat",
        message: `Partida ${rezultat.awb} creata, dar borderoul ${rezultat.bordereauId} NU s-a validat automat: ${(e as Error).message}. Marfa nu pleaca pana la validare.`,
        details: { orderId, businessId, bordereauId: rezultat.bordereauId },
        businessId,
        severity: "warning",
      });
    }
  }

  return { ...rezultat, validat };
}

// ─── Borderoul ────────────────────────────────────────────────────────────────

export type StareBorderou = {
  id: number;
  validat: number;
  partide: number;
};

/**
 * Starea borderoului comenzii, pentru panou.
 *
 * ⚠ Citire pura. Serveste la a-i spune comerciantului CATE partide porneste daca
 * apasa „Valideaza": un borderou strange comenzile create in aceeasi perioada, si
 * validarea le scoate pe toate din anulare.
 */
export async function stareBorderouAction(
  businessId: string,
  orderId: string,
): Promise<{ stare: StareBorderou | null } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config, order } = ctx;

  const borderouId = (order as typeof order & ComandaPallex).pallex_bordereau_id;
  if (!borderouId) return { stare: null };

  try {
    const b = await citesteBorderou(config, borderouId);
    if (!b) return { stare: null };
    return {
      stare: {
        id: borderouId,
        validat: typeof b.validated === "number" ? b.validated : BORDEROU_NEVALIDAT,
        partide: Array.isArray(b.consignments) ? b.consignments.length : 0,
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Valideaza borderoul comenzii: de aici incolo marfa pleaca.
 *
 * ═══ ⚠ DE CE NU TRECE PRIN REGISTRU ═══
 *
 * Registrul apara impotriva DUBLARII unui efect scump. O a doua validare a
 * aceluiasi borderou nu creeaza nimic — Pall-Ex raspunde ca e deja validat. Ce
 * conteaza aici e altceva, si tine de interfata: comerciantul trebuie sa stie,
 * INAINTE de a apasa, cate partide porneste. De aia exista `stareBorderouAction`.
 *
 * ═══ ⚠ IREVERSIBIL ═══
 *
 * Dupa validare, `DELETE /consignments/{id}` nu mai merge pentru NICIUNA dintre
 * partidele din borderou.
 */
export async function valideazaBorderouAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config, order } = ctx;

  const borderouId = (order as typeof order & ComandaPallex).pallex_bordereau_id;
  if (!borderouId) {
    return {
      error: "Comanda nu are borderou Pall-Ex. Emite intai partida, apoi valideaza borderoul.",
    };
  }

  try {
    await valideazaBorderou(config, borderouId);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Anularea partidei ────────────────────────────────────────────────────────

/**
 * Anularea partidei Pall-Ex.
 *
 * ═══ ⚠ DE CE NU TRECE PRIN `cuRegistru` ═══
 *
 * Ca la toti ceilalti sase curieri. Registrul apara impotriva DUBLARII unui efect
 * scump; o a doua stergere a aceleiasi partide nu creeaza nimic, Pall-Ex raspunde
 * ca n-o gaseste. Ce trebuie in schimb NEAPARAT facut e ELIBERAREA slotului de
 * creare, ca urmatoarea partida pe aceeasi comanda sa nu fie refuzata.
 *
 * ═══ ⚠ DOCUMENTELE VECHI SE STERG DIN R2 ═══
 *
 * Cheile din R2 se compun din `(businessId, orderId, fel)` — fara numarul
 * partidei. Deci dupa o anulare urmata de o reemitere, fisierele VECHI ar sta la
 * aceleasi chei, iar `/api/pallex/document` ar servi eticheta partidei ANULATE sub
 * numarul celei noi. Comerciantul ar lipi pe palet o eticheta cu un cod care nu
 * mai exista, si ar afla de la sofer.
 */
export async function deletePallexAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & ComandaPallex;
  if (!comanda.pallex_awb_number) {
    return { error: "Nu exista partida Pall-Ex pentru aceasta comanda" };
  }

  const consignmentId = Number(comanda.pallex_consignment_id);
  if (!Number.isInteger(consignmentId) || consignmentId <= 0) {
    /*
     * Mesajul spune exact ce se poate face, fiindca noi chiar nu mai putem face
     * nimic: `DELETE` primeste doar ID-ul ClientPlus, iar comanda nu-l poarta.
     * Se intampla la partidele create inainte de coloana, sau cand crearea a fost
     * adoptata din registru fara `detalii`.
     */
    return {
      error:
        `Anularea prin API nu e posibila pentru partida ${comanda.pallex_awb_number}: `
        + "identificatorul intern nu a fost pastrat la creare. Anuleaz-o din contul ClientPlus.",
    };
  }

  let rod: Awaited<ReturnType<typeof stergePartida>>;
  try {
    rod = await stergePartida(config, consignmentId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (!rod.sters) {
    /*
     * ⚠ Cazul care conteaza: borderoul a fost deja validat, deci marfa chiar
     * pleaca. Daca am goli coloanele aici, comanda ar ramane cu un transport real
     * pe care nu-l mai stie nimeni — si l-am putea crea a doua oara.
     */
    return {
      error:
        `Pall-Ex nu a anulat partida: ${rod.motiv} `
        + "Daca borderoul a fost deja validat, anularea nu mai e posibila prin API.",
    };
  }

  /*
   * ⚠ Se sterge si memoria urmaririi, nu doar numarul.
   *
   * Un `pallex_status_id` ramas de la partida anulata s-ar aplica urmatoarei:
   * daca era unul TERMINAL, `eStareFinala` ar scoate din urmarire partida NOUA
   * inainte ca ea sa fie interogata vreodata, si comanda ar ramane netratata
   * pentru totdeauna, cu marfa reala pe drum.
   */
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    pallex_awb_number: null,
    pallex_consignment_id: null,
    pallex_bordereau_id: null,
    pallex_status_id: null,
    pallex_status_checked_at: null,
    pallex_awb_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ SCRIEREA PICATA OPRESTE ELIBERAREA SLOTULUI. Ordinea conteaza.
   *
   * Daca s-ar elibera oricum, comanda ar ramane cu o partida pe care comerciantul
   * n-o mai poate scoate NICICUM: recrearea e blocata de numarul ramas pe comanda,
   * iar o a doua anulare ar gasi ID-ul, ar chema Pall-Ex, ar primi 404 — pe care
   * il tratam ca disparut — si ar termina curatenia. Deci lasat neeliberat,
   * defectul se repara singur la prima apasare de dupa.
   *
   * Se raporteaza totusi SUCCES catre om: partida chiar e anulata la curier, iar
   * un mesaj de eroare l-ar face sa creada ca n-a mers si sa incerce altceva.
   */
  const scrisPeComanda = !eScriere && !!randuri && randuri.length > 0;
  if (!scrisPeComanda) {
    await logError({
      action: "pallex.deleteAwb",
      message: `Partida Pall-Ex ${comanda.pallex_awb_number} a fost anulata la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Slotul din registru NU s-a eliberat, ca reincercarea sa poata curata.`,
      details: { orderId, businessId, awb: comanda.pallex_awb_number, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  }

  /* Documentele vechi nu mai au voie sa ramana la cheile pe care le va folosi
     urmatoarea partida. `deleteFromR2` ARUNCA la esec, spre deosebire de
     `getFromR2`, deci fara `try` o anulare reusita s-ar intoarce ca eroare. */
  for (const fel of ["label", "note"] as const) {
    try {
      await deleteFromR2(cheieDocument(businessId, orderId, fel));
    } catch (e) {
      await logError({
        action: "pallex.deleteAwb",
        message: `Partida ${comanda.pallex_awb_number} anulata, dar documentul „${fel}" NU s-a putut sterge din CDN: ${(e as Error).message}. Dupa o reemitere, descarcarea poate servi documentul partidei anulate.`,
        details: { orderId, businessId, fel },
        businessId,
        severity: "warning",
      });
    }
  }

  /* Fara eliberare, crearea urmatoare ar adopta chiar partida stearsa. */
  const eliberat = scrisPeComanda
    && await marcheazaAnulata(createAdminClient(), businessId, cheieOperatie("awb", "pallex", orderId));
  if (scrisPeComanda && !eliberat) {
    await logError({
      action: "pallex.deleteAwb",
      message: "Partida Pall-Ex stearsa, dar slotul din registru NU s-a eliberat. Urmatoarea creare pe aceasta comanda va fi refuzata.",
      details: { orderId, businessId, awb: comanda.pallex_awb_number },
      businessId,
      severity: "critical",
    });
  }

  return { success: true };
}
