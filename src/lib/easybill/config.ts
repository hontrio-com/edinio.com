import type { AutoInvoiceTrigger } from "@/lib/invoicing";

/**
 * Configurarea easybill a unui magazin (`store_settings.easybill_config`).
 *
 * ⚠ Singurul camp secret e `password`. Numele lui e IDENTIC aici, in `CAMPURI_SECRETE`
 * (`src/lib/integrari/secrete.ts`) si in `privat.campuri_secrete` (migratia
 * `2027-02-06-factureaza-easybill-saga.sql`). Nimic din rulare nu verifica potrivirea: o nepotrivire
 * ar lasa parola necriptata in baza si nemascata in browser, in tacere. De aceea pagina si salvarea
 * o trateaza oricum ca secret, si prin `SECRETE_EASYBILL` de mai jos (vezi `page.tsx`).
 *
 * ⚠ `username` NU e secret, desi intra in autentificare: singur nu deschide nimic, iar comerciantul
 * trebuie sa-l poata reciti ca sa stie CE UTILIZATOR a legat. Acelasi rationament ca la
 * `facturis_config.username` si `dhl_config.username`.
 *
 * ⚠ `firma_nume`, `firma_cui` si `anaf_url` le scrie SERVERUL, din raspunsul easybill la proba de
 * conexiune (`getCompanyInfo_fct`). Ce trimite formularul in ele se ignora.
 */
export type EasybillConfig = {
  enabled: boolean;
  /** Utilizatorul de tip API, creat in easybill: Setari, Automatizari, API Management. */
  username: string;
  /** Parola utilizatorului API. SECRET. */
  password: string;
  /**
   * Seria facturilor. Gol = seria implicita a contului easybill (recomandat).
   * ⚠ easybill o primeste ca „serie externa” (`invoiceSeries`); documentatia nu spune ce face cu o
   * serie care nu exista in cont, deci se scrie doar una creata deja acolo.
   */
  serie?: string;
  /** Termenul de plata, in zile (`xPaymentTerms` pe clientul nou). 0 sau lipsa = ziua emiterii. */
  due_days?: number;
  auto_invoice?: boolean;
  auto_invoice_trigger?: AutoInvoiceTrigger;
  /** Inregistreaza incasarea la emitere cand comanda e deja platita online cu cardul. */
  mark_paid_online?: boolean;
  /** Denumirea firmei din contul easybill legat, citita la ultima proba reusita. */
  firma_nume?: string;
  /** CUI-ul firmei din contul easybill legat, citit la ultima proba reusita. */
  firma_cui?: string;
  /**
   * Legatura de conectare la ANAF e-Factura a contului (`anafConnectionURL`). Nu e o credentiala:
   * duce la ANAF, unde omul se autentifica oricum cu certificatul firmei.
   */
  anaf_url?: string;
};

/** Campurile secrete ale configurarii. ⚠ Aceeasi lista ca in `CAMPURI_SECRETE.easybill_config`. */
export const SECRETE_EASYBILL = ["password"] as const;

/**
 * Integrarea poate emite? O SINGURA regula, folosita peste tot: pagina Integrari, pagina comenzii,
 * lista comenzilor, facturarea in lot, facturarea automata si ruta de PDF.
 *
 * Seria NU intra in ea, spre deosebire de Facturis: easybill numeroteaza singur, in seria implicita a
 * contului, deci o configurare fara serie chiar poate emite.
 *
 * Merge pe configurarea citita cu cheia de serviciu (decriptata) si pe cea citita cu clientul
 * comerciantului (`enc.v1.…`): amandoua dau un sir negol acolo unde parola exista.
 *
 * ⚠ NU merge pe configurarea MASCATA, cea trimisa formularului: acolo parola pleaca goala.
 * Formularul intreaba `secretulEsteSalvat` (harta `_completate`), nu functia asta.
 */
export function easybillGata(c: unknown): c is EasybillConfig {
  if (!c || typeof c !== "object") return false;
  const e = c as Partial<EasybillConfig>;
  return e.enabled === true && plin(e.username) && typeof e.password === "string" && e.password.length > 0;
}

function plin(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Contul easybill si magazinul spun acelasi lucru despre TVA? Avertismentul de la salvare, in AMBELE
 * sensuri: cont neplatitor + magazin cu TVA (facturi cu TVA pe un cont fara TVA), dar si cont platitor
 * + magazin fara TVA (facturile ar iesi cu 0%, fara niciun semn). `null` = se potrivesc, sau nu stim.
 */
export function avertismentTva(contFaraTva: boolean, tvaMagazin: boolean | null | undefined): string | null {
  if (typeof tvaMagazin !== "boolean") return null;
  if (contFaraTva && tvaMagazin) {
    return "Contul easybill e setat neplătitor de TVA, iar magazinul are TVA pornit. Verifică să se potrivească, altfel facturile ies cu TVA pe un cont fără TVA.";
  }
  if (!contFaraTva && !tvaMagazin) {
    return "Contul easybill e plătitor de TVA, iar magazinul n-are TVA pornit, deci facturile ar ieși cu 0%. Verifică setările de TVA ale magazinului.";
  }
  return null;
}

/**
 * Legatura ANAF e buna de aratat? Doar o adresa `https` a easybill: valoarea vine din raspunsul
 * lor si ajunge intr-un buton pe care omul il apasa.
 */
export function legaturaAnafValida(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 300) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (u.hostname === "easybill.ro" || u.hostname.endsWith(".easybill.ro"));
  } catch {
    return false;
  }
}
