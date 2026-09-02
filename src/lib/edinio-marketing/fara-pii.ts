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
  /*
    ⚠ „autor" ADAUGAT PE 03.09.2026, DUPA UN DEFECT VIU. `article_view` trimitea
    `article_author` cu numele adevarat al omului care a scris articolul — catre
    GA4, Meta SI TikTok. Publicat sub articol nu inseamna ingaduit intr-un cont de
    reclame.

    Acum pleaca slugul. Regula de aici e pentru URMATORUL camp: un `post_author`
    sau `comment_author` scris maine cade la probe, nu in productie.
  */
  "autor", "author",
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
  "content_name",  // "Homepage" | "Preturi" — numele paginii de aterizare
  "field_name",    // "email" | "phone" — CARE camp a picat, nu ce s-a scris in el
  "article_author", // SLUGUL autorului ("ion-popescu"), nu numele lui — vezi `CorpArticol`
] as const;
/*
  ⚠ `content_name` A FOST ADAUGAT PE 01.09.2026, SI ERA DEJA UN DEFECT VIU.

  `landing_view` (evenimentul care hraneste audientele de retargetare din Meta si
  TikTok) poarta `content_name: "Homepage"`. Cheia se termina in `_name`, deci
  paza o oprea — iar in PRODUCTIE magistrala nu arunca, lasa balta si scrie in
  jurnal.

  Urmarea ar fi fost: niciun `ViewContent` catre Meta si TikTok, deci audientele
  de retargetare nu mai cresteau deloc. Nimic n-ar fi cazut, nimic n-ar fi
  aratat rosu. A DOUA OARA acelasi tipar, dupa `form_name`.

  ⚠ De aceea exista acum si proba care MATURA TOATA TAXONOMIA prin paza asta
  (`reclame.test.ts`): un nume nou care se termina in `_name` cade acolo, nu in
  productie peste trei saptamani.

  ⚠ SI A MERITAT DIN PRIMA RULARE. Plasa a gasit imediat un al treilea caz, DEJA
  VIU: `form_error` poarta `field_name`, deci fiecare eroare de formular era
  oprita aici si nu ajungea niciodata in GA4. Raportul „la ce camp se impotmolesc
  oamenii" — cel pentru care a fost scris evenimentul — era gol de cand exista.

  Nu l-am gasit citind; l-a gasit proba, in aceeasi minuta in care a fost scrisa.
  De trei ori acelasi tipar arata ca regula „orice cheie care se termina in
  `_name`" e prea larga; ce o face totusi bine intretinuta e ca abaterile cad
  ZGOMOTOS, la probe, nu tacut, in productie.
*/

/**
 * Parametrii care AU VOIE sa poarte text scris de om.
 *
 * ⚠ LISTA E SCURTA DINADINS. Orice text liber e o cale prin care ceva personal
 * ajunge in rapoarte fara sa vrea nimeni. Ce nu e aici trebuie sa fie o valoare
 * dintr-o multime cunoscuta (un id de buton, un fel de pagina), nu ce a tastat omul.
 */
const TEXT_LIBER_PERMIS = [] as const;
/*
  ⚠ LISTA E GOALA DIN 03.09.2026, si asta e o intarire, nu o scapare.

  Singurul ei membru a fost `search_term`. L-am scos de tot din evenimente: un om
  poate tasta orice in caseta de cautare, iar tiparele personale prind emailul si
  telefonul, dar nu „Ion Popescu" si nu o adresa de strada.

  Cat timp lista sta goala, NICIUN parametru n-are voie sa poarte text scris de
  om. Cine vrea sa adauge unul trebuie sa treaca pe aici si sa scrie de ce.
*/

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ⚠ ADRESE, SCUTITE DE REGULA LUNGIMII — SI DE CE E SIGUR
  ═══════════════════════════════════════════════════════════════════════════════

  Regula „mai lung de 100 de caractere = aproape sigur text scris de om" e buna
  pentru id-uri si nume de sectiuni. Pentru o adresa e falsa: o adresa de reclama
  e lunga TOCMAI din pricina parametrilor pe care ii pastram dinadins
  (`utm_campaign`, `utm_content`, `gclid`). Nu e text liber, e o multime cunoscuta.

  ⚠ MASURAT IN PRODUCTIE pe 03.09.2026: cu o adresa de 177 de caractere,
  `page_view`-ul nostru nu ajungea la niciun furnizor. Se pierdea intreg, fiindca
  paza opreste evenimentul pentru TOTI adaptorii. Lovea exact traficul platit.

  ⚠ SI DE CE SCUTIREA NU DESCHIDE O USA. Adresele astea trec prin `curataAdresa`
  INAINTE de paza (in `magistrala.ts`), iar acolo parametrii sunt filtrati printr-o
  lista ALBA — deci ce ramane nu poate fi text scris de om. Scutirea se sprijina pe
  ordinea aceea, si ordinea e probata separat: vezi `magistrala.test.ts`.

  ⚠ CELELALTE REGULI RAMAN. Tiparele personale (email, telefon, CNP, IBAN, card)
  se verifica mai departe si pe adrese — scutirea e numai de la lungime.
*/
const ADRESE_CURATATE = ["page_location", "page_referrer"] as const;

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
    const scutitDeLungime =
      (TEXT_LIBER_PERMIS as readonly string[]).includes(c) ||
      (ADRESE_CURATATE as readonly string[]).includes(c);
    if (valoare.length > 100 && !scutitDeLungime) {
      throw new EroarePii(
        `Evenimentul "${nume}", parametrul "${cheie}": ${valoare.length} de caractere. ` +
        "Parametrii care nu sunt anuntati ca text liber trebuie sa poarte valori dintr-o multime cunoscuta.",
      );
    }
  }
}
