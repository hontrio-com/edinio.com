import { normalizeazaCantitate } from "@/lib/orders/quantity";
import { lineKey, type CartItem } from "./normalize";

/**
 * ═══ EDITAREA UNEI LINII PERSONALIZATE, DIN COS ═══
 *
 * Pana acum, cine gresea o gravura sau alegea alt material n-avea decat o cale: sa stearga linia
 * si s-o ia de la capat — inclusiv incarcarea celor sapte poze pentru fototapet. Iar cand
 * comerciantul schimba definitia, cosul chiar ii CEREA sa faca asta („Necesita actualizare —
 * deschide produsul si alege din nou"), fara sa-i dea unde.
 *
 * ⚠ CE SE MUTA PRIN URL: NIMIC. Doar un steag, `?editeaza=1`.
 *
 * Identitatea liniei e `lineKey`, care poarta personalizarea intreaga si poate trece de doua mii
 * de caractere. Pusa in adresa, ea ar fi: taiata tacut de browsere si de proxy-uri; scrisa in
 * fiecare log de acces prin care trece pagina — adica numele copilului si cheile fisierelor
 * incarcate, ajunse in jurnale care n-au de ce sa le vada; si lipita de om cand da mai departe
 * linkul produsului. Cheia sta in `sessionStorage`, care e AL FILEI: nu pleaca nicaieri, nu se
 * copiaza cu adresa, si moare cu fila.
 *
 * ⚠ SI DE CE UN STEAG SI NU DOAR STOCAREA: fiindca altfel o vizita obisnuita la pagina produsului,
 * mai tarziu, ar fi redeschis editarea unei linii pe care omul o uitase. Steagul spune „chiar de
 * acolo am venit"; stocarea spune „despre care linie e vorba". Amandoua, sau nimic.
 *
 * ⚠ NU SE CONSUMA LA CITIRE. Ar fi parut curat, dar React randeaza de doua ori in dezvoltare, si a
 * doua randare ar fi gasit stocarea goala — pagina ar fi cazut inapoi pe „adauga", pierzand exact
 * linia pe care omul venise s-o repare. Se sterge cand editarea se INCHEIE: salvata sau anulata.
 */

/** Steagul din adresa. Valoarea nu conteaza, doar prezenta. */
export const PARAM_EDITARE = "editeaza";

/** Unde sta cheia liniei, in `sessionStorage`. */
export const SLOT_EDITARE = "edinio:linie-de-editat";

/** Cat de mult din stocare acceptam sa citim — o cheie mai lunga de-atat nu e o cheie a noastra. */
const MAX_CHEIE = 8000;

/**
 * Minimul din `Storage` de care avem nevoie.
 *
 * ⚠ SE PRIMESTE DE AFARA ca probele sa poata rula fara browser — si fiindca `sessionStorage`
 * ARUNCA, nu doar intoarce null, in navigarea privata a unor browsere mai vechi si cand utilizatorul
 * a inchis stocarea pe site. Fiecare atingere e in `try`.
 */
export interface StocareLinie {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

function stocarea(s?: StocareLinie | null): StocareLinie | null {
  if (s) return s;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Insemneaza linia care urmeaza sa fie editata.
 *
 * Intoarce `false` cand stocarea nu merge — si atunci cine cheama NU trebuie sa navigheze cu
 * steagul: pagina produsului ar fi deschis o „editare" fara sa stie ce editeaza, iar salvarea ar
 * fi adaugat o linie noua langa cea veche. Mai bine linkul obisnuit al produsului.
 */
export function porneste(cheie: string, s?: StocareLinie | null): boolean {
  const st = stocarea(s);
  if (!st || !cheie) return false;
  try {
    st.setItem(SLOT_EDITARE, cheie);
    return true;
  } catch {
    return false;
  }
}

/** Cheia liniei de editat, sau `null` cand nu suntem in editare. */
export function cheiaDeEditat(
  cautare: string | URLSearchParams | null | undefined,
  s?: StocareLinie | null,
): string | null {
  if (cautare === null || cautare === undefined) return null;
  const params = typeof cautare === "string" ? new URLSearchParams(cautare) : cautare;
  if (!params.has(PARAM_EDITARE)) return null;
  const st = stocarea(s);
  if (!st) return null;
  try {
    const cheie = st.getItem(SLOT_EDITARE);
    return cheie && cheie.length <= MAX_CHEIE ? cheie : null;
  } catch {
    return null;
  }
}

/** Editarea s-a incheiat — salvata sau anulata. Cheia nu mai are ce cauta in fila. */
export function incheie(s?: StocareLinie | null): void {
  const st = stocarea(s);
  if (!st) return;
  try {
    st.removeItem(SLOT_EDITARE);
  } catch {}
}

/**
 * Adresa paginii de produs, in modul editare.
 *
 * ⚠ `null` cand linia n-are `slug`: liniile vechi din browserele oamenilor n-au cheia asta, si
 * fara ea nu stim CARE pagina de produs. Atunci butonul nu se deseneaza deloc — un buton care duce
 * la 404 e mai rau decat lipsa lui.
 */
export function adresaDeEditare(basePath: string, item: Pick<CartItem, "slug">): string | null {
  if (!item.slug) return null;
  return `${basePath}/product/${item.slug}?${PARAM_EDITARE}=1`;
}

/**
 * Linia din cos pe care o editam, dupa cheie.
 *
 * ⚠ POATE LIPSI, si nu e o eroare: cosul se citeste din `localStorage` DUPA prima randare, iar
 * intre timp lista e goala. Tot asa, linia poate fi stearsa din alta fila. Cine cheama deosebeste
 * cele doua cazuri prin `hydrated`.
 */
export function liniaDeEditat(items: CartItem[], cheie: string | null): CartItem | null {
  if (!cheie) return null;
  return items.find((i) => lineKey(i) === cheie) ?? null;
}

/**
 * Cosul de dupa o editare — o SINGURA trecere peste vector.
 *
 * ═══ ⚠ DE CE NU „ADAUGA APOI STERGE" ═══
 *
 * Doua chemari inseamna doua scrieri in `localStorage`, si intre ele cosul e gresit: cu linia de
 * doua ori daca se adauga intai, sau — daca cineva inverseaza vreodata ordinea — fara ea deloc.
 * O fila inchisa, o navigare, o exceptie in mijloc, si omul ramane cu paguba scrisa pe disc.
 *
 * ═══ ⚠ TREI CAZURI, NU UNUL ═══
 *
 * 1. Cheia noua e chiar cea veche (s-a schimbat doar cantitatea, sau nimic): linia se rescrie PE
 *    LOC. „Adauga apoi sterge" ar fi crescut cantitatea si apoi ar fi sters TOT randul — adica
 *    editarea unei linii fara sa-i schimbi nimic ar fi golit-o din cos.
 * 2. Cheia noua o are DEJA alta linie (omul a editat „Robert" ca sa scrie tot „Maria", si mai
 *    avea o cana „Maria"): cele doua se contopesc, cu cantitatile adunate. Asta e chiar intelesul
 *    lui `lineKey` — doua linii identice sunt o linie cu cantitatea 2 — si daca n-am face-o aici,
 *    cosul ar arata doua randuri pe care ochiul nu le poate deosebi.
 * 3. Altfel: linia noua ii ia LOCUL celei vechi in ordine. Pusa la coada, ea ar fi sarit sub ochii
 *    omului tocmai in clipa in care se uita la ea.
 *
 * ⚠ Iar daca linia veche nu mai exista (stearsa intre timp din alta fila), se ADAUGA. E singura
 * purtare care nu pierde ce tocmai a completat omul.
 */
export function inlocuiesteLinia(
  prev: CartItem[],
  cheieVeche: string,
  item: Omit<CartItem, "quantity">,
  cantitate = 1,
): CartItem[] {
  const n = normalizeazaCantitate(cantitate);
  const cheieNoua = lineKey(item);
  const pozitie = prev.findIndex((i) => lineKey(i) === cheieVeche);
  if (pozitie < 0) return [...prev, { ...item, quantity: n }];
  /*
   * ⚠ O LINIE NU POATE FI GEAMANA CU EA INSASI. Prima varianta avea aici o ramura separata pentru
   * „cheia noua e chiar cea veche", cu exact acelasi corp ca ramura de la sfarsit — deci un mutant
   * care o stergea nu strica nimic, si proba care o apara trecea degeaba. Ce trebuia spus era
   * numai atat: cand nimic nu s-a schimbat, nu se cauta nicio geamana.
   */
  const geamana = cheieNoua === cheieVeche
    ? -1
    : prev.findIndex((i, idx) => idx !== pozitie && lineKey(i) === cheieNoua);
  if (geamana >= 0) {
    return prev
      .filter((_, idx) => idx !== pozitie)
      .map((i) => (lineKey(i) === cheieNoua
        ? { ...i, quantity: normalizeazaCantitate(i.quantity + n) }
        : i));
  }
  return prev.map((i, idx) => (idx === pozitie ? { ...item, quantity: n } : i));
}
