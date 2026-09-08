import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { impingeStoculPeCeleLalteCanale } from "@/lib/marketplace/stoc-pe-canale";
import { combinatiiActiveUnice, parseVariants } from "@/lib/storefront/variants";
import { parseBillingCompany, type BillingCompany } from "@/lib/billing/company";
import { desfaIdArticol, amprentaCombinatie } from "./identitate";
import {
  esteLivrarePepita, incaseazaPepita, metodaPlata, modLivrareCunoscut, modPlataCunoscut,
  starePlata, statusInitial, etichetaLivrare, etichetaPlata,
} from "./mapare";
import type { ComandaPepita, LiniePepita } from "./comanda-forma";

/**
 * Comanda Pepita, adusa in Edinio.
 *
 * ═══ ⚠ IDEMPOTENTA, SI DE CE E CEA MAI IMPORTANTA PARTE ═══
 *
 * Panoul lor are „Resend order”. Deci aceeasi comanda poate sosi de doua, de cinci
 * sau de zece ori, si poate sosi si de doua ori DEODATA.
 *
 * Paza nu e „verific daca exista si apoi inserez”: intre cele doua trepte incap
 * doua cereri. Paza e cheia unica `(business_id, external_order_id)` din
 * `pepita_comenzi`: doua cereri concurente pot amandoua sa citeasca „nu exista”,
 * dar numai una poate castiga indexul. Cealalta primeste `23505` si intra pe
 * ramura de duplicat.
 *
 * ⚠ IAR SCADEREA STOCULUI E APARATA SEPARAT, si trebuie sa fie: chiar daca s-ar
 * face doua comenzi, `consuma_stoc_comanda_marketplace` scade o singura data, prin
 * marcajul `orders.stoc_marketplace_la` pus in aceeasi instructiune cu scaderea.
 * Doua paze, fiindca scaderea de doua ori a stocului e paguba din care se vinde
 * marfa inexistenta si se anuleaza comenzi la toate celelalte marketplace-uri.
 *
 * ═══ ⚠ CE NU FACE FUNCTIA ASTA ═══
 *
 * Nu trimite emailuri, nu emite facturi, nu cheama curieri si nu scrie in `customers`.
 * Ruta care o cheama trebuie sa raspunda repede, iar comanda trebuie sa fie SCRISA
 * inainte de orice efect care poate intarzia. Ce urmeaza dupa comanda (factura, AWB)
 * porneste din caile obisnuite ale panoului, cand comerciantul apasa.
 */

type Db = SupabaseClient<Database>;

export type StareIngest = "creata" | "duplicat" | "carantina" | "respinsa" | "esec";

export interface RezultatIngest {
  stare: StareIngest;
  orderId: string | null;
  /** Ce se poate spune in raspunsul catre Pepita. Fara detalii interne. */
  mesaje: string[];
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   POTRIVIREA LINIILOR CU PRODUSELE NOASTRE
   ═══════════════════════════════════════════════════════════════════════════ */

interface ProdusGasit {
  id: string;
  name: string;
  page_sections: unknown;
  sku: string | null;
}

export interface LinieLegata {
  linie: LiniePepita;
  productId: string | null;
  variantTitle: string | null;
  nume: string;
}

/**
 * Fiecare linie, legata de produsul si de combinatia ei.
 *
 * ═══ ⚠ POTRIVIREA CERE DOI MARTORI ═══
 *
 * `sku`-ul intors de ei e chiar `<Id>`-ul pe care l-am pus noi in feed, iar acela
 * e `<uuid produs>--<amprenta combinatie>`. Primul martor e ca UUID-ul chiar
 * exista si e AL ACESTUI MAGAZIN; al doilea, ca amprenta se potriveste cu o
 * combinatie activa a produsului.
 *
 * ⚠ FARA AL DOILEA MARTOR s-ar putea intampla ce s-a intamplat deja in alta parte:
 * o combinatie stearsa intre timp ar fi cazut tacut pe produsul intreg, si s-ar fi
 * scazut stocul altei marimi.
 *
 * ⚠ SI NU SE POTRIVESTE NIMIC DUPA NUME. Un „primul produs cu titlu asemanator” e
 * felul in care se scade stocul de pe alt produs si se expediaza altceva decat s-a
 * cumparat.
 */
export async function leagaLiniile(
  admin: Db, businessId: string, linii: LiniePepita[],
): Promise<{ legate: LinieLegata[]; nelegate: string[] }> {
  const idDupaLinie = linii.map((l) => desfaIdArticol(l.sku) ?? desfaIdArticol(l.idPepita));
  const skuriBrute = [...new Set(linii.map((l) => l.sku).filter((s): s is string => !!s))];

  /*
   * ═══ ⚠ PRIMUL MARTOR: CE AM TRIMIS CU ADEVARAT ═══
   *
   * Evidenta din `pepita_articole` spune, pentru fiecare `<Id>` plecat, de la ce produs si de
   * la ce combinatie a venit. E o cautare exacta, nu o recalculare.
   *
   * ⚠ SI DE-AIA EXISTA. Recalcularea porneste de la titlurile de ACUM: o comanda sosita dupa
   * ce comerciantul a redenumit o varianta poarta `<Id>`-ul VECHI, si atunci nicio amprenta
   * nu se mai potriveste. Linia ajungea in carantina fara sa stim macar despre ce produs e
   * vorba, deci comerciantul nu avea de unde sa inceapa.
   */
  const evidenta = new Map<string, { product_id: string; combinatie: string }>();
  const codurile = [...new Set(linii.flatMap((l) => [l.sku, l.idPepita]).filter((x): x is string => !!x))];
  if (codurile.length > 0) {
    for (let i = 0; i < codurile.length; i += 200) {
      const { data, error } = await admin
        .from("pepita_articole").select("articol_id, product_id, combinatie")
        .eq("business_id", businessId).in("articol_id", codurile.slice(i, i + 200));
      if (error) throw error;
      for (const r of (data ?? []) as { articol_id: string; product_id: string; combinatie: string }[]) {
        evidenta.set(r.articol_id, { product_id: r.product_id, combinatie: r.combinatie });
      }
    }
  }

  const productIds = [...new Set([
    ...idDupaLinie.filter((x) => x != null).map((x) => x!.productId),
    ...[...evidenta.values()].map((v) => v.product_id),
  ])];

  const dupaId = new Map<string, ProdusGasit>();
  const dupaSku = new Map<string, ProdusGasit>();

  if (productIds.length > 0) {
    /*
     * ⚠ `.eq("business_id", ...)` NU E DE PRISOS, desi citim cu cheia de serviciu.
     * Tocmai fiindca citim cu ea: RLS nu ne mai apara, iar un `sku` mestesugit ar
     * putea numi produsul altui magazin. Filtrul e aici singura izolare intre
     * chiriasi.
     */
    const { data, error } = await admin
      .from("products").select("id, name, page_sections, sku")
      .eq("business_id", businessId).in("id", productIds);
    if (error) throw error;
    for (const p of (data ?? []) as ProdusGasit[]) dupaId.set(p.id, p);
  }

  if (skuriBrute.length > 0) {
    /*
     * Plasa: daca Pepita ne trimite vreodata `sku`-ul PRODUSULUI in loc de `<Id>`-ul
     * din feed, linia tot se leaga. Nu inlocuieste primul drum, il completeaza.
     */
    const { data, error } = await admin
      .from("products").select("id, name, page_sections, sku")
      .eq("business_id", businessId).in("sku", skuriBrute);
    if (error) throw error;
    for (const p of (data ?? []) as ProdusGasit[]) {
      if (p.sku && !dupaSku.has(p.sku)) dupaSku.set(p.sku, p);
    }
  }

  const legate: LinieLegata[] = [];
  const nelegate: string[] = [];

  for (let i = 0; i < linii.length; i++) {
    const linie = linii[i];
    const desfacut = idDupaLinie[i];
    const scris = (linie.sku ? evidenta.get(linie.sku) : undefined)
      ?? (linie.idPepita ? evidenta.get(linie.idPepita) : undefined);

    const produs = (scris ? dupaId.get(scris.product_id) : undefined)
      ?? (desfacut ? dupaId.get(desfacut.productId) : undefined)
      ?? (linie.sku ? dupaSku.get(linie.sku) : undefined);

    if (!produs) {
      nelegate.push(linie.sku ?? linie.idPepita ?? "(fara cod)");
      legate.push({ linie, productId: null, variantTitle: null, nume: numeDeRezerva(linie) });
      continue;
    }

    /*
     * Titlul combinatiei: intai cel SCRIS la export, apoi, ca rezerva, cel recalculat din
     * amprenta. Rezerva ramane pentru comenzile sosite inainte ca feedul sa fi apucat sa
     * scrie evidenta.
     */
    const titluCautat = scris ? (scris.combinatie || null) : null;
    let variantTitle: string | null = null;
    if (titluCautat || desfacut?.amprenta) {
      const combinatii = combinatiiActiveUnice(parseVariants(produs.page_sections));
      variantTitle = titluCautat
        ? combinatii.find((c) => c.title === titluCautat)?.title ?? null
        : combinatii.find((c) => amprentaCombinatie(c.title) === desfacut!.amprenta)?.title ?? null;
      if (!variantTitle) {
        /*
         * ⚠ AL DOILEA MARTOR A CAZUT. Produsul exista, combinatia nu: a fost stearsa,
         * redenumita sau dezactivata dupa ce feedul plecase. Linia NU se leaga de
         * produsul intreg, fiindca nu stim ce marime sa scadem, si a ghici inseamna
         * sa expediezi altceva.
         *
         * ⚠ Iar in Edinio redenumirea CHIAR distruge combinatia: `generateCombinations`
         * o cauta dupa titlu, deci una redenumita se naste goala, fara pret si fara stoc.
         * De aceea motivul spune ce s-a intamplat, nu doar „cod necunoscut".
         */
        nelegate.push(titluCautat
          ? `${linie.sku ?? "(fara cod)"} (varianta „${titluCautat}" nu mai există la produsul ${produs.name})`
          : linie.sku ?? "(varianta necunoscuta)");
        legate.push({ linie, productId: null, variantTitle: null, nume: produs.name });
        continue;
      }
    }

    legate.push({
      linie,
      productId: produs.id,
      variantTitle,
      nume: variantTitle ? `${produs.name} (${variantTitle})` : produs.name,
    });
  }

  return { legate, nelegate };
}

function numeDeRezerva(l: LiniePepita): string {
  return l.sku ? `Produs Pepita ${l.sku}` : "Produs Pepita";
}

/* ═══════════════════════════════════════════════════════════════════════════
   INGESTUL
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ContextIngest {
  businessId: string;
  /** Moneda pietei configurate, pentru cand ei nu trimit una pe linie. */
  moneda: string;
}

/**
 * Scrie comanda, o data.
 *
 * Intoarce ce s-a intamplat, iar ruta traduce asta in raspunsul catre ei. Nu arunca
 * decat pe erori de baza pe care ruta le transforma in 503, ca sa poata reincerca.
 */
export async function ingereaza(admin: Db, ctx: ContextIngest, c: ComandaPepita): Promise<RezultatIngest> {
  const acum = new Date().toISOString();

  /*
   * ⚠ PASUL 1: randul de evidenta, INAINTE de orice prelucrare.
   *
   * El este idempotenta. Scris dupa, o a doua sosire concurenta ar fi apucat sa faca
   * si ea o comanda.
   */
  const { data: creat, error: eNou } = await admin
    .from("pepita_comenzi")
    .insert({
      business_id: ctx.businessId,
      external_order_id: c.externalId,
      origine: c.origine,
      stare: "carantina",
      rezumat: rezumatSigur(c) as never,
      incercari: 1,
    } as never)
    .select("id")
    .maybeSingle();

  let randId: string;
  if (eNou) {
    /* `23505` = cheia unica. Orice altceva e o pana de baza, si atunci ei trebuie sa reincerce. */
    if (eNou.code !== "23505") throw eNou;

    const { data: vechi, error: eCitire } = await admin
      .from("pepita_comenzi").select("id, order_id, stare, incercari")
      .eq("business_id", ctx.businessId).eq("external_order_id", c.externalId).maybeSingle();
    if (eCitire) throw eCitire;
    const rand = vechi as { id: string; order_id: string | null; stare: string; incercari: number } | null;
    if (!rand) throw eNou;

    /* Cate ori a mai sosit. Se citeste si se scrie inapoi: nu e un contor pe care sa se bata
       cineva, si o pierdere intr-o cursa nu strica nimic. */
    await admin.from("pepita_comenzi")
      .update({ incercari: (rand.incercari ?? 0) + 1 } as never)
      .eq("id", rand.id);

    /*
     * ⚠ COMANDA EXISTA DEJA. Nu se face nimic din nou, dar se DUCE LA CAPAT ce a
     * ramas: daca prima incercare a scris comanda si a picat la consumul de stoc,
     * chemarea de mai jos il termina. `consuma_stoc_comanda_marketplace` e
     * idempotenta, deci pe drumul obisnuit nu face nimic.
     */
    if (rand.order_id) {
      const legate = await leagaLiniile(admin, ctx.businessId, c.linii);
      await consumaStocul(admin, ctx.businessId, rand.order_id, legate.legate);
      return { stare: "duplicat", orderId: rand.order_id, mesaje: ["Comanda era deja înregistrată."] };
    }
    randId = rand.id;
  } else {
    randId = (creat as { id: string }).id;
  }

  const { legate, nelegate } = await leagaLiniile(admin, ctx.businessId, c.linii);

  /* Totalurile vin DE LA EI si nu se recalculeaza niciodata din preturile noastre de azi. */
  const marfa = round2(legate.reduce((s, l) => s + l.linie.pret * l.linie.cantitate, 0));
  const tva = round2(legate.reduce((s, l) => {
    const brut = l.linie.pret * l.linie.cantitate;
    const cota = l.linie.tva ?? 0;
    return s + (cota > 0 ? brut - brut / (1 + cota / 100) : 0);
  }, 0));
  const total = Math.max(0, round2(marfa + c.transport - c.voucher));
  const cote = [...new Set(legate.map((l) => l.linie.tva).filter((v): v is number => v != null && v > 0))];

  const items = legate.map((l) => ({
    product_id: l.productId,
    name: l.nume,
    price: round2(l.linie.pret),
    quantity: l.linie.cantitate,
    ...(l.variantTitle ? { variant_title: l.variantTitle } : {}),
    ...(l.linie.sku ? { sku: l.linie.sku } : {}),
  }));

  const numeClient = [c.client.prenume, c.client.nume].filter(Boolean).join(" ").trim()
    || c.client.facturare.nume
    || "Client Pepita";

  const numarComanda = `PEP-${c.externalId}`;
  const { data: comandaNoua, error: eComanda } = await admin.from("orders").insert({
    business_id: ctx.businessId,
    order_number: numarComanda,
    customer_name: numeClient,
    customer_phone: c.client.telefon || "",
    customer_email: c.client.email,
    shipping_address: adresaLivrare(c) as never,
    items: items as never,
    subtotal: marfa,
    shipping_cost: round2(c.transport),
    discount_amount: round2(c.voucher),
    total,
    vat_amount: tva,
    vat_rate: cote.length > 0 ? Math.max(...cote) : 0,
    status: statusInitial(),
    payment_method: metodaPlata(c.modPlata, c.modLivrare),
    payment_status: starePlata(c.starePlata, c.modPlata),
    notes: c.mesajClient,
    internal_notes: noteInterne(c, nelegate),
    billing_company: firmaCumparatoare(c) as never,
    order_source: sursaComenzii(c, ctx) as never,
  } as never).select("id").maybeSingle();

  let orderId: string;
  /*
   * ⚠ „Am scris-o eu" si „exista deja" NU sunt acelasi lucru, si se raporteaza diferit.
   *
   * Sub concurenta, mai multe cereri pot ajunge aici pentru aceeasi comanda: una scrie, iar
   * celelalte cad pe cheia unica de `order_number` si o REGASESC. Raportate toate ca „creata",
   * panoul si jurnalul ar arata zece comenzi acolo unde e una singura.
   */
  let regasita = false;
  if (eComanda || !comandaNoua) {
    /*
     * ⚠ O INCERCARE ANTERIOARA POATE SA FI SCRIS COMANDA si sa fi picat inainte de a
     * lega randul de evidenta. `order_number` e unic pe magazin, deci se regaseste.
     */
    const { data: gasita } = await admin.from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", numarComanda).maybeSingle();
    const g = gasita as { id: string } | null;
    if (!g) {
      await admin.from("pepita_comenzi").update({
        ultima_eroare: (eComanda?.message ?? "comanda nu s-a putut scrie").slice(0, 500),
        stare: "carantina",
      } as never).eq("id", randId);
      await logError({
        action: "pepita/comenzi",
        message: `comanda nu s-a putut scrie: ${eComanda?.message ?? "motiv necunoscut"}`,
        details: { externalId: c.externalId, cod: eComanda?.code ?? null },
        businessId: ctx.businessId, severity: "critical",
      });
      return { stare: "esec", orderId: null, mesaje: ["Comanda nu a putut fi salvată."] };
    }
    orderId = g.id;
    regasita = true;
  } else {
    orderId = (comandaNoua as { id: string }).id;
  }

  /*
   * ⚠ RANDUL DE EVIDENTA SE LEAGA INAINTE DE CONSUMUL DE STOC. Invers, o pana intre
   * cele doua ar lasa o comanda scrisa fara nicio urma in evidenta, iar o retrimitere
   * ar fi facut a doua.
   */
  const areNelegate = nelegate.length > 0;
  await admin.from("pepita_comenzi").update({
    order_id: orderId,
    stare: areNelegate ? "carantina" : "importata",
    motiv: areNelegate ? `Coduri fără corespondent în Edinio: ${nelegate.join(", ")}`.slice(0, 500) : null,
    prelucrat_la: acum,
  } as never).eq("id", randId);

  await consumaStocul(admin, ctx.businessId, orderId, legate);

  if (areNelegate) {
    await logError({
      action: "pepita/comenzi",
      message: "comandă Pepita cu linii care nu s-au putut lega de niciun produs",
      details: { externalId: c.externalId, coduri: nelegate.slice(0, 20), orderId },
      businessId: ctx.businessId, severity: "warning",
    });
  }

  return {
    stare: areNelegate ? "carantina" : regasita ? "duplicat" : "creata",
    orderId,
    mesaje: areNelegate
      /* ⚠ Se SPUNE ca lipseste ceva, dar nu se spune ca n-am salvat: comanda e scrisa. */
      ? [`Comandă salvată. Coduri necunoscute: ${nelegate.join(", ")}`]
      : [],
  };
}

/**
 * Scade stocul, o singura data.
 *
 * ⚠ NUMAI LINIILE LEGATE. O linie fara produs n-are ce sa scada, si a scadea „ceva”
 * pentru ea ar fi mai rau decat a nu scadea nimic.
 */
async function consumaStocul(admin: Db, businessId: string, orderId: string, legate: LinieLegata[]): Promise<void> {
  const peProdus = new Map<string, number>();
  const peVarianta = new Map<string, { product_id: string; variant_title: string; quantity: number }>();

  for (const l of legate) {
    if (!l.productId) continue;
    peProdus.set(l.productId, (peProdus.get(l.productId) ?? 0) + l.linie.cantitate);
    if (l.variantTitle) {
      const cheie = `${l.productId}::${l.variantTitle}`;
      const e = peVarianta.get(cheie);
      if (e) e.quantity += l.linie.cantitate;
      else peVarianta.set(cheie, { product_id: l.productId, variant_title: l.variantTitle, quantity: l.linie.cantitate });
    }
  }

  const { data, error } = await admin.rpc("consuma_stoc_comanda_marketplace", {
    p_order_id: orderId,
    p_business_id: businessId,
    p_produse: [...peProdus.entries()].map(([product_id, quantity]) => ({ product_id, quantity })) as never,
    p_variante: [...peVarianta.values()] as never,
  });

  const r = data as { gasit?: boolean; deja?: boolean; lipsa?: unknown[] } | null;
  if (error || r?.gasit !== true) {
    /*
     * ⚠ NU SE ARUNCA. Comanda e deja scrisa si trebuie sa ramana: o exceptie aici ar
     * face ruta sa raspunda cu esec, Pepita ar retrimite, si retrimiterea ar intra pe
     * ramura de duplicat, care cheama tot asta. Se scrie in jurnal, iar reincercarea
     * comerciantului sau o retrimitere din panoul lor duce treaba la capat.
     */
    await logError({
      action: "pepita/stoc",
      message: error?.message ?? "consumul de stoc n-a raspuns valid",
      details: { orderId, raspuns: r }, businessId, severity: "critical",
    });
    return;
  }

  if (!r.deja && Array.isArray(r.lipsa) && r.lipsa.length > 0) {
    await logError({
      action: "pepita/stoc",
      message: "comanda Pepita a cerut mai mult stoc decât exista; s-a scăzut cât s-a putut",
      details: { orderId, lipsa: r.lipsa }, businessId, severity: "warning",
    });
  }

  /*
   * ⚠ SI CELELALTE CANALE. Stocul tocmai s-a schimbat, iar eMAG, Trendyol, About You,
   * OLX si Google Merchant il au inca pe cel vechi si continua sa-l vanda.
   * `impingeStoculPeCeleLalteCanale` nu arunca niciodata.
   */
  if (!r.deja) {
    await impingeStoculPeCeleLalteCanale(businessId, [...peProdus.keys()], "pepita");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORMELE SCRISE PE COMANDA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Firma cumparatoare, cand comanda e pe firma.
 *
 * ⚠ FARA EA, o comanda pe firma s-ar factura pe persoana fizica. Documentul ar fi gresit,
 * iar o factura fiscala gresita nu se retrage, se storneaza.
 *
 * ⚠ `verified: false`, si asta e ADEVARUL, nu o scapare: `parseBillingCompany` il pune pe
 * fals dinadins, iar noi NU intrebam ANAF aici. Ruta asta trebuie sa raspunda repede, si o
 * cerere catre un serviciu al statului pe calea de ingest ar fi pus soarta comenzii in
 * mainile disponibilitatii lui. Panoul arata atunci „date neconfirmate la ANAF", ceea ce e
 * exact ce trebuie sa vada comerciantul inainte sa emita factura.
 *
 * ⚠ PREFIXUL „RO" E SINGURUL MARTOR pe care il avem despre calitatea de platitor de TVA, si
 * e martorul obisnuit: in Romania codul se scrie cu prefix tocmai cand firma e inregistrata
 * in scopuri de TVA. Nu e o garantie, si de aceea nu se pretinde ca ar fi una.
 *
 * Cand codul nu trece verificarea de CUI, se intoarce `null`: pusa pe factura, o denumire
 * fara un cod valid e mai rea decat lipsa ei.
 */
function firmaCumparatoare(c: ComandaPepita): BillingCompany | null {
  const cod = c.client.codFiscal;
  if (!cod) return null;
  const f = c.client.facturare;
  return parseBillingCompany({
    cui: cod,
    company_name: f.nume ?? [c.client.prenume, c.client.nume].filter(Boolean).join(" "),
    address: f.strada ?? [f.numeStrada, f.numar].filter(Boolean).join(" "),
    city: f.oras ?? "",
    county: "",
    reg_com: "",
    vat_payer: /^\s*ro/i.test(cod),
  });
}

function adresaLivrare(c: ComandaPepita): Record<string, unknown> {
  const l = c.client.livrare;
  const f = c.client.facturare;
  /*
   * ⚠ ADRESA SE NORMALIZEAZA la numele pe care le citeste restul aplicatiei
   * (`address`, `city`, `county`, `postal_code`, `country`). Copiata cu numele lor,
   * ar fi trecut de tipuri si de baza, si ar fi aparut GOALA pe AWB si pe factura.
   *
   * ⚠ STRADA: `shipping_street` e deja „strada, numar”, iar celelalte doua sunt
   * bucatile ei. Se ia intregul cand exista; altfel se lipesc bucatile. Lipite
   * mereu peste intreg, ar fi iesit „Str. Teszt 14 Teszt u. 14”.
   */
  const strada = l.strada ?? ([l.numeStrada, l.numar].filter(Boolean).join(" ") || null);
  return {
    address: strada ?? "",
    city: l.oras ?? "",
    county: l.judet ?? "",
    postal_code: l.codPostal ?? "",
    country: l.tara ?? "",
    source: "pepita",
    /* Brutul ramane langa: nu strica nimic si pastreaza ce n-am tradus. */
    pepita: {
      livrare: l,
      facturare: f,
    },
  };
}

/**
 * Ce se scrie in `order_source`.
 *
 * ⚠ `marketplace: "pepita"` E CHEIA DE CARE ATARNA TOT RESTUL: eticheta din lista de
 * comenzi, filtrele, si pazele de marketing. Fara ea, comanda ar arata exact ca una
 * din magazinul propriu.
 */
function sursaComenzii(c: ComandaPepita, ctx: ContextIngest): Record<string, unknown> {
  return {
    marketplace: "pepita",
    order_number: c.externalId,
    origin: c.origine,
    /* ⚠ Data lor, ca sir. Vezi nota din `comanda-forma.ts`: nu se converteste. */
    pepita_date: c.dataBruta,
    pepita_payment_mode: c.modPlata,
    pepita_payment_status: c.starePlata,
    pepita_delivery_mode: c.modLivrare,
    pepita_status: c.status,
    /*
     * ⚠ CINE IA BANII, hotarat AICI si scris pe comanda, nu dedus mai tarziu.
     *
     * `rambursDeIncasat` il citeste la fiecare emitere de AWB. Dedus acolo, regula ar fi
     * atarnat de o traducere care se poate schimba la ei fara sa ne spuna nimeni, iar o
     * comanda deja intrata si-ar fi schimbat intelesul sub picioare.
     *
     * Pentru Pepita Delivery (GLS), rambursul ajunge la ei: comerciantul nu are ce incasa
     * la usa, iar precompletat ar fi cerut clientului a doua oara aceiasi bani.
     */
    incaseaza_marketplace: incaseazaPepita(c.modPlata, c.modLivrare),
    livrare_pepita: esteLivrarePepita(c.modLivrare),
    ...(c.voucher > 0 ? { voucher: round2(c.voucher) } : {}),
    ...(c.client.codFiscal ? { tax_number: c.client.codFiscal } : {}),
    /*
     * ⚠ MONEDA SE SCRIE MEREU. `orders.total` e citit peste tot ca lei, iar facturarea
     * automata se opreste singura cand vede alta moneda. O comanda in HUF fara semn ar
     * fi fost facturata ca lei, iar o factura fiscala gresita nu se retrage, se storneaza.
     */
    currency: (c.linii.find((l) => l.moneda)?.moneda ?? c.monedaTransport ?? ctx.moneda).toUpperCase(),
  };
}

/**
 * Notele interne: ce trebuie sa afle comerciantul cand deschide comanda.
 *
 * ⚠ AICI SE SPUNE SI CE NU FACEM. Statusul nu pleaca inapoi la Pepita, fiindca nu
 * exista prin ce. Scris in comanda, omul afla exact acolo unde ar apasa gresit.
 */
function noteInterne(c: ComandaPepita, nelegate: string[]): string {
  const randuri: string[] = [
    `Comandă Pepita ${c.externalId}${c.origine ? ` (${c.origine})` : ""}.`,
    `Plată: ${etichetaPlata(c.modPlata)}. Livrare aleasă la Pepita: ${etichetaLivrare(c.modLivrare)}.`,
    "Confirmarea și statusul comenzii se operează în Pepita Admin: nu există legătură prin care Edinio să le trimită.",
  ];
  /*
   * ⚠ CINE INCASEAZA, SPUS PE COMANDA. Fara randul asta, comerciantul vede „Ramburs la
   * curier" si emite un AWB cu ramburs, iar clientul plateste de doua ori: o data
   * curierului Pepita si o data al lui.
   */
  if (esteLivrarePepita(c.modLivrare)) {
    randuri.push(
      "⚠ Livrare Pepita: coletul e dus de GLS-ul contractat de Pepita, nu de curierul tău. "
      + (c.modPlata === "cod"
        ? "Rambursul îl încasează Pepita și îți vine în decontarea lor, deci NU pune ramburs pe niciun AWB propriu."
        : "Nu ai ce încasa la livrare."),
    );
  } else if (c.modPlata === "transfer") {
    randuri.push("Plata prin transfer ajunge direct la tine, în avans. Nu se încasează nimic la livrare.");
  }
  if (c.mesajCurier) randuri.push(`Mesaj pentru curier: ${c.mesajCurier}`);
  if (c.client.codFiscal) randuri.push(`Cod fiscal cumpărător: ${c.client.codFiscal} (neverificat la ANAF).`);
  if (!modPlataCunoscut(c.modPlata)) {
    randuri.push(`⚠ Mod de plată necunoscut („${c.modPlata ?? "lipsă"}”). Verifică dacă banii au fost încasați înainte de expediere.`);
  }
  if (!modLivrareCunoscut(c.modLivrare)) {
    randuri.push(`⚠ Mod de livrare necunoscut („${c.modLivrare ?? "lipsă"}”). Alege curierul manual.`);
  }
  if (nelegate.length > 0) {
    randuri.push(`⚠ Linii fără corespondent în catalog: ${nelegate.join(", ")}. Verifică ce s-a vândut înainte de expediere; stocul lor NU a fost scăzut.`);
  }
  return randuri.join("\n");
}

/**
 * Ce se pastreaza in `pepita_comenzi.rezumat`.
 *
 * ⚠ FARA DATE PERSONALE. Tabela e de diagnostic, iar diagnosticul nu are nevoie de
 * numele, telefonul, emailul sau adresa cumparatorului. Ele stau pe comanda, unde le
 * cere treaba, si se sterg cu ea.
 */
export function rezumatSigur(c: ComandaPepita): Record<string, unknown> {
  return {
    linii: c.linii.map((l) => ({ sku: l.sku, id: l.idPepita, cantitate: l.cantitate, pret: l.pret, tva: l.tva })),
    plata: c.modPlata,
    stare_plata: c.starePlata,
    livrare: c.modLivrare,
    transport: c.transport,
    voucher: c.voucher,
    data: c.dataBruta,
    tara_livrare: c.client.livrare.tara,
    /* Judetul e o categorie, nu o identificare, si e singurul lucru geografic util aici. */
    judet_livrare: c.client.livrare.judet,
  };
}
