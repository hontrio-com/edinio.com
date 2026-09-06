import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { citesteCompilat, type Compilat } from "./compileaza";
import {
  configuratorulAplicat, doarActive, rezolvitorul,
  type LegaturaCategorie, type LegaturaProdus, type RandCategorie,
} from "./rezolvare";

/**
 * Ce primeste pagina de produs.
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
 * Se intoarce `null`, si produsul se vinde ca inainte — fara configurator. Niciodata o eroare
 * care sa doboare pagina, si niciodata o forma pe jumatate inteleasa. Un produs care se vinde
 * simplu e o paguba mica; o pagina de produs cazuta e una mare.
 */

export interface ConfiguratorDeVitrina {
  configuratorId: string;
  versiuneId: string;
  numarVersiune: number;
  compilat: Compilat;
}

/**
 * Configuratorul unui singur produs, gata de randat.
 *
 * ═══ ⚠ O SINGURA CITIRE PENTRU MAGAZINELE CARE N-AU CONFIGURATOARE ═══
 *
 * Functia asta se cheama pe FIECARE pagina de produs din platforma, iar aproape niciun magazin
 * n-are vreun configurator. Deci prima intrebare e cea mai ieftina cu putinta — „are magazinul
 * asta vreun configurator ACTIV?" — si raspunsul „nu" opreste totul acolo, dupa o citire pe
 * index. Restul citirilor se fac doar pentru magazinele care chiar folosesc functia.
 *
 * ⚠ Si tot de aici vine LISTA celor active, care se foloseste ca filtru mai jos. Fara ea, un
 * configurator OPRIT ramanea in socoteala si putea tine produsul intr-un conflict pe care
 * comerciantul tocmai il rezolvase oprindu-l.
 */
export async function configuratorulProdusului(
  businessId: string,
  produs: { id: string; category: string | null },
): Promise<ConfiguratorDeVitrina | null> {
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
      return null;
    }
    // Cazul obisnuit al platformei: magazinul n-are niciun configurator, si se opreste aici.
    if (!active.data || active.data.length === 0) return null;
    const idActive = new Set(active.data.map((c) => c.id));

    const [legaturi, categorii] = await Promise.all([
      admin.from("configurator_produse")
        .select("configurator_id, product_id, fel")
        .eq("business_id", businessId)
        .eq("product_id", produs.id),
      admin.from("configurator_categorii")
        .select("configurator_id, categorie")
        .eq("business_id", businessId),
    ]);

    /*
     * ⚠ O eroare de citire NU inseamna „n-are configurator".
     *
     * PostgREST nu arunca la refuz: intoarce `{ data: null, error }`. Tratate la fel, o pana de o
     * clipa ar fi scos configuratorul de pe produs si l-ar fi vandut la pretul de baza — adica
     * exact paguba pe care intreaga faza incearca s-o evite. Se jurnalizeaza, si se intoarce
     * `null` pe fata: produsul se vinde simplu, dar STIM ca s-a intamplat.
     */
    if (legaturi.error || categorii.error) {
      logError({
        action: "configurator.vitrina.citire",
        message: legaturi.error?.message ?? categorii.error?.message ?? "necunoscuta",
        businessId, severity: "error",
      });
      return null;
    }

    // ⚠ Filtrul de activitate se pune INAINTE de rezolvare. Dupa, conflictul era deja pronuntat.
    const aleCategoriilor = doarActive((categorii.data ?? []) as LegaturaCategorie[], idActive);
    const aleProdusului = doarActive((legaturi.data ?? []) as LegaturaProdus[], idActive);

    // Arborele se cere DOAR daca exista macar o legatura de categorie. Cele mai multe magazine
    // n-au niciuna, si atunci citirea lui ar fi fost pretul platit degeaba pe fiecare pagina.
    let arbore: RandCategorie[] = [];
    if (aleCategoriilor.length > 0) {
      const { data } = await admin
        .from("categories").select("id, name, parent_id").eq("business_id", businessId);
      arbore = (data ?? []) as RandCategorie[];
    }

    const rezolvare = rezolvitorul(aleProdusului, aleCategoriilor, arbore)(produs);
    const configuratorId = configuratorulAplicat(rezolvare);

    if (rezolvare.fel === "conflict") {
      /*
       * ⚠ Conflictul se JURNALIZEAZA, nu se rezolva pe tacute. Produsul se vinde simplu, iar
       * comerciantul are de unde afla — altfel ar fi ramas cu un produs care „nu mai are
       * configurator" fara niciun motiv vizibil.
       */
      logError({
        action: "configurator.vitrina.conflict",
        message: `Produsul are ${rezolvare.configuratoare.length} configuratoare mostenite`,
        businessId, severity: "warning",
        details: { productId: produs.id, configuratoare: rezolvare.configuratoare },
      });
      return null;
    }
    if (!configuratorId) return null;

    /*
     * ⚠ Se cere versiunea ACTIVA, intr-o singura citire legata.
     *
     * Starea se verifica si aici, desi lista de mai sus era deja filtrata: intre cele doua citiri
     * incape o oprire facuta chiar atunci din panou. Costa o comparatie si inchide fereastra.
     */
    const { data: cfg, error } = await admin
      .from("configuratoare")
      .select("id, stare, versiune_activa_id, configurator_versiuni!configuratoare_versiune_activa_fkey(id, numar, compilat)")
      .eq("id", configuratorId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) {
      logError({
        action: "configurator.vitrina.versiune", message: error.message,
        businessId, severity: "error", details: { configuratorId },
      });
      return null;
    }
    if (!cfg || cfg.stare !== "activ" || !cfg.versiune_activa_id) return null;

    const versiune = unaSingura(cfg.configurator_versiuni);
    if (!versiune) return null;

    const compilat = citesteCompilat(versiune.compilat);
    /*
     * ⚠ O forma compilata pe care n-o intelegem NU se serveste pe jumatate. Se poate intampla
     * doar la o desfasurare inapoi — cod vechi peste o versiune scrisa de unul nou. Produsul se
     * vinde simplu, si se vede in jurnal.
     */
    if (!compilat) {
      logError({
        action: "configurator.vitrina.compilatNecunoscut",
        message: "Versiunea publicata are o forma pe care codul de acum n-o intelege",
        businessId, severity: "error", details: { configuratorId, versiuneId: versiune.id },
      });
      return null;
    }

    return {
      configuratorId, versiuneId: versiune.id, numarVersiune: versiune.numar, compilat,
    };
  } catch (e) {
    /*
     * ⚠ Nimic din configurator nu are voie sa doboare pagina de produs. Un produs vandut simplu
     * e o paguba mica; o pagina cazuta e una mare.
     */
    logError({
      action: "configurator.vitrina", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return null;
  }
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
 * O grila are sute de produse; intrebate pe rand, fiecare card ar costa patru citiri. Si oricum
 * n-ar ajuta: `slimPageSections` taie `page_sections` pentru carduri, iar proiectia
 * `catalog_produs` nu stie nimic despre configuratoare.
 *
 * Cardul are nevoie de foarte putin — daca produsul CERE configurare, si de la ce pret porneste.
 * Amandoua se pun in proiectia de catalog, cu backfill prin `catalog_murdar`. E lucrarea urmatoare
 * din F2, si se face acolo, nu aici: `rezolvitorul` de mai sus e deja pregatit sa raspunda ieftin
 * pentru multe produse deodata.
 */
