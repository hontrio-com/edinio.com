import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { approveClaimItems, getClaims, isTrendyolError, rejectClaimItems } from "./client";
import type { TrendyolSyncContext } from "./sync";
import { TRENDYOL_DEFAULT_STOREFRONT, type TrendyolClaim, type TrendyolStoreFront } from "./types";
import {
  coletDeTrimisInapoi, idCererii, idPachetului, liniileReturului, nuSeTrimiteInapoi,
} from "./retur-forma";
import { randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
import { patchTrendyolConfig } from "./config";

/**
 * Retururile Trendyol, aduse la noi si hotarate din panoul nostru.
 *
 * ═══ ⚠ CE STIAM PANA AZI ═══
 *
 * Doar atat: pachetul are statusul `Returned`. Din el nu se poate afla nimic din ce conteaza —
 * ce articol s-a intors, cate bucati, de ce, daca cererea asteapta o hotarare, si daca e o
 * inlocuire in loc de restituire. Comerciantul afla din panoul LOR si decidea acolo.
 *
 * ═══ ⚠ SI DE CE STOCUL NU SE REPUNE SINGUR NICI DE AICI ═══
 *
 * Aceeasi hotarare ca la eMAG, luata cu o zi inainte: marfa intoarsa nu e mereu vandabila.
 * Vine desfacuta, zgariata, incompleta, sau pur si simplu alta decat cea trimisa. Un retur
 * ACCEPTAT inseamna ca banii se intorc, nu ca produsul e bun de pus la loc pe raft.
 *
 * ⚠ Iar retururile Trendyol sunt PARTIALE: `quantity` pe linie poate fi mai mic decat cat s-a
 * cumparat, si se pot intoarce doar unele linii. Un „pune inapoi toata comanda" ar fi gresit
 * de doua ori.
 *
 * Deci omul apasa „Am primit marfa si e buna", pe linia si cantitatea lui, iar `repus_in_stoc_la`
 * tine minte — a doua apasare nu mai adauga inca o data.
 */

type Db = SupabaseClient<Database>;

/** Cat de mult inapoi se cere la prima trecere, cand n-avem marcaj. */
const FEREASTRA_INITIALA_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * ⚠ FEREASTRA LOR E DE CEL MULT DOUA SAPTAMANI, ca la comenzi. Ceruta mai larga, serviciul
 * raspunde 400 si nu s-ar aduce nimic — iar cronul ar parea ca merge.
 */
const FEREASTRA_MAXIMA_MS = 14 * 24 * 60 * 60 * 1000;

/** ⚠ Plafonul LOR pentru explicatia respingerii. Peste el, cererea e refuzata intreaga. */
const MAX_EXPLICATIE = 500;

/** Cate pagini se citesc intr-o trecere. */
const PAGINI_PE_TRECERE = 3;

function laData(ms: unknown): string | null {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

/**
 * Aduce cererile de retur si le scrie la noi.
 *
 * ⚠ NU HOTARASTE NIMIC. Nici nu aproba, nici nu respinge, nici nu atinge stocul: aduce si
 * arata. Hotararea e a comerciantului, si trece prin `hotarasteRetur`.
 */
export async function aduRetururile(
  admin: Db, ctx: TrendyolSyncContext, marcajMs?: number,
): Promise<{ aduse: number; ok: boolean }> {
  const acum = Date.now();
  /* ⚠ Suprapunere de cinci minute peste marcaj: ceasul lor si al nostru nu bat la fel, iar o
     cerere modificata chiar in secunda marcajului ar cadea intre doua ferestre. */
  const de_la = Number.isFinite(marcajMs) && marcajMs
    ? Math.max(marcajMs - 5 * 60_000, acum - FEREASTRA_MAXIMA_MS)
    : acum - FEREASTRA_INITIALA_MS;

  let aduse = 0;
  let ok = true;

  for (let pagina = 0; pagina < PAGINI_PE_TRECERE; pagina++) {
    const res = await getClaims(ctx.auth, { startDate: de_la, endDate: acum, page: pagina, size: 50 });
    if (isTrendyolError(res)) {
      await logError({
        action: "trendyol/retururi",
        message: `cererile de retur nu s-au putut citi: ${res.error}`,
        details: { pagina, status: res.status, vitrina: ctx.auth.storefront ?? null },
        businessId: ctx.businessId, severity: "warning",
      });
      /* ⚠ Marcajul NU avanseaza: fereastra se reia. */
      return { aduse, ok: false };
    }

    const continut = res.data?.content ?? [];
    for (const c of continut) {
      const idCerere = idCererii(c);
      if (!idCerere) continue;
      const scris = await scrieCererea(admin, ctx, c, idCerere);
      if (!scris) { ok = false; continue; }
      aduse++;
    }

    const totalPagini = Math.max(1, Number(res.data?.totalPages ?? 1));
    if (continut.length === 0 || pagina + 1 >= totalPagini) return { aduse, ok };
    /* ⚠ S-au terminat paginile ingaduite intr-o trecere, dar mai sunt: marcajul NU are voie sa
       sara la „acum", altfel cererile necitite raman in urma ferestrei pentru totdeauna. */
    if (pagina + 1 >= PAGINI_PE_TRECERE) ok = false;
  }

  return { aduse, ok };
}

/**
 * O trecere intreaga, pe TOATE vitrinele magazinului.
 *
 * ═══ ⚠ ERA UN SINGUR MARCAJ PENTRU TOATE (26.08.2026) ═══
 *
 * Comenzile isi tin de mult pozitia pe fiecare vitrina (`pollPackagesToateVitrinele`), si din
 * motiv temeinic: cu un marcaj comun, o vitrina care cade ii tine pe loc pe celelalte, iar una
 * care merge inainte o poate SARI pe cea cazuta. Retururile aveau exact defectul de care
 * comenzile fusesera aparate.
 *
 * ⚠ CU CROSS-COUNTRY PORNIT, un 429 pe Grecia ar fi impins marcajul comun mai departe, iar
 * retururile grecesti ar fi iesit din fereastra de doua saptamani si nu s-ar mai fi citit
 * NICIODATA — fara nicio eroare, fiindca trecerea „a reusit".
 *
 * ⚠ MARCAJUL VECHI SE CITESTE CA PUNCT DE PLECARE pentru vitrina de origine: fara asta, prima
 * trecere de dupa schimbare ar fi recitit doua saptamani de retururi pe fiecare vitrina.
 */
export async function treceRetururile(
  admin: Db, ctx: TrendyolSyncContext,
): Promise<{ aduse: number }> {
  const inceput = Date.now();
  const origine = (ctx.auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT) as TrendyolStoreFront;
  const destinatii = (ctx.config.cross_country_storefronts ?? []).filter((v) => v && v !== origine);
  const vitrine: TrendyolStoreFront[] = [origine, ...destinatii];

  const marcaje = { ...(ctx.config.claims_synced_per_storefront ?? {}) };
  const vechi = Date.parse(ctx.config.claims_synced_at ?? "");

  let aduse = 0;
  const noi: Record<string, string> = {};

  for (const vitrina of vitrine) {
    const ctxVitrina = vitrina === origine
      ? ctx
      : { ...ctx, auth: { ...ctx.auth, storefront: vitrina } };

    const alEi = Date.parse(marcaje[vitrina] ?? "");
    const marcaj = Number.isFinite(alEi) ? alEi
      : (vitrina === origine && Number.isFinite(vechi) ? vechi : undefined);

    const r = await aduRetururile(admin, ctxVitrina, marcaj);
    aduse += r.aduse;
    /* ⚠ Fiecare vitrina isi muta marcajul singura, si numai la o trecere intreaga. Un esec pe
       una nu atinge pozitia celorlalte. */
    if (r.ok) noi[vitrina] = new Date(inceput - 5 * 60_000).toISOString();
  }

  if (Object.keys(noi).length > 0) {
    await patchTrendyolConfig(admin, ctx.businessId, {
      claims_synced_per_storefront: { ...marcaje, ...noi },
      /* Marcajul vechi se tine la zi pentru vitrina de origine: e ce citeste orice cod care
         inca nu stie de cel pe vitrine. */
      ...(noi[origine] ? { claims_synced_at: noi[origine] } : {}),
    });
  }
  return { aduse };
}

/** Scrie o cerere si liniile ei. `false` = ceva n-a mers si marcajul nu are voie sa avanseze. */
async function scrieCererea(
  admin: Db, ctx: TrendyolSyncContext, c: TrendyolClaim, idCerere: string,
): Promise<boolean> {
  /* Comanda noastra, cand o stim. Lipsa ei NU opreste scrierea returului: mai bine un retur
     vizibil fara comanda decat niciunul. */
  let orderId: string | null = null;
  if (c.orderNumber) {
    const rand = randCitit<{ order_id: string | null }>("trendyol.comandaReturului", await admin
      .from("trendyol_orders").select("order_id")
      .eq("business_id", ctx.businessId).eq("order_number", c.orderNumber)
      .not("order_id", "is", null).limit(1).maybeSingle() as never);
    orderId = rand?.order_id ?? null;
  }

  const { data: cerere, error: eCerere } = await admin.from("trendyol_claims").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    claim_id: idCerere,
    order_number: c.orderNumber ?? null,
    shipment_package_id: idPachetului(c),
    claim_status: c.status ?? null,
    /* ⚠ VITRINA DE PE CARE A VENIT. Hotararea trebuie sa plece tot pe ea: Golful are cai
       separate, iar o aprobare trimisa pe calea europeana nu gaseste cererea. */
    storefront: ctx.auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT,
    /*
     * ⚠ „RESPINS" NU INSEAMNA „GATA". Cand ei creeaza un colet de retur-respins si
     * `dontShipBack` e `false`, comerciantul mai are de EXPEDIAT ceva inapoi la client. Fara
     * randurile astea, panoul i-ar fi spus „respins" si atat.
     *
     * ⚠ `null` inseamna „nu exista colet", nu „false": intreg `rejectedPackageInfo` lipseste
     * din raspuns cand nu s-a creat unul.
     */
    dont_ship_back: nuSeTrimiteInapoi(c),
    colet_respins: (coletDeTrimisInapoi(c) ?? null) as never,
    /* ⚠ Raspunsul lor INTREG: forma cererilor nu e in schema pe care o avem. */
    raw: c as never,
    claim_date: laData(c.claimDate),
    last_modified: laData(c.lastModifiedDate),
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "business_id,claim_id" }).select("id").single();

  if (eCerere || !cerere) {
    await logError({
      action: "trendyol/retururi",
      message: `returul nu s-a putut scrie: ${eCerere?.message ?? "rand negasit"}`,
      details: { claimId: idCerere }, businessId: ctx.businessId, severity: "warning",
    });
    return false;
  }

  const claimRowId = (cerere as { id: string }).id;
  for (const l of liniileReturului(c)) {
    const { error: eLinie } = await admin.from("trendyol_claim_items").upsert({
      business_id: ctx.businessId,
      claim_row_id: claimRowId,
      claim_item_id: l.claimItemId,
      order_line_id: l.orderLineId,
      barcode: l.barcode,
      product_name: l.numeProdus,
      quantity: l.cantitate,
      reason: l.motiv,
      customer_note: l.notaClient,
      /* ⚠ Starea LINIEI, nu a cererii: o cerere „in analiza" poate avea deja bucati hotarate. */
      claim_item_status: l.stare,
      raw: l.brut as never,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "business_id,claim_item_id" });
    if (eLinie) {
      await logError({
        action: "trendyol/retururi",
        message: `linia returului nu s-a putut scrie: ${eLinie.message}`,
        details: { claimId: idCerere, claimItemId: l.claimItemId },
        businessId: ctx.businessId, severity: "warning",
      });
      return false;
    }
  }
  return true;
}

/**
 * Comerciantul accepta sau respinge liniile alese.
 *
 * ⚠ NU ATINGE STOCUL. Acceptarea inseamna „banii se intorc", nu „marfa e buna". Repunerea in
 * stoc e o a doua apasare, dupa ce omul se uita la ce a primit — vezi `repuneInStoc`.
 */
export async function hotarasteRetur(
  admin: Db, ctx: TrendyolSyncContext,
  p: { claimId: string; claimItemIds: string[]; accepta: boolean; motivId?: number; explicatie?: string },
): Promise<{ ok: true } | { error: string }> {
  if (p.claimItemIds.length === 0) return { error: "Alege întâi liniile de retur." };

  /*
   * ═══ ⚠ LINIILE TREBUIE SA FIE CHIAR ALE CERERII ASTEIA (26.08.2026) ═══
   *
   * Panoul tinea o singura lista de bifate peste toate cererile de pe ecran. Cu doua cereri
   * deschise, apasarea pe „Acceptă" de la prima trimitea si liniile bifate la a doua — iar noi
   * le trimiteam mai departe fara sa ne uitam.
   *
   * ⚠ Si scrierea locala se face pe `claim_row_id`, nu doar pe id-uri: altfel ce refuza ei
   * ramane marcat hotarat la noi, si cele doua parti pleaca una de langa alta.
   *
   * ⚠ NU E DOAR IGIENA DE PANOU. Actiunile de server se pot chema cu orice argumente, printr-un
   * POST direct — verificarea trebuie sa fie AICI, nu in ecran.
   */
  const cerere = randCitit<{ id: string; storefront: string | null }>(
    "trendyol.cerereaDeHotarat", await admin
      .from("trendyol_claims").select("id, storefront")
      .eq("business_id", ctx.businessId).eq("claim_id", p.claimId).maybeSingle() as never);
  if (!cerere) return { error: "Returul nu există în magazinul tău." };

  /*
   * ⚠ HOTARAREA PLEACA PE VITRINA DE PE CARE A VENIT RETURUL, nu pe cea de origine a
   * magazinului. Cu Cross-Country pornit, un retur grecesc aprobat pe vitrina romaneasca ar
   * fi cautat o cerere care acolo nu exista — iar Golful are de-a dreptul alte cai (`-gulf`).
   */
  const ctxCerere = cerere.storefront && cerere.storefront !== ctx.auth.storefront
    ? { ...ctx, auth: { ...ctx.auth, storefront: cerere.storefront as TrendyolStoreFront } }
    : ctx;

  const aleCererii = randuriCitite<{ claim_item_id: string }>("trendyol.liniileCererii", await admin
    .from("trendyol_claim_items").select("claim_item_id")
    .eq("business_id", ctx.businessId).eq("claim_row_id", cerere.id) as never);
  const ingaduite = new Set(aleCererii.map((l) => l.claim_item_id));
  const straine = p.claimItemIds.filter((id) => !ingaduite.has(id));
  if (straine.length > 0) {
    await logError({
      action: "trendyol/retururi",
      message: "s-au cerut linii care nu sunt ale returului; hotararea nu s-a trimis",
      details: { claimId: p.claimId, straine: straine.slice(0, 10) },
      businessId: ctx.businessId, severity: "warning",
    });
    return { error: "Unele linii bifate nu sunt din acest retur. Reîncarcă pagina și încearcă din nou." };
  }

  if (p.accepta) {
    const res = await approveClaimItems(ctxCerere.auth, p.claimId, p.claimItemIds);
    if (isTrendyolError(res)) return { error: res.error };
  } else {
    /* ⚠ Motivul e cerut de EI, si asa si trebuie: un retur respins fara explicatie ajunge la
       arbitrajul lor, iar acolo tacerea vanzatorului nu ajuta pe nimeni. */
    if (!p.motivId) return { error: "Alege motivul respingerii." };
    const explicatie = (p.explicatie ?? "").trim();
    if (!explicatie) return { error: "Scrie de ce respingi returul." };
    /* ⚠ 500 de caractere e plafonul LOR. Taiata aici, explicatia pleaca; netaiata, cererea e
       refuzata intreaga si comerciantul nu afla de ce. */
    if (explicatie.length > MAX_EXPLICATIE) {
      return { error: `Explicația poate avea cel mult ${MAX_EXPLICATIE} de caractere.` };
    }
    const res = await rejectClaimItems(ctxCerere.auth, p.claimId, {
      claimIssueReasonId: p.motivId,
      claimItemIdList: p.claimItemIds,
      description: explicatie,
    });
    if (isTrendyolError(res)) return { error: res.error };
  }

  /* ⚠ Se scrie DUPA raspunsul lor, nu inainte: o hotarare marcata la noi si netrimisa la ei ar
     fi cea mai rea forma — comerciantul crede ca a rezolvat, iar cererea le expira netratata. */
  const { error } = await admin.from("trendyol_claim_items")
    .update({
      decizie: p.accepta ? "accepted" : "rejected",
      decis_la: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("business_id", ctx.businessId)
    .eq("claim_row_id", cerere.id)
    .in("claim_item_id", p.claimItemIds);

  if (error) {
    await logError({
      action: "trendyol/retururi",
      message: `hotararea s-a trimis la Trendyol dar nu s-a scris la noi: ${error.message}`,
      details: { claimId: p.claimId }, businessId: ctx.businessId, severity: "warning",
    });
  }
  return { ok: true };
}

/**
 * Marfa s-a intors si e buna: se pune inapoi in stoc, pe cantitatea din linie.
 *
 * ⚠ IDEMPOTENT PE LINIE. `repus_in_stoc_la` se scrie o data; a doua apasare nu mai adauga.
 * Fara asta, doua clicuri ar fi umflat stocul, si nimeni n-ar fi stiut de unde vine.
 */
export async function repuneInStoc(
  admin: Db, ctx: TrendyolSyncContext, claimItemId: string,
): Promise<{ ok: true; pus: number } | { error: string }> {
  /*
   * ═══ ⚠ ERA IN TREI PASI, DECI SE PUTEA DUBLA (26.08.2026) ═══
   *
   * Citeste marcajul → aduna stocul → scrie marcajul. Doua apasari repezi treceau amandoua de
   * citire cu marcajul gol si adunau amandoua. Sau adunarea reusea si scrierea marcajului pica,
   * iar omul incerca din nou — cu acelasi capat.
   *
   * ⚠ ACUM E O SINGURA TRANZACTIE, cu randul luat `for update` inauntru. A doua apasare
   * asteapta, apoi vede marcajul si nu mai adauga nimic. Stocul e ultimul loc unde iti permiti
   * doua socoteli, si „idempotent" scris in comentariu nu tine loc de blocare.
   */
  const { data, error } = await admin.rpc("trendyol_repune_stoc_retur", {
    p_business_id: ctx.businessId,
    p_claim_item_id: claimItemId,
  });

  if (error) {
    await logError({
      action: "trendyol/retururi",
      message: `repunerea in stoc a picat: ${error.message}`,
      details: { claimItemId }, businessId: ctx.businessId, severity: "warning",
    });
    return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }

  const r = (data ?? {}) as { stare?: string; pus?: number };
  switch (r.stare) {
    case "pus": return { ok: true, pus: Number(r.pus) || 0 };
    /* Nu e o eroare: e chiar raspunsul corect la a doua apasare. */
    case "deja": return { ok: true, pus: 0 };
    case "lipsa": return { error: "Linia de retur nu există." };
    case "fara-cod": return { error: "Linia n-are cod de bare, deci nu știm ce produs să punem înapoi." };
    case "cod-nelegat": return { error: "Codul de bare nu e legat de niciun produs din magazin." };
    case "fara-produs": return { error: "Listarea nu mai are produs legat." };
    default: return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }
}

/** Cate cereri asteapta o hotarare. Pentru pastila din panou. */
export async function cateRetururiAsteapta(admin: Db, businessId: string): Promise<number> {
  const randuri = randuriCitite<{ id: string }>("trendyol.retururiDeHotarat", await admin
    .from("trendyol_claims").select("id")
    .eq("business_id", businessId)
    .in("claim_status", ["Created", "WaitingInAction", "InAnalysis"]) as never);
  return randuri.length;
}
