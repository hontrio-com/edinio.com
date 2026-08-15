"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  areEtichete,
  eroriPeColet,
  felulEtichetei,
  idColete,
  numereColet,
  pdfDinEtichete,
  probaConexiune,
  stariColet,
  stergeEtichete,
  tipareste,
  type GlsConfig,
} from "@/lib/gls/client";
import {
  avertismenteColet,
  coletGls,
  motivRefuzSerbia,
  type DateExpediere,
  type OptiuniServicii,
} from "@/lib/gls/expediere";
import { dataDinNet } from "@/lib/gls/data-net";
import { codPostalOras } from "@/lib/gls/puncte";
import { cheiEticheta, cheieEticheta } from "@/lib/gls/eticheta";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";
import type { Json } from "@/types/database.types";

/**
 * Actiunile GLS (MyGLS).
 *
 * ⚠ Se probeaza DIRECT IN PRODUCTIE, pe contractul unui client real. Fiecare
 * apel care creeaza ceva la GLS trece prin registrul de operatii externe, ca o
 * a doua apasare pe buton sa nu produca al doilea colet facturat.
 */

// ─── Configurare ──────────────────────────────────────────────────────────────

/**
 * Proprietarul magazinului. Se verifica INAINTE de orice citire cu service role.
 *
 * ⚠ Discriminantul e `ok`, nu prezenta lui `error`. Cu o uniune pe „are camp
 * error", TypeScript nu poate ingusta: `error: string` cuprinde si sirul gol,
 * deci `if (ctx.error)` nu exclude ramura de esec, iar `supabase` ramane
 * „possibly undefined" la fiecare folosire.
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

export async function saveGlsConfig(
  businessId: string,
  config: GlsConfig,
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
    .from("store_settings").select("gls_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("gls_config", config, vechi?.gls_config);

  const { error } = await supabase.from("store_settings").update({
    gls_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectGls(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    gls_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune pentru panou.
 *
 * ⚠ Face o CITIRE la GLS, nu o emitere. Un „testeaza conexiunea" care creeaza
 * AWB ar factura un colet real la fiecare apasare — iar butonul se apasa de zece
 * ori pana iese configurarea.
 */
export async function testGlsConnectionAction(
  businessId: string,
  config: GlsConfig,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  /* Parola poate veni mascata din formular: se ia cea salvata. */
  const parola = await secretDinConfig(businessId, "gls_config", "password", config.password);
  if (!parola) return { error: "Completeaza parola MyGLS." };
  if (!config.username) return { error: "Completeaza utilizatorul MyGLS." };
  if (!config.client_number) return { error: "Completeaza Client Number-ul din contract." };

  const r = await probaConexiune({ ...config, password: parola });
  return r.ok ? { ok: true } : { error: r.eroare };
}

// ─── Context pentru AWB ───────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * ⚠ Configul se citeste cu SERVICE ROLE. Vederea `public.store_settings` nu
   * decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola ar
   * veni `enc.v1.…` si GLS ar respinge orice expediere. Service role ocoleste
   * RLS — de aceea proprietatea magazinului s-a verificat mai sus.
   */
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }, { data: firma }] = await Promise.all([
    admin.from("store_settings").select("gls_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    supabase
      .from("businesses")
      .select("business_name, store_name, store_address, store_city, store_county, address, city, county, phone, email")
      .eq("id", businessId)
      .single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.gls_config as GlsConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_number) {
    return { error: "GLS nu este configurat complet" as const };
  }

  return { supabase, config, order, firma };
}

export type DateAwbGls = {
  destinatar: DateExpediere["destinatar"];
  /*
   * ⚠ EXPEDITORUL NU VINE DIN BROWSER.
   *
   * Se compune pe server, din datele magazinului. Altfel oricine cu o sesiune de
   * comerciant ar putea emite un AWB pe contul GLS al magazinului cu orice
   * adresa de ridicare — inclusiv una straina, pe cheltuiala lui.
   */
  numarColete: number;
  ramburs?: number;
  valoare?: number;
  continut?: string | null;
  servicii?: OptiuniServicii;
};

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

export async function createGlsAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbGls,
): Promise<{ awb: string; etichetaBase64: string | null } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, firma } = ctx;

  const comanda = order as typeof order & { gls_awb_number?: string | null };
  if (comanda.gls_awb_number) return { error: "AWB GLS a fost deja creat" };

  /*
   * ⚠ Expeditorul se compune AICI, din datele magazinului — nu vine din browser.
   *
   * `store_*` sunt adresa publica a magazinului (de unde se ridica marfa); daca
   * lipsesc, se cade pe adresa firmei. Fara niciuna, GLS ar primi o adresa de
   * ridicare goala si ar refuza expedierea — mai bine o spunem noi, clar.
   */
  const expeditor = {
    nume: firma?.store_name || firma?.business_name || "",
    strada: firma?.store_address || firma?.address || "",
    oras: firma?.store_city || firma?.city || "",
    judet: firma?.store_county || firma?.county || null,
    /*
     * ⚠ Codul postal de ridicare vine din CONFIGURAREA GLS, nu din `businesses`:
     * acolo nu exista niciun camp de cod postal. `ZipCode` e camp cerut de MyGLS
     * in clasa `Address`, deci fara el pleca gol la fiecare colet.
     */
    codPostal: config.expeditor_cod_postal ?? null,
    telefon: firma?.phone ?? null,
    email: firma?.email ?? null,
    /*
     * ⚠ Tara expeditorului e cea a CONTRACTULUI, nu „RO" cablat.
     *
     * Configurarea ofera sapte tari si compune din ele si gazda API-ului
     * (`api.mygls.<tara>`). Cablat „RO", un comerciant cu contract unguresc
     * trimitea colete catre `api.mygls.hu` cu adresa de ridicare declarata in
     * Romania — adica exact felul de nepotrivire pe care curierul o descopera
     * cand vine sa ridice.
     */
    tara: config.tara || "RO",
  };
  if (!expeditor.nume || !expeditor.strada || !expeditor.oras) {
    return {
      error: "Completeaza adresa magazinului (nume, strada, oras) in setari — GLS o cere ca adresa de ridicare.",
    };
  }
  /*
   * ⚠ `ZipCode` e REQUIRED in clasa `Address` (pagina 10), pentru AMANDOUA
   * adresele. Lasat gol, GLS refuza cu „Parcel validation issue" (Appendix A,
   * 13) — un mesaj care nu numeste niciun camp, deci comerciantul nu are de unde
   * sa ghiceasca ce lipseste si reincearca la nesfarsit.
   *
   * Campul exista in configurare de la inceput, dar nu era nici obligatoriu,
   * nici verificat.
   */
  if (!expeditor.codPostal?.trim()) {
    return {
      error:
        "Completeaza campul Cod postal ridicare in configurarea GLS: e adresa de unde ridica "
        + "curierul, iar GLS il cere obligatoriu.",
    };
  }

  /*
   * Verificarile care NU ating GLS raman inaintea rezervarii: o comanda fara
   * adresa n-are de ce sa ocupe un slot in registru.
   *
   * ⚠ Strada e obligatorie DOAR la livrarea la domiciliu.
   *
   * La livrarea in punct (PSD) coletul merge la ParcelShop-ul ales in checkout,
   * iar cumparatorul nu-si mai da adresa de acasa — formularul nici nu i-o cere
   * (`GlsAwbModal`: campul de strada e ascuns cand `laPunct`). Verificarea de
   * aici o cerea totusi, deci FIECARE comanda la punct era refuzata de server
   * dupa ce trecuse de formular, cu un mesaj care ii cerea comerciantului o
   * adresa pe care clientul n-avea de ce s-o dea.
   */
  const laPunct = !!date.servicii?.parcelShopId;
  if (!date.destinatar?.oras?.trim()) {
    return { error: "Comanda nu are orasul de livrare completat." };
  }
  if (!laPunct && !date.destinatar?.strada?.trim()) {
    return { error: "Comanda nu are adresa de livrare completa (oras si strada)." };
  }

  /*
   * ⚠ CODUL POSTAL AL DESTINATARULUI, si de ce lipseste aproape mereu.
   *
   * `ZipCode` e REQUIRED la MyGLS, dar checkout-ul nu-l cere pe comenzile
   * romanesti: campul „Cod postal" se arata doar la livrarea internationala, iar
   * `order.actions.ts` scrie `postal_code` in `shipping_address` numai cand tara
   * difera de RO. Deci pe intern nici nu exista in baza — si pana acum pleca
   * SIRUL GOL la fiecare colet, fara ca nimeni sa afle pana la refuzul GLS.
   *
   * Aici e locul unde se poate spune limpede ce lipseste si cine il poate
   * completa: formularul de AWB are campul, iar comerciantul il vede.
   */
  /*
   * ⚠ Cand lipseste, se cauta in punctele GLS din acelasi oras — NU se refuza
   * imediat. Masurat pe productie: din 137 de comenzi romanesti din ultimele 90
   * de zile, ZERO aveau cod postal. Deci un refuz sec ar fi facut generarea in
   * masa inutilizabila pentru GLS, iar emiterea pe bucata ar fi cerut de fiecare
   * data un camp pe care comerciantul nu-l stie pe de rost.
   *
   * Codul vine din fisierul lui GLS, deci e unul pe care reteaua lor il ruteaza.
   * Se trece in avertismentele operatiei, ca sa se stie ca l-am pus noi.
   */
  let codPostalDest = date.destinatar?.codPostal?.trim() ?? "";
  let codPostalGhicit = false;
  if (!codPostalDest && laPunct) {
    /*
     * La livrarea in punct, adresa de livrare E a punctului, iar codul lui
     * postal a venit odata cu el din reteaua GLS. E cel exact, nu o aproximare —
     * de aceea se incearca INAINTEA caderii pe localitate.
     */
    const adr = (order.shipping_address ?? {}) as { locker_post_code?: string };
    codPostalDest = (adr.locker_post_code ?? "").trim();
  }
  if (!codPostalDest) {
    codPostalDest = (await codPostalOras(
      config.tara || "RO",
      date.destinatar?.oras ?? "",
      /* ⚠ Judetul NU e de ornament: 23 de nume de localitate se repeta in mai
         multe judete, iar codul postal alege depozitul. Fara el, „Mihail
         Kogalniceanu" din Constanta pleca pe ruta Galatiului. */
      date.destinatar?.judet,
    )) ?? "";
    codPostalGhicit = !!codPostalDest;
  }
  if (!codPostalDest) {
    return {
      error:
        "Completeaza codul postal al destinatarului: GLS il cere obligatoriu, iar comenzile "
        + "din Romania nu il primesc din checkout.",
    };
  }

  /* Serbia cere date pe care nu le trimitem inca — spus inainte de a chema GLS. */
  const refuzRS = motivRefuzSerbia({
    referinta: "", destinatar: date.destinatar, expeditor,
    clientNumber: Number(config.client_number), numarColete: date.numarColete,
  });
  if (refuzRS) return { error: refuzRS };

  /*
   * ⚠ La livrarea in punct, GLS cere OBLIGATORIU datele de contact ale
   * destinatarului (documentatia ver. 25.12.11, pagina 36, la serviciul PSD).
   *
   * Si e limpede de ce: coletul ajunge la un ghiseu, iar omul trebuie anuntat ca
   * il poate ridica. Fara telefon si email, nimeni nu afla ca a sosit, coletul
   * sta pana expira termenul si se intoarce la comerciant — care plateste si
   * ducerea, si intoarcerea. Verificat aici, cu mesaj limpede, in loc de un refuz
   * al GLS la mijlocul unui lot.
   */
  if (laPunct && (!date.destinatar?.telefon?.trim() || !date.destinatar?.email?.trim())) {
    return {
      error:
        "Livrarea la punct GLS cere si telefonul, si emailul destinatarului: acolo primeste instiintarea ca poate ridica coletul. "
        + "Completeaza-le in formularul de AWB.",
    };
  }

  const referinta = String(order.order_number ?? orderId).slice(0, 40);

  /* Se compune o singura data: si `coletGls`, si `avertismenteColet` lucreaza pe
     exact aceleasi date, altfel avertismentele ar descrie alt colet decat cel
     trimis. */
  const dateColet: DateExpediere = {
    referinta,
    destinatar: { ...date.destinatar, codPostal: codPostalDest },
    expeditor,
    clientNumber: Number(config.client_number),
    numarColete: date.numarColete,
    ramburs: date.ramburs,
    valoare: date.valoare,
    continut: date.continut,
    servicii: date.servicii,
  };

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "gls",
      cheie: cheieOperatie("awb", "gls", orderId),
    },
    async () => {
      const colet = coletGls(dateColet);

      const raspuns = await tipareste(config, [colet]);

      const erori = eroriPeColet(raspuns);
      const numere = numereColet(raspuns);

      /*
       * ═══ ⚠⚠ COLETUL CREAT NU SE ARUNCA NICIODATA ═══
       *
       * Conditia de aici era `!areEtichete(raspuns) || numere.length === 0`, cu
       * SAU — deci se arunca si atunci cand `PrintLabelsInfoList` CONTINEA
       * numere de colet, doar fiindca lipseau octetii etichetei. Si se arunca cu
       * `verdictFurnizor: "esuat"`, care pentru registru inseamna „nu s-a
       * intamplat nimic acolo, reincercarea e LIBERA".
       *
       * Rezultatul: coletele existau la GLS, facturate; slotul se elibera; a
       * doua apasare chema `PrintLabels` din nou si mai facea unul. Iar
       * `ParcelId`-urile primului se pierdeau odata cu exceptia, deci nici anulat
       * nu mai putea fi — un colet real pe care nimic din aplicatie nu-l mai
       * cunostea.
       *
       * Acum: DACA AVEM NUMERE, OPERATIA A REUSIT. Eticheta lipsa e o neplacere
       * recuperabila (`/api/gls/awb` o cere inapoi cu `GetPrintedLabels`, care nu
       * creeaza nimic); un colet pierdut nu e.
       */
      if (numere.length === 0) {
        /*
         * Chiar si aici, „esuat" se da doar cu DOVADA: erorile pe colet vin de
         * la validarea lor si dovedesc ca nu s-a creat nimic. Fara ele nu stim
         * ce s-a intamplat, iar implicitul lui `verdictFurnizor` e „necunoscut" —
         * care blocheaza, si pe buna dreptate.
         */
        if (erori.length > 0) {
          throw Object.assign(new Error(`GLS a refuzat: ${erori.join("; ")}`), {
            verdictFurnizor: "esuat" as const,
          });
        }
        throw new Error("GLS nu a intors niciun numar de colet");
      }

      /*
       * ⚠ `ParcelId` se pastreaza in registru, nu pe comanda: `DeleteLabels` si
       * `GetPrintedLabels` il cer pe EL, nu numarul de pe eticheta. Fara el nu
       * se poate nici anula AWB-ul, nici retipari eticheta din GLS.
       */
      const ids = idColete(raspuns);
      const pdf = areEtichete(raspuns) ? pdfDinEtichete(raspuns) : null;
      if (!pdf) {
        /*
         * Coletul exista, eticheta nu a venit. Se striga, fiindca inseamna un
         * drum in plus pentru comerciant — dar NU se arunca.
         */
        await logError({
          action: "gls.createAwb",
          message: `AWB GLS ${numere[0]} creat, dar GLS nu a intors eticheta${
            erori.length ? `: ${erori.join("; ")}` : ""
          }. Se poate descarca din comanda (GetPrintedLabels).`,
          details: { orderId, businessId, numere, parcelIds: ids },
          businessId,
          severity: "warning",
        });
      }
      return {
        referinta: numere[0],
        detalii: {
          numere,
          parcelIds: ids,
          avertismente: [
            ...erori,
            ...avertismenteColet(dateColet),
            ...(codPostalGhicit
              ? [`Comanda nu avea cod postal; s-a folosit ${codPostalDest}, al unui punct GLS din ${date.destinatar?.oras ?? "aceeasi localitate"}.`]
              : []),
          ],
          /*
           * ⚠ MEDIUL IN CARE S-A EMIS. Fara el, anularea poate intreba alta baza.
           *
           * `api.mygls.ro` si `api.test.mygls.ro` sunt sisteme SEPARATE, la fel
           * cele sapte tari. Daca dupa emitere comerciantul comuta pe mediul de
           * test, `DeleteLabels` intreaba acolo de un `ParcelId` de productie,
           * primeste codul 4 („Parcel ID not exists") si noi il citim ca „s-a
           * sters" — golim AWB-ul de pe comanda in timp ce coletul real, cu
           * rambursul lui, chiar pleaca spre client.
           */
          mediu: {
            sandbox: !!config.sandbox,
            tara: config.tara || "RO",
            clientNumber: Number(config.client_number),
          },
        },
        valoare: {
          awb: numere[0],
          etichetaBase64: pdf ? pdf.toString("base64") : null,
        },
      };
    },
    /* `apelMyGls` marcheaza singur refuzul, inclusiv 200 cu ErrorCode in corp. */
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`. Dinadins, si contra tiparului celorlalti curieri.
     *
     * Toti cinci trimit `async () => !!orderData.<curier>_awb_number` — dar il
     * citesc pe `orderData` INAINTE, iar mai sus au un `return` care opreste
     * totul daca numarul exista. Deci in clipa apelului expresia aia e
     * INTOTDEAUNA falsa: e literalmente `async () => false`.
     *
     * Iar `false` pe ramura `deja` inseamna „elibereaza slotul si reia" — adica
     * CHEAMA `PrintLabels` A DOUA OARA. Cand se ajunge pe `deja`? Exact cand
     * registrul a inregistrat un AWB reusit dar scrierea pe comanda s-a pierdut
     * — situatia pentru care a fost construit registrul. Adica paza se transforma
     * chiar acolo in al doilea colet real, facturat.
     *
     * Fara callback, `deja` ADOPTA numarul din registru si il scrie inapoi pe
     * comanda (mai jos). Si cazul de care se temea callback-ul — o anulare a
     * carei eliberare s-a pierdut — se repara singur: comanda primeste inapoi un
     * AWB care nu mai exista la GLS, comerciantul incearca sa-l anuleze,
     * `DeleteLabels` raspunde cu codul 4, iar `deleteGlsAwbAction` il trateaza ca
     * disparut si elibereaza slotul.
     *
     * Deci: cel mai rau caz devine un numar mort care se curata singur, in loc de
     * un colet platit de doua ori.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  /*
   * Pe `deja`, coletul exista de la o incercare careia i s-a pierdut scrierea.
   * Eticheta nu vine in acest raspuns, dar nu e pierduta: comerciantul o descarca
   * din panou, iar `/api/gls/awb` o ia din CDN sau o cere inapoi de la GLS cu
   * `GetPrintedLabels`. AWB-ul se leaga inapoi de comanda aici, ca sa nu se emita
   * al doilea colet.
   */
  const rezultat =
    r.fel === "facut"
      ? r.valoare
      : { awb: r.referinta ?? "", etichetaBase64: null };

  /*
   * ETICHETA SE SALVEAZA ACUM.
   *
   * Se urca in R2 INAINTE de a raspunde browserului, ca sa existe si dupa ce omul
   * inchide pagina: descarcarea devine instantanee, merge si cand MyGLS e picat,
   * si nu consuma apeluri.
   *
   * Esecul urcarii NU opreste raspunsul: coletul exista deja la GLS, browserul
   * primeste oricum PDF-ul in `etichetaBase64`, iar daca nici el nu ajunge,
   * `/api/gls/awb` il poate cere inapoi cu `GetPrintedLabels`. O eroare aici l-ar
   * trimite pe om sa apese din nou pentru un fisier de rezerva recuperabil.
   */
  if (r.fel === "facut" && rezultat.etichetaBase64) {
    try {
      /* Formatul ales de comerciant hotaraste si extensia, si tipul MIME: ZPL-ul
         salvat ca PDF se deschide „deteriorat". */
      const fel = felulEtichetei(config.tip_imprimanta);
      await uploadToR2(
        Buffer.from(rezultat.etichetaBase64, "base64"),
        cheieEticheta(businessId, orderId, fel.ext),
        fel.tipMime,
        /* ⚠ Nu e o poza de produs: contine datele cumparatorului. Vezi `uploadToR2`. */
        "private, no-store",
      );
    } catch (e) {
      await logError({
        action: "gls.salveazaEticheta",
        message: `AWB GLS ${rezultat.awb} emis, dar eticheta NU s-a putut salva: ${(e as Error).message}. Comerciantul o are doar din descarcarea automata.`,
        details: { orderId, businessId, awb: rezultat.awb },
        businessId,
        severity: "warning",
      });
    }
  }

  /* `.eq("business_id")` nu e de prisos: fara el, zero randuri modificate ar putea
     insemna si „alta comanda", nu doar „scriere pierduta", iar alarma de mai jos ar
     fi ambigua exact acolo unde trebuie sa fie limpede. */
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    gls_awb_number: rezultat.awb,
    /* Ancora ferestrei de urmarire. Vezi `gls_awb_at` in migratia din 28.08. */
    gls_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Coletul EXISTA la GLS. Un esec de scriere nu mai are voie sa se intoarca
   * la om ca eroare — l-ar trimite sa apese din nou, iar a doua apasare ar
   * factura al doilea colet. Registrul retine deja operatia, deci reincercarea o
   * adopta si reface doar scrierea.
   */
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "gls.createAwb",
      message: `AWB GLS creat (${rezultat.awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, awb: rezultat.awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    /*
     * ⚠ Marketplace-ul trebuie sa afle numarul de urmarire, ca la ceilalti
     * curieri (`cargus.actions.ts`, la fel).
     *
     * Fara randul asta, o comanda de pe About You expediata cu GLS ramanea la
     * ei fara AWB: clientul n-avea ce urmari, iar About You socoteste comanda
     * neexpediata — cu penalizarile de rigoare pentru comerciant. Si nimic n-ar
     * fi semnalat, fiindca noi raportam „reusit".
     *
     * Se cheama DUPA ce scrierea pe comanda a prins un rand: coada citeste
     * `gls_awb_number` din baza, deci inainte n-ar avea ce trimite.
     */
    void enqueueAboutYouShip(businessId, orderId);
  }

  return rezultat;
}

// ─── Anularea AWB ─────────────────────────────────────────────────────────────

/**
 * `ParcelId`-urile coletului, luate din registrul de operatii externe.
 *
 * ⚠ NU EXISTA ALTA CALE. `DeleteLabels` accepta exclusiv `ParcelIdList` (ID-uri
 * din baza GLS), iar comanda poarta `ParcelNumber` — numarul de pe eticheta, pe
 * care metoda nu-l primeste. ID-urile se scriu la emitere, in `detalii`.
 *
 * ⚠ Se filtreaza pe `stare = 'reusit'` si se ia randul cel mai NOU, si niciunul
 * dintre cele doua nu e de prisos: indexul unic al registrului e PARTIAL (vezi
 * migrations/2026-08-20, liniile 148-150), deci dupa una sau mai multe anulari
 * pot exista mai multe randuri cu ACEEASI cheie. Fara filtru s-ar putea intoarce
 * ID-urile unui colet anulat demult — si am cere GLS-ului sa stearga a doua oara
 * ceva ce nu mai exista, in timp ce coletul adevarat pleaca la client.
 *
 * De aceea nu se foloseste nici `.single()`: mai multe randuri sunt normale aici,
 * iar `.single()` ar arunca exact in cazul obisnuit.
 */
type DetaliiEmitere = {
  parcelIds: number[];
  mediu: { sandbox?: boolean; tara?: string; clientNumber?: number } | null;
};

async function parcelIdsDinRegistru(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderId: string,
): Promise<DetaliiEmitere | null> {
  const { data, error } = await admin
    .from("operatii_externe")
    .select("detalii")
    .eq("business_id", businessId)
    .eq("cheie", cheieOperatie("awb", "gls", orderId))
    .eq("stare", "reusit")
    .order("creat_la", { ascending: false })
    .limit(1);

  /*
   * Citirea picata NU se confunda cu „n-are ID-uri". Prima inseamna „nu stim",
   * si atunci nu avem voie sa trimitem omul sa anuleze de mana; a doua inseamna
   * ca nu se poate anula prin API si chiar trebuie sa i-o spunem.
   */
  if (error) return null;

  const detalii = data?.[0]?.detalii as
    | { parcelIds?: unknown; mediu?: DetaliiEmitere["mediu"] }
    | null;
  const brute = Array.isArray(detalii?.parcelIds) ? detalii.parcelIds : [];
  return {
    parcelIds: brute.map(Number).filter((n) => Number.isInteger(n) && n > 0),
    mediu: detalii?.mediu ?? null,
  };
}

/**
 * ⚠ Intrebam ACEEASI instanta MyGLS in care s-a emis coletul?
 *
 * Productia si mediul de test sunt baze SEPARATE, si la fel cele sapte tari. Un
 * `ParcelId` de productie pur si simplu nu exista in mediul de test — iar acolo
 * GLS raspunde cu codul 4, „Parcel ID not exists", pe care noi il citim (pe buna
 * dreptate, in mod normal) drept „a fost sters".
 *
 * Deci un comerciant care porneste comutatorul „Mediu de test" ca sa incerce
 * ceva, si apoi anuleaza un AWB vechi, ar goli numarul de pe comanda in timp ce
 * coletul real — cu rambursul lui — chiar pleaca spre client. Si comanda,
 * ramasa fara AWB, ar putea emite linistit al doilea.
 *
 * `null` la `mediu` inseamna un AWB emis inainte ca mediul sa fie pastrat: nu
 * putem verifica, deci nu blocam — dar nici nu inventam o certitudine.
 */
function nepotrivireDeMediu(
  mediu: DetaliiEmitere["mediu"],
  config: GlsConfig,
): string | null {
  if (!mediu) return null;
  const acum = { sandbox: !!config.sandbox, tara: (config.tara || "RO").toUpperCase() };
  const atunci = {
    sandbox: !!mediu.sandbox,
    tara: (mediu.tara || "RO").toUpperCase(),
  };
  if (acum.sandbox === atunci.sandbox && acum.tara === atunci.tara) return null;

  /*
   * ⚠ SE BLOCHEAZA DOAR DIRECTIA PERICULOASA.
   *
   * Prima varianta refuza orice nepotrivire, in ambele sensuri — si asa producea
   * chiar tiparul pe care tot fisierul il evita: un AWB emis in MEDIUL DE TEST
   * nu mai putea fi nici anulat (nepotrivire), nici reemis (numarul e pe
   * comanda), deci comanda ramanea infundata definitiv pentru un colet care nici
   * macar nu exista.
   *
   * Riscul real e intr-o singura directie: coletul a fost emis in PRODUCTIE, deci
   * e adevarat si costa bani, iar noi am intreba acum mediul de test. Invers,
   * coletul de „atunci" e fictiv si nu se poate strica nimic lasand curatenia sa
   * mearga.
   */
  if (atunci.sandbox) return null;

  const nume = (m: { sandbox: boolean; tara: string }) =>
    `${m.tara}, ${m.sandbox ? "mediu de test" : "productie"}`;
  return (
    `Coletul a fost emis pe ${nume(atunci)}, iar integrarea e acum pe ${nume(acum)}. `
    + "Sunt sisteme separate: o operatie facuta acum nu ar atinge coletul real. "
    + "Comuta configurarea GLS inapoi si incearca din nou."
  );
}

/**
 * A plecat coletul din depozit, sau inca n-a fost predat lui GLS?
 *
 * ⚠ Serveste la o singura intrebare: cand `DeleteLabels` raspunde cu codul 6,
 * inseamna „l-am sters deja" sau „l-am preluat si pleaca spre client"?
 *
 * Codurile 51 („the parcel was not yet handed over to GLS") si 52 (datele de
 * ramburs introduse) descriu un colet inregistrat, dar inca la comerciant. Daca
 * ISTORICUL nu contine nimic altceva, coletul n-a plecat niciodata — deci starea
 * „diferita de PRINTED" e chiar DELETED, adica o anulare care si-a pierdut
 * raspunsul.
 *
 * `null` = nu s-a putut afla. Atunci nu se atinge nimic: mai bine o anulare de
 * reluat decat un AWB sters de pe o comanda al carei colet chiar pleaca.
 */
async function coletulAPlecat(
  config: GlsConfig,
  numarColet: string,
): Promise<boolean | null> {
  try {
    /*
     * ⚠ Termen SCURT, ca in cron. Implicitul clientului e de 60 de secunde, iar
     * apelul asta vine DUPA `DeleteLabels` (inca 60) — intr-o actiune de server
     * apasata de om. Verdictul e oricum optional: la expirare iese „nu stim", si
     * comanda ramane neatinsa.
     */
    const stari = await stariColet(config, numarColet, 12_000);

    /*
     * ⚠⚠ LIPSA MISCARII NU E DOVADA. Aici implicitul trebuie sa fie „nu stim".
     *
     * O varianta anterioara intorcea `false` („n-a plecat") pentru o lista GOALA
     * de stari — iar `false` duce mai departe la STERGEREA AWB-ului de pe
     * comanda. Numai ca cele doua fapte comparate vin din doua subsisteme
     * diferite ale GLS: `DeleteLabels` citeste starea coletului, iar
     * `GetParcelStatuses` citeste urmarirea, care publica scanarile cu ore
     * intarziere (chiar cronul nostru descrie cazul). Un colet ridicat fizic, dar
     * inca nescanat in urmarire, are lista goala — si l-am fi declarat „sters",
     * stergand de pe comanda un transport real, cu rambursul pe el.
     *
     * Deci: doar un istoric NEVID compus EXCLUSIV din 51/52 („datele au intrat,
     * coletul e inca la comerciant") dovedeste ca n-a plecat.
     */
    if (stari.length === 0) return null;

    const coduri = stari
      .map((s) => Number(String(s.StatusCode ?? "").trim()))
      .filter((c) => Number.isInteger(c));
    if (coduri.length === 0) return null;
    return coduri.some((c) => c !== 51 && c !== 52);
  } catch {
    /*
     * ⚠ Si un colet NEGASIT ajunge aici (`stariColet` arunca pe
     * `GetParcelStatusErrors`). „Negasit" nu dovedeste ca n-a plecat — poate GLS
     * nu-l are inca indexat — deci raspunsul cinstit e „nu stim".
     */
    return null;
  }
}

/**
 * Anularea AWB-ului GLS.
 *
 * ═══ ⚠ DE CE NU TRECE PRIN `cuRegistru` ═══
 *
 * Ca la toti ceilalti cinci curieri. Registrul apara impotriva DUBLARII unui
 * efect scump; o a doua stergere a aceluiasi colet nu creeaza nimic, GLS
 * raspunde ca nu-l gaseste. Ce trebuie in schimb NEAPARAT facut e ELIBERAREA
 * slotului de emitere, ca urmatorul AWB pe aceeasi comanda sa nu fie refuzat.
 *
 * ═══ ⚠ ETICHETA VECHE SE STERGE DIN R2 ═══
 *
 * Cheia din R2 se compune din `(businessId, orderId)` — atat, fara AWB (vezi
 * `cheieEticheta`). Deci dupa o anulare urmata de o reemitere, fisierul VECHI ar
 * sta la aceeasi cheie, iar `/api/gls/awb` ar servi eticheta coletului ANULAT sub
 * numarul celui nou. Comerciantul ar lipi pe pachet o eticheta cu un cod care nu
 * mai exista la GLS, si ar afla de la curier.
 */
export async function deleteGlsAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & { gls_awb_number?: string | null };
  if (!comanda.gls_awb_number) return { error: "Nu exista AWB GLS pentru aceasta comanda" };

  const admin = createAdminClient();
  const emitere = await parcelIdsDinRegistru(admin, businessId, orderId);

  if (emitere === null) {
    return { error: "Nu am putut citi datele coletului. Incearca din nou peste un minut." };
  }

  /* Nu se atinge nimic daca am intreba alt mediu decat cel in care s-a emis. */
  const nepotrivire = nepotrivireDeMediu(emitere.mediu, config);
  if (nepotrivire) return { error: nepotrivire };

  const parcelIds = emitere.parcelIds;
  if (parcelIds.length === 0) {
    /*
     * Mesajul spune exact ce se poate face, fiindca noi chiar nu mai putem face
     * nimic: fara `ParcelId` nu exista cale prin API. Se intampla la AWB-urile
     * emise inainte ca ID-urile sa fie pastrate, sau cand emiterea a fost adoptata
     * din registru pe ramura „deja".
     */
    return {
      error:
        `Anularea prin API nu e posibila pentru coletul ${comanda.gls_awb_number}: GLS cere identificatorul intern al coletului, ` +
        "care nu a fost pastrat la emitere. Anuleaza coletul din contul MyGLS.",
    };
  }

  let rod: Awaited<ReturnType<typeof stergeEtichete>>;
  try {
    rod = await stergeEtichete(config, parcelIds);
  } catch (e) {
    return { error: (e as Error).message };
  }

  /*
   * ⚠ NIMIC STERS INSEAMNA NIMIC SCHIMBAT.
   *
   * Cazul care conteaza e codul 6 din Appendix A, tratat mai jos: cand inseamna
   * ca GLS a preluat coletul, acela chiar pleaca spre client. Daca am goli
   * `gls_awb_number`, comanda ar ramane cu
   * un transport real pe care nu-l mai stie nimeni — si l-am putea emite a doua
   * oara, cu al doilea colet facturat.
   *
   * Coletele pe care GLS le da ca INEXISTENTE se pun insa langa cele sterse: la
   * ei nu mai e nimic sub numarul acela. Fara asta, o anulare intrata in timeout
   * DUPA ce GLS apucase sa stearga ar fi lasat comanda cu un AWB pe care nimeni
   * nu-l mai putea scoate.
   */
  /*
   * ═══ ⚠⚠ CODUL 6, SI DE CE NU MAI E O SIMPLA EROARE ═══
   *
   * `DeleteLabels` e descrisa in documentatie chiar in prima ei linie ca „Set
   * DELETED state for labels/parcels" (pagina 27). NU sterge inregistrarea, ii
   * schimba starea. Deci la o A DOUA cerere pentru acelasi `ParcelId`, coletul
   * EXISTA in continuare si raspunsul nu mai poate fi codul 4 („Parcel ID not
   * exists") — e codul 6, „different status than PRINTED", fiindca starea lui e
   * acum DELETED.
   *
   * Asta darama povestea pe care se sprijinea toata curatenia de dupa o anulare
   * al carei raspuns s-a pierdut („a doua apasare ia codul 4 si se repara
   * singur"). In realitate a doua apasare ia 6, care era tratat ca „a mai ramas
   * un colet viu": nu se golea nimic, nu se elibera slotul, reemiterea era
   * refuzata de numarul ramas pe comanda, iar randul `reusit` nici nu apare in
   * supapa de operatii atarnate. Fundatura permanenta.
   *
   * Numai ca 6 nu inseamna DOAR asta: inseamna si „GLS a preluat coletul si
   * chiar pleaca spre client" — cazul in care AWB-ul nu are voie sa dispara.
   * Cele doua se deosebesc uitandu-ne la ISTORICUL coletului, care e o citire
   * pura si nu creeaza nimic:
   *
   *   fara nicio miscare, sau doar 51/52   -> coletul n-a plecat niciodata din
   *                                           depozit, deci 6 inseamna „deja sters"
   *   cu miscari reale in retea            -> coletul e viu, se lasa in pace
   */
  let nesigureDeSters = 0;
  if (rod.nesigure.length > 0) {
    /*
     * ⚠⚠ ISTORICUL UNUI COLET NU HOTARASTE SOARTA CELORLALTE.
     *
     * `gls_awb_number` poarta numarul PRIMULUI colet, iar `stariColet` lucreaza
     * pe numar, nu pe `ParcelId` — deci pentru o expediere cu mai multe colete
     * n-avem cum sa intrebam decat despre acela. O varianta anterioara aplica
     * verdictul lui la TOATE ID-urile din `nesigure`: la o expediere de trei
     * colete din care GLS il stersese pe primul si le preluase pe celelalte doua,
     * comanda ramanea fara AWB in timp ce doua colete reale, cu rambursul pe ele,
     * plecau spre client — si comanda putea emite linistit al doilea AWB.
     *
     * Cat timp nu pastram perechile `{parcelId, parcelNumber}` la emitere,
     * scurtatura se aplica DOAR cand exista un singur colet. La mai multe, se
     * intoarce eroarea si comanda ramane neatinsa — ca inainte.
     */
    const unSingurColet = parcelIds.length === 1;
    const aPlecat = unSingurColet ? await coletulAPlecat(config, comanda.gls_awb_number) : true;
    if (aPlecat === false) {
      nesigureDeSters = rod.nesigure.length;
    } else {
      /* `true` (a plecat) sau `null` (nu s-a putut afla): nu se atinge nimic. */
      await logError({
        action: "gls.deleteAwb",
        message:
          `AWB GLS ${comanda.gls_awb_number}: GLS a raspuns cu codul 6 pentru ${rod.nesigure.length} colete`
          + `${aPlecat === null ? ", iar istoricul coletului nu s-a putut citi" : ", iar coletul e in retea"}`
          + ". Comanda ramane neatinsa.",
        details: { orderId, businessId, awb: comanda.gls_awb_number, nesigure: rod.nesigure, aPlecat },
        businessId,
        severity: "warning",
      });
      return {
        error:
          !unSingurColet
            ? "GLS nu a anulat toate coletele acestei expedieri. Verifica-le in contul MyGLS si anuleaza-le de acolo."
            : aPlecat === null
            ? "GLS nu a confirmat anularea, iar starea coletului nu s-a putut verifica. Incearca din nou peste un minut."
            : "Coletul a fost deja preluat de GLS si pleaca spre client, deci nu mai poate fi anulat prin API. "
              + "Opreste-l din contul MyGLS sau refuza-l la livrare.",
      };
    }
  }

  const disparute = rod.sterse.length + rod.inexistente.length + nesigureDeSters;

  /*
   * ⚠ ORICE COLET RAMAS VIU OPRESTE TOT.
   *
   * Conditia NU e „a disparut macar unul", ci „n-a mai ramas niciunul". La o
   * comanda cu mai multe colete, GLS poate sterge o parte si refuza restul —
   * tipic cu codul 6, adica tocmai coletele pe care le-a PRELUAT si care chiar
   * pleaca spre client.
   *
   * `gls_awb_number` poarta numarul PRIMULUI colet, si nu stim care dintre ele
   * e. Golit pe o stergere partiala, ar putea sterge de pe comanda chiar numarul
   * unui colet viu: transport real, pe drum, pe care nu-l mai stie nimeni — si
   * comanda liberata sa emita al doilea.
   *
   * Deci la orice ramasita: nu se goleste nimic, nu se elibereaza slotul, iar
   * comerciantul primeste mesajul GLS si termina treaba in MyGLS.
   */
  if (rod.erori.length > 0 || disparute === 0) {
    if (disparute > 0) {
      await logError({
        action: "gls.deleteAwb",
        message: `AWB GLS ${comanda.gls_awb_number}: stergere PARTIALA — au disparut ${disparute} din ${parcelIds.length} colete, restul au ramas la GLS. Comanda ramane neatinsa.`,
        details: {
          orderId, businessId, awb: comanda.gls_awb_number,
          sterse: rod.sterse, inexistente: rod.inexistente, erori: rod.erori,
        },
        businessId,
        severity: "critical",
      });
    }
    return {
      error: rod.erori.length
        ? `GLS nu a anulat toate coletele: ${rod.erori.join("; ")}. Verifica in contul MyGLS.`
        : "GLS nu a confirmat anularea coletului.",
    };
  }

  /* De aici incolo: la GLS nu mai exista NICIUN colet al acestei comenzi. */

  /*
   * ⚠ Se sterge si memoria urmaririi, nu doar numarul.
   *
   * `gls_status_code` ramas de la coletul anulat s-ar aplica la urmatorul: daca
   * era unul TERMINAL (23 = retur, 5 = livrat), `eStareFinala` ar scoate din
   * urmarire coletul NOU inainte ca acesta sa fie interogat vreodata. Comanda ar
   * ramane netratata pentru totdeauna, cu un colet real pe drum.
   */
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    gls_awb_number: null,
    gls_status_code: null,
    gls_status_checked_at: null,
    gls_awb_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ SCRIEREA PICATA OPRESTE ELIBERAREA SLOTULUI. Ordinea conteaza.
   *
   * Daca s-ar elibera oricum, comanda ar ramane cu un AWB pe care comerciantul
   * nu-l mai poate scoate NICICUM: reemiterea e blocata de numarul ramas pe
   * comanda, iar o a doua anulare n-ar mai gasi randul `reusit` in registru
   * (`parcelIdsDinRegistru` cauta numai dupa el) si i-ar spune sa se descurce in
   * MyGLS. Fundatura.
   *
   * Lasat neeliberat, randul ramane `reusit`, deci reincercarea gaseste
   * `ParcelId`-urile, cheama iar `DeleteLabels`, primeste codul 4 („nu exista") —
   * pe care il tratam ca disparut — si termina curatenia. Se repara singur la
   * prima apasare de dupa.
   *
   * Se raporteaza totusi SUCCES catre om: coletul chiar e anulat la curier, si
   * un mesaj de eroare l-ar trimite sa creada ca n-a mers.
   */
  const scrisPeComanda = !eScriere && !!randuri && randuri.length > 0;
  if (!scrisPeComanda) {
    await logError({
      action: "gls.deleteAwb",
      message: `AWB GLS ${comanda.gls_awb_number} a fost anulat la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Slotul din registru NU s-a eliberat, ca reincercarea sa poata curata.`,
      details: { orderId, businessId, awb: comanda.gls_awb_number, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  }

  /* Eticheta veche nu mai are voie sa ramana la cheia pe care o va folosi
     urmatoarea. Se incearca TOATE formele: comerciantul poate fi schimbat
     formatul de imprimanta intre emitere si anulare. */
  try {
    await Promise.all(cheiEticheta(businessId, orderId).map((k) => deleteFromR2(k)));
  } catch (e) {
    await logError({
      action: "gls.deleteAwb",
      message: `AWB GLS ${comanda.gls_awb_number} anulat, dar eticheta veche NU s-a putut sterge din CDN: ${(e as Error).message}. Dupa o reemitere, descarcarea poate servi eticheta coletului anulat.`,
      details: { orderId, businessId, awb: comanda.gls_awb_number },
      businessId,
      severity: "warning",
    });
  }

  /* Fara eliberare, emiterea urmatoare ar adopta chiar AWB-ul sters. */
  const eliberat = scrisPeComanda
    && await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "gls", orderId));
  if (scrisPeComanda && !eliberat) {
    await logError({
      action: "gls.deleteAwb",
      message: "AWB GLS sters, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
      details: { orderId, businessId, awb: comanda.gls_awb_number },
      businessId,
      severity: "critical",
    });
  }

  return { success: true };
}

// ─── Urmarire ─────────────────────────────────────────────────────────────────

export type StareAfisata = {
  cod: string;
  descriere: string;
  data: string | null;
  depozit: string | null;
};

/**
 * Starile unui colet, pentru panou.
 *
 * ⚠ Citire pura: nu creeaza nimic la GLS, deci NU trece prin registru si se
 * poate reincerca oricat.
 *
 * ⚠ `StatusDate` vine in formatul .NET `/Date(1712345678000+0200)/`, nu ISO.
 * Trecut direct intr-un `new Date()`, iese „Invalid Date" si in panou apare gol.
 */
export async function getGlsParcelStatusAction(
  businessId: string,
  orderId: string,
): Promise<{ stari: StareAfisata[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config, order } = ctx;

  const awb = (order as typeof order & { gls_awb_number?: string | null }).gls_awb_number;
  if (!awb) return { error: "Comanda nu are AWB GLS" };

  /*
   * Aceeasi paza ca la anulare: intrebat in alt mediu, coletul iese „negasit" si
   * comerciantul crede ca s-a pierdut, cand de fapt am cautat in alta baza.
   */
  const emitere = await parcelIdsDinRegistru(createAdminClient(), businessId, orderId);
  const nepotrivire = emitere && nepotrivireDeMediu(emitere.mediu, config);
  if (nepotrivire) return { error: nepotrivire };

  try {
    const stari = await stariColet(config, awb);
    return {
      stari: stari.map((s) => ({
        cod: s.StatusCode ?? "",
        descriere: s.StatusDescription ?? "",
        data: dataDinNet(s.StatusDate),
        depozit: s.DepotCity ?? null,
      })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
