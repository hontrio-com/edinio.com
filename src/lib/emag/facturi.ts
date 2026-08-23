/**
 * Factura comenzii, urcata la eMAG.
 *
 * ═══ ⚠ eMAG E ALTFEL DECAT CELELALTE MARKETPLACE-URI ═══
 *
 * La Trendyol si About You, marketplace-ul incaseaza si factureaza el clientul
 * final; comerciantul factureaza marketplace-ul, B2B. De aceea
 * `invoice-auto.actions.ts` sare peste TOATE comenzile de marketplace.
 *
 * La eMAG, comerciantul factureaza CLIENTUL FINAL si trebuie sa incarce factura
 * inapoi la ei. Verificat in documentatia lor: `/order/attachments/save`, „For
 * invoices: use type = 1".
 *
 * Deci regula „nu facturam comenzile de marketplace" nu se aplica aici, si daca ar
 * fi fost lasata sa se aplice, fiecare comanda eMAG ar fi ramas fara factura — la
 * ei si la client. Nu o eroare tehnica, ci una fiscala.
 *
 * ═══ ⚠ EI DESCARCA PDF-UL, NU IL PRIMESC ═══
 *
 * `EmagAtasament.url` e o ADRESA, nu octeti. eMAG vine si ia fisierul de acolo. Iar
 * facturile emise de SmartBill, Oblio si fGO stau in spatele acreditarilor
 * comerciantului — deci adresa lor nu poate fi data mai departe.
 *
 * Se aduce PDF-ul cu acreditarile lui, se pune in R2 sub o cheie de neghicit, si lor
 * li se da adresa aceea. `private, no-store` la incarcare: fisierul contine numele
 * si adresa CUMPARATORULUI, si n-are ce cauta in memoria vreunui CDN un an de zile.
 * Vezi chiar nota din `uploadToR2`, unde implicitul e bun pentru poze si gresit
 * pentru documente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { uploadToR2 } from "@/lib/r2";
import { cuRegistru } from "@/lib/operatii/registru";
import { salveazaAtasamente, isEmagError } from "./client";
import type { ContextEmag } from "./sync";

type Db = SupabaseClient<Database>;

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
  order_source: unknown;
}

export interface Factura {
  furnizor: "smartbill" | "oblio" | "fgo";
  numar: string;
  url: string;
}

/**
 * Care factura are comanda, si de unde se ia.
 *
 * ⚠ PUR SI EXPORTAT. Ordinea furnizorilor e aceeasi ca in `invoice-auto.actions.ts`;
 * o comanda nu poate avea doua facturi, dar daca ar avea, se ia prima gasita — nu se
 * incarca amandoua la eMAG, fiindca acolo ar aparea ca doua documente fiscale pentru
 * aceeasi comanda.
 */
export function facturaComenzii(o: {
  smartbill_invoice_number?: string | null; smartbill_invoice_series?: string | null; smartbill_invoice_url?: string | null;
  oblio_invoice_number?: string | null; oblio_invoice_series?: string | null; oblio_invoice_link?: string | null;
  fgo_invoice_number?: string | null; fgo_invoice_series?: string | null; fgo_invoice_link?: string | null;
}): Factura | null {
  const numar = (serie?: string | null, nr?: string | null) =>
    [(serie ?? "").trim(), (nr ?? "").trim()].filter(Boolean).join("");

  if (o.smartbill_invoice_number && o.smartbill_invoice_url) {
    return {
      furnizor: "smartbill",
      numar: numar(o.smartbill_invoice_series, o.smartbill_invoice_number),
      url: o.smartbill_invoice_url,
    };
  }
  if (o.oblio_invoice_number && o.oblio_invoice_link) {
    return { furnizor: "oblio", numar: numar(o.oblio_invoice_series, o.oblio_invoice_number), url: o.oblio_invoice_link };
  }
  if (o.fgo_invoice_number && o.fgo_invoice_link) {
    return { furnizor: "fgo", numar: numar(o.fgo_invoice_series, o.fgo_invoice_number), url: o.fgo_invoice_link };
  }
  return null;
}

/**
 * Cheia sub care sta PDF-ul in R2.
 *
 * ⚠ DE NEGHICIT, SI STABILA. De neghicit fiindca adresa e singura paza a unui
 * document cu datele cumparatorului: eMAG trebuie sa poata veni sa-l ia, deci nu
 * exista autentificare la mijloc. Stabila fiindca a doua incercare, dupa o cadere de
 * retea, trebuie sa scrie in ACELASI loc — altfel fiecare reincercare ar lasa in
 * urma inca o copie a facturii, pe veci.
 *
 * `orderId` e un UUID, deci are deja 122 de biti de nedeterminare. Numarul facturii
 * intra si el: dupa un storno si o reemitere, documentul e ALTUL si trebuie sa aiba
 * alta adresa, altfel eMAG ar fi luat din memorie versiunea desfiintata.
 */
export function cheiaPdf(businessId: string, orderId: string, numarFactura: string): string {
  const curat = numarFactura.replace(/[^A-Za-z0-9._-]/g, "");
  return `facturi-emag/${businessId}/${orderId}-${curat}.pdf`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   URCAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatFactura =
  | { fel: "urcata"; numar: string }
  | { fel: "deja"; numar: string }
  | { fel: "fara_factura" }
  | { fel: "esec"; mesaj: string };

/**
 * Factura comenzii, dusa la eMAG.
 *
 * ⚠ TRECE PRIN `cuRegistru`. E un efect extern CU UN SINGUR FOC: urcata de doua ori,
 * comanda ar avea la eMAG doua documente fiscale, iar clientul ar primi doua
 * facturi pentru aceeasi marfa. Registrul tine cheia si intoarce `deja` la a doua
 * chemare.
 *
 * ⚠ Cheia contine NUMARUL facturii. O reemitere legitima dupa storno e alt document
 * si trebuie sa poata urca — vezi `cheieDocument` din `billing/refacturare.ts`, unde
 * s-a invatat aceeasi lectie.
 */
export async function urcaFacturaLaEmag(
  admin: Db,
  ctx: ContextEmag,
  orderId: string,
  /**
   * Cum se aduc octetii facturii de la furnizorul care a emis-o.
   *
   * ⚠ SOSESTE CA ARGUMENT, nu se cheama de aici. Fiecare furnizor are alta
   * autentificare, iar importate toate trei in fisierul asta, un modul de facturare
   * ar fi intrat in pachetul cronului eMAG cu tot cu dependintele lui.
   */
  aduPdf: (f: Factura) => Promise<ArrayBuffer | { error: string }>,
): Promise<RezultatFactura> {
  const { data } = await admin.from("orders")
    .select("id, smartbill_invoice_number, smartbill_invoice_series, smartbill_invoice_url, oblio_invoice_number, oblio_invoice_series, oblio_invoice_link, fgo_invoice_number, fgo_invoice_series, fgo_invoice_link, order_source")
    .eq("id", orderId).eq("business_id", ctx.businessId).maybeSingle();

  const o = data as RandComanda | null;
  if (!o) return { fel: "esec", mesaj: "Comanda nu a fost găsită." };

  const factura = facturaComenzii(o);
  if (!factura) return { fel: "fara_factura" };

  const sursa = o.order_source as { emag_order_id?: number; tip?: number | null } | null;
  const emagOrderId = sursa?.emag_order_id;
  if (!Number.isFinite(emagOrderId)) {
    return { fel: "esec", mesaj: "Comanda nu are id eMAG; nu se poate atașa factura." };
  }

  /*
   * ═══ ⚠ `order_type` E OBLIGATORIU, SI NU-L TRIMITEAM ═══
   *
   * Schema lor: `OrderAttachment.required = ["order_type", "url"]`. Fara el, FIECARE
   * urcare de factura ar fi fost respinsa — iar `cuRegistru` ar fi marcat-o „esuata"
   * si ar fi reincercat-o la fiecare trecere, arzand din cele 3 cereri pe secunda ale
   * magazinului pentru un camp lipsa.
   *
   * Si n-ar fi fost o cadere zgomotoasa: comenzile ar fi intrat normal, facturile s-ar
   * fi emis normal, doar ca la eMAG n-ar fi ajuns niciuna. Comerciantul ar fi aflat
   * cand i-ar fi cerut-o ei.
   *
   * ⚠ 2 = onorata de eMAG (FBE), 3 = de vanzator. Atasamentele sunt printre PUTINELE
   * operatii ingaduite pe comenzile FBE, deci se trimite tipul ADEVARAT al comenzii,
   * nu se sare peste ele.
   */
  const { data: randEmag } = await admin.from("emag_orders")
    .select("order_type, raw").eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  const re = randEmag as { order_type: number | null; raw: unknown } | null;
  const tipulComenzii =
    re?.order_type
    ?? (re?.raw as { type?: number } | null)?.type
    ?? sursa?.tip
    /*
     * ⚠ 3 ca ultima plasa, si e o alegere cantarita: blocarea urcarii ar lasa o
     * comanda FARA factura la eMAG — o lipsa fiscala — pentru un camp pe care ei il
     * trimit practic mereu. Vanzatorul e cazul coplesitor; daca totusi era FBE, eMAG
     * refuza si mesajul ajunge in jurnal, unde se poate vedea.
     */
    ?? 3;

  const rez = await cuRegistru(
    admin,
    {
      businessId: ctx.businessId,
      orderId,
      fel: "factura",
      furnizor: "emag",
      cheie: `emag-factura-${orderId}-${factura.numar}`,
    },
    async () => {
      const pdf = await aduPdf(factura);
      if ("error" in pdf) throw new Error(pdf.error);

      /* ⚠ `private, no-store`: documentul are numele si adresa cumparatorului. */
      const url = await uploadToR2(
        Buffer.from(pdf),
        cheiaPdf(ctx.businessId, orderId, factura.numar),
        "application/pdf",
        "private, no-store",
      );

      const r = await salveazaAtasamente(ctx.auth, [{
        order_id: emagOrderId as number,
        /* ⚠ OBLIGATORIU dupa schema lor. Vezi nota de mai sus. */
        order_type: tipulComenzii as 2 | 3,
        name: `Factura ${factura.numar}`,
        url,
        /* ⚠ 1 = factura. Documentatia lor: „For invoices: use type = 1". */
        type: 1,
      }]);
      if (isEmagError(r)) throw new Error(r.error);

      return { referinta: factura.numar, detalii: { url, furnizor: factura.furnizor }, valoare: factura.numar };
    },
    (e) => {
      /*
       * ⚠ SE DEOSEBESTE REFUZUL DOVEDIT DE „NU STIM", si implicitul e „nu stim".
       *
       * `esuat` inseamna ca nimic nu s-a atasat si reincercarea e libera. Dar o
       * cadere de retea la jumatate poate sa fi lasat atasamentul FACUT la ei, iar
       * reincercata, comanda ar avea la eMAG doua documente fiscale si clientul ar
       * primi doua facturi pentru aceeasi marfa.
       *
       * De aceea numai refuzurile LIMPEZI ies `esuat`; restul raman `necunoscut`, si
       * atunci registrul blocheaza si cere o privire de om. Aceeasi alegere ca in
       * `eroare-furnizor.ts`, unde implicitul e `necunoscut` dinadins.
       */
      const m = (e instanceof Error ? e.message : "").toLowerCase();
      if (m.includes("not found") || m.includes("invalid")) return "esuat";
      return "necunoscut";
    },
  );

  if (rez.fel === "deja") return { fel: "deja", numar: factura.numar };
  if (rez.fel === "facut") return { fel: "urcata", numar: factura.numar };
  /* „blocat" inseamna ca o urcare identica e in curs sau nu se stie cum s-a incheiat.
     ⚠ NU se reincearca de aici: exact asta pazeste registrul. */
  return { fel: "esec", mesaj: rez.mesaj };
}
