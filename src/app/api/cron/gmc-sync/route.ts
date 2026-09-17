import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { logError } from "@/lib/error-logger";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import { verificaCron } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { obtineTokenul, type EroareToken } from "@/lib/google-merchant/oauth";
import { asiguraAbonarea, secretulWebhookului } from "@/lib/google-merchant/abonare";
import { asiguraTarileSursei } from "@/lib/google-merchant/tari-sursa";
import {
  asteptareaUrmatoare, ASTEPTARE_DUPA_TOKEN_MS, EroareGoogle, caderePermanenta, limitaZilnicaAtinsa, dupaResetareaZilnica,
} from "@/lib/google-merchant/asteptare";
import { insertProductInput, deleteProductInput, getProduct, mapProductStatus, listPrograms } from "@/lib/google-merchant/client";
import { expandProductOffers, type MappableBusiness, type MappableProduct } from "@/lib/google-merchant/mapping";
import { MOTIV_PRET_CARE_MINTE, pretulDinCatalogMinte } from "@/lib/customization/pretul-din-catalog-minte";
import { DEFAULT_CONTENT_LANGUAGE, DEFAULT_COUNTRY, DEFAULT_FEED_LABEL, type GoogleMerchantConfig } from "@/lib/google-merchant/types";

type Admin = SupabaseClient<Database>;
const QUEUE_BATCH = 100;
const STATUS_BATCH = 40;
const MAX_ATTEMPTS = 5;

/**
 * Statusul randului retras fiindca pretul din catalog nu e cel platit.
 *
 * ⚠ NU e „error": nu s-a stricat nimic, iar comerciantul are ceva de facut, nu de reincercat.
 * Statusurile celelalte vin de la Google (`active`, `pending`, `disapproved`); asta e al nostru,
 * si de-aia randul lui e SARIT la reimprospatarea de status — altfel raspunsul lui Google i-ar
 * sterge motivul si comerciantul ar ramane iar fara explicatie.
 */
const STARE_EXCLUS = "exclus";

/**
 * ═══ ⚠ GOOGLE SCOATE PRODUSUL LA 30 DE ZILE DE LA ULTIMA TRIMITERE ═══
 *
 * „All products expire from your Merchant Center account 30 days after the last refresh", si asta e
 * valabil si pentru produsele trimise prin API. Coada se umplea insa doar la o schimbare (editare,
 * stoc dupa comanda, „Sincronizeaza acum"), deci un produs pe care nu-l atingea nimeni nu mai pleca
 * niciodata. Reclamat de caian-textile.ro pe 10.09.2026: produsele active din Merchant Center au
 * scazut de la 31 la 21, restul urmand sa expire; la suporti-numar si mokka ofertele trimise o
 * singura data, in iulie si august, expirasera deja, fara ca panoul nostru sa spuna ceva.
 *
 * Deci orice oferta netrimisa de `ZILE_IMPROSPATARE` zile intra singura in coada: raman trei
 * saptamani de rezerva pana la pragul lui Google, pentru o zi proasta a cronului sau a lor.
 */
const ZILE_IMPROSPATARE = 7;
/** Cate oferte vechi se pun in coada la o rulare. Coada le trimite cate `QUEUE_BATCH` pe minut. */
const IMPROSPATARE_BATCH = 200;
/**
 * Prioritatea retrimiterii de intretinere. Coada ia randurile in ordinea `prioritate` CRESCATOARE
 * (`revendica_din_coada`), iar o editare reala intra cu implicitul 5: ea trece intai.
 */
const PRIORITATE_IMPROSPATARE = 9;
/**
 * Statusul scris de NOI cand Google nu mai are o oferta pe care i-am trimis-o (vezi
 * reimprospatarea statusurilor, mai jos). Se citeste si in `google-merchant.actions.ts` si in
 * `GoogleMerchantClient`, cu aceeasi regula ca `STARE_EXCLUS`: se schimba in trei locuri deodata.
 */
const STARE_EXPIRAT = "expirat";
/**
 * ⚠ UN 404 IMEDIAT DUPA TRIMITERE NU INSEAMNA „EXPIRAT". Google proceseaza oferta primita in cateva
 * minute, iar pana atunci o citire raspunde 404. Tratat ca expirare, randul s-ar fi retrimis la
 * nesfarsit: trimis, citit prea devreme, „expirat", trimis din nou.
 */
const ORE_PANA_LA_EXPIRAT = 2;

function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

/** ⚠ Scris o data: fiecare scriere in coada trece prin CAS pe generatie. */
const COADA = "gmc_sync_queue" as const;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const now = new Date().toISOString();
  let synced = 0, deleted = 0, failed = 0, statusChecked = 0, expirate = 0, amanate = 0;

  // ── 0) Retrimiterea de intretinere: ofertele netrimise de o saptamana ─────────────
  // Inaintea revendicarii, ca produsele puse acum sa poata pleca chiar in rularea asta.
  const improspatate = await improspateazaOferteleVechi(admin);
  /* Abonarile la notificari care lipsesc (0 din 7 la 17.09.2026). Vezi `asiguraAbonarileLipsa`. */
  const abonari = await asiguraAbonarileLipsa(admin);
  const programeCitite = await citesteProgrameleContului(admin);
  /* ⚠ Cauza celor 276 de oferte fara destinatie: sursa de date fara tara. Vezi `asiguraTarileSurselor`. */
  const surseReparate = await asiguraTarileSurselor(admin);

  // ── 1) Process the sync queue, grouped by business ─────────────────────────────
  /*
   * Randurile se REVENDICA, nu doar se citesc.
   *
   * Cronul asta porneste din minut in minut si face apeluri externe care pot
   * dura. Cu un simplu `select ... limit N`, o rulare mai lunga de un minut si
   * urmatoarea citesc ACELEASI randuri — si trimit de doua ori la marketplace.
   *
   * `revendica_din_coada` le incuie (`for update skip locked`) si le marcheaza cu
   * un termen: al doilea lucrator primeste randurile URMATOARE, nu aceleasi. Vezi
   * migratia `2026-08-19-lease-cozi-marketplace`.
   */
  const { data: revendicate, error: eCoada } = await admin.rpc("revendica_din_coada", {
    p_coada: "gmc_sync_queue", p_limita: QUEUE_BATCH,
  });
  if (eCoada) {
    await logError({ action: "gmc-sync", message: `coada nu s-a putut revendica: ${eCoada.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "coada indisponibila" }, { status: 503 });
  }
  // Forma randului de coada, scrisa aici: RPC-ul intoarce `jsonb`, deci tipurile
  // generate n-au ce sa deduca.
  type RandCoada = {
    id: string; business_id: string; product_id: string | null;
    offer_id: string; op: string; attempts: number | null;
  };
  const queue = (revendicate ?? []) as unknown as RandCoada[];

  const byBiz = new Map<string, RandCoada[]>();
  for (const item of queue ?? []) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const rez = await loadBusinessContext(admin, businessId);
    if ("deconectat" in rez) {
      // Magazinul chiar nu mai e conectat: lucrarile lui n-au unde pleca.
      for (const it of (items ?? [])) await stergeDacaNeschimbat(admin, COADA, it);
      continue;
    }
    if ("eroareToken" in rez) {
      /*
       * ⚠⚠ TOKENUL N-A VENIT, DAR MAGAZINUL E CONECTAT: coada ASTEAPTA, nu se sterge. Pana pe 17.09.2026
       * ramura asta nu exista, iar o pana de o clipa la Google arunca schimbarile de pret si de stoc ale
       * comerciantului. `attempts` nu creste: caderea spune ceva despre clipa, nu despre produs.
       */
      const pana = new Date(Date.now() + ASTEPTARE_DUPA_TOKEN_MS[rez.eroareToken]).toISOString();
      for (const it of (items ?? [])) await scrieDacaNeschimbat(admin, COADA, it, { next_retry_at: pana });
      amanate += items.length;
      await logError({
        action: "gmc-sync", severity: "warning", businessId,
        message: `tokenul Google nu a venit (${rez.eroareToken}); ${items.length} lucrari asteapta pana la ${pana}`,
      });
      continue;
    }
    const { token, config, business } = rez.ctx;
    const lang = config.content_language || DEFAULT_CONTENT_LANGUAGE;
    const feedLabel = config.feed_label || DEFAULT_FEED_LABEL;

    // Fetch products needed for upserts in this business.
    const upsertIds = (items ?? []).filter((i) => i.op === "upsert" && i.product_id).map((i) => i.product_id!) as string[];
    const productMap = new Map<string, MappableProduct>();
    if (upsertIds.length) {
      const { data: prods } = await admin
        .from("products")
        .select("id, name, slug, description, price, compare_at_price, images, category, is_active, is_bundle, track_inventory, stock_quantity, weight_grams, page_sections")
        .in("id", upsertIds);
      for (const p of prods ?? []) if (p.is_active) productMap.set(p.id, p as MappableProduct);
    }

    /* Setat la prima limita zilnica atinsa: restul lucrarilor magazinului asteapta resetarea, fara apel. */
    let limitaZilnicaPana: string | null = null;
    for (const item of items ?? []) {
      if (limitaZilnicaPana) {
        await scrieDacaNeschimbat(admin, COADA, item, { next_retry_at: limitaZilnicaPana });
        amanate++;
        continue;
      }
      try {
        /*
         * ═══ ⚠ UN PRET CARE MINTE SE TRATEAZA CA O STERGERE, NU CA O TRIMITERE ═══
         *
         * De cand personalizarea are pret, `products.price` poate sa nu fie platit de nimeni: la
         * un fototapet cu `includePretulProdusului` stins, feedul anunta 89 de lei si pagina cere
         * 603,75. Google numeste asta nepotrivire intre feed si pagina si suspenda oferta, iar
         * pana atunci comerciantul plateste clicuri care pleaca.
         *
         * ⚠ SI OFERTELE VECHI TREBUIE SA IASA, nu doar cele noi sa nu intre. De-aia ramura e
         * lipita de cea a produsului disparut: ea sterge de la Google TOATE ofertele sincronizate
         * vreodata pentru produsul asta, inclusiv cele pe varianta. Daca ne-am fi multumit sa nu-l
         * mai punem la coada, fototapetul publicat luna trecuta ar fi ramas la vanzare cu pretul
         * mincinos, si nimic nu l-ar mai fi scos vreodata.
         *
         * ⚠ Produsele VECHI cu personalizare — text, poza, gravura fara pret — raspund „nu minte"
         * si trec pe aici neatinse: sunt 29 in productie si se vand corect azi.
         */
        const produs = item.product_id ? productMap.get(item.product_id) : undefined;
        const pretulMinte = !!produs && pretulDinCatalogMinte(produs);

        if (pretulMinte || item.op === "delete" || (item.op === "upsert" && item.product_id && !productMap.has(item.product_id))) {
          // Remove every offer we ever synced for this product — including variant
          // offers (offer_id = "<product>-<combo>"). On deletes product_id is null,
          // so match by the product key on either column.
          const productKey = item.product_id ?? item.offer_id;
          const { data: rows } = await admin.from("gmc_products")
            .select("offer_id").eq("business_id", businessId)
            .or(`product_id.eq.${productKey},offer_id.eq.${item.offer_id}`);
          const offerIds = (rows ?? []).map((r) => r.offer_id);
          for (const oid of offerIds.length ? offerIds : [item.offer_id]) {
            const res = await deleteProductInput(token, config.account_id!, lang, feedLabel, oid, config.data_source_name!);
            if ("error" in res && res.status !== 404) throw new EroareGoogle(res.error, res.status, res.reason);
          }
          await admin.from("gmc_products").delete().eq("business_id", businessId)
            .or(`product_id.eq.${productKey},offer_id.eq.${item.offer_id}`);
          /*
           * ⚠ COMERCIANTUL TREBUIE SA AFLE DE CE, nu sa deduca din faptul ca nu mai vinde.
           *
           * Randul se scrie INAPOI dupa stergerea de mai sus, dinadins: nu e o urma de
           * sincronizare, e motivul retragerii, si sta in acelasi tabel din care se face tabelul
           * „Produse in Google". Fara el, un fototapet ar fi disparut din lista fara o vorba —
           * exact felul de tacere din care comerciantul crede ca integrarea s-a stricat.
           *
           * `last_synced_at` ramane gol: nu s-a trimis nimic. Cand pretul din catalog redevine cel
           * de pornire, urmatoarea sincronizare rescrie randul peste, cu status de la Google.
           */
          if (pretulMinte && item.product_id) {
            await admin.from("gmc_products").upsert(
              { business_id: businessId, product_id: item.product_id, offer_id: item.offer_id, status: STARE_EXCLUS, error: MOTIV_PRET_CARE_MINTE, last_synced_at: null, updated_at: now },
              { onConflict: "business_id,offer_id" },
            );
          }
          await stergeDacaNeschimbat(admin, COADA, item);
          deleted++;
        } else {
          // Expand into one offer (simple) or one per enabled variant (linked by
          // itemGroupId), then reconcile: any previously-synced offer for this
          // product that is no longer produced gets deleted from Google.
          const product = productMap.get(item.product_id!)!;
          /*
           * Pachetul: disponibilitatea vine din componente, nu din randul lui.
           *
           * Fara asta, orice pachet pleaca „IN_STOCK" catre Merchant Center — si
           * de cand pagina lui spune corect „Stoc epuizat", divergenta e chiar
           * tiparul din care ies suspendarile de cont. O interogare in plus,
           * doar cand produsul chiar e pachet: sunt 12 in tot sistemul.
           */
          let pachetDisponibil: boolean | undefined;
          const cfgPachet = product.is_bundle ? readBundleConfig(product.page_sections) : null;
          if (product.is_bundle) {
            const ids = (cfgPachet?.items ?? []).map((i) => i.product_id);
            const { data: comps } = ids.length
              ? await admin.from("products").select("id, is_active, track_inventory, stock_quantity")
                  .eq("business_id", businessId).in("id", ids)
              : { data: [] as { id: string; is_active: boolean; track_inventory: boolean; stock_quantity: number | null }[] };
            const dupaId = new Map((comps ?? []).map((c) => [c.id, c]));
            pachetDisponibil = disponibilitatePachet((cfgPachet?.items ?? []).map((it) => {
              const c = dupaId.get(it.product_id);
              return {
                quantity: it.quantity,
                vandabila: !!c && c.is_active,
                track_inventory: !!c?.track_inventory,
                stock_quantity: c?.stock_quantity ?? null,
              };
            })).inStock;
          }
          const offers = expandProductOffers(business, { ...product, pachetDisponibil }, config);
          const desired = new Set(offers.map((o) => o.offerId));
          for (const offer of offers) {
            const res = await insertProductInput(token, config.account_id!, config.data_source_name!, offer.input);
            if ("error" in res) throw new EroareGoogle(res.error, res.status, res.reason);
            await admin.from("gmc_products").upsert(
              { business_id: businessId, product_id: product.id, offer_id: offer.offerId, status: "pending", last_synced_at: now, error: null, updated_at: now },
              { onConflict: "business_id,offer_id" },
            );
            synced++;
          }
          const { data: prior } = await admin.from("gmc_products")
            .select("offer_id").eq("business_id", businessId).eq("product_id", product.id);
          for (const row of prior ?? []) {
            if (desired.has(row.offer_id)) continue;
            const res = await deleteProductInput(token, config.account_id!, lang, feedLabel, row.offer_id, config.data_source_name!);
            if ("error" in res && res.status !== 404) continue; // best-effort; retried next pass
            await admin.from("gmc_products").delete().eq("business_id", businessId).eq("offer_id", row.offer_id);
          }
          await stergeDacaNeschimbat(admin, COADA, item);
        }
      } catch (e) {
        /*
         * ⚠ LIMITA ZILNICA NU E O CADERE A PRODUSULUI: nu consuma incercari, nu scrie „eroare”, iar
         * restul lucrarilor magazinului nu mai lovesc degeaba in Google pana la resetare. Vezi
         * `limitaZilnicaAtinsa`.
         */
        if (limitaZilnicaAtinsa(e)) {
          limitaZilnicaPana = dupaResetareaZilnica();
          await scrieDacaNeschimbat(admin, COADA, item, { next_retry_at: limitaZilnicaPana });
          amanate++;
          await logError({
            action: "gmc-sync", severity: "warning", businessId,
            message: `limita zilnica Merchant API atinsa; lucrarile magazinului asteapta pana la ${limitaZilnicaPana}`,
          });
          continue;
        }
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        /* ⚠ Un produs respins cu 400 nu se reincearca: vezi `caderePermanenta`. */
        if (attempts >= MAX_ATTEMPTS || caderePermanenta(e)) {
          await stergeDacaNeschimbat(admin, COADA, item);
          if (item.product_id) {
            await admin.from("gmc_products").upsert(
              { business_id: businessId, product_id: item.product_id, offer_id: item.offer_id, status: "error", error: String((e as Error).message).slice(0, 500), updated_at: now },
              { onConflict: "business_id,offer_id" },
            );
          }
        } else {
          /* ⚠ Cu asteptare crescatoare, nu minut de minut: vezi `asteptareaUrmatoare`. */
          await scrieDacaNeschimbat(admin, COADA, item, { attempts, next_retry_at: asteptareaUrmatoare(attempts) });
        }
      }
    }
    // Persist last_sync_at on the config.
    await patchConfig(admin, businessId, { last_sync_at: now });
  }

  // ── 2) Refresh statuses for products not checked recently ──────────────────────
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const pragExpirat = new Date(Date.now() - ORE_PANA_LA_EXPIRAT * 3_600_000).toISOString();
  const { data: stale } = await admin
    .from("gmc_products")
    .select("id, business_id, product_id, offer_id, last_synced_at")
    /* ⚠ Randul RETRAS de noi nu se intreaba la Google: n-are oferta acolo, iar raspunsul i-ar
       sterge motivul si l-ar da drept „In asteptare" la nesfarsit. Vezi `STARE_EXCLUS`. */
    .neq("status", STARE_EXCLUS)
    .or(`last_status_at.is.null,last_status_at.lt.${staleBefore}`)
    .limit(STATUS_BATCH);

  const ctxCache = new Map<string, Awaited<ReturnType<typeof loadBusinessContext>>>();
  for (const row of stale ?? []) {
    let rez = ctxCache.get(row.business_id);
    if (rez === undefined) { rez = await loadBusinessContext(admin, row.business_id); ctxCache.set(row.business_id, rez); }
    if (!("ctx" in rez)) continue;
    const { token, config } = rez.ctx;
    const res = await getProduct(token, config.account_id!, config.content_language || DEFAULT_CONTENT_LANGUAGE, config.feed_label || DEFAULT_FEED_LABEL, row.offer_id);
    statusChecked++;
    if ("error" in res) {
      /*
       * ⚠ 404 PE O OFERTA TRIMISA DE MULT = GOOGLE N-O MAI ARE: a expirat (30 de zile fara
       * retrimitere) sau a fost scoasa din Merchant Center. Pana acum se nota doar ora citirii, iar
       * randul ramanea cu statusul vechi: panoul arata „In asteptare", uneori chiar „Aprobat",
       * pentru un produs care nu mai exista la Google. Caian-textile a aflat din emailul lui Google,
       * nu de la noi.
       *
       * Orice alta eroare (retea, jeton, 5xx) nu spune nimic despre oferta: statusul ramane.
       */
      const trimisDeMult = !!row.last_synced_at && row.last_synced_at < pragExpirat;
      if (res.status === 404 && trimisDeMult) {
        const automat = config.auto_sync !== false;
        await admin.from("gmc_products").update({
          status: STARE_EXPIRAT,
          error: automat
            ? `Google nu mai are produsul: a expirat sau a fost scos din Merchant Center. L-am pus înapoi în coadă.`
            : `Google nu mai are produsul: a expirat sau a fost scos din Merchant Center. Apasă „Sincronizează acum” ca să-l retrimiți.`,
          last_status_at: now,
          updated_at: now,
        }).eq("id", row.id);
        if (automat && row.product_id) {
          // Pe PRODUS, ca la „Sincronizeaza acum": cronul il desface singur in ofertele lui.
          await admin.from(COADA).upsert(
            { business_id: row.business_id, product_id: row.product_id, offer_id: row.product_id, op: "upsert" },
            { onConflict: "business_id,offer_id,op", ignoreDuplicates: true },
          );
        }
        expirate++;
        continue;
      }
      await admin.from("gmc_products").update({ last_status_at: now }).eq("id", row.id);
      continue;
    }
    const { status, issues, destinations } = mapProductStatus(res.data);
    await admin.from("gmc_products").update({ status, issues: issues as never, destinations: destinations as never, last_status_at: now, updated_at: now }).eq("id", row.id);
  }

  console.log(`[gmc-sync] synced=${synced} deleted=${deleted} failed=${failed} status=${statusChecked} improspatate=${improspatate} expirate=${expirate} amanate=${amanate} abonari=${abonari} programe=${programeCitite} surse_reparate=${surseReparate}`);
  return NextResponse.json({ ok: true, synced, deleted, failed, statusChecked, improspatate, expirate, amanate, abonari, programe: programeCitite, surseReparate });
}

/**
 * Pune in coada produsele ale caror oferte n-au mai plecat la Google de `ZILE_IMPROSPATARE` zile.
 * Intoarce cate produse a pus.
 *
 * ⚠ INTAI MAGAZINELE, APOI OFERTELE. O cerere care ar fi luat direct cele mai vechi
 * `IMPROSPATARE_BATCH` oferte din toata platforma ar fi fost ocupata pe veci de un magazin
 * deconectat sau cu sincronizarea stinsa: ofertele lui nu se retrimit, deci raman mereu cele mai
 * vechi, iar ale celorlalti n-ar mai fi ajuns niciodata in fata.
 *
 * ⚠ DOAR CE E DEJA LA GOOGLE. Se retrimit ofertele din `gmc_products`, nu tot catalogul: un magazin
 * care n-a trimis niciodata o parte din produse (tonel-beauty avea 69 de oferte din 500 de produse)
 * nu se trezeste cu ele publicate de noi.
 *
 * ⚠ Sincronizarea automata STINSA inseamna „nu trimite singur schimbarile mele": acolo nu se
 * retrimite nimic, iar panoul arata cate produse se apropie de expirare.
 *
 * `ignoreDuplicates`: un produs aflat deja in coada (o editare, poate cu reincercari in curs) nu se
 * atinge; altfel i s-ar fi schimbat prioritatea si generatia cu care il revendica lucratorul.
 */
async function improspateazaOferteleVechi(admin: Admin): Promise<number> {
  const { data: setari, error: eSetari } = await admin
    .from("store_settings")
    .select("business_id, account_id:google_merchant_config->>account_id, data_source_name:google_merchant_config->>data_source_name, auto_sync:google_merchant_config->>auto_sync")
    .eq("google_merchant_config->>connected", "true");
  if (eSetari) {
    await logError({ action: "gmc-sync.improspatare", message: `magazinele nu s-au putut citi: ${eSetari.message}`, severity: "warning" });
    return 0;
  }
  const magazine = ((setari ?? []) as unknown as { business_id: string; account_id: string | null; data_source_name: string | null; auto_sync: string | null }[])
    .filter((s) => !!s.account_id && !!s.data_source_name && s.auto_sync !== "false")
    .map((s) => s.business_id);
  if (!magazine.length) return 0;

  const prag = new Date(Date.now() - ZILE_IMPROSPATARE * 86_400_000).toISOString();
  const { data: vechi, error: eVechi } = await admin
    .from("gmc_products")
    .select("business_id, product_id")
    .in("business_id", magazine)
    .lt("last_synced_at", prag)
    /* ⚠ `not.in` sare peste NULL, deci statusul gol se cere anume. `exclus` si `error` raman pe
       dinafara: primul l-am retras noi, al doilea asteapta o reparatie, nu o retrimitere. */
    .or(`status.is.null,status.not.in.(${STARE_EXCLUS},error)`)
    .not("product_id", "is", null)
    .order("last_synced_at", { ascending: true })
    .limit(IMPROSPATARE_BATCH);
  if (eVechi) {
    await logError({ action: "gmc-sync.improspatare", message: `ofertele vechi nu s-au putut citi: ${eVechi.message}`, severity: "warning" });
    return 0;
  }

  // Coada lucreaza pe PRODUS: cronul il desface singur in ofertele lui, cu variante cu tot.
  const randuri = new Map<string, { business_id: string; product_id: string; offer_id: string; op: string; prioritate: number }>();
  for (const r of vechi ?? []) {
    if (!r.product_id) continue;
    randuri.set(`${r.business_id}|${r.product_id}`, {
      business_id: r.business_id, product_id: r.product_id, offer_id: r.product_id, op: "upsert",
      prioritate: PRIORITATE_IMPROSPATARE,
    });
  }
  if (!randuri.size) return 0;
  const { error: eCoada } = await admin.from(COADA)
    .upsert([...randuri.values()], { onConflict: "business_id,offer_id,op", ignoreDuplicates: true });
  if (eCoada) {
    await logError({ action: "gmc-sync.improspatare", message: `coada nu a primit retrimiterile: ${eCoada.message}`, severity: "warning" });
    return 0;
  }
  return randuri.size;
}

type ContextMagazin = { token: string; config: GoogleMerchantConfig; business: MappableBusiness };

/**
 * Contextul unui magazin: tokenul, configurarea si datele pentru mapare.
 *
 * ⚠ TREI RASPUNSURI, NU DOUA. Forma de dinainte intorcea `null` si pentru „magazinul nu mai e conectat”,
 * si pentru „Google n-a dat tokenul acum”, iar apelantul STERGEA coada in ambele cazuri. Acum:
 *   - `deconectat`: configurarea nu mai e completa, lucrarile n-au unde pleca;
 *   - `eroareToken`: magazinul e conectat, dar tokenul nu vine; coada asteapta;
 *   - `ctx`: se poate lucra.
 */
async function loadBusinessContext(admin: Admin, businessId: string): Promise<
  { ctx: ContextMagazin } | { deconectat: true } | { eroareToken: EroareToken }
> {
  const { data: ss } = await admin
    .from("store_settings").select("google_merchant_config").eq("business_id", businessId).single();
  const config = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
  if (!config.connected || !config.refresh_token || !config.account_id || !config.data_source_name) return { deconectat: true };
  const t = await obtineTokenul(config.refresh_token);
  if ("eroare" in t) return { eroareToken: t.eroare };
  const { data: biz } = await admin
    .from("businesses").select("slug, custom_domain, store_name, business_name").eq("id", businessId).single();
  if (!biz) return { deconectat: true };
  return { ctx: { token: t.token, config, business: biz as MappableBusiness } };
}

/**
 * Scrie in configurare DOAR campurile date, peste configurarea de ACUM.
 *
 * ═══ ⚠ DE CE SE RECITESTE (17.09.2026) ═══
 *
 * Forma de dinainte scria inapoi obiectul citit la inceputul rularii, cu `last_sync_at` peste. O rulare
 * dureaza cat dureaza trimiterile catre Google; daca in timpul ei comerciantul oprea sincronizarea
 * automata sau schimba maparea categoriilor, cronul ii scria peste configurarea veche si alegerea lui
 * disparea fara urma. Recitita chiar inainte de scriere, fereastra scade de la o rulare la o clipa.
 *
 * ⚠ Si un magazin deconectat intre timp NU se reconecteaza pe dos: fara `connected`, nu se scrie nimic.
 */
async function patchConfig(admin: Admin, businessId: string, patch: Partial<GoogleMerchantConfig>) {
  const { data, error } = await admin
    .from("store_settings").select("google_merchant_config").eq("business_id", businessId).maybeSingle();
  if (error || !data) return;
  const proaspat = (data.google_merchant_config as GoogleMerchantConfig | null) ?? {};
  if (!proaspat.connected) return;
  await admin.from("store_settings")
    .update({ google_merchant_config: { ...proaspat, ...patch } as never })
    .eq("business_id", businessId);
}

/** Cate magazine incearca abonarea intr-o rulare, si la cate ore dupa o incercare cazuta. */
const ABONARI_PE_RULARE = 3;
const ORE_INTRE_INCERCARI_ABONARE = 6;

/**
 * Face abonarea la notificari pentru magazinele conectate care n-o au.
 *
 * ⚠ DE CE IN CRON, nu doar la conectare: la 17.09.2026 niciunul dintre cele 7 magazine conectate n-avea
 * abonare (cererea era gresita, vezi `corpAbonare`), iar comerciantii nu se reconecteaza singuri. Fara pasul
 * asta, reparatia n-ar fi ajuns la ei niciodata.
 *
 * ⚠ Fara `GMC_WEBHOOK_SECRET` nu se incearca nimic: webhook-ul ar refuza oricum toate notificarile.
 * O incercare cazuta se scrie in configurare (panoul o arata) si se reia abia peste cateva ore, ca un
 * cont cu o problema reala sa nu fie intrebat din minut in minut.
 */
async function asiguraAbonarileLipsa(admin: Admin): Promise<number> {
  if (!secretulWebhookului()) return 0;
  const { data, error } = await admin
    .from("store_settings")
    .select("business_id, google_merchant_config")
    .eq("google_merchant_config->>connected", "true")
    .is("google_merchant_config->>notification_subscription_name", null)
    .limit(50);
  if (error) {
    await logError({ action: "gmc-sync.abonare", message: `magazinele nu s-au putut citi: ${error.message}`, severity: "warning" });
    return 0;
  }
  const prag = Date.now() - ORE_INTRE_INCERCARI_ABONARE * 3_600_000;
  let incercate = 0;
  for (const rand of (data ?? []) as { business_id: string; google_merchant_config: GoogleMerchantConfig | null }[]) {
    if (incercate >= ABONARI_PE_RULARE) break;
    const cfg = rand.google_merchant_config;
    if (!cfg?.account_id || !cfg.refresh_token) continue;
    if (cfg.abonare_incercata_la && Date.parse(cfg.abonare_incercata_la) > prag) continue;
    incercate++;
    const acum = new Date().toISOString();
    const t = await obtineTokenul(cfg.refresh_token);
    if ("eroare" in t) {
      await patchConfig(admin, rand.business_id, { abonare_incercata_la: acum, abonare_eroare: `Tokenul Google nu a venit (${t.eroare}).` });
      continue;
    }
    const r = await asiguraAbonarea(t.token, cfg.account_id);
    if (r.stare === "activa") {
      await patchConfig(admin, rand.business_id, { notification_subscription_name: r.name, abonare_incercata_la: acum, abonare_eroare: undefined });
    } else if (r.stare === "eroare") {
      await patchConfig(admin, rand.business_id, { abonare_incercata_la: acum, abonare_eroare: r.mesaj.slice(0, 300) });
      await logError({
        action: "gmc-sync.abonare", severity: "warning", businessId: rand.business_id,
        message: `abonarea la notificari a fost refuzata: ${r.mesaj}`, details: { reason: r.reason },
      });
    }
  }
  return incercate;
}

/** Cate conturi isi citesc programele intr-o rulare, si la cate ore. */
const PROGRAME_PE_RULARE = 3;
const ORE_INTRE_CITIRI_PROGRAME = 12;

/**
 * Fotografia programelor fiecarui cont conectat (`programs.list`), scrisa in configurare.
 *
 * ═══ ⚠ DE CE (17.09.2026) ═══
 *
 * 276 de oferte la 6 magazine stateau fara nicio destinatie, iar cauza (programul oprit) se putea afla
 * DOAR cu tokenul comerciantului, adica numai cand omul deschidea panoul. Platforma nu vedea nimic. Cu
 * fotografia asta, o citire din baza spune ce magazine au listarile gratuite oprite si de cand.
 *
 * ⚠ Doar citire la Google, cate `PROGRAME_PE_RULARE` conturi, o data la `ORE_INTRE_CITIRI_PROGRAME` ore:
 * programele nu se schimba des, iar apelurile intra in cota contului.
 */
async function citesteProgrameleContului(admin: Admin): Promise<number> {
  const { data, error } = await admin
    .from("store_settings")
    .select("business_id, google_merchant_config")
    .eq("google_merchant_config->>connected", "true")
    .limit(200);
  if (error) {
    await logError({ action: "gmc-sync.programe", message: `magazinele nu s-au putut citi: ${error.message}`, severity: "warning" });
    return 0;
  }
  const prag = Date.now() - ORE_INTRE_CITIRI_PROGRAME * 3_600_000;
  const deCitit = ((data ?? []) as { business_id: string; google_merchant_config: GoogleMerchantConfig | null }[])
    .filter((r) => r.google_merchant_config?.account_id && r.google_merchant_config.refresh_token)
    .filter((r) => !r.google_merchant_config?.programe_citite_la || Date.parse(r.google_merchant_config.programe_citite_la) <= prag)
    /* Cele necitite niciodata intai, apoi cele mai vechi. */
    .sort((a, b) => String(a.google_merchant_config?.programe_citite_la ?? "").localeCompare(String(b.google_merchant_config?.programe_citite_la ?? "")))
    .slice(0, PROGRAME_PE_RULARE);

  for (const rand of deCitit) {
    const cfg = rand.google_merchant_config!;
    const acum = new Date().toISOString();
    const t = await obtineTokenul(cfg.refresh_token!);
    if ("eroare" in t) {
      await patchConfig(admin, rand.business_id, { programe_citite_la: acum, programe_eroare: `Tokenul Google nu a venit (${t.eroare}).` });
      continue;
    }
    const r = await listPrograms(t.token, cfg.account_id!);
    if ("error" in r) {
      await patchConfig(admin, rand.business_id, { programe_citite_la: acum, programe_eroare: r.error.slice(0, 300) });
      continue;
    }
    const programe: Record<string, string> = {};
    for (const p of r.data.programs ?? []) {
      const id = String(p.name ?? "").split("/").pop();
      if (id) programe[id] = p.state ?? "NECUNOSCUT";
    }
    await patchConfig(admin, rand.business_id, { programe, programe_citite_la: acum, programe_eroare: undefined });
  }
  return deCitit.length;
}

/** Cate surse de date se verifica intr-o rulare, si la cate ore. */
const SURSE_PE_RULARE = 3;
const ORE_INTRE_VERIFICARI_SURSA = 24;

/**
 * Verifica tara pe sursa de date a fiecarui magazin conectat si o adauga unde lipseste.
 *
 * ═══ ⚠⚠ DE CE (17.09.2026) ═══
 *
 * 276 de oferte la 6 magazine n-aveau nicio destinatie: sursa de date se crease fara `countries`, iar
 * „the data source feedLabel has no impact on targeted country”. Crearea e reparata (`createApiDataSource`),
 * dar sursele DEJA create raman asa pana nu le repara cineva, iar comerciantii nu se reconecteaza singuri.
 *
 * ⚠ La o reparatie, produsele magazinului se pun inapoi in coada (dupa editari, `PRIORITATE_IMPROSPATARE`):
 * nu se stie daca Google reevalueaza singur ofertele deja primite, iar o retrimitere costa cateva apeluri.
 *
 * ⚠ `sursa_tari_inainte` pastreaza ce gasise Google pe sursa: e dovada cauzei, citita din baza.
 * O data la `ORE_INTRE_VERIFICARI_SURSA` ore, fiindca tara se poate schimba si din Merchant Center.
 */
async function asiguraTarileSurselor(admin: Admin): Promise<number> {
  const { data, error } = await admin
    .from("store_settings")
    .select("business_id, google_merchant_config")
    .eq("google_merchant_config->>connected", "true")
    .limit(200);
  if (error) {
    await logError({ action: "gmc-sync.tari", message: `magazinele nu s-au putut citi: ${error.message}`, severity: "warning" });
    return 0;
  }
  const prag = Date.now() - ORE_INTRE_VERIFICARI_SURSA * 3_600_000;
  const deVerificat = ((data ?? []) as { business_id: string; google_merchant_config: GoogleMerchantConfig | null }[])
    .filter((r) => r.google_merchant_config?.data_source_name && r.google_merchant_config.refresh_token)
    .filter((r) => !r.google_merchant_config?.sursa_tari_verificate_la || Date.parse(r.google_merchant_config.sursa_tari_verificate_la) <= prag)
    .sort((a, b) => String(a.google_merchant_config?.sursa_tari_verificate_la ?? "").localeCompare(String(b.google_merchant_config?.sursa_tari_verificate_la ?? "")))
    .slice(0, SURSE_PE_RULARE);

  let reparate = 0;
  for (const rand of deVerificat) {
    const cfg = rand.google_merchant_config!;
    const acum = new Date().toISOString();
    const t = await obtineTokenul(cfg.refresh_token!);
    if ("eroare" in t) {
      await patchConfig(admin, rand.business_id, { sursa_tari_verificate_la: acum, sursa_tari_eroare: `Tokenul Google nu a venit (${t.eroare}).` });
      continue;
    }
    const r = await asiguraTarileSursei(t.token, cfg.data_source_name!, cfg.country || DEFAULT_COUNTRY);
    if (r.stare === "eroare") {
      await patchConfig(admin, rand.business_id, { sursa_tari_verificate_la: acum, sursa_tari_eroare: r.mesaj.slice(0, 300) });
      await logError({
        action: "gmc-sync.tari", severity: "warning", businessId: rand.business_id,
        message: `tara sursei de date nu s-a putut verifica: ${r.mesaj}`, details: { reason: r.reason },
      });
      continue;
    }
    if (r.stare === "corecta") {
      await patchConfig(admin, rand.business_id, { sursa_tari: r.tari, sursa_tari_verificate_la: acum, sursa_tari_eroare: undefined });
      continue;
    }
    reparate++;
    await patchConfig(admin, rand.business_id, { sursa_tari: r.tari, sursa_tari_inainte: r.inainte, sursa_tari_verificate_la: acum, sursa_tari_eroare: undefined });
    const { data: oferte } = await admin.from("gmc_products")
      .select("product_id").eq("business_id", rand.business_id)
      .or(`status.is.null,status.neq.${STARE_EXCLUS}`)
      .not("product_id", "is", null);
    const randuri = new Map<string, { business_id: string; product_id: string; offer_id: string; op: string; prioritate: number }>();
    for (const o of oferte ?? []) {
      if (!o.product_id) continue;
      randuri.set(o.product_id, { business_id: rand.business_id, product_id: o.product_id, offer_id: o.product_id, op: "upsert", prioritate: PRIORITATE_IMPROSPATARE });
    }
    if (randuri.size) {
      const { error: eCoada } = await admin.from(COADA).upsert([...randuri.values()], { onConflict: "business_id,offer_id,op", ignoreDuplicates: true });
      if (eCoada) {
        await logError({ action: "gmc-sync.tari", severity: "warning", businessId: rand.business_id, message: `produsele nu s-au pus inapoi in coada: ${eCoada.message}` });
      }
    }
  }
  return reparate;
}
