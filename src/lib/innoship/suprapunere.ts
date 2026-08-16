import type { CurierInnoship } from "./client";

/**
 * Curierii pe care ii avem SI direct, SI prin Innoship.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Innoship agrega ~230 de curieri, iar printre ei sunt TOTI cei noua pe care
 * platforma ii integreaza direct. Un comerciant care are contract si cu GLS, si
 * cu Innoship poate ajunge sa aiba in acelasi checkout „Livrare prin GLS" (pe
 * contractul lui) si „GLS · Standard" (prin Innoship), la preturi diferite.
 *
 * ⚠ NU E UN DEFECT. Sunt doua contracte adevarate, iar cel direct e adesea mai
 * ieftin — de aia nu se ascunde niciunul (varianta B, hotarata cu clientul
 * 2026-08-14). Dar interfata trebuie sa o SPUNA, altfel arata a dublura si
 * comerciantul crede ca s-a stricat ceva.
 *
 * ⚠ Potrivirea se face pe NUMELE din enum-ul lor, nu pe `courierId`: id-urile sunt
 * numere de baza de date la ei, pe care nu le putem presupune stabile. Numele
 * („Cargus", „FanCourier", „PostaRomana") vin din `GET /api/Courier/All` si sunt
 * chiar valorile enum-ului din specificatie.
 */

/**
 * Numele Innoship → id-ul nostru de curier.
 *
 * ⚠ Doar cei pe care ii avem si direct. Restul celor ~230 n-au cu ce sa se
 * suprapuna, deci nu au ce cauta aici.
 *
 * ⚠ Cheile sunt scrise cu litere mici: potrivirea se face pe cheie normalizata,
 * fiindca n-avem nicio garantie ca ei pastreaza majusculele la fel in raspuns ca
 * in specificatie.
 */
const DUPA_NUME: Record<string, { id: string; eticheta: string }> = {
  cargus: { id: "cargus", eticheta: "Cargus" },
  dpd: { id: "dpd", eticheta: "DPD" },
  fancourier: { id: "fan-courier", eticheta: "FAN Courier" },
  gls: { id: "gls", eticheta: "GLS" },
  sameday: { id: "sameday", eticheta: "Sameday" },
  pallex: { id: "pallex", eticheta: "Pall-Ex" },
  ecolet: { id: "ecolet", eticheta: "eColet" },
  postaromana: { id: "posta", eticheta: "Poșta Română" },
  fedex: { id: "fedex", eticheta: "FedEx" },
  ups: { id: "ups", eticheta: "UPS" },
  /* ⚠ Cheia e NORMALIZATA (litere mici, fara separatoare), ca toate celelalte de
     aici: potrivirea e pe egalitate, nu pe fragment, deci „DHL" din raspunsul lor
     ajunge „dhl". Scrisa „DHL", intrarea n-ar prinde niciodata nimic si suprapunerea
     ar ramane nesemnalata — comerciantul ar vedea doua randuri „DHL" la preturi
     diferite si ar crede ca s-a stricat ceva. */
  dhl: { id: "dhl", eticheta: "DHL" },
};

/** Cheia de comparatie: fara majuscule, fara separatoare. */
function cheie(nume: string | null | undefined): string {
  return (nume ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Id-ul nostru de curier pentru un curier Innoship, daca il avem si direct. */
export function curierulNostru(numeInnoship: string | null | undefined): { id: string; eticheta: string } | null {
  return DUPA_NUME[cheie(numeInnoship)] ?? null;
}

export type Suprapunere = {
  /** Id-ul nostru de curier („gls"). */
  id: string;
  eticheta: string;
  /** `courierId` la Innoship, pentru filtrul din configurare. */
  courierIdInnoship: number;
};

/**
 * Care dintre curierii Innoship se suprapun peste cei activati direct.
 *
 * `activiDirect` sunt id-urile curierilor pe care magazinul ii are pornit in
 * „Setari → Livrare" — adica exact cei care apar deja in checkout pe cont propriu.
 *
 * ⚠ Se tine seama de `curieriPermisi`: daca comerciantul a filtrat deja lista
 * Innoship si a scos GLS de acolo, suprapunerea nu mai exista si n-are rost sa i
 * se spuna. Un avertisment care apare cand problema e deja rezolvata invata omul
 * sa nu se mai uite la avertismente.
 */
export function suprapuneri(
  curieriInnoship: CurierInnoship[],
  activiDirect: readonly string[],
  curieriPermisi?: readonly number[],
): Suprapunere[] {
  const activi = new Set(activiDirect);
  const permisi = new Set((curieriPermisi ?? []).filter((x) => Number.isInteger(x) && x > 0));

  const iesire: Suprapunere[] = [];
  const vazute = new Set<string>();

  for (const c of curieriInnoship ?? []) {
    const courierId = Number(c?.courierId);
    if (!Number.isInteger(courierId) || courierId <= 0) continue;
    /* Filtrul comerciantului a scos deja curierul: nu mai e nicio suprapunere. */
    if (permisi.size > 0 && !permisi.has(courierId)) continue;

    const alNostru = curierulNostru(c?.courier ?? c?.courierDisplayName);
    if (!alNostru || !activi.has(alNostru.id) || vazute.has(alNostru.id)) continue;

    vazute.add(alNostru.id);
    iesire.push({ id: alNostru.id, eticheta: alNostru.eticheta, courierIdInnoship: courierId });
  }

  return iesire.sort((a, b) => a.eticheta.localeCompare(b.eticheta));
}

/** Textul avertismentului, in cuvintele comerciantului. */
export function textSuprapunere(lista: Suprapunere[]): string | null {
  if (lista.length === 0) return null;
  const nume = lista.map((s) => s.eticheta);
  const enumerare = nume.length === 1
    ? nume[0]
    : `${nume.slice(0, -1).join(", ")} si ${nume[nume.length - 1]}`;

  return (
    `${enumerare} ${nume.length === 1 ? "apare" : "apar"} si pe contractul tau direct, si prin Innoship. `
    + "Cumparatorul o sa vada ambele variante, la preturi diferite — ceea ce poate fi exact ce vrei "
    + "(alegi cel mai ieftin contract), dar poate parea si o dublura. "
    + `Daca preferi sa ${nume.length === 1 ? "ramana" : "ramana"} doar contractul direct, scoate-${nume.length === 1 ? "l" : "i"} din lista de curieri Innoship de mai jos.`
  );
}
