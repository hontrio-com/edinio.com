// Shared (non-"use server") helpers for abandoned-cart capture & recovery.
// Lives outside the actions file so order creation can reuse markCartConverted
// with the admin client already in its scope.

import { construiesteTrepte, pretPeTrepte } from "@/lib/storefront/quantity-tiers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { hasVariants, cerePersonalizare, parseVariants, findCombo, comboUnitPrice } from "@/lib/storefront/variants";
import { normalizeazaCantitate } from "@/lib/orders/quantity";
import { normalizeazaDefinitia } from "@/lib/customization/definitie";
import { normalizeazaValorile } from "@/lib/customization/valori";
import { pretUnitar as pretUnitarCuPersonalizare, pretulPersonalizarii } from "@/lib/customization/pret";

export interface AbandonedCartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
  /**
   * Combinatia aleasa („S / Rosu") si personalizarea, ca linia sa se poata REFACE intreaga.
   *
   * ═══ ⚠ DE CE N-AU FOST AICI PANA PE 07.09.2026 ═══
   *
   * Instantaneul avea cinci campuri, iar cele doua cai care il scriu il compun cu un `.map()` care
   * le arunca. Deci `liniiRecuperabile` SAREA peste orice produs cu variante sau cu personalizare:
   * o linie refacuta fara marime sau fara gravura ar fi intrat in cos necomandabila, iar
   * `restoreCart` SUPRASCRIE cosul — clientul ar fi ramas cu o comanda pe care n-o poate trimite.
   *
   * Sarirea era raspunsul corect ATUNCI. Acum linia le poarta, deci se poate reface intreaga.
   *
   * ⚠ SE PASTREAZA VALORILE, NU PRETUL. Ca peste tot pe drumul asta: `price` se ia din catalog la
   * recuperare, iar suplimentul se socoteste din definitia de ATUNCI, nu din ce s-a salvat.
   */
  variant_title?: string | null;
  customization?: Record<string, unknown> | null;
}

export interface AbandonedProduct {
  name: string;
  quantity: number;
  value: number;
  carts: number;
  image_url: string | null;
}

export interface AbandonedCartRow {
  id: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  items: AbandonedCartItem[];
  item_count: number;
  subtotal: number;
  source: string;
  last_activity_at: string;
  created_at: string;
  recovery_email_sent_at: string | null;
  recovery_sms_sent_at: string | null;
  recovery_count: number;
}

export interface AbandonedCartsData {
  enabled: boolean;
  smsoEnabled: boolean;
  // SMS recovery is available if EITHER SMSO or notice.ro (abandoned-cart) is configured.
  smsEnabled: boolean;
  storeUrl: string;
  storeName: string;
  primaryColor: string;
  kpis: {
    abandonedCount: number;
    abandonedValue: number;
    avgCartValue: number;
    abandonRate: number;
    recoveredCount: number;
    recoveredValue: number;
  };
  potentialRevenueThisMonth: number;
  abandonedProducts: AbandonedProduct[];
  carts: AbandonedCartRow[];
  automation: AbandonedAutomationConfig;
  isPremium: boolean;
  discounts: { code: string; type: string; value: number }[];
}

// How long without activity before an open cart is considered "abandoned".
export const ABANDON_MINUTES = 60;

/**
 * Mai poate fi recuperat cosul asta, sau a trecut fereastra de retentie?
 *
 * ═══ ⚠ O SINGURA REGULA PENTRU PATRU DRUMURI ═══
 *
 * Linkul de recuperare o avea (`getRecoverableCart`), iar celelalte trei nu: emailul manual, SMS-ul
 * manual si automatizarea din cron. Deci un cos de sapte luni primea mesajul, uneori un SMS PLATIT
 * de comerciant, clientul apasa, si la capat il astepta o vitrina care sterge parametrul si nu
 * spune nimic. Comerciantul platea ca sa trimita omul intr-un zid.
 *
 * ⚠ TERMENUL E CHIAR AL FISIERELOR, nu unul ales aparte: dupa `LUNI_PE_COMANDA` cronul de
 * curatenie sterge pozele cumparatorilor din cosurile deschise (vezi `curata-fisiere/reguli.ts`).
 * Doua numere apropiate ar fi lasat o fereastra in care cosul se recupereaza si fisierele lui nu mai
 * sunt, adica exact defectul reparat la link.
 *
 * ⚠ CEASUL E `last_activity_at`, NU `created_at`. Un cos lucrat luni de zile, la care omul se
 * intoarce, e viu; unul deschis o data si uitat nu.
 *
 * ⚠ SI O DATA LIPSA E „PREA VECHI", nu „proaspat": nu se trimite un mesaj pe o presupunere, si nu
 * se sterg fisiere pe una. Aceeasi purtare ca la link.
 */
export function cosulMaiPoateFiRecuperat(
  ultimaMiscare: string | null | undefined,
  prag: Date,
): boolean {
  if (!ultimaMiscare) return false;
  const t = new Date(ultimaMiscare);
  return !Number.isNaN(t.getTime()) && t >= prag;
}

/**
 * Ce i se spune comerciantului cand incearca sa trimita pe un cos iesit din fereastra.
 *
 * ⚠ SPUNE SI DE CE, si ce mai poate face: „nu se poate" l-ar fi trimis la suport.
 */
export const COS_PREA_VECHI =
  "Cosul asta e mai vechi de sase luni, deci nu mai poate fi recuperat: fisierele si preturile lui"
  + " au expirat, iar linkul l-ar duce pe client la un cos gol. Mesajul nu a plecat.";

// ── Repretuirea unui cos salvat ────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Randul din catalog al unui produs dintr-un cos salvat. */
export interface ProdusCosSalvat {
  id: string;
  name: string;
  price: number | null;
  images: unknown;
  is_active: boolean | null;
  page_sections: unknown;
}

/**
 * Liniile unui cos salvat, aduse la zi din catalog.
 *
 * REGULA SE SCRIE AICI SI NUMAI AICI, fiindca are trei consumatori care trebuie
 * sa spuna acelasi lucru: linkul „recupereaza cosul", emailul de recuperare
 * trimis manual din panou si cel trimis de cron. Pana pe 2026-08-04 doar linkul
 * repretuia; cele doua emailuri randau `items` si `subtotal` exact asa cum
 * fusesera inghetate in localStorage la captura. Masurat in productie in ziua
 * aceea: 33 din 129 de linii salvate tineau alt pret decat catalogul, si 2
 * emailuri plecasera deja cu asemenea linii. (Cifra e pe TOATE liniile salvate,
 * ceea ce e potrivit aici: emailul le randeaza pe toate, si pe cele venite din
 * formularul de comanda. Pentru defectul de AFISARE din cos, populatia e alta —
 * vezi `CartPieces`.) Un email semnat de magazin care
 * promite un pret pe care magazinul nu-l mai onoreaza e mai rau decat niciun
 * email.
 *
 * O linie DISPARE cand produsul nu mai e in catalog sau e dezactivat, si cand
 * produsul CERE ceva ce randul salvat n-are: varianta pentru un produs cu
 * variante, personalizarea pentru unul care o cere. Nu e o alegere de afisare, ci
 * consecinta: exact astea sunt liniile pe care linkul de recuperare nu le mai
 * poate pune inapoi in cos, iar daca emailul le-ar lista, clientul ar da clic si
 * ar ajunge pe un cos care nu contine ce i s-a promis.
 *
 * ⚠ TEXTUL DE AICI SPUNEA ALTCEVA PANA PE 07.09.2026: ca se sare peste ORICE
 * produs cu variante sau cu personalizare. Asa era, si era corect atunci, fiindca
 * instantaneul avea cinci campuri si nu le purta. Acum le poarta (vezi
 * `AbandonedCartItem`), deci se sare doar randul care chiar nu se poate reface.
 * Regula scrisa e cea de la `liniiRecuperabile`, mai jos; randurile astea o
 * rezuma, si au ramas in urma o zi.
 */
/** Pretul unitar cu treptele aplicate, in unitatea in care emailul inmulteste. */
function esteObiect(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pretEfectiv(
  p: ProdusCosSalvat,
  cantitate: number,
  personalizare: unknown,
  variantTitle: string | null | undefined,
): number {
  /*
   * ═══ ⚠ PRETUL VARIANTEI, NU AL PRODUSULUI ═══
   *
   * Aici se pornea intotdeauna de la `p.price` — pretul de CATALOG — desi `liniiRecuperabile`
   * pastreaza de curand `variant_title`. Masurat: produs 100 lei, marimea XL 150 lei, linia
   * salvata cu „XL" — emailul de recuperare scria „XL — 100 lei", iar cosul o repretuia la 150
   * imediat ce omul apasa linkul. Adica exact felul de discrepanta pe care regula asta exista ca
   * s-o opreasca: promisiunea din email nu se tinea nici pana la prima pagina.
   *
   * ⚠ SE FOLOSESTE ACELASI AJUTOR CA VITRINA (`comboUnitPrice` peste `findCombo`), nu o citire
   * proprie a combinatiilor. Scrisa aici a doua oara, ea ar fi divergit de vitrina — si tocmai
   * asta e greseala pe care emailul o face vizibila clientului.
   *
   * ⚠ SI ORDINEA E CEA A COSULUI: pret de varianta -> treapta de cantitate -> personalizare.
   * Treptele se socotesc din pretul CHIAR AL VARIANTEI (asa face si `construiesteTrepte` pe
   * pagina de produs, unde primeste `displayPrice`), iar suplimentul se adauga la urma.
   *
   * ⚠ O varianta disparuta din catalog (comerciantul a sters marimea) cade pe pretul de baza —
   * un numar vechi, nu unul inventat —, iar cosul marcheaza linia „Necesita actualizare" la
   * restaurare.
   */
  const baza = round2(Number(p.price) || 0);
  const variante = parseVariants(p.page_sections);
  const unitar = variante
    ? round2(comboUnitPrice(findCombo(variante, variantTitle ?? null), baza))
    : baza;
  const trepte = construiesteTrepte((p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers, unitar);
  const cuTrepte = pretPeTrepte(trepte, cantitate, unitar).subtotal / cantitate;
  /*
   * ═══ ⚠ SI SUPLIMENTUL DE PERSONALIZARE ═══
   *
   * Fara el, emailul de recuperare ar promite 89 de lei pentru un fototapet care costa 910 — exact
   * felul de minciuna pe care regula asta exista ca s-o opreasca (vezi nota de deasupra: 33 din 129
   * de linii tineau alt pret decat catalogul, si doua emailuri plecasera deja asa).
   *
   * ⚠ SE SOCOTESTE DIN DEFINITIA DE ACUM, nu din pretul salvat: valorile sunt ale clientului,
   * suma e a noastra. Daca definitia s-a schimbat si valorile nu se mai potrivesc, se cade pe
   * pretul de catalog — un numar vechi, dar nu unul inventat — iar cosul marcheaza linia
   * „Necesita actualizare" la restaurare.
   */
  if (!esteObiect(personalizare)) return cuTrepte;
  const definitie = normalizeazaDefinitia(
    (p.page_sections as { customization?: unknown } | null)?.customization,
  );
  if (!definitie) return cuTrepte;
  const curate = normalizeazaValorile(definitie, personalizare);
  if (!curate.ok) return cuTrepte;
  return round2(pretUnitarCuPersonalizare(pretulPersonalizarii(definitie, curate.valori), cuTrepte));
}

/**
 * Pretul liniei asteia e o CADERE PE CATALOG, nu suma ei adevarata?
 *
 * ═══ ⚠ DE CE TREBUIE STIUT IN AFARA ═══
 *
 * `pretEfectiv` cade pe pretul de catalog cand valorile nu se mai potrivesc cu definitia de acum:
 * comerciantul a scos „Premium" dupa ce omul pusese produsul in cos. E purtarea corecta pentru un
 * NUMAR (mai bine unul vechi decat unul inventat), dar tace, iar emailul de recuperare e semnat de
 * magazin: el ajunge sa promita 89 de lei pentru un fototapet care costa 910, si dupa clic clientul
 * gaseste linia marcata „Necesita actualizare".
 *
 * Un mesaj de marketing care cere mai putin decat se poate onora e a doua fata a aceleiasi
 * minciuni pe care o repara `pretEfectiv`.
 *
 * ⚠ NU FACE LINIA NERECUPERABILA. Ea se reface in cos si omul poate alege din nou; ce se schimba e
 * doar ca emailul nu mai scrie o suma pe care n-o poate sustine.
 */
export function pretulEsteNesigur(p: ProdusCosSalvat, personalizare: unknown): boolean {
  /*
   * ⚠ SI O PERSONALIZARE GOALA E „FARA PERSONALIZARE". Linia n-are niciun supliment de pierdut,
   * deci pretul de catalog e chiar pretul ei: nu se ascunde nimic pentru un `{}`. Aceeasi margine
   * ca la `pretulNevalidat`, din cos.
   */
  if (!esteObiect(personalizare) || Object.keys(personalizare).length === 0) return false;
  const definitie = normalizeazaDefinitia(
    (p.page_sections as { customization?: unknown } | null)?.customization,
  );
  if (!definitie) return true;
  return !normalizeazaValorile(definitie, personalizare).ok;
}

export function liniiRecuperabile(
  salvate: AbandonedCartItem[],
  catalog: Map<string, ProdusCosSalvat>,
): AbandonedCartItem[] {
  const out: AbandonedCartItem[] = [];
  for (const it of salvate ?? []) {
    const p = it && catalog.get(it.product_id);
    if (!p || !p.is_active) continue;
    /*
     * ⚠ SI PERSONALIZAREA, DIN ACELASI MOTIV CA VARIANTELE — dar motivul s-a schimbat.
     *
     * Cosul poarta acum personalizarea, iar `placeCartOrder` o repretuieste. Ce NU o poarta e
     * INSTANTANEUL de aici: `AbandonedCartItem` are cinci campuri, si nici `variantTitle` nu e
     * printre ele. Deci o linie restaurata din el ar reveni in cos FARA gravura si fara dimensiuni
     * — necomandabila, exact ca una cu varianta pierduta.
     *
     * ⚠ Se sare, si asa refuzul de mai sus (email si SMS) ramane adevarat: linkul de recuperare
     * n-ar duce la un cos pe care omul sa-l poata cumpara. Purtarea LOR e o lucrare simetrica cu
     * cea a variantelor, si una fara alta ar fi mai rau decat niciuna.
     */
    /*
     * ═══ ⚠ CE SE MAI SARE, SI CE NU (schimbat 07.09.2026) ═══
     *
     * Se sarea ORICE produs cu variante sau cu personalizare, fiindca instantaneul nu le purta:
     * linia refacuta ar fi intrat in cos fara marime si fara gravura, iar `restoreCart` SUPRASCRIE
     * cosul — clientul ar fi ramas cu o comanda pe care n-o poate trimite.
     *
     * Acum instantaneul le poarta. Deci se sare doar linia care CHIAR nu se poate reface:
     * produsul cere ceva, si randul salvat n-are ce sa-i dea.
     *
     * ⚠ SI NU SE VERIFICA AICI DACA VALORILE MAI SUNT VALIDE. Definitia se poate schimba intre
     * timp — dar atunci linia se reface si cosul o marcheaza „Necesita actualizare"
     * (`cereRevizuire`), iar omul o poate repara. Sarita, ar fi disparut fara explicatie dintr-un
     * email pe care tot noi i l-am trimis.
     */
    const areVariante = hasVariants(p.page_sections);
    const cerePers = cerePersonalizare(p.page_sections);
    if (areVariante && !it.variant_title) continue;
    if (cerePers && !esteObiect(it.customization)) continue;
    out.push({
      product_id: p.id,
      // Si numele, si poza vin din catalog: daca produsul a fost redenumit intre
      // timp, emailul trebuie sa spuna ce va gasi clientul in cos, nu ce scria
      // acolo acum trei saptamani.
      name: p.name,
      /*
       * Pretul purtat e cel EFECTIV, cu treptele de cantitate aplicate.
       *
       * Emailul randeaza `price * quantity`, iar cosul in care aterizeaza
       * clientul dupa clic trece prin `pretPeTrepte`. Scris cu pretul de baza,
       * emailul promitea 3 x 40 = 120 lei pentru un cos care arata 108 — si asta
       * pe 17 cosuri din productie care erau CORECTE inainte, cu 100,52 lei
       * supraevaluati in total. Un email semnat de magazin care cere mai mult
       * decat cosul e a doua fata a aceleiasi minciuni pe care o repara
       * constatarea asta.
       *
       * Se imparte inapoi la cantitate fiindca asta e unitatea in care emailul
       * inmulteste; `pretPeTrepte` lasa dinadins pretul unitar nerotunjit, ca
       * `pret x cantitate` sa dea exact subtotalul (vezi constatarea 15).
       */
      price: pretEfectiv(p, normalizeazaCantitate(it.quantity), it.customization, it.variant_title),
      quantity: normalizeazaCantitate(it.quantity),
      image_url: (Array.isArray(p.images) && p.images.length ? (p.images[0] as string) : it.image_url) ?? null,
      /*
       * ⚠ SE DUC MAI DEPARTE, ca linia refacuta sa fie CHIAR linia lui. Fara ele, „recupereaza
       * cosul" ar fi pus in cos aceeasi cana, dar goala — iar identitatea liniei (`lineKey`) le
       * numara, deci n-ar fi fost nici macar aceeasi linie.
       */
      ...(it.variant_title ? { variant_title: it.variant_title } : {}),
      ...(esteObiect(it.customization) ? { customization: it.customization } : {}),
    });
  }
  return out;
}

/**
 * Cat face cosul repretuit — aceeasi suma pe care o va vedea clientul in cos,
 * fiindca liniile poarta pretul cu treptele deja aplicate.
 */
export function totalCosRecuperabil(items: AbandonedCartItem[]): number {
  return round2((items ?? []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0));
}

/**
 * Cosul salvat, adus la zi din catalog: liniile care se mai pot cumpara si cat
 * fac ele azi.
 *
 * Primeste clientul ca parametru, ca `markCartConverted`, ca sa poata fi chemat
 * si dintr-o actiune „use server", si din ruta de cron.
 *
 * `items` gol inseamna „nu mai e nimic de recuperat": apelantul NU trebuie sa
 * trimita un email pe cosul asta.
 */
export async function cosRecuperabil(
  client: SupabaseClient<Database>,
  businessId: string,
  salvate: AbandonedCartItem[],
): Promise<{ items: AbandonedCartItem[]; total: number; sigur: boolean }> {
  const ids = [...new Set((salvate ?? []).map((i) => i?.product_id).filter(Boolean))];
  if (ids.length === 0) return { items: [], total: 0, sigur: true };

  const { data } = await client
    .from("products")
    .select("id, name, price, images, is_active, page_sections")
    .eq("business_id", businessId)
    .in("id", ids);

  const catalog = new Map<string, ProdusCosSalvat>((data ?? []).map((p) => [p.id, p as ProdusCosSalvat]));
  const items = liniiRecuperabile(salvate, catalog);
  /*
   * ⚠ SI CAT DE MULT NE PUTEM LEGA DE SUMA ASTA. Cand o linie a cazut inapoi pe pretul de catalog
   * fiindca definitia s-a schimbat, totalul e un numar plauzibil pe care magazinul nu-l poate
   * onora. Emailul si SMS-ul se uita la steagul asta si nu mai scriu suma; cosul, la clic, o
   * marcheaza oricum „Necesita actualizare".
   */
  const sigur = (salvate ?? []).every((it) => {
    const p = catalog.get(it?.product_id);
    return !p || !pretulEsteNesigur(p, it.customization);
  });
  return { items, total: totalCosRecuperabil(items), sigur };
}

/**
 * Instantaneul cosului, cu preturile ADUSE LA ZI din catalog, fara sa piarda vreo linie.
 *
 * ═══ ⚠ DE CE E ALTCEVA DECAT `cosRecuperabil` ═══
 *
 * Aceea raspunde la „ce se mai poate pune inapoi in cos", si de aceea ARUNCA liniile care nu se mai
 * pot reface. Aici intrebarea e alta: ce scriem in rand. Randul e si arhiva cosului, deci liniile
 * raman toate; ce se schimba e numarul de langa ele.
 *
 * ═══ ⚠ DE CE NU SE CRED PRETURILE TRIMISE ═══
 *
 * `trackAbandonedCart` e o actiune de server PUBLICA si anonima: id-ul ei ajunge in pachetul
 * fiecarui magazin. Cine o cheama de mana isi declara ce pret pofteste, iar numarul ala se aduna
 * mai departe in „Valoare cosuri abandonate", in media pe cos, in venitul potential si in „Cele mai
 * abandonate produse". Nu se poate CUMPARA nimic pe pretul asta, dar se pot murdari cifrele dupa
 * care comerciantul isi masoara magazinul.
 *
 * ⚠ SI PENTRU CINSTIT E TOT GRESIT: cosul salva pretul de BAZA al liniilor personalizate, adica 89
 * in loc de 910 pe un fototapet.
 *
 * ⚠ O SINGURA INTEROGARE, nu una pe linie: aceeasi citire ca la recuperare, cu `in (...)`.
 *
 * ⚠ CE NU MAI E IN CATALOG capata ZERO, nu pretul declarat. Un produs sters nu se poate vinde, deci
 * n-are ce cauta in valoarea cosurilor recuperabile; linia ramane totusi in rand, ca sa se vada ce
 * a avut omul.
 */
export async function cuPreturileDinCatalog(
  client: SupabaseClient<Database>,
  businessId: string,
  salvate: AbandonedCartItem[],
): Promise<AbandonedCartItem[]> {
  const ids = [...new Set((salvate ?? []).map((i) => i?.product_id).filter(Boolean))];
  if (ids.length === 0) return salvate ?? [];

  const { data, error } = await client
    .from("products")
    .select("id, name, price, images, is_active, page_sections")
    .eq("business_id", businessId)
    .in("id", ids);
  /*
   * ⚠ CITIREA PICATA LASA PRETURILE CUM AU VENIT, si nu le face zero: randul e si instantaneul din
   * care se reface cosul. Zero peste tot ar fi facut cosul sa para gol, iar recuperarea lui n-ar
   * mai fi plecat niciodata din cauza pragului comerciantului.
   */
  if (error) return salvate ?? [];

  const catalog = new Map<string, ProdusCosSalvat>((data ?? []).map((p) => [p.id, p as ProdusCosSalvat]));
  return (salvate ?? []).map((it) => {
    const p = catalog.get(it.product_id);
    const cantitate = normalizeazaCantitate(it.quantity);
    return {
      ...it,
      quantity: cantitate,
      price: p ? pretEfectiv(p, cantitate, it.customization, it.variant_title) : 0,
    };
  });
}

// Called from order creation (admin client in scope): when an order is placed,
// close any matching open cart so it leaves the "abandoned" set — and counts as
// recovered if a recovery message had been sent. Never throws.
export async function markCartConverted(
  admin: SupabaseClient<Database>,
  businessId: string,
  match: { sessionId?: string | null; email?: string | null; phone?: string | null; orderId: string },
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const patch = { status: "converted", order_id: match.orderId, converted_at: now, updated_at: now };

    let q = admin
      .from("abandoned_carts")
      .update(patch)
      .eq("business_id", businessId)
      .eq("status", "open");

    if (match.sessionId) {
      q = q.eq("session_id", match.sessionId);
    } else if (match.phone) {
      q = q.eq("phone", match.phone);
    } else if (match.email) {
      q = q.eq("email", match.email);
    } else {
      return; // nothing to match on
    }
    await q;
  } catch {
    // Recovery bookkeeping must never break an order.
  }
}

// Standard recovery message templates (with {nume}/{magazin} placeholders that are
// filled in per customer). Shown pre-filled in the UI so the merchant sees exactly
// what will be sent, and editable.
export const STANDARD_SMS_TEMPLATE = "Salut {nume}! Ai uitat produse in cosul tau la {magazin}. Finalizeaza comanda mai jos.";
export const STANDARD_EMAIL_TEMPLATE = "Buna {nume}! Ai lasat cateva produse in cosul tau la {magazin}. Le-am pastrat pentru tine, finalizeaza comanda inainte sa se epuizeze.";

export function standardRecoveryTemplate(channel: RecoveryChannel): string {
  return channel === "sms" ? STANDARD_SMS_TEMPLATE : STANDARD_EMAIL_TEMPLATE;
}

// Fill {nume}/{magazin} and tidy up spacing/punctuation if the name is empty.
export function interpolateRecoveryMessage(tpl: string, opts: { name?: string | null; store: string }): string {
  const first = opts.name?.trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{nume\}/gi, first)
    .replace(/\{magazin\}/gi, opts.store)
    .replace(/\s+([!,.?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Default recovery SMS body (editable by the merchant before sending).
export function defaultRecoverySms(opts: { name?: string | null; storeName: string; url: string; code?: string | null }): string {
  const first = opts.name?.trim().split(/\s+/)[0];
  const hi = first ? `Salut ${first}! ` : "Salut! ";
  const codePart = opts.code ? ` Foloseste codul ${opts.code} pentru reducere.` : "";
  return `${hi}Ai uitat produse in cosul tau la ${opts.storeName}.${codePart} Finalizeaza comanda aici: ${opts.url}`;
}

// ── Automations ────────────────────────────────────────────────────────────────
export type RecoveryChannel = "email" | "sms";

export interface AbandonedAutomationStep {
  id: string;
  delay_hours: number;
  channel: RecoveryChannel;
  message?: string;
  discount_code?: string;
}

export interface AbandonedAutomationConfig {
  enabled: boolean;
  min_cart_value: number | null;
  quiet_hours: { start: number; end: number } | null; // hours 0-23
  steps: AbandonedAutomationStep[];
}

// Parse + sanitize a raw automation config from store_settings.
export function readAutomationConfig(raw: unknown): AbandonedAutomationConfig {
  const c = (raw ?? {}) as Partial<AbandonedAutomationConfig>;
  const steps = Array.isArray(c.steps) ? c.steps : [];
  const qh = c.quiet_hours;
  return {
    enabled: c.enabled === true,
    min_cart_value: typeof c.min_cart_value === "number" && c.min_cart_value > 0 ? c.min_cart_value : null,
    quiet_hours: qh && typeof qh.start === "number" && typeof qh.end === "number"
      ? { start: clampHour(qh.start), end: clampHour(qh.end) } : null,
    steps: steps
      .filter((s): s is AbandonedAutomationStep => !!s && (s.channel === "email" || s.channel === "sms"))
      .map((s) => ({
        id: String(s.id ?? Math.random().toString(36).slice(2)),
        delay_hours: Math.max(0, Number(s.delay_hours) || 0),
        channel: s.channel,
        message: typeof s.message === "string" && s.message.trim() ? s.message.trim() : undefined,
        discount_code: typeof s.discount_code === "string" && s.discount_code.trim() ? s.discount_code.trim() : undefined,
      })),
  };
}

function clampHour(h: number): number {
  return Math.min(23, Math.max(0, Math.floor(h)));
}

// Is `hour` within quiet hours? Handles ranges that wrap past midnight.
export function isQuietHour(quiet: { start: number; end: number } | null, hour: number): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end
    ? hour >= quiet.start && hour < quiet.end
    : hour >= quiet.start || hour < quiet.end;
}

// Build the "restore cart" link: opening it rebuilds the customer's cart and
// jumps to checkout (handled on the storefront), optionally pre-applying a code.
export function buildRecoverUrl(storeUrl: string, cartId: string, discountCode?: string | null): string {
  try {
    const u = new URL(storeUrl);
    u.searchParams.set("recover", cartId);
    if (discountCode) u.searchParams.set("code", discountCode);
    return u.toString();
  } catch {
    const sep = storeUrl.includes("?") ? "&" : "?";
    return `${storeUrl}${sep}recover=${encodeURIComponent(cartId)}${discountCode ? `&code=${encodeURIComponent(discountCode)}` : ""}`;
  }
}
