/**
 * Care factura are o comanda, si de unde se ia PDF-ul ei.
 *
 * ═══ ⚠ MUTAT AICI DIN `src/lib/emag` PE 26.08.2026 ═══
 *
 * Trendyol are nevoie de exact aceeasi socoteala: comerciantul emite prin SmartBill, Oblio sau
 * fGO, iar noi trebuie sa stim CARE factura e a comenzii si de unde se ia. Importata din
 * `emag/facturi.ts`, ar fi tras clientul eMAG cu tot cu dependintele lui in pachetul Trendyol.
 *
 * ⚠ MODUL FARA NICIO LEGATURA: nu stie de baza, de retea si de niciun furnizor. Asa poate fi
 * probat fara nimic in jur, si folosit din amandoua integrarile.
 */

export interface Factura {
  furnizor: "smartbill" | "oblio" | "fgo";
  /** Seria si numarul, lipite: „EDN1234". */
  numar: string;
  /** Adresa de unde se aduce PDF-ul, cu acreditarile comerciantului. */
  url: string;
}

/**
 * Care factura are comanda.
 *
 * ⚠ PUR SI EXPORTAT. Ordinea furnizorilor e aceeasi ca in `invoice-auto.actions.ts`; o comanda
 * nu poate avea doua facturi, dar daca ar avea, se ia PRIMA gasita — nu se incarca amandoua la
 * marketplace, fiindca acolo ar aparea ca doua documente fiscale pentru aceeasi comanda.
 *
 * ⚠ SE CER AMANDOUA, si numarul si adresa. Un numar fara adresa inseamna ca factura exista dar
 * n-avem de unde-i lua PDF-ul — iar o urcare pornita asa ar esua abia la aducere, dupa ce si-a
 * consumat locul in registru.
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
 * Cheia sub care sta PDF-ul rehostat.
 *
 * ⚠ DE NEGHICIT, SI STABILA. De neghicit fiindca adresa e singura paza a unui document cu
 * datele cumparatorului: marketplace-ul trebuie sa poata veni sa-l ia, deci nu exista
 * autentificare la mijloc. Stabila fiindca a doua incercare, dupa o cadere de retea, trebuie sa
 * scrie in ACELASI loc — altfel fiecare reincercare ar lasa in urma inca o copie a facturii.
 *
 * `orderId` e un UUID, deci are deja 122 de biti de nedeterminare. Numarul facturii intra si el:
 * dupa un storno si o reemitere, documentul e ALTUL si trebuie sa aiba alta adresa.
 */
export function cheiaPdfFactura(
  folder: string, businessId: string, orderId: string, numarFactura: string,
): string {
  const curat = numarFactura.replace(/[^A-Za-z0-9._-]/g, "");
  return `${folder}/${businessId}/${orderId}-${curat}.pdf`;
}
