import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { createHash } from "node:crypto";
import { areEticheta, citesteEticheta, salveazaEticheta } from "./eticheta";
import { impingeStoculPeCeleLalteCanale } from "@/lib/marketplace/stoc-pe-canale";
import { combinatiiActiveUnice, parseVariants } from "@/lib/storefront/variants";
import { parseBillingCompany, type BillingCompany } from "@/lib/billing/company";
import { coteleLiniilor, type CoteleLiniilor } from "@/lib/billing/cote-pe-linii";
import { desfaIdArticol } from "./identitate";
import { identitateCombinatie } from "@/lib/storefront/variante-identitate";
import {
  esteLivrarePepita, incaseazaPepita, metodaPlata, modLivrareCunoscut, modPlataCunoscut,
  starePlata, statusInitial, etichetaLivrare, etichetaPlata,
} from "./mapare";
import type { ComandaPepita, LiniePepita } from "./comanda-forma";
import {
  compuneMotiv, lipsuriComandaScrisa, lipsuriLivrare, motivCoduri, motiveNerecalculabile,
  motivNelivrabila, INCEPUT_CODURI, INCEPUT_NELIVRABILA,
} from "./carantina";

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

/**
 * Motivul scris pe randul de evidenta cand stocul n-a apucat sa scada.
 *
 * ⚠ E SI CHEIA REPARATIEI: cronul `pepita-stoc` cauta exact comenzile astea. Schimbat aici
 * fara sa se schimbe si acolo, reparatia n-ar mai gasi nimic si ar tace la nesfarsit.
 */
export const MOTIV_STOC_NEFACUT = "Stocul nu s-a putut scădea. Se reîncearcă automat.";

/**
 * ⚠ ALTA MONEDA DECAT A MAGAZINULUI.
 *
 * `orders.total` e citit ca lei peste tot: pe AWB, in ramburs, in rapoarte. O comanda in HUF
 * lasata sa treaca drept „importata" ar fi produs un AWB cu ramburs in cifra ungureasca si o
 * factura in lei pe o suma care nu e in lei. Comanda intra oricum, fiindca e o vanzare
 * adevarata; ce se opreste e trecerea ei tacuta mai departe.
 */
export const MOTIV_MONEDA_STRAINA = "Comandă în altă monedă decât magazinul. Verific-o înainte de expediere și de facturare.";

/**
 * ⚠ NE-AU SPUS CEVA DESPRE BANI SI N-AM INTELES.
 *
 * Deosebit de „n-au trimis moneda", care e in regula pe pietele unde ei n-o trimit. Aici a
 * venit un cod si nu s-a putut citi, deci a pune in loc moneda magazinului ar fi o presupunere
 * despre bani, luata tacut.
 */
export const MOTIV_MONEDA_NECITITA = "Moneda comenzii a venit într-o formă pe care nu am putut-o citi. Verifică suma înainte de expediere și de facturare.";

export type StareIngest =
  | "creata"
  | "duplicat"
  | "carantina"
  /**
   * ⚠ Comanda E scrisa, dar stocul NU s-a scazut.
   *
   * Se raporteaza ca ESEC catre Pepita, dinadins. Cele doua greseli posibile nu costa la fel:
   * spus „a mers", ei n-au niciun motiv sa retrimita, iar stocul nostru ramane umflat si se
   * vinde marfa inexistenta pe celelalte cinci canale. Spus „n-a mers", o retrimitere intra
   * pe ramura de duplicat, care duce consumul la capat, si nu se creeaza nimic de doua ori.
   */
  | "stoc-nefacut"
  | "respinsa"
  | "esec";

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
  /*
   * ⚠ `product_id` POATE FI `null`, si asta NU e o scapare: cheia straina catre `products` e
   * `on delete set null`, tocmai ca randul sa supravietuiasca stergerii produsului. Un `<Id>`
   * plecat in feed ramane la Pepita orice am face noi, deci randul e singura dovada ca articolul
   * e inca la vanzare acolo. Vezi `2027-01-01-pepita-articolul-ramane-orfan.sql`.
   */
  const evidenta = new Map<string, { product_id: string | null; combinatie: string }>();
  const codurile = [...new Set(linii.flatMap((l) => [l.sku, l.idPepita]).filter((x): x is string => !!x))];
  if (codurile.length > 0) {
    for (let i = 0; i < codurile.length; i += 200) {
      const { data, error } = await admin
        .from("pepita_articole").select("articol_id, product_id, combinatie")
        .eq("business_id", businessId).in("articol_id", codurile.slice(i, i + 200));
      if (error) throw error;
      for (const r of (data ?? []) as { articol_id: string; product_id: string | null; combinatie: string }[]) {
        evidenta.set(r.articol_id, { product_id: r.product_id, combinatie: r.combinatie });
      }
    }
  }

  const productIds = [...new Set([
    ...idDupaLinie.filter((x) => x != null).map((x) => x!.productId),
    /* ⚠ Orfanii se STRECOARA AICI. Un `null` ajuns in `.in("id", ...)` ar cere lui PostgREST un
       produs cu identificatorul „null" si ar strica interogarea pentru TOATE liniile comenzii,
       nu doar pentru cea orfana. */
    ...[...evidenta.values()].map((v) => v.product_id).filter((x): x is string => !!x),
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

    const produs = (scris?.product_id ? dupaId.get(scris.product_id) : undefined)
      ?? (desfacut ? dupaId.get(desfacut.productId) : undefined)
      ?? (linie.sku ? dupaSku.get(linie.sku) : undefined);

    if (!produs) {
      /*
       * ⚠ DOUA FELURI DE „NU S-A GASIT", si nu se spun la fel.
       *
       * Cand evidenta are randul dar `product_id` e gol, stim exact ce s-a intamplat: produsul a
       * fost STERS din Edinio dupa ce `<Id>`-ul plecase in feed. Pana la
       * `on delete set null` randul disparea odata cu produsul, deci si cazul asta ajungea la
       * „cod necunoscut" — iar comerciantul nu avea de unde sa inceapa cautarea.
       *
       * Deosebirea conteaza fiindca leacul e altul: la un cod necunoscut se cauta greseala in
       * potrivire, aici nu mai e nimic de potrivit si singurul lucru de facut e sa ceri Pepitei
       * scoaterea articolului.
       */
      nelegate.push(scris && scris.product_id === null
        ? `${linie.sku ?? "(fara cod)"} (produsul a fost șters din catalog${scris.combinatie ? `, varianta „${scris.combinatie}”` : ""})`
        : linie.sku ?? linie.idPepita ?? "(fara cod)");
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
      /*
       * ═══ ⚠ DOUA INCERCARI, IN ORDINEA ASTA — SI A DOUA LIPSEA (09.09.2026) ═══
       *
       * 1. NUMELE SCRIS in evidenta, cand exista. E martorul cel mai bun: spune ce combinatie a
       *    plecat chiar sub `<Id>`-ul asta.
       * 2. IDENTITATEA, adica `uid`-ul din care s-a derivat `<Id>`-ul.
       *
       * ⚠ Pana azi, cand exista un nume scris, a doua nici nu se incerca: `titluCautat ? … : …`.
       * Deci o combinatie REDENUMITA ducea comanda in carantina, cu stocul nescazut, chiar daca
       * `<Id>`-ul ei era neschimbat si identitatea o gasea imediat. Numele se invecheste, `uid`-ul
       * nu — de aceea numele se incearca primul, dar niciodata singur.
       *
       * ⚠ Si evidenta se actualizeaza acum la fiecare feed (vezi `tineMinteArticolele`), deci
       * fereastra in care numele scris e vechi tine cel mult o zi. Rezerva de aici o inchide de
       * tot: chiar si in ziua aia, comanda se leaga.
       */
      variantTitle = (titluCautat
        ? combinatii.find((c) => c.title === titluCautat)?.title ?? null
        : null)
        ?? (desfacut?.amprenta
          ? combinatii.find((c) => identitateCombinatie(c) === desfacut.amprenta)?.title ?? null
          : null);
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

/**
 * Pune deoparte eticheta de colet trimisa de ei, daca a venit.
 *
 * ═══ ⚠ NU RUPE INGESTUL, NICIODATA ═══
 *
 * O eticheta nesalvata nu are voie sa se transforme in 503 catre Pepita. Raspunsul acela le cere
 * sa retrimita, iar retrimiterea e un buton apasat de om: comanda ar ramane in aer pentru un PDF.
 * Marfa si banii sunt in comanda; eticheta e o comoditate, si se poate cere din panoul lor.
 *
 * ⚠ SI O ETICHETA REA SE SPUNE, nu se inghite. Un PDF care nu e PDF, sau unul peste plafon, e
 * ceva ce comerciantul trebuie sa poata afla cand se intreaba de ce nu poate tipari nimic. Nu
 * intra insa in motivul de CARANTINA: comanda e buna, marfa poate pleca, doar hartia lipseste.
 *
 * ⚠ SE CHEAMA DUPA ce randul are `order_id`, fiindca cheia din depozit se compune din comanda.
 * Chemata inainte, ar fi scris sub un identificator care inca nu exista.
 *
 * ⚠ INTOARCE CE S-A INTAMPLAT, si asta e chiar reparatia din 09.09.2026: vezi `StareEticheta`.
 */
async function pastreazaEticheta(
  businessId: string, orderId: string, c: ComandaPepita,
  /**
   * Amprenta etichetei aflate DEJA in depozit, sau `null` cand nu se stie.
   *
   * ═══ ⚠ DE CE AMPRENTA, SI NU „EXISTA CEVA ACOLO" ═══
   *
   * Pana pe 09.09.2026 intrebarea era „mai e o eticheta in depozit?", si daca da nu se mai scria
   * nimic. Bun cat timp retrimiterea insemna „aceeasi comanda, inca o data".
   *
   * ⚠ DAR IN ACEEASI ZI RETRIMITEREA A INCEPUT SA REIMPROSPATEZE DESTINATARUL, si cele doua
   * hotarari s-au ciocnit: comanda vine cu adresa B si cu eticheta B, noi scriam adresa B si
   * PASTRAM eticheta A. Panoul arata o adresa, PDF-ul tiparit alta — iar coletul pleaca dupa PDF.
   * Adica exact paguba pe care poarta din editor o inchisese cu o ora inainte, intrata pe alta usa.
   *
   * Acum se compara CONTINUTUL: amprenta egala inseamna aceeasi eticheta, si atunci nu se scrie
   * (si nici nu se mai plateste un HEAD). Amprenta diferita inseamna eticheta NOUA, si o
   * inlocuieste pe cea veche — scrierea e pe aceeasi cheie, deci chiar o inlocuieste.
   *
   * ⚠ AMPRENTA EGALA MAI FACE UN HEAD, si nu e de prisos: obiectul poate lipsi din depozit desi
   * amprenta e scrisa (o stergere, o pana). Fara el, o eticheta disparuta n-ar mai fi rescrisa
   * niciodata. Costa exact cat costa si pana azi.
   */
  shaCunoscut: string | null = null,
): Promise<{ stare: StareEticheta; sha?: string }> {
  const citita = citesteEticheta(c.etichetaBruta);
  if (citita.fel === "lipsa") return { stare: "lipsa" };

  if (citita.fel === "rea") {
    await logError({
      action: "pepita/eticheta",
      message: `eticheta primita nu s-a putut folosi: ${citita.motiv}`,
      details: { externalId: c.externalId, orderId }, businessId, severity: "warning",
    });
    return { stare: "nevalida" };
  }

  const sha = createHash("sha256").update(citita.octeti).digest("hex");
  if (shaCunoscut && shaCunoscut === sha) {
    try {
      if (await areEticheta(businessId, orderId)) return { stare: "salvata", sha };
    } catch {
      /*
       * ⚠ DEPOZITUL CAZUT LA INTREBARE NU OPRESTE INCERCAREA. Daca nu putem afla daca eticheta e
       * acolo, scrierea de mai jos e ieftina si idempotenta (aceeasi cheie, acelasi continut),
       * iar renuntarea ar fi insemnat sa pastram gaura tocmai in ziua in care depozitul are
       * probleme — adica exact ziua in care s-a pierdut.
       */
    }
  }

  /*
   * ⚠ SE MAI INCEARCA DE DOUA ORI, cu pauze scurte.
   *
   * O cadere de cateva secunde a depozitului nu e acelasi lucru cu o cadere adevarata, iar pana
   * acum amandoua duceau in acelasi loc: eticheta pierduta pana cand cineva apasa „Resend order"
   * la ei. Trei incercari peste opt sute de milisecunde acopera exact felul de intrerupere care
   * se repara singura, si nu tin cererea lor ocupata destul cat sa conteze.
   *
   * ⚠ SCRIEREA E IDEMPOTENTA: aceeasi cheie, aceiasi octeti. O incercare care de fapt reusise si
   * a raportat esec nu strica nimic la a doua.
   */
  let ultima: unknown = null;
  for (let i = 0; i < INCERCARI_DEPOZIT; i++) {
    try {
      await salveazaEticheta(businessId, orderId, citita.octeti);
      return { stare: "salvata", sha };
    } catch (e) {
      ultima = e;
      const pauza = PAUZA_DEPOZIT_MS[i];
      if (pauza != null) await new Promise((r) => setTimeout(r, pauza));
    }
  }

  await logError({
    action: "pepita/eticheta",
    message: `eticheta nu s-a putut pastra dupa ${INCERCARI_DEPOZIT} incercari: `
      + `${ultima instanceof Error ? ultima.message : String(ultima)}. `
      + "Se reincearca la urmatoarea retrimitere din panoul Pepita („Resend order”).",
    details: { externalId: c.externalId, orderId, octeti: citita.octeti.length },
    businessId, severity: "warning",
  });
  return { stare: "depozit-cazut" };
}

/**
 * Scrie starea etichetei pe randul de evidenta.
 *
 * ═══ ⚠ „LIPSA" SE SCRIE DOAR LA PRIMA SOSIRE ═══
 *
 * „Lipsa" inseamna doua lucruri deodata: ei n-au trimis nimic SI in depozit nu e nimic. A doua
 * jumatate se stie sigur numai la prima sosire, unde comanda tocmai s-a nascut.
 *
 * La o retrimitere nu se stie: Pepita poate trimite comanda fara `package_label` desi eticheta a
 * fost primita si salvata cu prima ocazie. Scrisa atunci, „lipsa" ar fi sters chiar dovada ca
 * exista — si asta pe randul unei comenzi pe care comerciantul tocmai o pregateste de expediat.
 *
 * ⚠ Celelalte trei stari se scriu de pe amandoua drumurile: fiecare dintre ele s-a aflat CHIAR
 * acum, si e mai proaspata decat ce era scris.
 */
async function scrieStareaEtichetei(
  admin: Db, randId: string, r: { stare: StareEticheta; sha?: string }, primaSosire: boolean,
): Promise<void> {
  if (r.stare === "lipsa" && !primaSosire) return;
  try {
    const { error } = await admin.from("pepita_comenzi")
      .update({
        eticheta_stare: r.stare,
        eticheta_la: new Date().toISOString(),
        /*
         * ⚠ AMPRENTA SE SCRIE DOAR CAND CHIAR E UNA. Pe „depozit-cazut" nu exista nimic in
         * depozit, deci scrisa ar fi spus la urmatoarea retrimitere „o avem deja" despre o
         * eticheta pierduta — si n-ar mai fi fost rescrisa niciodata.
         */
        ...(r.sha ? { eticheta_sha256: r.sha } : {}),
      } as never)
      .eq("id", randId);
    if (error) throw error;
  } catch (e) {
    /* ⚠ Un semn nescris nu are voie sa rastoarne comanda. Eticheta e deja acolo (sau nu e). */
    await logError({
      action: "pepita/eticheta",
      message: `starea etichetei nu s-a putut scrie: ${e instanceof Error ? e.message : String(e)}`,
      details: { randId, stare: r.stare }, severity: "warning",
    });
  }
}

function numeDeRezerva(l: LiniePepita): string {
  return l.sku ? `Produs Pepita ${l.sku}` : "Produs Pepita";
}

/**
 * Ce s-a intamplat cu eticheta lor, in patru cuvinte.
 *
 * ⚠ „N-AU TRIMIS" SI „AM PIERDUT-O" NU SUNT ACELASI LUCRU, si pana pe 09.09.2026 aratau identic:
 * eticheta lipsea din depozit, si atat. Prima nu cere nimic de la comerciant (livrare cu curierul
 * lui); a doua ii cere sa apese „Resend order" in panoul Pepita, si n-avea de unde sti.
 */
export type StareEticheta = "lipsa" | "salvata" | "nevalida" | "depozit-cazut";

/** Cate incercari de scriere in depozit, si cat se asteapta intre ele. */
const INCERCARI_DEPOZIT = 3;
const PAUZA_DEPOZIT_MS = [200, 600];

/**
 * Destinatarul si adresa, rescrise din sarcina RETRIMISA.
 *
 * ═══ ⚠ NUMAI LA PEPITA DELIVERY, SI DE CE TOCMAI ACOLO ═══
 *
 * La `livrare_pepita` coletul pleaca cu eticheta PDF facuta de EI, pentru adresa din comanda LOR.
 * Deci acolo adresa adevarata e a lor, iar panoul nostru n-are ce corecta: schimbata in Edinio,
 * am fi aratat o adresa la care coletul nu ajunge. De aceea editarea locala e inchisa (vezi
 * `updateOrderDetails`) — si tocmai de aceea „Resend order" trebuie sa CHIAR aduca datele noi,
 * altfel poarta ar fi un „nu" fara nicio urmare.
 *
 * ⚠ PE CELELALTE COMENZI PEPITA NU SE ATINGE NIMIC. Acolo expediaza comerciantul, cu curierul
 * lui, iar panoul e chiar locul unde se corecteaza o adresa gresita — vezi nota interna scrisa de
 * `lipsuriLivrare`. Rescrisa la fiecare retrimitere, corectura lui ar fi fost stearsa.
 *
 * ⚠ SI NU STERGE CHEILE PUSE DE NOI peste adresa (curier, punct de ridicare, eticheta): se
 * imbina, nu se inlocuieste. La Pepita Delivery ele n-ar trebui sa existe — AWB-ul propriu e
 * inchis — dar o comanda veche le poate avea, si stergerea lor ar rupe ecranul de expediere.
 */
async function improspateazaDestinatarul(
  admin: Db, businessId: string, orderId: string, c: ComandaPepita,
): Promise<void> {
  try {
    const { data: vechi } = await admin
      .from("orders").select("shipping_address")
      .eq("id", orderId).eq("business_id", businessId).maybeSingle();
    const prev = ((vechi as { shipping_address?: unknown } | null)?.shipping_address ?? {}) as Record<string, unknown>;

    const { error } = await admin.from("orders").update({
      customer_name: numeleClientului(c),
      customer_phone: c.client.telefon || "",
      customer_email: c.client.email,
      shipping_address: { ...prev, ...adresaLivrare(c) } as never,
    } as never).eq("id", orderId).eq("business_id", businessId);
    if (error) throw error;
  } catch (e) {
    /*
     * ⚠ NU RUPE RETRIMITEREA. Ea mai duce la capat stocul, carantina si eticheta; o adresa
     * nerescrisa inseamna ca a ramas cea de dinainte, adica exact ce era si pana azi.
     */
    await logError({
      action: "pepita/destinatar",
      message: `datele destinatarului nu s-au putut reimprospata: ${e instanceof Error ? e.message : String(e)}`,
      details: { orderId, externalId: c.externalId }, businessId, severity: "warning",
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   INGESTUL
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ContextIngest {
  businessId: string;
  /**
   * Moneda in care lucreaza MAGAZINUL (`store_settings.currency`), nu a pietei Pepita.
   *
   * ⚠ REDENUMIT DINADINS. Se chema `moneda` si era moneda pietei configurate; de ea atarna
   * acum si hotararea „comanda asta e in alta moneda decat magazinul". Lasat cu numele vechi,
   * fiecare apelant ar fi trecut neatins peste schimbarea de INTELES, iar `tsc` ar fi tacut.
   */
  monedaMagazin: string;
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
      .from("pepita_comenzi").select("id, order_id, stare, incercari, eticheta_sha256")
      .eq("business_id", ctx.businessId).eq("external_order_id", c.externalId).maybeSingle();
    if (eCitire) throw eCitire;
    const rand = vechi as {
      id: string; order_id: string | null; stare: string; incercari: number;
      /* ⚠ Ceruta ANUME: fara ea nicio retrimitere n-ar mai sti ca eticheta primita e ACEEASI, si
         ar rescrie PDF-ul la fiecare sosire. Vezi `pastreazaEticheta`. */
      eticheta_sha256: string | null;
    } | null;
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
      /*
       * ═══ ⚠ SI ETICHETA SE MAI INCEARCA O DATA ═══
       *
       * Aici era o gaura pe care am facut-o chiar eu, cu o zi inainte: la prima sosire,
       * `pastreazaEticheta` inghite o cadere a depozitului si merge mai departe — corect, o
       * comanda nu se pierde pentru un PDF. Dar atunci eticheta era pierduta DEFINITIV: singurul
       * loc unde mai exista Base64-ul e chiar sarcina utila, iar noi n-o pastram (are date
       * personale). Retrimiterea lor, singura care aduce sarcina inapoi, nici nu incerca.
       *
       * Deci Pepita ne dadea eticheta, noi o pierdeam, si integrarea raporta ca totul e bine.
       *
       * ⚠ SI DE PE 09.09.2026 SE COMPARA AMPRENTA, nu doar existenta. O retrimitere identica nu
       * scrie nimic si nu plateste nicio cerere de retea; una care aduce ALTA eticheta o
       * inlocuieste pe cea veche. Vezi nota lunga de la `pastreazaEticheta`: fara asta, comanda
       * ar fi ajuns cu adresa noua pe ecran si cu eticheta veche in imprimanta.
       */
      await scrieStareaEtichetei(
        admin, rand.id,
        await pastreazaEticheta(ctx.businessId, rand.order_id, c, rand.eticheta_sha256 ?? null),
        false,
      );

      /*
       * ⚠ SI DATELE DESTINATARULUI, la Pepita Delivery. Acolo panoul nu le mai lasa corectate
       * local, fiindca eticheta lor e deja tiparita pentru adresa lor. Vezi
       * `improspateazaDestinatarul`.
       *
       * ⚠ SE FACE PENTRU CA E CORECT, nu fiindca ei ar promite-o: documentatia lor descrie
       * transmiterea intr-o singura directie, iar „Resend order" ca pe o reincercare dupa un esec
       * tehnic. Noi ne pregatim ca sarcina sa poata veni schimbata; pe ecran insa NU se scrie ca
       * ar fi o cale garantata de resincronizare. Vezi mesajul din `updateOrderDetails`.
       */
      if (esteLivrarePepita(c.modLivrare)) {
        await improspateazaDestinatarul(admin, ctx.businessId, rand.order_id, c);
      }

      /*
       * ⚠ O COMANDA IN CARANTINA SE INCEARCA DIN NOU, INTREAGA.
       *
       * Pana acum ramura asta chema doar `consumaStocul`, care raspunde „deja" cand marcajul e
       * pus. Deci o comanda pusa in carantina fiindca un produs lipsea din catalog ramanea
       * acolo si dupa ce comerciantul crea produsul si apasa „Resend order" in panoul lor:
       * singura cale de iesire era butonul din Edinio. Acum retrimiterea face exact ce face
       * butonul, prin ACEEASI functie, ca sa nu existe doua adevaruri despre aceeasi comanda.
       */
      if (rand.stare === "carantina") {
        const r = await reproceseaza(admin, ctx, c.externalId);
        if (r.stocEsuat) {
          return { stare: "stoc-nefacut", orderId: rand.order_id, mesaje: ["Comanda este salvată, dar procesarea nu s-a încheiat."] };
        }
        return { stare: "duplicat", orderId: rand.order_id, mesaje: [r.mesaj] };
      }

      const legate = await leagaLiniile(admin, ctx.businessId, c.linii);
      /*
       * ⚠ AICI SE REPARA ce a ramas nefacut la prima sosire: `consuma_stoc_comanda_marketplace`
       * e idempotenta, deci pe drumul obisnuit nu face nimic, iar dupa un esec duce treaba la
       * capat. Daca pica si acum, verdictul urca, si retrimiterea urmatoare mai incearca o data.
       */
      const verdict = await consumaStocul(admin, ctx.businessId, rand.order_id, legate.legate);
      if (verdict === "esec") {
        return { stare: "stoc-nefacut", orderId: rand.order_id, mesaje: ["Comanda este salvată, dar procesarea nu s-a încheiat."] };
      }
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

  const items = legate.map((l) => ({
    product_id: l.productId,
    name: l.nume,
    price: round2(l.linie.pret),
    quantity: l.linie.cantitate,
    /*
     * ⚠ COTA RAMANE PE LINIE, nu doar in socoteala de mai sus.
     *
     * Pepita trimite TVA pe FIECARE produs, iar in Romania cotele chiar difera: hrana are
     * 11%, restul 21%. Pastrata numai ca `orders.vat_rate`, adica un singur numar, informatia
     * se pierdea si nimic nu mai putea sti ca a fost o comanda cu cote amestecate.
     *
     * ⚠ Scrisa aici, ea NU schimba singura felul in care factureaza Edinio, care tot cu o
     * cota emite. Dar face ca amestecul sa poata fi VAZUT, iar emiterea automata sa se poata
     * opri in loc sa scoata un document fiscal gresit.
     */
    ...(l.linie.tva != null ? { vat_rate: l.linie.tva } : {}),
    ...(l.variantTitle ? { variant_title: l.variantTitle } : {}),
    ...(l.linie.sku ? { sku: l.linie.sku } : {}),
  }));

  /*
   * ⚠ COTA COMENZII NU MAI E `max(cote)`.
   *
   * `max` supra-taxeaza TOATE liniile, si o face tacut: pe o comanda cu 11% si 21%, cele de
   * 11% ar fi fost facturate cu 21%. Cand chiar trebuie ales un singur numar, se alege cota
   * liniei cu valoarea cea mai mare, fiindca aduce totalul cel mai aproape de adevar. Iar cand
   * cotele difera, factura automata nu mai pleaca deloc: vezi `maybeAutoInvoice`.
   */
  const cote = coteleLiniilor(items);

  /*
   * ⚠ CE LIPSESTE CA SA POATA FI EXPEDIATA. Se socoteste o data si se foloseste in trei
   * locuri: starea randului de evidenta, nota interna a comenzii si raspunsul catre ei.
   */
  const lipsuri = lipsuriLivrare(c);

  /*
   * ⚠ Moneda comenzii e deja dovedita coerenta la citire: aici se compara doar cu a
   * magazinului. Lipsa ei nu e o abatere, e o piata unde ei n-o trimit.
   */
  const monedaComenzii = c.moneda ?? c.monedaTransport;
  const monedaStraina = monedaComenzii != null && monedaComenzii.toUpperCase() !== ctx.monedaMagazin.toUpperCase();

  const numeClient = numeleClientului(c);

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
    vat_rate: cote.cotaDominanta,
    /*
     * ⚠ SUMELE DE MAI SUS SUNT BRUTE, si asta se SCRIE, nu se deduce mai tarziu din setarea de
     * atunci a magazinului. Pe un magazin cu preturi fara TVA, facturarea le-ar fi citit ca nete
     * si ar fi adaugat cota deasupra. Vezi `invoiceVat`.
     */
    prices_include_vat: true,
    status: statusInitial(),
    payment_method: metodaPlata(c.modPlata, c.modLivrare),
    payment_status: starePlata(c.starePlata, c.modPlata),
    notes: c.mesajClient,
    internal_notes: noteInterne(c, nelegate, cote, lipsuri, monedaStraina ? ctx.monedaMagazin : null),
    billing_company: firmaCumparatoare(c) as never,
    order_source: sursaComenzii(c, ctx, cote) as never,
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
  const motivNelegate = motivCoduri(nelegate);
  const motivLipsuri = motivNelivrabila(lipsuri);
  const motivMoneda = compuneMotiv([
    monedaStraina ? MOTIV_MONEDA_STRAINA : null,
    c.monedaNevalida ? MOTIV_MONEDA_NECITITA : null,
  ]);
  /*
   * ⚠ DOUA FELURI DE CARANTINA, si niciunul nu-l cuprinde pe celalalt: o linie pe care n-o
   * putem lega de catalog, si o comanda pe care comerciantul n-o poate expedia cu mijloacele
   * lui. Motivele se leaga, nu se inlocuiesc: vezi `compuneMotiv`.
   */
  const inCarantina = areNelegate || lipsuri.length > 0 || motivMoneda != null;
  await admin.from("pepita_comenzi").update({
    order_id: orderId,
    stare: inCarantina ? "carantina" : "importata",
    motiv: compuneMotiv([motivNelegate, motivLipsuri, motivMoneda]),
    prelucrat_la: acum,
  } as never).eq("id", randId);

  /* ⚠ Prima sosire: comanda tocmai s-a nascut, deci n-are amprenta si nu se intreaba depozitul. */
  await scrieStareaEtichetei(admin, randId, await pastreazaEticheta(ctx.businessId, orderId, c), true);

  const verdictStoc = await consumaStocul(admin, ctx.businessId, orderId, legate);
  if (verdictStoc === "esec") {
    /*
     * ⚠ RANDUL NU RAMANE „importata". Starea „importata" inseamna „s-a facut tot ce era de
     * facut"; scrisa aici, ar fi ascuns tocmai comanda al carei stoc n-a scazut.
     */
    await admin.from("pepita_comenzi").update({
      stare: "carantina",
      /*
       * ⚠ SE ADUNA PESTE CELE DE MAI SUS. Scris singur, motivul asta le stergea, iar cronul de
       * stoc scoate din carantina randurile al caror motiv e chiar el: o comanda cu linii
       * nelegate SI stoc nescazut ar fi iesit din carantina cu prima problema nerezolvata.
       */
      motiv: compuneMotiv([motivNelegate, motivLipsuri, motivMoneda, MOTIV_STOC_NEFACUT]),
    } as never).eq("id", randId);
  }

  if (lipsuri.length > 0) {
    await logError({
      action: "pepita/comenzi",
      message: "comandă Pepita care nu se poate expedia cu datele primite",
      details: { externalId: c.externalId, lipsuri, orderId },
      businessId: ctx.businessId, severity: "warning",
    });
  }

  if (areNelegate) {
    await logError({
      action: "pepita/comenzi",
      message: "comandă Pepita cu linii care nu s-au putut lega de niciun produs",
      details: { externalId: c.externalId, coduri: nelegate.slice(0, 20), orderId },
      businessId: ctx.businessId, severity: "warning",
    });
  }

  if (verdictStoc === "esec") {
    return { stare: "stoc-nefacut", orderId, mesaje: ["Comanda este salvată, dar procesarea nu s-a încheiat."] };
  }

  /* ⚠ Se SPUNE ce lipseste, dar nu se spune ca n-am salvat: comanda e scrisa. */
  const mesaje: string[] = [];
  if (areNelegate) mesaje.push(`Comandă salvată. Coduri necunoscute: ${nelegate.join(", ")}`);
  if (lipsuri.length > 0) mesaje.push(`Comandă salvată, dar nu se poate expedia: lipsesc ${lipsuri.join(", ")}.`);
  if (monedaStraina) mesaje.push(`Comandă salvată. Moneda ei (${monedaComenzii}) nu e cea a magazinului.`);
  if (c.monedaNevalida) mesaje.push("Comandă salvată, dar codul de monedă trimis nu s-a putut citi.");

  return {
    stare: inCarantina ? "carantina" : regasita ? "duplicat" : "creata",
    orderId,
    mesaje,
  };
}

/**
 * Scade stocul, o singura data.
 *
 * ⚠ NUMAI LINIILE LEGATE. O linie fara produs n-are ce sa scada, si a scadea „ceva”
 * pentru ea ar fi mai rau decat a nu scadea nimic.
 */
async function consumaStocul(
  admin: Db, businessId: string, orderId: string, legate: LinieLegata[],
): Promise<"ok" | "esec"> {
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
     * ⚠ NU SE ARUNCA, DAR NICI NU SE TACE. Comanda e deja scrisa si trebuie sa ramana, deci
     * o exceptie n-are ce cauta aici. Dar verdictul urca pana la ruta, care raspunde ESEC.
     *
     * Pana la reparatia din 08.09.2026 se scria doar in jurnal si se mergea mai departe, iar
     * ruta raspundea „a mers". Adica: comanda exista, stocul NU scazuse, si Pepita n-avea
     * niciun motiv sa retrimita. Stocul nostru ramanea umflat, iar celelalte cinci canale
     * continuau sa vanda marfa care nu mai era.
     */
    await logError({
      action: "pepita/stoc",
      message: error?.message ?? "consumul de stoc n-a raspuns valid",
      details: { orderId, raspuns: r }, businessId, severity: "critical",
    });
    return "esec";
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
  return "ok";
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

/**
 * Numele clientului, dupa aceeasi regula pe amandoua drumurile.
 *
 * ⚠ Scris de doua ori — o data la creare, o data la reimprospatare — s-ar fi despartit, iar
 * retrimiterea ar fi rescris numele cu alta regula decat cea cu care fusese pus.
 */
function numeleClientului(c: ComandaPepita): string {
  return [c.client.prenume, c.client.nume].filter(Boolean).join(" ").trim()
    || c.client.facturare.nume
    || "Client Pepita";
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
   *
   * ⚠ CADEREA PE FACTURARE. Cand adresa de livrare vine goala, datele omului sunt adesea
   * chiar in obiect, la facturare. Fara caderea asta am fi carantinat comenzi ale caror date
   * le aveam deja. Judetul n-are pereche la facturare in sarcina lor, deci ramane doar al livrarii.
   */
  const strada = l.strada ?? ([l.numeStrada, l.numar].filter(Boolean).join(" ") || null)
    ?? f.strada ?? ([f.numeStrada, f.numar].filter(Boolean).join(" ") || null);
  return {
    address: strada ?? "",
    city: l.oras ?? f.oras ?? "",
    county: l.judet ?? "",
    postal_code: l.codPostal ?? f.codPostal ?? "",
    country: l.tara ?? f.tara ?? "",
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
function sursaComenzii(c: ComandaPepita, ctx: ContextIngest, cote: CoteleLiniilor): Record<string, unknown> {
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
    /* ⚠ Semnul ca s-au primit cote de TVA diferite pe linii. Se scrie o data, la ingest, ca sa
       nu depinda de recitirea liniilor la fiecare afisare. */
    ...(cote.uniforma ? {} : { vat_mixt: cote.cote }),
    livrare_pepita: esteLivrarePepita(c.modLivrare),
    ...(c.voucher > 0 ? { voucher: round2(c.voucher) } : {}),
    ...(c.client.codFiscal ? { tax_number: c.client.codFiscal } : {}),
    /*
     * ⚠ MONEDA SE SCRIE MEREU. `orders.total` e citit peste tot ca lei, iar facturarea
     * automata se opreste singura cand vede alta moneda. O comanda in HUF fara semn ar
     * fi fost facturata ca lei, iar o factura fiscala gresita nu se retrage, se storneaza.
     *
     * ⚠ TRANSPORTUL E REZERVA, si nu e o subtilitate. Sunt sarcini in care liniile nu poarta
     * `currency`, dar `total_shipping_price_currency` da „HUF": fara caderea asta se scria
     * moneda magazinului, deci o comanda de forinti era marcata „RON", nu intra in carantina,
     * si cifra ei pleca in rambursul unui AWB si intr-o factura in lei.
     */
    currency: (c.moneda ?? c.monedaTransport ?? ctx.monedaMagazin).toUpperCase(),
    /*
     * ⚠ CAND N-AM PUTUT CITI CODUL, SE SPUNE. `currency` de mai sus ramane cea mai buna
     * presupunere, fiindca rapoartele si ecranele au nevoie de ceva; dar cele doua cai pe care
     * atarna bani (rambursul precompletat si facturarea automata) se uita la steagul asta si
     * refuza, in loc sa se sprijine pe o afirmatie pe care noi insine am scris ca n-o sustinem.
     */
    ...(c.monedaNevalida ? { moneda_necitita: true } : {}),
  };
}

/**
 * Notele interne: ce trebuie sa afle comerciantul cand deschide comanda.
 *
 * ⚠ AICI SE SPUNE SI CE NU FACEM. Statusul nu pleaca inapoi la Pepita, fiindca nu
 * exista prin ce. Scris in comanda, omul afla exact acolo unde ar apasa gresit.
 */
function noteInterne(
  c: ComandaPepita, nelegate: string[], cote: CoteleLiniilor, lipsuri: string[],
  /** Moneda magazinului, DOAR cand difera de cea a comenzii. Altfel `null`. */
  monedaMagazin: string | null,
): string {
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
  } else if (c.modPlata === "transfer" || c.modPlata === "creditcard") {
    /*
     * ⚠ „TRANSFER" SI „CARD" NU INSEAMNA „PLATIT". Nota spunea neconditionat „nu se incaseaza
     * nimic la livrare", iar pe o comanda cu transferul NEFACUT asta trimitea marfa fara niciun
     * ban: banii nu-i are nici Pepita („Transferul nu ajunge la Pepita, ci direct la voi"), nici
     * curierul n-are ce cere.
     *
     * ⚠ SI DE AICI S-A SCOS „altfel lasă rambursul pe AWB". Era un indemn sa transformi cu mana
     * o plata bancara aleasa de client in plata la livrare: clientul care alesese banca s-ar fi
     * trezit cu curierul cerandu-i numerar, o metoda pe care n-o alesese. Metoda de plata aleasa
     * la ei NU se schimba de noi. Ce lipseste se SPUNE, si atat.
     *
     * ⚠ Cardul a intrat si el in ramura asta: e tot o plata in avans, si tot poate fi
     * nefinalizata cand ne impinge comanda.
     */
    const cum = c.modPlata === "transfer" ? "prin transfer" : "cu cardul";
    randuri.push(starePlata(c.starePlata, c.modPlata) === "paid"
      ? `Plata ${cum} a ajuns direct la tine, în avans. Nu se încasează nimic la livrare.`
      : `⚠ Plata ${cum} NU e confirmată de Pepita, iar la livrare nu se încasează nimic. `
        + "Verifică încasarea înainte de expediere. Cât timp comanda nu e marcată ca plătită, "
        + "AWB-ul propriu e blocat.");
  }
  if (c.mesajCurier) randuri.push(`Mesaj pentru curier: ${c.mesajCurier}`);
  if (c.client.codFiscal) randuri.push(`Cod fiscal cumpărător: ${c.client.codFiscal} (neverificat la ANAF).`);
  if (!modPlataCunoscut(c.modPlata)) {
    randuri.push(`⚠ Mod de plată necunoscut („${c.modPlata ?? "lipsă"}”). Verifică dacă banii au fost încasați înainte de expediere.`);
  }
  if (!modLivrareCunoscut(c.modLivrare)) {
    randuri.push(`⚠ Mod de livrare necunoscut („${c.modLivrare ?? "lipsă"}”). Alege curierul manual.`);
  }
  /*
   * ⚠ AMESTECUL DE COTE SE SPUNE PE COMANDA, nu doar in jurnal.
   *
   * ⚠ SI NU MAI E UN AVERTISMENT, din 09.09.2026. Pana atunci textul spunea „Edinio emite factura
   * cu o singură cotă, emite-o din contul tău" — adevarat atunci, si fals de cand fiecare linie
   * isi poarta cota ei. Un avertisment care nu mai e adevarat e mai rau decat niciunul: il trimite
   * pe comerciant sa faca de mana ce se face singur.
   *
   * Ramane insa SPUS, fiindca factura va arata altfel decat cele obisnuite: transportul si
   * reducerile apar despartite pe cote, cu procentul in coada numelui.
   */
  if (!cote.uniforma) {
    randuri.push(
      `Comanda are cote de TVA diferite pe linii (${cote.cote.map((x) => `${x}%`).join(", ")}). `
      + "Factura pleacă cu cota fiecărei linii; transportul și reducerile se împart între cote, "
      + "proporțional, deci vor apărea ca linii separate.",
    );
  }
  if (nelegate.length > 0) {
    randuri.push(`⚠ Linii fără corespondent în catalog: ${nelegate.join(", ")}. Verifică ce s-a vândut înainte de expediere; stocul lor NU a fost scăzut.`);
  }
  /*
   * ⚠ AICI AFLA CINE INTRA PE LISTA OBISNUITA DE COMENZI, nu prin panoul Pepita. Un AWB
   * emis fara telefon pleaca si nu ajunge nicaieri, iar comanda pare in regula pana cand
   * clientul intreaba unde e coletul.
   */
  if (lipsuri.length > 0) {
    randuri.push(`⚠ Comanda nu se poate expedia așa cum a venit: lipsesc ${lipsuri.join(", ")}. Completează-le din „Editează comanda” înainte de a emite AWB-ul.`);
  }
  /*
   * ⚠ CIFRA DE PE COMANDA NU E IN LEI. Se spune pe comanda, nu doar in panoul Pepita:
   * cine emite AWB-ul sau factura intra pe lista obisnuita de comenzi.
   */
  /* ⚠ Ramane pe comanda si dupa ce carantina se inchide: acolo il vede cine factureaza. */
  if (c.monedaNevalida) {
    randuri.push(
      "⚠ Codul de monedă trimis de Pepita nu s-a putut citi, deci nu știm sigur în ce monedă e "
      + "totalul. Verifică suma înainte de a emite AWB cu ramburs sau factura.",
    );
  }
  if (monedaMagazin) {
    randuri.push(
      `⚠ Totalul comenzii este în ${c.moneda ?? c.monedaTransport}, iar magazinul lucrează în ${monedaMagazin}. `
      + "NU emite AWB cu ramburs și NU factura până nu convertești suma.",
    );
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

/* ═══════════════════════════════════════════════════════════════════════════
   REPROCESAREA UNEI COMENZI DIN CARANTINA
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ CE REZOLVA. Carantina exista de la inceput, dar era un fund de sac: comerciantul putea
   crea produsul lipsa sau completa adresa, si comanda ramanea acolo pentru totdeauna. Iar
   „Resend order" din panoul lor nu ajuta: sosirea a doua intra pe ramura de duplicat, unde
   consumul de stoc raspunde „deja" si nu se repara nimic.

   ⚠ CELE DOUA DRUMURI DE STOC, SI DE CE NU E UNUL SINGUR.

   `stoc_marketplace_la` e marcajul pus de FUNCTIA DIN BAZA, in aceeasi instructiune cu
   scaderea. Un rand de evidenta poate spune orice; marcajul nu poate minti.
     - marcaj LIPSA: nu s-a consumat nimic, deci se cheama `consuma_stoc_comanda_marketplace`,
       care e idempotenta si marcheaza chiar ea;
     - marcaj PUS: s-a consumat o parte, deci se cheama `ajusteaza_stoc_comanda_marketplace`,
       care scade DIFERENTA fata de `stoc_rezervat`, adica exact linia tocmai reparata.

   ⚠ `stoc_marketplace_la` NU SE STERGE NICIODATA. Sters, consumul ar porni de la zero peste ce
   s-a scazut deja, si ar desface tocmai reparatia din 08.09.2026.

   ⚠ SETUL TRIMIS LUI `ajusteaza` E AUTORITAR: ce lipseste din el se ELIBEREAZA inapoi pe raft.
   De aceea se trimit TOATE liniile legate, nu doar cea reparata, si de aceea exista amprenta
   de mai jos: o linie adaugata de mana din panou nu e in `rezumat.linii`, deci fara verificare
   i-am fi dat stocul inapoi cu marfa plecata.
*/

export interface RezultatReprocesare {
  ok: boolean;
  /** S-a schimbat ceva in baza? Pe `false`, apelantul n-are ce reincarca. */
  schimbat: boolean;
  /** Stocul tot n-a putut fi facut. Ruta de comenzi raspunde ESEC pe asta, ca la ingest. */
  stocEsuat: boolean;
  /**
   * A ramas in carantina?
   *
   * ⚠ Camp, nu o cautare in text. Panoul alege culoarea toastului dupa el; citit din `mesaj`,
   * s-ar fi rupt la prima reformulare a propozitiei, si o comanda ramasa in verificare ar fi
   * fost anuntata cu verde.
   */
  inCarantina: boolean;
  mesaj: string;
}

export async function reproceseaza(
  admin: Db, ctx: ContextIngest, externalId: string,
): Promise<RezultatReprocesare> {
  /* ⚠ `business_id` e OBLIGATORIU: cu cheia de serviciu RLS nu mai apara nimic. */
  const { data: randBrut, error: eRand } = await admin
    .from("pepita_comenzi").select("id, order_id, stare, motiv, rezumat")
    .eq("business_id", ctx.businessId).eq("external_order_id", externalId).maybeSingle();
  if (eRand) throw eRand;
  const rand = randBrut as {
    id: string; order_id: string | null; stare: string; motiv: string | null; rezumat: unknown;
  } | null;
  if (!rand) return { ok: false, schimbat: false, stocEsuat: false, inCarantina: false, mesaj: "Comanda nu se găsește." };

  /* Idempotenta vazuta din afara: a doua apasare pe o comanda reparata nu face nimic. */
  if (rand.stare === "importata") {
    return { ok: true, schimbat: false, stocEsuat: false, inCarantina: false, mesaj: "Comanda nu mai are nimic de reparat." };
  }
  if (!rand.order_id) {
    return {
      ok: false, schimbat: false, stocEsuat: false, inCarantina: true,
      mesaj: "Comanda nu s-a scris niciodată în Edinio. Retrimite-o din Pepita Admin, cu „Resend order”.",
    };
  }

  const { data: comandaBruta, error: eComanda } = await admin
    .from("orders")
    /* ⚠ TOATE campurile de care atarna o hotarare de mai jos. Ce nu se cere vine `undefined`. */
    .select("id, items, status, customer_name, customer_phone, shipping_address, order_source, stoc_marketplace_la, stoc_eliberat_la")
    .eq("id", rand.order_id).eq("business_id", ctx.businessId).maybeSingle();
  if (eComanda) throw eComanda;
  const o = comandaBruta as {
    id: string; items: unknown; status: string | null;
    customer_name: string | null; customer_phone: string | null;
    shipping_address: unknown; order_source: unknown;
    stoc_marketplace_la: string | null; stoc_eliberat_la: string | null;
  } | null;
  if (!o) return { ok: false, schimbat: false, stocEsuat: false, inCarantina: true, mesaj: "Comanda din Edinio nu se mai găsește." };

  const rez = (rand.rezumat ?? {}) as { linii?: unknown };
  const brute = Array.isArray(rez.linii) ? rez.linii : [];
  const linii: LiniePepita[] = brute.map((x) => {
    const l = (x ?? {}) as Record<string, unknown>;
    return {
      idPepita: typeof l.id === "string" ? l.id : null,
      sku: typeof l.sku === "string" ? l.sku : null,
      moneda: null,
      cantitate: Number(l.cantitate) || 0,
      pret: Number(l.pret) || 0,
      tva: l.tva == null ? null : Number(l.tva),
    };
  });

  const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];

  /*
   * ⚠ AMPRENTA, INAINTE DE ORICE. Cele doua liste n-au chei: se leaga doar prin POZITIE. Iar
   * adaugarea de linii pe o comanda de marketplace e permisa azi din panou, deci `orders.items`
   * chiar poate sa nu mai semene cu ce ne-au trimis ei. Reparata pe ghicite, o linie adaugata
   * de mana ar fi lipsit din setul trimis lui `ajusteaza` si i s-ar fi dat stocul inapoi, cu
   * marfa plecata.
   */
  const potrivite = items.length === linii.length
    && linii.every((l, i) => Number(items[i]?.quantity) === l.cantitate);
  if (!potrivite) {
    return {
      ok: false, schimbat: false, stocEsuat: false, inCarantina: true,
      mesaj: "Liniile comenzii nu mai corespund cu ce a trimis Pepita, deci nu pot repara pe ghicite. "
        + "Scoate liniile adăugate manual și încearcă din nou.",
    };
  }

  const { legate, nelegate } = await leagaLiniile(admin, ctx.businessId, linii);

  /*
   * ⚠ SE COMPLETEAZA DOAR LEGATURA. Pretul, cantitatea, cota si codul raman NEATINSE, si nu se
   * recalculeaza niciun total: comanda e o tranzactie istorica, iar totalurile vin de la ei.
   */
  const itemsNoi = items.map((it, i) => {
    const l = legate[i];
    if (!l?.productId || it.product_id) return it;
    return {
      ...it,
      product_id: l.productId,
      name: l.nume,
      ...(l.variantTitle ? { variant_title: l.variantTitle } : {}),
    };
  });
  const seSchimbaLinii = itemsNoi.some((it, i) => it !== items[i]);

  /*
   * ⚠ O LEGATURA PIERDUTA OPRESTE ORICE ATINGERE A STOCULUI.
   *
   * Setul trimis lui `ajusteaza` e AUTORITAR: ce lipseste din el se ELIBEREAZA inapoi pe raft.
   * Daca intre sosire si reprocesare comerciantul a redenumit varianta unei linii DEJA legate
   * si consumate, `leagaLiniile` nu o mai gaseste, iar setul nou n-o mai contine: i-am fi dat
   * stocul inapoi pentru marfa care chiar a plecat. Se repara motivele, nu stocul.
   */
  const pierdeLegaturi = items.some((it, i) => !!it.product_id && !legate[i]?.productId);

  /*
   * ⚠ COMANDA MOARTA NU MAI CONSUMA NIMIC. Doua verificari, si nu se acopera una pe alta:
   * `stoc_eliberat_la` prinde anularea de DUPA un consum reusit; statusul o prinde pe cea
   * anulata INAINTE, cand `elibereaza_stoc_comanda` iese cu „necunoscut" fiindca n-are ce
   * elibera si nu stampileaza nimic.
   */
  const moarta = o.status === "cancelled" || o.status === "refunded";

  let stocEsuat = false;
  let despreStoc = "";
  if (o.stoc_eliberat_la || moarta) {
    /* Marfa s-a intors pe raft (anulare sau restituire): un consum aici ar scadea degeaba. */
    despreStoc = " Stocul nu s-a atins: comanda e anulată sau restituită.";
  } else if (pierdeLegaturi) {
    despreStoc = " Stocul nu s-a atins: o linie deja legată nu se mai recunoaște, iar ajustarea i-ar fi dat marfa înapoi pe raft.";
  } else if (!o.stoc_marketplace_la) {
    if (await consumaStocul(admin, ctx.businessId, o.id, legate) === "esec") stocEsuat = true;
    else despreStoc = " Stocul a fost scăzut.";
  } else if (seSchimbaLinii) {
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
    const { data, error } = await admin.rpc("ajusteaza_stoc_comanda_marketplace", {
      p_order_id: o.id,
      p_business_id: ctx.businessId,
      p_produse: [...peProdus.entries()].map(([product_id, quantity]) => ({ product_id, quantity })) as never,
      p_variante: [...peVarianta.values()] as never,
    });
    const r = data as { gasit?: boolean; schimbat?: boolean } | null;
    if (error || r?.gasit !== true) {
      stocEsuat = true;
      await logError({
        action: "pepita/reprocesare",
        message: error?.message ?? "ajustarea stocului n-a raspuns valid",
        details: { orderId: o.id, raspuns: r }, businessId: ctx.businessId, severity: "critical",
      });
    } else if (r.schimbat) {
      despreStoc = " Stocul liniei reparate a fost scăzut.";
      await impingeStoculPeCeleLalteCanale(ctx.businessId, [...peProdus.keys()], "pepita");
    }
  }

  const lipsuri = lipsuriComandaScrisa(o);
  const monedaComenzii = (o.order_source as { currency?: unknown } | null)?.currency;
  const monedaStraina = typeof monedaComenzii === "string" && monedaComenzii.trim() !== ""
    && monedaComenzii.trim().toUpperCase() !== ctx.monedaMagazin.toUpperCase();

  /* ⚠ Ce nu se poate recalcula se PASTREAZA: altfel ar disparea tacut la prima apasare. */
  /*
   * ⚠ `MOTIV_MONEDA_NECITITA` intra in lista, desi NU se poate recalcula: sarcina bruta nu se
   * pastreaza. Lasat pe dinafara, ar fi fost pastrat la fiecare reprocesare, si comanda ar fi
   * ramas in carantina pentru totdeauna, fara nicio cale de iesire. Apasarea pe „Reprocesează"
   * e o privire a omului asupra unei comenzi pe care scrie chiar motivul, deci se socoteste
   * luare la cunostinta. Avertismentul nu se pierde: ramane in nota interna a comenzii.
   */
  /*
   * ⚠ `MOTIV_MONEDA_NECITITA` NU E IN LISTA, si asta e o hotarare, nu o scapare.
   *
   * Prima incercare il stergea la apasarea omului, si stingea odata cu el si steagul
   * `order_source.moneda_necitita`. Dar steagul e SINGURA paza care tine rambursul pe zero si
   * facturarea automata oprita pe o comanda despre care noi insine am scris ca nu stim in ce
   * moneda e. Stins, `rambursDeIncasat` intoarce totalul intreg — iar la generarea in MASA de
   * AWB nu exista niciun camp de corectat, deci cifra ungureasca ar fi ceruta in LEI la usa.
   *
   * O apasare pe un buton al carui nume e „Reprocesează" nu e o hotarare despre bani. Deci
   * motivul si steagul RAMAN amandoua, comanda ramane in verificare, iar cele doua porti de bani
   * raman inchise: greseala in directia „nu se incaseaza" se vede si se repara, cea inversa nu.
   * Ce lipseste ca sa se poata inchide e o intrebare limpede pusa comerciantului, si aia e o
   * lucrare de sine statatoare.
   */
  const pastrate = motiveNerecalculabile(rand.motiv, [
    INCEPUT_CODURI, INCEPUT_NELIVRABILA, MOTIV_MONEDA_STRAINA, MOTIV_STOC_NEFACUT,
  ]);
  const motiv = compuneMotiv([
    motivCoduri(nelegate),
    motivNelivrabila(lipsuri),
    monedaStraina ? MOTIV_MONEDA_STRAINA : null,
    stocEsuat ? MOTIV_STOC_NEFACUT : null,
    ...pastrate,
  ]);

  /*
   * ⚠ NU SE SCRIU LINIILE CAND STOCUL A PICAT.
   *
   * Scrise oricum, a doua apasare ar fi vazut `items` deja reparate, deci `seSchimbaLinii`
   * fals, deci n-ar mai fi chemat nici ajustarea, nici consumul: comanda ar fi iesit din
   * carantina cu stocul nescazut, si n-ar mai fi avut cine sa-l scada (cronul cere marcajul
   * gol, iar aici e pus). Nescrise, reincercarea gaseste aceeasi lume ca prima oara.
   */
  if (seSchimbaLinii && !stocEsuat) {
    const { error } = await admin.from("orders")
      .update({ items: itemsNoi as never } as never)
      .eq("id", o.id).eq("business_id", ctx.businessId);
    if (error) throw error;
  }

  const { error: eScriere } = await admin.from("pepita_comenzi")
    .update({ stare: motiv ? "carantina" : "importata", motiv, prelucrat_la: new Date().toISOString() } as never)
    .eq("id", rand.id);
  if (eScriere) throw eScriere;

  if (!motiv) return { ok: true, schimbat: true, stocEsuat: false, inCarantina: false, mesaj: `Comanda a ieșit din carantină.${despreStoc}` };
  return {
    ok: true,
    schimbat: (seSchimbaLinii && !stocEsuat) || despreStoc !== "",
    stocEsuat,
    inCarantina: true,
    mesaj: `Comanda rămâne în verificare: ${motiv}${despreStoc}`,
  };
}
