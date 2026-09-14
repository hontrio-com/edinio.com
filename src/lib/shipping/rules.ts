// Shared (non-"use server") shipping rules engine: conditional pricing that layers
// on top of the base courier options produced by getShippingOptions. Parsed
// defensively from jsonb (like lib/offers/offer.types.ts) so a malformed row can
// never crash the storefront. The engine is a pure function over any option shape
// carrying { courier, price }, so it never imports the "use server" actions module.

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ShippingClass {
  id: string;
  name: string;
}

/**
 * O zona de livrare: un curier pornit sau stins, cu pretul lui.
 *
 * ⚠ `auto_price` LIPSA inseamna ADEVARAT, nu fals: cotarea citeste `zone.auto_price !== false`.
 * De aceea campul e optional si se scrie numai cand chiar e un boolean. Vezi `parseShippingZones`.
 */
export interface ShippingZone {
  enabled: boolean;
  price: number;
  auto_price?: boolean;
  label?: string;
}

export type ShippingCondition =
  | { type: "weight"; min?: number; max?: number }   // kg (min inclusiv, max exclusiv)
  | { type: "subtotal"; min?: number; max?: number } // lei, valoarea marfii dupa promo
  | { type: "quantity"; min?: number; max?: number } // nr. total de bucati
  | { type: "class"; classIds: string[]; mode: "any" | "all" }
  | { type: "category"; categories: string[] }
  | { type: "product"; productIds: string[] }
  | { type: "county"; counties: string[] };

export type ShippingAction =
  | { type: "surcharge"; amount: number; percent?: boolean } // +X lei sau +X%
  | { type: "free" }                                         // pret = 0
  | { type: "flat"; amount: number }                         // seteaza pretul (doar curieri fix)
  | { type: "hide" };                                        // scoate curierul

export interface ShippingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;                 // evaluat descrescator
  conditions: ShippingCondition[];  // AND intre ele; gol = se potriveste mereu
  action: ShippingAction;
  couriers: string[] | null;        // null = toti curierii; altfel restrange la acesti id-uri
  presetKey?: string;               // ce scenariu presetat a generat regula (grupare in UI)
}

// Context de cos calculat server-side in getShippingOptions (date autoritative din DB).
export interface ShippingCartContext {
  subtotal: number;
  weightKg: number;
  quantity: number;
  classIds: string[];
  categories: string[];
  productIds: string[];
  county: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/** Id scurt pentru reguli/clase noi (client + server). */
export function newShippingId(prefix: string): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${rnd}`;
}

/* ─── Condition matching ───────────────────────────────────────────────────── */

// min inclusiv, max EXCLUSIV — trepte contigue (0-1, 1-5, 5+) nu se suprapun.
function inRange(v: number, min?: number, max?: number): boolean {
  if (min != null && v < min) return false;
  if (max != null && v >= max) return false;
  return true;
}

const norm = (s: string) => (s ?? "").trim().toLowerCase();

export function conditionsMatch(conds: ShippingCondition[], ctx: ShippingCartContext): boolean {
  return conds.every((c) => {
    switch (c.type) {
      case "weight":   return inRange(ctx.weightKg, c.min, c.max);
      case "subtotal": return inRange(ctx.subtotal, c.min, c.max);
      case "quantity": return inRange(ctx.quantity, c.min, c.max);
      case "class":    return c.mode === "all"
        ? c.classIds.every((id) => ctx.classIds.includes(id))
        : c.classIds.some((id) => ctx.classIds.includes(id));
      case "category": return c.categories.some((x) => ctx.categories.includes(x));
      case "product":  return c.productIds.some((x) => ctx.productIds.includes(x));
      case "county":   return c.counties.map(norm).includes(norm(ctx.county));
      default:         return false;
    }
  });
}

/* ─── Engine ───────────────────────────────────────────────────────────────── */

/**
 * Post-proceseaza optiunile de baza cu regulile care se potrivesc pe context.
 * Generic peste orice forma cu { courier, price } — pastreaza toate celelalte campuri.
 *
 * Per optiune (in ordinea priority desc):
 *   - `flat`      → DOAR pe curieri fix (flatCourierIds); seteaza pretul de baza (prima castiga).
 *   - `surcharge` → se adauga peste pretul de baza (se cumuleaza); orice curier.
 *   - `free`      → pret 0; orice curier.
 *   - `hide`      → scoate optiunea; orice curier.
 * Fara reguli active → optiunile se intorc neatinse (compatibilitate 100%).
 */
export function applyShippingRules<T extends { courier: string; price: number }>(
  options: T[],
  rules: ShippingRule[],
  ctx: ShippingCartContext,
  flatCourierIds: Set<string>,
): T[] {
  const active = rules
    .filter((r) => r.enabled && conditionsMatch(r.conditions, ctx))
    .sort((a, b) => b.priority - a.priority);
  if (active.length === 0) return options;

  const out: T[] = [];
  for (const opt of options) {
    const applicable = active.filter(
      (r) => !r.couriers || r.couriers.length === 0 || r.couriers.includes(opt.courier),
    );
    if (applicable.some((r) => r.action.type === "hide")) continue;

    // Pret de baza: prima regula `flat` care se potriveste (doar curieri fix), altfel pretul propriu.
    let base = opt.price;
    if (flatCourierIds.has(opt.courier)) {
      const flat = applicable.find((r) => r.action.type === "flat");
      if (flat && flat.action.type === "flat") base = Math.max(0, flat.action.amount);
    }

    const free = applicable.some((r) => r.action.type === "free");
    let surcharge = 0;
    for (const r of applicable) {
      if (r.action.type === "surcharge") {
        surcharge += r.action.percent ? base * (r.action.amount / 100) : r.action.amount;
      }
    }

    const price = free ? 0 : round2(Math.max(0, base + surcharge));
    out.push({ ...opt, price });
  }
  return out;
}

/* ─── Parsing (jsonb -> valori tipate sigure) ──────────────────────────────── */

export function parseShippingClasses(raw: unknown): ShippingClass[] {
  if (!Array.isArray(raw)) return [];
  const out: ShippingClass[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = toStr(o.id).trim();
    const name = toStr(o.name).trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

function parseCondition(raw: unknown): ShippingCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = toStr(o.type);
  if (t === "weight" || t === "subtotal" || t === "quantity") {
    const min = o.min != null && Number.isFinite(Number(o.min)) ? Number(o.min) : undefined;
    const max = o.max != null && Number.isFinite(Number(o.max)) ? Number(o.max) : undefined;
    if (min == null && max == null) return null;
    return { type: t, min, max };
  }
  if (t === "class") {
    const classIds = toStrArr(o.classIds);
    if (!classIds.length) return null;
    return { type: "class", classIds, mode: o.mode === "all" ? "all" : "any" };
  }
  if (t === "category") {
    const categories = toStrArr(o.categories);
    return categories.length ? { type: "category", categories } : null;
  }
  if (t === "product") {
    const productIds = toStrArr(o.productIds);
    return productIds.length ? { type: "product", productIds } : null;
  }
  if (t === "county") {
    const counties = toStrArr(o.counties);
    return counties.length ? { type: "county", counties } : null;
  }
  return null;
}

function parseAction(raw: unknown): ShippingAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = toStr(o.type);
  if (t === "surcharge") return { type: "surcharge", amount: Math.max(0, toNum(o.amount)), percent: o.percent === true };
  if (t === "flat")      return { type: "flat", amount: Math.max(0, toNum(o.amount)) };
  if (t === "free")      return { type: "free" };
  if (t === "hide")      return { type: "hide" };
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONELE, CURATATE LA SCRIERE CA SI CLASELE SI REGULILE      (14.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   `updateShippingConfig` re-parsa clasele si regulile prin parserele de mai sus, „ca sa
   garanteze forma jsonb valida", dar ZONELE se scriau brut: `shipping_zones: config.
   shipping_zones as never`. Lipsea exact al treilea frate.

   ⚠ CE TRECEA PE ACOLO. `min="0"` din formular e doar o sugestie a navigatorului, iar
   serverul nu se uita deloc la pret. Iar in ecran casuta golita devine `parseFloat("") || 0`,
   deci un pret sters ca sa fie retastat se salveaza ca ZERO fara nicio vorba.

   ⚠ SI UNDE AJUNGE NUMARUL. Din prima zona pornita se deduce `default_shipping_cost`
   (`store.actions.ts`), adica pretul pe care il vad toti cumparatorii pe pagina de produs, in
   cos, la finalizare, si pe care il citeste Google din datele structurate. Un `NaN` sau un
   negativ ajuns acolo nu se vede in panou si nu cade nicaieri.

   ⚠ CE NU FACE, DINADINS. Nu stinge un curier pe baza pretului: asta ar fi o hotarare de
   produs, nu o curatare. Si nu preface un negativ in „gratuit" ca pe un lucru normal, ci il
   plafoneaza la 0 asa cum face deja `parseAction` pentru sumele regulilor, fiindca un pret
   negativ nu se poate incasa in niciun fel.

   ⚠ MASURAT PE 14.09.2026, inainte de schimbare: din 25 de zone pornite, ZERO preturi
   negative si ZERO tarife implicite nule sau lipsa (toate intre 10 si 45 de lei). Deci
   curatarea nu misca nicio valoare din productie: e pusa inainte sa fie nevoie.
*/
export function parseShippingZones(raw: unknown): Record<string, ShippingZone> {
  const iesire: Record<string, ShippingZone> = {};
  /* ⚠ Forma de ARRAY o au 110 magazine din 129, si ea nu declara nicio zona. `typeof [] e
     "object"`, deci fara verificarea asta un array ar fi intrat in bucla si ar fi produs chei
     numerice („0", „1") care nu sunt curieri. */
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return iesire;

  for (const [cheie, valoare] of Object.entries(raw as Record<string, unknown>)) {
    /*
     * ═══ ⚠ `__proto__` NU SE POATE PUNE INTR-UN OBIECT PRIN ATRIBUIRE ═══
     *
     * `iesire["__proto__"] = zona` nu creeaza o cheie: cheama setterul mostenit si SCHIMBA
     * PROTOTIPUL obiectului. Iar `JSON.parse` chiar creeaza o insusire proprie cu numele asta,
     * deci o configuratie venita din corpul cererii ajungea aici cu ea.
     *
     * ⚠ CE AR FI URMAT. Obiectul intors, dat mai departe si scris in baza, ar fi avut un
     * prototip ales din afara: orice `zone["curier-care-nu-exista"]?.enabled` ar fi raspuns
     * „da", cu pretul venit tot de acolo.
     *
     * ⚠ PAZA DE DINAINTE, `hasOwnProperty`, NU PRINDEA NIMIC, si asta a aratat-o o sonda, nu
     * rationamentul meu: `Object.entries` intoarce oricum doar insusiri proprii, iar pentru un
     * obiect din `JSON.parse` ea raspunde `true` chiar pentru `__proto__`. Proba trecea, dar din
     * alt motiv: atribuirea se pierdea tacut in prototip.
     *
     * Celelalte nume mostenite (`constructor`, `toString`) se atribuie cuminte ca insusiri
     * proprii, deci ies cel mult „zone" cu nume ciudat, pe care nicio cheie de curier nu le
     * potriveste. Numai `__proto__` e altfel.
     */
    if (cheie === "__proto__") continue;
    if (!cheie.trim() || !valoare || typeof valoare !== "object") continue;

    const z = valoare as Record<string, unknown>;
    const zona: ShippingZone = {
      /* ⚠ Strict boolean: un „false" ca SIR ar fi fost adevarat, deci un curier stins ar fi
         reaparut in checkout. */
      enabled: z.enabled === true,
      /* ⚠ Plafonat si rotunjit: `toNum` face 0 din orice nu e numar (inclusiv `NaN` si sirul
         gol), iar `Math.max` opreste negativul. Acelasi tipar ca la sumele regulilor. */
      price: round2(Math.max(0, toNum(z.price))),
    };
    /* ⚠ Numai cand chiar sunt: un `auto_price: undefined` scris in jsonb ar schimba intelesul
       implicit, care e ADEVARAT (vezi `zone.auto_price !== false` din cotare). */
    if (typeof z.auto_price === "boolean") zona.auto_price = z.auto_price;
    const eticheta = toStr(z.label).trim();
    if (eticheta) zona.label = eticheta;

    iesire[cheie] = zona;
  }
  return iesire;
}

export function parseShippingRules(raw: unknown): ShippingRule[] {
  if (!Array.isArray(raw)) return [];
  const out: ShippingRule[] = [];
  raw.forEach((r, idx) => {
    if (!r || typeof r !== "object") return;
    const o = r as Record<string, unknown>;
    const action = parseAction(o.action);
    if (!action) return;
    const conditiiBrute = Array.isArray(o.conditions) ? o.conditions : [];
    const conditions = conditiiBrute
      .map(parseCondition)
      .filter((c): c is ShippingCondition => c !== null);
    /*
     * ⚠ O CONDITIE CARE NU SE POATE CITI STINGE REGULA. NU o face universala.
     *
     * `conditions: []` inseamna „se potriveste mereu" (vezi tipul de mai sus), si
     * asa si trebuie sa fie pentru o regula scrisa ANUME fara conditii. Dar pana
     * acum orice conditie necitibila era doar aruncata din lista — deci o regula
     * care AVEA conditii ajungea sa n-aiba niciuna, adica sa se aplice la TOATE
     * comenzile.
     *
     * Drumul e chiar cel obisnuit din panou: „Transport gratuit peste 200 lei" e
     * `{type:"subtotal", min:200}`; comerciantul sterge cifra din casuta ca sa
     * scrie alta, casuta goala da `min: undefined`, `parseCondition` intoarce
     * `null` (linia cu `min == null && max == null`), iar la salvare conditia
     * dispare. Rezultatul: transport gratuit la ORICE cos, inclusiv la unul de 20
     * de lei. Niciun log, nicio eroare — si pentru regulile presetate randul de
     * editare nici nu se mai randeaza dupa reincarcare, deci nu se vede nici
     * macar avertismentul din editor.
     *
     * Stinsa, regula ramane VIZIBILA in panou si se poate repara. Stearsa, ar fi
     * disparut munca comerciantului; lasata aprinsa, ar fi dat marfa pe gratis.
     */
    const conditiiPierdute = conditiiBrute.length > conditions.length;
    const couriers = Array.isArray(o.couriers) ? toStrArr(o.couriers) : null;
    out.push({
      id: toStr(o.id).trim() || `rule-${idx}`,
      name: toStr(o.name).trim() || "Regula transport",
      enabled: o.enabled !== false && !conditiiPierdute,
      priority: Number.isFinite(Number(o.priority)) ? Number(o.priority) : 0,
      conditions,
      action,
      couriers: couriers && couriers.length ? couriers : null,
      presetKey: typeof o.presetKey === "string" ? o.presetKey : undefined,
    });
  });
  return out;
}
