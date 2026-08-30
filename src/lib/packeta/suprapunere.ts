/**
 * Curierii pe care ii avem SI direct, SI prin Packeta.
 *
 * ═══ ACEEASI PROBLEMA CA LA INNOSHIP, DAR PE A TREIA CALE ═══
 *
 * In Romania, Packeta nu livreaza la adresa cu masinile ei: revinde Cargus, FAN,
 * DPD si Sameday. Pe toti patru ii avem integrati direct, iar trei dintre ei mai
 * apar o data si prin Innoship.
 *
 * Deci acelasi curier poate ajunge in checkout pe TREI cai, cu trei preturi.
 *
 * ⚠ NU E UN DEFECT — sunt contracte adevarate, si cel direct e adesea cel mai
 * ieftin. Hotararea din 2026-08-14 (varianta B) a fost sa nu se ascunda niciunul.
 * Dar interfata trebuie s-o SPUNA, altfel arata a dublura si comerciantul crede
 * ca s-a stricat ceva.
 *
 * ⚠ Potrivirea se face pe NUME, nu pe id: id-urile curierilor Packeta nu sunt in
 * documentatie si difera de la un cont la altul. Numele vin din `carrier.json` si
 * au forma „RO Cargus HD", „RO Sameday Box".
 */

/** Fragmentele de nume dupa care recunoastem un curier de-al nostru. */
const DUPA_NUME: { fragment: string; id: string; eticheta: string }[] = [
  { fragment: "cargus", id: "cargus", eticheta: "Cargus" },
  { fragment: "dpd", id: "dpd", eticheta: "DPD" },
  { fragment: "fan", id: "fan-courier", eticheta: "FAN Courier" },
  { fragment: "sameday", id: "sameday", eticheta: "Sameday" },
  { fragment: "gls", id: "gls", eticheta: "GLS" },
  { fragment: "postaromana", id: "posta", eticheta: "Poșta Română" },
];

/** Cheia de comparatie: fara majuscule, fara separatoare. */
function cheie(nume: string | null | undefined): string {
  return (nume ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Id-ul nostru de curier pentru un curier Packeta, daca il avem si direct.
 *
 * ⚠ Se cauta fragmentul in numele NORMALIZAT, nu egalitate: numele lor poarta si
 * tara si serviciul („RO Cargus HD"), care nu ne intereseaza.
 */
export function curierulNostru(numePacketa: string | null | undefined): { id: string; eticheta: string } | null {
  const k = cheie(numePacketa);
  if (!k) return null;
  const gasit = DUPA_NUME.find((c) => k.includes(c.fragment));
  return gasit ? { id: gasit.id, eticheta: gasit.eticheta } : null;
}

export type SuprapunerePacketa = {
  id: string;
  eticheta: string;
  /** Numele exact din `carrier.json`, ca sa se recunoasca in lista din panou. */
  numePacketa: string;
};

/**
 * Care dintre curierii Packeta ALESI se suprapun peste cei activi direct.
 *
 * ⚠ Se tine seama de alegerea comerciantului: daca a scos deja Cargus din lista
 * Packeta, suprapunerea nu mai exista si n-are rost sa i se spuna. Un avertisment
 * care apare cand problema e deja rezolvata invata omul sa nu se mai uite la
 * avertismente.
 */
export function suprapuneri(
  curieriPacketa: { id: string; nume: string }[],
  activiDirect: readonly string[],
  alesi?: readonly string[],
): SuprapunerePacketa[] {
  const activi = new Set(activiDirect);
  const permisi = new Set(alesi ?? []);

  const iesire: SuprapunerePacketa[] = [];
  const vazute = new Set<string>();

  for (const c of curieriPacketa ?? []) {
    if (permisi.size > 0 && !permisi.has(c.id)) continue;
    const alNostru = curierulNostru(c.nume);
    if (!alNostru || !activi.has(alNostru.id) || vazute.has(alNostru.id)) continue;
    vazute.add(alNostru.id);
    iesire.push({ id: alNostru.id, eticheta: alNostru.eticheta, numePacketa: c.nume });
  }

  return iesire.sort((a, b) => a.eticheta.localeCompare(b.eticheta));
}

/**
 * Textul avertismentului.
 *
 * ⚠ Spune si CATE cai sunt, fiindca la Packeta pot fi trei: direct, prin Innoship
 * si prin Packeta. „Apare de doua ori" ar fi o minciuna comoda cand de fapt apare
 * de trei.
 */
export function textSuprapunere(lista: SuprapunerePacketa[]): string | null {
  if (lista.length === 0) return null;
  const nume = lista.map((s) => s.eticheta);
  const enumerare = nume.length === 1
    ? nume[0]
    : `${nume.slice(0, -1).join(", ")} si ${nume[nume.length - 1]}`;

  return (
    `${enumerare} ${nume.length === 1 ? "apare" : "apar"} si pe contractul tau direct, si prin Packeta. `
    + "Cumparatorul o sa vada ambele variante, la preturi diferite — poate fi exact ce vrei "
    + "(alegi contractul mai ieftin), dar poate parea si o dublura. "
    + `Daca preferi doar contractul direct, scoate-${nume.length === 1 ? "l" : "i"} din lista de mai sus.`
  );
}
