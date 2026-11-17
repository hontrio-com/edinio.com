import type { AutoInvoiceTrigger } from "@/lib/invoicing";

/**
 * Configurarea Facturis Online a unui magazin (`store_settings.facturis_config`).
 *
 * ⚠ Numele campurilor secrete (`api_key`, `password`) sunt IDENTICE aici, in `CAMPURI_SECRETE`
 * (`src/lib/integrari/secrete.ts`) si in `privat.campuri_secrete` (migratia 2027-02-05). Nimic din
 * rulare nu verifica potrivirea: o nepotrivire ar lasa secretul necriptat in baza si nemascat in
 * browser, in tacere. O verifica `facturis-legat-peste-tot.test.ts`.
 *
 * ⚠ `username` si `cif` NU sunt secrete, desi intra in autentificare: singure nu deschid nimic, iar
 * comerciantul trebuie sa le poata reciti ca sa stie CE CONT a legat. Acelasi rationament ca la
 * `dhl_config.username` si `posta_config.username`.
 */
export type FacturisConfig = {
  enabled: boolean;
  /** Cheia generata in Facturis: Setari, Integrari, API, „Genereaza Cheia". SECRET. */
  api_key: string;
  /** Utilizatorul Facturis care a generat cheia (de obicei administratorul). */
  username: string;
  /** Parola acelui utilizator. SECRET. */
  password: string;
  /** Codul fiscal al firmei, scris ca in Facturis (de pilda „RO 31234567"). */
  cif: string;
  /** Seria facturilor. Trebuie sa existe deja in Facturis: ei refuza o serie necunoscuta. */
  serie: string;
  /** Seria stornarilor. Lipsa = aceeasi serie cu facturile (stornarea e o factura cu minus). */
  serie_storno?: string;
  /** Scadenta, in zile de la emitere. 0 sau lipsa = ziua emiterii. */
  due_days?: number;
  auto_invoice?: boolean;
  auto_invoice_trigger?: AutoInvoiceTrigger;
  /** Inregistreaza incasarea la emitere cand comanda e deja platita online cu cardul. */
  mark_paid_online?: boolean;
  /** Gestiunea din Facturis din care se descarca marfa. Lipsa = cea implicita a contului. */
  gestiune?: string;
  /** Punctul de lucru din Facturis. Lipsa = cel implicit. */
  punct_de_lucru?: string;
};

/**
 * Integrarea poate emite? O SINGURA regula, folosita peste tot: pagina Integrari, pagina comenzii,
 * lista comenzilor, facturarea in lot, facturarea automata si ruta de PDF.
 *
 * ⚠ Seria intra in ea desi nu e credentiala: Facturis refuza emiterea fara serie („Campul 'Serie'
 * este obligatoriu."), deci un card verde fara serie ar minti. Acelasi rationament ca la fGO.
 *
 * Merge pe configurarea citita cu cheia de serviciu (decriptata) si pe cea citita cu clientul
 * comerciantului (`enc.v1.…`): amandoua dau un sir negol acolo unde secretul exista.
 *
 * ⚠ NU merge pe configurarea MASCATA, cea trimisa formularului: acolo secretele pleaca goale.
 * Formularul intreaba `secretulEsteSalvat` (harta `_completate`), nu functia asta.
 */
export function facturisGata(c: unknown): c is FacturisConfig {
  if (!c || typeof c !== "object") return false;
  const f = c as Partial<FacturisConfig>;
  return f.enabled === true
    && plin(f.api_key) && plin(f.username) && plin(f.password) && plin(f.cif) && plin(f.serie);
}

function plin(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Seria cu care pleaca stornarea: cea anume, sau a facturilor. */
export function seriaStornarii(c: Pick<FacturisConfig, "serie" | "serie_storno">): string {
  return (c.serie_storno ?? "").trim() || c.serie.trim();
}
