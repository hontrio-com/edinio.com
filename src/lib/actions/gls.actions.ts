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
  idColete,
  numereColet,
  pdfDinEtichete,
  probaConexiune,
  stariColet,
  stergeEtichete,
  tipareste,
  type GlsConfig,
} from "@/lib/gls/client";
import { coletGls, type DateExpediere, type OptiuniServicii } from "@/lib/gls/expediere";
import { dataDinNet } from "@/lib/gls/data-net";
import { cheieEticheta } from "@/lib/gls/eticheta";
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
  const { data: vechi } = await supabase
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
    tara: "RO",
  };
  if (!expeditor.nume || !expeditor.strada || !expeditor.oras) {
    return {
      error: "Completeaza adresa magazinului (nume, strada, oras) in setari — GLS o cere ca adresa de ridicare.",
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
      const colet = coletGls({
        referinta,
        destinatar: date.destinatar,
        expeditor,
        clientNumber: Number(config.client_number),
        numarColete: date.numarColete,
        ramburs: date.ramburs,
        valoare: date.valoare,
        continut: date.continut,
        servicii: date.servicii,
      });

      const raspuns = await tipareste(config, [colet]);

      /*
       * ⚠ Un raspuns poate avea SI etichete, SI erori. Aici insa e un singur
       * colet: daca a picat, nu exista nimic de salvat, iar mesajul lui GLS e
       * mult mai util decat un „a esuat" generic.
       *
       * E un REFUZ dovedit (validare la ei), deci reincercarea dupa corectarea
       * datelor e libera — exact ce vrea comerciantul sa poata face.
       */
      const erori = eroriPeColet(raspuns);
      if (!areEtichete(raspuns) || numereColet(raspuns).length === 0) {
        throw Object.assign(
          new Error(erori.length ? `GLS a refuzat: ${erori.join("; ")}` : "GLS nu a intors nicio eticheta"),
          { verdictFurnizor: "esuat" as const },
        );
      }

      const numere = numereColet(raspuns);
      /*
       * ⚠ `ParcelId` se pastreaza in registru, nu pe comanda: `DeleteLabels` si
       * `GetPrintedLabels` il cer pe EL, nu numarul de pe eticheta. Fara el nu
       * se poate nici anula AWB-ul, nici retipari eticheta din GLS.
       */
      const ids = idColete(raspuns);
      const pdf = pdfDinEtichete(raspuns);
      return {
        referinta: numere[0],
        detalii: { numere, parcelIds: ids, avertismente: erori },
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
      await uploadToR2(
        Buffer.from(rezultat.etichetaBase64, "base64"),
        cheieEticheta(businessId, orderId),
        "application/pdf",
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
async function parcelIdsDinRegistru(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderId: string,
): Promise<number[] | null> {
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

  const detalii = data?.[0]?.detalii as { parcelIds?: unknown } | null;
  const brute = Array.isArray(detalii?.parcelIds) ? detalii.parcelIds : [];
  return brute.map(Number).filter((n) => Number.isInteger(n) && n > 0);
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
  const parcelIds = await parcelIdsDinRegistru(admin, businessId, orderId);

  if (parcelIds === null) {
    return { error: "Nu am putut citi datele coletului. Incearca din nou peste un minut." };
  }
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
   * Cazul care conteaza e codul 6 din Appendix A: „Parcel with this ID has
   * different status than PRINTED", adica GLS a preluat deja coletul. Acela chiar
   * pleaca spre client. Daca am goli `gls_awb_number` aici, comanda ar ramane cu
   * un transport real pe care nu-l mai stie nimeni — si l-am putea emite a doua
   * oara, cu al doilea colet facturat.
   *
   * Coletele pe care GLS le da ca INEXISTENTE se pun insa langa cele sterse: la
   * ei nu mai e nimic sub numarul acela. Fara asta, o anulare intrata in timeout
   * DUPA ce GLS apucase sa stearga ar fi lasat comanda cu un AWB pe care nimeni
   * nu-l mai putea scoate.
   */
  const disparute = rod.sterse.length + rod.inexistente.length;

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

  /* Eticheta veche nu mai are voie sa ramana la cheia pe care o va folosi urmatoarea. */
  try {
    await deleteFromR2(cheieEticheta(businessId, orderId));
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
