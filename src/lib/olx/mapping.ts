// Maps an Edinio product to an OLX advert payload, enforcing OLX content rules:
//  - title 16-150 chars, description 80-9000 chars
//  - no e-mail addresses, phone numbers or URLs in title/description
//  - max 2 identical special chars in a row (! ? . , - = + # % & @ * _ > < : ( ) |)
//  - capital letters must stay under 50% of the text
// Violations get the advert rejected at POST time, so we sanitize proactively.

import { gpsrEfectiv, gpsrPentruOlx, type GpsrConfig } from "@/lib/gpsr";
import { OLX_CURRENCY, type OlxAttributeDef, type OlxCategoryMapEntry, type OlxConfig } from "./types";
import { rezolvaAtributele } from "./atribute";

export interface MappableBusiness {
  slug: string;
  custom_domain: string | null;
  store_name: string | null;
  business_name: string;
}

export interface MappableProduct {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: unknown;
  category: string | null;
  is_active: boolean;
  track_inventory: boolean;
  stock_quantity: number | null;
  /**
   * Ce tine de produs si n-are coloana proprie: `google`, `dimensions`, `variants` — si `gpsr`.
   *
   * ⚠ Optional dinadims: sunt apelanti care construiesc `MappableProduct` din citiri mai vechi,
   * fara campul asta. `gpsrDinProdus` citeste `unknown` fara sa presupuna nimic despre forma.
   */
  page_sections?: unknown;
}

export function isProductSellable(p: Pick<MappableProduct, "is_active" | "track_inventory" | "stock_quantity">): boolean {
  return p.is_active && (!p.track_inventory || (p.stock_quantity ?? 0) > 0);
}

// ── Text sanitization ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0?39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Remove URLs, e-mails and phone-like digit runs (9+ digits) — all forbidden.
function removeContacts(text: string): string {
  let out = text
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w-]+\.\w{2,}\b/g, " ")
    // bare domains like magazin.ro / shop.com (no scheme)
    .replace(/\b[a-z0-9-]+\.(?:ro|com|net|org|eu|shop|store|online|site)(?:\/\S*)?\b/gi, " ");
  // phone-like sequences: strip only when the run contains 9+ digits
  out = out.replace(/\+?\d[\d\s().\/-]{6,}\d/g, (m) => ((m.match(/\d/g)?.length ?? 0) >= 9 ? " " : m));
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

// Max 2 identical special characters in a row.
function collapseRepeats(text: string): string {
  return text.replace(/([!?.,\-=+#%&@*_><:()|])\1{2,}/g, "$1$1");
}

// OLX rejects texts with >50% capital letters — normalize shouty text.
function fixCaps(text: string): string {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return text;
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length;
  if (upper / letters.length <= 0.45) return text;
  const lowered = text.toLowerCase();
  // Re-capitalize sentence starts so it doesn't read broken.
  return lowered.replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

function sanitize(text: string): string {
  return fixCaps(collapseRepeats(removeContacts(text))).trim();
}

export function buildOlxTitle(product: Pick<MappableProduct, "name">, business: MappableBusiness): string {
  const store = business.store_name || business.business_name;
  let title = sanitize(product.name).slice(0, 150);
  if (title.length < 16) {
    for (const candidate of [`${title} - ${sanitize(store)}`, `${title} - anunt publicat online`]) {
      title = candidate.trim().slice(0, 150);
      if (title.length >= 16) break;
    }
  }
  return title;
}

export function buildOlxDescription(product: Pick<MappableProduct, "name" | "description">, business: MappableBusiness): string {
  const store = sanitize(business.store_name || business.business_name);
  let desc = sanitize(stripHtml(product.description ?? ""));
  if (desc.length < 80) {
    const filler = `${sanitize(product.name)} este disponibil pentru comanda la magazinul ${store}. Produs pregatit de livrare, expediere rapida prin curier oriunde in Romania. Comanda simplu si primesti coletul direct la usa ta.`;
    desc = desc ? `${desc}\n\n${filler}` : filler;
  }
  return desc.slice(0, 9000);
}

// ── Advert payload ──────────────────────────────────────────────────────────────

export function toOlxAdvertBody(
  business: MappableBusiness,
  product: MappableProduct,
  config: OlxConfig,
  entry: OlxCategoryMapEntry,
  /**
   * Producatorul si persoana responsabila din UE, din setarile magazinului.
   *
   * ⚠ Se dau de sus, nu se citesc aici: `mapping.ts` n-are client de baza, iar o citire ascunsa
   * intr-un constructor de sarcina utila ar fi o cerere la baza pentru fiecare produs dintr-o
   * publicare in masa.
   */
  gpsrConfig?: GpsrConfig | null,
): Record<string, unknown> {
  /*
   * ⚠ `photos_limit = 0` CHIAR INSEAMNA ZERO (30.08.2026). `Math.max(1, …)` trimitea o poza si
   * atunci — iar OLX are categorii cu limita zero si raspunde „Image limit exceeded". Adica
   * publicarea pica intreaga, pentru o poza pe care noi am hotarat s-o trimitem oricum.
   */
  const images = (Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : [])
    .slice(0, Math.max(0, entry.photos_limit ?? 8));

  /*
   * ⚠ VALOAREA SE REZOLVA PER PRODUS (01.09.2026). Pana azi era o constanta pe categorie, deci toti
   * pantofii magazinului plecau cu acelasi brand. `rezolvaAtributele` ia fiecare atribut prin lantul
   * lui de surse — camp al produsului, specificatie, optiune de varianta, constanta — si intoarce
   * prima care da ceva. Mapările vechi (un sir) inseamna in continuare o constanta.
   */
  const attributes = Object.entries(rezolvaAtributele(entry.attributes, product))
    .filter(([code, v]) => !!code && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""))
    .map(([code, v]) => (Array.isArray(v) ? { code, values: v } : { code, value: String(v) }));

  const location: Record<string, unknown> = { city_id: config.default_city_id };
  if (config.default_district_id) location.district_id = config.default_district_id;

  const contact: Record<string, unknown> = { name: (config.contact_name || business.store_name || business.business_name).slice(0, 100) };
  const phone = (config.contact_phone ?? "").replace(/\s+/g, "");
  if (phone) contact.phone = phone;

  /* ⚠ Trecut prin maparea LOR: schema OLX n-are `phone`, iar campurile in plus se resping. */
  const gpsr = gpsrPentruOlx(gpsrEfectiv(product.page_sections, gpsrConfig));

  const body: Record<string, unknown> = {
    title: buildOlxTitle(product, business),
    description: buildOlxDescription(product, business),
    category_id: entry.category_id,
    advertiser_type: config.advertiser_type ?? "private",
    /*
     * ⚠ GPSR: cine raspunde pentru siguranta produsului (30.08.2026).
     *
     * OLX il cere prin `product_safety_regulation` la creare si la actualizare, si il refuza in
     * categoriile unde regulamentul european il face obligatoriu. Pana azi nu trimiteam nimic, deci
     * acolo publicarea pica fara ca noi sa fi avut vreodata datele.
     *
     * ⚠ NU SE TRIMITE UN OBIECT GOL: `gpsrEfectiv` intoarce `null` cand n-avem nimic, iar cheia
     * lipseste cu totul. `{}` ar insemna „am declarat ceva" — neadevarat, si mai rau decat lipsa,
     * fiindca refuzul lor n-ar mai spune ce lipseste.
     */
    ...(gpsr ? { product_safety_regulation: gpsr } : {}),
    // external_id lets us dedup; external_url is NOT sent — many partner accounts
    // are not allowed to set it and OLX rejects the advert ("partner is not
    // allowed to set external_url"). The shop link lives in the description flow.
    external_id: product.id,
    contact,
    location,
    price: { value: Number(product.price) || 0, currency: OLX_CURRENCY, negotiable: false },
    attributes,
    // omit = disabled on create / unchanged on update -> always send explicitly
    auto_extend_enabled: config.auto_extend === true,
  };
  if (images.length > 0) body.images = images.map((url) => ({ url }));
  if (config.courier_enabled === true) body.courier = true;
  return body;
}

// Human-readable readiness check used before publishing.
export function olxReadinessError(config: OlxConfig): string | null {
  if (!config.connected || !config.refresh_token) return "Conecteaza mai intai contul OLX.";
  if (config.needs_reconnect) return "Sesiunea OLX a expirat. Reconecteaza contul OLX.";
  if (!config.default_city_id) return "Seteaza localitatea anunturilor in setarile OLX.";
  if (!config.contact_name) return "Completeaza numele de contact in setarile OLX.";
  if (!config.contact_phone) return "Completeaza telefonul de contact in setarile OLX.";
  return null;
}

/**
 * De ce nu se poate mapa o categorie OLX pentru produse. `null` = se poate.
 *
 * ═══ ECRANUL VERIFICA, SERVERUL CREDEA PE CUVANT (31.08.2026) ═══
 *
 * `saveOlxCategoryMapEntry` e o actiune de server, adica o adresa. Verificarile stateau numai in
 * `OlxCategoryMapper.save()`, deci orice cerere care nu trecea prin ecran salva ce voia — iar
 * pretul se plateste MAI TARZIU si in alta parte:
 *
 *     se salveaza o mapare fara atributele obligatorii
 *     omul publica, si OLX refuza cu un mesaj despre un cod de atribut
 *     mesajul se scrie pe produs, dar el nu spune ce sa faca
 *     -> produsul tace, si vina pare a produsului, nu a maparii
 *
 * ⚠ SI CATEGORIILE CARE NU-S PENTRU PRODUSE. Arborele OLX tine si Locuri de munca: acolo pretul nu
 * e pret, e SALARIU (`validation.type === "salary"`), iar corpul nostru trimite un pret de produs.
 * Un anunt de vanzare pus intr-o categorie de joburi e, in cel mai bun caz, refuzat.
 *
 * ⚠ Se citeste TIPUL declarat de ei, nu numele categoriei. Numele se schimba, se traduc, si sunt
 * scrise de ei — tipul e ce foloseste chiar validarea lor.
 */
export function categoriaNuPrimesteProduse(attributes: OlxAttributeDef[]): string | null {
  if (attributes.some((a) => a.validation?.type === "salary")) {
    return "Categoria aleasă e din Locuri de muncă (are salariu, nu preț) și nu poate primi produse.";
  }
  return null;
}

/**
 * Atributele obligatorii ale categoriei care lipsesc din mapare. Lista goala = e in regula.
 *
 * ⚠ Se cer doar cele de tip `attribute`: `price` si `salary` se scot din produs, nu din mapare.
 * Aceeasi regula ca in ecran — scrisa o data, aici, si folosita in amandoua locurile.
 */
export function atributeObligatoriiLipsa(
  attributes: OlxAttributeDef[], puse: Record<string, string | string[]> | undefined,
): string[] {
  return attributes
    .filter((a) => a.validation?.required && a.validation?.type === "attribute")
    .filter((a) => {
      const v = puse?.[a.code];
      return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
    })
    .map((a) => a.label);
}
