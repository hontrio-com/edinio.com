import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { citesteCompilat, type Compilat } from "./compileaza";
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

/** Cat cere PostgREST intr-un `.in()`. Filtrul pleaca in ADRESA: peste ~700 cade cererea. */
const MAXIM_PE_LOT = 200;

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
  const gol = new Map<string, ConfiguratorDeVitrina>();
  const idProduse = [...new Set((produse ?? []).map((p) => p.id).filter(Boolean))];
  if (!businessId || idProduse.length === 0) return gol;

  try {
    const admin = createAdminClient();

    const active = await admin
      .from("configuratoare")
      .select("id")
      .eq("business_id", businessId)
      .eq("stare", "activ");

    if (active.error) {
      logError({
        action: "configurator.vitrina.active", message: active.error.message,
        businessId, severity: "error",
      });
      return gol;
    }
    // Cazul obisnuit al platformei: magazinul n-are niciun configurator, si se opreste aici.
    if (!active.data || active.data.length === 0) return gol;
    const idActive = new Set(active.data.map((c) => c.id));

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
        return gol;
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
      return gol;
    }

    // ⚠ Filtrul de activitate se pune INAINTE de rezolvare. Dupa, conflictul era deja pronuntat.
    const aleCategoriilor = doarActive((aleCategoriei ?? []) as LegaturaCategorie[], idActive);
    const aleProduselor = doarActive(legaturi, idActive);

    // Arborele se cere DOAR daca exista macar o legatura de categorie. Cele mai multe magazine
    // n-au niciuna, si atunci citirea lui ar fi fost pretul platit degeaba pe fiecare pagina.
    let arbore: RandCategorie[] = [];
    if (aleCategoriilor.length > 0) {
      const { data } = await admin
        .from("categories").select("id, name, parent_id").eq("business_id", businessId);
      arbore = (data ?? []) as RandCategorie[];
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
    if (alProdusului.size === 0) return gol;

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
        return gol;
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
    return out;
  } catch (e) {
    /*
     * ⚠ Nimic din configurator nu are voie sa doboare pagina de produs. Un produs vandut simplu
     * e o paguba mica; o pagina cazuta e una mare.
     */
    logError({
      action: "configurator.vitrina", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return gol;
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
