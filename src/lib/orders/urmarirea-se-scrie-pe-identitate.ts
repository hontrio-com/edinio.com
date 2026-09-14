import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";

type Modificari = Database["public"]["Tables"]["orders"]["Update"];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * URMARIREA SE SCRIE PE EXPEDIEREA PE CARE A CITIT-O            (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CE ERA. Toate cele treisprezece cronuri de urmarire fac acelasi lucru: citesc un lot de
 * comenzi cu identitatea expedierii (AWB, `packet_id`, `consignment_id`), cheama furnizorul, si
 * scriu inapoi starea dupa `id` si `business_id`. Intre citire si scriere sta un apel extern, iar
 * intre prima si ultima comanda a unei rulari trec zeci de secunde (bugetele sunt de 15 pana la 50
 * de secunde, masurate in fiecare fisier).
 *
 * Daca in fereastra aia comanda primeste ALTA expediere (comerciantul detaseaza AWB-ul si emite
 * din nou), starea veche ateriza peste cea noua. Si nu e cosmetic: un cod FINAL vechi scos
 * `eStareFinala` pe expedierea NOUA din urmarire pentru totdeauna, tacut.
 *
 * ═══ ⚠ DE CE NU E DE AJUNS SA SE ADAUGE CONDITIA PE AWB ═══
 *
 * Fiindca in aproape toate cronurile starea si MARCAJUL DE ROTATIE sunt aceeasi instructiune:
 *
 *     .update({ dhl_status_code: …, dhl_status_checked_at: … })
 *
 * Marcajul e singurul lucru care face rotatia sa inainteze, iar fiecare dintre fisierele acelea
 * scrie pe larg ce se intampla fara el: randul ramane cu marcajul `NULL`, iese PRIMUL la fiecare
 * rulare, si o suta douazeci de asemenea randuri blocheaza urmarirea intregii platforme, fara
 * nicio eroare, cu cronul raportand vesel ca a lucrat.
 *
 * Deci o conditie pusa mecanic pe tot `update`-ul ar fi schimbat un defect rar (stare veche peste
 * expediere noua) intr-unul permanent si tacut (coada infometata). Ajutorul asta le desparte:
 *
 *   1. starea se scrie SUB conditia pe identitate, si isi cere randurile inapoi;
 *   2. daca n-a prins niciun rand, marcajul se scrie SINGUR, neconditionat.
 *
 * Asa marcajul avanseaza intotdeauna, iar starea nu mai poate ateriza pe alta expediere.
 *
 * ═══ ⚠ IDENTITATEA NU E „AWB-UL" ═══
 *
 * E alta la fiecare cron, si un tipar copiat mecanic ar fi dat o conditie mereu adevarata la trei
 * dintre ele, adica decor:
 *
 *   * Packeta se citeste pe `packeta_packet_id`, nu pe un AWB;
 *   * Pall-Ex pe `pallex_consignment_id`, NICIODATA pe `pallex_awb_number`, fiindca acela e chiar
 *     campul pe care cronul il scrie cand afla codul;
 *   * eColet, partea de emitere, pe `ecolet_order_to_send_id`: acolo `ecolet_awb_number` e nul
 *     prin constructie, deci o conditie pe el ar fi fost mereu adevarata.
 *
 * De aceea coloana se da de la apelant, nu se ghiceste aici.
 *
 * ═══ ⚠ CE NU ACOPERA, SI SE SCRIE PE FATA ═══
 *
 * TRANZITIA DE STATUS nu trece pe aici. Ea merge prin `aplica_tranzitia_comenzii`, care nu are
 * niciun parametru de AWB, deci nu i se poate cere sa compare identitatea. Un stare veche
 * `delivered` care ajunge acolo muta comanda si declanseaza facturarea automata. Ingustarea aia
 * cere o migratie pe o functie folosita de FIECARE drum de marketplace, si e o lucrare de sine
 * statatoare. Aici se inchide scrierea de stare si de identitate; tranzitia ramane deschisa, si e
 * numita ca atare ca sa nu para inchisa.
 */
/**
 * ⚠ CAND SE CHEAMA, SI CAND NU. Masurat pe cronuri: `marcheazaVerificat` e chemata de cinci pana
 * la sase ori in fiecare fisier, dar in aproape toate cu `null` drept cod nou, adica „am ajuns la
 * expedierea asta, du-o la coada". Acolo scrierea pastreaza codul VECHI
 * (`codNou ?? o.fedex_status_code`), deci n-are ce ateriza gresit pe alta expediere, iar o conditie
 * pe identitate ar putea doar sa impiedice marcajul, adica exact infometarea cozii.
 *
 * Deci: pe drumurile fara cod nou se scrie marcajul direct, ca pana acum. Ajutorul asta se cheama
 * NUMAI cand chiar exista o stare noua de scris.
 */
export async function scrieUrmarirea(
  admin: SupabaseClient<Database>,
  p: {
    orderId: string;
    businessId: string;
    /** Coloana pe care s-a CITIT expedierea, si valoarea ei din clipa citirii. */
    identitate: { coloana: string; valoare: string | number | null };
    /** Starea: ce n-are voie sa ajunga pe alta expediere. */
    stare: Modificari;
    /** Marcajul de rotatie: ce trebuie scris ORICUM. */
    marcaj: Modificari;
    /** Pentru jurnal: `gls-tracking`, `dhl-tracking`. */
    actiune: string;
    /** Pentru jurnal, cand exista. */
    orderNumber?: string | null;
  },
): Promise<{ scris: boolean }> {
  /*
   * ⚠ IDENTITATEA LIPSA NU INSEAMNA „SCRIE ORICUM".
   *
   * Un `null` in conditie n-ar potrivi nimic in PostgREST (`.eq` pe null nu e `is null`), deci
   * scrierea ar cadea tacut si randul ar arata ca o nepotrivire. Se scrie atunci doar marcajul,
   * care e purtarea corecta: nu stim pe ce expediere am citit, deci n-avem ce confrunta.
   */
  if (p.identitate.valoare === null || p.identitate.valoare === "") {
    return { scris: await doarMarcajul(admin, p) };
  }

  const { data, error } = await admin
    .from("orders")
    .update({ ...p.stare, ...p.marcaj })
    .eq("id", p.orderId)
    /* ⚠ Nu e un filtru de prisos, e AUTORIZARE: cronurile scriu cu rol de SERVICIU. */
    .eq("business_id", p.businessId)
    .eq(p.identitate.coloana, p.identitate.valoare)
    .select("id");

  if (error) {
    await logError({
      action: p.actiune,
      message: `urmarirea nu s-a scris pentru comanda ${p.orderNumber ?? p.orderId}: ${error.message}. `
        + "Expedierea ramane in capul cozii si va fi reluata la fiecare rulare.",
      details: { orderId: p.orderId, identitate: p.identitate.coloana },
      businessId: p.businessId,
      severity: "warning",
    });
    return { scris: false };
  }

  if (data && data.length > 0) return { scris: true };

  /*
   * ⚠ ZERO RANDURI INSEAMNA CA EXPEDIEREA S-A SCHIMBAT SUB NOI.
   *
   * Comerciantul a detasat AWB-ul si a emis din nou cat timp noi intrebam furnizorul. Starea
   * citita e a expedierii VECHI si n-are ce cauta pe cea noua. Dar marcajul tot trebuie scris,
   * altfel randul ramane in capul cozii pentru totdeauna.
   *
   * ⚠ Si se scrie in jurnal, nu doar in consola: o cursa care se repeta e o informatie, iar un
   * `console.error` dintr-un cron nu-l citeste nimeni niciodata.
   */
  await logError({
    action: p.actiune,
    message: `expedierea comenzii ${p.orderNumber ?? p.orderId} s-a schimbat in timpul urmaririi `
      + `(${p.identitate.coloana}); starea citita NU s-a scris, ca sa nu ajunga pe expedierea noua.`,
    details: { orderId: p.orderId, identitate: p.identitate.coloana },
    businessId: p.businessId,
    severity: "warning",
  });
  /*
   * ⚠ Marcajul se scrie, dar rezultatul ramane `scris: false`: apelantul trebuie sa stie ca
   * STAREA nu a ajuns pe comanda, ca sa nu socoteasca expedierea drept prelucrata.
   */
  await doarMarcajul(admin, p);
  return { scris: false };
}

/** Marcajul de rotatie, neconditionat. Se scrie ORICUM, si asta e chiar regula. */
async function doarMarcajul(
  admin: SupabaseClient<Database>,
  p: { orderId: string; businessId: string; marcaj: Modificari; actiune: string; orderNumber?: string | null },
): Promise<boolean> {
  const { error } = await admin
    .from("orders")
    .update(p.marcaj)
    .eq("id", p.orderId)
    .eq("business_id", p.businessId);

  if (error) {
    await logError({
      action: p.actiune,
      message: `marcajul de verificare nu s-a scris pentru comanda ${p.orderNumber ?? p.orderId}: ${error.message}. `
        + "Expedierea ramane in capul cozii si va fi reluata la fiecare rulare.",
      details: { orderId: p.orderId },
      businessId: p.businessId,
      severity: "warning",
    });
    return false;
  }
  return true;
}

/**
 * Marcajul pentru un LOT de comenzi, neconditionat.
 *
 * ⚠ EXISTA FIINDCA DOI CRONURI SCRIU IN LOT, si acolo nu exista o singura identitate de pus in
 * conditie: FAN Courier si eColet (partea de urmarire) cer statusuri pentru zeci de AWB-uri
 * deodata, iar furnizorul OMITE din raspuns numerele pe care nu le cunoaste. Marcand doar ce s-a
 * intors, cele omise ar ramane cu marcajul `NULL` si ar bloca permanent capul cozii.
 *
 * Deci acolo regula se imparte in doua: marcajul pentru TOATE cele cerute, prin functia asta, si
 * starea pe fiecare comanda in parte, prin `scrieUrmarirea`.
 */
export async function marcheazaLotul(
  admin: SupabaseClient<Database>,
  p: { ids: string[]; businessId: string; marcaj: Modificari; actiune: string },
): Promise<void> {
  if (p.ids.length === 0) return;
  const { error } = await admin
    .from("orders")
    .update(p.marcaj)
    .in("id", p.ids)
    .eq("business_id", p.businessId);

  if (error) {
    await logError({
      action: p.actiune,
      message: `marcajul de verificare nu s-a scris pentru ${p.ids.length} comenzi: ${error.message}. `
        + "Ele raman in capul cozii si vor fi reluate la fiecare rulare.",
      details: { cate: p.ids.length },
      businessId: p.businessId,
      severity: "warning",
    });
  }
}
