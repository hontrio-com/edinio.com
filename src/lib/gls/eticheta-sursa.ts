import { createAdminClient } from "@/lib/supabase/admin";
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { cheiEticheta, cheieEticheta } from "@/lib/gls/eticheta";
import { cheieOperatie } from "@/lib/operatii/registru";
import {
  eroriRetiparire, felulEtichetei, idRetiparite, pdfDinRetiparire, retipareste,
  type GlsConfig,
} from "@/lib/gls/client";
import { logError } from "@/lib/error-logger";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETA GLS: INTAI DIN R2, SI ABIA APOI DE LA EI          (mutata 21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ FISIERUL ASTA A FOST SCOS DIN RUTA, si nu ca sa arate ruta mai scurta: de cand
 * exista descarcarea in masa, acelasi drum e chemat din doua locuri. Lasat in ruta,
 * lotul ar fi trebuit sa-l scrie a doua oara — iar a doua copie a unui drum cu
 * retiparire partiala si copie in CDN s-ar fi despartit de prima la prima reparatie.
 * Ruta cheama acum exact ce cheama si lotul. Vezi si `raspuns-eticheta.ts`.
 *
 * ═══ INTAI DIN R2 ═══
 *
 * Copia de pe CDN se da instantaneu, merge si cand MyGLS e picat, si nu consuma
 * niciun apel. De aia se incearca prima.
 *
 * ⚠ Cand lipseste, se cere de la GLS cu `GetPrintedLabels` — NU cu `PrintLabels`.
 * A doua ar crea un al DOILEA colet, real si facturat; prima primeste `ParcelIdList`
 * si nu poate crea nimic, fiindca cererea ei n-are niciun camp prin care sa descrii
 * un colet nou.
 *
 * (Forma dintai a integrarii spunea ca eticheta se pierde definitiv daca n-o salvezi
 * la creare. Asa se poarta pluginul de WooCommerce, care nici nu cheama metoda asta —
 * nu asa se poarta API-ul.)
 *
 * ⚠ Cheia din R2 nu se poate ghici: are o semnatura HMAC din secretul serverului
 * (vezi `cheieEticheta`). Cine stie cele doua UUID-uri tot nu poate compune adresa.
 */

export type FelEticheta = { ext: "pdf" | "zpl"; tipMime: string };

/** Ce fel de eticheta produce configurarea de ACUM a magazinului. */
export async function felulConfigurat(businessId: string): Promise<FelEticheta> {
  const { data } = await createAdminClient()
    .from("store_settings").select("gls_config").eq("business_id", businessId).single();
  return felulEtichetei((data?.gls_config as GlsConfig | null)?.tip_imprimanta);
}

type EtichetaCeruta = { continut: Buffer; completa: boolean };

/**
 * Eticheta ceruta de la GLS, cand copia din CDN lipseste.
 *
 * ⚠ Configul se citeste cu SERVICE ROLE: vederea `store_settings` nu decripteaza
 * pentru `authenticated`, deci pe clientul utilizatorului parola ar veni `enc.v1.…`
 * si GLS ar raspunde „autentificare esuata". Proprietatea magazinului s-a verificat
 * deja, cu clientul utilizatorului, inainte de a se ajunge aici.
 *
 * Intoarce `null` la orice esec, dinadins: apelantul are deja mesajul lui, iar un PDF
 * de rezerva nu merita sa produca o eroare care il trimite pe om altundeva.
 */
async function dinGls(businessId: string, orderId: string): Promise<EtichetaCeruta | null> {
  try {
    const admin = createAdminClient();

    const [{ data: settings }, { data: operatii }] = await Promise.all([
      admin.from("store_settings").select("gls_config").eq("business_id", businessId).single(),
      admin
        .from("operatii_externe")
        .select("detalii")
        .eq("business_id", businessId)
        .eq("cheie", cheieOperatie("awb", "gls", orderId))
        .eq("stare", "reusit")
        .order("creat_la", { ascending: false })
        .limit(1),
    ]);

    const config = settings?.gls_config as GlsConfig | null;
    if (!config?.enabled || !config.username || !config.password) return null;

    const detalii = operatii?.[0]?.detalii as { parcelIds?: unknown } | null;
    const ids = (Array.isArray(detalii?.parcelIds) ? detalii.parcelIds : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return null;

    const raspuns = await retipareste(config, ids);
    const continut = pdfDinRetiparire(raspuns);
    if (!continut || continut.length === 0) {
      const erori = eroriRetiparire(raspuns);
      await logError({
        action: "gls.retipareste",
        message: `GLS nu a intors eticheta pentru comanda: ${erori.join("; ") || "raspuns fara continut"}`,
        details: { orderId, businessId, parcelIds: ids },
        businessId,
        severity: "warning",
      });
      return null;
    }

    /*
     * ⚠ O RETIPARIRE POATE FI PARTIALA, si asta nu se vede din „am primit octeti".
     *
     * La o comanda cu trei colete din care unul a fost sters din contul MyGLS,
     * `Labels` vine cu DOUA etichete, iar al treilea sta in `GetPrintedLabelsErrorList`.
     * Pana la reparatie `eroriRetiparire` nici nu se chema pe drumul asta, deci eroarea
     * disparea fara log si fara mesaj — iar fisierul incomplet se urca in R2 si era
     * servit de acolo la nesfarsit, fiindca `dinGls` nu mai era chemat niciodata.
     *
     * Comerciantul lipea doua etichete pe trei colete si afla de la curier.
     */
    const primite = idRetiparite(raspuns);
    const lipsa = ids.filter((id) => !primite.includes(id));
    if (lipsa.length > 0) {
      await logError({
        action: "gls.retipareste",
        message:
          `GLS a retiparit doar ${primite.length} din ${ids.length} colete pentru comanda; `
          + `lipsesc ${lipsa.join(", ")}. ${eroriRetiparire(raspuns).join("; ")}`,
        details: { orderId, businessId, parcelIds: ids, primite, lipsa },
        businessId,
        severity: "warning",
      });
      /* Se da omului ce a venit, dar NU se pune la loc in CDN: altfel copia incompleta
         ar inlocui pentru totdeauna incercarea de a le cere din nou. */
      return { continut, completa: false };
    }
    return { continut, completa: true };
  } catch (e) {
    await logError({
      action: "gls.retipareste",
      message: `Retiparirea etichetei a esuat: ${(e as Error).message}`,
      details: { orderId, businessId },
      businessId,
      severity: "warning",
    });
    return null;
  }
}

/**
 * Octetii etichetei si felul ei: din CDN daca exista, altfel de la GLS.
 *
 * Se cheama DUPA ce s-a dovedit ca magazinul e al celui logat si ca ordinea are AWB.
 */
export async function etichetaGls(
  businessId: string, orderId: string,
): Promise<{ continut: Buffer; fel: FelEticheta } | null> {
  /*
   * ⚠ Se cauta sub AMANDOUA formele. Comerciantul poate fi schimbat formatul de
   * imprimanta dupa emitere, iar eticheta veche sta unde a fost scrisa: cheia poarta
   * acum extensia, deci ZPL-ul si PDF-ul aceleiasi comenzi nu se mai calca.
   */
  const felConfigurat = await felulConfigurat(businessId);
  const cheiaConfigurata = cheieEticheta(businessId, orderId, felConfigurat.ext);
  const cheiPosibile = [
    cheiaConfigurata,
    ...cheiEticheta(businessId, orderId).filter((k) => k !== cheiaConfigurata),
  ];

  for (const k of cheiPosibile) {
    const gasit = await getFromR2(k);
    if (gasit && gasit.length > 0) {
      return {
        continut: gasit,
        fel: k.endsWith(".zpl")
          ? { ext: "zpl", tipMime: "application/vnd.zebra.zpl" }
          : { ext: "pdf", tipMime: "application/pdf" },
      };
    }
  }

  /*
   * Lipseste din CDN: AWB emis inainte de salvare, sau o urcare picata atunci.
   * Se cere de la GLS, cu `ParcelId`-urile pastrate in registrul de operatii.
   */
  const cerut = await dinGls(businessId, orderId);
  if (!cerut) return null;

  /*
   * Se pune la loc in CDN, ca urmatoarea descarcare sa nu mai treaca pe la GLS.
   * Esecul NU opreste raspunsul: omul are deja fisierul in mana.
   *
   * ⚠ DOAR daca e COMPLETA. O retiparire partiala salvata aici ar fi servita pentru
   * totdeauna, iar `dinGls` n-ar mai fi chemat niciodata.
   */
  if (cerut.completa) {
    try {
      await uploadToR2(
        cerut.continut, cheieEticheta(businessId, orderId, felConfigurat.ext),
        felConfigurat.tipMime, "private, no-store",
      );
    } catch {
      /* Ramane doar mai lent data viitoare. */
    }
  }
  return { continut: cerut.continut, fel: felConfigurat };
}

/**
 * Numai octetii, pentru lotul de etichete.
 *
 * ⚠ ZPL-ul iese de aici ca octeti obisnuiti, si BINE face: cine il lipeste hotaraste
 * ce e de facut cu el, uitandu-se la primii patru octeti. O hotarare luata aici, pe
 * extensia scrisa in config, ar fi minit despre o eticheta veche salvata in alt format.
 */
export async function etichetaGlsPentruComanda(
  businessId: string, orderId: string,
): Promise<Uint8Array | null> {
  const r = await etichetaGls(businessId, orderId);
  if (!r) return null;
  const b = r.continut;
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
}
