import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { citesteCompilat, type Compilat } from "./compileaza";
import { arboreleCategoriilor } from "./arborele";
import {
  configuratorulAplicat, doarActive, rezolvitorul,
  type LegaturaCategorie, type LegaturaProdus, type RandCategorie,
} from "./rezolvare";

/**
 * Ce primeste vitrina.
 *
 * ═══ ⚠ CU CHEIA DE SERVICIU, SI DE CE E CORECT AICI ═══
 *
 * Tabelele configuratorului n-au nicio politica publica, dinadins: ciornele, versiunile vechi si
 * costurile interne n-au ce cauta la un vizitator. Cititorul anonim nu poate deci sa le
 * interogheze el.
 *
 * Se citesc cu cheia de serviciu, ca `getCartPricing` si ca proiectia de catalog, DAR:
 *   - filtrul pe magazin vine din ruta, nu din browser;
 *   - se serveste numai versiunea ACTIVA a unui configurator ACTIV;
 *   - ce se intoarce e forma deja COMPILATA, din care lipseste tot ce nu-i trebuie vitrinei.
 *
 * Ciorna nu se citeste niciodata de aici. Un configurator nepublicat nu exista pentru magazin.
 *
 * ═══ ⚠ CE SE INTAMPLA CAND CEVA NU E IN REGULA ═══
 *
 * Se intoarce `null` (sau o harta goala), si produsul se vinde ca inainte — fara configurator.
 * Niciodata o eroare care sa doboare pagina, si niciodata o forma pe jumatate inteleasa. Un produs
 * care se vinde simplu e o paguba mica; o pagina de produs cazuta e una mare.
 *
 * ⚠ Iar la PLASAREA COMENZII asta nu mai e adevarat: acolo o linie despre care nu stim sigur ce
 * costa se REFUZA, nu se vinde la pretul de baza. Vezi `repretuire.ts`.
 */

export interface ConfiguratorDeVitrina {
  configuratorId: string;
  versiuneId: string;
  numarVersiune: number;
  compilat: Compilat;
}

/**
 * Acelasi raspuns, dar cu verdictul citirii langa el.
 *
 * ═══ ⚠ DE CE E NEVOIE DE `ok`, CAND HARTA GOALA PAREA DE AJUNS ═══
 *
 * Harta goala inseamna DOUA lucruri care nu se pot deosebi: „niciun produs n-are configurator”
 * si „citirea a picat”. Pentru vitrina ele chiar sunt acelasi lucru — produsul se vinde simplu,
 * si asta e degradarea corecta pe o pagina.
 *
 * Pe PROIECTIE nu mai sunt. Acolo raspunsul se SCRIE si ramane scris: o pana de o clipa ar fi
 * pus „n-are configurator” peste un produs care are, iar cardul ar fi mintit pana cand cineva
 * atingea produsul — poate luni, fiindca nimic nu-l mai repune la coada. De aceea proiectorul
 * cere verdictul si, cand e `false`, nu scrie nimic.
 *
 * ⚠ `harta` e buna de folosit si cand `ok` e `false`: ce e in ea s-a citit cu adevarat. `ok`
 * spune doar ca poate LIPSI ceva din ea, deci nu se poate trage concluzia „n-are”.
 */
export interface RaspunsConfiguratoare {
  ok: boolean;
  harta: Map<string, ConfiguratorDeVitrina>;
}

/** Cat cere PostgREST intr-un `.in()`. Filtrul pleaca in ADRESA: peste ~700 cade cererea. */
const MAXIM_PE_LOT = 200;

/**
 * Ce configuratoare ACTIVE are magazinul. Citit O SINGURA DATA pe randare.
 *
 * ═══ ⚠ DE CE E MEMORATA TOCMAI ASTA ═══
 *
 * E prima intrebare a fiecarui drum si singura care se pune cu ACELASI argument de fiecare data:
 * un magazin, atat. Restul citirilor primesc alte loturi de produse la fiecare chemare, deci
 * n-au ce sa impartaseasca; asta le raspunde tuturor la fel.
 *
 * Iar drumurile sunt multe pe o singura pagina de start: proiectia catalogului, pagina produsului
 * si CELE TREI locuri din `offers.ts` care aduc produse pentru oferte (`fetchOfferProducts`,
 * categoria, si cosul). Fiecare intreba din nou. Pentru magazinele fara niciun configurator —
 * masurat, 131 din 131 — raspunsul „niciunul" opreste tot restul, deci intrebarea asta ERA
 * intreaga cheltuiala: pana la cinci dus-intorsuri pe randare, toate cu acelasi raspuns gol.
 *
 * `cache` din React deduplica pe durata UNEI cereri, nu intre cereri: comerciantul care isi
 * activeaza configuratorul il vede la urmatoarea incarcare, ca pana acum. In afara unei cereri
 * (cron, calea de comanda) nu memoreaza nimic si drumul ramane exact cel de dinainte.
 *
 * ⚠ SI PANA E MEMORATA LA FEL CA IZBANDA, dinadins. Cu esecul nememorat, o baza care refuza ar
 * fi fost intrebata de cinci ori pe randare in loc de una, si — mai rau — doua drumuri ale
 * ACELEIASI pagini ar fi putut primi raspunsuri diferite: cardul din grila spunand „n-are",
 * pagina produsului spunand „are". Un singur verdict pe cerere e mai bun decat cinci incercari.
 *
 * ⚠ Multimea se intoarce ca `ReadonlySet` fiindca de acum e IMPARTITA: cine ar scoate un id din
 * ea l-ar scoate si pentru celelalte drumuri ale aceleiasi randari.
 */
const configuratoareleActive = cache(async (
  businessId: string,
): Promise<{ ok: boolean; ids: ReadonlySet<string> }> => {
  const { data, error } = await createAdminClient()
    .from("configuratoare")
    .select("id")
    .eq("business_id", businessId)
    .eq("stare", "activ");
  if (error) {
    logError({
      action: "configurator.vitrina.active", message: error.message,
      businessId, severity: "error",
    });
    return { ok: false, ids: new Set<string>() };
  }
  return { ok: true, ids: new Set((data ?? []).map((c) => c.id)) };
});

/**
 * Configuratoarele mai multor produse deodata.
 *
 * ═══ ⚠ IN MASA, NU PE RAND ═══
 *
 * Un cos are pana la cateva zeci de linii, iar comanda le repretuieste pe toate. Intrebate pe
 * rand, fiecare ar fi costat patru citiri — la douazeci de linii, optzeci de dus-intorsuri intr-o
 * singura plasare de comanda. Aici legaturile, arborele si versiunile se citesc O DATA.
 *
 * ═══ ⚠ SI PRIMA INTREBARE E CEA MAI IEFTINA ═══
 *
 * „Are magazinul asta vreun configurator ACTIV?" Aproape niciunul n-are, iar raspunsul „nu"
 * opreste totul dupa o citire pe index. Tot de acolo vine si lista celor active, care se
 * foloseste ca filtru: fara ea, un configurator OPRIT ramanea in socoteala si putea tine produsul
 * intr-un conflict pe care comerciantul tocmai il rezolvase oprindu-l.
 */
export async function configuratoarePentruProduse(
  businessId: string,
  produse: { id: string; category: string | null }[],
): Promise<Map<string, ConfiguratorDeVitrina>> {
  return (await configuratoareleCuVerdict(businessId, produse)).harta;
}

/**
 * Acelasi drum, dar spune si daca a aflat cu adevarat. Vezi `RaspunsConfiguratoare`.
 *
 * ⚠ NU e o a doua citire scrisa separat, si nici nu are voie sa devina: `configuratoarePentruProduse`
 * o cheama chiar pe asta. Doua drumuri ar fi ajuns sa raspunda altfel, iar cardul din grila si
 * pagina de produs ar fi aratat configuratoare diferite pentru acelasi produs.
 */
export async function configuratoareleCuVerdict(
  businessId: string,
  produse: { id: string; category: string | null }[],
): Promise<RaspunsConfiguratoare> {
  const gol = new Map<string, ConfiguratorDeVitrina>();
  const idProduse = [...new Set((produse ?? []).map((p) => p.id).filter(Boolean))];
  // Nimic de intrebat nu e o pana: raspunsul „niciunul” e adevarat si complet.
  if (idProduse.length === 0) return { ok: true, harta: gol };
  // Fara magazin nu se poate afla nimic, deci nici nu se poate incheia ca produsul n-are.
  if (!businessId) return { ok: false, harta: gol };

  /*
   * ⚠ Se stinge la PRIMA citire care nu raspunde limpede, si nu se mai reaprinde.
   *
   * Citirea arborelui de categorii de mai jos e singura care nu opreste totul: fara el, doar
   * mostenirea din categorie se pierde, iar legaturile DIRECTE raman bune si trebuie servite.
   * Dar concluzia „produsul asta n-are configurator” nu se mai poate trage, si atat spune `ok`.
   */
  let sigur = true;

  try {
    const admin = createAdminClient();

    const active = await configuratoareleActive(businessId);

    if (!active.ok) return { ok: false, harta: gol };
    // Cazul obisnuit al platformei: magazinul n-are niciun configurator, si se opreste aici.
    // ⚠ `ok: true`: raspunsul „niciunul” e citit, nu presupus — si tocmai el da steagul `false`
    // pe tot catalogul magazinului, deci trebuie sa poata fi SCRIS.
    if (active.ids.size === 0) return { ok: true, harta: gol };
    const idActive = active.ids;

    /* ── Legaturile ──────────────────────────────────────────────────────── */

    const legaturi: LegaturaProdus[] = [];
    for (let i = 0; i < idProduse.length; i += MAXIM_PE_LOT) {
      const { data, error } = await admin
        .from("configurator_produse")
        .select("configurator_id, product_id, fel")
        .eq("business_id", businessId)
        .in("product_id", idProduse.slice(i, i + MAXIM_PE_LOT));
      /*
       * ⚠ O eroare de citire NU inseamna „n-are configurator".
       *
       * PostgREST nu arunca la refuz: intoarce `{ data: null, error }`. Tratate la fel, o pana de
       * o clipa ar fi scos configuratorul de pe produs si l-ar fi vandut la pretul de baza — adica
       * exact paguba pe care intreaga faza incearca s-o evite. Se jurnalizeaza, si se intoarce
       * gol: produsul se vinde simplu, dar STIM ca s-a intamplat.
       */
      if (error) {
        logError({
          action: "configurator.vitrina.citire", message: error.message,
          businessId, severity: "error",
        });
        return { ok: false, harta: gol };
      }
      legaturi.push(...((data ?? []) as LegaturaProdus[]));
    }

    const { data: aleCategoriei, error: eCat } = await admin
      .from("configurator_categorii")
      .select("configurator_id, categorie")
      .eq("business_id", businessId);
    if (eCat) {
      logError({
        action: "configurator.vitrina.citire", message: eCat.message,
        businessId, severity: "error",
      });
      return { ok: false, harta: gol };
    }

    // ⚠ Filtrul de activitate se pune INAINTE de rezolvare. Dupa, conflictul era deja pronuntat.
    const aleCategoriilor = doarActive((aleCategoriei ?? []) as LegaturaCategorie[], idActive);
    const aleProduselor = doarActive(legaturi, idActive);

    // Arborele se cere DOAR daca exista macar o legatura de categorie. Cele mai multe magazine
    // n-au niciuna, si atunci citirea lui ar fi fost pretul platit degeaba pe fiecare pagina.
    let arbore: RandCategorie[] = [];
    if (aleCategoriilor.length > 0) {
      /*
       * ⚠ Singura citire care NU opreste totul, si singura al carei esec era pana acum invizibil.
       *
       * Fara arbore se pierde numai MOSTENIREA din categorie; legaturile directe raman bune si
       * merita servite, deci pagina merge inainte cu ele. Dar „produsul asta n-are configurator”
       * nu se mai poate spune, iar proiectia n-are voie sa scrie asa ceva: un magazin care isi
       * leaga configuratorul de o categorie ar fi ramas cu steagul stins pe toate produsele ei,
       * pana cand cineva le atingea pe rand.
       *
       * ⚠ Si de aceea trece prin `arboreleCategoriilor`: acolo se plimba plafonul de 1000 de
       * randuri al PostgREST-ului, care TAIE TACUT. Taiat, arborele ar fi pierdut ramuri fara sa
       * dea nicio eroare — adica `sigur` ar fi ramas `true` peste un raspuns incomplet, si
       * proiectia ar fi SCRIS „n-are configurator" pe produsele de sub ramurile lipsa.
       */
      const citit = await arboreleCategoriilor(admin, businessId, "configurator.vitrina.arbore");
      if (!citit.ok) sigur = false;
      arbore = citit.randuri;
    }

    /* ── Rezolvarea ──────────────────────────────────────────────────────── */

    const rezolva = rezolvitorul(aleProduselor, aleCategoriilor, arbore);
    const alProdusului = new Map<string, string>();
    for (const p of produse) {
      const r = rezolva(p);
      if (r.fel === "conflict") {
        /*
         * ⚠ Conflictul se JURNALIZEAZA, nu se rezolva pe tacute. Produsul se vinde simplu, iar
         * comerciantul are de unde afla — altfel ar fi ramas cu un produs care „nu mai are
         * configurator" fara niciun motiv vizibil.
         */
        logError({
          action: "configurator.vitrina.conflict",
          message: `Produsul are ${r.configuratoare.length} configuratoare mostenite`,
          businessId, severity: "warning",
          details: { productId: p.id, configuratoare: r.configuratoare },
        });
        continue;
      }
      const id = configuratorulAplicat(r);
      if (id) alProdusului.set(p.id, id);
    }
    if (alProdusului.size === 0) return { ok: sigur, harta: gol };

    /* ── Versiunile ──────────────────────────────────────────────────────── */

    const idCerute = [...new Set(alProdusului.values())];
    const versiuni = new Map<string, ConfiguratorDeVitrina>();
    for (let i = 0; i < idCerute.length; i += MAXIM_PE_LOT) {
      /*
       * ⚠ Starea se cere si aici, desi lista de sus era deja filtrata: intre cele doua citiri
       * incape o oprire facuta chiar atunci din panou. Costa un filtru si inchide fereastra.
       */
      const { data, error } = await admin
        .from("configuratoare")
        .select("id, stare, versiune_activa_id, configurator_versiuni!configuratoare_versiune_activa_fkey(id, numar, compilat)")
        .eq("business_id", businessId)
        .eq("stare", "activ")
        .in("id", idCerute.slice(i, i + MAXIM_PE_LOT));

      if (error) {
        logError({
          action: "configurator.vitrina.versiune", message: error.message,
          businessId, severity: "error",
        });
        return { ok: false, harta: gol };
      }

      for (const cfg of data ?? []) {
        if (!cfg.versiune_activa_id) continue;
        const versiune = unaSingura(cfg.configurator_versiuni);
        if (!versiune) continue;
        const compilat = citesteCompilat(versiune.compilat);
        /*
         * ⚠ O forma compilata pe care n-o intelegem NU se serveste pe jumatate. Se poate intampla
         * doar la o desfasurare inapoi — cod vechi peste o versiune scrisa de unul nou. Produsul
         * se vinde simplu, si se vede in jurnal.
         */
        if (!compilat) {
          logError({
            action: "configurator.vitrina.compilatNecunoscut",
            message: "Versiunea publicata are o forma pe care codul de acum n-o intelege",
            businessId, severity: "error",
            details: { configuratorId: cfg.id, versiuneId: versiune.id },
          });
          continue;
        }
        versiuni.set(cfg.id, {
          configuratorId: cfg.id, versiuneId: versiune.id, numarVersiune: versiune.numar, compilat,
        });
      }
    }

    const out = new Map<string, ConfiguratorDeVitrina>();
    for (const [productId, configuratorId] of alProdusului) {
      const v = versiuni.get(configuratorId);
      if (v) out.set(productId, v);
    }
    return { ok: sigur, harta: out };
  } catch (e) {
    /*
     * ⚠ Nimic din configurator nu are voie sa doboare pagina de produs. Un produs vandut simplu
     * e o paguba mica; o pagina cazuta e una mare.
     */
    logError({
      action: "configurator.vitrina", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { ok: false, harta: gol };
  }
}

/**
 * Configuratorul unui singur produs, gata de randat.
 *
 * ⚠ Acelasi drum ca cel in masa, nu o a doua citire scrisa separat: doua drumuri ar fi ajuns sa
 * raspunda altfel, iar pagina de produs si comanda ar fi vazut configuratoare diferite pentru
 * acelasi produs.
 */
export async function configuratorulProdusului(
  businessId: string,
  produs: { id: string; category: string | null },
): Promise<ConfiguratorDeVitrina | null> {
  const harta = await configuratoarePentruProduse(businessId, [produs]);
  return harta.get(produs.id) ?? null;
}

/** Legatura pe cheie straina vine ca obiect sau ca vector de unul, dupa cum o vede PostgREST. */
function unaSingura(v: unknown): { id: string; numar: number; compilat: unknown } | null {
  if (Array.isArray(v)) return (v[0] as { id: string; numar: number; compilat: unknown }) ?? null;
  if (v && typeof v === "object") return v as { id: string; numar: number; compilat: unknown };
  return null;
}

/*
 * ⚠ CARDURILE DE PRODUS AU NEVOIE DE ALT DRUM.
 *
 * O grila are sute de produse. Chiar si cu citirea in masa de mai sus, cardul n-ar avea ce face
 * cu forma compilata intreaga: `slimPageSections` taie `page_sections` pentru carduri, iar
 * proiectia `catalog_produs` nu stie nimic despre configuratoare.
 *
 * Cardul are nevoie de foarte putin — daca produsul CERE configurare, si de la ce pret porneste.
 * Amandoua se pun in proiectia de catalog, cu backfill prin `catalog_murdar`.
 */
