import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { cheiEticheta, cheieEticheta } from "@/lib/gls/eticheta";
import { cheieOperatie } from "@/lib/operatii/registru";
import {
  eroriRetiparire,
  felulEtichetei,
  idRetiparite,
  pdfDinRetiparire,
  retipareste,
  type GlsConfig,
} from "@/lib/gls/client";
import { logError } from "@/lib/error-logger";

/**
 * Eticheta GLS.
 *
 * ═══ INTAI DIN R2, SI ABIA APOI DE LA GLS ═══
 *
 * Copia de pe CDN se da instantaneu, merge si cand MyGLS e picat, si nu consuma
 * niciun apel. De aia se incearca prima.
 *
 * ⚠ Cand lipseste, se cere de la GLS cu `GetPrintedLabels` — NU cu `PrintLabels`.
 * A doua ar crea un al DOILEA colet, real si facturat; prima primeste
 * `ParcelIdList` si nu poate crea nimic, fiindca cererea ei nu are niciun camp
 * prin care sa descrii un colet nou.
 *
 * (Forma dintai a integrarii spunea ca eticheta se pierde definitiv daca n-o
 * salvezi la creare. Asa se poarta pluginul de WooCommerce, care nici nu cheama
 * metoda asta — nu asa se poarta API-ul.)
 *
 * ═══ ⚠ DOUA PAZE, INDEPENDENTE ═══
 *
 * O eticheta AWB contine numele, adresa si telefonul cumparatorului — date
 * personale ale unui TERT, nu ale comerciantului.
 *
 * 1. **Cheia din R2 nu se poate ghici**: are o semnatura HMAC din secretul
 *    serverului (vezi `cheieEticheta`). Cine stie cele doua UUID-uri — iar
 *    comerciantul le stie pe ale lui, si un fost angajat la fel — tot nu poate
 *    compune adresa.
 * 2. **Ruta cere sesiune si proprietate**, aici.
 *
 * Sunt independente dinadins: daca vreodata un URL scapa public, tot nu se poate
 * ghici altul; daca cineva deduce structura cheii, ruta tot cere autentificare.
 *
 * ⚠ `Cache-Control: private, no-store` — altfel un intermediar sau CDN-ul ar
 * putea tine PDF-ul cu datele cumparatorului.
 */
/**
 * Eticheta ceruta de la GLS, cand copia din CDN lipseste.
 *
 * ⚠ Configul se citeste cu SERVICE ROLE: vederea `store_settings` nu decripteaza
 * pentru `authenticated`, deci pe clientul utilizatorului parola ar veni
 * `enc.v1.…` si GLS ar raspunde „autentificare esuata". Proprietatea magazinului
 * s-a verificat deja, cu clientul utilizatorului, inainte de a se ajunge aici.
 *
 * Intoarce `null` la orice esec, dinadins: apelantul are deja mesajul lui, iar un
 * PDF de rezerva nu merita sa produca o eroare care il trimite pe om altundeva.
 */
type EtichetaCeruta = { continut: Buffer; completa: boolean };

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
     * `Labels` vine cu DOUA etichete, iar al treilea sta in
     * `GetPrintedLabelsErrorList`. Pana acum `eroriRetiparire` nici nu se chema
     * pe drumul asta (era doar in ramura „fara PDF"), deci eroarea disparea fara
     * log si fara mesaj — iar fisierul incomplet se urca in R2 si era servit de
     * acolo la nesfarsit, fiindca `dinGls` nu mai era chemat niciodata.
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
      /* Se da omului ce a venit, dar NU se pune la loc in CDN: altfel copia
         incompleta ar inlocui pentru totdeauna incercarea de a le cere din nou. */
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const businessId = searchParams.get("businessId");

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Parametri lipsa" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  /* Comanda trebuie sa fie a magazinului SI sa aiba AWB — altfel n-are eticheta. */
  const { data: order } = await supabase
    .from("orders").select("id, order_number, gls_awb_number")
    .eq("id", orderId).eq("business_id", businessId).single();

  const awb = (order as { gls_awb_number?: string | null } | null)?.gls_awb_number;
  if (!awb) return NextResponse.json({ error: "Comanda nu are AWB GLS" }, { status: 404 });

  /*
   * ⚠ Se cauta sub AMANDOUA formele. Comerciantul poate fi schimbat formatul de
   * imprimanta dupa emitere, iar eticheta veche sta unde a fost scrisa: cheia
   * poarta acum extensia, deci ZPL-ul si PDF-ul aceleiasi comenzi nu se mai
   * calca unul pe altul.
   */
  const felConfigurat = await felulConfigurat(businessId);
  const cheiPosibile = [
    cheieEticheta(businessId, orderId, felConfigurat.ext),
    ...cheiEticheta(businessId, orderId).filter(
      (k) => k !== cheieEticheta(businessId, orderId, felConfigurat.ext),
    ),
  ];

  let continut: Buffer | null = null;
  let fel = felConfigurat;
  for (const k of cheiPosibile) {
    const gasit = await getFromR2(k);
    if (gasit && gasit.length > 0) {
      continut = gasit;
      fel = k.endsWith(".zpl")
        ? { ext: "zpl" as const, tipMime: "application/vnd.zebra.zpl" }
        : { ext: "pdf" as const, tipMime: "application/pdf" };
      break;
    }
  }

  if (!continut) {
    /*
     * Lipseste din CDN: AWB emis inainte de salvare, sau o urcare picata atunci.
     * Se cere de la GLS, cu `ParcelId`-urile pastrate in registrul de operatii.
     */
    const cerut = await dinGls(businessId, orderId);
    if (!cerut) {
      return NextResponse.json(
        { error: "Eticheta nu a putut fi obtinuta pentru aceasta comanda. O gasesti in contul MyGLS, la coletul " + awb },
        { status: 404 },
      );
    }
    continut = cerut.continut;
    fel = felConfigurat;
    /*
     * Se pune la loc in CDN, ca urmatoarea descarcare sa nu mai treaca pe la GLS.
     * Esecul NU opreste raspunsul: omul are deja fisierul in mana, si l-am trimite
     * degeaba inapoi cu o eroare despre o copie de rezerva.
     *
     * ⚠ DOAR daca e COMPLETA. O retiparire partiala salvata aici ar fi servita
     * pentru totdeauna, iar `dinGls` n-ar mai fi chemat niciodata.
     */
    if (cerut.completa) {
      try {
        await uploadToR2(continut, cheieEticheta(businessId, orderId, fel.ext), fel.tipMime, "private, no-store");
      } catch {
        /* Ramane doar mai lent data viitoare. */
      }
    }
  }

  return new NextResponse(new Uint8Array(continut), {
    headers: {
      "Content-Type": fel.tipMime,
      "Content-Disposition": `attachment; filename="eticheta-gls-${awb}.${fel.ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Ce fel de eticheta produce configurarea de ACUM a magazinului. */
async function felulConfigurat(businessId: string): Promise<{ ext: "pdf" | "zpl"; tipMime: string }> {
  const { data } = await createAdminClient()
    .from("store_settings").select("gls_config").eq("business_id", businessId).single();
  return felulEtichetei((data?.gls_config as GlsConfig | null)?.tip_imprimanta);
}
