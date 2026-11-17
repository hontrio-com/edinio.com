import { esteChiarPdf, eDocumentDeTest } from "@/lib/billing/factura-comenzii";
import { fetchMerchantPdf, getMerchantInvoicePdfUrl } from "@/lib/smartbill";
import { pdfFactura as pdfFacturis, type AcreditariFacturis } from "@/lib/facturis/client";
import { pdfFactura as pdfFactureaza, type AcreditariFactureaza } from "@/lib/factureaza/client";
import { pdfFactura as pdfEasybill, type AcreditariEasybill } from "@/lib/easybill/client";
import { eDocumentDeTestFactureaza } from "@/lib/factureaza/config";

/**
 * Aducerea PDF-ului unui document fiscal, pentru cumparator.
 *
 * ⚠⚠ EDINIO NU GAZDUIESTE NICIUN DOCUMENT FISCAL. Cele trei case emit la ele, iar
 * PDF-ul se aduce viu, pe server, la fiecare cerere. Catre om nu pleaca NICIODATA
 * adresa furnizorului: SmartBill are doua adrese cu regimuri opuse, iar cea de
 * editare e o pagina de login.
 *
 * ⚠⚠ GARZILE, in ordine, si niciuna nu e optionala:
 *   1. documentul de TEST se opreste INAINTE de orice cerere: pana acum garda
 *      rula dupa descarcare, deci cererea catre `testuat.fgo.ro` pleca oricum;
 *   2. limita de timp: un furnizor care nu raspunde nu tine omul agatat;
 *   3. plafonul de marime: Vercel taie corpul raspunsului la 4,5 MB, iar un PDF
 *      taiat e un fisier stricat, nu o eroare;
 *   4. `esteChiarPdf`: o adresa care cere autentificare raspunde 200 cu pagina de
 *      login, iar `fetchMerchantPdf` nu verifica nimic.
 *
 * Fiecare esec are un MOTIV, ca ecranul sa spuna adevarul: „factura exista, dar
 * n-am putut-o aduce acum" e altceva decat „nu exista factura".
 */

export type MotivEsec =
  | "casa_neconectata"
  | "furnizor_indisponibil"
  | "nu_e_pdf"
  | "prea_mare"
  | "document_de_test"
  | "fara_document";

export type SursaPdf =
  | { fel: "smartbill"; email: string; token: string; cif: string; serie: string; numar: string }
  /* Facturis, Factureaza.ro si easybill n-au adresa a documentului: PDF-ul se cere prin API, dupa
     id, cu acreditarile magazinului. Nimic despre casa nu pleaca spre om, ca la SmartBill. */
  | { fel: "facturis"; acreditari: AcreditariFacturis | null; cheie: string }
  | { fel: "factureaza"; acreditari: AcreditariFactureaza | null; cheie: string }
  | { fel: "easybill"; acreditari: AcreditariEasybill | null; cheie: string }
  | { fel: "link"; adresa: string };

export type RezultatPdf = { ok: true; octeti: ArrayBuffer } | { ok: false; motiv: MotivEsec };

/** Sub plafonul de 4,5 MB al Vercel, cu loc pentru antete. */
export const MARIME_MAXIMA = 4_400_000;
export const LIMITA_DE_TIMP_MS = 10_000;

export async function aducePdf(sursa: SursaPdf): Promise<RezultatPdf> {
  let octeti: ArrayBuffer;

  if (sursa.fel === "smartbill") {
    if (!sursa.email || !sursa.token || !sursa.cif) return { ok: false, motiv: "casa_neconectata" };
    if (!sursa.serie || !sursa.numar) return { ok: false, motiv: "fara_document" };
    const rez = await fetchMerchantPdf(
      { email: sursa.email, token: sursa.token },
      getMerchantInvoicePdfUrl(sursa.cif, sursa.serie, sursa.numar),
      AbortSignal.timeout(LIMITA_DE_TIMP_MS),
    );
    if ("error" in rez) return { ok: false, motiv: "furnizor_indisponibil" };
    octeti = rez;
  } else if (sursa.fel === "facturis" || sursa.fel === "factureaza" || sursa.fel === "easybill") {
    if (!sursa.acreditari) return { ok: false, motiv: "casa_neconectata" };
    if (!sursa.cheie) return { ok: false, motiv: "fara_document" };
    /* ⚠ Garda 1, INAINTE de retea: documentul din sandbox-ul Factureaza.ro (cheia `test:`). */
    if (sursa.fel === "factureaza" && eDocumentDeTestFactureaza(sursa.cheie)) return { ok: false, motiv: "document_de_test" };
    const semnal = AbortSignal.timeout(LIMITA_DE_TIMP_MS);
    try {
      /* `pdfFactura`-ul fiecarei case verifica singur antetul `%PDF-` si marimea; aici ramane motivul. */
      octeti = sursa.fel === "facturis" ? await pdfFacturis(sursa.acreditari, sursa.cheie, semnal)
        : sursa.fel === "factureaza" ? await pdfFactureaza(sursa.acreditari, sursa.cheie, semnal)
        : await pdfEasybill(sursa.acreditari, sursa.cheie, semnal);
    } catch {
      return { ok: false, motiv: "furnizor_indisponibil" };
    }
  } else {
    const adresa = (sursa.adresa ?? "").trim();
    if (!adresa) return { ok: false, motiv: "fara_document" };
    /* ⚠ Garda 1, INAINTE de retea. */
    if (eDocumentDeTest(adresa)) return { ok: false, motiv: "document_de_test" };
    /* ⚠ Si numai catre casele de facturare: adresa sta pe comanda, iar comerciantul o
       poate scrie; altfel serverul ar fi cerut orice adresa, si din reteaua lui. */
    if (!adresaDeFurnizor(adresa)) return { ok: false, motiv: "furnizor_indisponibil" };
    let raspuns: Response;
    try {
      raspuns = await fetch(adresa, { cache: "no-store", signal: AbortSignal.timeout(LIMITA_DE_TIMP_MS) });
    } catch {
      return { ok: false, motiv: "furnizor_indisponibil" };
    }
    if (!raspuns.ok) return { ok: false, motiv: "furnizor_indisponibil" };
    const declarat = Number(raspuns.headers.get("content-length") ?? "");
    if (Number.isFinite(declarat) && declarat > MARIME_MAXIMA) return { ok: false, motiv: "prea_mare" };
    try {
      octeti = await raspuns.arrayBuffer();
    } catch {
      return { ok: false, motiv: "furnizor_indisponibil" };
    }
  }

  if (octeti.byteLength > MARIME_MAXIMA) return { ok: false, motiv: "prea_mare" };
  if (!esteChiarPdf(octeti)) return { ok: false, motiv: "nu_e_pdf" };
  return { ok: true, octeti };
}

/** Casele de facturare de la care se aduce un PDF dupa legatura lui (Oblio, fGO). */
export const GAZDE_FURNIZORI = ["oblio.eu", "fgo.ro"] as const;

/** O legatura https catre una dintre casele de facturare (sau un subdomeniu al ei). */
export function adresaDeFurnizor(adresa: string): boolean {
  let u: URL;
  try {
    u = new URL(adresa);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const gazda = u.hostname.toLowerCase();
  return GAZDE_FURNIZORI.some((g) => gazda === g || gazda.endsWith(`.${g}`));
}

/** Numele fisierului, curatat inainte sa intre intr-un ANTET. */
export function numeleFisierului(fel: "factura" | "storno", serie: string | null, numar: string | null): string {
  const baza = fel === "factura" ? "Factura" : "Stornare";
  return `${baza}_${[serie, numar].filter(Boolean).join("")}.pdf`.replace(/[^A-Za-z0-9._-]/g, "_");
}
