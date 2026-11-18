import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import type { Verdict } from "@/lib/email-marketing/coada";
import { apeleaza, contulNuExista, type RezultatTM } from "./client";
import { modulPornit, sursaPornita, theMarketerGata, type TheMarketerConfig } from "./config";
import {
  apelPentruEveniment, corpComanda, liniiTM, numeTM, telefonTM, statusTM,
  type ComandaTM, type FelEvenimentTM, type ProdusLinie,
} from "./comanda";
import { citesteRecenziile } from "./recenzii";
import { citesteConfig, semnaleaza } from "./server";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE TRIMITE EDINIO SPRE THEMARKETER, DIN SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  - abonarea (checkout, popup, formulare): `add_subscriber`, numai pe canalul email;
  - comenzile, din coada scrisa de triggerul de pe `orders`: `save_order` + `update_order_status`;
  - anonimizarea ceruta de comerciant: `anonymize-email`;
  - dezabonatii (din theMarketer spre Edinio): `unsubscribed_emails` → `recovery_optout`;
  - recenziile (din theMarketer spre Edinio): `product_reviews` → `recenzii_produse`.

  ⚠ NIMIC DE AICI NU ARE VOIE SA STRICE drumul din care e chemat (o comanda, un formular): functiile
  care pornesc din vitrina nu arunca, iar cele din coada intorc un verdict.
*/

const ETICHETA_SURSA = { checkout: "Checkout", popup: "Popup", forms: "Formular" } as const;
export type SursaAbonare = keyof typeof ETICHETA_SURSA;

/** Parametrii lui `add_subscriber`. Pura (se probeaza). */
export function corpAbonare(opts: {
  source: SursaAbonare;
  email: string;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
}): Record<string, unknown> {
  const { firstname, lastname } = numeTM(opts.name);
  return {
    email: opts.email.trim().toLowerCase(),
    ...(firstname ? { firstname } : {}),
    ...(lastname && lastname !== firstname ? { lastname } : {}),
    ...(opts.phone?.trim() ? { phone: telefonTM(opts.phone) } : {}),
    ...(opts.city?.trim() ? { city: opts.city.trim() } : {}),
    country: "RO",
    /* De unde a venit contactul, ca segment in theMarketer. „add_tags: will add to existing tags”. */
    add_tags: `Edinio,${ETICHETA_SURSA[opts.source]}`,
    /*
     * ⚠ NUMAI EMAIL. Bifa de la checkout si formularele cer acordul pentru newsletter; fara `channels`,
     * theMarketer ar fi abonat omul si la SMS (telefonul pleaca in date), pe un acord pe care nu l-a dat.
     */
    channels: "email",
  };
}

/**
 * Aboneaza un contact care si-a dat acordul (bifa de newsletter la checkout, un popup, un formular).
 * theMarketer trimite singur emailul de confirmare (dubla optiune e pornita implicit la ei). Nu arunca.
 */
export async function maybeSyncTheMarketerSubscriber(opts: {
  businessId: string;
  source: SursaAbonare;
  email: string | null | undefined;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
}): Promise<void> {
  try {
    const email = (opts.email ?? "").trim();
    if (!email) return;
    const config = await citesteConfig(opts.businessId);
    if (!sursaPornita(config, opts.source)) return;
    const r = await apeleaza(config!, "POST", "add_subscriber", corpAbonare({ ...opts, email }));
    if (!r.ok) await semnaleaza(opts.businessId, "abonare", r.mesaj, { sursa: opts.source, status: r.status });
  } catch (e) {
    await logError({
      action: "themarketer.abonare",
      message: e instanceof Error ? e.message : "abonarea a cazut",
      businessId: opts.businessId,
      details: { sursa: opts.source },
      severity: "warning",
    });
  }
}

/** Verdictul cozii dintr-un rezultat theMarketer. Pur. */
export function verdictTM(r: RezultatTM): Verdict {
  if (r.ok) return { fel: "trimis" };
  if (r.fel === "acreditari" || r.fel === "refuz") return { fel: "refuzat", motiv: r.mesaj };
  return { fel: "esuat", motiv: r.mesaj };
}

type ComandaCititaTM = ComandaTM & { business_id: string; order_source: unknown };

const COLOANE_COMANDA =
  "business_id, order_number, customer_name, customer_email, customer_phone, shipping_address, items, shipping_cost, total, "
  + "discount_code, discount_amount, card_discount_amount, offer_discount_amount, cod_discount_amount, cod_fee_amount, "
  + "vat_amount, status, payment_status, payment_method, created_at, order_source";

export const COLOANE_PRODUS_LINIE = "id, name, sku, slug, images, category, price, compare_at_price, page_sections";

/** Produsele de azi ale liniilor unei comenzi (pentru SKU-ul variantei). Arunca la o citire cazuta. */
export async function produseleLiniilor(businessId: string, items: unknown): Promise<Map<string, ProdusLinie>> {
  const ids = [...new Set((Array.isArray(items) ? items : [])
    .map((i) => (i as { product_id?: unknown })?.product_id)
    .filter((x): x is string => typeof x === "string" && !x.startsWith("extra_")))];
  const harta = new Map<string, ProdusLinie>();
  if (ids.length === 0) return harta;
  const admin = createAdminClient();
  for (const bucata of bucatiDeIduri(ids)) {
    const { data, error } = await admin.from("products").select(COLOANE_PRODUS_LINIE).eq("business_id", businessId).in("id", bucata);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as unknown as ProdusLinie[]) harta.set(p.id, p);
  }
  return harta;
}

/**
 * Trimite un eveniment al cozii de email marketing (`lib/email-marketing/coada.ts`) catre theMarketer.
 * Nu arunca.
 */
export async function evenimentTheMarketer(orderId: string, fel: FelEvenimentTM): Promise<Verdict> {
  try {
    const { data, error } = await createAdminClient().from("orders").select(COLOANE_COMANDA).eq("id", orderId).maybeSingle();
    if (error) return { fel: "esuat", motiv: error.message };
    const c = data as unknown as ComandaCititaTM | null;
    if (!c) return { fel: "sarit", motiv: "comanda nu mai exista" };
    /* ⚠ POARTA DE MARKETPLACE STA AICI, unde se citeste comanda (vezi `clientDeMarketplace`). */
    if (clientDeMarketplace(c.order_source)) return { fel: "sarit", motiv: "comanda de marketplace" };

    let config: TheMarketerConfig | null;
    try {
      config = await citesteConfig(c.business_id);
    } catch (e) {
      return { fel: "esuat", motiv: e instanceof Error ? e.message : "configurarea nu s-a putut citi" };
    }
    if (!modulPornit(config, "comenzi")) return { fel: "sarit", motiv: "integrarea e oprita" };

    const apel = apelPentruEveniment(fel, c.payment_method, c.payment_status);
    if ("sarit" in apel) return { fel: "sarit", motiv: apel.sarit };

    if (apel.apel === "status") {
      const r = await apeleaza(config!, "GET", "update_order_status", {
        order_number: c.order_number,
        order_status: apel.status,
      });
      return verdictTM(r);
    }

    if (!(c.customer_email ?? "").trim()) return { fel: "sarit", motiv: "comanda fara email" };
    const produse = await produseleLiniilor(c.business_id, c.items);
    const corp = corpComanda(c, liniiTM(c.items, produse));
    if (!corp) return { fel: "sarit", motiv: "comanda fara produse din catalog" };
    const r = await apeleaza(config!, "POST", "save_order", corp);
    if (!r.ok) return verdictTM(r);
    /*
     * Statusul de AZI, nu cel de la creare: o comanda platita online pleaca abia acum, iar intre timp
     * poate fi deja confirmata. Nereusita lui nu strica nimic (comanda a ajuns), deci nu schimba verdictul.
     */
    await apeleaza(config!, "GET", "update_order_status", { order_number: c.order_number, order_status: statusTM(c.status, c.payment_status) });
    return { fel: "trimis" };
  } catch (e) {
    return { fel: "esuat", motiv: e instanceof Error ? e.message : "exceptie" };
  }
}

/**
 * Anonimizeaza adresele in theMarketer (dreptul de stergere, cerut comerciantului) si sterge recenziile
 * lor aduse in Edinio. Intoarce cate au mers si care nu. Nu arunca.
 */
export async function anonimizeazaInTheMarketer(
  businessId: string,
  emailuri: readonly string[],
): Promise<{ anonimizate: number; esuate: string[]; sarit?: string }> {
  const curate = [...new Set(emailuri.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
  if (curate.length === 0) return { anonimizate: 0, esuate: [] };
  let config: TheMarketerConfig | null;
  try {
    config = await citesteConfig(businessId);
  } catch {
    return { anonimizate: 0, esuate: curate };
  }
  if (!modulPornit(config, "anonimizare")) return { anonimizate: 0, esuate: [], sarit: "oprita" };

  /* Recenziile lor din Edinio: numele lor ar ramane altfel pe pagina produsului. */
  try {
    await createAdminClient().from("recenzii_produse").delete().eq("business_id", businessId).in("email", curate);
  } catch {
    /* Raportat mai jos prin rezultatul theMarketer; recenziile se mai pot sterge din panou. */
  }

  let anonimizate = 0;
  const esuate: string[] = [];
  for (const email of curate) {
    const r = await apeleaza(config!, "POST", "anonymize-email", { email });
    /*
     * Un 404 care NU spune „contul nu exista” e un contact pe care theMarketer nu-l are: n-are ce sterge,
     * deci cererea e indeplinita. Un 404 cu „Customer not found” / „No query results for model [Domain]”
     * e contul magazinului, adica o cheie gresita: acela ramane esec.
     */
    if (r.ok || (r.status === 404 && !contulNuExista(r.status, r.brut))) anonimizate++;
    else esuate.push(email);
  }
  if (esuate.length > 0) {
    await semnaleaza(businessId, "anonimizare", `${esuate.length} adrese nu s-au putut anonimiza în theMarketer. Fă-o din contul lor.`, { cate: esuate.length });
  }
  return { anonimizate, esuate };
}

/* ═══ SINCRONIZARILE PERIODICE (cronul theMarketer) ═══ */

function ziua(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Cate adrese intra intr-un apel al functiei din baza (plafonul ei e 5000). */
const ADRESE_PE_APEL = 2000;

/**
 * Aduce dezabonatii din theMarketer in `recovery_optout`, de la ultima zi citita incolo (cu o zi in plus
 * in urma: `date_from`/`date_to` sunt ZILE, iar o zi citita pe jumatate s-ar pierde altfel).
 */
export async function sincronizeazaDezabonatii(
  businessId: string,
  config: TheMarketerConfig,
  acum: Date = new Date(),
): Promise<{ ok: true; noi: number } | { ok: false; mesaj: string }> {
  const admin = createAdminClient();
  const { data: stare } = await admin.from("themarketer_stare").select("dezabonari_de_la").eq("business_id", businessId).maybeSingle();
  const deLa = (stare as { dezabonari_de_la?: string | null } | null)?.dezabonari_de_la ?? null;
  const azi = ziua(acum);
  const r = await apeleaza(config, "GET", "unsubscribed_emails", {
    ...(deLa ? { date_from: deLa } : {}),
    date_to: azi,
  }, { termenMs: 30_000 });
  if (!r.ok) return { ok: false, mesaj: r.mesaj };
  if (!Array.isArray(r.json)) return { ok: false, mesaj: "theMarketer a răspuns la dezabonați cu altceva decât o listă." };
  const emailuri = (r.json as unknown[]).filter((e): e is string => typeof e === "string");

  let noi = 0;
  for (let i = 0; i < emailuri.length; i += ADRESE_PE_APEL) {
    const { data, error } = await admin.rpc("themarketer_dezaboneaza", {
      p_business: businessId,
      p_emailuri: emailuri.slice(i, i + ADRESE_PE_APEL),
      p_motiv: "dezabonare",
    });
    /* ⚠ Cursorul NU avanseaza daca scrierea a cazut: data viitoare se cer din nou aceleasi zile. */
    if (error) return { ok: false, mesaj: `dezabonații nu s-au putut scrie: ${error.message}` };
    noi += Number(data) || 0;
  }
  const ieri = ziua(new Date(acum.getTime() - 24 * 3600 * 1000));
  await admin.from("themarketer_stare").upsert(
    { business_id: businessId, dezabonari_de_la: ieri, dezabonari_sincronizat_la: acum.toISOString() } as never,
    { onConflict: "business_id" },
  );
  return { ok: true, noi };
}

/** Recenzii pe pagina ceruta lui theMarketer, si cate pagini intr-o rulare. */
const RECENZII_PE_PAGINA = 100;
const PAGINI_PE_RULARE = 20;

/**
 * Aduce recenziile noi din modulul Feedback in `recenzii_produse`. Numai pentru produsele magazinului
 * (theMarketer trimite id-urile din feedul nostru). Ce comerciantul a ascuns ramane ascuns: `ascunsa`
 * nu intra in scriere.
 */
export async function sincronizeazaRecenziile(
  businessId: string,
  config: TheMarketerConfig,
  acum: Date = new Date(),
): Promise<{ ok: true; scrise: number } | { ok: false; mesaj: string }> {
  const admin = createAdminClient();
  const { data: stare } = await admin.from("themarketer_stare").select("recenzii_de_la").eq("business_id", businessId).maybeSingle();
  const deLa = (stare as { recenzii_de_la?: number | null } | null)?.recenzii_de_la ?? null;

  let scrise = 0;
  for (let pagina = 1; pagina <= PAGINI_PE_RULARE; pagina++) {
    const r = await apeleaza(config, "GET", "product_reviews", {
      ...(deLa ? { t: deLa } : {}),
      page: pagina,
      perPage: RECENZII_PE_PAGINA,
    }, { termenMs: 30_000 });
    if (!r.ok) return { ok: false, mesaj: r.mesaj };
    const recenzii = citesteRecenziile(r.text);
    if (recenzii.length === 0) break;

    const ids = [...new Set(recenzii.map((x) => x.productId))];
    const ale = new Set<string>();
    for (const bucata of bucatiDeIduri(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))) {
      const { data, error } = await admin.from("products").select("id").eq("business_id", businessId).in("id", bucata);
      if (error) return { ok: false, mesaj: `produsele recenziilor nu s-au putut citi: ${error.message}` };
      for (const p of data ?? []) ale.add((p as { id: string }).id);
    }
    const randuri = recenzii.filter((x) => ale.has(x.productId)).map((x) => ({
      business_id: businessId,
      product_id: x.productId,
      sursa: "themarketer",
      id_extern: x.idExtern,
      autor: x.autor,
      email: x.email,
      nota: x.nota,
      text: x.text,
      media: x.media,
      data_recenzie: x.data,
    }));
    if (randuri.length > 0) {
      const { error } = await admin.from("recenzii_produse").upsert(randuri as never, { onConflict: "business_id,sursa,id_extern" });
      if (error) return { ok: false, mesaj: `recenziile nu s-au putut scrie: ${error.message}` };
      scrise += randuri.length;
    }
    /*
     * Se merge mai departe numai la o pagina PLINA. Mai putine = ultima pagina; mai multe = theMarketer a
     * ignorat paginarea si a trimis tot deodata (fara `page` asa face, dupa documentatie), deci n-are rost
     * sa ceri pagina 2: ar veni acelasi lot.
     */
    if (recenzii.length !== RECENZII_PE_PAGINA) break;
  }
  /* Data viitoare de la o zi in urma: recenziile se pot modera la ei dupa ce le-am citit. */
  await admin.from("themarketer_stare").upsert(
    { business_id: businessId, recenzii_de_la: Math.floor(acum.getTime() / 1000) - 24 * 3600, recenzii_sincronizat_la: acum.toISOString() } as never,
    { onConflict: "business_id" },
  );
  return { ok: true, scrise };
}

/** Configurarea e legata si modulul cerut e pornit (pentru cron, pe randuri citite deja). */
export function poateSincroniza(config: unknown, modul: "dezabonari" | "recenzii"): config is TheMarketerConfig {
  return theMarketerGata(config) && modulPornit(config, modul);
}
