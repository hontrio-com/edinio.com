"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { createClient } from "@/lib/supabase/server";
import { normalizeazaCantitate } from "@/lib/orders/quantity";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cheileContactului, mesajContactSuprimat, motivulSuprimarii, type RandSuprimare,
} from "@/lib/abandoned/suprimare";
import {
  confirmaTrimiterea, idulMesajului, insemneazaDeschiderea, mesajRevendicare, revendicaTrimiterea,
} from "@/lib/abandoned/o-singura-trimitere";
import { logError } from "@/lib/error-logger";
import { trimiteSiLasaUrma } from "@/lib/smso-urma";
import type { SmsoConfig } from "@/lib/smso";
import { sendNoticeAbandonedSms } from "@/lib/notice-notify";
import type { NoticeConfig } from "@/lib/notice";
import { sendAbandonedCartRecovery } from "@/lib/email";
import { getStoreEmailSender } from "@/lib/email/sender";
import { storeBaseUrl } from "@/lib/seo";
import { ZILE_ATRIBUIRE } from "@/lib/abandoned/atribuire";
import {
  fereastra, marginile, type CatePePagina, type NumePerioada,
} from "@/lib/abandoned/perioade";
import { isPremiumPlan } from "@/lib/plans";
import { ABANDON_MINUTES, COS_PREA_VECHI, cosulMaiPoateFiRecuperat, cuPreturileDinCatalog, defaultRecoverySms, buildRecoverUrl, readAutomationConfig, interpolateRecoveryMessage, standardRecoveryTemplate, cosRecuperabil, type AbandonedCartItem, type AbandonedCartsData, type MesajCos, type AbandonedAutomationConfig } from "@/lib/abandoned-cart";
import type { Database } from "@/types/database.types";
import { pragulComenzilor } from "@/app/api/cron/curata-fisiere/reguli";

type CartRow = Database["public"]["Tables"]["abandoned_carts"]["Row"];

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/*
 * Plafonul pe magazin nu mai e un refuz complet tacut: cand se atinge,
 * comerciantul chiar pierde cosuri reale (si emailurile de recuperare care ar fi
 * plecat din ele), deci trebuie sa ramana o urma undeva.
 *
 * Cel mult o alerta pe ora pe magazin — contorul durabil folosit pe dos, ca
 * `error_logs` sa nu se umple exact in timpul abuzului pe care il semnaleaza.
 */
async function alertaPlafonCosuri(businessId: string, cosuriRecente: number): Promise<void> {
  if (!(await consumaLimita(`alerta:cart:${businessId}`, 1, 3600)).permis) return;
  await logError({
    action: "trackAbandonedCart.plafonMagazin",
    message: "Plafonul de cosuri noi pe magazin a fost atins; sesiunile noi nu se mai inregistreaza",
    details: { businessId, cosuriRecente },
    businessId,
    severity: "warning",
  });
}

// ── Capture (storefront, anonymous customers — admin client) ───────────────────
// Debounced, fire-and-forget from the checkout forms. Must never throw.
export async function trackAbandonedCart(input: {
  businessId: string;
  sessionId: string;
  source?: "cart" | "buy_now";
  name?: string;
  email?: string;
  phone?: string;
  items: AbandonedCartItem[];
}): Promise<void> {
  try {
    if (!input.businessId || !input.sessionId) return;

    const items = (Array.isArray(input.items) ? input.items : []).filter((i) => i && i.product_id);
    if (items.length === 0) return;

    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    // Need a usable recovery channel; otherwise there's nothing to act on.
    const hasContact = (!!email && email.includes("@")) || (!!phone && phone.replace(/\D/g, "").length >= 6);
    if (!hasContact) return;

    // LIMITARE. Actiunea asta e un endpoint PUBLIC (export dintr-un modul
    // "use server", importat de componente client, deci ID-ul ei e in bundle-ul
    // public al fiecarui magazin) care scrie cu service role si al carei rezultat
    // este alimentat mai tarziu cronului de recuperare: emailuri si SMS-uri
    // trimise pe banii comerciantului, catre adrese si numere alese de apelant.
    // Fara plafon, oricine putea folosi orice magazin ca sursa de spam.
    const ip = clientIpFromHeaders(await headers());
    if (!rateLimit(`trackCart:${ip}`, 10, 60_000)) return;
    const lim = await consumaLimita(`cart:ip:${ip}`, 30, 3600);
    if (!lim.permis) return;

    const admin = createAdminClient();

    // Respect the per-store opt-in flag. Citit primul: pe magazinele fara optiunea
    // activa (implicit toate) nu are rost nici numaratoarea de mai jos.
    const { data: settings } = await admin
      .from("store_settings").select("abandoned_cart_enabled").eq("business_id", input.businessId).single();
    if (!settings?.abandoned_cart_enabled) return;

    // Don't resurrect a cart that already converted.
    const { data: existing } = await admin
      .from("abandoned_carts").select("status")
      .eq("business_id", input.businessId).eq("session_id", input.sessionId).maybeSingle();
    if (existing?.status === "converted") return;

    /*
     * Plafon si PER MAGAZIN, ca o retea de IP-uri sa nu poata umple cosurile unui
     * magazin anume (acelasi tipar ca in submitPageForm) — dar numai pe randurile
     * NOI, si abia dupa ce stim ca sesiunea chiar e noua.
     *
     * Se aplica pana acum pe TOATE scrierile si respingea tacut orice cos peste
     * 200 pe ora. Contorul e comun tuturor cumparatorilor, iar limita pe IP e de
     * 30/ora, deci sapte IP-uri il umpleau; din acel moment cosurile
     * cumparatorilor REALI nu se mai inregistrau deloc. Fara rand, cronul de
     * recuperare nu vede nimic si emailurile de recuperare nu mai pleaca: venit
     * pierdut pentru comerciant, invizibil, provocat de un tert.
     *
     * Cine revine pe o sesiune care ARE deja rand trece mai departe: acolo
     * upsertul nu creeaza nimic, deci nu exista ce inunda.
     */
    if (!existing) {
      const deLa = new Date(Date.now() - 3_600_000).toISOString();
      const { count: cosuriRecente } = await admin
        .from("abandoned_carts")
        .select("id", { count: "exact", head: true })
        .eq("business_id", input.businessId)
        .gte("created_at", deLa);
      if ((cosuriRecente ?? 0) >= 200) {
        await alertaPlafonCosuri(input.businessId, cosuriRecente ?? 0);
        return;
      }
    }

    // Cantitatea se normalizeaza si aici, desi cosul o normalizeaza deja: actiunea
    // e endpoint public si scrie cu client de admin. `item_count` e coloana
    // INTEGER, deci o cantitate fractionara ar face upsertul sa cada, iar
    // `catch`-ul de mai jos e gol — cosul s-ar pierde in tacere.
    const cantitati = items.map((i) => normalizeazaCantitate(i.quantity));
    /*
     * ═══ ⚠ PRETURILE SE IAU DIN CATALOG, NU DIN CERERE ═══
     *
     * Actiunea asta e PUBLICA si anonima. Pretul trimis se aduna mai departe in „Valoare cosuri
     * abandonate", in media pe cos, in venitul potential si in „Cele mai abandonate produse": cine
     * o cheama de mana isi declara ce suma pofteste si murdareste cifrele dupa care comerciantul
     * isi masoara magazinul. Nu se poate cumpara nimic pe pretul asta, dar nici nu trebuie sa fie
     * crezut.
     *
     * ⚠ SI PENTRU UN APELANT CINSTIT ERA TOT GRESIT: pana pe 07.09.2026 cosul salva pretul de BAZA
     * al liniilor personalizate. Un fototapet de 910 lei intra in baza cu 89.
     *
     * ⚠ O SINGURA INTEROGARE in plus, cu `in (...)`, pe o actiune care oricum face deja trei.
     * Pretul intra si in `items`, nu doar in `subtotal`: „Top produse abandonate" citeste din brut.
     */
    const cuPreturi = await cuPreturileDinCatalog(admin, input.businessId, items);
    /*
     * ⚠ FARA PRETURI VERIFICATE NU SE SCRIE NIMIC.
     *
     * Se cadea inapoi pe numerele trimise de browser, si atunci o pana de baza deschidea exact
     * poarta pe care repretuirea o inchide: cine cheama actiunea asta publica cu `price: 9.999.999`
     * isi vedea numarul in „Valoare cosuri abandonate", in media pe cos si in venitul potential.
     *
     * ⚠ SE PIERDE CAPTURA, SI E ALEGEREA BUNA. Randul e o unealta de marketing, nu o comanda:
     * pierdut, nu se pierde nicio vanzare, si captura se reia la urmatoarea tastare a clientului,
     * fiindca e pe cronometru. Persistat cu cifre neverificate, ar murdari raportul dupa care
     * comerciantul isi masoara magazinul, si nimeni n-ar sti ca sunt inventate.
     */
    if (!cuPreturi) return;
    const subtotal = round2(cuPreturi.reduce((s, i, idx) => s + (Number(i.price) || 0) * cantitati[idx], 0));
    const itemCount = cantitati.reduce((s, q) => s + q, 0);
    const now = new Date().toISOString();

    await admin.from("abandoned_carts").upsert(
      {
        business_id: input.businessId,
        session_id: input.sessionId,
        source: input.source ?? "cart",
        customer_name: input.name?.trim() || null,
        email,
        phone,
        // Si jsonb-ul, nu doar coloanele: altfel randul se contrazice singur, iar
        // „Top produse abandonate" si linkul de recuperare citesc tot din brut.
        items: cuPreturi.map((i, idx) => ({ ...i, quantity: cantitati[idx] })) as never,
        item_count: itemCount,
        subtotal,
        status: "open",
        last_activity_at: now,
        updated_at: now,
      },
      { onConflict: "business_id,session_id" },
    );
  } catch {
    // Capture must never break the checkout flow.
  }
}

// ── Restore cart (storefront, anonymous) ──────────────────────────────────────
// Returns the cart's items refreshed against current products, for the "restore
// cart" recovery link. No personal data exposed; cartId is an unguessable uuid.
export async function getRecoverableCart(
  cartId: string,
  /* Cheia mesajului din care vine clickul, cand linkul o poarta. */
  mesajId?: string,
): Promise<AbandonedCartItem[]> {
  try {
    if (!cartId) return [];
    const admin = createAdminClient();
    const { data: cart } = await admin
      .from("abandoned_carts").select("business_id, items, status, last_activity_at").eq("id", cartId).single();
    if (!cart || cart.status === "converted") return [];

    /*
     * ⚠ AICI SE NASTE SINGURA CIFRA CARE SE POATE DOVEDI. Pana acum linkul nu
     * lasa nicio urma ca a fost deschis, deci „Recuperate" numara cosuri
     * convertite care primisera candva un mesaj - adica si pe cele care s-ar
     * fi intors oricum.
     *
     * ⚠ NU se asteapta si nu se lasa sa strice recuperarea: daca insemnarea
     * pica, omul tot trebuie sa-si primeasca cosul inapoi. O cifra lipsa e
     * mai putin rau decat un cos nerecuperat.
     */
    void insemneazaDeschiderea(admin, cartId, mesajId).catch(() => {});

    /*
     * ═══ ⚠ ACELASI TERMEN CA RETENTIA FISIERELOR ═══
     *
     * Cronul de curatenie apara fisierele cosurilor deschise doar cat tine fereastra de
     * `LUNI_PE_COMANDA` (vezi `curata-fisiere/reguli.ts`). Dupa ea le sterge — pe drept, altfel
     * Edinio ar deveni un depozit permanent de fotografii ale cumparatorilor.
     *
     * Dar linkul de recuperare nu se uita la nicio varsta. Deci un cos de acum sapte luni se
     * restaura cu cheile unor fisiere care nu mai exista: omul ajungea pe un cos in care poza lui
     * lipseste, iar comanda ar fi fost refuzata la trimitere fara sa inteleaga de ce.
     *
     * ⚠ SE REFUZA INTREG, nu se refac liniile fara fisiere. `restoreCart` SUPRASCRIE cosul
     * clientului: un cos „recuperat" pe jumatate i-ar fi sters si ce avea in el intre timp.
     *
     * ⚠ ACELASI PRAG, DINTR-O SINGURA SURSA. Doua numere care se apropie ar fi lasat o fereastra
     * in care cosul e recuperabil si fisierele lui nu mai sunt — exact defectul de acum.
     */
    if (!cosulMaiPoateFiRecuperat(cart.last_activity_at, pragulComenzilor(new Date()))) return [];

    const stored = (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[];
    /*
     * Repretuirea si regula „ce se poate recupera" stau acum in `abandoned-cart.ts`,
     * fiindca linkul asta si cele doua emailuri de recuperare trebuie sa spuna
     * exact acelasi lucru. Acolo sta si motivul pentru care produsele cu variante
     * se sar: linia refacuta ar intra in cos fara marime, iar `restoreCart`
     * SUPRASCRIE cosul, deci clientul ar ramane cu o comanda pe care n-o poate
     * trimite si fara buton de stergere pe linie.
     */
    const { items } = await cosRecuperabil(admin, cart.business_id, stored);
    return items;
  } catch {
    return [];
  }
}

// ── Opt-in toggle (owner) ──────────────────────────────────────────────────────
export async function setAbandonedCartEnabled(
  businessId: string,
  enabled: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ abandoned_cart_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, abandoned_cart_enabled: enabled }));
  }
  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Dashboard data (owner) ─────────────────────────────────────────────────────
/**
 * Aceleasi date, cerute din ecran cand omul schimba perioada sau pagina.
 *
 * ⚠ E un invelis peste `getAbandonedCartsData`, NU o a doua socoteala: doua
 * cai care raspund la aceeasi intrebare se departeaza una de alta, si atunci
 * pagina 1 si pagina 2 ar putea spune lucruri diferite despre acelasi magazin.
 */
export async function cereCosuriAbandonate(
  businessId: string,
  cerere: { perioada?: NumePerioada; pagina?: number; pePagina?: CatePePagina },
): Promise<AbandonedCartsData | { error: string }> {
  return getAbandonedCartsData(businessId, cerere);
}

/** Randul intors de `cosuri_abandonate_sumar`. */
type SumarCosuri = Database["public"]["Functions"]["cosuri_abandonate_sumar"]["Returns"][number];

export async function getAbandonedCartsData(
  businessId: string,
  /*
   * ⚠ O SINGURA PERIOADA PENTRU TOATA PAGINA. Pana pe 21.09.2026 fiecare cifra
   * avea rastimpul ei: cosurile pe 90 de zile, rata si recuperarile pe luna
   * curenta. Trei cifre una langa alta despre trei ferestre diferite.
   */
  cerere: { perioada?: NumePerioada; pagina?: number; pePagina?: CatePePagina } = {},
): Promise<AbandonedCartsData | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, primary_color")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: settings } = await supabase
    .from("store_settings").select("abandoned_cart_enabled, smso_config, abandoned_cart_automation, notice_config").eq("business_id", businessId).single();

  const [{ data: profile }, { data: discountRows }] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
    supabase.from("discounts").select("code, type, value, expires_at").eq("business_id", businessId).eq("is_active", true).order("code"),
  ]);
  const isPremium = isPremiumPlan(profile?.plan);
  const nowMs = Date.now();
  const discounts = (discountRows ?? [])
    .filter((d) => !d.expires_at || new Date(d.expires_at).getTime() > nowMs)
    .map((d) => ({ code: d.code, type: d.type, value: Number(d.value) || 0 }));

  const enabled = settings?.abandoned_cart_enabled ?? false;
  const smso = settings?.smso_config as SmsoConfig | null;
  const smsoEnabled = !!(smso?.enabled && smso?.api_key && smso?.sender_id);
  const notice = settings?.notice_config as NoticeConfig | null;
  const smsEnabled = smsoEnabled || !!(notice?.enabled && notice.api_token && notice.abandoned?.enabled);

  const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
  const primaryColor = biz.primary_color ?? "#07c527";

  const perioada = fereastra(cerere.perioada ?? "30z");
  const pePagina: CatePePagina = cerere.pePagina ?? 25;
  const pagina = Math.max(1, Math.floor(cerere.pagina ?? 1));
  const { de, la } = marginile(pagina, pePagina);

  /*
    ⚠ CIFRELE SE SOCOTESC IN BAZA, NU DIN RANDURILE INCARCATE. Pana acum se
    citeau cel mult 1.000 de randuri (pragul PostgREST) si se aduna in
    TypeScript. Azi cel mai mare magazin are 393 de cosuri in tot istoricul,
    deci nimeni nu loveste pragul - dar cand il va lovi, cifrele NU vor da
    eroare: vor scadea in tacere si vor arata ca merge mai bine.
  */
  const pragAbandon = new Date(Date.now() - ABANDON_MINUTES * 60_000).toISOString();
  const ferestruica = {
    p_business: businessId,
    p_de_la: perioada.deLa.toISOString(),
    p_pana: perioada.panaLa.toISOString(),
    p_minute: ABANDON_MINUTES,
    p_zile: ZILE_ATRIBUIRE,
  };
  const [sumarRes, listaRes, produseRes, graficRes, palnieRes] = await Promise.all([
    supabase.rpc("cosuri_abandonate_sumar", ferestruica),
    /*
      ⚠ PAGINA CERE SI NUMARUL ADEVARAT (`count: "exact"`). Pana acum antetul
      scria „(100)" fiindca atatea randuri trimitea serverul, langa un card
      care spunea 430: aceeasi pagina se contrazicea singura.
    */
    supabase
      .from("abandoned_carts")
      .select(
        "id, customer_name, email, phone, items, item_count, subtotal, source, status,"
        + " created_at, last_activity_at, converted_at, ignorat_la, recovery_email_sent_at,"
        + " recovery_sms_sent_at, recovery_count",
        { count: "exact" },
      )
      .eq("business_id", businessId)
      .eq("status", "open")
      .lt("last_activity_at", pragAbandon)
      .gte("created_at", perioada.deLa.toISOString())
      .lt("created_at", perioada.panaLa.toISOString())
      .order("last_activity_at", { ascending: false })
      .range(de, la),
    /*
      ⚠ PRODUSELE SE STRANG IN BAZA, nu din `items` citite in memorie. Adunate
      aici, ar fi depins de cate randuri incap intr-o citire - si tocmai
      magazinul care are nevoie de lista asta e cel care depaseste pragul.
    */
    supabase.rpc("cosuri_abandonate_produse", { ...ferestruica, p_limita: 8 }),
    supabase.rpc("cosuri_abandonate_grafic", ferestruica),
    supabase.rpc("cosuri_abandonate_palnie", ferestruica),
  ]);

  const sumar = (sumarRes.data ?? [])[0] as SumarCosuri | undefined;
  const randuri = (listaRes.data ?? []) as unknown as CartRow[];
  const totalCosuri = listaRes.count ?? randuri.length;

  /*
    ⚠ MESAJELE SE CER DOAR PENTRU PAGINA ARATATA, nu pentru toata fereastra:
    cu 25 sau 50 de chei, interogarea e marginita oricat ar creste magazinul.
    Ele dau starea randului („a deschis linkul") si cronologia din sertar.
  */
  const mesajePeCos = new Map<string, MesajCos[]>();
  if (randuri.length > 0) {
    const { data: trimise } = await supabase
      .from("recovery_sends").select("cart_id, canal, sursa, pas, trimis_la, deschis_la")
      .in("cart_id", randuri.map((r) => r.id))
      .order("trimis_la", { ascending: true });
    for (const m of trimise ?? []) {
      const lista = mesajePeCos.get(m.cart_id) ?? [];
      lista.push({
        canal: m.canal === "sms" ? "sms" : "email",
        sursa: m.sursa === "automatizare" ? "automatizare" : "manual",
        pas: m.pas, trimis_la: m.trimis_la, deschis_la: m.deschis_la,
      });
      mesajePeCos.set(m.cart_id, lista);
    }
  }

  const nr = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

  /*
    Produsele vin gata strânse din baza. Fiecare stie si in CATE cosuri a
    intrat cu totul, nu doar in cate s-a abandonat: fara numitor, lista ar
    arata produsele populare, nu pe cele care pierd vanzari.
  */
  const abandonedProducts = (produseRes.data ?? []).map((p) => ({
    name: p.nume || "Produs",
    quantity: Number(p.bucati_abandonate) || 0,
    value: nr(p.valoare_abandonata),
    carts: p.cosuri_abandonate,
    image_url: p.poza,
    cosuriTotal: p.cosuri,
    cosuriAbandonate: p.cosuri_abandonate,
    recuperate: p.recuperate,
  }));

  const palnieRand = (palnieRes.data ?? [])[0];
  const palnie = {
    salvate: palnieRand?.salvate ?? 0,
    neterminate: palnieRand?.neterminate ?? 0,
    contactate: palnieRand?.contactate ?? 0,
    deschise: palnieRand?.deschise ?? 0,
    recuperate: palnieRand?.recuperate ?? 0,
  };

  const grafic = (graficRes.data ?? []).map((z) => ({
    ziua: z.ziua,
    abandonate: z.abandonate,
    valoareAbandonata: nr(z.valoare_abandonata),
    recuperate: z.recuperate,
    valoareRecuperata: nr(z.valoare_recuperata),
  }));

  return {
    enabled,
    smsoEnabled,
    smsEnabled,
    storeUrl,
    storeName: biz.store_name ?? biz.business_name,
    primaryColor,
    kpis: {
      abandonedCount: sumar?.abandonate ?? 0,
      abandonedValue: nr(sumar?.valoare_abandonata),
      avgCartValue: nr(sumar?.valoare_medie),
      abandonRate: sumar?.rata_abandon ?? 0,
      /* ⚠ „Recuperate" inseamna acum ceva ce SE POATE DOVEDI: linkul deschis, apoi comanda. */
      recoveredCount: sumar?.atribuite ?? 0,
      recoveredValue: nr(sumar?.valoare_atribuita),
      asistateCount: sumar?.asistate ?? 0,
      asistateValue: nr(sumar?.valoare_asistata),
      organiceCount: sumar?.organice ?? 0,
      organiceValue: nr(sumar?.valoare_organica),
    },
    perioada: perioada.nume,
    pagina,
    pePagina,
    totalCosuri,
    grafic,
    palnie,
    potentialRevenueThisMonth: nr(sumar?.valoare_abandonata),
    abandonedProducts,
    carts: randuri.map((r) => ({
      id: r.id,
      customer_name: r.customer_name,
      email: r.email,
      phone: r.phone,
      items: (Array.isArray(r.items) ? r.items : []) as unknown as AbandonedCartItem[],
      item_count: r.item_count,
      subtotal: Number(r.subtotal || 0),
      source: r.source,
      last_activity_at: r.last_activity_at,
      created_at: r.created_at,
      ignorat_la: r.ignorat_la,
      /* ⚠ Cea mai RECENTA deschidere: starea randului spune „a deschis", nu „cand". */
      deschis_la: (mesajePeCos.get(r.id) ?? [])
        .map((m) => m.deschis_la).filter((d): d is string => !!d)
        .sort().at(-1) ?? null,
      mesaje: mesajePeCos.get(r.id) ?? [],
      recovery_email_sent_at: r.recovery_email_sent_at,
      recovery_sms_sent_at: r.recovery_sms_sent_at,
      recovery_count: r.recovery_count,
    })),
    automation: readAutomationConfig(settings?.abandoned_cart_automation),
    isPremium,
    discounts,
  };
}

// ── Save automation config (owner) ─────────────────────────────────────────────
/**
 * Trimite un pas al automatizarii CATRE COMERCIANT, ca sa vada ce pleaca.
 *
 * ⚠⚠ DESTINATARUL NU VINE DIN CERERE. Actiunea asta trimite emailuri si
 * SMS-uri pe banii magazinului; daca adresa ar veni din parametri, oricine cu
 * un cont ar avea o portita de trimis mesaje oriunde. Se ia din contul
 * proprietarului, si numai de acolo.
 *
 * ⚠ NU ATINGE NICIUN COS SI NICIUN CONTOR: nu scrie in `recovery_sends`, nu
 * creste `recovery_count` si nu se numara nicaieri. Un mesaj de proba care ar
 * intra in cifre ar face ca „7 contactate" sa insemne „6 clienti si o data eu".
 */
export async function trimiteProbaAutomatizare(
  businessId: string,
  pas: { channel: "email" | "sms"; message?: string; discount_code?: string },
): Promise<{ success: true; catre: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, primary_color, phone")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Neautorizat" };

  const storeName = biz.store_name ?? biz.business_name;
  const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
  /*
   * ⚠ Linkul de proba duce la magazin, FARA `?recover=`: cu el, ar incerca sa
   * refaca un cos care nu exista si omul ar ajunge pe o vitrina goala,
   * crezand ca asa patesc si clientii lui.
   */
  const text = pas.message?.trim()
    ? interpolateRecoveryMessage(pas.message, { name: "Ion", store: storeName })
    : standardRecoveryTemplate(pas.channel);

  if (pas.channel === "email") {
    const catre = user.email;
    if (!catre) return { error: "Contul tău nu are o adresă de email." };
    try {
      const emailSender = await getStoreEmailSender(supabase, businessId);
      await sendAbandonedCartRecovery(catre, {
        storeName,
        recoverUrl: storeUrl,
        customerName: "Ion",
        /* Doua linii inventate, ca sa se vada asezarea. Nu ating catalogul. */
        items: [
          { name: "Produs de probă", price: 149, quantity: 1, image_url: null },
          { name: "Al doilea produs", price: 79.9, quantity: 2, image_url: null },
        ],
        total: 308.8,
        preturiSigure: true,
        color: biz.primary_color ?? "#07c527",
        message: pas.message?.trim() ? text : undefined,
        discountCode: pas.discount_code?.trim() || undefined,
      }, emailSender);
    } catch {
      return { error: "Emailul de probă nu a putut fi trimis." };
    }
    return { success: true, catre };
  }

  /* ⚠ SMS-ul de proba se PLATESTE, ca oricare altul. Se spune pe ecran. */
  const catre = biz.phone?.trim();
  if (!catre) return { error: "Magazinul nu are un număr de telefon salvat, deci nu avem unde trimite proba." };

  /*
   * ⚠⚠ CU SERVICE ROLE, NU CU CLIENTUL UTILIZATORULUI. Cheile din
   * `store_settings` sunt criptate in tabela si se decripteaza prin vedere
   * numai pentru service role: citite cu clientul omului, ar veni ca
   * „enc.v1.…" si ar pleca asa catre furnizor - adica proba n-ar merge, si
   * nimeni n-ar sti de ce.
   *
   * Prima scriere folosea aici `supabase`, si a fost prinsa de plasa din
   * `citire-secrete.test.ts`, nu de mine.
   */
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("smso_config, notice_config").eq("business_id", businessId).single();
  const smso = settings?.smso_config as SmsoConfig | null;
  const notice = settings?.notice_config as NoticeConfig | null;
  const noticeReady = !!(notice?.enabled && notice.api_token && notice.abandoned?.enabled);
  const smsoReady = !!(smso?.enabled && smso.api_key && smso.sender_id);
  if (!noticeReady && !smsoReady) return { error: "Nu ai niciun serviciu de SMS pornit." };

  const body = `${text} ${storeUrl}`;
  if (noticeReady) {
    const r = await sendNoticeAbandonedSms(admin, notice!, { businessId, phone: catre, body });
    if (!r.success) return { error: r.error ?? "SMS-ul de probă nu a putut fi trimis." };
  } else {
    const r = await trimiteSiLasaUrma(admin as never, smso!.api_key, {
      businessId, phone: catre, sender: smso!.sender_id, body,
      type: "marketing", motiv: "proba_automatizare",
    });
    if (!r.success) return { error: r.error ?? "SMS-ul de probă nu a putut fi trimis." };
  }
  return { success: true, catre };
}

export async function saveAbandonedCartAutomation(
  businessId: string,
  config: AbandonedAutomationConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).single();
  if (!isPremiumPlan(profile?.plan)) {
    return { error: "Automatizarile sunt disponibile doar pe planurile Premium." };
  }

  const clean = readAutomationConfig(config);

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ abandoned_cart_automation: clean as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, abandoned_cart_automation: clean as never }));
  }
  if (error) return { error: "Eroare la salvarea automatizarii." };
  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

/*
 * ⚠ ACELASI REFUZ SI ACELASI TEXT PE AMANDOUA CANALELE.
 *
 * Cine trimite manual din panou nu vede ce contine cosul repretuit, ci doar
 * mesajul asta — deci el trebuie sa numeasca TOATE motivele pentru care linia
 * dispare, altfel comerciantul cauta acolo unde nu e. Pana acum spunea „nu mai
 * sunt in catalog / sunt dezactivate / au variante" si pentru un produs activ,
 * fara variante, care doar CERE PERSONALIZARE: omul se uita la un produs
 * sanatos si nu intelege ce i se cere.
 *
 * (Nu e o formula de politete: motivele sunt chiar cele din `liniiRecuperabile`.
 * Cand se adauga acolo un motiv nou, se adauga si aici.)
 */
const COS_NERECUPERABIL =
  "Produsele din acest cos nu se mai pot pune inapoi in cos: nu mai sunt in catalog, sunt dezactivate, au variante sau cer personalizare. Linkul de recuperare ar duce clientul la un cos gol, deci mesajul nu a plecat. Sterge cosul sau verifica produsele.";

// ── Recovery: email (owner) ────────────────────────────────────────────────────

/**
 * Poarta comuna a trimiterilor de mana: cosul mai poate primi un mesaj?
 *
 * ⚠ EXISTA FIINDCA ERAU DOUA CAI SI O SINGURA VERIFICARE. Cronul citea lista de
 * suprimari; trimiterea din panou nu o atingea deloc. Un om care ceruse sa nu
 * mai fie contactat putea primi mesaje mai departe, apasate cu mana - si pe
 * productie plecasera deja 34 de emailuri si 21 de SMS-uri catre clienti
 * adevarati.
 *
 * Verifica DOUA lucruri, amandoua imposibil de luat inapoi:
 *   1. contactul nu e suprimat (dezabonat, numar invalid, reclamatie de spam);
 *   2. cosul nu s-a convertit deja - „ai uitat ceva in cos" trimis cuiva care
 *      tocmai a cumparat e mai rau decat niciun mesaj.
 *
 * Cronul filtreaza deja `status = 'open'`; actiunea manuala n-o facea.
 */
async function poateTrimiteCatre(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  cart: { status?: string | null; email?: string | null; phone?: string | null; ignorat_la?: string | null },
): Promise<string | null> {
  if (cart.status === "converted") {
    return "Cosul a fost deja finalizat: clientul a comandat. Nu i se mai trimite mesaj de recuperare.";
  }
  /*
   * ⚠ „Ignorat" inseamna chiar asta: ramane in cifre, nu mai primeste mesaje.
   * Daca poarta n-ar verifica-o, butonul ar fi doar o parere.
   */
  if (cart.ignorat_la) {
    return "Cosul e marcat ca ignorat, deci nu i se mai trimit mesaje. Scoate-l din ignorate daca vrei sa-l contactezi.";
  }

  const { email, telefon } = cheileContactului(cart);
  if (!email && !telefon) return null;

  let q = admin.from("recovery_optout").select("email, phone, motiv").eq("business_id", businessId);
  /*
    ⚠ Se cauta pe ORICARE dintre cele doua contacte: omul a cerut sa nu mai fie
    contactat, nu „sa nu mai fie contactat pe email".
  */
  const conditii: string[] = [];
  if (email) conditii.push(`email.eq.${email}`);
  if (telefon) conditii.push(`phone.eq.${telefon}`);
  q = q.or(conditii.join(","));

  const { data, error } = await q;
  /*
    ⚠ CAND LISTA NU SE POATE CITI, NU SE TRIMITE. Aceeasi hotarare ca in cron:
    o eroare de citire tratata ca „nu e nimeni suprimat" ar trimite tocmai catre
    cei care au cerut sa nu mai primeasca.
  */
  if (error) return "Lista de dezabonari nu a putut fi citita, deci nu s-a trimis nimic. Incearca din nou.";

  const motiv = motivulSuprimarii((data ?? []) as RandSuprimare[], cart);
  return motiv ? mesajContactSuprimat(motiv) : null;
}

export async function sendAbandonedCartEmail(
  businessId: string,
  cartId: string,
  message?: string,
  discountCode?: string,
  /*
   * ⚠ Cheia unei APASARI, facuta cand se deschide fereastra. Aceeasi apasare
   * retrimisa (reincarcare, a doua fila, o cerere picata pe retea dupa ce
   * serverul trimisese deja) se loveste de randul existent si nu mai pleaca
   * nimic. O apasare noua e o intentie noua si trece.
   */
  cheieCerere?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, primary_color")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: cart } = await supabase
    .from("abandoned_carts")
    .select("id, customer_name, email, phone, status, ignorat_la, items, subtotal, recovery_count, last_activity_at")
    .eq("id", cartId).eq("business_id", businessId).single();
  if (!cart) return { error: "Cosul nu a fost gasit." };
  if (!cart.email) return { error: "Clientul nu a lasat un email." };

  const opreste = await poateTrimiteCatre(createAdminClient(), businessId, cart);
  if (opreste) return { error: opreste };
  /*
   * ⚠ ACEEASI VARSTA CA LA LINK, si pana acum lipsea tocmai aici.
   *
   * `getRecoverableCart` refuza un cos iesit din fereastra, dar trimiterea nici macar nu citea
   * `last_activity_at`. Deci mesajul pleca pe un cos de sapte luni, clientul apasa, si vitrina il
   * lasa pe prima pagina fara cos si fara nicio explicatie. Verificat DUPA gasirea cosului, ca
   * mesajul de eroare sa fie cel adevarat, nu „nu a fost gasit".
   */
  if (!cosulMaiPoateFiRecuperat(cart.last_activity_at, pragulComenzilor(new Date()))) {
    return { error: COS_PREA_VECHI };
  }

  // Preturile din `cart.items` sunt cele inghetate in localStorage la captura,
  // deci pot fi vechi de saptamani; se aduc la zi din catalog inainte sa plece
  // spre client, prin acelasi calcul ca linkul de recuperare. Lookup-ul merge cu
  // client de admin: dreptul asupra magazinului s-a verificat deja mai sus, iar
  // asa raspunsul nu depinde de politicile RLS de pe `products`.
  const proaspat = await cosRecuperabil(createAdminClient(), businessId, (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[]);
  if (proaspat.items.length === 0) {
    return { error: COS_NERECUPERABIL };
  }

  /*
   * ⚠ DREPTUL DE A TRIMITE SE IA INAINTE DE TRIMITERE, nu dupa. Scris dupa,
   * doua cereri paralele ar trece amandoua de verificare inainte ca vreuna sa
   * apuce sa lase urma, si acelasi om ar primi doua mesaje.
   */
  const revendicare = cheieCerere
    ? await revendicaTrimiterea(createAdminClient(), {
        businessId, cartId, canal: "email", sursa: "manual", cheie: cheieCerere,
      })
    : ({ fel: "liber" } as const);
  const opritDeDublura = mesajRevendicare(revendicare);
  if (opritDeDublura) return { error: opritDeDublura };

  /* Ca sa se stie CARE mesaj a adus omul inapoi, nu doar ca a venit prin vreunul. */
  const mesajId = cheieCerere
    ? await idulMesajului(createAdminClient(), { cartId, canal: "email", cheie: cheieCerere })
    : null;

  try {
    const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
    const emailSender = await getStoreEmailSender(supabase, businessId);
    await sendAbandonedCartRecovery(cart.email, {
      storeName: biz.store_name ?? biz.business_name,
      recoverUrl: buildRecoverUrl(storeUrl, cartId, discountCode?.trim() || null, mesajId),
      customerName: cart.customer_name,
      items: proaspat.items,
      total: proaspat.total,
      /* ⚠ Vezi `preturiSigure`: o linie cazuta pe catalog nu are voie sa devina promisiune. */
      preturiSigure: proaspat.sigur,
      color: biz.primary_color ?? "#07c527",
      message: message?.trim() ? interpolateRecoveryMessage(message, { name: cart.customer_name, store: biz.store_name ?? biz.business_name }) : undefined,
      discountCode: discountCode?.trim() || undefined,
    }, emailSender);
  } catch {
    return { error: "Emailul nu a putut fi trimis." };
  }

  /* Abia acum se stie ca a plecat: pana aici randul spunea doar „s-a incercat". */
  if (cheieCerere) {
    await confirmaTrimiterea(createAdminClient(), { cartId, canal: "email", cheie: cheieCerere });
  }

  await supabase.from("abandoned_carts")
    .update({
      recovery_email_sent_at: new Date().toISOString(),
      recovery_count: (cart.recovery_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId).eq("business_id", businessId);

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Recovery: SMS (owner, requires SMSO) ───────────────────────────────────────
export async function sendAbandonedCartSms(
  businessId: string,
  cartId: string,
  message?: string,
  discountCode?: string,
  /*
   * ⚠ Cheia unei APASARI, facuta cand se deschide fereastra. Aceeasi apasare
   * retrimisa (reincarcare, a doua fila, o cerere picata pe retea dupa ce
   * serverul trimisese deja) se loveste de randul existent si nu mai pleaca
   * nimic. O apasare noua e o intentie noua si trece.
   */
  cheieCerere?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug, custom_domain, store_name, business_name")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  // Service role, dupa verificarea de proprietate de mai sus: pe clientul
  // utilizatorului `smso_config.api_key` si `notice_config.api_token` ar veni ca
  // siruri `enc.v1.…` (`privat.decripteaza_config` nu decripteaza pentru
  // `authenticated`), iar furnizorul ar refuza fiecare SMS de recuperare.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("smso_config, notice_config").eq("business_id", businessId).single();
  const smso = settings?.smso_config as SmsoConfig | null;
  const notice = settings?.notice_config as NoticeConfig | null;
  const smsoReady = !!(smso?.enabled && smso.api_key && smso.sender_id);
  const noticeReady = !!(notice?.enabled && notice.api_token && notice.abandoned?.enabled);
  if (!smsoReady && !noticeReady) return { error: "Activeaza SMSO sau notice.ro (cos abandonat) ca sa trimiti SMS." };

  const { data: cart } = await supabase
    .from("abandoned_carts")
    .select("id, customer_name, email, phone, status, ignorat_la, items, recovery_count, last_activity_at")
    .eq("id", cartId).eq("business_id", businessId).single();
  if (!cart) return { error: "Cosul nu a fost gasit." };
  if (!cart.phone) return { error: "Clientul nu a lasat un numar de telefon." };

  const opresteSms = await poateTrimiteCatre(admin, businessId, cart);
  if (opresteSms) return { error: opresteSms };
  /*
   * ⚠ SI AICI VARSTA, INAINTE DE ORICE. La SMS conteaza mai mult decat la email: mesajul e PLATIT
   * de comerciant, iar la capatul lui clientul gaseste un cos care nu mai exista. Se plateste ca
   * omul sa fie trimis intr-un zid.
   */
  if (!cosulMaiPoateFiRecuperat(cart.last_activity_at, pragulComenzilor(new Date()))) {
    return { error: COS_PREA_VECHI };
  }

  /*
   * ⚠ ACELASI REFUZ CA LA EMAIL, SI DIN ACELASI MOTIV — pana acum lipsea, iar
   * `items` nici macar nu se cerea in interogarea de mai sus.
   *
   * SMS-ul poarta doar linkul, deci pare ca n-are ce pret sa minta. Numai ca la
   * capatul linkului vitrina iese pe `items.length === 0` inainte de `restoreCart`
   * si sterge si parametrul `recover` din adresa: clientul ajunge pe prima pagina,
   * fara cos si fara nicio explicatie — dupa un SMS pe care comerciantul l-a
   * PLATIT, si cu `recovery_count` crescut degeaba.
   *
   * Un produs care cere personalizare (fototapetul la lei/m2) nimereste aici de
   * fiecare data: butonul de cos e ascuns, singurul drum de cumparare e formularul
   * de comanda, si tot el captureaza cosul cu o singura linie — chiar linia pe care
   * `liniiRecuperabile` o arunca.
   *
   * Client de admin, ca la email: dreptul asupra magazinului e verificat mai sus,
   * iar asa raspunsul nu depinde de politicile RLS de pe `products`.
   */
  const proaspat = await cosRecuperabil(admin, businessId, (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[]);
  if (proaspat.items.length === 0) {
    return { error: COS_NERECUPERABIL };
  }

  /* ⚠ Aceeasi poarta ca la email, si cu atat mai mult: al doilea SMS se PLATESTE. */
  const revendicareSms = cheieCerere
    ? await revendicaTrimiterea(admin, {
        businessId, cartId, canal: "sms", sursa: "manual", cheie: cheieCerere,
      })
    : ({ fel: "liber" } as const);
  const opritSms = mesajRevendicare(revendicareSms);
  if (opritSms) return { error: opritSms };

  const mesajIdSms = cheieCerere
    ? await idulMesajului(admin, { cartId, canal: "sms", cheie: cheieCerere })
    : null;

  const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
  const recoverUrl = buildRecoverUrl(storeUrl, cartId, discountCode?.trim() || null, mesajIdSms);
  const body = message?.trim()
    ? `${interpolateRecoveryMessage(message, { name: cart.customer_name, store: biz.store_name ?? biz.business_name })} ${recoverUrl}`
    : defaultRecoverySms({
        name: cart.customer_name,
        storeName: biz.store_name ?? biz.business_name,
        url: recoverUrl,
        code: discountCode?.trim() || null,
      });

  // Prefer notice.ro when the merchant enabled it for abandoned carts, else SMSO.
  if (noticeReady) {
    const r = await sendNoticeAbandonedSms(supabase, notice, { businessId, phone: cart.phone, body });
    if (!r.success) return { error: r.error ?? "SMS-ul nu a putut fi trimis." };
  } else {
    const res = await trimiteSiLasaUrma(supabase as never, smso!.api_key, {
      businessId, phone: cart.phone, sender: smso!.sender_id,
      body, type: "marketing", motiv: "cos_abandonat",
    });
    if (!res.success) return { error: res.error ?? "SMS-ul nu a putut fi trimis." };
  }

  if (cheieCerere) {
    await confirmaTrimiterea(admin, { cartId, canal: "sms", cheie: cheieCerere });
  }

  await supabase.from("abandoned_carts")
    .update({
      recovery_sms_sent_at: new Date().toISOString(),
      recovery_count: (cart.recovery_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId).eq("business_id", businessId);

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

/**
 * „Ignora": cosul ramane in cifre, dar nu mai primeste niciun mesaj.
 *
 * ⚠ EXISTA CA SA NU MAI FIE STERGEREA SINGURA IESIRE. Pana acum, comerciantul
 * care voia doar sa scape de un cos (de proba, al lui, al unui client care a
 * sunat si a comandat la telefon) apasa cosul de gunoi - si odata cu randul
 * pleca si valoarea lui din rata de abandon si din venitul potential. Cifrele
 * se schimbau retroactiv pentru o hotarare care n-avea nicio legatura cu ele.
 */
export async function ignoraCosAbandonat(
  businessId: string, cartId: string, ignora: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Neautorizat" };

  const { error } = await supabase
    .from("abandoned_carts")
    .update({ ignorat_la: ignora ? new Date().toISOString() : null, updated_at: new Date().toISOString() } as never)
    .eq("id", cartId).eq("business_id", businessId);
  if (error) return { error: "Nu am putut schimba starea cosului." };

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Delete (owner) ─────────────────────────────────────────────────────────────
export async function deleteAbandonedCart(
  businessId: string,
  cartId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { error } = await supabase
    .from("abandoned_carts").delete().eq("id", cartId).eq("business_id", businessId);
  if (error) return { error: "Eroare la stergere." };

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}
