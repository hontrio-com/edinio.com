/**
 * Verificarea formularului de cerere de migrare, de pe `/migrare`.
 *
 * ═══ DE CE STĂ SEPARAT DE ACȚIUNE ═══
 *
 * Fișierul acțiunii are `"use server"`, care expune FIECARE export din el ca
 * punct de intrare apelabil din afară. O funcție de validare exportată de acolo
 * ar deveni un endpoint public fără rost. Aici e cod obișnuit, deci se poate și
 * proba pe Node — vezi `migrare-form.test.ts`.
 *
 * ⚠ Aceeași croială ca `contact-form.ts`, dinadins. Sunt două formulare publice
 * pe același site; dacă unul verifică telefonul altfel decât celălalt, diferența
 * n-o observă nimeni până când un om e respins pe o pagină și primit pe cealaltă.
 * Ce e comun se citește de acolo, nu se rescrie aici.
 */

import { MAX as MAX_CONTACT, TIPAR_EMAIL, cifreTelefon } from "./contact-form";

/**
 * Platformele din listă, în ordinea cerută de client (19.08).
 *
 * ⚠ „Alta" e ULTIMA și e obligatorie: fără ea, cine vine de pe o platformă
 * nelistată — sau de pe un magazin făcut la comandă — n-are ce alege și pleacă.
 * Descrierea secțiunii promite chiar asta, „sau o soluție custom".
 *
 * ⚠ LISTA NU E ACEEAȘI cu siglele din ilustrație. Acolo sunt șase, cele pentru
 * care avem desen; aici sunt opt, adică toate cele de pe care se migrează în
 * practică. Wix apare în ilustrație și în descriere, dar NU în listă — așa a fost
 * dată. De verificat cu clientul: un om venit de pe Wix citește numele în
 * descriere și nu-l găsește în listă.
 */
export const PLATFORME_FORMULAR = [
  "Shopify",
  "WooCommerce",
  "Gomag",
  "MerchantPro",
  "OpenCart",
  "Cartum",
  "Magento",
  "Alta",
] as const;

export type PlatformaFormular = (typeof PLATFORME_FORMULAR)[number];

/**
 * Mărimea catalogului, pe intervale.
 *
 * Intervale, nu un câmp de scris un număr: nimeni nu-și știe numărul exact de
 * produse, iar un câmp gol pentru că omul s-a dus să-l numere e un câmp pierdut.
 * Pentru noi contează oricum doar ordinul de mărime — de el atârnă cât ține
 * migrarea.
 */
export const MARIMI_CATALOG = [
  "1-100",
  "101-500",
  "501-1000",
  "1001-5000",
  "peste 5000",
] as const;

export type MarimeCatalog = (typeof MARIMI_CATALOG)[number];

/**
 * Plafoane de lungime.
 *
 * Numele, emailul și telefonul le ia de la formularul de contact: sunt aceleași
 * câmpuri, iar două plafoane diferite pentru același lucru se despart la prima
 * corectură. `mentiuni` e propriu — e mai scurt decât un mesaj de contact,
 * fiindcă aici e o completare la o cerere, nu cererea însăși.
 */
export const MAX = {
  nume: MAX_CONTACT.nume,
  email: MAX_CONTACT.email,
  telefon: MAX_CONTACT.telefon,
  mentiuni: 2000,
} as const;

export interface CerereMigrare {
  nume: string;
  email: string;
  telefon: string;
  platforma: PlatformaFormular;
  produse: MarimeCatalog;
  /** Poate lipsi: e singurul câmp neobligatoriu din formular. */
  mentiuni: string;
}

export interface CerereMigrareBruta {
  nume?: string;
  email?: string;
  telefon?: string;
  platforma?: string;
  produse?: string;
  mentiuni?: string;
  /**
   * Bifa „Am citit și sunt de acord cu Politica de confidențialitate".
   *
   * ⚠ Se verifică și PE SERVER, nu doar prin `required` pe casetă. Consimțământul
   * e temeiul pe care prelucrăm datele din formular; dacă singura dovadă că omul
   * a bifat ar fi un atribut HTML, n-am avea nicio dovadă. Iar acțiunea poate fi
   * chemată cu orice corp.
   */
  acord?: boolean;
}

export type Verificare =
  | { ok: true; valoare: CerereMigrare }
  | { ok: false; error: string };

export function verificaCerereMigrare(input: CerereMigrareBruta): Verificare {
  const nume = (input.nume ?? "").trim();
  const email = (input.email ?? "").trim();
  const telefon = (input.telefon ?? "").trim();
  const platforma = (input.platforma ?? "").trim();
  const produse = (input.produse ?? "").trim();
  const mentiuni = (input.mentiuni ?? "").trim();

  if (!nume) return { ok: false, error: "Scrie-ne numele tau." };
  if (nume.length > MAX.nume) return { ok: false, error: "Numele e prea lung." };

  if (!telefon) return { ok: false, error: "Scrie-ne si un numar de telefon." };
  if (telefon.length > MAX.telefon || !/^\+?\d{9,15}$/.test(cifreTelefon(telefon))) {
    return { ok: false, error: "Numarul de telefon nu pare corect." };
  }

  if (!email) return { ok: false, error: "Avem nevoie de un email ca sa iti putem raspunde." };
  if (email.length > MAX.email || !TIPAR_EMAIL.test(email)) {
    return { ok: false, error: "Adresa de email nu pare corecta." };
  }

  /*
    ⚠ Alegerile din liste se verifică PRIN APARTENENȚĂ, nu prin „e gol?".

    Un `<select>` are voie să trimită orice, iar acțiunea poate fi chemată și fără
    formular. Valoarea ajunge într-un email pe care îl citim ca pe un fapt — dacă
    ar trece neverificată, „platforma actuală" ar fi un text scris de cel care
    trimite cererea, nu un răspuns dintr-o listă pe care am făcut-o noi.

    Formularul vechi de campanie punea „Alta" peste orice nu recunoștea. Aici se
    respinge: acolo lista era de trei, iar greșeala era probabil o platformă
    nouă; aici lista are opt și e chiar cea din pagină, deci o valoare din afara
    ei nu vine de la un om care completează formularul.
  */
  if (!esteDinLista(PLATFORME_FORMULAR, platforma)) {
    return { ok: false, error: "Alege platforma pe care e magazinul acum." };
  }
  if (!esteDinLista(MARIMI_CATALOG, produse)) {
    return { ok: false, error: "Alege aproximativ cate produse ai." };
  }

  if (mentiuni.length > MAX.mentiuni) {
    return { ok: false, error: "Mentiunile sunt prea lungi. Scrie-ne pe scurt si continuam pe email." };
  }

  /* Ultima verificare, dinadins: dacă omul a greșit și numărul, și bifa, prima
     eroare pe care o vede e cea de lângă un câmp pe care îl poate corecta. */
  if (input.acord !== true) {
    return { ok: false, error: "Bifeaza ca esti de acord cu Politica de confidentialitate." };
  }

  /*
    ⚠ Se întorc valorile CURĂȚATE, nu cele primite. Apelantul folosește ce iese de
    aici; dacă ar folosi `input`, spațiile de la capete (și orice altceva n-a
    trecut prin funcția asta) ar ajunge în email.
  */
  return { ok: true, valoare: { nume, email, telefon, platforma, produse, mentiuni } };
}

/** Apartenența la o listă închisă, cu îngustarea tipului pentru apelant. */
function esteDinLista<T extends string>(lista: readonly T[], valoare: string): valoare is T {
  return (lista as readonly string[]).includes(valoare);
}
