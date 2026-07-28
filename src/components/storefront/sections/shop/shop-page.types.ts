/**
 * Contractul comun al modelelor de pagina de catalog.
 *
 * Toate primesc exact aceleasi date, ca schimbarea designului sa fie o singura
 * linie in dispecer, nu o rescriere a rutei. Acelasi tipar ca la paginile de cos
 * (`sections/cart/cart-page.types.ts`).
 *
 * Datele de catalog NU trec pe aici: vin din `StorefrontProvider`, exact ca la
 * grila si la bara de filtre ale paginii principale. Aici raman doar reglajele
 * variantei, deja curatate de parser.
 */
export interface ShopPageProps {
  /** Titlul paginii. Categoria aleasa il inlocuieste, cand exista una. */
  titlu: string;
  /** Cate coloane are grila pe ecran mare. */
  coloane: number;
  /** Cate coloane are pe telefon. Una singura da carduri mari, cu imagine lata. */
  coloaneMobil: number;
  /**
   * Grupurile de filtre pornite, in ordinea aleasa de comerciant.
   *
   * Vin din campul de tip `actions` al variantei, deci ordinea si vizibilitatea
   * inseamna acelasi lucru la toate cele trei modele.
   */
  grupuriPornite: string[];
  /** Titlul se vede, sau ramane doar pentru cititoarele de ecran. */
  arataTitlu: boolean;
}
