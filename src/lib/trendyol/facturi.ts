/**
 * Factura comenzii, dusa la Trendyol.
 *
 * ═══ ⚠ CODUL CASEI CREDEA CA TRENDYOL FACTUREAZA CLIENTUL. NU ═══
 *
 * `invoice-auto.actions.ts` spunea, ca regula pentru toate marketplace-urile: „ele incaseaza si
 * factureaza clientul final, deci nu le facturam comenzile; comerciantul le factureaza lor B2B".
 * La About You e adevarat. La Trendyol e GRESIT, si s-a masurat direct pe API-ul lor, pe
 * comenzile reale ale contului:
 *
 *     invoiceAddress = numele si adresa CLIENTULUI (nu ale Trendyol)
 *     invoiceStatus  = "NotInvoiced"   pe toate cele opt comenzi
 *     invoiceNumber  = ""              pe toate cele opt comenzi
 *
 * `invoiceStatus` si `invoiceNumber` sunt campuri pe care doar VANZATORUL le poate misca. Daca
 * Trendyol ar factura clientul, n-ar exista un loc gol care asteapta numarul nostru.
 *
 * ⚠ CE A COSTAT: niciuna dintre comenzile Trendyol ale comerciantului n-a fost vreodata
 * facturata. Nici la client, nici la ei. Iar lipsa nu se vedea nicaieri, fiindca „nu facturam
 * comenzile de marketplace" arata ca o hotarare, nu ca o scapare.
 *
 * ═══ ⚠ VARIANTA INTERNATIONALA CERE DOAR LINKUL SI PACHETUL ═══
 *
 * Amanasem functia fiindca o serie romaneasca („EDN1234") nu incape in formatul lor de fix 16
 * semne. Formatul ala e al TURCIEI. OpenAPI-ul international spune, citat: „Only requires
 * invoice link and shipment package ID (no invoice number or date fields)."
 *
 * Deci nu exista nimic de potrivit si nimic de inventat.
 *
 * ═══ ⚠ UN SINGUR FOC, SI FARA DRUM INAPOI ═══
 *
 * La al doilea trimis pe acelasi pachet raspund 409, si NU au niciun capat de corectie sau
 * stergere. De-aia urcarea trece prin `cuRegistru` — acelasi tipar ca AWB-ul si ca factura eMAG
 * — iar 409-ul se citeste ca REUSITA, nu ca esec: inseamna ca documentul e deja la ei.
 *
 * ═══ ⚠ SI DE CE SE REHOSTEAZA PDF-UL ═══
 *
 * Ei cer ca linkul sa ramana viu 10 ani in Arabia Saudita si 5 in Emirate; pentru Romania nu
 * scriu niciun termen. Adresa furnizorului de facturare sta insa in spatele acreditarilor
 * comerciantului si poate expira. Deci se aduce PDF-ul cu acreditarile lui, se pune in R2 sub o
 * cheie stabila si de neghicit, si lor li se da adresa aceea.
 *
 * `private, no-store` la incarcare: documentul are numele si adresa CUMPARATORULUI, si n-are ce
 * cauta in memoria vreunui CDN.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { uploadToR2 } from "@/lib/r2";
import { cuRegistru } from "@/lib/operatii/registru";
import { randCitit, EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { cheiaPdfFactura, facturaComenzii, type Factura } from "@/lib/billing/factura-comenzii";
import { isTrendyolError, sendInvoiceLink } from "./client";
import type { TrendyolSyncContext } from "./sync";

type Db = SupabaseClient<Database>;

export type RezultatFactura =
  | { fel: "urcata"; numar: string }
  | { fel: "deja"; numar: string }
  | { fel: "fara_factura" }
  | { fel: "oprit" }
  | { fel: "esec"; mesaj: string };

interface RandComanda {
  id: string;
  smartbill_invoice_number: string | null;
  smartbill_invoice_series: string | null;
  smartbill_invoice_url: string | null;
  oblio_invoice_number: string | null;
  oblio_invoice_series: string | null;
  oblio_invoice_link: string | null;
  fgo_invoice_number: string | null;
  fgo_invoice_series: string | null;
  fgo_invoice_link: string | null;
}

/**
 * Duce factura comenzii la Trendyol.
 *
 * ⚠ `aduPdf` SOSESTE CA ARGUMENT, nu se cheama de aici: fiecare furnizor de facturare are alta
 * autentificare, iar importate toate trei aici, modulele lor ar fi intrat in pachetul cronului
 * Trendyol cu tot cu dependintele lor.
 */
export async function urcaFacturaLaTrendyol(
  admin: Db,
  ctx: TrendyolSyncContext,
  orderId: string,
  aduPdf: (f: Factura) => Promise<ArrayBuffer | { error: string }>,
): Promise<RezultatFactura> {
  try {
    return await urcaCitit(admin, ctx, orderId, aduPdf);
  } catch (e) {
    /* ⚠ O citire picata nu e „comanda nu exista": cronul reia la trecerea urmatoare. */
    if (!(e instanceof EroareCitireBaza)) throw e;
    return { fel: "esec", mesaj: "Baza de date n-a răspuns. Se reia la trecerea următoare." };
  }
}

async function urcaCitit(
  admin: Db,
  ctx: TrendyolSyncContext,
  orderId: string,
  aduPdf: (f: Factura) => Promise<ArrayBuffer | { error: string }>,
): Promise<RezultatFactura> {
  /*
   * ⚠ COMUTATORUL SE CITESTE DE FIECARE DATA, si e stins din start. Raspunderea fiscala e a
   * comerciantului: pana nu spune el, nu emitem si nu urcam nimic in numele lui. Poate emite
   * deja facturile astea de mana, in alta parte — pornite si de aici, ar iesi doua documente
   * fiscale pentru aceeasi marfa.
   */
  if (ctx.config.factureaza_clientul !== true) return { fel: "oprit" };

  const o = randCitit<RandComanda>("trendyol.comandaDeFacturat", await admin.from("orders")
    .select("id, smartbill_invoice_number, smartbill_invoice_series, smartbill_invoice_url, oblio_invoice_number, oblio_invoice_series, oblio_invoice_link, fgo_invoice_number, fgo_invoice_series, fgo_invoice_link")
    .eq("id", orderId).eq("business_id", ctx.businessId).maybeSingle() as never);
  if (!o) return { fel: "esec", mesaj: "Comanda nu a fost găsită." };

  const factura = facturaComenzii(o);
  if (!factura) return { fel: "fara_factura" };

  const side = randCitit<{ id: string; shipment_package_id: string; invoice_uploaded_at: string | null }>(
    "trendyol.pachetulDeFacturat", await admin
      .from("trendyol_orders").select("id, shipment_package_id, invoice_uploaded_at")
      .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle() as never);
  if (!side) return { fel: "esec", mesaj: "Comanda nu are un pachet Trendyol asociat." };
  if (side.invoice_uploaded_at) return { fel: "deja", numar: factura.numar };

  const packageId = Number(side.shipment_package_id);
  if (!Number.isFinite(packageId)) return { fel: "esec", mesaj: "ID pachet Trendyol invalid." };

  const rez = await cuRegistru(
    admin,
    {
      businessId: ctx.businessId,
      orderId,
      fel: "factura",
      furnizor: "trendyol",
      /* ⚠ Numarul facturii intra in cheie: dupa un storno si o reemitere, documentul e ALTUL si
         trebuie sa poata urca. */
      cheie: `trendyol-factura-${orderId}-${factura.numar}`,
    },
    async () => {
      const pdf = await aduPdf(factura);
      if ("error" in pdf) throw new Error(pdf.error);

      const url = await uploadToR2(
        Buffer.from(pdf),
        cheiaPdfFactura("facturi-trendyol", ctx.businessId, orderId, factura.numar),
        "application/pdf",
        /* ⚠ `private, no-store`: documentul are numele si adresa cumparatorului. */
        "private, no-store",
      );

      const r = await sendInvoiceLink(ctx.auth, { invoiceLink: url, shipmentPackageId: packageId });
      if (isTrendyolError(r)) {
        /*
         * ⚠ 409 INSEAMNA CA E DEJA ACOLO, deci REUSITA. Mesajul lor: „The invoice for the
         * package number {N} has already been sent". Citit ca esec, am fi reincercat la
         * nesfarsit un lucru deja facut — si n-am fi marcat niciodata comanda ca facturata.
         */
        if (r.status !== 409) throw new Error(r.error);
      }
      return { referinta: factura.numar, detalii: { url, furnizor: factura.furnizor }, valoare: factura.numar };
    },
    (e) => {
      /*
       * ⚠ SE DEOSEBESTE REFUZUL DOVEDIT DE „NU STIM", si implicitul e „nu stim".
       *
       * O cadere de retea la jumatate poate sa fi lasat linkul PRIMIT la ei. Reincercata,
       * cererea ar lua 409 — ceea ce am trata drept reusita, deci n-ar strica nimic. Dar
       * `necunoscut` cere oricum o privire de om, si aia e alegerea potrivita cand e vorba de
       * un document fiscal.
       */
      const m = (e instanceof Error ? e.message : "").toLowerCase();
      if (m.includes("not found") || m.includes("does not belong") || m.includes("bad request")) return "esuat";
      return "necunoscut";
    },
  );

  const acum = new Date().toISOString();

  /*
   * ⚠ `deja` SE SCRIE LA LOC, si e chiar rostul lui: registrul stie ca s-a facut, dar coloana
   * de pe comanda poate sa fi ramas nescrisa daca prima incercare a picat exact intre trimitere
   * si scriere. Scrierea e idempotenta.
   */
  if (rez.fel === "facut" || rez.fel === "deja") {
    await admin.from("trendyol_orders")
      .update({ invoice_uploaded_at: acum, invoice_number: factura.numar, invoice_error: null, updated_at: acum } as never)
      .eq("id", side.id);
    return { fel: rez.fel === "deja" ? "deja" : "urcata", numar: factura.numar };
  }

  /*
   * ⚠ `blocat` NU e un esec al trimiterii: inseamna ca o operatie identica e in curs sau cu
   * rezultat necunoscut, si ca omul trebuie sa se uite. Se scrie mesajul lui, cuvant cu cuvant,
   * fiindca el spune ce e de facut.
   */
  const mesaj = rez.fel === "blocat" || rez.fel === "eroare"
    ? rez.mesaj
    : "Factura nu s-a putut trimite la Trendyol.";
  await admin.from("trendyol_orders")
    .update({ invoice_error: mesaj, updated_at: acum } as never)
    .eq("id", side.id);
  return { fel: "esec", mesaj };
}

/**
 * Comenzile care au factura si n-au trimis-o inca.
 *
 * ⚠ NUMAI CELE CU PACHET SI CU O FACTURA EMISA. O comanda fara factura nu e o problema — poate
 * inca nu s-a emis; una fara pachet n-are unde sa fie trimisa.
 */
export async function comenziDeFacturat(
  admin: Db, businessId: string, limita = 10,
): Promise<string[]> {
  const randuri = randCitit<{ order_id: string }[]>("trendyol.comenziDeFacturat", await admin
    .from("trendyol_orders").select("order_id")
    .eq("business_id", businessId)
    .is("invoice_uploaded_at", null)
    .not("order_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limita) as never) as unknown as { order_id: string }[] | null;
  return (randuri ?? []).map((r) => r.order_id).filter(Boolean);
}
