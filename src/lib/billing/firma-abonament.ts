import type { AnafCompany } from "@/lib/anaf/lookup";
import { formatCui, isValidCui } from "@/lib/anaf/cui";
import type { ClientFactura } from "@/lib/billing/factura-platforma";

/**
 * Firma pe care se emite factura abonamentului Edinio.
 *
 * Abonamentul nu se mai poate plati fara CUI: pana pe 25.09.2026 cine nu-l
 * completase in Setari primea factura ca persoana fizica, pe numele magazinului
 * sau pe numele lui. Ruta de plata (`/api/stripe/checkout`) cere CUI-ul si il
 * verifica in ANAF, iar datele firmei ajung pe doua drumuri:
 *
 * - magazinul exista (Setari, reactivare): se scriu pe loc in `businesses`;
 * - magazinul NU exista inca (onboarding, se creeaza abia dupa plata): pleaca in
 *   metadata sesiunii si a abonamentului Stripe, de unde le citeste webhook-ul
 *   la prima factura, si inapoi la client, care le da lui `createBusiness`.
 */

/** Datele de firma care se scriu pe magazin si pe factura. */
export interface FirmaFacturare {
  cui: string;
  business_name: string;
  reg_com: string;
  address: string;
  city: string;
  county: string;
}

/** Are magazinul un CUI bun de pus pe factura? Unul gresit se cere din nou. */
export function areCuiDeFacturare(cui: string | null | undefined): boolean {
  return !!cui && isValidCui(cui);
}

/** Din raspunsul ANAF, in forma in care se stocheaza (cu „RO" doar la platitorii de TVA). */
export function firmaDinAnaf(c: AnafCompany): FirmaFacturare {
  return {
    cui: formatCui(c.cui, c.vat_payer),
    business_name: c.business_name,
    reg_com: c.reg_com,
    address: c.address,
    city: c.city,
    county: c.county,
  };
}

// Stripe tine cel mult 500 de caractere pe valoare de metadata.
const taie = (s: string) => s.slice(0, 480);

/** Cheile cu care firma calatoreste in metadata Stripe. */
export function metadataFacturare(f: FirmaFacturare): Record<string, string> {
  return {
    fact_cui: taie(f.cui),
    fact_nume: taie(f.business_name),
    fact_regcom: taie(f.reg_com),
    fact_adresa: taie(f.address),
    fact_oras: taie(f.city),
    fact_judet: taie(f.county),
  };
}

/** Clientul facturii din metadata abonamentului, sau `null` daca plata n-a purtat firma. */
export function clientFacturaDinMetadata(
  meta: Record<string, string> | null | undefined,
  email: string,
): ClientFactura | null {
  const cui = meta?.fact_cui?.trim();
  const nume = meta?.fact_nume?.trim();
  if (!cui || !nume || !isValidCui(cui)) return null;
  return {
    name: nume,
    email,
    vatCode: cui,
    address: meta?.fact_adresa?.trim() || undefined,
    city: meta?.fact_oras?.trim() || undefined,
    county: meta?.fact_judet?.trim() || undefined,
  };
}
