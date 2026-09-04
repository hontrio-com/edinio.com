import { EMAIL, TELEFON } from "./contact";

/**
 * Datele firmei care operează Edinio, într-un singur loc.
 *
 * ═══ DE CE EXISTĂ FIȘIERUL ĂSTA (04.09.2026) ═══
 *
 * Aceleași date erau scrise de mână în trei locuri — `termeni.ts`,
 * `confidentialitate.ts` și `website-jsonld.ts` — și se despărțiseră deja:
 * schema declara „SC VOID SFT GAMES SRL" (cu un prefix „SC" care nu apare în
 * niciun act de pe site), cu adresa trunchiată la „Str. Progresului, Nr. 2" și
 * localitatea fără diacritice. Adică datele structurate contraziceau pagina pe
 * care Google o citește în același timp.
 *
 * ⚠ TEXTELE JURIDICE NU SE ATING. `termeni.ts` și `confidentialitate.ts` sunt
 * transcrieri mecanice ale documentelor clientului și rămân cuvânt cu cuvânt;
 * constantele de aici sunt sursa pentru CE SE EMITE ÎN COD (JSON-LD azi, orice
 * altceva mâine), iar `firma.test.ts` cade dacă ele se despart de ce scrie în
 * documente. Așa nu există „a doua sursă" care se învechește în tăcere.
 *
 * Datele sunt oricum publice: Art. 5 din Legea 365/2002 le cere pe pagina de
 * termeni. Aici doar se scriu o singură dată.
 */
export const DATE_FIRMA = {
  /** Denumirea, exact ca în „1. Identificarea prestatorului" de pe /termeni. */
  denumire: "VOID SFT GAMES SRL",
  cui: "43474393",
  registruComert: "J18/1054/2020",
  /** Strada cu tot cu bloc, scară, etaj și apartament — cum e în documente. */
  strada: "Strada Progresului, Nr. 2, Bloc A29, Sc. 2, Et. 2, Ap. 10",
  localitate: "Mătăsari",
  judet: "Gorj",
  tara: "România",
} as const;

/**
 * Contactul public, derivat din chiar căile de contact desenate pe site.
 *
 * ⚠ NU se rescriu numerele aici: `TELEFON.href` și `EMAIL.href` sunt sursa
 * (`contact.ts`), din același motiv pentru care WhatsApp-ul se compune tot de
 * acolo — a treia formă a aceluiași număr e exact locul în care apare a treia
 * greșeală.
 */
export const CONTACT_FIRMA = {
  /** Forma E.164, cum o cere schema.org: `+40750456809`. */
  telefon: TELEFON.href.replace(/^tel:/, ""),
  email: EMAIL.href.replace(/^mailto:/, ""),
} as const;
