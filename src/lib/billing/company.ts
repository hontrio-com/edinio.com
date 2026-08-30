import { isValidCui, normalizeCui } from "@/lib/anaf/cui";

/**
 * Datele de facturare ale unei persoane juridice, asa cum stau in
 * `orders.billing_company` (jsonb, nullable — `null` inseamna persoana fizica).
 *
 * ADRESA DE AICI E CEA FISCALA, NU CEA DE LIVRARE. Livrarea ramane in
 * `shipping_address`, si asta nu e o alegere de stil: pretul transportului se
 * semneaza pe destinatie (`lib/shipping/quote-token.ts`), deci daca
 * autocompletarea ANAF ar fi scris peste judetul si orasul de livrare, semnatura
 * n-ar mai fi verificat si serverul ar fi cazut pe tariful implicit fara sa spuna
 * nimanui — clientul ar fi vazut un pret si ar fi platit altul.
 */
export interface BillingCompany {
  cui: string;
  company_name: string;
  reg_com: string;
  address: string;
  city: string;
  county: string;
  /** Inregistrata in scopuri de TVA. Decide `isTaxPayer` si prefixul „RO". */
  vat_payer: boolean;
  /**
   * Serverul a reconfirmat datele la ANAF in clipa plasarii comenzii.
   *
   * `false` inseamna ca ANAF n-a raspuns la timp, nu ca firma e suspecta — dar
   * comerciantul trebuie sa afle inainte de a emite factura, fiindca denumirea si
   * statutul de TVA sunt atunci cele trimise de browser.
   */
  verified: boolean;
  /** Declarata inactiva fiscal in registrul ANAF. Doar un avertisment. */
  inactive: boolean;
}

/**
 * Ce poate propune browserul. `verified` si `inactive` lipsesc dinadins: sunt
 * verdicte pe care doar serverul le poate da, dupa ce reintreaba ANAF. Tipul le
 * face de netrimis, nu doar de ignorat.
 */
export type BillingCompanyInput = Omit<BillingCompany, "verified" | "inactive">;

const MAX = 200;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX) : "";
}

/**
 * Curata si valideaza ce a trimis browserul.
 *
 * Se cheama pe SERVER si numai acolo. Actiunile exportate din module
 * `"use server"` sunt endpointuri publice: oricine poate trimite un obiect
 * arbitrar, cu campuri de 10 MB sau cu un CUI inventat. Ce iese de aici e singura
 * forma care ajunge in baza si, de acolo, pe o factura fiscala.
 *
 * `null` cand nu se poate emite o factura pe firma din datele primite: fara CUI
 * valid sau fara denumire, ce ar ajunge pe factura ar fi mai rau decat nimic.
 *
 * `vat_payer` e transportat cum a venit — formularul l-a luat de la ANAF cu
 * cateva secunde in urma — dar e RESCRIS de `verifyBillingCompany`. `verified` si
 * `inactive` sunt insa mereu puse pe fals aici: sunt verdicte ale serverului, iar
 * un client care si le-ar putea declara singur ar goli verificarea de sens.
 */
export function parseBillingCompany(input: unknown): BillingCompany | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  const cui = normalizeCui(text(o.cui));
  if (!isValidCui(cui)) return null;

  const company_name = text(o.company_name);
  if (company_name.length < 2) return null;

  return {
    cui,
    company_name,
    reg_com: text(o.reg_com),
    address: text(o.address),
    city: text(o.city),
    county: text(o.county),
    vat_payer: o.vat_payer === true,
    verified: false,
    inactive: false,
  };
}

/**
 * Citeste blocul dintr-un rand de comanda (`orders.billing_company` e `Json`).
 *
 * NU e acelasi lucru cu `parseBillingCompany` si diferenta conteaza. Acolo intra
 * ce a trimis un browser, deci `verified` si `inactive` sunt fortate pe fals;
 * aici intra ce a scris SERVERUL dupa ce a intrebat ANAF, deci verdictul lui
 * trebuie pastrat. Trecuta prin parserul de intrare, orice comanda confirmata ar
 * fi aratat in panou drept „date neconfirmate la ANAF" — un avertisment fals pe
 * fiecare comanda pe firma, adica exact felul in care avertismentele ajung sa fie
 * ignorate.
 *
 * Comenzile scrise inainte de aceasta functionalitate n-au cheile: lipsa se
 * citeste ca „neconfirmat", care e si adevarul.
 */
export function readBillingCompany(value: unknown): BillingCompany | null {
  const de_baza = parseBillingCompany(value);
  if (!de_baza) return null;
  const o = value as Record<string, unknown>;
  return {
    ...de_baza,
    verified: o.verified === true,
    inactive: o.inactive === true,
  };
}

/**
 * Cine apare ca titular pe factura.
 *
 * Pentru o firma, denumirea ei — asta cere legea. `customer_name` ramane
 * INTOTDEAUNA persoana de contact si nu se atinge: e numele care se sparge in
 * prenume/nume la Netopia, Klarna, pixelul Meta, sincronizarile Mailchimp si
 * Brevo si pe AWB-urile FanCourier si Cargus. Denumirea firmei bagata acolo ar
 * strica toate sapte deodata.
 */
export function numeFactura(customerName: string, company: BillingCompany | null): string {
  return company?.company_name || customerName;
}

/** CUI-ul asa cum se scrie pe factura: „RO" doar la platitorii de TVA. */
export function cuiFactura(company: BillingCompany): string {
  return company.vat_payer ? `RO${company.cui}` : company.cui;
}
