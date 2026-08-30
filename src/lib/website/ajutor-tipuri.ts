import type { LucideIcon } from "lucide-react";

/**
 * Formele centrului de ajutor. Doar tipuri și două funcții mărunte, ca fișierele
 * de categorii să nu se importe unele pe altele.
 *
 * ⚠ GHILIMELELE ÎN TEXTE SUNT „…”, PERECHE ADEVĂRATĂ. Prin comentariile
 * depozitului umblă forma „text" (deschidere românească, închidere ASCII). În
 * comentarii nu strică nimic, dar într-un șir de caractere ghilimeaua ASCII
 * ÎNCHIDE ȘIRUL și fișierul nu mai compilează. Datele din `categorii/` sunt
 * generate cu serializare, tocmai ca să nu se mai poată întâmpla.
 */

/**
 * O captură de ecran care însoțește un pas.
 *
 * ═══ CÂT TIMP `src` LIPSEȘTE, SE DESENEAZĂ UN SUBSTITUENT ═══
 *
 * Cerut de client (19.08): capturile se fac la sfârșit, dar locul lor se
 * pregătește de pe acum. Substituentul nu e o poză stricată și nici un dreptunghi
 * gri: e o casetă punctată care spune ce trebuie fotografiat.
 *
 * ⚠ `raport` E OBLIGATORIU. El rezervă ÎNĂLȚIMEA locului încă de la substituent,
 * deci când vine poza adevărată nu se mișcă nimic în pagină.
 */
export interface Captura {
  /**
   * Ce se vede în captură.
   *
   * ⚠ Se scrie ACUM, nu odată cu poza. E textul citit de cititoarele de ecran și
   * indicația pentru cine face fotografia. Lăsat pentru mai târziu, ajunge
   * „captura1” la toate.
   */
  alt: string;
  /** Calea fișierului, din `public`. Cât timp lipsește, se vede substituentul. */
  src?: string;
  /** Lățime împărțită la înălțime. */
  raport: number;
}

/**
 * Un pas dintr-un ghid.
 *
 * ⚠ Un șir simplu când n-are captură, un obiect când are. Captura stă ÎN pas, nu
 * într-o listă paralelă cu indici: textele se rescriu și se reordonează, iar cu
 * indici mutarea unui pas ar fi lăsat captura lipită de altul, fără să crape
 * nimic și fără să observe cineva.
 */
export type Pas = string | { text: string; captura: Captura };

/** Textul unui pas, oricum ar fi scris. */
export function textulPasului(p: Pas): string {
  return typeof p === "string" ? p : p.text;
}

/** Captura unui pas, dacă are. */
export function capturaPasului(p: Pas): Captura | undefined {
  return typeof p === "string" ? undefined : p.captura;
}

export interface Ghid {
  /** Ultima bucată din adresă. Fără diacritice, unic în tot centrul. */
  slug: string;
  titlu: string;
  /** Un rând. Se vede în listă, în rezultatele căutării și în metadate. */
  rezumat: string;
  /**
   * Una sau două propoziții înaintea pașilor, când chiar sunt necesare.
   *
   * ⚠ Nu e o introducere de complezență: regula 5 dată de client oprește
   * introducerile generale, iar regula 20 formulele de tipul „În acest ghid...”.
   * Aici intră doar o lămurire fără de care primul pas n-ar avea sens.
   */
  intro?: string;
  /** Pașii, în ordine. Scurți și concreți: unde intri și ce apeși. */
  pasi: Pas[];
  /**
   * Ce se lămurește DUPĂ pași: câmpurile, opțiunile, cazurile aparte, erorile.
   *
   * ⚠ Aici stă amănuntul, nu în pași. Clientul a cerut (19.08) ghiduri detaliate,
   * fiindcă primele erau prea scurte ca să ajute. Regula 12 cere însă pași scurți,
   * iar cele două nu se bat cap în cap dacă amănuntul coboară sub ei: cine știe ce
   * are de făcut urmărește pașii și pleacă, cine se împotmolește citește mai
   * departe.
   */
  detalii?: { titlu: string; text: string }[];
  /**
   * O condiție sau o limitare reală.
   *
   * ⚠ Nu e o „casetă de sfat”. Regula 22 cere ca limitările să fie spuse direct,
   * iar regula 15 oprește casetele de tip „Pro Tip”.
   */
  nota?: string;
  /**
   * Cuvinte pe care le-ar tasta cineva care caută ghidul, dar care NU apar în
   * titlu sau în rezumat.
   *
   * ⚠ Aici stă jumătate din valoarea căutării. Cine are o problemă nu caută cum
   * am numit noi ghidul, ci cum îi spune el lucrului: scrie „awb”, nu „cum
   * conectezi un curier”.
   */
  termeni?: string[];
}

/**
 * Un grup de ghiduri dintr-o categorie.
 *
 * ⚠ GRUPURILE EXISTĂ FIINDCĂ SUNT 406 DE GHIDURI. O categorie cu nouăzeci de
 * rânduri unul sub altul nu se citește, se derulează. Grupurile o taie pe zonele
 * panoului, adică fix după cum caută omul: cine are o problemă cu retururile nu
 * vrea să treacă peste tot ce ține de comenzi.
 */
export interface GrupGhiduri {
  titlu: string;
  ghiduri: Ghid[];
}

export interface CategorieAjutor {
  slug: string;
  titlu: string;
  /** Un rând, pe cardul din pagina de start a centrului. */
  descriere: string;
  icon: LucideIcon;
  grupuri: GrupGhiduri[];
}

/** Toate ghidurile dintr-o categorie, fără împărțirea pe grupuri. */
export function ghidurileCategoriei(c: CategorieAjutor): Ghid[] {
  return c.grupuri.flatMap((g) => g.ghiduri);
}
