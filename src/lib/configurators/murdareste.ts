/**
 * Cine repune produsele la coada dupa ce s-a umblat la un configurator.
 *
 * ═══ ⚠ FARA MODULUL ASTA, CARDUL MINTE LA NESFARSIT ═══
 *
 * Modelul de citire `catalog_produs` se reimprospateaza dintr-un singur loc: declansatorul de pe
 * `products`, care marcheaza randul in `catalog_murdar` la fiecare scriere. Niciuna dintre
 * actiunile configuratorului nu atinge `products` — ele scriu in `configurator_produse`,
 * `configurator_categorii` si `configuratoare`. Deci declansatorul nu se aprinde NICIODATA
 * pentru ele.
 *
 * Urmarea nu e „cardul se actualizeaza cu intarzierea unui cron”, ci „cardul nu se actualizeaza
 * deloc”: un configurator publicat azi apare pe carduri abia cand cineva salveaza fiecare produs
 * de mana. Iar invers e mai rau — un configurator OPRIT lasa in urma carduri care trimit
 * cumparatorii intr-o pagina de configurare care nu mai exista.
 *
 * ═══ ⚠ CE SE MARCHEAZA: SI CE MOSTENESTE, NU DOAR CE E LEGAT ═══
 *
 * Configuratorul se aplica pe trei cai (`configurator.actions.ts`): direct pe produs, pe o
 * CATEGORIE cu tot subarborele ei, si cu excluderi. Marcate doar produsele legate direct, o
 * legatura de categorie ar fi schimbat raspunsul pentru toate produsele ei fara sa marcheze
 * niciunul — adica exact cazul care doare cel mai tare, fiindca e si cel mai frecvent.
 *
 * ═══ ⚠ SI CAND SE ASTEAPTA PROIECTIA, SI CAND NU ═══
 *
 * Se asteapta numai cand lista e MARGINITA si cunoscuta (produsele bifate de om, cel mult 200):
 * acolo omul tocmai a apasat si vrea sa vada schimbarea. Dupa o legatura de CATEGORIE pot fi mii
 * de produse, iar `proiecteazaImediat` le-ar fi proiectat pe toate in chiar cererea actiunii —
 * adica o actiune de panou care se intinde pe zeci de secunde si poate cadea pe timeout, cu
 * marcajele deja scrise. Acolo se marcheaza si atat; cronul de la minut le ia.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Autorizare } from "@/lib/auth/magazinul-meu";
import { createAdminClient } from "@/lib/supabase/admin";
import { extindeCategoriile } from "@/lib/offers/offer-pricing";
import { logError } from "@/lib/error-logger";
import { proiecteazaImediat } from "@/lib/storefront/catalog/proiector";
import { arboreleCategoriilor } from "./arborele";

/** Clientul panoului, asa cum il da `magazinulMeu`. Citirile trec prin el, deci si prin RLS. */
type ClientPanou = Extract<Autorizare, { ok: true }>["supabase"];

/** `.in()` si `upsert` pleaca in ADRESA, respectiv intr-un corp. Peste ~700 id-uri cade cererea. */
const MAXIM_PE_LOT = 200;

/**
 * Produsele numite, marcate SI proiectate acum.
 *
 * ⚠ Nu arunca niciodata. Marcajul e o imbunatatire a actiunii, nu treaba ei: o coada nescrisa
 * inseamna un card invechit pana la urmatoarea atingere a produsului, iar o actiune cazuta
 * inseamna ca legatura pe care comerciantul tocmai a facut-o pare ca n-a mers.
 */
export async function murdaresteSiProiecteaza(businessId: string, productIds: string[]): Promise<void> {
  const ids = [...new Set((productIds ?? []).filter((x) => typeof x === "string" && x))];
  if (!businessId || ids.length === 0) return;
  await marcheaza(businessId, ids);
  /*
   * Se asteapta, ca in mutatoarele de produse: altfel comerciantul leaga un configurator si isi
   * vede magazinul cu cardurile vechi pana trece cronul — pana la un minut de „nu s-a salvat”,
   * pe care il va raporta ca defect.
   */
  await proiecteazaImediat(businessId);
}

/**
 * Produsele categoriilor numite, CU TOT CU SUBARBORE.
 *
 * ⚠ Fara `proiecteazaImediat`, dinadins: vezi nota de sus. Marcajele raman in `catalog_murdar`
 * si le ia cronul.
 */
export async function murdaresteCategoriile(
  supabase: ClientPanou,
  businessId: string,
  categorii: string[],
): Promise<void> {
  const alese = curata(categorii);
  if (!businessId || alese.length === 0) return;
  await cheamaMarcarea(businessId, null, await desfaSubarborele(supabase, businessId, alese));
}

/**
 * Tot ce atinge configuratorul: legaturile lui directe SI produsele care mostenesc din
 * categoriile lui, cu subarbore cu tot.
 *
 * Se cheama cand se schimba insusi configuratorul — publicare, pornire, oprire, arhivare —
 * fiindca atunci raspunsul se schimba pentru toate produsele lui deodata.
 *
 * ⚠ Fara `proiecteazaImediat`: un configurator legat de „Imbracaminte” poate atinge tot
 * catalogul.
 */
export async function murdaresteConfiguratorul(
  supabase: ClientPanou,
  businessId: string,
  configuratorId: string,
): Promise<void> {
  if (!businessId || !configuratorId) return;

  const { data, error } = await supabase
    .from("configurator_categorii")
    .select("categorie")
    .eq("business_id", businessId)
    .eq("configurator_id", configuratorId);

  if (error) {
    /*
     * ⚠ Se merge mai departe, nu se renunta. Legaturile DIRECTE se marcheaza oricum, prin
     * `p_configurator`. Oprit aici, un configurator publicat n-ar fi marcat nici macar produsele
     * legate pe nume — adica nici cazul simplu n-ar fi mers.
     */
    logError({
      action: "configurator.murdareste.categorii", message: error.message,
      businessId, severity: "error", details: { configuratorId },
    });
  }

  const alese = curata((data ?? []).map((r) => r.categorie));
  const desfacute = alese.length ? await desfaSubarborele(supabase, businessId, alese) : [];
  await cheamaMarcarea(businessId, configuratorId, desfacute);
}

/* ═══════════════════════════════════════════════════════════════════════════
   INAUNTRU
   ═══════════════════════════════════════════════════════════════════════════ */

function curata(v: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const x of v ?? []) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t) out.add(t);
  }
  return [...out];
}

/**
 * Numele alese, plus tot ce sta sub ele in arbore.
 *
 * ⚠ Desfacerea se face cu `extindeCategoriile`, CHIAR functia pe care o foloseste si rezolvarea
 * configuratorului (`rezolvare.ts`) si legarea din panou. Scrisa a doua oara aici, prima
 * divergenta s-ar fi vazut ca „produsele din subcategorie n-au primit configuratorul”, fara
 * nicio eroare nicaieri.
 */
async function desfaSubarborele(
  supabase: ClientPanou,
  businessId: string,
  alese: string[],
): Promise<string[]> {
  /*
   * ⚠ Prin `arboreleCategoriilor`, si nu cu o citire scrisa aici: plafonul de 1000 de randuri al
   * PostgREST-ului taie TACUT, iar un arbore taiat ar fi lasat ramurile lipsa nemarcate — adica
   * exact felul de card invechit pe care modulul asta exista sa-l previna, fara nicio eroare.
   */
  const citit = await arboreleCategoriilor(supabase, businessId, "configurator.murdareste.arbore");

  if (!citit.ok) {
    /*
     * ⚠ Se marcheaza ce STIM, si se striga tare.
     *
     * Fara arbore se pierd subcategoriile, deci raman carduri invechite acolo. Dar a nu marca
     * nimic ar fi lasat invechite si categoriile numite pe fata — adica mai rau, pentru acelasi
     * necaz. Jurnalul e singurul loc din care se poate afla ca s-a intamplat, si el se scrie deja
     * in `arboreleCategoriilor`.
     */
    return alese;
  }

  return [...extindeCategoriile(citit.randuri, alese)];
}

/**
 * Marcarea in masa, printr-o singura instructiune in baza.
 *
 * ⚠ NU se citesc id-urile in Node. O categorie mare are mii de produse, iar PostgREST
 * plafoneaza ORICE raspuns la 1000 de randuri si TAIE TACUT — deci exact produsele de peste prag
 * ar fi ramas cu cardul vechi, fara nicio eroare. Vezi `lib/supabase/fetch-all.ts`.
 */
async function cheamaMarcarea(
  businessId: string,
  configuratorId: string | null,
  categorii: string[],
): Promise<void> {
  if (!configuratorId && categorii.length === 0) return;
  try {
    /*
     * ⚠ Client FARA `<Database>`, fiindca functia nu e (inca) in tipurile generate — la fel ca
     * `catalog_aplica_proiectii` in proiector. Pretul e ca `.rpc()` primeste orice nume si orice
     * argumente fara ca `tsc` sa clipeasca: numele si cheile de mai jos se verifica de mana fata
     * de `migrations/2026-12-29-catalog-configurator.sql`.
     */
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { error } = await admin.rpc("catalog_murdareste_configurator", {
      p_business: businessId,
      p_configurator: configuratorId,
      p_categorii: categorii,
    });
    if (error) {
      logError({
        action: "configurator.murdareste.rpc", message: error.message,
        businessId, severity: "error", details: { configuratorId, categorii: categorii.length },
      });
    }
  } catch (e) {
    logError({
      action: "configurator.murdareste.rpc", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
  }
}

/**
 * Marcarea unei liste marginite de produse.
 *
 * ⚠ Cu cheia de SERVICIU. `catalog_murdar` are RLS pornit si NICIO politica: clientul
 * comerciantului n-ar da eroare, ar raporta senin zero randuri afectate — adica un card care nu
 * se mai actualizeaza niciodata, fara nimic de vazut nicaieri.
 */
async function marcheaza(businessId: string, ids: string[]): Promise<void> {
  try {
    const admin = createAdminClient();
    const acum = new Date().toISOString();
    for (let i = 0; i < ids.length; i += MAXIM_PE_LOT) {
      const { error } = await admin
        .from("catalog_murdar")
        .upsert(
          ids.slice(i, i + MAXIM_PE_LOT).map((product_id) => ({
            product_id, business_id: businessId, marcat_la: acum,
          })),
          // ⚠ `marcat_la` se REscrie la conflict. Lasat cel vechi, lucratorul care tocmai
          // proiecteaza randul l-ar fi scos din coada dupa ce-l citise cu datele DE DINAINTE de
          // schimbarea asta, si proiectia ar fi ramas cea veche. Vezi `pragCoada` din proiector.
          { onConflict: "product_id" },
        );
      if (error) {
        logError({
          action: "configurator.murdareste.produse", message: error.message,
          businessId, severity: "error", details: { cate: ids.length },
        });
      }
    }
  } catch (e) {
    logError({
      action: "configurator.murdareste.produse", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
  }
}
