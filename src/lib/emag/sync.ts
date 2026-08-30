/**
 * Contextul unui magazin conectat la eMAG.
 *
 * ⚠ Fisierul asta va creste in etapa 3 cu fluxurile de publicare (`syncProductNow`,
 * `pushPretNow`, `pushStocNow`, `retrageOferta`). Acum are numai ce trebuie ca sa
 * se poata conecta un cont si citi nomenclatoarele.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BUTON_ADU_OFERTELE } from "./etichete";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import type { EmagAuth } from "./client";
import { EMAG_TARA_IMPLICITA, type EmagConfig } from "./types";

type Db = SupabaseClient<Database>;

export interface ContextEmag {
  auth: EmagAuth;
  config: EmagConfig;
  businessId: string;
  /**
   * Cum isi tine magazinul preturile.
   *
   * ═══ ⚠ SE CITESTE, NU SE PRESUPUNE ═══
   *
   * eMAG cere pretul FARA TVA, la toate cele patru campuri. Prima forma a
   * expeditorului avea aici `vat_rate: 21` si `prices_include_vat: true` scrise in
   * cod — corecte pentru magazinul obisnuit, si tacut gresite pentru oricare altul.
   *
   * Un magazin cu alta cota si-ar fi vazut ofertele publicate cu pretul umflat sau
   * subtiat cu diferenta dintre cele doua cote. Nicio eroare, nicaieri: se publica,
   * se vinde, si se afla din marja.
   *
   * Se citesc o data, aici, si merg mai departe cu contextul.
   */
  vatRate: number;
  pricesIncludeVat: boolean;
}

/**
 * Contextul, sau `null` cand magazinul nu e conectat.
 *
 * ⚠ SE CHEAMA CU SERVICE ROLE. Pe clientul comerciantului, vederea
 * `public.store_settings` intoarce `password` ca `enc.v1.…`, fiindca
 * `privat.decripteaza_config` iese pe prima linie pentru `anon`/`authenticated`.
 * eMAG ar raspunde 401 la fiecare apel, iar asimetria face defectul greu de
 * recunoscut: cronul (service role) ar merge, ecranele nu.
 *
 * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE dovedita
 * separat, de apelant. Toate actiunile trec prin `guard()` inainte.
 */
export async function loadEmagContext(admin: Db, businessId: string): Promise<ContextEmag | null> {
  const { data, error } = await admin
    .from("store_settings").select("emag_config, vat_rate, prices_include_vat")
    .eq("business_id", businessId).maybeSingle();

  /*
   * ⚠ `null` INSEAMNA DOUA LUCRURI, SI NU SE POT DESPARTI IN TIPUL DE INTOARCERE.
   *
   * Functia asta e chemata din vreo treizeci de locuri care toate scriu „Contul eMAG nu
   * este conectat." — un mesaj increzator si, la o pana a bazei, fals.
   *
   * ⚠ Desfacerea in trei stari se face deja acolo unde CONTEAZA: cronul cheama
   * `esteDeconectatEmag`, care are trei raspunsuri, si nu atinge coada magazinului cat
   * timp nu stie. Aici ramane `null`, dar EROAREA SE SCRIE — altfel o pana de o clipa e
   * nedeosebita, in jurnal, de un magazin care chiar n-a legat eMAG.
   */
  if (error) {
    void logError({
      action: "emag.context",
      message: `contextul nu s-a putut citi: ${error.message}`,
      businessId,
      severity: "warning",
    });
    return null;
  }

  const config = ((data?.emag_config as EmagConfig) ?? {}) || {};
  if (!config.connected || !config.username || !config.password) return null;


  const cota = Number((data as { vat_rate?: unknown } | null)?.vat_rate);

  return {
    auth: {
      username: config.username,
      password: config.password,
      tara: config.tara ?? EMAG_TARA_IMPLICITA,
      businessId,
    },
    config,
    businessId,
    /* ⚠ `21` numai cand chiar nu exista rand de setari. Un `NaN` ajuns in
       `pretFaraTva` ar fi dat `NaN` la toate cele patru preturi, iar eMAG ar fi
       raspuns cu un refuz despre pret pe care nimeni nu l-ar fi legat de TVA. */
    vatRate: Number.isFinite(cota) ? cota : 21,
    pricesIncludeVat: (data as { prices_include_vat?: boolean } | null)?.prices_include_vat !== false,
  };
}

/**
 * S-a deconectat comerciantul, sau doar n-am putut citi?
 *
 * ⚠ TREI RASPUNSURI, NU DOUA, si asta e chiar rostul functiei. `loadEmagContext`
 * intoarce `null` si cand magazinul s-a deconectat, si cand citirea a picat.
 * Confundate, o pana de o secunda a bazei ar fi golit coada unui magazin conectat
 * — iar produsele lui ar fi ramas nesincronizate fara ca nimeni sa afle.
 *
 * `true` = chiar s-a deconectat, se poate goli coada.
 * `false` = e conectat, contextul a picat din alt motiv.
 * `null` = nu stim. Nu se sterge NIMIC.
 */
export async function esteDeconectatEmag(admin: Db, businessId: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from("store_settings").select("emag_config").eq("business_id", businessId).maybeSingle();

  if (error) {
    void logError({
      action: "emag.context",
      message: `nu s-a putut citi emag_config: ${error.message}`,
      businessId,
      severity: "warning",
    });
    return null;
  }
  if (!data) return true;

  const config = (data.emag_config as EmagConfig) ?? {};
  return config.connected !== true;
}

/**
 * Ce lipseste ca sa se poata publica, daca lipseste ceva.
 *
 * Sta separat de `loadEmagContext` fiindca raspunde altei intrebari: contextul
 * spune „se poate vorbi cu eMAG", asta spune „se poate TRIMITE un produs". Un cont
 * conectat fara cota de TVA aleasa poate citi nomenclatoare, dar orice publicare
 * ar fi refuzata cu un mesaj despre `vat_id` pe care comerciantul nu-l poate lega
 * de nimic din ecranul lui.
 */
export function ceLipsestePentruPublicare(config: EmagConfig): string | null {
  if (!config.connected || !config.username || !config.password) {
    return "Conectează mai întâi contul eMAG (utilizator și parolă de API).";
  }
  if (config.needs_reconnect) {
    return "eMAG a refuzat acreditările. Reconectează contul.";
  }
  if (!config.vat_id) {
    return "Alege cota de TVA folosită pe eMAG, în setările integrării.";
  }
  if (config.handling_time == null) {
    return "Alege în câte zile expediezi (timpul de pregătire), în setările integrării.";
  }
  /*
   * ⚠ ULTIMA, SI DINADINS. Celelalte doua sunt setari de un minut; asta e o lucrare
   * care dureaza. Pusa prima, omul ar fi facut importul si abia apoi ar fi dat de
   * zidul TVA-ului — doua drumuri in loc de unul.
   *
   * ⚠ Mesajul spune ce sa APESE, nu unde sa se duca. Pe 23.08 tot fisierul asta
   * trimitea „in setarile integrarii” la doua campuri care nu existau nicaieri; nu
   * repetam forma aia. Butonul e chiar in ecranul unde se citeste mesajul.
   */
  if (!config.catalog_citit_la) {
    return `Apasă întâi „${BUTON_ADU_OFERTELE}”. Fără lista ta de produse de acolo ` +
      "nu avem de unde să știm care sunt deja în contul tău, iar eMAG le refuză pe " +
      "cele trimise a doua oară. Pasul acesta doar citește și leagă, magazinul tău " +
      "nu se modifică.";
  }
  return null;
}
