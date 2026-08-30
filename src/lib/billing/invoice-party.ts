import { cuiFactura, readBillingCompany } from "./company";

/**
 * Cine e clientul de pe factura, calculat o singura data pentru toti furnizorii.
 *
 * Pana acum SmartBill, Oblio si fGO isi construiau fiecare obiectul „client"
 * direct din randul comenzii, si toate trei aveau persoana fizica scrisa in cod:
 * `vatCode: "0000000000000"`, `vatPayer: false`, `Tip: "PF"`. Ramurile de firma
 * puse separat in trei fisiere ar fi divergat la primul reglaj — exact ce s-a
 * intamplat cu formula de TVA inainte de `computeVat`.
 *
 * ADRESA. Pentru o firma, sediul fiscal are intaietate; daca lipseste (clientul
 * a completat de mana doar CUI-ul si denumirea), se cade pe adresa de livrare, ca
 * factura sa nu iasa cu campurile goale. Pentru persoane fizice, ca pana acum.
 */

export interface InvoiceParty {
  /** Denumirea firmei sau numele persoanei. Titularul facturii. */
  name: string;
  isCompany: boolean;
  /** Codul fiscal asa cum se scrie pe factura: „RO" doar la platitorii de TVA. */
  vatCode: string | null;
  regCom: string | null;
  vatPayer: boolean;
  address: string | null;
  city: string | null;
  county: string | null;
  /**
   * Codul de tara al adresei de pe factura, sau `null` pentru Romania.
   *
   * Exista pentru ca restul adresei se muta la sediul fiscal cand clientul e
   * firma; lasata pe adresa de LIVRARE, tara ar fi putut descrie alta tara decat
   * strada, orasul si judetul de langa ea. Un sediu venit din registrul ANAF e
   * romanesc prin definitie.
   */
  country: string | null;
  /** Datele au fost reconfirmate la ANAF la plasarea comenzii. */
  verified: boolean;
  /** Firma e declarata inactiva fiscal. */
  inactive: boolean;
}

interface OrderLike {
  customer_name: string;
  billing_company?: unknown;
}

interface AddressLike {
  address?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
}

export function invoiceParty(order: OrderLike, shipping: AddressLike | null): InvoiceParty {
  const firma = readBillingCompany(order.billing_company);

  if (!firma) {
    return {
      name: order.customer_name,
      isCompany: false,
      vatCode: null,
      regCom: null,
      vatPayer: false,
      address: shipping?.address?.trim() || null,
      city: shipping?.city?.trim() || null,
      county: shipping?.county?.trim() || null,
      country: shipping?.country?.trim() || null,
      verified: false,
      inactive: false,
    };
  }

  return {
    name: firma.company_name,
    isCompany: true,
    vatCode: cuiFactura(firma),
    regCom: firma.reg_com || null,
    vatPayer: firma.vat_payer,
    address: firma.address.trim() || shipping?.address?.trim() || null,
    city: firma.city.trim() || shipping?.city?.trim() || null,
    county: firma.county.trim() || shipping?.county?.trim() || null,
    // Blocul de firma se completeaza doar pentru comenzi din tara (formularul il
    // ascunde in afara ei), iar sediul vine din registrul ANAF: Romania.
    country: null,
    verified: firma.verified,
    inactive: firma.inactive,
  };
}
