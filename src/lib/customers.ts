/**
 * Customers ("Clienti") — a CRM view over TWO sources, merged in Postgres.
 *
 * 1. Orders. Every order carries the buyer's name/phone/email inline, and unique
 *    customers are AGGREGATED IN POSTGRES so the numbers stay correct at any
 *    order volume — PostgREST silently caps every response at 1000 rows, so
 *    aggregating fetched orders in JS breaks past that.
 * 2. The `customers` table: people imported from another platform, or added by
 *    hand, who have not bought yet. Added 2026-07-31 for merchants migrating in
 *    with an existing customer base.
 *
 * The two are joined on the same dedup key, so an imported customer sticks to
 * their own record the moment they place an order — no duplicate row appears.
 * Order data always wins; the import only fills gaps (e.g. the address of
 * someone who ordered by phone). See `customers_aggregate`, `customers_summary`,
 * `customer_orders` and migration `2026-07-31-customers-table.sql`.
 *
 * Matching key (dedup): the normalized phone number — it is required on every
 * order and is the most reliable identity in Romanian e-commerce. Email is a
 * fallback only when a phone is somehow missing. Revenue/AOV exclude
 * cancelled & refunded orders, and imported customers contribute ZERO to both:
 * bringing a contact list in must not move the revenue figures.
 */

/** One order row in a customer's history (modal), computed by `customer_orders`. */
export interface CustomerOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  item_count: number;
}

/** One aggregated customer, computed by `customers_aggregate`. */
export interface Customer {
  /** Stable dedup key (normalized phone, or email/order fallback). */
  key: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  county: string | null;
  address: string | null;
  /** Toate comenzile, inclusiv anulate si rambursate. */
  orderCount: number;
  /**
   * Comenzile care n-au cazut (nici anulate, nici rambursate).
   *
   * ⚠ SE CHEMA `paidOrderCount`, SI NUMELE MINTEA. Regula scotea doar
   * anulatele si rambursatele, deci inauntru ramaneau comenzile in asteptare,
   * neplatite, in procesare si refuzate-dar-neanulate. Cine citea „paid"
   * intelegea „bani intrati". Numarul e acelasi; numele spune acum ce masoara.
   */
  validOrderCount: number;
  /** Cate din ele au fost anulate, si cate rambursate. Vezi `desfaComenzile`. */
  cancelledCount: number;
  refundedCount: number;
  /**
   * Valoarea comenzilor valide. Marimea COMERCIALA: cat a cerut omul de la magazin.
   *
   * ⚠ Se chema `totalSpent` („Total cheltuit"), care suna a bani intrati.
   */
  ordersValue: number;
  /**
   * Banii care au ajuns chiar la comerciant. Marimea FINANCIARA.
   *
   * ⚠ NU e `payment_status = 'paid'`: la ramburs, curierul incaseaza la usa si
   * nimeni nu intoarce campul dupa livrare. Vezi `lib/customers/bani.ts`.
   */
  collectedTotal: number;
  /** `ordersValue / validOrderCount` (0 daca nu e niciuna). */
  aov: number;
  /** `null` for an imported customer who has not ordered yet. */
  firstOrderAt: string | null;
  /** `null` for an imported customer who has not ordered yet. */
  lastOrderAt: string | null;
  /** `null` for an imported customer who has not ordered yet. */
  lastStatus: string | null;
  /**
   * De unde vine contactul: `import`, `manual`, `checkout`, sau `null`.
   *
   * ⚠ `null` inseamna CUMPARATOR: el n-are rand in `customers`, e o grupare
   * peste comenzile lui. Nu inseamna „nu stim".
   */
  source: string | null;
}

/** Has this customer ever ordered? Imported-only contacts have not. */
export function hasOrders(c: Customer): boolean {
  return c.orderCount > 0;
}

export interface CustomersSummary {
  /** Cumparatori + contacte importate. Cifra din cardul „Clienti". */
  totalContacts: number;
  /** Cine are macar o comanda. */
  buyers: number;
  /**
   * Cine n-a comandat niciodata: adus dintr-un fisier sau scris de mana.
   *
   * ⚠ DE CE SE DESPART. Puse la un loc, „2.000 de clienti" putea insemna 250 de
   * cumparatori si 1.750 de contacte dintr-un import. Cardul ramane pe TOTAL
   * (hotararea proprietarului), dar acum se poate spune din ce e facut.
   */
  importedContacts: number;
  /** Cumparatori cu mai mult de o comanda valida. */
  returningCustomers: number;
  /**
   * Cati la suta dintre CUMPARATORI au comandat din nou.
   *
   * ⚠ Numitorul e numarul de cumparatori, nu totalul contactelor: un contact
   * importat n-avea cum sa „revina", iar pus la numitor ar trage rata in jos cu
   * cat importa comerciantul mai mult. Un magazin ar parea ca merge mai prost
   * fiindca si-a urcat lista de contacte.
   */
  returnRate: number;
  /** Valoarea comenzilor valide, pe tot magazinul. */
  ordersValue: number;
  /** Banii chiar intrati, pe tot magazinul. */
  collectedTotal: number;
  /**
   * `ordersValue / buyers`.
   *
   * ⚠ Per CLIENT, nu per comanda: media pe comenzi sta deja la Statistici, iar
   * o pagina care repeta o cifra din alta pagina nu adauga nimic.
   */
  valuePerCustomer: number;
}

/**
 * Normalize a Romanian phone number to its core digits so equivalent formats
 * (+40 7xx, 0040 7xx, 07xx, with spaces/dashes) collapse to the same key.
 * MUST stay in sync with the SQL mirror `public.normalize_phone` — the dedup
 * key and the phone search in `customers_aggregate` are computed there.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, ""); // digits only
  if (d.startsWith("0040")) d = d.slice(4);
  else if (d.startsWith("40") && d.length > 9) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}
