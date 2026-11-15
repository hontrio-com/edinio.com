/*
 * FARA "use server", INTENTIONAT: intr-un modul "use server" fiecare export devine un capat HTTP
 * public. Functiile de aici primesc clientul de SISTEM si un `businessId` ales de apelant; se cheama
 * numai din rute si din actiuni care si-au verificat deja omul.
 */

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import { logError } from "@/lib/error-logger";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { citesteConfigTbi, mesajLimiteTbi, sumaInLimite, tbiGata } from "./config";
import { citesteCheiaPublicaTbi, type CheieCitita } from "./cripto";
import { construiesteCererea, inBani, sumaArticolelor, type ProdusPentruTbi } from "./cerere";
import { anuleazaCererea, trimiteCererea } from "./client";
import { STARI_DESCHISE, treceLa, type EfectVeste, type StareTbi, type VesteTbi } from "./stari";

type Admin = SupabaseClient<Database>;
export type RandCerere = Database["public"]["Tables"]["tbi_cereri"]["Row"];

/** Cate reveniri pe aceeasi cerere pastram: destul pentru istoria oricarei cereri reale. */
const ISTORIC_MAXIM = 50;
/** O cerere trimisa de curand, pe aceeasi suma, se refoloseste in loc sa se faca alta. */
const REFOLOSIRE_MS = 30 * 60_000;

export function hashJeton(jeton: string): string {
  return createHash("sha256").update(jeton, "utf8").digest("hex");
}

function adresaAplicatiei(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com").replace(/\/+$/, "");
}

/** `back_ref`: unde ne trimite tbi fiecare schimbare de stare a cererii. */
export function adresaNotificarii(jeton: string): string {
  return `${adresaAplicatiei()}/api/tbi/notificare/${jeton}`;
}

function istoricCu(vechi: Json, intrare: Record<string, Json>): Json[] {
  const lista = Array.isArray(vechi) ? (vechi as Json[]) : [];
  return [...lista, intrare].slice(-ISTORIC_MAXIM);
}

// ─── Pornirea cererii ────────────────────────────────────────────────────────

export type RezultatPornire = { ok: true; adresa: string } | { ok: false; status: number; mesaj: string };

const PRODUS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trimite cererea de finantare a unei comenzi si intoarce adresa paginii tbi.
 *
 * ⚠ RANDUL SE SCRIE INAINTEA APELULUI („creata"), cu jetonul din `back_ref`. Daca procesul moare
 * intre apel si scrierea adresei, vestea tbi tot gaseste cererea, dupa jeton. Fara rand scris
 * inainte, o aprobare venita pentru o cerere pe care n-o mai stim s-ar fi pierdut.
 *
 * Mesajele de aici le citeste CUMPARATORUL, in vitrina: fara diacritice.
 */
export async function pornesteCerereaTbi(
  admin: Admin,
  p: { orderId: string; businessId: string },
): Promise<RezultatPornire> {
  const [{ data: order, error: eO }, { data: st, error: eS }] = await Promise.all([
    admin.from("orders")
      .select("id, business_id, order_number, total, status, payment_status, payment_method, items, shipping_cost, customer_name, customer_email, customer_phone, shipping_address, billing_company")
      .eq("id", p.orderId).eq("business_id", p.businessId).maybeSingle(),
    admin.from("store_settings").select("tbi_config").eq("business_id", p.businessId).maybeSingle(),
  ]);
  if (eO || eS) {
    await logError({ action: "tbi/start", message: `citire picata: ${(eO ?? eS)!.message}`, details: { orderId: p.orderId }, businessId: p.businessId, severity: "error" });
    return { ok: false, status: 503, mesaj: "Nu am putut pregati cererea de finantare. Reincearca peste cateva momente." };
  }
  if (!order) return { ok: false, status: 404, mesaj: "Comanda nu a fost gasita." };
  if (order.payment_method !== "tbi") return { ok: false, status: 400, mesaj: "Comanda nu are aleasa plata in rate prin tbi bank." };
  if (order.payment_status === "paid") return { ok: false, status: 400, mesaj: "Comanda a fost deja platita." };
  if (order.status === "cancelled") return { ok: false, status: 400, mesaj: "Comanda a fost anulata." };
  if (order.billing_company) {
    return { ok: false, status: 400, mesaj: "Plata in rate prin tbi bank este disponibila doar pentru persoane fizice." };
  }

  const raw = st?.tbi_config ?? null;
  if (!tbiGata(raw)) return { ok: false, status: 400, mesaj: "Plata in rate prin tbi bank nu este disponibila la acest magazin." };
  const cfg = citesteConfigTbi(raw);
  const total = Number(order.total) || 0;
  const limite = { min: cfg.suma_minima, max: cfg.suma_maxima };
  if (!sumaInLimite(limite, total)) return { ok: false, status: 400, mesaj: mesajLimiteTbi(limite) };

  const mediu = cfg.sandbox ? "test" : "live";
  const { data: existente, error: eE } = await admin
    .from("tbi_cereri")
    .select("id, stare, suma, mediu, adresa_cerere, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (eE) {
    await logError({ action: "tbi/start", message: `cererile existente nu s-au putut citi: ${eE.message}`, details: { orderId: order.id }, businessId: p.businessId, severity: "error" });
    return { ok: false, status: 503, mesaj: "Nu am putut pregati cererea de finantare. Reincearca peste cateva momente." };
  }
  const lista = existente ?? [];
  if (lista.some((c) => c.stare === "aprobata")) {
    return { ok: false, status: 409, mesaj: "Finantarea pentru aceasta comanda a fost deja aprobata de tbi bank." };
  }
  if (lista.some((c) => c.stare === "in_analiza" && c.mediu === mediu)) {
    return { ok: false, status: 409, mesaj: "Cererea ta de finantare este deja in analiza la tbi bank. Vei primi raspunsul de la banca." };
  }
  /*
   * ⚠ DUBLUL CLIC SI INTOARCEREA DIN PAGINA LOR nu fac a doua cerere de credit: o cerere trimisa
   * de curand, pentru aceeasi suma, se refoloseste. Fiecare cerere noua e o cerere de credit pe
   * numele omului la banca; zece apasari n-au voie sa insemne zece cereri.
   */
  const recenta = lista.find((c) =>
    c.stare === "trimisa" && c.mediu === mediu && !!c.adresa_cerere
    && inBani(c.suma) === inBani(total)
    && Date.now() - Date.parse(c.created_at) < REFOLOSIRE_MS);
  if (recenta?.adresa_cerere) return { ok: true, adresa: recenta.adresa_cerere };

  let cheie: CheieCitita;
  try {
    cheie = citesteCheiaPublicaTbi(cfg.cheie_publica_tbi);
  } catch (e) {
    await logError({ action: "tbi/start", message: `cheia publica tbi nu se poate citi: ${(e as Error).message}`, businessId: p.businessId, severity: "critical" });
    return { ok: false, status: 500, mesaj: "Plata in rate prin tbi bank nu este configurata corect la acest magazin. Alege alta metoda de plata." };
  }

  const jeton = randomBytes(32).toString("base64url");
  const { data: rand, error: eI } = await admin
    .from("tbi_cereri")
    .insert({
      business_id: order.business_id,
      order_id: order.id,
      order_number: order.order_number,
      jeton_hash: hashJeton(jeton),
      mediu,
      suma: Math.round(total * 100) / 100,
      stare: "creata",
    })
    .select("id")
    .single();
  if (eI || !rand) {
    await logError({ action: "tbi/start", message: `cererea nu s-a putut scrie: ${eI?.message ?? "fara rand"}`, details: { orderId: order.id }, businessId: p.businessId, severity: "critical" });
    return { ok: false, status: 503, mesaj: "Nu am putut pregati cererea de finantare. Reincearca peste cateva momente." };
  }

  /* Sku si imaginea vin din catalog; lipsa lor nu opreste nimic, sunt doar pentru pagina tbi. */
  const ids = (Array.isArray(order.items) ? (order.items as { product_id?: unknown }[]) : [])
    .map((i) => (typeof i.product_id === "string" ? i.product_id : ""))
    .filter((id) => PRODUS_UUID.test(id));
  const produse = new Map<string, ProdusPentruTbi>();
  if (ids.length > 0) {
    const { data: prod } = await admin
      .from("products").select("id, sku, images")
      .eq("business_id", order.business_id).in("id", [...new Set(ids)].slice(0, 100));
    for (const pr of prod ?? []) {
      const imagini = Array.isArray(pr.images) ? (pr.images as unknown[]) : [];
      produse.set(pr.id, { sku: pr.sku, imagine: typeof imagini[0] === "string" ? imagini[0] : null });
    }
  }

  const cerere = construiesteCererea({
    comanda: {
      id: order.id,
      order_number: order.order_number,
      total: order.total,
      items: order.items,
      shipping_cost: order.shipping_cost,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      shipping_address: order.shipping_address,
    },
    cfg,
    idCerere: rand.id,
    adresaInapoi: adresaNotificarii(jeton),
    produse,
  });
  if (sumaArticolelor(cerere) !== inBani(total)) {
    /* Nu se poate intampla prin constructie (`potrivesteLiniile`); daca se intampla, se vede. */
    await logError({ action: "tbi/start", message: "articolele nu aduna totalul comenzii", details: { orderId: order.id, total, suma: sumaArticolelor(cerere) / 100 }, businessId: p.businessId, severity: "warning" });
  }

  const r = await trimiteCererea(cfg, cheie, cerere);
  const la = new Date().toISOString();
  if (r.fel === "redirect") {
    const { error } = await admin
      .from("tbi_cereri")
      .update({ stare: "trimisa", adresa_cerere: r.adresa, istoric: [{ la, fel: "trimisa", status: r.status }] })
      .eq("id", rand.id).eq("stare", "creata");
    if (error) {
      /* Clientul pleaca oricum la tbi: vestea gaseste cererea dupa jeton, chiar ramasa „creata". */
      await logError({ action: "tbi/start", message: `adresa cererii nu s-a scris: ${error.message}`, details: { orderId: order.id, cerere: rand.id }, businessId: p.businessId, severity: "warning" });
    }
    return { ok: true, adresa: r.adresa };
  }

  await admin
    .from("tbi_cereri")
    .update({ stare: "eroare", motiv: r.mesaj, istoric: [{ la, fel: r.fel, status: r.status, detaliu: r.detaliu }] })
    .eq("id", rand.id).eq("stare", "creata");
  const autentificare = r.fel === "refuz" && (r.status === 401 || r.status === 403);
  await logError({
    action: "tbi/start",
    message: `${r.fel === "refuz" ? "tbi a refuzat cererea" : "raspuns necunoscut de la tbi"}: ${r.mesaj}`,
    details: { orderId: order.id, cerere: rand.id, status: r.status, detaliu: r.detaliu, mediu },
    businessId: p.businessId,
    severity: autentificare ? "critical" : "error",
  });
  /*
   * ⚠ Credentialele respinse se spun COMERCIANTULUI, nu doar jurnalului: pana nu le repara, niciun
   * client nu poate plati in rate, iar el n-ar afla decat din vanzarile pierdute. O data la sase
   * ore, ca o zi cu multi clienti sa nu-i umple clopotelul.
   */
  if (autentificare && (await consumaLimita(`tbi-autentificare:${p.businessId}`, 1, 6 * 3600)).permis) {
    const proprietari = await proprietariiMagazinelor(admin, [p.businessId]);
    await semnaleazaExpedierea(admin, {
      userId: proprietari.get(p.businessId) ?? null,
      businessId: p.businessId,
      orderId: order.id,
      orderNumber: order.order_number,
      tip: "plata",
      titlu: "tbi bank refuză datele de acces",
      mesaj: "Un client a ales plata în rate, dar tbi bank a respins autentificarea. Verifică în Integrări > tbi bank "
        + "codul magazinului, utilizatorul, parola și cheia publică tbi. Până atunci, clienții nu pot plăti în rate.",
      actiune: "tbi/start",
      detalii: { status: r.status, mediu },
    });
  }
  return {
    ok: false,
    status: 502,
    mesaj: "Nu am putut porni cererea de finantare la tbi bank. Incearca din nou peste cateva momente sau alege alta metoda de plata.",
  };
}

// ─── Vestile de la tbi ───────────────────────────────────────────────────────

export type RezultatVeste =
  | { fel: "aplicata"; stare: StareTbi; efect: EfectVeste }
  /** Baza n-a raspuns: vestea trebuie primita din nou (ruta raspunde 503). */
  | { fel: "reincearca"; mesaj: string };

/**
 * Aplica o veste deja descifrata si potrivita cu cererea ei.
 *
 * ⚠ RANDUL SE SCRIE INAINTE DE EFECTE, cu doua conditii in `WHERE`: starea si `updated_at` citite.
 * Doua vesti sosite deodata nu pot scrie amandoua peste aceeasi citire; a doua reciteste si se
 * aplica peste prima. Fara `updated_at` in conditie, doua vesti cu aceeasi stare ar fi trecut
 * amandoua, iar una din intrarile din istoric s-ar fi pierdut.
 */
export async function aplicaVesteaTbi(admin: Admin, cerere: RandCerere, veste: VesteTbi): Promise<RezultatVeste> {
  let curenta = cerere;
  for (let incercare = 0; incercare < 3; incercare++) {
    const anterioara = curenta.stare as StareTbi;
    const { stare, efect } = treceLa(anterioara, veste);
    const la = new Date().toISOString();
    const { data: scrise, error } = await admin
      .from("tbi_cereri")
      .update({
        stare,
        motiv: veste.motiv || (stare === "aprobata" ? null : curenta.motiv),
        ultima_veste_la: la,
        istoric: istoricCu(curenta.istoric, { la, fel: "veste", status_id: veste.statusId, motiv: veste.motiv || null, stare }),
      })
      .eq("id", curenta.id)
      .eq("stare", curenta.stare)
      .eq("updated_at", curenta.updated_at)
      .select("id");
    if (error) return { fel: "reincearca", mesaj: error.message };
    if (!scrise || scrise.length === 0) {
      const { data: proaspata, error: eR } = await admin.from("tbi_cereri").select("*").eq("id", curenta.id).maybeSingle();
      if (eR || !proaspata) return { fel: "reincearca", mesaj: eR?.message ?? "cererea a disparut intre citire si scriere" };
      curenta = proaspata;
      continue;
    }
    return await faEfectul(admin, curenta, anterioara, stare, efect, veste);
  }
  return { fel: "reincearca", mesaj: "cererea s-a schimbat de trei ori in timpul aplicarii" };
}

/**
 * Pentru cronul de reconciliere: o cerere APROBATA a carei comanda a ramas neplatita (baza a cazut
 * intre scrierea cererii si marcarea platii). Trece prin ACEEASI ramura ca vestea, cu aceleasi garzi;
 * `anterioara: "aprobata"` face ca notificarile pentru cazurile ciudate (comanda anulata, alta metoda,
 * alta suma) sa nu se repete: comerciantul le-a primit la vestea adevarata.
 */
export async function reiaPlataAprobata(admin: Admin, cerere: RandCerere): Promise<RezultatVeste> {
  return faEfectul(admin, cerere, "aprobata", "aprobata", "plateste", { orderId: String(cerere.id), statusId: 1, motiv: "" });
}

async function spune(admin: Admin, cerere: RandCerere, titlu: string, mesaj: string, detalii: Record<string, unknown>) {
  const proprietari = await proprietariiMagazinelor(admin, [cerere.business_id]);
  await semnaleazaExpedierea(admin, {
    userId: proprietari.get(cerere.business_id) ?? null,
    businessId: cerere.business_id,
    orderId: cerere.order_id,
    orderNumber: cerere.order_number,
    tip: "plata",
    titlu,
    mesaj,
    actiune: "tbi/notificare",
    detalii: { cerere: cerere.id, ...detalii },
  });
}

async function faEfectul(
  admin: Admin,
  cerere: RandCerere,
  anterioara: StareTbi,
  stare: StareTbi,
  efect: EfectVeste,
  veste: VesteTbi,
): Promise<RezultatVeste> {
  const nr = cerere.order_number;
  const motiv = veste.motiv ? ` Motivul transmis de tbi bank: „${veste.motiv}”.` : "";
  /* O aprobare repetata (vestea retrimisa) nu mai spune nimic: comerciantul a aflat prima data. */
  const primaAprobare = anterioara !== "aprobata";

  if (efect === "plateste") {
    if (!cerere.order_id) {
      if (primaAprobare) {
        await spune(admin, cerere, `Finanțare aprobată pentru o comandă ștearsă (${nr})`,
          `tbi bank a aprobat finanțarea pentru comanda ${nr}, care a fost ștearsă din Edinio. Ia legătura cu tbi bank `
          + "ca să anuleze contractul, altfel clientul rămâne cu un credit pentru o comandă care nu mai există.", {});
      }
      return { fel: "aplicata", stare, efect };
    }
    const { data: o, error } = await admin
      .from("orders").select("id, business_id, status, payment_status, payment_method, total")
      .eq("id", cerere.order_id).maybeSingle();
    if (error) return { fel: "reincearca", mesaj: error.message };
    if (!o) return { fel: "aplicata", stare, efect };
    if (o.payment_status === "paid") return { fel: "aplicata", stare, efect };

    /*
     * ⚠ COMANDA ANULATA NU SE MARCHEAZA PLATITA. Banca a aprobat un credit pentru marfa pe care
     * magazinul n-o mai trimite; scrisa `paid`, comanda ar fi pornit facturarea automata si ar fi
     * aparut ca vanzare. Comerciantul afla, iar contractul se anuleaza la tbi.
     */
    if (o.status === "cancelled") {
      if (primaAprobare) {
        await spune(admin, cerere, `Finanțare aprobată pentru o comandă anulată (${nr})`,
          `tbi bank a aprobat finanțarea pentru comanda ${nr}, care e anulată. Ia legătura cu tbi bank ca să anuleze `
          + "contractul de credit al clientului. Comanda nu a fost marcată plătită.", { stare_comanda: o.status });
      }
      return { fel: "aplicata", stare, efect };
    }
    if (o.payment_method !== "tbi") {
      if (primaAprobare) {
        await spune(admin, cerere, `Finanțare tbi aprobată, dar comanda ${nr} are altă plată`,
          `tbi bank a aprobat finanțarea pentru comanda ${nr}, dar metoda de plată a comenzii a fost schimbată între timp. `
          + "Comanda nu a fost marcată plătită. Verifică cu clientul cum plătește și, dacă renunță la credit, anunță tbi bank.",
          { metoda: o.payment_method });
      }
      return { fel: "aplicata", stare, efect };
    }
    /*
     * ⚠ SUMA APROBATA E CEA DIN CERERE. Daca totalul comenzii s-a schimbat dupa trimitere (comanda
     * editata), banca finanteaza alta suma decat cea de incasat. Ca la Revolut: nepotrivirea nu se
     * marcheaza platita, se spune.
     */
    if (inBani(o.total) !== inBani(cerere.suma)) {
      if (primaAprobare) {
        await spune(admin, cerere, `Suma finanțată diferă de comanda ${nr}`,
          `tbi bank a aprobat ${Number(cerere.suma).toFixed(2)} lei, dar totalul comenzii ${nr} este acum `
          + `${Number(o.total).toFixed(2)} lei. Comanda nu a fost marcată plătită; diferența trebuie lămurită cu clientul.`,
          { suma_aprobata: cerere.suma, total: o.total });
      }
      return { fel: "aplicata", stare, efect };
    }
    const r = await finalizeazaPlataComenzii(admin, { id: o.id, businessId: o.business_id });
    if (r.fel === "esuat") return { fel: "reincearca", mesaj: r.error };
    return { fel: "aplicata", stare, efect };
  }

  if (efect === "respinsa") {
    await spune(admin, cerere, `Finanțare tbi respinsă pentru comanda ${nr}`,
      `tbi bank a respins cererea de credit pentru comanda ${nr}.${motiv} Comanda a rămas neplătită: poți lua `
      + "legătura cu clientul pentru altă metodă de plată sau o poți anula.", { motiv: veste.motiv });
    return { fel: "aplicata", stare, efect };
  }

  if (efect === "anulata") {
    /* Anularea ceruta chiar de magazin (buton sau cron) nu mai trebuie spusa: el a facut-o. */
    if (!cerere.anulare_ceruta_la) {
      await spune(admin, cerere, `Cererea de finanțare tbi pentru comanda ${nr} a fost anulată`,
        `Clientul nu a finalizat cererea de credit tbi bank pentru comanda ${nr}, sau a anulat-o. Comanda a rămas `
        + "neplătită: poți lua legătura cu clientul pentru altă metodă de plată.", {});
    }
    return { fel: "aplicata", stare, efect };
  }

  if (efect === "anulata_dupa_aprobare") {
    /* Vezi `treceLa`: comanda NU se atinge. */
    await spune(admin, cerere, `Finanțarea tbi pentru comanda ${nr} a fost anulată după aprobare`,
      `tbi bank a anunțat că finanțarea pentru comanda ${nr}, aprobată anterior, a fost ${stare === "respinsa" ? "respinsă" : "anulată"}.`
      + `${motiv} Comanda a rămas marcată plătită: verifică la tbi bank dacă primești banii și, dacă nu, `
      + "schimbă starea plății și ia legătura cu clientul.", { motiv: veste.motiv });
    return { fel: "aplicata", stare, efect };
  }

  return { fel: "aplicata", stare, efect };
}

// ─── Anularea unei cereri deschise ───────────────────────────────────────────

export type RezultatAnulareCerere = { ok: true; mesaj: string } | { ok: false; mesaj: string; necunoscut?: boolean };

/**
 * Anuleaza o cerere inca neaprobata, la tbi. Pentru butonul din pagina comenzii si pentru cronul
 * care anuleaza cererile comenzilor anulate.
 *
 * ⚠ `anulare_ceruta_la` se scrie INAINTE de apel: vestea „anulata" care vine de la tbi dupa
 * anularea noastra nu mai trebuie sa-i spuna comerciantului ceva ce a facut chiar el.
 */
export async function anuleazaCerereaTbi(admin: Admin, cerere: RandCerere, raw: unknown): Promise<RezultatAnulareCerere> {
  if (!STARI_DESCHISE.includes(cerere.stare as StareTbi)) {
    return { ok: false, mesaj: "Cererea nu mai poate fi anulată din Edinio: banca a hotărât deja." };
  }
  const cfg = citesteConfigTbi(raw);
  if (!cfg.store_id || !cfg.username || !cfg.password || !cfg.cheie_publica_tbi.trim()) {
    return { ok: false, mesaj: "Integrarea tbi bank nu mai are datele de acces, deci cererea nu se poate anula de aici." };
  }
  let cheie: CheieCitita;
  try {
    cheie = citesteCheiaPublicaTbi(cfg.cheie_publica_tbi);
  } catch (e) {
    return { ok: false, mesaj: (e as Error).message };
  }
  /* Mediul cererii, nu cel de acum: o cerere de test se anuleaza la serverul de test. */
  const cfgCerere = { ...cfg, sandbox: cerere.mediu === "test" };

  const la = new Date().toISOString();
  const { error: eMarcaj } = await admin.from("tbi_cereri").update({ anulare_ceruta_la: la }).eq("id", cerere.id);
  if (eMarcaj) return { ok: false, mesaj: "Nu am putut pregăti anularea. Reîncearcă peste câteva momente." };

  const r = await anuleazaCererea(cfgCerere, cheie, String(cerere.id));
  const { data: proaspata } = await admin.from("tbi_cereri").select("stare, istoric").eq("id", cerere.id).maybeSingle();
  const istoric = istoricCu(proaspata?.istoric ?? cerere.istoric, { la, fel: "anulare", rezultat: r.fel, ...(r.fel !== "anulata" ? { mesaj: r.mesaj } : {}) });

  if (r.fel === "anulata") {
    await admin.from("tbi_cereri")
      .update({ stare: "anulata", motiv: "Anulată de magazin", istoric })
      .eq("id", cerere.id).in("stare", [...STARI_DESCHISE]);
    return { ok: true, mesaj: "Cererea de finanțare a fost anulată la tbi bank." };
  }
  await admin.from("tbi_cereri").update({ istoric }).eq("id", cerere.id);
  await logError({
    action: "tbi/anulare",
    message: `${r.fel}: ${r.mesaj}`,
    details: { cerere: cerere.id, orderId: cerere.order_id, status: r.status },
    businessId: cerere.business_id,
    severity: r.fel === "refuz" ? "warning" : "error",
  });
  return r.fel === "refuz"
    ? { ok: false, mesaj: r.mesaj }
    : { ok: false, mesaj: `${r.mesaj} Nu știm dacă anularea a ajuns la tbi bank; verifică în portalul lor.`, necunoscut: true };
}
