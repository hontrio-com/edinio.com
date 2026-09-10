/**
 * Editorul descrierii pentru Google din Produse > Categorii: regulile lui, fara React.
 *
 * Stau aici, nu in componenta, fiindca un `.tsx` nu se poate rula in probe. Tot ce decide ce vede
 * comerciantul (eticheta de pe rand, avertismentele, previzualizarea, butoanele active) se
 * probeaza deci chiar pe functiile pe care le cheama panoul.
 *
 * ⚠ SE IMPORTA DIN CLIENT. Numai `@/lib/seo` (pur) si un TIP din `descriere-automata`; acela
 * citeste baza cu cheia de serviciu, deci un import de valoare ar fi tras modulul de server in
 * pachetul din browser.
 */
import {
  curataTextSeo,
  SEO_DESCRIERE_CATEGORIE_MAX,
  SEO_DESCRIPTION_IDEAL_MIN,
  SEO_DESCRIPTION_MAX,
} from "@/lib/seo";
import type { DescriereAutomataCategorie } from "@/lib/storefront/catalog/descriere-automata";

/**
 * Pragurile contorului: aceleasi ca la descrierea paginii principale (Setari > SEO). Google taie
 * pe la 155-160 de caractere, deci verde intre 140 si 160 si rosu peste. Campul primeste insa
 * pana la `SEO_DESCRIERE_CATEGORIE_MAX`: textul lung se publica intreg, doar ca se vede taiat.
 */
export const CONTOR = { idealMin: SEO_DESCRIPTION_IDEAL_MIN, max: SEO_DESCRIPTION_MAX } as const;

/** Ce spune eticheta „Google" de pe randul categoriei. */
export type StareDescriere = "proprie" | "automata" | "necunoscuta";

/**
 * Starea etichetei. „necunoscuta" cand citirea descrierilor a cazut: gri ar fi insemnat „text
 * automat", o afirmatie pe care n-o putem face.
 *
 * Textul trece prin `curataTextSeo`: unul numai din spatii sau din etichete goale e, pentru
 * vitrina, lipsa textului, deci si aici e textul automat.
 */
export function stareDescriere(salvata: string | null | undefined, citite: boolean): StareDescriere {
  if (!citite) return "necunoscuta";
  return curataTextSeo(salvata) ? "proprie" : "automata";
}

/**
 * Numele accesibil si indiciul etichetei. Incepe cu „Descrierea pentru Google", ca sa contina
 * textul vizibil („Google"): altfel comanda vocala „apasa Google" n-ar mai gasi butonul.
 */
export function titluEticheta(stare: StareDescriere): string {
  if (stare === "proprie") return "Descrierea pentru Google: text scris de tine";
  if (stare === "automata") return "Descrierea pentru Google: text automat";
  return "Descrierea pentru Google: nu s-a putut citi";
}

export type TipAvertisment = "necitita" | "fara-text-automat" | "ascunsa" | "umbrita" | "fara-domeniu";

export interface Avertisment {
  tip: TipAvertisment;
  text: string;
}

/**
 * Avertismentele din editor, in ordinea in care conteaza.
 *
 * Toate vin din ce stie serverul (`descriereAutomataCategorie`), nu dintr-o a doua socoteala in
 * browser: ce categorie ia adresa, ce e ascuns si daca magazinul are domeniu se hotarasc acolo,
 * pe aceeasi lista ca in vitrina.
 *
 *   - `necitita`: descrierea salvata n-a putut fi citita. Campul poate parea gol peste un text
 *     scris, iar o salvare l-ar inlocui. Vine prima: e singura care previne o pierdere.
 *   - `ascunsa` / `umbrita`: ce se scrie aici nu ajunge nicaieri. Se exclud: o categorie ascunsa
 *     n-are pagina, deci nici alta categorie nu i-o poate lua.
 *   - `fara-domeniu`: pe www.edinio.com vitrinele sunt `noindex`; se aplica pe domeniul propriu.
 *   - `fara-text-automat`: actiunea a raspuns `null` (magazinul n-a putut fi citit).
 *
 * `incarcat` = raspunsul actiunii a venit. Pana atunci nu se spune nimic despre pagina: lipsa
 * raspunsului nu e un raspuns.
 */
export function avertismenteEditor(a: {
  automat: DescriereAutomataCategorie | null;
  incarcat: boolean;
  citite: boolean;
}): Avertisment[] {
  const out: Avertisment[] = [];
  if (!a.citite) {
    out.push({
      tip: "necitita",
      text: "Descrierea salvată nu s-a putut citi acum, deci câmpul poate fi gol și când ai scris una. Dacă salvezi, textul de aici o înlocuiește. Reîncarcă pagina ca să o vezi.",
    });
  }
  if (!a.incarcat) return out;
  if (!a.automat) {
    out.push({
      tip: "fara-text-automat",
      text: "Textul automat nu s-a putut calcula acum. Poți scrie și salva descrierea și fără el.",
    });
    return out;
  }
  if (a.automat.ascunsa) {
    out.push({
      tip: "ascunsa",
      text: "Categoria e ascunsă din magazin, ea sau o categorie de deasupra ei, deci pagina ei nu se deschide și descrierea nu apare în Google. Textul rămâne salvat și se folosește din nou când categoria se vede.",
    });
  } else if (a.automat.umbritaDe) {
    out.push({
      tip: "umbrita",
      text: `Categoria „${a.automat.umbritaDe.nume}”, mai sus în listă, are aceeași adresă în magazin. Pagina e a ei, deci Google primește descrierea ei, nu pe cea de aici.`,
    });
  }
  if (!a.automat.areDomeniu) {
    out.push({
      tip: "fara-domeniu",
      text: "Magazinul e pe adresa edinio.com, unde vitrinele nu apar în Google. Descrierea se păstrează și se aplică pe domeniul tău propriu, pe care îl conectezi din Setări, secțiunea Domeniu.",
    });
  }
  return out;
}

/** Ce arata „Previzualizare in Google". */
export interface Previzualizare {
  titlu: string;
  descriere: string;
  adresa: string;
}

/**
 * Rezultatul din Google, cum va arata dupa salvare.
 *
 * Descrierea e textul din camp adus la forma in care il publica vitrina (`curataTextSeo`, taiat
 * la `SEO_DESCRIERE_CATEGORIE_MAX`, ca in `citesteSeoCategorie`); campul gol, sau numai din
 * spatii, lasa textul automat. Titlul si adresa vin de la server, din aceleasi functii ca pagina.
 *
 * `null` cand categoria n-are pagina ei (ascunsa sau umbrita) ori textul automat n-a venit: o
 * previzualizare a unei pagini care nu exista ar promite un rezultat pe care nu-l vede nimeni.
 */
export function previzualizare(camp: string, automat: DescriereAutomataCategorie | null): Previzualizare | null {
  if (!automat || automat.text === null || automat.titlu === null) return null;
  return {
    titlu: automat.titlu,
    descriere: curataTextSeo(camp, SEO_DESCRIERE_CATEGORIE_MAX) ?? automat.text,
    adresa: automat.adresa,
  };
}

/** Lungimea textului care se PUBLICA din camp, pentru contor: fara etichete si spatii in plus. */
export function lungimePublicata(camp: string): number {
  return curataTextSeo(camp)?.length ?? 0;
}

/** Care butoane ale editorului se pot apasa acum. */
export interface ButoaneEditor {
  /** „Salveaza": textul din camp. */
  salveaza: boolean;
  /** „Foloseste textul automat": sterge textul propriu si salveaza pe loc. */
  foloseste: boolean;
  /** „Porneste de la textul automat": il copiaza in camp. */
  porneste: boolean;
}

/**
 * Butoanele active.
 *
 *   - Salveaza: numai cand textul publicat s-ar schimba. Cu citirea cazuta nu se stie ce e salvat,
 *     deci merge orice text scris; campul GOL insa nu se salveaza de aici, fiindca ar sterge pe
 *     nevazute un text posibil scris. Stergerea are butonul ei, cu un nume care spune ce face.
 *   - Foloseste textul automat: cand exista ceva de sters (salvat sau scris in camp), sau cand nu
 *     se stie ce e salvat.
 *   - Porneste de la textul automat: numai cand exista unul (o categorie fara pagina n-are) si
 *     campul nu il contine deja.
 *
 * `ocupat` = o salvare e in curs: nimic nu porneste a doua.
 */
export function butoaneEditor(a: {
  camp: string;
  salvata: string | null;
  citite: boolean;
  automat: DescriereAutomataCategorie | null;
  ocupat: boolean;
}): ButoaneEditor {
  const noua = curataTextSeo(a.camp);
  const veche = curataTextSeo(a.salvata);
  const text = a.automat?.text ?? null;
  return {
    salveaza: !a.ocupat && (a.citite ? noua !== veche : noua !== null),
    foloseste: !a.ocupat && (!a.citite || veche !== null || noua !== null),
    porneste: !a.ocupat && text !== null && noua !== text,
  };
}
