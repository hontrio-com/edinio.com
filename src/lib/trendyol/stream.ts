/**
 * Citirea comenzilor prin `orders/stream`, cu cursor opac.
 *
 * ═══ ⚠ DE CE EXISTA, SI DE CE E STINSA DIN START ═══
 *
 * Calea de azi (`/v2/orders`, paginata) merge si e verificata: cursor pe fiecare vitrina,
 * suprapunere peste marcaj, trunchierea care stinge `ok`. La opt comenzi nu are niciun necaz.
 *
 * Dar are un plafon pe care ei il scriu: fereastra paginata da cel mult 10.000 de inregistrari
 * (`maxQueryWindowResult`). Peste el, paginile de la coada nu se mai pot atinge deloc.
 *
 * ⚠ `orders/stream` NU ARE PLAFONUL ALA — verificat: sirul „maxQueryWindowResult" nu apare pe
 * pagina lui. In schimb schimba felul paginarii: nu mai da `totalPages`, ci `hasMore` si un
 * `nextCursor`.
 *
 * ⚠ SI DE-AIA E STINSA DIN START. Comenzile sunt calea cea mai sensibila din toata integrarea —
 * ele misca stocul. Nu se schimba sub un magazin care merge, pentru un plafon la care nu ajunge.
 * Se aprinde din `trendyol_config.foloseste_stream` cand volumul chiar o cere.
 *
 * ═══ ⚠ CURSORUL E OPAC ═══
 *
 * Regula lor, verbatim: „nextCursor opaque bir değerdir → parse edilmemelidir, değiştirilmemelidir."
 * Nu se citeste, nu se schimba, nu se construieste de mana. Se trimite inapoi exact cum a venit.
 *
 * ⚠ SI NU SE TINE MINTE INTRE TRECERI. Un cursor vechi de un minut poate sa nu mai fie valabil,
 * iar noi n-avem cum sa stim: e opac. Fiecare trecere porneste de la fereastra de timp — care e
 * a noastra si o intelegem — si merge pana la capat sau pana la plafonul de pagini.
 */

import type { TrendyolShipmentPackage } from "./types";
import { getOrdersStream, isTrendyolError } from "./client";
import type { TrendyolSyncContext } from "./sync";

/**
 * Cate pagini se citesc intr-o trecere.
 *
 * ⚠ Ei recomanda minimum cinci secunde intre cereri („Önerilen kullanım minimum 5 saniye
 * aralıklarda istek atılmasıdır"). Un cron de un minut nu poate face multe la ritmul asta, si
 * nici nu trebuie: e o plasa, nu calea principala.
 */
const PAGINI_PE_TRECERE = 5;

/** Cat asteptam intre pagini, dupa recomandarea lor. */
const PAUZA_INTRE_PAGINI_MS = 5000;

/** ⚠ Plafonul LOR: „Default 50; maximum 200". Cerut mai mare, raspund 400. */
const MARIME_PAGINA = 200;

export interface RezultatStream {
  pachete: TrendyolShipmentPackage[];
  /** `false` = n-am ajuns la capat, deci marcajul NU are voie sa avanseze. */
  ok: boolean;
  pagini: number;
}

/**
 * Citeste comenzile schimbate intr-o fereastra, urmand cursorul.
 *
 * ⚠ FEREASTRA E CEL MULT DOUA SAPTAMANI, si datele cel mult trei luni — amandoua scrise de ei.
 * Ceruta mai larga, cererea e refuzata, iar cronul ar parea ca merge.
 *
 * ⚠ TIMPUL LOR E IN MILISECUNDE SI IN GMT+3. Marcajele noastre sunt UTC; conversia se face aici,
 * o data, ca sa nu fie facuta gresit in trei locuri.
 */
export async function citesteStream(
  ctx: TrendyolSyncContext, deLaMs: number, panaLaMs: number,
): Promise<RezultatStream> {
  const pachete: TrendyolShipmentPackage[] = [];
  let cursor: string | undefined;
  let pagini = 0;

  for (; pagini < PAGINI_PE_TRECERE; pagini++) {
    const res = await getOrdersStream(ctx.auth, {
      lastModifiedStartDate: deLaMs,
      lastModifiedEndDate: panaLaMs,
      size: MARIME_PAGINA,
      nextCursor: cursor,
    });
    /* ⚠ O eroare NU avanseaza marcajul: fereastra se reia intreaga. */
    if (isTrendyolError(res)) return { pachete, ok: false, pagini };

    for (const p of res.data?.content ?? []) pachete.push(p);

    /* ⚠ `hasMore` e singurul semn de capat. Nu mai dau `totalPages` — changelog-ul lor din
       02.06.2026 o spune pe fata — deci nu se poate socoti dinainte cate pagini urmeaza. */
    if (res.data?.hasMore !== true) return { pachete, ok: true, pagini: pagini + 1 };

    const urmatorul = res.data?.nextCursor;
    /*
     * ⚠ `hasMore: true` FARA CURSOR e o stare pe care n-o putem duce mai departe. Reluata cu
     * acelasi cursor (lipsa), ar fi o bucla peste aceeasi pagina. Se opreste, si marcajul NU
     * avanseaza — la trecerea urmatoare se reia fereastra.
     */
    if (typeof urmatorul !== "string" || urmatorul === "") {
      return { pachete, ok: false, pagini: pagini + 1 };
    }
    /* ⚠ Se trimite inapoi EXACT cum a venit: cursorul e opac. */
    cursor = urmatorul;

    await new Promise((gata) => setTimeout(gata, PAUZA_INTRE_PAGINI_MS));
  }

  /*
   * ⚠ S-AU TERMINAT PAGINILE INGADUITE, dar mai sunt. Marcajul NU are voie sa sara la „acum",
   * altfel comenzile necitite raman in urma ferestrei pentru totdeauna — chiar incidentul pentru
   * care exista `marcaj.ts`.
   */
  return { pachete, ok: false, pagini };
}
