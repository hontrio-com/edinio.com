/**
 * Ce primeste vitrina, si ce NU primeste.
 *
 * ═══ ⚠ DEFINITIA BRUTA NU PLEACA NICIODATA LA CUMPARATOR ═══
 *
 * Pagina de produs e „use client", iar React serializeaza props-urile de client in HTML. Deci
 * tot ce ii dam ajunge, litera cu litera, in sursa paginii — vizibil oricui. Randul intreg
 * `products` face deja asta, si e chiar motivul pentru care configuratorul NU sta in
 * `page_sections`.
 *
 * Aici se compune, la PUBLICARE, exact ce are nevoie vitrina ca sa deseneze si sa socoteasca —
 * si nimic mai mult. Ce ramane pe server:
 *
 *   - ciornele si versiunile vechi;
 *   - costul intern al componentelor (`componenta.bucati` ramane, `cost_bucata` nu);
 *   - notele si metadatele de panou;
 *   - regulile stinse, care n-ar face nimic dar ar arata comerciantului cum gandeste.
 *
 * ═══ ⚠ SE COMPILEAZA O SINGURA DATA, LA PUBLICARE ═══
 *
 * Nu la fiecare cerere. Versiunea publicata e imutabila, deci si ce iese de aici e imutabil —
 * si atunci n-are rost recalculat, si nici n-are voie sa iasa altfel maine decat azi. Rezultatul
 * se scrie in `configurator_versiuni.compilat` si de acolo se serveste.
 *
 * ⚠ SI TOT DE-AIA PIESELE SE REZOLVA CHIAR AICI.
 *
 * Pretul unei piese si produsul din care iese ea de pe raft stau in `configurator_componente`, un
 * tabel fara nicio politica publica — browserul nu-l poate citi, si nu are voie: langa
 * `pret_bucata`, in acelasi rand, sta cat ne costa pe noi piesa. Intrebat serverul la fiecare
 * tasta, pagina ar fi facut un dus-intors pe caracter; lasat pe seama browserului, pretul aratat
 * si cel incasat ar fi fost doua numere diferite. Se rezolva o data, aici, si versiunea publicata
 * poarta de atunci incolo raspunsul — acelasi pe amandoua partile, fara ca vreun cost sa plece.
 */

import { areOptiuni, type Definitie, type Nod, type Optiune } from "./definitie";
import type { Regula } from "./reguli";
import type { Pretuire } from "./pret";
import { eNumarBun } from "./unitati";

/** Versiunea FORMEI compilate. Se schimba doar cand se schimba forma, nu continutul. */
export const VERSIUNE_COMPILAT = 1;

export interface Compilat {
  v: number;
  definitie: Definitie;
  reguli: Regula[];
  pretuire: Pretuire;
}

/**
 * Piesa, asa cum a citit-o serverul din `configurator_componente` chiar la publicare.
 *
 * ⚠ `cost_bucata` NU E AICI, si de-aia exista tipul asta in loc de randul intreg. Ce intra in
 * el ajunge, litera cu litera, in sursa paginii de produs; ce plateste comerciantul pe piesa la
 * furnizor ramane in baza. Un tip care ar fi purtat randul intreg ar fi facut scurgerea sa
 * depinda de faptul ca cineva si-a adus aminte sa nu copieze un camp.
 */
export interface ComponentaRezolvata {
  /** Produsul al carui stoc E stocul piesei. `null` = piesa nu se tine pe stoc. */
  produsId: string | null;
  /** Cat plateste CUMPARATORUL pe bucata. */
  pretBucata: number;
  nume: string;
}

/**
 * Optiunea, curatata de ce tine numai de panou.
 *
 * ⚠ `componenta` se pastreaza fara costul ei: `bucati` intra in pretul pe care il socoteste si
 * browserul, deci trebuie sa fie acolo. Costul intern (`cost_bucata`) e date de afacere ale
 * comerciantului, si n-are ce cauta in sursa unei pagini.
 *
 * ⚠ `produsId` SE PASTREAZA AICI, dar NU pleaca la browser. Versiunea publicata il poarta
 * fiindca din el se scade stocul la plasarea comenzii; sursa paginii nu, fiindca acolo n-are
 * nicio folosinta si e chiar `products.id` al unui rand tinut STINS dinadins. Taierea o face
 * `pentruSursaPaginii`, la granita vitrinei.
 *
 * ⚠ SI CE SE ADAUGA VINE DOAR DIN HARTA, NICIODATA DIN CIORNA.
 *
 * `produsId`, `pretBucata` si `nume` se scriu din randul citit ACUM din baza, nu din ce sta pe
 * optiune. Copiate din ciorna cand harta n-are piesa, oricine poate salva o ciorna ar fi putut
 * scrie el pretul dupa care se incaseaza si produsul din care se scade stocul — iar publicarea
 * i le-ar fi inghetat intr-o versiune imutabila.
 */
function optiunePentruVitrina(
  o: Optiune,
  componente?: ReadonlyMap<string, ComponentaRezolvata>,
): Optiune {
  const out: Optiune = { id: o.id, eticheta: o.eticheta };
  if (o.descriere) out.descriere = o.descriere;
  if (o.culoare) out.culoare = o.culoare;
  if (o.imagine) out.imagine = o.imagine;
  if (o.pret !== undefined) out.pret = o.pret;
  if (o.grame !== undefined) out.grame = o.grame;
  if (o.componenta) {
    const rez = componente?.get(o.componenta.id);
    out.componenta = {
      id: o.componenta.id,
      bucati: o.componenta.bucati,
      ...(rez?.produsId ? { produsId: rez.produsId } : {}),
      ...(rez && eNumarBun(rez.pretBucata) && rez.pretBucata >= 0
        ? { pretBucata: rez.pretBucata } : {}),
      ...(rez?.nume ? { nume: rez.nume } : {}),
    };
  }
  if (o.activa === false) out.activa = false;
  return out;
}

/**
 * Versiunea publicata, curatata de ce n-are ce cauta in sursa unei pagini publice.
 *
 * ⚠ CE PLECA, SI DE CE E O SCAPARE. Fiecare optiune care consuma o piesa purta `produsId`, adica
 * `products.id` al randului din care se scade stocul. Randul acela e tinut STINS dinadins — o
 * balama, un tub de silicon, o ora de manopera nu se vand la bucata — iar id-ul lui ajungea intreg
 * in sursa paginii de produs, la vedere, pentru orice vizitator.
 *
 * ⚠ SI NU SERVEA NIMIC. Nota de mai sus spunea ca vitrina are nevoie de piesa ca sa arate „mai
 * sunt 3 in stoc". Nu exista ecranul acela, si nici n-ar putea exista din browser: stocul piesei se
 * citeste din `products`, iar `configurator_componente` n-are nicio politica publica. Din tot ce
 * poarta piesa, browserul foloseste `bucati` (intra in pret) si `nume` (apare in descompunere).
 *
 * ⚠ NU E O COPIE ADANCA A TOT. Se rescriu doar nodurile care chiar au de pierdut ceva; restul
 * se impart mai departe. Ce se intoarce nu se modifica niciodata, iar originalul ramane intreg
 * pentru calea de server — care ARE nevoie de `produsId`, si care nu trece pe aici.
 */
export function pentruSursaPaginii(c: Compilat): Compilat {
  let ceva = false;
  const pasi = (c.definitie?.pasi ?? []).map((pas) => ({
    ...pas,
    grupuri: (pas.grupuri ?? []).map((grup) => ({
      ...grup,
      noduri: (grup.noduri ?? []).map((nod): Nod => {
        if (!areOptiuni(nod)) return nod;
        const optiuni = nod.optiuni ?? [];
        if (!optiuni.some((o) => o.componenta?.produsId)) return nod;
        ceva = true;
        return {
          ...nod,
          optiuni: optiuni.map((o): Optiune => {
            if (!o.componenta?.produsId) return o;
            const { produsId: _ascuns, ...restulPiesei } = o.componenta;
            return { ...o, componenta: restulPiesei };
          }),
        };
      }),
    })),
  }));
  // Aproape niciun configurator n-are piese; atunci nu se copiaza nimic.
  return ceva ? { ...c, definitie: { ...c.definitie, pasi } } : c;
}

function nodPentruVitrina(n: Nod, componente?: ReadonlyMap<string, ComponentaRezolvata>): Nod {
  if (n.fel !== "alegere" && n.fel !== "alegeri") return n;
  return { ...n, optiuni: (n.optiuni ?? []).map((o) => optiunePentruVitrina(o, componente)) };
}

/**
 * Definitia publicata, gata de servit.
 *
 * ⚠ Regulile STINSE nu pleaca. N-ar face nimic — motorul le sare oricum — dar i-ar arata
 * oricui deschide sursa paginii ce a incercat comerciantul si a renuntat. Iar la o mie de
 * cereri pe zi, sunt octeti platiti degeaba.
 */
export function compileaza(
  definitie: Definitie,
  reguli: Regula[],
  pretuire: Pretuire,
  componente?: ReadonlyMap<string, ComponentaRezolvata>,
): Compilat {
  return {
    v: VERSIUNE_COMPILAT,
    definitie: {
      ...definitie,
      pasi: (definitie.pasi ?? []).map((p) => ({
        ...p,
        grupuri: (p.grupuri ?? []).map((g) => ({
          ...g, noduri: (g.noduri ?? []).map((n) => nodPentruVitrina(n, componente)),
        })),
      })),
    },
    reguli: (reguli ?? []).filter((r) => r.activa !== false),
    pretuire,
  };
}

/**
 * Ce s-a compilat, citit inapoi din coloana.
 *
 * ⚠ Forma NECUNOSCUTA se refuza, nu se ghiceste. O versiune compilata de un cod mai nou decat
 * cel care o citeste nu se poate servi pe jumatate: mai bine produsul se arata fara configurator
 * si cineva vede ca ceva nu e in regula, decat sa se vanda dupa reguli intelese partial.
 */
export function citesteCompilat(brut: unknown): Compilat | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  if (o.v !== VERSIUNE_COMPILAT) return null;
  if (!o.definitie || typeof o.definitie !== "object") return null;
  return {
    v: VERSIUNE_COMPILAT,
    definitie: o.definitie as Definitie,
    reguli: Array.isArray(o.reguli) ? (o.reguli as Regula[]) : [],
    pretuire: (o.pretuire ?? {}) as Pretuire,
  };
}
