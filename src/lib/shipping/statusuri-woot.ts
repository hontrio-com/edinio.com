import type { WootEveniment } from "@/lib/woot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE SPUNE WOOT DESPRE COLET, SI CAT ANUME INTELEGEM                (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `GET /orders/{id}/history` da o lista de evenimente cu `status_id` (intreg), `comment` (text
 * in romana) si `added`. Fisierul asta alege UNUL dintre ele: ultimul.
 *
 * ═══ ⚠⚠ DE CE NU EXISTA AICI NICIO HARTA DE STARI ═══
 *
 * Fiindca nu se poate scrie una onesta azi. Cautat, nu presupus:
 *
 *   * in specificatia lor OpenAPI (22 de cai) NU exista nicio enumerare a starilor unei comenzi.
 *     Singura lista documentata e a RAMBURSURILOR (`0=Cancelled, 1=Unpicked, 2=Picked up,
 *     3=Paid, 4=External`), si aceea e alt drum;
 *   * din exemplele lor se vede doar capatul de jos: 1 „Comanda primita", 2 „AWB generat",
 *     3 „Ridicat de curier". Nimic despre livrat, refuzat, retur sau anulat;
 *   * modulul lor oficial de WooCommerce (2.2.8, despachetat si citit) nu atinge deloc
 *     `status_id`: el nici nu creeaza expedieri, doar coteaza.
 *
 * Ceilalti paisprezece curieri au fiecare un `statusUrmator` fiindca fiecare publica un tabel de
 * coduri (FAN `reports/awb-events`, Sameday, UPS). ⚠ Aici un tabel GHICIT ar muta comanda pe
 * „Livrat" si ar declansa FACTURAREA AUTOMATA pe un colet inca in masina. De aceea cronul
 * inregistreaza, si nu hotaraste.
 *
 * ⚠ SI ASA SE VA AFLA HARTA: din perechile (numar, eticheta) pe care le strange chiar cronul, pe
 * expedieri adevarate. Peste cateva zile lista iese dintr-o interogare in baza noastra, nu dintr-o
 * presupunere de azi. Intai se masoara, apoi se cableaza.
 */

export type StareWoot = {
  /** `status_id`-ul lor, pastrat ca numar brut. Intelesul lui inca nu e cunoscut. */
  statusId: number | null;
  /** `comment`-ul lor, in romana. Singurul lucru care se poate arata omului ca atare. */
  eticheta: string | null;
  /** Cand au scris evenimentul, asa cum l-au scris ei. */
  cand: string | null;
};

/**
 * Ultimul eveniment din istoric.
 *
 * ⚠ DUPA TIMP, NU DUPA LOCUL DIN LISTA. Exemplul lor vine in ordine crescatoare, dar ordinea unei
 * liste nu e un contract, iar „ultimul element" e tocmai genul de presupunere care se strica tacut
 * la o schimbare de partea lor. Se ia cel mai NOU `added`, iar la egalitate `id`-ul mai mare,
 * fiindca el creste cu fiecare eveniment scris.
 *
 * ⚠ SI EVENIMENTUL, NU UN SUMAR: la Woot nu exista sumar cumulativ, cum are Sameday
 * (`expeditionSummary`). Deci un eveniment administrativ venit dupa livrare S-AR vedea aici in
 * locul livrarii. Cat timp starea asta doar SE ARATA, pretul greselii e un text invechit pe ecran.
 * Cand se va lega de tranzitia comenzii, regula va trebui sa devina cumulativa, si de aia sta
 * scrisa aici, nu in cron. Lectia e platita la GLS si scrisa intreaga in `posta/statusuri.ts`.
 */
export function ultimulEvenimentWoot(istoric: WootEveniment[] | null | undefined): StareWoot | null {
  if (!Array.isArray(istoric) || istoric.length === 0) return null;

  let ales: WootEveniment | null = null;
  for (const e of istoric) {
    if (!e || typeof e !== "object") continue;
    /* Un eveniment fara stare si fara text n-are ce sa ne spuna. */
    const areCeva = Number.isFinite(Number(e.status_id)) || (typeof e.comment === "string" && e.comment.trim());
    if (!areCeva) continue;
    if (!ales || eMaiNou(e, ales)) ales = e;
  }
  if (!ales) return null;

  const id = Number(ales.status_id);
  const eticheta = typeof ales.comment === "string" ? ales.comment.trim() : "";
  return {
    statusId: Number.isFinite(id) && Number.isInteger(id) ? id : null,
    eticheta: eticheta || null,
    cand: typeof ales.added === "string" && ales.added.trim() ? ales.added.trim() : null,
  };
}

/**
 * ⚠ Compararea se face pe SIRUL de timp, nu pe `Date`.
 *
 * Ei scriu „2024-01-15T09:00:00", fara fus. Trecut prin `new Date()`, sirul asta se citeste in
 * fusul masinii care ruleaza, iar doua evenimente la distanta de o ora ar putea sari unul peste
 * altul cand serverul e in alt fus decat ei. Forma lor e insa ordonabila ca text, si asta e de
 * ajuns pentru „care e mai nou". La egalitate, sau cand unul n-are timp deloc, hotaraste `id`-ul.
 */
function eMaiNou(candidat: WootEveniment, fataDe: WootEveniment): boolean {
  const a = typeof candidat.added === "string" ? candidat.added : "";
  const b = typeof fataDe.added === "string" ? fataDe.added : "";
  if (a !== b) return a > b;
  return (Number(candidat.id) || 0) > (Number(fataDe.id) || 0);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HARTA DE STARI, SCRISA DIN DATE ADEVARATE                      (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ ANTETUL DE MAI SUS SPUNEA CA AICI NU EXISTA NICIO HARTA, si avea dreptate atunci: Woot nu
 * publica nicaieri ce inseamna `status_id`-urile lui. Ce s-a schimbat nu e documentatia lor, ci
 * faptul ca avem acum MASURATOARE: cronul a strans perechi (numar, eticheta) de pe expedieri
 * adevarate, exact cum promitea randul care spunea „harta se va citi din baza noastra".
 *
 * ⚠ FIECARE NUMAR DE MAI JOS VINE CU DE CATE ORI A FOST VAZUT, si cu eticheta scrisa de EI. Cine
 * schimba ceva aici remasoara intai, cu interogarea din `docs/curieri/WOOT.md`.
 *
 * Masurat pe 15.09.2026, prima rulare a cronului, 12 expedieri:
 *
 *     10  „Expedierea ta a fost livrata cu success."                        7 expedieri
 *      4  „Expedierea ta a fost receptionata in depozitul DPD."             3 expedieri
 *      5  „Expedierea ta a fost preluata spre livrare de catre curierul DPD." 1 expediere
 *      9  „Returnare comanda 5173400"                                       1 expediere
 *
 * Si trei din exemplele documentatiei lor, nevazute inca in trafic:
 *
 *      1  „Comanda primita"        2  „AWB generat"        3  „Ridicat de curier"
 *
 * ⚠ ETICHETA NU E ENUM: la `9` ea poarta chiar numarul comenzii lor („Returnare comanda 5173400"),
 * deci se schimba de la o comanda la alta. Harta se face pe NUMAR; textul ramane pentru om.
 *
 * ⚠ CE NU E IN HARTA NU MISCA NIMIC. Numerele 6, 7, 8 si orice peste 10 nu s-au vazut inca, deci
 * nu primesc niciun inteles: comanda nu se muta, si cronul le NUMARA separat, ca harta sa poata
 * creste din trafic in loc sa creasca din presupuneri.
 */

type OperatieWoot = {
  clasa: "livrat" | "la_comerciant" | "in_retea" | "problema" | "necunoscut";
  final?: true;
  retur?: true;
};

export const STARI_WOOT: Readonly<Record<string, OperatieWoot>> = {
  "1": { clasa: "la_comerciant" },  // Comanda primita (din exemplele lor)
  "2": { clasa: "la_comerciant" },  // AWB generat (din exemplele lor)
  "3": { clasa: "in_retea" },       // Ridicat de curier (din exemplele lor)
  "4": { clasa: "in_retea" },       // receptionata in depozitul curierului
  "5": { clasa: "in_retea" },       // preluata spre livrare de catre curier
  /* ⚠ Returul NU e final: coletul inca se misca, si abia cand ajunge inapoi se incheie ceva. */
  "9": { clasa: "problema", retur: true }, // Returnare comanda
  "10": { clasa: "livrat", final: true },  // livrata cu success
};

/** Ce inseamna numarul asta. Unul nevazut inca ramane `necunoscut`, nu o ghicitura. */
export function clasificaStareaWoot(statusId: number | null | undefined): OperatieWoot["clasa"] {
  if (statusId === null || statusId === undefined || !Number.isInteger(statusId)) return "necunoscut";
  return STARI_WOOT[String(statusId)]?.clasa ?? "necunoscut";
}

/** Treptele pe care o comanda le urca, niciodata invers. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Starea urmatoare, sau `null` cand nu e nimic de schimbat.
 *
 * ⚠ NU COBOARA NICIODATA, si ⚠ `problema` intoarce `null`: un retur nu are voie sa anuleze singur
 * comanda. Comerciantul primeste o instiintare si hotaraste el.
 */
export function statusUrmatorWoot(
  statusCurent: string,
  statusId: number | null | undefined,
): "processing" | "shipped" | "delivered" | null {
  const clasa = clasificaStareaWoot(statusId);
  const tinta = clasa === "livrat" ? "delivered"
    : clasa === "in_retea" ? "shipped"
    : clasa === "la_comerciant" ? "processing"
    : null;
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/** Merita o instiintare catre comerciant? */
export function trebuieSemnalatWoot(statusId: number | null | undefined): boolean {
  return clasificaStareaWoot(statusId) === "problema";
}

/** Coletul se intoarce? Schimba doar formularea instiintarii. */
export function esteReturWoot(statusId: number | null | undefined): boolean {
  return statusId !== null && statusId !== undefined && STARI_WOOT[String(statusId)]?.retur === true;
}

/** Capat de drum ADEVARAT: cronul poate inceta sa intrebe. */
export function eStareFinalaWoot(statusId: number | null | undefined): boolean {
  return statusId !== null && statusId !== undefined && STARI_WOOT[String(statusId)]?.final === true;
}

/** Numarul asta e inca fara inteles pentru noi? Cronul le strange ca sa creasca harta. */
export function eStareNecunoscutaWoot(statusId: number | null | undefined): boolean {
  return statusId !== null && statusId !== undefined && !(String(statusId) in STARI_WOOT);
}
