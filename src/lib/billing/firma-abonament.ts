import type { AnafCompany } from "@/lib/anaf/lookup";
import { formatCui, isValidCui, normalizeCui } from "@/lib/anaf/cui";
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

/** Datele scrise de mana in fereastra, cand ANAF nu da firma. */
export interface FirmaManuala {
  nume?: string;
  regCom?: string;
  adresa?: string;
  oras?: string;
  judet?: string;
}

/**
 * Firma scrisa de mana, primita cand ANAF nu o da: fie nu raspunde (mentenanta,
 * timeout), fie nu o gaseste (o firma inregistrata de curand apare acolo abia
 * dupa cateva zile). Fara ramura asta, in ambele cazuri omul n-ar putea plati.
 *
 * Se cere totusi un CUI care trece cifra de control (prinde greselile de tastare)
 * si tot ce trebuie pe o factura catre o firma: denumire si adresa completa.
 * Fara „RO", fiindca nu stim daca e platitor de TVA.
 */
export function firmaFaraAnaf(cui: string | undefined, m: FirmaManuala | undefined): FirmaFacturare | null {
  const curat = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);
  const f = {
    business_name: curat(m?.nume, 200),
    reg_com: curat(m?.regCom, 60),
    address: curat(m?.adresa, 300),
    city: curat(m?.oras, 100),
    county: curat(m?.judet, 100),
  };
  if (!cui || !isValidCui(cui)) return null;
  if (f.business_name.length < 2 || f.address.length < 3 || f.city.length < 2 || f.county.length < 2) return null;
  return { cui: normalizeCui(cui), ...f };
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
