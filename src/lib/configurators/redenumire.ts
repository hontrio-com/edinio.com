/**
 * Legaturile de categorie urmeaza redenumirea si stergerea.
 *
 * ═══ ⚠ DE CE E NEVOIE ═══
 *
 * `configurator_categorii.categorie` tine NUMELE categoriei, nu id-ul ei — fiindca
 * `products.category` e tot text, si legatura produs-categorie se face prin nume peste tot in
 * proiect. Deci o redenumire lasa legatura pe un nume pe care nu-l mai poarta nimeni, iar
 * configuratorul dispare de pe produse fara ca cineva sa fi atins ceva.
 *
 * Proiectul are deja paguba asta scrisa de doua ori: 557 de produse ramase pe sapte nume moarte
 * pe Vetdepo, si harta de categorii a marketplace-urilor ramasa pe numele vechi, cu publicarea
 * oprita pentru o categorie pe care omul o legase deja. Aici se inchide a treia.
 *
 * ═══ ⚠ LA STERGERE SE RESTRANGE, NU SE LARGESTE ═══
 *
 * Cand o categorie se sterge, produsele ei urca la parinte. Legatura NU urca odata cu ele: mutata
 * pe parinte, configuratorul s-ar fi intins peste toti fratii — produse care nu l-au avut
 * niciodata ar fi devenit deodata configurabile, cu alt pret.
 *
 * Un produs vandut simplu e o paguba mica; un produs configurabil din greseala e una mare. Deci
 * legatura se STERGE, si se jurnalizeaza ca sa se poata afla.
 */

import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";

export interface LegaturaRand {
  id: string;
  configurator_id: string;
  categorie: string;
}

/**
 * Ce se scrie cand un nume de categorie se schimba sau dispare.
 *
 * ⚠ MUTAREA POATE SA SE CIOCNEASCA. Daca acelasi configurator e legat si de „Rochii" si de
 * „Femei", iar „Rochii" se redenumeste in „Femei", randul mutat ar fi calcat unicitatea
 * `(business_id, configurator_id, categorie)` si scrierea ar fi picat cu totul — adica si
 * celelalte mutari bune din acelasi lot. Randul care s-ar ciocni se sterge: perechea catre care
 * ar fi fost mutat exista deja si acopera exact acelasi lucru.
 */
export function planulRedenumirii(
  legaturi: LegaturaRand[],
  numeVechi: string,
  numeNou: string | null,
): { deMutat: string[]; deSters: string[] } {
  const gol = { deMutat: [], deSters: [] };
  if (!numeVechi || numeVechi === numeNou) return gol;

  const alePerechii = new Set(
    (legaturi ?? [])
      .filter((l) => l.categorie === numeNou)
      .map((l) => l.configurator_id),
  );

  const deMutat: string[] = [];
  const deSters: string[] = [];
  for (const l of legaturi ?? []) {
    if (l.categorie !== numeVechi) continue;
    if (numeNou === null || alePerechii.has(l.configurator_id)) deSters.push(l.id);
    else deMutat.push(l.id);
  }
  return { deMutat, deSters };
}

/**
 * Aplica planul pe baza.
 *
 * ⚠ Nu arunca niciodata. Chemata de pe drumul de redenumire a categoriei, o eroare de aici n-are
 * voie sa doboare redenumirea insasi: produsele s-au mutat deja, si o exceptie ar fi lasat
 * ecranul sa spuna „n-a mers" pentru o operatie care in cea mai mare parte a mers.
 */
export async function legaturileUrmeazaCategoria(
  businessId: string,
  numeVechi: string,
  numeNou: string | null,
): Promise<void> {
  if (!numeVechi || numeVechi === numeNou) return;

  try {
    const supabase = await createClient();

    /*
     * Se cer AMANDOUA numele intr-o singura citire: cel vechi ca sa se stie ce se muta, cel nou
     * ca sa se vada ciocnirile. Cerut doar cel vechi, mutarea ar fi picat pe unicitate.
     */
    const nume = numeNou ? [numeVechi, numeNou] : [numeVechi];
    const { data, error } = await supabase
      .from("configurator_categorii")
      .select("id, configurator_id, categorie")
      .eq("business_id", businessId)
      .in("categorie", nume);

    if (error) {
      logError({
        action: "configurator.redenumire.citire", message: error.message,
        businessId, severity: "warning", details: { numeVechi, numeNou },
      });
      return;
    }

    const plan = planulRedenumirii((data ?? []) as LegaturaRand[], numeVechi, numeNou);
    if (!plan.deMutat.length && !plan.deSters.length) return;

    if (plan.deMutat.length && numeNou) {
      const { error: eM } = await supabase
        .from("configurator_categorii")
        .update({ categorie: numeNou })
        .eq("business_id", businessId)
        .in("id", plan.deMutat);
      if (eM) {
        logError({
          action: "configurator.redenumire.mutare", message: eM.message,
          businessId, severity: "error", details: { numeVechi, numeNou, randuri: plan.deMutat.length },
        });
      }
    }

    if (plan.deSters.length) {
      const { error: eS } = await supabase
        .from("configurator_categorii")
        .delete()
        .eq("business_id", businessId)
        .in("id", plan.deSters);
      if (eS) {
        logError({
          action: "configurator.redenumire.stergere", message: eS.message,
          businessId, severity: "error", details: { numeVechi, randuri: plan.deSters.length },
        });
      } else {
        /*
         * ⚠ Se jurnalizeaza chiar si cand merge. Un configurator care nu se mai aplica dupa ce
         * comerciantul a sters o categorie e o schimbare pe care el n-o vede nicaieri — si de
         * care isi va aminti abia cand un client cumpara produsul neconfigurat.
         */
        logError({
          action: "configurator.redenumire.legaturiSterse",
          message: numeNou
            ? `${plan.deSters.length} legaturi de categorie s-au ciocnit la redenumire si au fost sterse`
            : `${plan.deSters.length} legaturi de categorie au ramas fara categorie si au fost sterse`,
          businessId, severity: "warning", details: { numeVechi, numeNou },
        });
      }
    }
  } catch (e) {
    logError({
      action: "configurator.redenumire", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
  }
}

/** Acelasi lucru pentru mai multe nume disparute deodata, la stergerea unei ramuri. */
export async function legaturileUitaCategoriile(
  businessId: string,
  disparute: string[],
): Promise<void> {
  // ⚠ Pe rand, nu cu un `.in()` mare: lista vine dintr-un subarbore sters si poate fi lunga, iar
  // `.in()` pleaca in ADRESA — peste ~700 de valori PostgREST raspunde 400 la marginea cererii.
  for (const nume of (disparute ?? []).slice(0, 500)) {
    await legaturileUrmeazaCategoria(businessId, nume, null);
  }
}
