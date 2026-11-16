/**
 * Vestile tbi Fusion Pay („Status Updates") si ce face fiecare dintre ele. Modul PUR.
 *
 * ═══ CE TRIMIT EI (documentatia „RO Fusion Pay", „Status Updates") ═══
 *
 * La `statusURL` (si, pentru rambursari, la `refundLink`) vine `{ "data": "<criptat>" }`, care,
 * descifrat cu cheia magazinului, da:
 *
 *   { "command": "update_status", "OrderId": "<orderid trimis de noi>", "Status": "0".."6",
 *     "Message": "Comanda anulata TBI", "Motive": "", "ContractNumber": "20266032281" }
 *
 *   2  Comanda in derulare TBI   in lucru         intermediara
 *   1  Plata TBI acceptata       aprobata         finala
 *   0  Comanda anulata TBI       anulata          finala
 *   3  Comanda anulata TBI       respinsa         finala   (acelasi text ca la 0; doar codul le desparte)
 *   4  Refund Registered         rambursare inregistrata
 *   5  Refund Processing         rambursare in lucru
 *   6  Refund Completed          rambursare terminata
 *
 * ⚠⚠ PE FIR NUMELE SUNT ALTELE DECAT IN TEXT. Exemplul CRIPTAT din documentatie (`data: "PjNk..."`),
 * descifrat cu cheia de test, da (verificat 16.11.2026):
 *
 *   {"command":"update_status","order_id":"2371998","status":0,"message":"Comanda anulata TBI",
 *    "motive":"","contract_id":"20266032281"}
 *
 * adica litere mici si `status` NUMAR, desi JSON-ul scris langa el are `OrderId`, `Status: "0"`,
 * `Message`, `Motive`, `ContractNumber` (iar tabelul, `Contract_id`). Se primesc toate formele: o
 * veste citita dupa numele din text s-ar fi pierdut cu totul (fara OrderId = eroare).
 */

export const STARI_TBI = ["creata", "trimisa", "in_analiza", "aprobata", "respinsa", "anulata", "eroare"] as const;
export type StareTbi = (typeof STARI_TBI)[number];

/** Starile din care banca mai poate hotari ceva. Pe ele lucreaza anularea si cronul. */
export const STARI_DESCHISE: readonly StareTbi[] = ["creata", "trimisa", "in_analiza"];

export type CodVesteTbi = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type VesteTbi = {
  orderId: string;
  statusId: CodVesteTbi;
  /** `Message`: starea, in romana. */
  mesaj: string;
  /** `Motive`: de ce, cand tbi spune. Poate fi gol. */
  motiv: string;
  /** Numarul contractului de credit la tbi, cand il trimit. */
  contract: string;
};

const sirScurt = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v.trim().slice(0, max) : "";

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

  /* Singura comanda documentata. Alta inseamna ca tbi a schimbat ceva: se spune, nu se ghiceste. */
  const comanda = sirScurt(r.command, 40);
  if (comanda && comanda !== "update_status") return { eroare: `command necunoscut: ${comanda}` };

  const orderId = sirScurt(r.OrderId ?? r.orderId ?? r.order_id, 40);
  if (!orderId) return { eroare: "Vestea nu are OrderId." };

  const brut = r.Status ?? r.status;
  const cod = typeof brut === "number" ? brut : typeof brut === "string" && /^\s*\d+\s*$/.test(brut) ? Number(brut) : NaN;
  if (!Number.isInteger(cod) || cod < 0 || cod > 6) {
    return { eroare: `Status necunoscut: ${JSON.stringify(brut ?? null).slice(0, 40)}` };
  }

  return {
    orderId,
    statusId: cod as CodVesteTbi,
    mesaj: sirScurt(r.Message ?? r.message, 200),
    motiv: sirScurt(r.Motive ?? r.motive, 300),
    contract: sirScurt(r.ContractNumber ?? r.Contract_id ?? r.contract_id ?? r.contractNumber, 60),
  };
}

export type StareDinVeste = "aprobata" | "in_analiza" | "respinsa" | "anulata";

/** Starea cererii pe care o spune vestea; `null` la vestile despre rambursare (4-6). */
export function stareaDinVeste(v: Pick<VesteTbi, "statusId">): StareDinVeste | null {
  switch (v.statusId) {
    case 1: return "aprobata";
    case 2: return "in_analiza";
    case 3: return "respinsa";
    case 0: return "anulata";
    default: return null;
  }
}

/**
 * Ce urmeaza dupa o veste.
 *
 *   plateste                comanda se marcheaza platita (o singura regula, `finalizeazaPlataComenzii`,
 *                           care e idempotenta: o veste repetata nu mai face nimic);
 *   respinsa / anulata      comerciantul afla, o data;
 *   anulata_dupa_aprobare   ⚠ comerciantul afla TARE, iar comanda NU se atinge (vezi mai jos);
 *   rambursare_in_curs      tbi a inregistrat sau lucreaza la o rambursare: doar in istoric;
 *   rambursata              rambursarea s-a terminat: banii se intorc la client (`baniiSAuIntors`);
 *   nimic                   vestea repeta ce stiam, sau a ajuns dupa una mai noua.
 */
export type EfectVeste =
  | "plateste" | "respinsa" | "anulata" | "anulata_dupa_aprobare" | "rambursare_in_curs" | "rambursata" | "nimic";

/**
 * ═══ DOUA HOTARARI CARE PAR MICI ═══
 *
 * 1. O veste „in lucru" DUPA aprobare nu intoarce nimic. Vestile pot sosi in alta ordine
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
export function treceLa(curenta: StareTbi, veste: Pick<VesteTbi, "statusId">): { stare: StareTbi; efect: EfectVeste } {
  const noua = stareaDinVeste(veste);
  if (noua === null) {
    /* Rambursarile privesc doar un credit aprobat; altfel n-au ce rambursa. */
    if (curenta !== "aprobata") return { stare: curenta, efect: "nimic" };
    return { stare: "aprobata", efect: veste.statusId === 6 ? "rambursata" : "rambursare_in_curs" };
  }
  if (noua === "aprobata") return { stare: "aprobata", efect: "plateste" };
  if (curenta === "aprobata") {
    if (noua === "in_analiza") return { stare: "aprobata", efect: "nimic" };
    return { stare: noua, efect: "anulata_dupa_aprobare" };
  }
  if (noua === curenta) return { stare: curenta, efect: "nimic" };
  if (noua === "in_analiza") return { stare: "in_analiza", efect: "nimic" };
  return { stare: noua, efect: noua };
}

const fara = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Starea scrisa de `GetApplicationStatus` („Plata TBI acceptata"), tradusa in codul vestii. Pentru
 * cronul de reconciliere, cand vestea n-a ajuns. `null` = un text pe care nu-l stim: nu se ghiceste.
 *
 * ⚠ „Comanda anulata TBI" acopera si anularea, si refuzul bancii (vezi antetul): aici nu se pot
 * deosebi, deci se citeste „anulata". Vestea adevarata, cand vine, poarta codul exact.
 */
export function codulDinTextTbi(stare: string): CodVesteTbi | null {
  const t = fara(stare);
  if (t === "plata tbi acceptata") return 1;
  if (t === "comanda in derulare tbi") return 2;
  if (t === "comanda anulata tbi" || t === "canceledbycustomer") return 0;
  return null;
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
