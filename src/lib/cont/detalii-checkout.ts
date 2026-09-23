/**
 * Campurile completate de om la checkout (interval de livrare, mesaj de
 * felicitare), puse inapoi pe ecran cu etichetele magazinului.
 *
 * ⚠⚠ `orders.notes` E O COLOANA TEXT care tine un JSON cheiat pe ID-ul campului
 * (`order.actions.ts`, `notes: data.custom_fields`), iar la comenzile vechi un text
 * simplu. Deci se parseaza cu `try`: un JSON stricat nu are voie sa rupa pagina.
 *
 * ⚠ Etichetele vin din configurarea de AZI a magazinului si pot lipsi (campul a
 * fost sters sau redenumit; pe demo nu se potriveste niciunul). Atunci cheia se
 * face citibila, nu se ascunde: textul e al omului si are dreptul sa-l vada.
 */

export type RandDetaliu = { eticheta: string; valoare: string };

/** `interval_livrare` -> „Interval livrare", `cf_mesaj` -> „Mesaj". */
function cheieCitibila(cheie: string): string {
  const s = cheie.replace(/^cf[_-]/i, "").replace(/[_-]+/g, " ").trim();
  if (!s) return "Detaliu";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function text(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Da" : "Nu";
  if (Array.isArray(v)) {
    const parti = v.map(text).filter((x): x is string => x !== null);
    return parti.length ? parti.join(", ") : null;
  }
  return null;
}

export function detaliileDeLaCheckout(
  note: string | null | undefined,
  campuri: ReadonlyArray<{ id: string; label: string }> = [],
): RandDetaliu[] {
  const brut = (note ?? "").trim();
  if (!brut) return [];

  let parsat: unknown = null;
  try {
    parsat = JSON.parse(brut);
  } catch {
    return [{ eticheta: "Mentiuni", valoare: brut }];
  }

  if (!parsat || typeof parsat !== "object" || Array.isArray(parsat)) {
    const t = text(parsat);
    return t ? [{ eticheta: "Mentiuni", valoare: t }] : [];
  }

  const etichete = new Map(campuri.map((c) => [c.id, c.label.trim()]));
  const out: RandDetaliu[] = [];
  for (const [cheie, v] of Object.entries(parsat as Record<string, unknown>)) {
    const valoare = text(v);
    if (!valoare) continue;
    out.push({ eticheta: etichete.get(cheie) || cheieCitibila(cheie), valoare });
  }
  return out;
}
