/**
 * Textele paginii „Despre".
 *
 * ═══ DE CE E UN FIȘIER SEPARAT ═══
 *
 * Ca la toate celelalte pagini ale site-ului. Textul se citește și se corectează
 * fără să treci prin JSX, iar pagina rămâne despre așezare.
 *
 * ═══ ⚠ CE S-A CORECTAT LA MUTARE (23.08), ȘI DE CE NU E DOAR DESEN ═══
 *
 * Pagina veche spunea, într-unul din cele patru carduri:
 *
 *     „Plan gratuit generos. Fara comisioane pe vanzari pe planurile platite."
 *
 * ⚠ PLANUL GRATUIT NU EXISTĂ. În `pricing.ts` sunt patru planuri: Testare
 * (gratuită 15 zile, până la 10 produse), Basic, Premium și Ultra. Ce scria pe
 * „Despre" se contrazicea cu ce scrie pe `/preturi`, iar dintre cele două
 * pagina de prețuri e cea care spune adevărul.
 *
 * Nu e o scăpare de redactare: e o promisiune pe care produsul n-o ține, pusă pe
 * pagina în care se explică cine suntem. Am înlocuit-o cu perioada de testare,
 * așa cum e ea.
 *
 * ⚠ A DOUA CORECTURĂ: „Configureaza totul vizual, cu drag & drop." Editorul de
 * magazin e vizual, dar nicăieri în platformă sau în centrul de ajutor nu scrie
 * că se trag elemente cu mouse-ul. Am scos „drag & drop" și am lăsat ce se poate
 * susține.
 *
 * ⚠ A TREIA: „Fara comisioane pe vanzari". Formularea care se susține e cea din
 * centrul de ajutor: procesatorul de plăți (Stripe) percepe comisioanele lui,
 * iar Edinio nu adaugă altele peste. Așa e scrisă acum.
 *
 * ⚠ Restul textului e cel dinainte, cu diacritice puse la loc. Fișierul vechi
 * n-avea NICIUNA, în tot cuprinsul lui — singura pagină a site-ului fără.
 */

export const DESPRE_TITLU = "Despre Edinio";

export const DESPRE_LEAD =
  "Misiunea noastră este să facem comerțul online accesibil pentru orice afacere locală din România.";

export const POVESTE_TITLU = "Povestea noastră";

export const POVESTE: string[] = [
  "Edinio s-a născut dintr-o observație simplă: mii de afaceri locale din România nu au prezență online pentru că soluțiile existente sunt prea complicate sau prea scumpe. Am construit o platformă care elimină barierele tehnice și financiare, permițând oricui să-și lanseze magazinul online în câteva minute.",
  "Credem că fiecare afacere locală merită să fie vizibilă online. De la florării și cofetării, până la ateliere de bijuterii handmade și saloane de înfrumusețare, Edinio oferă instrumentele necesare pentru a vinde și a crește în mediul digital.",
];

export const DIFERENTE_TITLU = "Ce ne diferențiază";

/**
 * Cele patru lucruri pe care le spune pagina despre noi.
 *
 * ⚠ FIECARE TREBUIE SĂ FIE ADEVĂRAT ȘI VERIFICABIL ÎN ALT LOC DE PE SITE. Al
 * treilea nu era, până la corectura de mai sus. Cine adaugă un al cincilea se
 * uită întâi dacă `/preturi`, centrul de ajutor sau platforma îl susțin.
 */
export interface Diferenta {
  titlu: string;
  text: string;
}

export const DIFERENTE: Diferenta[] = [
  {
    titlu: "Simplu de folosit",
    text: "Nu ai nevoie de cunoștințe tehnice. Îți configurezi magazinul dintr-un editor vizual, cu previzualizare pe telefon și pe desktop.",
  },
  {
    titlu: "Construit pentru România",
    text: "Prețuri în lei, suport în română, integrări cu curierii, procesatorii de plăți și programele de facturare de aici.",
  },
  {
    titlu: "Testezi înainte să plătești",
    text: "Perioada de testare ține 15 zile și acceptă până la 10 produse. Procesatorul de plăți își percepe comisioanele lui; Edinio nu adaugă altele peste.",
  },
  {
    titlu: "Suport de la un om",
    text: "Șapte zile din șapte, la telefon, pe WhatsApp sau pe e-mail. Pe Premium și pe Ultra, un manager al magazinului tău.",
  },
];
