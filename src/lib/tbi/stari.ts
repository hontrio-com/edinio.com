/**
 * Vestile tbi („ReturnToProvider") si ce face fiecare dintre ele. Modul PUR.
 *
 * ═══ CE TRIMIT EI (documentatia, „API – ReturnToProvider method") ═══
 *
 *   { "order_id": "<id-ul trimis de noi>", "status_id": "0"|"1"|"2", "motiv": "..." }
 *
 *   1  aprobata                          motiv gol
 *   2  in asteptare                      motiv = starea intermediara
 *   0  anulata                           motiv gol
 *   0  respinsa                          motiv = „Respins Biroul de Credit" / „Criterii eligibilitate"
 *
 * Deci la 0 DOAR motivul desparte „s-a razgandit" de „banca l-a refuzat", si asta conteaza: un
 * refuz al bancii e o veste pentru comerciant (clientul poate plati altfel), o anulare nu.
 *
 * ⚠ Pe fir `status_id` vine NUMAR (masurat pe vestea-exemplu din pachetul lor de test), desi
 * documentatia il scrie text. Se primesc amandoua.
 */

export const STARI_TBI = ["creata", "trimisa", "in_analiza", "aprobata", "respinsa", "anulata", "eroare"] as const;
export type StareTbi = (typeof STARI_TBI)[number];

/** Starile din care banca mai poate hotari ceva. Pe ele lucreaza anularea si cronul. */
export const STARI_DESCHISE: readonly StareTbi[] = ["creata", "trimisa", "in_analiza"];

export type VesteTbi = { orderId: string; statusId: 0 | 1 | 2; motiv: string };

/** Vestea descifrata, verificata camp cu camp. Orice abatere e o eroare spusa, nu ghicita. */
export function citesteVesteaTbi(text: string): VesteTbi | { eroare: string } {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return { eroare: "Vestea descifrata nu e JSON." };
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { eroare: "Vestea descifrata nu e un obiect." };
  const r = o as Record<string, unknown>;

  const orderId = typeof r.order_id === "number" && Number.isFinite(r.order_id)
    ? String(r.order_id)
    : typeof r.order_id === "string" ? r.order_id.trim() : "";
  if (!orderId) return { eroare: "Vestea nu are order_id." };

  const brut = r.status_id;
  const statusId = typeof brut === "number"
    ? brut
    : typeof brut === "string" && /^\s*\d+\s*$/.test(brut) ? Number(brut) : NaN;
  if (statusId !== 0 && statusId !== 1 && statusId !== 2) {
    return { eroare: `status_id necunoscut: ${JSON.stringify(brut ?? null).slice(0, 40)}` };
  }

  const motiv = typeof r.motiv === "string" ? r.motiv.trim().slice(0, 300) : "";
  return { orderId, statusId, motiv };
}

export type StareDinVeste = "aprobata" | "in_analiza" | "respinsa" | "anulata";

export function stareaDinVeste(v: VesteTbi): StareDinVeste {
  if (v.statusId === 1) return "aprobata";
  if (v.statusId === 2) return "in_analiza";
  return v.motiv ? "respinsa" : "anulata";
}

/**
 * Ce urmeaza dupa o veste.
 *
 *   plateste               comanda se marcheaza platita (o singura regula, `finalizeazaPlataComenzii`,
 *                          care e idempotenta: o veste repetata nu mai face nimic);
 *   respinsa / anulata     comerciantul afla, o data;
 *   anulata_dupa_aprobare  ⚠ comerciantul afla TARE, iar comanda NU se atinge (vezi mai jos);
 *   nimic                  vestea repeta ce stiam, sau a ajuns dupa una mai noua.
 */
export type EfectVeste = "plateste" | "respinsa" | "anulata" | "anulata_dupa_aprobare" | "nimic";

/**
 * ═══ DOUA HOTARARI CARE PAR MICI ═══
 *
 * 1. O veste „in asteptare" DUPA aprobare nu intoarce nimic. Vestile pot sosi in alta ordine
 *    decat au plecat, iar banca nu se intoarce de la „aprobat" la „analizez".
 *
 * 2. ⚠ ANULAREA DUPA APROBARE NU MISCA BANII. Comanda e deja `paid` (poate cu factura emisa si
 *    marfa plecata), iar o anulare aici inseamna de obicei ca omul a renuntat la contract dupa
 *    semnare. Nu stim insa daca tbi a apucat sa plateasca si daca mai plateste. „Rambursat" ar
 *    spune ca s-au intors bani pe care nu i-a dat nimeni inapoi; „neplatit" ar sterge o plata care
 *    poate exista. O necunoscuta spusa e mai buna decat o stare gresita scrisa in baza: comerciantul
 *    primeste notificarea, iar comanda ramane cum era. Aceeasi regula ca la rambursarea partiala
 *    din `lib/plati/banii-s-au-intors.ts`.
 */
export function treceLa(curenta: StareTbi, veste: VesteTbi): { stare: StareTbi; efect: EfectVeste } {
  const noua = stareaDinVeste(veste);
  if (noua === "aprobata") return { stare: "aprobata", efect: "plateste" };
  if (curenta === "aprobata") {
    if (noua === "in_analiza") return { stare: "aprobata", efect: "nimic" };
    return { stare: noua, efect: "anulata_dupa_aprobare" };
  }
  if (noua === curenta) return { stare: curenta, efect: "nimic" };
  if (noua === "in_analiza") return { stare: "in_analiza", efect: "nimic" };
  return { stare: noua, efect: noua };
}

/** Pentru panou: fiecare stare, in cuvintele comerciantului. */
export const ETICHETA_STARE_TBI: Record<StareTbi, string> = {
  creata: "Se trimite la tbi bank",
  trimisa: "Clientul completează cererea",
  in_analiza: "În analiză la tbi bank",
  aprobata: "Finanțare aprobată",
  respinsa: "Respinsă de tbi bank",
  anulata: "Anulată",
  eroare: "Netrimisă",
};
