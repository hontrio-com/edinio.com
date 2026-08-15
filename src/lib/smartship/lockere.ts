import type { LockerBrut } from "./client";

/**
 * Lockerele SmartShip: easybox (SameDay) si FANbox (FAN Courier).
 *
 * ═══ ⚠ SINGURELE DOUA ENDPOINTURI FARA EXEMPLU DE RASPUNS ═══
 *
 * Din tot API-ul lor, `/geolocation/easybox` si `/geolocation/fanbox` sunt
 * singurele care n-au niciun exemplu si niciun tabel de campuri: documentatia
 * spune doar „Returneaza lista lockerelor disponibile pentru livrare".
 *
 * Exact situatia de la `FixedLocations` al Innoship. Si acolo hotararea a fost
 * aceeasi, si a fost buna: se citeste TOLERANT (fiecare camp cautat prin toate
 * numele cu putinta), si exista un buton de diagnostic in panou care arata
 * CHEILE REALE ale raspunsului. Asa presupunerile de mai jos se scurteaza la
 * adevar la prima cheie de cont, in loc sa fie ghicite iar si iar.
 *
 * ⚠ Ce NU se ghiceste: `id`-ul. Fara el punctul nu poate ajunge in `locker_id` la
 * emitere, deci un rand fara id se ARUNCA — mai bine o lista mai scurta decat un
 * locker pe care cumparatorul il alege si care nu se poate emite.
 *
 * ⚠ Si `locker_id` e INTREG in documentatia campului `content.locker_id`
 * („integer"). De aia `idNumeric` e singura forma acceptata: la GLS, Posta si
 * Packeta id-ul e sir si un `Number(...)` copiat mecanic l-ar fi pierdut; aici e
 * pe dos, si un id nenumeric ar fi respins de ei cu 806.
 */

export type LockerSmartship = {
  /** ⚠ Sir in afara, dar mereu format dintr-un INTREG: `content.locker_id` e integer. */
  id: string;
  nume: string;
  adresa: string;
  oras: string;
  judet: string;
  codPostal: string;
  lat: number;
  lng: number;
};

/** Prima valoare nevida dintre cheile date, oricum ar fi scrise. */
function camp(rand: LockerBrut, ...nume: string[]): string {
  for (const n of nume) {
    const v = rand[n];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function numar(rand: LockerBrut, ...nume: string[]): number {
  for (const n of nume) {
    const v = rand[n];
    const x = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
    if (Number.isFinite(x) && x !== 0) return x;
  }
  return 0;
}

/**
 * Id-ul lockerului, ca sir de cifre.
 *
 * ⚠ Se cere INTREG POZITIV, nu orice numar: un `0` sau un `-1` ar trece de
 * `Number.isFinite` si ar pleca in `locker_id`, unde SmartShip il respinge cu
 * 806 sau 612 — dupa ce cumparatorul si-a ales deja punctul.
 */
function idNumeric(rand: LockerBrut): string | null {
  for (const n of ["id", "locker_id", "lockerId", "easybox_id", "fanbox_id", "ID"]) {
    const v = rand[n];
    const x = typeof v === "string" ? Number(v.trim()) : Number(v);
    if (Number.isInteger(x) && x > 0) return String(x);
  }
  return null;
}

/**
 * Randurile brute → lockere gata de aratat.
 *
 * ⚠ Randurile fara id se pierd TACUT, si asta e voit: un locker fara id nu poate
 * fi emis. Cate s-au pierdut se afla din `lockereIncomplete()`, care e chiar
 * masura pentru „am ghicit gresit numele campurilor".
 */
export function normalizeazaLockere(brute: LockerBrut[]): LockerSmartship[] {
  const iesire: LockerSmartship[] = [];
  const vazute = new Set<string>();

  for (const rand of brute ?? []) {
    if (!rand || typeof rand !== "object") continue;
    const id = idNumeric(rand);
    if (!id || vazute.has(id)) continue;
    vazute.add(id);

    const oras = camp(rand, "city", "locality", "localitate", "oras", "town");
    const adresa = camp(rand, "address", "adresa", "street", "strada", "address_line", "location");

    iesire.push({
      id,
      /* Fara nume, punctul ramane recognoscibil dupa adresa — un rand gol in
         lista de lockere e mai rau decat unul numit dupa strada lui. */
      nume: camp(rand, "name", "nume", "denumire", "title", "locker_name") || adresa || `Locker ${id}`,
      adresa,
      oras,
      judet: camp(rand, "county", "judet", "district", "state"),
      codPostal: camp(rand, "postal_code", "postalCode", "zip", "cod_postal", "zipcode"),
      lat: numar(rand, "lat", "latitude", "latitudine"),
      lng: numar(rand, "lng", "long", "longitude", "lon", "longitudine"),
    });
  }

  return iesire;
}

/**
 * Cate randuri s-au pierdut pentru ca n-am gasit id-ul.
 *
 * Se arata in Diagnostic: un numar mare inseamna ca id-ul se cheama altfel decat
 * am presupus, iar `cheileRaspunsului` de mai jos spune cum.
 */
export function lockereIncomplete(brute: LockerBrut[]): number {
  return (brute ?? []).filter((r) => !!r && typeof r === "object" && idNumeric(r) === null).length;
}

/**
 * Cheile REALE ale raspunsului, cu cate un exemplu.
 *
 * ⚠ Asta e uneltele care inchide singura necunoscuta din tot contractul lor. Cat
 * timp n-avem cheie de cont, forma randului e o presupunere; cu butonul asta,
 * prima cheie reala o transforma in fapt.
 *
 * ⚠ Exemplul se TAIE la 40 de caractere si nu se logheaza nicaieri: raspunsul
 * poate contine adrese si coordonate, iar diagnosticul e pentru ecran, nu pentru
 * jurnal.
 */
export function cheileRaspunsului(brute: LockerBrut[], maxim = 30): { cheie: string; exemplu: string }[] {
  const harta = new Map<string, string>();

  for (const rand of (brute ?? []).slice(0, 20)) {
    if (!rand || typeof rand !== "object") continue;
    for (const [cheie, v] of Object.entries(rand)) {
      if (harta.has(cheie)) continue;
      const text =
        v === null ? "null"
        : typeof v === "object" ? Array.isArray(v) ? "[…]" : "{…}"
        : String(v);
      harta.set(cheie, text.slice(0, 40));
      if (harta.size >= maxim) break;
    }
    if (harta.size >= maxim) break;
  }

  return [...harta.entries()].map(([cheie, exemplu]) => ({ cheie, exemplu }));
}
