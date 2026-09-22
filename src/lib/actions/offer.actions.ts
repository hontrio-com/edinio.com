"use server";

import { revalidatePath } from "next/cache";
import { aplicaPraguriCantitate } from "@/lib/offers/praguri-cantitate";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import {
  isOfferType, parseOfferTrigger, parseOfferConfig, parseOfferDisplay, PHASE1_OFFER_TYPES,
  type OfferType, type OfferTrigger, type OfferConfig, type OfferDisplay, type ResolvedOffer,
} from "@/lib/offers/offer.types";
import { resolveCartOffers } from "@/lib/offers/offers";
import { cosulDinLinii } from "@/lib/offers/porti";
import { idsDeAfisare, scrieStatisticiOferte } from "@/lib/offers/statistici";
import { perioadaOfertei } from "@/lib/zi-romaneasca";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function ownsBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", userId).single();
  return !!data;
}

export interface OfferFormData {
  type: OfferType;
  name: string;
  is_active: boolean;
  priority: number;
  trigger: unknown; // sanitized server-side before storage
  config: unknown;
  display: unknown;
  /*
    ⚠⚠ ZILE, NU CLIPE — „2026-10-01”, nu un ISO cu ora. Formularul trimitea
    pana azi `starts_at`/`ends_at` de-a dreptul, si serverul le scria asa cum
    veneau: browserul hotara ce inseamna „1 octombrie”, adica miezul noptii
    din fusul LUI. Ziua se preface in clipa romaneasca pe server, intr-un
    singur loc (`perioadaOfertei`), exact ca la coduri.
  */
  incepe_in?: string | null;
  se_incheie_in?: string | null;
}

// A fully-parsed offer, ready for the dashboard UI.
export interface OfferRow {
  id: string;
  type: OfferType;
  name: string;
  is_active: boolean;
  priority: number;
  trigger: OfferTrigger;
  config: OfferConfig;
  display: OfferDisplay;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  conversions: number;
  revenue_added: number;
  created_at: string;
  updated_at: string;
}

// Sanitize form input into clean, storable values — raw client jsonb is NEVER stored.
function sanitizeWrite(data: OfferFormData): {
  name: string; is_active: boolean; priority: number;
  trigger: OfferTrigger; config: OfferConfig; display: OfferDisplay;
} {
  return {
    name: data.name.trim(),
    is_active: data.is_active !== false,
    priority: Number.isFinite(Number(data.priority)) ? Math.trunc(Number(data.priority)) : 0,
    trigger: parseOfferTrigger(data.trigger),
    config: parseOfferConfig(data.config),
    display: parseOfferDisplay(data.display, data.type),
  };
}

// Faza 1: an offer must offer at least one product (or auto-pick by category for cross_sell).
function validateOffer(data: OfferFormData): string | null {
  if (!isOfferType(data.type)) return "Tip de oferta invalid.";
  if (!data.name.trim()) return "Oferta are nevoie de un nume.";
  if (PHASE1_OFFER_TYPES.includes(data.type)) {
    const cfg = parseOfferConfig(data.config);
    const hasProducts = cfg.productIds.length > 0;
    const autoCat = data.type === "cross_sell" && cfg.autoByCategory;
    if (!hasProducts && !autoCat) return "Alege cel putin un produs pentru aceasta oferta.";
  }
  /*
    ⚠ Oferta de cantitate nu OFERA produse, ci ieftineste ce e deja in cos.
    Deci nu i se cere lista de produse oferite, ci macar un prag - altfel ar fi
    o oferta care nu face nimic, dar arata aprinsa in lista.
  */
  if (data.type === "volume") {
    const cfg = parseOfferConfig(data.config);
    if (!cfg.praguri || cfg.praguri.length === 0) {
      return "Adauga cel putin un prag: de la cate bucati si cat la suta reducere.";
    }
    const tr = parseOfferTrigger(data.trigger);
    if (tr.scope === "products" && tr.productIds.length === 0) return "Alege produsele pentru care se aplica.";
    if (tr.scope === "categories" && tr.categories.length === 0) return "Alege categoriile pentru care se aplica.";
  }
  return null;
}

function toOfferRow(o: {
  id: string; type: string; name: string; is_active: boolean; priority: number;
  trigger: unknown; config: unknown; display: unknown;
  starts_at: string | null; ends_at: string | null;
  impressions: number; conversions: number; revenue_added: number;
  created_at: string; updated_at: string;
}): OfferRow {
  const type = (isOfferType(o.type) ? o.type : "cross_sell") as OfferType;
  return {
    id: o.id,
    type,
    name: o.name,
    is_active: o.is_active,
    priority: o.priority,
    trigger: parseOfferTrigger(o.trigger),
    config: parseOfferConfig(o.config),
    display: parseOfferDisplay(o.display, type),
    starts_at: o.starts_at,
    ends_at: o.ends_at,
    impressions: Number(o.impressions) || 0,
    conversions: Number(o.conversions) || 0,
    revenue_added: Number(o.revenue_added) || 0,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

/*
  ⚠⚠ `listOffers` A FOST STEARSA (22.09.2026), si nu ca sa fie codul mai scurt.

  Aducea TOATE ofertele magazinului, fara `limit` si fara `range`, si era
  chemata dintr-un singur loc: pagina de Oferte. De cand pagina cere
  `offers_page`, n-a mai ramas niciun apelant — verificat cu grep in tot `src/`.

  Fisierul e `"use server"`, deci FIECARE export al lui e un capat pe care
  browserul il poate chema. Lasata, ar fi fost o usa care aduce lista intreaga,
  fara plafon, pe langa cea paginata — adica exact drumul pe care il inchidem.
  (Paza de proprietar era la locul ei, deci nu era o gaura de date; era o cale
  nemarginita.) `getOffer`, de dedesubt, ramane: o cheama formularul de editare.
*/

export async function getOffer(offerId: string, businessId: string): Promise<OfferRow | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await ownsBusiness(supabase, businessId, user.id))) return null;
  const { data } = await supabase
    .from("offers").select("*").eq("id", offerId).eq("business_id", businessId).single();
  return data ? toOfferRow(data) : null;
}


/*
  ⚠ ORICE ATINGERE A UNEI OFERTE DE CANTITATE DUCE PRAGURILE PE PRODUSE, si nu
  doar salvarea. O oferta stinsa sau stearsa care ar lasa pragurile acolo ar
  insemna o reducere pe care comerciantul crede ca a oprit-o si care se
  incaseaza mai departe, in tacere.

  Caderea aplicarii NU rupe salvarea ofertei: randul e deja scris si corect, iar
  o eroare aruncata aici ar lasa comerciantul cu „n-a mers" in fata unei oferte
  care exista. Se scrie in jurnal si se spune in raspuns cate produse s-au
  atins, ca sa se vada cand cifra nu e cea asteptata.
*/
async function duPraguriLaProduse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  offerId: string,
  type: OfferType,
  data: { trigger: unknown; config: unknown; is_active?: boolean },
  userId: string,
  activa: boolean,
): Promise<number | null> {
  if (type !== "volume") return null;
  try {
    const rez = await aplicaPraguriCantitate(
      supabase,
      businessId,
      offerId,
      parseOfferTrigger(data.trigger),
      parseOfferConfig(data.config).praguri ?? [],
      activa,
    );
    return rez.scrise;
  } catch (e) {
    logError({
      action: "aplicaPraguriCantitate",
      message: e instanceof Error ? e.message : String(e),
      details: { offerId, businessId },
      userId,
    });
    return null;
  }
}

export async function createOffer(
  businessId: string, data: OfferFormData,
): Promise<{ success: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const invalid = validateOffer(data);
  if (invalid) return { error: invalid };

  /*
    ⚠ ZIUA SE PREFACE IN CLIPA AICI, pe server, si perioada intoarsa („de pe 10,
    pana pe 3”) se refuza. Lasata pe seama formularului, o oferta salvata de pe
    un ceas pus pe alt fus ar fi pornit sau s-ar fi stins cu o zi alaturi.
  */
  const perioada = perioadaOfertei(data.incepe_in, data.se_incheie_in);
  if ("error" in perioada) return { error: perioada.error };

  const w = sanitizeWrite(data);
  const { data: created, error } = await supabase
    .from("offers")
    .insert({
      business_id: businessId,
      type: data.type,
      name: w.name,
      is_active: w.is_active,
      priority: w.priority,
      trigger: w.trigger as never,
      config: w.config as never,
      display: w.display as never,
      starts_at: perioada.starts_at,
      ends_at: perioada.ends_at,
    })
    .select("id")
    .single();
  if (error) {
    logError({ action: "createOffer", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea ofertei. Incearca din nou." };
  }
  const idNou = (created as { id: string }).id;
  await duPraguriLaProduse(supabase, businessId, idNou, data.type, data, user.id, w.is_active);
  revalidatePath("/dashboard/offers");
  return { success: true, id: idNou };
}

export async function updateOffer(
  offerId: string, businessId: string, data: OfferFormData,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const invalid = validateOffer(data);
  if (invalid) return { error: invalid };

  /*
    ⚠ ZIUA SE PREFACE IN CLIPA AICI, pe server, si perioada intoarsa („de pe 10,
    pana pe 3”) se refuza. Lasata pe seama formularului, o oferta salvata de pe
    un ceas pus pe alt fus ar fi pornit sau s-ar fi stins cu o zi alaturi.
  */
  const perioada = perioadaOfertei(data.incepe_in, data.se_incheie_in);
  if ("error" in perioada) return { error: perioada.error };

  const w = sanitizeWrite(data);
  const { error } = await supabase
    .from("offers")
    .update({
      type: data.type,
      name: w.name,
      is_active: w.is_active,
      priority: w.priority,
      trigger: w.trigger as never,
      config: w.config as never,
      display: w.display as never,
      starts_at: perioada.starts_at,
      ends_at: perioada.ends_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .eq("business_id", businessId);
  if (error) {
    logError({ action: "updateOffer", message: error.message, details: { code: error.code, offerId, businessId }, userId: user.id });
    return { error: "Eroare la salvarea ofertei. Incearca din nou." };
  }
  await duPraguriLaProduse(supabase, businessId, offerId, data.type, data, user.id, w.is_active);
  revalidatePath("/dashboard/offers");
  revalidatePath(`/dashboard/offers/${offerId}`);
  return { success: true };
}

export async function toggleOffer(
  offerId: string, businessId: string, isActive: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const { error } = await supabase
    .from("offers")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", offerId).eq("business_id", businessId);
  if (error) {
    logError({ action: "toggleOffer", message: error.message, details: { code: error.code, offerId, businessId }, userId: user.id });
    return { error: "Eroare la actualizarea ofertei." };
  }
  /* La stingere se RETRAG pragurile; la reaprindere se pun la loc. */
  const { data: o } = await supabase.from("offers")
    .select("type, trigger, config").eq("id", offerId).eq("business_id", businessId).single();
  if (o) {
    const row = o as { type: string; trigger: unknown; config: unknown };
    if (isOfferType(row.type)) {
      await duPraguriLaProduse(supabase, businessId, offerId, row.type, row, user.id, isActive);
    }
  }
  revalidatePath("/dashboard/offers");
  return { success: true };
}

export async function deleteOffer(
  offerId: string, businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  /* ⚠ Se retrag INAINTE de stergere. Dupa ce randul dispare nu se mai stie ce
     tip a fost, iar pragurile ar fi ramas pe produse fara nimeni care sa le
     mai poata scoate. */
  const { data: inainte } = await supabase.from("offers")
    .select("type, trigger, config").eq("id", offerId).eq("business_id", businessId).single();
  if (inainte) {
    const row = inainte as { type: string; trigger: unknown; config: unknown };
    if (isOfferType(row.type)) {
      await duPraguriLaProduse(supabase, businessId, offerId, row.type, row, user.id, false);
    }
  }

  const { error } = await supabase
    .from("offers").delete().eq("id", offerId).eq("business_id", businessId);
  if (error) {
    logError({ action: "deleteOffer", message: error.message, details: { code: error.code, offerId, businessId }, userId: user.id });
    return { error: "Eroare la stergerea ofertei." };
  }
  revalidatePath("/dashboard/offers");
  return { success: true };
}

/**
 * AFISARILE ofertelor de pe pagina de produs, numarate din BROWSER.
 *
 * De ce nu la randare, in `resolveProductOffers`: pagina de produs se randeaza
 * la fiecare cerere (`headers()` o face dinamica), iar `next/link` o cere si la
 * simpla trecere cu mausul peste un card din catalog. Un contor crescut acolo ar
 * fi numarat preincarcarile si crawlerele ca pe niste clienti, si ar fi pus o
 * scriere in baza pe drumul critic al FIECAREI incarcari de pagina, la toate
 * magazinele — inclusiv la cele fara nicio oferta. Din browser se numara doar ce
 * a ajuns intr-adevar pe un ecran, si numai magazinele care chiar au oferte
 * platesc ceva (azi: 2 magazine publicate, 9 oferte).
 *
 * Cale publica si anonima, deci: limita pe IP, plafon pe cate id-uri se pot
 * revendica dintr-o data (`idsDeAfisare`) si verificarea ca ofertele apartin
 * magazinului — altfel oricine putea umfla contorul altui comerciant. Nu
 * intoarce nimic si nu arunca niciodata: apelantul e o pagina de magazin.
 */
export async function recordOfferImpressions(businessId: string, offerIds: string[]): Promise<void> {
  try {
    if (!businessId) return;
    const ids = idsDeAfisare(offerIds);
    if (ids.length === 0) return;

    // Un magazin adevarat trimite o cerere pe incarcare de pagina. Pragul lasa
    // loc navigarii normale (produs dupa produs) si taie doar bucatile.
    const ip = clientIpFromHeaders(await headers());
    if (!rateLimit(`recordOfferImpressions:${ip}`, 60, 60_000)) return;

    const admin = createAdminClient();
    // Ofertele revendicate trebuie sa fie CHIAR ale magazinului: id-ul unei
    // oferte ajunge in browser (`ResolvedOffer.id`), deci fara filtrul asta
    // contorul unui magazin s-ar putea umfla de pe pagina altuia.
    const { data } = await admin
      .from("offers").select("id").eq("business_id", businessId).in("id", ids);
    const aleMagazinului = (data ?? []).map((o) => o.id);
    if (aleMagazinului.length === 0) return;

    await scrieStatisticiOferte(admin, aleMagazinului.map((id) => ({ offerId: id, impressions: 1 })));
  } catch {
    // statistica e best-effort
  }
}

/**
 * Storefront: order-bump offers applicable to the current cart, for the checkout
 * modals. Public (anonymous customers) — reads via the admin client since offers are
 * owner-only. Returns only display data (products + special price), all public info.
 */
export async function getCheckoutBumps(
  businessId: string,
  cartProductIds: string[],
  /**
   * Coșul, ca să se poată judeca PORȚILE ofertei („se arată doar dacă trece de
   * 200 de lei”). Lipsa lui înseamnă „nu știu”, iar atunci o ofertă cu porți pe
   * lei sau pe bucăți NU se arată.
   *
   * ⚠⚠ VINE DIN BROWSER ȘI NU SE CREDE PE CUVÂNT. Se folosește NUMAI ca să se
   * hotărască ce se ARATĂ, iar a arăta nu costă niciun ban: prețul se ia mereu
   * din bază, iar la plasarea comenzii aceeași poartă se pune din nou, pe
   * liniile adevărate (`refuzaOferta`). Un client care umflă suma vede bump-ul
   * și i se refuză comanda.
   */
  liniiSpuseDeBrowser?: { productId: string; quantity: number; unitPrice: number }[],
): Promise<ResolvedOffer[]> {
  if (!businessId || !Array.isArray(cartProductIds)) return [];
  const ids = cartProductIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  /*
   * Afisarile NU se numara aici.
   *
   * Actiunea se re-cheama la fiecare schimbare a cosului si la fiecare
   * redeschidere a formularului — masurat: doua cereri la o singura deschidere
   * cand cosul s-a schimbat intre timp, plus cate una la fiecare linie adaugata
   * sau stearsa. Numarate aici, cele trei suprafete n-ar mai fi comparabile intre
   * ele in acelasi contor: pagina de produs numara o singura data pe incarcare,
   * prin baliza din browser, iar rata de acceptare a bump-urilor ar fi iesit de
   * cateva ori mai mica decat cea adevarata. Balizele browserului le numara pe
   * toate trei la fel.
   */
  /*
    ⚠ Se curăță aici, nu mai departe: `cosulDinLinii` primește deja numere, iar
    un „-5” trimis de mână ar fi scăzut din numărul de bucăți și ar fi deschis o
    poartă închisă. Plafonul de 500 de linii e împotriva unui tablou umflat, nu
    o regulă de coș: cel mai lung coș măsurat pe producție are sub zece linii.
  */
  const cos = Array.isArray(liniiSpuseDeBrowser)
    ? cosulDinLinii(
        liniiSpuseDeBrowser
          .filter((l) => l && typeof l.productId === "string" && l.productId.length > 0)
          .slice(0, 500)
          .map((l) => ({
            productId: l.productId,
            quantity: Math.max(0, Math.min(10_000, Math.floor(Number(l.quantity) || 0))),
            unitPrice: Math.max(0, Math.min(1_000_000, Number(l.unitPrice) || 0)),
          })),
      )
    : undefined;
  return resolveCartOffers(admin, businessId, ids, "checkout", cos);
}

/**
 * Storefront: cross-sell recommendations for the cart drawer ("S-ar putea sa-ti placa").
 * Public — reads via the admin client (offers are owner-only). Pure recommendation,
 * no discount, so nothing here touches the order path.
 */
export async function getCartCrossSell(businessId: string, cartProductIds: string[]): Promise<ResolvedOffer[]> {
  if (!businessId || !Array.isArray(cartProductIds)) return [];
  const ids = cartProductIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  // Ca mai sus: afisarea se numara din browser, o singura data, prin aceeasi
  // baliza ca pe pagina de produs. In plus, aici oferta poate desena ecran gol —
  // `CartRecommendations` arunca produsele epuizate si nu mai randeaza nimic —
  // deci numarata pe server ar fi contorizat o afisare care nu s-a vazut.
  return resolveCartOffers(admin, businessId, ids, "cart");
}


/**
 * Numele produselor si categoriilor unei oferte, pentru fisa din sertar.
 *
 * ⚠ PANA AZI SINGURUL DRUM CATRE ELE ERA FORMULARUL DE EDITARE. Lista scria
 * „Apare la 3 produse" si atat, deci ca sa afli CARE trei trebuia sa deschizi
 * editarea — adica sa intri intr-un ecran de scris ca sa citesti ceva.
 *
 * ⚠ Se citeste prin clientul CELUI LOGAT, nu prin cel de admin, si se verifica
 * intai ca magazinul e al lui: RLS ramane granita, ca peste tot in panou.
 *
 * ⚠ Categoriile stau pe NUME in `trigger.categories` (asa e si la coduri:
 * `products.category` e un nume, si nu exista tabela de legatura), deci ele nu
 * se mai cauta nicaieri — se intorc ca atare.
 */
export async function getOfferTargets(
  businessId: string, offerId: string,
): Promise<
  | { produseDeclansare: string[]; produseOferite: string[]; categorii: string[] }
  | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const { data: o } = await supabase
    .from("offers").select("trigger, config").eq("id", offerId).eq("business_id", businessId).single();
  if (!o) return { error: "Oferta negasita" };

  const trigger = parseOfferTrigger(o.trigger);
  const config = parseOfferConfig(o.config);
  const toate = [...new Set([...trigger.productIds, ...config.productIds])];
  if (toate.length === 0) {
    return { produseDeclansare: [], produseOferite: [], categorii: trigger.categories };
  }

  /*
    ⚠ Plafon de 200: o oferta cu lista de produse are azi cel mult cateva zeci,
    dar `.in()` intra in ADRESA cererii, iar o lista uriasa ar fi taiata de
    server fara nicio eroare. Mai bine o taiere stiuta aici decat una tacuta
    acolo.
  */
  const { data: produse } = await supabase
    .from("products").select("id, name").eq("business_id", businessId).in("id", toate.slice(0, 200));
  const nume = new Map((produse ?? []).map((p) => [p.id, p.name]));
  /* ⚠ Un produs sters lasa id-ul in oferta. Se spune, nu se sare peste. */
  const numele = (ids: string[]) => ids.map((id) => nume.get(id) ?? "(produs sters)");

  return {
    produseDeclansare: numele(trigger.productIds),
    produseOferite: numele(config.productIds),
    categorii: trigger.categories,
  };
}
