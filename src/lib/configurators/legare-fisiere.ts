import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fisiereleDinInstantanee } from "./fisiere";
import { logError } from "@/lib/error-logger";

/**
 * Legarea fisierelor incarcate de comanda care le-a folosit.
 *
 * ═══ ⚠ PANA AICI, FISIERUL E ORFAN ═══
 *
 * Cine incarca n-are cont, deci randul se naste fara niciun om in spate: se stie doar magazinul
 * pe a carui pagina a fost desenat campul. Ce nu ajunge pe o comanda e gunoi, si se matura — altfel
 * oricine ne umple depozitul incarcand si inchizand fila.
 *
 * `comanda_id` e deci CAPATUL: din clipa asta fisierul are un motiv sa existe, si maturarea nu-l
 * mai atinge.
 *
 * ═══ ⚠ DE CE NU OPRESTE COMANDA CAND PICA ═══
 *
 * Fiindca in clipa asta comanda e deja inserata si, pe calea cu cardul, deja platita. Un refuz
 * aici n-ar mai anula nimic: ar lasa comanda in baza si i-ar spune clientului ca n-a mers.
 *
 * ⚠ DAR SE JURNALIZEAZA `critical`, si asta e important. O legare picata inseamna ca peste o
 * saptamana maturarea sterge poza unei comenzi PLATITE, iar atelierul deschide specificatia si
 * gaseste o trimitere catre nimic. E singurul fel de esec de aici care costa ceva, si e tacut.
 *
 * ⚠ SE INCEARCA DE DOUA ORI. Nu ca sa fie „mai sigur”, ci fiindca esecul tipic e o pana de o
 * clipa a bazei, iar fereastra de reparat e de o saptamana: a doua incercare costa o cerere si
 * salveaza tocmai cazul obisnuit.
 */
export async function legaFisiereleDeComanda(
  admin: SupabaseClient<Database>,
  businessId: string,
  comandaId: string,
  items: unknown,
): Promise<void> {
  const toate = fisiereleDinInstantanee(items);
  if (toate.length === 0) return;

  /*
   * ⚠ IN LOTURI, ca peste tot in proiect. `.in()` pleaca in ADRESA la PostgREST: peste ~700 de
   * valori cererea CADE cu totul.
   *
   * Aici lista nu e marginita de nimic: un cos de 30 de linii, fiecare cu trei campuri de
   * incarcare a cate zece poze, da 900 de id-uri. Iar caderea are chiar urmarea de care se
   * fereste antetul: comanda se plaseaza, fisierele raman `comanda_id is null`, si maturarea
   * sterge pozele unei comenzi PLATITE dupa sapte zile.
   */
  for (let i = 0; i < toate.length; i += MAX_PE_LOT) {
    await legaLotul(admin, businessId, comandaId, toate.slice(i, i + MAX_PE_LOT));
  }
}

/** Cat incape intr-un `.in()`. Acelasi numar ca peste tot in proiect. */
const MAX_PE_LOT = 200;

async function legaLotul(
  admin: SupabaseClient<Database>,
  businessId: string,
  comandaId: string,
  ids: string[],
): Promise<void> {
  for (let incercare = 1; incercare <= 2; incercare++) {
    const { error } = await admin
      .from("configurator_fisiere")
      .update({ comanda_id: comandaId })
      /*
       * ⚠ SI `business_id`, nu doar id-urile. Instantaneul poarta ce a trimis clientul; un id
       * incarcat in ALT magazin ar fi fost legat aici de o comanda care nu e a lui, iar fisierul
       * altcuiva ar fi ramas viu pe socoteala noastra si vizibil de pe comanda asta.
       *
       * ⚠ Si `comanda_id is null`: un fisier deja legat de o comanda NU se muta pe alta. Doi
       * cumparatori care lipesc acelasi id — se poate, id-ul circula prin cosul din browser — ar
       * fi rupt legatura primei comenzi, iar poza ei ar fi plecat la maturare.
       */
      .eq("business_id", businessId)
      .is("comanda_id", null)
      .in("id", ids);

    if (!error) return;

    if (incercare === 2) {
      await logError({
        action: "configuratorFisiere.legare",
        message: error.message,
        details: { businessId, comandaId, cate: ids.length, code: error.code },
        severity: "critical",
      });
    }
  }
}
