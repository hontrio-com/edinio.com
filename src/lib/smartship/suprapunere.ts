/**
 * Curierii pe care ii avem SI direct, SI prin SmartShip.
 *
 * ═══ ACEEASI PROBLEMA, PE A PATRA CALE ═══
 *
 * SmartShip revinde Cargus, SameDay, DPD, FAN Courier si altii. Pe primii patru
 * ii avem integrati direct; trei dintre ei mai apar o data prin Innoship, si tot
 * trei prin Packeta.
 *
 * Deci acelasi curier poate ajunge in checkout pe PATRU cai, cu patru preturi.
 *
 * ⚠ NU E UN DEFECT — sunt contracte adevarate, si cel direct e adesea cel mai
 * ieftin. Hotararea din 2026-08-14 (varianta B) a fost sa nu se ascunda niciunul.
 * Dar interfata trebuie s-o SPUNA, altfel arata a dublura si comerciantul crede
 * ca s-a stricat ceva.
 *
 * ⚠ Si mai e un fel de suprapunere, care nu exista la ceilalti: pe CONTRACT
 * PROPRIU, acelasi curier apare de doua ori chiar in raspunsul SmartShip — o data
 * pe contractul comerciantului, o data pe al lor. Aia se rezolva in `preturi.ts`,
 * unde cheia ofertei cuprinde si `own_contract`; aici e vorba de suprapunerea cu
 * integrarile noastre directe.
 *
 * ⚠ Potrivirea se face pe NUME, nu pe id: tabelul lor de curieri e „generat
 * automat din platforma" si se poate schimba, iar id-urile 3, 6, 34 si 35 apar in
 * documentatie fara sa fie in tabel. Numele („Cargus", „SameDay EasyBox") sunt
 * stabile.
 */

/** Fragmentele de nume dupa care recunoastem un curier de-al nostru. */
const DUPA_NUME: { fragment: string; id: string; eticheta: string }[] = [
  { fragment: "cargus", id: "cargus", eticheta: "Cargus" },
  { fragment: "dpd", id: "dpd", eticheta: "DPD" },
  /* ⚠ „fan" inainte de nimic altceva: „FanCourier", „FAN Courier" si „FANbox" sunt
     acelasi curier pentru noi. */
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
 * Id-ul nostru de curier pentru un curier SmartShip, daca il avem si direct.
 *
 * ⚠ Se cauta fragmentul in numele NORMALIZAT, nu egalitate: numele lor poarta si
 * serviciul („SameDay EasyBox"), care nu ne intereseaza aici.
 */
export function curierulNostru(numeSmartship: string | null | undefined): { id: string; eticheta: string } | null {
  const k = cheie(numeSmartship);
  if (!k) return null;
  const gasit = DUPA_NUME.find((c) => k.includes(c.fragment));
  return gasit ? { id: gasit.id, eticheta: gasit.eticheta } : null;
}

export type SuprapunereSmartship = {
  id: string;
  eticheta: string;
  /** Numele exact din raspunsul lor, ca sa se recunoasca in lista din panou. */
  numeSmartship: string;
};

/**
 * Care dintre curierii SmartShip ALESI se suprapun peste cei activi direct.
 *
 * ⚠ Se tine seama de alegerea comerciantului: daca a scos deja Cargus din lista
 * SmartShip, suprapunerea nu mai exista si n-are rost sa i se spuna. Un
 * avertisment care apare cand problema e deja rezolvata invata omul sa nu se mai
 * uite la avertismente.
 */
export function suprapuneri(
  curieriSmartship: { id: number; nume: string }[],
  activiDirect: readonly string[],
  alesi?: readonly number[],
): SuprapunereSmartship[] {
  const activi = new Set(activiDirect);
  const permisi = new Set(alesi ?? []);

  const iesire: SuprapunereSmartship[] = [];
  const vazute = new Set<string>();

  for (const c of curieriSmartship ?? []) {
    if (permisi.size > 0 && !permisi.has(c.id)) continue;
    const alNostru = curierulNostru(c.nume);
    if (!alNostru || !activi.has(alNostru.id) || vazute.has(alNostru.id)) continue;
    vazute.add(alNostru.id);
    iesire.push({ id: alNostru.id, eticheta: alNostru.eticheta, numeSmartship: c.nume });
  }

  return iesire.sort((a, b) => a.eticheta.localeCompare(b.eticheta));
}

/**
 * Textul avertismentului.
 *
 * ⚠ Nu spune „de doua ori": la SmartShip caile pot fi patru (direct, Innoship,
 * Packeta, SmartShip), iar un numar gresit e mai rau decat niciunul.
 */
export function textSuprapunere(lista: SuprapunereSmartship[]): string | null {
  if (lista.length === 0) return null;
  const nume = lista.map((s) => s.eticheta);
  const enumerare = nume.length === 1
    ? nume[0]
    : `${nume.slice(0, -1).join(", ")} si ${nume[nume.length - 1]}`;

  return (
    `${enumerare} ${nume.length === 1 ? "apare" : "apar"} si pe contractul tau direct, si prin SmartShip. `
    + "Cumparatorul o sa vada ambele variante, la preturi diferite — poate fi exact ce vrei "
    + "(alegi contractul mai ieftin), dar poate parea si o dublura. "
    + `Daca preferi doar contractul direct, scoate-${nume.length === 1 ? "l" : "i"} din lista de mai sus.`
  );
}
