/**
 * Formele si constantele integrarii Pepita.
 *
 * ═══ CE POATE SI CE NU POATE INTEGRAREA ASTA ═══
 *
 * Documentatia publica Pepita (verificata 08.09.2026) descrie DOUA cai, si numai
 * doua:
 *
 *   Edinio -> Pepita : feed XML de produse si feed XML de stoc, pe care le CITESTE ei.
 *   Pepita -> Edinio : comanda, impinsa prin HTTP pe adresa noastra.
 *
 * ⚠ NU EXISTA drum inapoi pentru comenzi. Nici confirmare, nici anulare, nici
 * status, nici AWB, nici retur, nici decontari, nici stare de aprobare a
 * produsului, nici API de categorii. Documentul lor de „Automatic order
 * forwarding" spune raspicat directia: „Pepita -> Partner store (push)", iar
 * Seller Center cere confirmarea comenzii IN PANOUL LOR, in cel mult o zi.
 *
 * De aceea in Edinio nu exista si nu trebuie sa apara niciun buton care sa
 * sugereze ca trimite ceva spre Pepita. Ce stim noi despre o comanda Pepita este
 * numai ce ne-au trimis ei la ingest.
 */

/** Cheia sub care se recunoaste marketplace-ul peste tot in cod si in date. */
export const PEPITA = "pepita" as const;

/**
 * Piata pe care merge integrarea.
 *
 * Pepita are magazine in HU, RO, SK, DE, PL, BG, HR. Edinio porneste pe Romania,
 * dar moneda si piata stau AICI, intr-un singur loc, nu imprastiate prin cod: o
 * a doua piata cere un rand in tabelul de mai jos, nu o rescriere.
 */
export type PiataPepita = "ro";

export interface DescrierePiata {
  eticheta: string;
  moneda: string;
  /**
   * Adresa magazinului lor pentru piata asta, asa cum o scrie un om.
   *
   * ⚠ NU E UN NUME DE GAZDA, si campul chiar s-a numit `gazda` pana pe 09.09.2026, cu
   * valoarea `pepita.ro`. Acel domeniu **nu exista**: nu raspunde deloc, verificat. Piata
   * romaneasca sta pe o CALE, `pepita.com/ro`, nu pe un domeniu de tara.
   *
   * ⚠ Greseala a plecat spre un comerciant inainte sa fie prinsa: valoarea intra in mesajul
   * de activare pe care el il trimite la Pepita, deci textul ii spunea sa vorbeasca despre un
   * site inexistent. A prins-o proprietarul, nu vreo proba, fiindca nimic din repo nu putea
   * sti daca un domeniu raspunde. De aceea numele campului spune acum ce e: o adresa.
   */
  adresa: string;
}

export const PIETE: Record<PiataPepita, DescrierePiata> = {
  ro: { eticheta: "România", moneda: "RON", adresa: "pepita.com/ro" },
};

export const PIATA_IMPLICITA: PiataPepita = "ro";

/**
 * Numele citirilor din panou, ca sa se poata spune CE anume n-a raspuns.
 *
 * ⚠ Stau aici, si nu langa actiune, fiindca fisierul acela are „use server": fiecare export
 * al lui devine un capat HTTP, si o constanta n-are ce cauta acolo. Iar panoul are nevoie de
 * exact acelasi sir, altfel ar cauta dupa un nume care nu se mai scrie nicaieri.
 */
export const CITIRI_PANOU = {
  feed: "ultima citire a feedului",
  comenzi: "numărul de comenzi",
  carantina: "comenzile cu probleme",
  ultimaComanda: "ultima comandă",
  /* Cate produse pleaca in feed. Vezi `StarePepita.produseAlese`: fara cifra asta, panoul
     arata bifa verde peste un catalog gol, si chiar asa a trecut neobservat trei magazine. */
  produse: "numărul de produse din feed",
} as const;

/** Strategia de pret pentru feed. Aceeasi socoteala, un singur loc. */
export type FelStrategiePret = "identic" | "procent" | "fix";

export interface StrategiePret {
  fel: FelStrategiePret;
  /** Procent (10 = +10%) sau suma fixa in moneda pietei. Ignorat pe „identic". */
  valoare: number;
}

/** Tipurile de garantie pe care le accepta `<Warranty><Type>`. */
export const TIPURI_GARANTIE = ["None", "Day", "Week", "Month", "Year"] as const;
export type TipGarantie = (typeof TIPURI_GARANTIE)[number];

export interface PepitaConfig {
  /** Comerciantul a pornit integrarea. Oprita, feedurile nu mai raspund cu date. */
  activ: boolean;
  piata: PiataPepita;
  strategie_pret: StrategiePret;
  /**
   * Cate bucati se tin deoparte si NU se anunta la Pepita.
   *
   * ⚠ Nu atinge stocul real din Edinio. Scade numai cifra EXPORTATA.
   */
  safety_stock: number;
  /** Zile lucratoare de pregatire, trimise ca `<ShippingDelay>`. `null` = nu se trimite. */
  shipping_delay: number | null;
  /**
   * Cost de transport PE BUCATA, trimis ca `<ShippingPrice>`.
   *
   * ⚠ Documentatia lor spune „Termék darabonként értendő", adica per bucata, si
   * marketplace-ul il inmulteste singur cu cantitatea. Noi nu inmultim nimic.
   * `null` = nu se trimite deloc, si atunci Pepita foloseste costul implicit
   * convenit la activare.
   */
  shipping_price: number | null;
  garantie: { tip: TipGarantie; durata: number } | null;
  /** „toate" = tot ce e activ in magazin; „selectate" = doar ce a bifat comerciantul. */
  mod_includere: "toate" | "selectate";
  /** Momentul in care comerciantul a marcat ca a trimis datele catre Pepita. */
  trimis_la: string | null;
  /**
   * Comerciantul emite factura catre clientul final pentru comenzile Pepita.
   *
   * ⚠ STINS DIN START, si nu din prudenta generala: documentatia lor publica nu spune
   * cine factureaza, iar o factura fiscala emisa degeaba nu se retrage, se storneaza.
   * Hotararea e a comerciantului, fiindca a lui e raspunderea fiscala.
   */
  factureaza_clientul: boolean;
  /**
   * Cheile, in clar. Se cripteaza in repaus (`privat.campuri_secrete`) si nu
   * pleaca NICIODATA spre browser decat prin actiunea de dezvaluire.
   *
   * ⚠ Adevarul despre ce cheie e valida sta in `pepita_chei`, nu aici: acolo se
   * cauta la fiecare cerere, dupa amprenta. Campurile astea exista doar ca
   * omul sa-si poata reciti si copia adresele.
   */
  feed_token?: string;
  order_key?: string;
}

export const CONFIG_IMPLICIT: PepitaConfig = {
  activ: false,
  piata: PIATA_IMPLICITA,
  strategie_pret: { fel: "identic", valoare: 0 },
  safety_stock: 0,
  shipping_delay: null,
  shipping_price: null,
  garantie: null,
  mod_includere: "selectate",
  trimis_la: null,
  factureaza_clientul: false,
};

/* ═══════════════════════════════════════════════════════════════════════════
   COMANDA PRIMITA DE LA EI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Modurile de plata din documentatia lor.
 *
 * ⚠ VALOAREA BRUTA SE PASTREAZA MEREU. Un mod necunoscut NU se traduce tacut in
 * „ramburs": ar insemna ca marfa pleaca la un client care platise deja cu cardul,
 * iar curierul mai cere o data banii.
 */
export const PLATI_PEPITA = { cod: "cod", transfer: "transfer", creditcard: "creditcard" } as const;

/** Starile de plata din documentatia lor. */
export const STARI_PLATA_PEPITA = { paid: "paid", unpaid: "unpaid" } as const;

/**
 * Modurile de livrare din documentatia lor.
 *
 * ⚠ Lista e a pietei UNGARE (GLS, GLS ParcelShop, MPL). Pentru Romania nu exista
 * inca o lista publicata, deci orice valoare noua trebuie sa treaca prin
 * „necunoscut" si sa fie VAZUTA de comerciant, nu ghicita.
 */
/**
 * Modurile de livrare pe care le cunoastem.
 *
 * ⚠ LISTA OFICIALA DE AZI ARE CINCI VALORI: `shipping`, `gls`, `gls_parcellocker`, `gls_xxl`,
 * `mpl`. Verificat pe 08.09.2026 in chiar fisierul lor
 * (`docs/pepita/order-forwarding-2026-09-08-OFICIAL.pdf`, autor „Pepita").
 *
 * ⚠ `gls_parcelshop` A FOST INLOCUIT, nu completat: numele vechi nu mai apare nicaieri la ei, iar
 * `gls_parcellocker` ii ia locul, cu aceeasi descriere. Il pastram fiindca poate veni pe o comanda
 * mai veche, si fiindca nu costa nimic sa-l recunoastem.
 *
 * ⚠ SI TEXTUL DE AICI SPUNEA ALTCEVA, GRESIT: ca documentul de impingere scrie „exact patru
 * valori" si ca „cele doua documente NU sunt de acord intre ele". Nu se contraziceau; copia pe care
 * o aveam era o REIMPRIMARE a unei versiuni vechi, nu fisierul lor. Vezi `docs/pepita/README.md`.
 *
 * ⚠ Lista ramane DESCHISA la capatul GLS oricum: `esteLivrarePepita` nu se uita la ea, ci la
 * PREFIX. Hotararea aia, luata cand credeam ca documentele se bat cap in cap, e singurul lucru care
 * ne-a scutit de un defect adevarat — si ramane buna si acum, pentru urmatoarea valoare pe care o
 * adauga ei.
 */
export const LIVRARI_PEPITA = {
  shipping: "shipping",
  gls: "gls",
  gls_parcelshop: "gls_parcelshop",
  gls_parcellocker: "gls_parcellocker",
  gls_xxl: "gls_xxl",
  mpl: "mpl",
} as const;
