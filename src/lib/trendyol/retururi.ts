import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { approveClaimItems, getClaims, isTrendyolError, rejectClaimItems } from "./client";
import type { TrendyolSyncContext } from "./sync";
import type { TrendyolClaim, TrendyolClaimItem } from "./types";
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

/** Cate pagini se citesc intr-o trecere. */
const PAGINI_PE_TRECERE = 3;

/** Liniile cererii, oricare ar fi numele campului in raspunsul lor. */
function liniile(c: TrendyolClaim): TrendyolClaimItem[] {
  const brute = Array.isArray(c.items) ? c.items : Array.isArray(c.claimItems) ? c.claimItems : [];
  return brute.filter((x): x is TrendyolClaimItem => !!x && typeof x === "object");
}

/** Id-ul unei linii, oricare ar fi numele lui. */
function idLinie(l: TrendyolClaimItem): string | null {
  const brut = l.claimItemId ?? l.id;
  return typeof brut === "string" && brut.trim() ? brut.trim() : null;
}

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
  admin: Db, ctx: TrendyolSyncContext,
): Promise<{ aduse: number; ok: boolean }> {
  const marcaj = Date.parse(ctx.config.claims_synced_at ?? "");
  const acum = Date.now();
  /* ⚠ Suprapunere de cinci minute peste marcaj: ceasul lor si al nostru nu bat la fel, iar o
     cerere modificata chiar in secunda marcajului ar cadea intre doua ferestre. */
  const de_la = Number.isFinite(marcaj)
    ? Math.max(marcaj - 5 * 60_000, acum - FEREASTRA_MAXIMA_MS)
    : acum - FEREASTRA_INITIALA_MS;

  let aduse = 0;
  let ok = true;

  for (let pagina = 0; pagina < PAGINI_PE_TRECERE; pagina++) {
    const res = await getClaims(ctx.auth, { startDate: de_la, endDate: acum, page: pagina, size: 50 });
    if (isTrendyolError(res)) {
      await logError({
        action: "trendyol/retururi",
        message: `cererile de retur nu s-au putut citi: ${res.error}`,
        details: { pagina, status: res.status }, businessId: ctx.businessId, severity: "warning",
      });
      /* ⚠ Marcajul NU avanseaza: fereastra se reia. */
      return { aduse, ok: false };
    }

    const continut = res.data?.content ?? [];
    for (const c of continut) {
      const idCerere = typeof c.id === "string" && c.id.trim() ? c.id.trim() : null;
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
 * O trecere intreaga: aduce si muta marcajul, dar NUMAI daca s-a citit tot.
 *
 * ⚠ MARCAJUL AVANSEAZA NUMAI LA O TRECERE INTREAGA. Pus la „acum" dupa una trunchiata,
 * cererile necitite ar ramane in urma ferestrei si NU s-ar mai citi niciodata — fara nicio
 * eroare, fiindca fiecare trecere in parte a reusit. E chiar incidentul pentru care exista
 * `marcaj.ts` la comenzi.
 */
export async function treceRetururile(
  admin: Db, ctx: TrendyolSyncContext,
): Promise<{ aduse: number }> {
  const inceput = Date.now();
  const r = await aduRetururile(admin, ctx);
  if (r.ok) {
    /* ⚠ Se scrie clipa DE DINAINTE de citire, minus suprapunerea: orice s-a schimbat cat timp
       citeam trebuie sa intre in fereastra urmatoare. */
    await patchTrendyolConfig(admin, ctx.businessId, {
      claims_synced_at: new Date(inceput - 5 * 60_000).toISOString(),
    });
  }
  return { aduse: r.aduse };
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
    shipment_package_id: Number.isFinite(Number(c.shipmentPackageId)) ? Number(c.shipmentPackageId) : null,
    claim_status: c.status ?? null,
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
  for (const l of liniile(c)) {
    const idl = idLinie(l);
    if (!idl) continue;
    const { error: eLinie } = await admin.from("trendyol_claim_items").upsert({
      business_id: ctx.businessId,
      claim_row_id: claimRowId,
      claim_item_id: idl,
      barcode: l.barcode ?? null,
      product_name: l.productName ?? null,
      /* ⚠ Implicit 1, nu 0: o linie fara cantitate e tot o bucata intoarsa, iar zero ar fi
         facut-o sa para o cerere goala. */
      quantity: Number.isFinite(Number(l.quantity)) && Number(l.quantity) > 0 ? Number(l.quantity) : 1,
      reason: l.customerClaimItemReason?.name ?? l.trendyolClaimItemReason?.name ?? null,
      customer_note: l.customerNote ?? null,
      raw: l as never,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "business_id,claim_item_id" });
    if (eLinie) {
      await logError({
        action: "trendyol/retururi",
        message: `linia returului nu s-a putut scrie: ${eLinie.message}`,
        details: { claimId: idCerere, claimItemId: idl }, businessId: ctx.businessId, severity: "warning",
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

  if (p.accepta) {
    const res = await approveClaimItems(ctx.auth, p.claimId, p.claimItemIds);
    if (isTrendyolError(res)) return { error: res.error };
  } else {
    /* ⚠ Motivul e cerut de EI, si asa si trebuie: un retur respins fara explicatie ajunge la
       arbitrajul lor, iar acolo tacerea vanzatorului nu ajuta pe nimeni. */
    if (!p.motivId) return { error: "Alege motivul respingerii." };
    const explicatie = (p.explicatie ?? "").trim();
    if (!explicatie) return { error: "Scrie de ce respingi returul." };
    const res = await rejectClaimItems(ctx.auth, p.claimId, {
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
    .eq("business_id", ctx.businessId).in("claim_item_id", p.claimItemIds);

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
  const linie = randCitit<{
    id: string; barcode: string | null; quantity: number; repus_in_stoc_la: string | null;
  }>("trendyol.liniaDeRepus", await admin
    .from("trendyol_claim_items").select("id, barcode, quantity, repus_in_stoc_la")
    .eq("business_id", ctx.businessId).eq("claim_item_id", claimItemId).maybeSingle() as never);

  if (!linie) return { error: "Linia de retur nu există." };
  if (linie.repus_in_stoc_la) return { ok: true, pus: 0 };
  if (!linie.barcode) return { error: "Linia n-are cod de bare, deci nu știm ce produs să punem înapoi." };

  /* Barcode -> varianta -> produs. Tot ce leaga marfa lor de a noastra. */
  const varianta = randCitit<{ listing_id: string; variant_title: string | null }>(
    "trendyol.variantaReturului", await admin
      .from("trendyol_variants").select("listing_id, variant_title")
      .eq("business_id", ctx.businessId).eq("barcode", linie.barcode).maybeSingle() as never);
  if (!varianta) return { error: "Codul de bare nu e legat de niciun produs din magazin." };

  const listare = randCitit<{ product_id: string | null }>("trendyol.listareaReturului", await admin
    .from("trendyol_listings").select("product_id").eq("id", varianta.listing_id).maybeSingle() as never);
  if (!listare?.product_id) return { error: "Listarea nu mai are produs legat." };

  /*
   * ⚠ SE FOLOSESTE FUNCTIA CASEI, nu una scrisa aici. `elibereaza_stoc_complet` e chiar cea
   * prin care se intoarce stocul la anulari, si stie amandoua felurile: produsul intreg si
   * combinatia. O a doua adunare scrisa langa ea s-ar fi despartit de prima la prima
   * schimbare — si stocul e ultimul loc unde iti permiti doua socoteli.
   *
   * ⚠ Variantele merg pe `variant_title`, nu pe un id: aceeasi lectie ca la marketplace-uri —
   * indicii se muta cand comerciantul rearanjeaza combinatiile, titlurile nu.
   */
  const peProdus = varianta.variant_title
    ? []
    : [{ product_id: listare.product_id, quantity: linie.quantity }];
  const peVarianta = varianta.variant_title
    ? [{ product_id: listare.product_id, variant_title: varianta.variant_title, quantity: linie.quantity }]
    : [];

  const { error } = await admin.rpc("elibereaza_stoc_complet", {
    p_produse: peProdus as never,
    p_variante: peVarianta as never,
  });
  if (error) return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };

  await admin.from("trendyol_claim_items")
    .update({ repus_in_stoc_la: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
    .eq("id", linie.id);

  return { ok: true, pus: linie.quantity };
}

/** Cate cereri asteapta o hotarare. Pentru pastila din panou. */
export async function cateRetururiAsteapta(admin: Db, businessId: string): Promise<number> {
  const randuri = randuriCitite<{ id: string }>("trendyol.retururiDeHotarat", await admin
    .from("trendyol_claims").select("id")
    .eq("business_id", businessId)
    .in("claim_status", ["Created", "WaitingInAction", "InAnalysis"]) as never);
  return randuri.length;
}
