import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { GlsConfig } from "./client";

/**
 * Rambursul unui colet GLS deja emis, stins cand comanda se plateste online.
 *
 * ═══ ⚠ DE CE EXISTA: CUMPARATORUL PLATEA DE DOUA ORI ═══
 *
 * Comanda pleaca cu plata la livrare, comerciantul emite AWB-ul, si abia dupa
 * aceea clientul plateste online: un link de plata trimis de magazin, o
 * reincercare reusita la procesator, o comanda de marketplace incasata mai
 * tarziu. Coletul e deja la GLS cu suma veche pe el, deci curierul mai incaseaza
 * o data la usa bani pe care magazinul ii are.
 *
 * GLS documenteaza metoda exact pentru asta (`ModifyCOD`, pagina 29), iar
 * `CODAmount: 0` inseamna „nu mai incasa nimic”. Pana azi n-o chema nimeni.
 *
 * ═══ ⚠ DE CE NU STA IN `gls.actions.ts` ═══
 *
 * Fisierul acela e `"use server"`, si acolo FIECARE export devine un endpoint
 * apelabil din browser. Fiecare actiune de acolo isi cere singura proprietarul
 * magazinului, dar functia asta se cheama dintr-un webhook de plata, unde nu
 * exista nicio sesiune si n-ar putea trece de o asemenea poarta. Pusa totusi
 * acolo, ar fi fost un endpoint public care stinge rambursul oricarei comenzi al
 * carei id il ghicesti. Vezi [[use-server-expune-fiecare-export]].
 *
 * ═══ ⚠ NU POATE STRICA PLATA ═══
 *
 * Se cheama dupa ce randul s-a schimbat, prin `dupaRaspuns`, isi inghite singura
 * greselile si nimeni nu o asteapta. O cadere aici lasa exact starea de dinainte:
 * colet cu ramburs, comanda platita, si un strigat in jurnal.
 */
export function stingeRambursulGlsDupaPlata(businessId: string, orderId: string): void {
  dupaRaspuns(() => stinge(businessId, orderId), "stingeRambursulGlsDupaPlata", businessId);
}

type Admin = SupabaseClient<Database>;
type MediuEmitere = { sandbox?: boolean; tara?: string } | null;

async function stinge(businessId: string, orderId: string): Promise<void> {
  const [{ createAdminClient }, { logError }, { glsGata, modificaRamburs }, { cheieOperatie }] =
    await Promise.all([
      import("@/lib/supabase/admin"),
      import("@/lib/error-logger"),
      import("./client"),
      import("@/lib/operatii/registru"),
    ]);

  const admin = createAdminClient() as Admin;

  const { data: comanda, error: eComanda } = await admin
    .from("orders")
    .select("gls_awb_number")
    .eq("id", orderId)
    /* ⚠ Filtrul e AUTORIZARE, nu optimizare: clientul poarta cheia de service role. */
    .eq("business_id", businessId)
    .maybeSingle();

  /*
   * ⚠ O citire picata NU se confunda cu „n-are AWB”. Prima inseamna „nu stim”, si
   * atunci tacerea ar ascunde chiar cazul pentru care exista fisierul asta.
   */
  if (eComanda) {
    await logError({
      action: "gls.stingeRamburs",
      message: `nu s-a putut citi comanda pentru a stinge rambursul GLS: ${eComanda.message}`,
      details: { orderId },
      businessId,
      severity: "warning",
    });
    return;
  }

  const awb = ((comanda?.gls_awb_number as string | null) ?? "").trim();
  /* Fara AWB nu exista colet la GLS: comanda s-a platit inainte de expediere, ca de obicei. */
  if (!awb) return;

  const { data: setari } = await admin
    .from("store_settings")
    .select("gls_config")
    .eq("business_id", businessId)
    .maybeSingle();

  const config = (setari?.gls_config ?? null) as GlsConfig | null;
  if (!glsGata(config)) {
    await logError({
      action: "gls.stingeRamburs",
      message:
        `Comanda are AWB GLS ${awb} si tocmai a fost platita online, dar configurarea GLS nu mai e `
        + "completa, deci rambursul NU s-a putut stinge. Curierul va incasa suma veche la livrare.",
      details: { orderId, awb },
      businessId,
      severity: "critical",
    });
    return;
  }

  const emitere = await detaliileEmiterii(admin, businessId, cheieOperatie("awb", "gls", orderId));

  /*
   * ⚠ Cand STIM ca n-a fost ramburs, nu se cheama nimic.
   *
   * `ramburs: 0` in registru e o afirmatie, nu o lipsa: coletul a plecat fara
   * plata la livrare, deci nu e nimic de stins si un apel ar fi zgomot.
   * `undefined` inseamna „AWB emis inainte ca suma sa fie pastrata”, si acolo se
   * cheama: `CODAmount: 0` pe un colet fara ramburs nu strica nimic, pe cand
   * tacerea ar costa cat o incasare dubla.
   */
  if (emitere.ramburs === 0) return;

  /*
   * ⚠ ACELASI MEDIU IN CARE S-A EMIS.
   *
   * Productia si mediul de test sunt baze SEPARATE, la fel cele sapte tari. Un
   * `ModifyCOD` trimis in alta parte ar raspunde „colet negasit” pentru un colet
   * care chiar pleaca spre client, cu rambursul lui neatins, iar noi am fi
   * raportat ca s-a rezolvat. Aceeasi paza ca la anulare.
   */
  const nepotrivire = nepotrivireDeMediu(emitere.mediu, config);
  if (nepotrivire) {
    await logError({
      action: "gls.stingeRamburs",
      message:
        `Comanda a fost platita online, dar rambursul AWB-ului GLS ${awb} NU s-a putut stinge: ${nepotrivire}`,
      details: { orderId, awb },
      businessId,
      severity: "critical",
    });
    return;
  }

  try {
    await modificaRamburs(config, awb, 0);
  } catch (e) {
    /*
     * ⚠ SEVERITATE CRITICA, si nu de complezenta.
     *
     * Ce ramane dupa esecul asta e un colet care incaseaza la usa bani deja
     * incasati. Comerciantul trebuie sa intre in MyGLS si sa schimbe suma de
     * mana, iar pentru asta trebuie sa AFLE: nimic altceva din aplicatie nu i-o
     * spune, fiindca din toate celelalte unghiuri comanda arata platita.
     */
    await logError({
      action: "gls.stingeRamburs",
      message:
        `Comanda a fost platita online, dar rambursul AWB-ului GLS ${awb} NU s-a putut stinge: `
        + `${(e as Error).message}. Schimba suma in contul MyGLS, altfel curierul incaseaza inca o data.`,
      details: { orderId, awb },
      businessId,
      severity: "critical",
    });
  }
}

/**
 * Ce s-a scris in registru la emitere: suma de ramburs si mediul.
 *
 * ⚠ Se ia randul `reusit` cel mai NOU. Indexul unic al registrului e partial,
 * deci dupa o anulare pot exista mai multe randuri cu aceeasi cheie, iar cel
 * vechi ar descrie un colet care nu mai exista.
 */
async function detaliileEmiterii(
  admin: Admin,
  businessId: string,
  cheie: string,
): Promise<{ ramburs: number | undefined; mediu: MediuEmitere }> {
  const { data } = await admin
    .from("operatii_externe")
    .select("detalii")
    .eq("business_id", businessId)
    .eq("cheie", cheie)
    .eq("stare", "reusit")
    .order("creat_la", { ascending: false })
    .limit(1);

  const detalii = data?.[0]?.detalii as { ramburs?: unknown; mediu?: MediuEmitere } | null;
  const suma = Number(detalii?.ramburs);
  return {
    ramburs: Number.isFinite(suma) && suma >= 0 ? suma : undefined,
    mediu: detalii?.mediu ?? null,
  };
}

/**
 * ⚠ Geamana celei din `gls.actions.ts`, si scrisa separat DINADINS.
 *
 * Acolo raspunde la „pot ANULA coletul de aici?”, aici la „pot schimba suma?”.
 * Sunt aceeasi socoteala azi, dar nu si aceeasi intrebare, iar `gls.actions.ts` e
 * un fisier `"use server"`: importat, ar aduce in webhookul de plata toate
 * actiunile lui. Vezi antetul fisierului.
 *
 * Se blocheaza DOAR directia periculoasa: coletul emis in PRODUCTIE, intrebat
 * acum pe mediul de test. Invers, coletul de „atunci” e fictiv si nu e nimic de
 * stricat.
 */
function nepotrivireDeMediu(mediu: MediuEmitere, config: { sandbox?: boolean; tara?: string }): string | null {
  if (!mediu) return null;
  const acum = { sandbox: !!config.sandbox, tara: (config.tara || "RO").toUpperCase() };
  const atunci = { sandbox: !!mediu.sandbox, tara: (mediu.tara || "RO").toUpperCase() };
  if (acum.sandbox === atunci.sandbox && acum.tara === atunci.tara) return null;
  if (atunci.sandbox) return null;

  const nume = (m: { sandbox: boolean; tara: string }) =>
    `${m.tara}, ${m.sandbox ? "mediu de test" : "productie"}`;
  return (
    `coletul a fost emis pe ${nume(atunci)}, iar integrarea e acum pe ${nume(acum)}. `
    + "Sunt sisteme separate, deci schimbarea facuta acum n-ar atinge coletul real."
  );
}
