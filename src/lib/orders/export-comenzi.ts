import { readBillingCompany } from "@/lib/billing/company";
import { numeleMetodei } from "@/lib/cont/plata";
import { detaliileDeLaCheckout } from "@/lib/cont/detalii-checkout";
import { liniaAdresei, type AdresaLivrare } from "@/lib/orders/adresa";
import { numarDeUrmarire } from "@/lib/orders/awb-propriu";
import { orderStatus } from "@/lib/orders/status";

/**
 * Tabelul exportului de comenzi (.xlsx), din comenzi, conturile lor si campurile de checkout.
 *
 * ═══ DE CE (cerut de un magazin, 07.10.2026) ═══
 *
 * Un client cu cont comanda pentru mai multe persoane: pe comanda, numele si emailul sunt ale
 * destinatarului, iar contul e singurul lucru care le leaga (69 de comenzi dintr-un singur cont,
 * masurat). Exportul poarta deci si contul: email, nume si ID.
 *
 * Campurile din formularul de checkout („Cod postal", „Punct reper"...) stau in `notes` ca JSON
 * cheiat pe id-ul campului. Fiecare primeste coloana LUI, cu eticheta magazinului, in ordinea din
 * configurare; cele care nu mai sunt in configurare (sterse, redenumite) vin la urma, cu cheia
 * facuta citibila, ca in contul clientului (`detaliileDeLaCheckout`).
 *
 * ⚠ Functie PURA, fara baza si fara biblioteca: ce iese aici se proba; fisierul il face browserul.
 */

export type ComandaExport = {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  total: number | string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  billing_company: unknown;
  shipping_address: unknown;
  notes: string | null;
  /* Restul coloanelor (AWB-urile) se citesc prin `numarDeUrmarire`. */
  [coloana: string]: unknown;
};

export type ContExport = { contId: string; nume: string | null; email: string | null };

/** O celula: text, numar, data (ISO, transformata in browser) sau gol. */
export type CelulaExport = string | number | { data: string } | null;

export type TabelExport = { antete: string[]; latimi: number[]; randuri: CelulaExport[][] };

const STARE_PLATA: Record<string, string> = {
  paid: "Platita", unpaid: "Neplatita", refunded: "Rambursata", partially_refunded: "Rambursata partial",
  pending: "In asteptare", failed: "Esuata",
};

type AdresaExport = AdresaLivrare & { city?: string; county?: string; postal_code?: string; postalCode?: string; country?: string };

/** Antetele si latimile coloanelor fixe, in ordinea in care ies. */
const FIXE: [string, number][] = [
  ["Comanda", 12], ["Data", 18], ["Status", 14], ["Metoda de plata", 18], ["Stare plata", 14], ["Total", 10],
  ["Client", 24], ["Telefon", 14], ["Email", 28], ["Firma", 24], ["CUI", 12],
  ["Adresa", 36], ["Oras", 16], ["Judet", 14], ["Cod postal", 10], ["Tara", 8],
  ["Curier", 12], ["AWB", 16], ["AWB intermediar", 16],
  ["Cont: email", 28], ["Cont: nume", 20], ["ID cont", 38],
];

function sir(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

export function tabelulExportului(
  comenzi: ComandaExport[],
  conturi: Record<string, ContExport>,
  campuri: ReadonlyArray<{ id: string; label: string }>,
): TabelExport {
  /* Campurile de checkout ale fiecarei comenzi, citite o data. */
  const detalii = comenzi.map((o) => detaliileDeLaCheckout(o.notes, campuri));

  /* Coloanele de checkout: intai cele din configurare, in ordinea ei, apoi restul, cum apar. */
  const etichete: string[] = [];
  const vazute = new Set<string>();
  for (const c of campuri) {
    const e = c.label.trim();
    if (e && !vazute.has(e)) { vazute.add(e); etichete.push(e); }
  }
  for (const rand of detalii) {
    for (const d of rand) if (!vazute.has(d.eticheta)) { vazute.add(d.eticheta); etichete.push(d.eticheta); }
  }
  /* Numai coloanele care au macar o valoare: un camp nefolosit nu umple foaia. */
  const folosite = etichete.filter((e) => detalii.some((r) => r.some((d) => d.eticheta === e)));

  const randuri = comenzi.map((o, i): CelulaExport[] => {
    const a = (o.shipping_address ?? {}) as AdresaExport;
    const firma = readBillingCompany(o.billing_company);
    const awb = numarDeUrmarire(o);
    const cont = conturi[o.id];
    const total = Number(o.total);
    const peCamp = new Map(detalii[i].map((d) => [d.eticheta, d.valoare]));
    return [
      o.order_number,
      o.created_at ? { data: o.created_at } : null,
      orderStatus(o.status).label,
      numeleMetodei(o.payment_method),
      o.payment_status ? (STARE_PLATA[o.payment_status] ?? o.payment_status) : null,
      Number.isFinite(total) ? total : null,
      sir(o.customer_name),
      sir(o.customer_phone),
      sir(o.customer_email),
      firma ? sir(firma.company_name) : null,
      firma ? sir(firma.cui) : null,
      sir(liniaAdresei(a)),
      sir(a.city),
      sir(a.county),
      sir(a.postal_code) ?? sir(a.postalCode),
      sir(a.country),
      awb?.curier ?? null,
      awb?.awb ?? null,
      awb?.prin ? `${awb.prin.curier} ${awb.prin.awb}` : null,
      cont ? sir(cont.email) : null,
      cont ? sir(cont.nume) : null,
      cont ? cont.contId : null,
      ...folosite.map((e) => peCamp.get(e) ?? null),
    ];
  });

  /*
   * ⚠ Un camp de checkout cu acelasi nume ca o coloana fixa („Cod postal", „Tara": masurat la
   * magazinul care a cerut exportul) ar fi dat doua coloane cu acelasi antet. Primeste „(formular)".
   */
  const fixe = new Set(FIXE.map(([a]) => a.toLowerCase()));
  return {
    antete: [...FIXE.map(([a]) => a), ...folosite.map((e) => (fixe.has(e.toLowerCase()) ? `${e} (formular)` : e))],
    latimi: [...FIXE.map(([, l]) => l), ...folosite.map(() => 20)],
    randuri,
  };
}

/** Celula pentru `write-excel-file` (forma lui `Cell`), fara sa importe biblioteca. */
export type CelulaFoaie =
  | null
  | { value: string; fontWeight?: "bold" }
  | { value: number; type: NumberConstructor; format: string }
  | { value: Date; type: DateConstructor; format: string };

/**
 * Celula din tabel -> celula foii. Totalul ramane NUMAR (se poate aduna in Excel), data ramane
 * DATA (se poate sorta), nu text.
 */
export function celulaFoii(c: CelulaExport): CelulaFoaie {
  if (c === null) return null;
  if (typeof c === "number") return { value: c, type: Number, format: "#,##0.00" };
  if (typeof c === "object") {
    const d = new Date(c.data);
    return Number.isFinite(d.getTime()) ? { value: oraRomaniei(d), type: Date, format: "dd.mm.yyyy hh:mm" } : null;
  }
  return { value: c };
}

/**
 * ⚠ Excel n-are fus orar, iar biblioteca socoteste ziua din UTC (`convertDateToSerialNumber`):
 * o comanda de la 15:17 ar fi aparut la 12:17. Se scrie deci ora ROMANIEI, ca in panou.
 */
function oraRomaniei(d: Date): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
}

/** Foaia intreaga: antetul ingrosat, apoi randurile. */
export function foaiaExportului(t: TabelExport): CelulaFoaie[][] {
  return [t.antete.map((a) => ({ value: a, fontWeight: "bold" as const })), ...t.randuri.map((r) => r.map(celulaFoii))];
}
