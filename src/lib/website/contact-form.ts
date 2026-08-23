import type { MesajDeContact } from "@/lib/email";

/**
 * Verificarea formularului de contact.
 *
 * ═══ DE CE STA SEPARAT DE ACTIUNE ═══
 *
 * Fisierul actiunii are `"use server"`, care expune FIECARE export din el ca
 * punct de intrare apelabil din afara. O functie de validare exportata de acolo
 * ar deveni un endpoint public fara rost. Aici e cod obisnuit, deci se poate si
 * proba pe Node — vezi `contact-form.test.ts`.
 *
 * ═══ VERIFICAREA DE PE SERVER E SINGURA CARE CONTEAZA ═══
 *
 * `required` si `type="email"` din formular sunt comoditate pentru om, nu
 * aparare: o actiune de server poate fi chemata cu orice corp, de oriunde.
 * Vezi [[actiuni-server-manifest-global]].
 */

export interface MesajDeContactBrut {
  nume?: string;
  email?: string;
  telefon?: string;
  mesaj?: string;
  /**
   * Bifa „sunt de acord cu Politica de confidențialitate".
   *
   * ⚠ Se verifică si PE SERVER, nu doar prin `required` pe casetă. Consimțământul
   * e temeiul pe care prelucrăm datele din formular; dacă singura dovadă că
   * omul a bifat ar fi un atribut HTML, n-am avea nicio dovadă. Iar acțiunea
   * poate fi chemată cu orice corp.
   */
  acord?: boolean;
}

export type Verificare =
  | { ok: true; valoare: MesajDeContact }
  | { ok: false; error: string };

/**
 * Plafoane de lungime.
 *
 * Nu sunt de gust: fara ele, un singur mesaj poate carpi un email de cativa
 * megaocteti, pe care furnizorul il respinge — deci formularul ar cadea, si nu
 * din vina omului. Sunt largi cat sa nu incurce pe nimeni: 5000 de semne
 * inseamna vreo doua pagini scrise.
 */
export const MAX = { nume: 120, email: 200, telefon: 40, mesaj: 5000 } as const;

/** Minimul sub care un „mesaj" nu e un mesaj. */
const MIN_MESAJ = 10;

/*
  Verificarea adresei: o singura `@`, ceva inainte, un punct dupa, fara spatii.
  Dinadins ingaduitoare — adresele reale sunt mai ciudate decat crede oricine
  (semne plus, subdomenii, TLD-uri lungi), iar o expresie „stricta" respinge
  oameni adevarati. Ce nu se poate afla dintr-un tipar e daca adresa EXISTA;
  asta se afla abia cand pleaca emailul de confirmare.
*/
/*
  ⚠ EXPORTAT fiindcă îl folosește și formularul de migrare (`migrare-form.ts`).
  Sunt două formulare publice pe același site; cu câte un tipar de fiecare
  parte, diferența n-o observă nimeni până când o adresă e primită pe o pagină
  și respinsă pe cealaltă.
*/
export const TIPAR_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

/**
 * Cifrele unui numar de telefon, fara spatii, puncte, liniute sau paranteze.
 *
 * ⚠ Exportat pentru `migrare-form.ts`, din acelasi motiv ca `TIPAR_EMAIL`.
 */
export function cifreTelefon(telefon: string): string {
  return telefon.replace(/[\s.\-()]/g, "");
}

export function verificaMesajDeContact(input: MesajDeContactBrut): Verificare {
  const nume = (input.nume ?? "").trim();
  const email = (input.email ?? "").trim();
  const telefon = (input.telefon ?? "").trim();
  const mesaj = (input.mesaj ?? "").trim();

  if (!nume) return { ok: false, error: "Scrie-ne numele tau." };
  if (nume.length > MAX.nume) return { ok: false, error: "Numele e prea lung." };

  if (!email) return { ok: false, error: "Avem nevoie de un email ca sa iti putem raspunde." };
  if (email.length > MAX.email || !TIPAR_EMAIL.test(email)) {
    return { ok: false, error: "Adresa de email nu pare corecta." };
  }

  if (!telefon) return { ok: false, error: "Scrie-ne si un numar de telefon." };
  if (telefon.length > MAX.telefon || !/^\+?\d{9,15}$/.test(cifreTelefon(telefon))) {
    return { ok: false, error: "Numarul de telefon nu pare corect." };
  }

  if (!mesaj) return { ok: false, error: "Scrie-ne si mesajul." };
  if (mesaj.length < MIN_MESAJ) return { ok: false, error: "Mai scrie cateva cuvinte, ca sa te putem ajuta." };
  if (mesaj.length > MAX.mesaj) return { ok: false, error: "Mesajul e prea lung. Scrie-ne pe scurt si continuam pe email." };

  /* Ultima verificare, dinadins: daca omul a gresit si numarul, si bifa, prima
     eroare pe care o vede e cea de langa un camp pe care il poate corecta. */
  if (input.acord !== true) {
    return { ok: false, error: "Bifeaza ca esti de acord cu Politica de confidentialitate." };
  }

  /*
    ⚠ Se intorc valorile CURATATE, nu cele primite. Apelantul foloseste ce iese
    de aici; daca ar folosi `input`, spatiile de la capete (si orice altceva n-a
    trecut prin functia asta) ar ajunge in email si in baza.
  */
  return { ok: true, valoare: { nume, email, telefon, mesaj } };
}
