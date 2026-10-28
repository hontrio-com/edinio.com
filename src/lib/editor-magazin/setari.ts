import type { DateleGenerale } from "@/lib/dashboard/datele-magazinului";
import type { ConfigFormular } from "@/lib/dashboard/formular-comanda";
import { jsonCanonic } from "@/lib/storefront/design/continut-ciorna";

/**
 * Fila „Setări” a editorului (etapa 8 din `docs/editor-magazin/PLAN.md`, lista lui de pe 27.10.2026):
 * datele magazinului, formularul de comanda si catalogul, aduse inapoi in editor din Setari.
 *
 * ⚠ Se salveaza DIRECT, fiecare cu butonul lui, nu prin „Publică” (decizia lui). Nu ating ciorna:
 * scriu doar ce e al lor (`updateGeneralSettings`, `updatePageContent` pe cheile lor), deci nici
 * „Publică” nu le poate calca (verificat la V1).
 *
 * Functii pure: hook-ul (`useSetariMagazin`) le cheama, probele le verifica fara React.
 */

export const SETARI_EDITOR = [
  { cheie: "general", titlu: "Informații generale", descriere: "Numele, sloganul, contactul, adresa" },
  { cheie: "social", titlu: "Social media", descriere: "Instagram, Facebook, TikTok, YouTube" },
  { cheie: "firma", titlu: "Datele firmei", descriere: "Denumirea, CUI-ul, sediul, numerotarea comenzilor" },
  /*
   * „Comanda” din etapa 15 (fostul „Formular de comandă”): tipul de checkout, apoi formularul. Cheia ramane `formular`,
   * ca adresele vechi (`?setare=formular`, ghidurile, semnele de carte) sa deschida tot aici.
   */
  { cheie: "formular", titlu: "Comanda", descriere: "Tipul de checkout, câmpurile și opțiunile plătite" },
  { cheie: "catalog", titlu: "Catalog", descriere: "Ce produse și categorii apar în magazin" },
] as const;

export type CheieSetare = (typeof SETARI_EDITOR)[number]["cheie"];

export function esteSetare(v: unknown): v is CheieSetare {
  return typeof v === "string" && SETARI_EDITOR.some((s) => s.cheie === v);
}

/**
 * Comutatoarele catalogului, citite ca in magazin (`=== true`). `type`, nu `interface`: pleaca asa in
 * `updatePageContent`, care cere un obiect cu chei oarecare.
 */
export type VizibilitateCatalog = {
  hide_products_without_images: boolean;
  hide_out_of_stock_products: boolean;
  show_empty_categories: boolean;
};

export function catalogDinPageContent(pageContent: Record<string, unknown>): VizibilitateCatalog {
  return {
    hide_products_without_images: pageContent.hide_products_without_images === true,
    hide_out_of_stock_products: pageContent.hide_out_of_stock_products === true,
    show_empty_categories: pageContent.show_empty_categories === true,
  };
}

/** Datele generale si numerotarea comenzilor: o singura salvare (`updateGeneralSettings`). */
export interface StareGenerale {
  date: DateleGenerale;
  formatComanda: string;
}

/** Campurile datelor generale, pe panoul care le arata; numerotarea comenzilor sta la firma. */
const CAMPURI_PANOU: Record<"general" | "social" | "firma", readonly (keyof DateleGenerale)[]> = {
  general: ["store_name", "tagline", "description", "phone", "whatsapp", "email", "store_address", "store_city", "store_county", "butoane"],
  social: ["social"],
  firma: ["business_name", "cui", "reg_com", "address", "city", "county"],
};

/**
 * Valoarea de comparat: textul fara spatiile de la capete, retelele fara cele golite. Altfel un spatiu
 * scris si sters, sau o retea golita (`{ tiktok: "" }` fata de `{}`), ar fi lasat panoul „nesalvat”.
 */
function deComparat(v: unknown): unknown {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().flatMap((k) => {
      const x = deComparat(o[k]);
      return x === "" || x === undefined ? [] : [[k, x]];
    }));
  }
  return v;
}

/** Panourile cu date generale schimbate fata de ce e salvat, in ordinea listei. */
export function panouriGeneraleModificate(acum: StareGenerale, salvat: StareGenerale): CheieSetare[] {
  const out: CheieSetare[] = [];
  for (const panou of ["general", "social", "firma"] as const) {
    const diferit = CAMPURI_PANOU[panou].some(
      (c) => jsonCanonic(deComparat(acum.date[c])) !== jsonCanonic(deComparat(salvat.date[c])),
    );
    if (diferit || (panou === "firma" && acum.formatComanda !== salvat.formatComanda)) out.push(panou);
  }
  return out;
}

export function formularModificat(acum: ConfigFormular, salvat: ConfigFormular): boolean {
  return jsonCanonic(acum) !== jsonCanonic(salvat);
}

export function catalogModificat(acum: VizibilitateCatalog, salvat: VizibilitateCatalog): boolean {
  return jsonCanonic(acum) !== jsonCanonic(salvat);
}

/**
 * Adresa care deschide editorul pe o setare (din Setari, din ghiduri, din semnele de carte vechi).
 * `?fila=setari&setare=...` le citeste ruta editorului (`setareDinAdresa`).
 */
export function adresaSetarii(setare?: CheieSetare): string {
  return setare ? `/dashboard/editor?fila=setari&setare=${setare}` : "/dashboard/editor?fila=setari";
}

/**
 * Ce cere adresa editorului: `null` = fila obisnuita, „lista” = fila „Setări” fara o setare anume, altfel
 * setarea de deschis. Orice alta valoare cade pe lista, nu pe o setare ghicita.
 */
export function setareDinAdresa(fila: unknown, setare: unknown): CheieSetare | "lista" | null {
  if (fila !== "setari") return null;
  return esteSetare(setare) ? setare : "lista";
}

/**
 * Filele vechi din Setari care s-au mutat in editor (etapa 8), cu setarea lor: o adresa veche (semn de
 * carte, ghid, legatura din alt ecran) duce acolo, nu la o fila care nu mai exista.
 */
export const FILE_MUTATE_IN_EDITOR: Readonly<Record<string, CheieSetare>> = {
  catalog: "catalog",
  "formular-comanda": "formular",
};
