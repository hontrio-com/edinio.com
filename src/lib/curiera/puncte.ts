/**
 * Punctele de ridicare Curiera (`list_delivery_locations`), aduse la forma din checkout.
 *
 * Masurat pe 29.09.2026: ~4.250 de puncte, toate din Romania, cu id NUMERIC scris ca sir, unic
 * intre tipuri: 3.229 de lockere (toate „FANbox ..."), 938 pudo, 87 de oficii. ~2,2 MB de JSON,
 * deci se normalizeaza INAINTE de cache si nu pleaca niciodata intreg in browser.
 *
 * ⚠ Ce se curata aici, si de ce:
 *
 *   `can_pickup: "0"`  41 de puncte (statii si agentii) de unde destinatarul NU poate ridica.
 *                      Steagul nu supravietuieste in forma din checkout, deci se filtreaza acum,
 *                      altfel omul alege un depozit.
 *   spatii la coada    „Baile Herculane ", adrese cu „\r\n": `trim` peste tot.
 *   lat/lng ca SIR     `parseFloat`; un punct fara coordonate nu se poate arata pe harta.
 *   judetul Capitalei  „Bucuresti", dar si „Ilfov" si „Ilvof" (greseala lor) la doua puncte din
 *                      Bucuresti. Nu se repara: Curiera rescrie oricum adresa destinatarului cu
 *                      a punctului la emitere (masurat), deci judetul nostru nu ajunge pe AWB.
 */

export type TipPunctCuriera = "locker" | "pudo" | "office";

export type PunctCuriera = {
  id: string;
  nume: string;
  adresa: string;
  oras: string;
  judet: string;
  codPostal: string;
  lat: number;
  lng: number;
  tip: TipPunctCuriera;
  /** Programul in cuvinte, sau `null` cand nu se poate spune fara ghiceala. */
  program: string | null;
};

const TIPURI = new Set<TipPunctCuriera>(["locker", "pudo", "office"]);

function sir(v: unknown): string {
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

const ZILE = [
  ["monday", "L"], ["tuesday", "Ma"], ["wednesday", "Mi"], ["thursday", "J"],
  ["friday", "V"], ["saturday", "S"], ["sunday", "D"],
] as const;

function ora(minute: number): string {
  const m = Math.min(Math.max(0, Math.round(minute)), 1439);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Programul unei zile: „08:00-20:00", „inchis", sau `null` daca forma e necunoscuta.
 * `[]` si `0-0` inseamna inchis (forma lor pentru sambata/duminica la birouri).
 */
function ziua(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  if (v.length === 0) return "inchis";
  const intervale: string[] = [];
  for (const i of v) {
    const de = Number((i as { start?: unknown } | null)?.start);
    const pana = Number((i as { end?: unknown } | null)?.end);
    if (!Number.isFinite(de) || !Number.isFinite(pana) || pana < de) return null;
    if (de === 0 && pana === 0) continue;
    intervale.push(`${ora(de)}-${ora(pana)}`);
  }
  return intervale.length ? intervale.join(", ") : "inchis";
}

/**
 * Programul in cuvinte, cu zilele la rand grupate: „L-V 08:00-16:00; S-D inchis".
 *
 * Spre deosebire de FAN (`rezumaProgram` din fancourier.ts, sapte intervale FARA nume de zile),
 * Curiera numeste fiecare zi, deci programul se poate spune pe zile fara nicio presupunere.
 * Cand toate zilele sunt goale, nu stim nimic, si nu spunem „inchis permanent": `null`.
 */
export function rezumaProgramCuriera(schedule: unknown): string | null {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return null;
  const s = schedule as Record<string, unknown>;
  const zile = ZILE.map(([cheie]) => ziua(s[cheie]));
  if (zile.some((z) => z === null)) return null;
  if (zile.every((z) => z === "inchis")) return null;
  if (zile.every((z) => z === "00:00-23:59")) return "Non-stop";

  const grupe: { de: number; pana: number; text: string }[] = [];
  zile.forEach((text, i) => {
    const ultima = grupe[grupe.length - 1];
    if (ultima && ultima.text === text) ultima.pana = i;
    else grupe.push({ de: i, pana: i, text: text! });
  });
  return grupe
    .map((g) => {
      const nume = g.de === g.pana ? ZILE[g.de][1] : `${ZILE[g.de][1]}-${ZILE[g.pana][1]}`;
      return `${nume} ${g.text === "00:00-23:59" ? "non-stop" : g.text}`;
    })
    .join("; ");
}

/** Lista bruta -> punctele din care se poate ridica, fara duplicate de id. */
export function normalizeazaPuncteCuriera(brut: unknown): PunctCuriera[] {
  if (!Array.isArray(brut)) return [];
  const vazute = new Set<string>();
  const iesire: PunctCuriera[] = [];
  for (const r of brut) {
    const p = r as Record<string, unknown> | null;
    const id = sir(p?.id);
    if (!/^\d+$/.test(id) || vazute.has(id)) continue;
    if (sir(p?.can_pickup) !== "1") continue;
    const tip = sir(p?.type).toLowerCase() as TipPunctCuriera;
    if (!TIPURI.has(tip)) continue;
    const lat = parseFloat(sir(p?.lat));
    const lng = parseFloat(sir(p?.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    const oras = sir(p?.city);
    if (!oras) continue;
    vazute.add(id);
    iesire.push({
      id,
      nume: sir(p?.name),
      adresa: sir(p?.address),
      oras,
      judet: sir(p?.county),
      codPostal: sir(p?.zipcode),
      lat,
      lng,
      tip,
      program: rezumaProgramCuriera(p?.schedule),
    });
  }
  return iesire;
}
