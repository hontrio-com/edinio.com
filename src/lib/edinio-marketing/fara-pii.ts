/*
  ═══════════════════════════════════════════════════════════════════════════════
  NIMIC CARE IDENTIFICA UN OM NU AJUNGE IN GA4
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E O FUNCTIE SI NU O REGULA SCRISA UNDEVA. Google interzice datele care
  identifica o persoana in Analytics, iar sanctiunea lor nu e un avertisment: pot
  sterge datele proprietatii. Dar mai important, o adresa de email ajunsa acolo nu
  se mai poate scoate — la fel ca la gazdele de proba.

  O regula scrisa intr-un document se uita. O functie care ARUNCA la prima
  abatere, in dezvoltare si in probe, nu se uita.

  ⚠ SI NU E DE AJUNS SA PAZESTI NUMELE CHEILOR. Un parametru care se cheama
  `termen_cautare` poate purta la fel de bine o adresa de email, daca omul a
  cautat-o. De aceea exista si a doua paza: valorile de text liber trebuie sa fie
  ANUNTATE, iar continutul lor e cautat de tipare.
*/

/** Chei care nu au voie sa existe intr-un eveniment, oricare ar fi valoarea. */
const CHEI_OPRITE = [
  "email", "mail", "e_mail",
  "phone", "telefon", "telephone", "mobil",
  "name", "nume", "prenume", "first_name", "last_name", "full_name",
  "message", "mesaj", "comentariu",
  "address", "adresa", "strada", "oras_exact",
  "token", "jeton", "password", "parola", "secret", "api_key",
  "cui", "cnp", "iban", "card",
  "user_id", "customer_id", "client_id",
  "ip", "ip_address",
] as const;

/*
  ⚠ NUME CARE PAR OPRITE, DAR NU SUNT.

  Regula de mai sus opreste orice cheie care SE TERMINA in `_name` — si asta
  prinde, pe langa `first_name`, si `form_name` sau `section_name`, care poarta
  „contact" si „preturi", nu numele nimanui.

  Fara lista asta, paza ar fi oprit in TACERE evenimente legitime in productie
  (magistrala nu arunca acolo, lasa balta si scrie in jurnal) — adica raportul
  de formulare ar fi fost gol si nimeni n-ar fi stiut de ce. Prinsa de o proba
  inainte de desfasurare.

  ⚠ CE INTRA AICI: numai parametri despre care se stie ca poarta valori dintr-o
  MULTIME INCHISA, scrisa de noi. Niciodata unul care poate purta ce a tastat omul.
*/
const NUME_CUNOSCUTE_CURATE = [
  "form_name",     // "contact" | "migration" | "newsletter"
  "section_name",  // numele sectiunii, din marcajele noastre
] as const;

/**
 * Parametrii care AU VOIE sa poarte text scris de om.
 *
 * ⚠ LISTA E SCURTA DINADINS. Orice text liber e o cale prin care ceva personal
 * ajunge in rapoarte fara sa vrea nimeni. Ce nu e aici trebuie sa fie o valoare
 * dintr-o multime cunoscuta (un id de buton, un fel de pagina), nu ce a tastat omul.
 */
const TEXT_LIBER_PERMIS = ["search_term"] as const;

/* Tipare care tradeaza o persoana, chiar si intr-un camp permis. */
const TIPARE_PERSONALE: ReadonlyArray<readonly [RegExp, string]> = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "arata ca o adresa de email"],
  [/(?:\+?4?0)\d{9}\b/, "arata ca un numar de telefon romanesc"],
  [/\b\d{13}\b/, "arata ca un CNP"],
  /*
    ⚠ IBAN romanesc: `RO` + doua cifre de control + PATRU LITERE de banca + 16
    caractere ALFANUMERICE. Prima forma a randului asta cerea patru CIFRE dupa
    literele bancii si nu se potrivea pe niciun IBAN adevarat — proba a prins-o
    cu `RO49AAAA1B31007593840000`, unde dupa `AAAA` vine `1B31`.
  */
  [/\bRO\d{2}[A-Z]{4}[A-Z0-9]{16}\b/i, "arata ca un IBAN"],
  [/\b\d{13,19}\b/, "arata ca un numar de card"],
];

export class EroarePii extends Error {}

/**
 * Arunca daca evenimentul poarta ceva ce identifica un om.
 *
 * ⚠ ARUNCA, NU CURATA. Un curatator tacut ar lasa greseala in cod si ar face-o sa
 * treaca neobservata pana cand cineva schimba curatatorul. Aruncarea o pune in
 * fata celui care scrie evenimentul, in clipa in care il scrie.
 *
 * ⚠ IN PRODUCTIE NU ARUNCA — vezi `magistrala.ts`. Acolo evenimentul se lasa
 * balta si se scrie in jurnal: o masuratoare stricata n-are voie sa doboare
 * pagina omului. Locul unde greseala se prinde e dezvoltarea si suita de probe.
 */
export function verificaFaraPii(nume: string, parametri: Record<string, unknown>): void {
  for (const [cheie, valoare] of Object.entries(parametri)) {
    const c = cheie.toLowerCase();

    const eCunoscutCurat = (NUME_CUNOSCUTE_CURATE as readonly string[]).includes(c);
    if (!eCunoscutCurat && (CHEI_OPRITE as readonly string[]).some(op => c === op || c.endsWith(`_${op}`))) {
      throw new EroarePii(
        `Evenimentul "${nume}" are parametrul "${cheie}", care nu are voie in GA4. ` +
        "Daca ai nevoie de el pentru o conversie, trimite-l prin adaptorul serverului, nu prin Analytics.",
      );
    }

    if (typeof valoare !== "string") continue;

    for (const [tipar, ce] of TIPARE_PERSONALE) {
      if (tipar.test(valoare)) {
        throw new EroarePii(
          `Evenimentul "${nume}", parametrul "${cheie}": valoarea ${ce}. ` +
          "Valoarea nu se trimite si nu se scrie in jurnal.",
        );
      }
    }

    /*
      ⚠ Text lung acolo unde nu e anuntat = aproape sigur ceva scris de om.
      Pragul e larg: id-urile si numele de sectiuni sunt scurte.
    */
    if (valoare.length > 100 && !(TEXT_LIBER_PERMIS as readonly string[]).includes(c)) {
      throw new EroarePii(
        `Evenimentul "${nume}", parametrul "${cheie}": ${valoare.length} de caractere. ` +
        "Parametrii care nu sunt anuntati ca text liber trebuie sa poarte valori dintr-o multime cunoscuta.",
      );
    }
  }
}
