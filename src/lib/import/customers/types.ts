// Importul de clienti dintr-un fisier (CSV sau XLSX).
//
// Conducta e separata de importul de produse si de feedul de stocuri, la fel de
// intentionat: un import de clienti nu are voie sa atinga produse, stocuri sau
// comenzi. Mai jos nu exista niciun camp in care sa incapa asa ceva.

/** Coloanele pe care le poate mapa un fisier de clienti. */
export interface CustomerFeedMapping {
  /** Numele intreg, cand vine pe o singura coloana. */
  name?: string;
  /** Prenume + nume, cand vin separat (asa exporta OpenCart). */
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  county?: string;
  postcode?: string;
  /** Id-ul din platforma de provenienta, pastrat ca sa se poata urmari inapoi. */
  externalId?: string;
}

/** Un rand citit din fisier, curatat, inainte de calcularea cheii. */
export interface CustomerFeedRow {
  /** Numarul randului de DATE, de la 1. Omul care deschide fisierul numara la fel. */
  rowIndex: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  externalId: string | null;
}

/** Un client pregatit de scriere: are cheie. */
export interface CustomerRecord extends CustomerFeedRow {
  key: string;
}

export type CustomerRowProblem = "no_key" | "merged_duplicate";

export interface CustomerRowIssue {
  rowIndex: number;
  /** Ce sa scrie in raport: numele, altfel emailul sau telefonul. */
  label: string;
  problem: CustomerRowProblem;
  detail: string;
}

/** Un client care exista deja in tabel, cu ce ne trebuie ca sa vedem ce lipseste. */
export interface ExistingCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  externalId: string | null;
}

/** Campurile care se pot completa la o fisa existenta. */
export type CustomerPatch = Partial<{
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  postcode: string;
  externalId: string;
}>;

export interface CustomerUpdate {
  id: string;
  key: string;
  rowIndex: number;
  /**
   * DOAR campurile care erau goale si acum se completeaza.
   *
   * Un import nu suprascrie niciodata ceva ce exista deja: comerciantul poate sa fi
   * corectat de mana un telefon, si un export vechi n-are voie sa strice
   * corectura. Cine vrea sa inlocuiasca sterge fisa si o importa din nou.
   */
  patch: CustomerPatch;
}

/** Ce se va intampla, calculat inainte de orice scriere. */
export interface CustomerPlan {
  /** Nu exista in tabelul `customers`: se adauga. */
  toInsert: CustomerRecord[];
  /** Exista deja in `customers`: se completeaza doar golurile. */
  toUpdate: CustomerUpdate[];
  issues: CustomerRowIssue[];
  /** Cate randuri s-au citit din fisier. */
  totalRows: number;
  /**
   * Dintre cei de adaugat, cati au DEJA comenzi in magazin.
   *
   * Nu e o problema, ci invers: acolo importul se lipeste de fisa existenta si nu
   * apare niciun client dublat. Se numara ca sa poata fi spus pe ecran, altfel
   * omul vede „1224 clienti noi" si se intreaba unde s-au dus cei vechi.
   */
  willMergeWithOrders: number;
  /**
   * Randuri cu telefon care nu arata ca un singur numar („0722 sau 0733",
   * „123455"). Intra oricum, ca sa nu pierdem contactul, dar clientul nu se va
   * lega singur de comenzile lui viitoare, pentru ca cheia iese alta.
   */
  oddPhones: number;
  /** Randuri cu email fara „@”. Intra, dar nu se poate trimite nimic pe el. */
  oddEmails: number;
}

/**
 * Plafonul de randuri pentru un fisier de clienti.
 *
 * Separat de cel al produselor (5000): acolo plafonul are legatura cu limitele de
 * plan, aici nu are de ce. Limita care leaga in practica e tot cea de octeti
 * (8MB), atinsa oricum inaintea acestui numar.
 */
export const MAX_CUSTOMER_ROWS = 50000;
