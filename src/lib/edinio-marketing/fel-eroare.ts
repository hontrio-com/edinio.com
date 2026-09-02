/*
  ═══════════════════════════════════════════════════════════════════════════════
  FELUL ERORII, DINTR-O MULTIME INCHISA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE NU SE TRANSFORMA MESAJUL. Prima mea forma lua textul erorii si il facea
  snake_case: `"Adresa ion@exemplu.ro e deja folosita"` devenea
  `adresa_ion_exemplu_ro_e_deja_folosita`.

  Pare curatat. Nu e. `@` si `.` au disparut, dar CUVINTELE au ramas — adresa
  omului, intreaga, doar altfel punctata. Iar paza anti-PII n-ar mai fi prins-o
  tocmai fiindca nu mai arata a email.

  O proba a prins-o inainte sa ajunga in productie. Lectia e mai veche de azi:
  un curatator de text liber e o poarta care pare inchisa.

  ⚠ DECI NU SE CURATA, SE CLASIFICA. Se intoarce una din cateva valori cunoscute.
  Ce nu se recunoaste devine `altul` — nu textul, nu o bucata din el, nimic.
  Un `altul` care creste in rapoarte inseamna ca a aparut un fel de eroare nou si
  ca lista de aici trebuie recitita; asta e informatia utila, nu textul.
*/

export type FelEroareFormular =
  | "captcha"
  | "validare"
  | "limita"
  | "trimitere"
  /*
    ⚠ `retea` NU VINE DIN NICIUN MESAJ, si de aceea nu e in tiparele de mai jos.

    Toate celelalte descriu ce a RASPUNS serverul. Asta descrie ca serverul n-a
    raspuns deloc: chemarea insasi a picat — retea cazuta, sau o pagina veche care
    cheama o actiune ce nu mai exista dupa o desfasurare.

    Le desparte fiindca inseamna lucruri deosebite. `trimitere` inseamna ca noi am
    primit cererea si n-am putut duce emailul mai departe. `retea` inseamna ca
    cererea n-a ajuns niciodata la noi — omul e pierdut inainte de a intra pe usa,
    si pana pe 02.09.2026 nu lasa nicio urma.
  */
  | "retea"
  | "altul";

/*
  Tiparele se potrivesc pe mesajele NOASTRE, care sunt scrise de noi si nu se
  schimba des. Ordinea conteaza: primul care se potriveste castiga.
*/
const TIPARE: ReadonlyArray<readonly [RegExp, FelEroareFormular]> = [
  [/persoan|captcha|robot/i, "captcha"],
  [/prea multe|asteapta|mai tarziu|astepti/i, "limita"],
  [/nu am putut trimite|nu s-a putut trimite|email/i, "trimitere"],
  [/completeaz|obligatoriu|valid|acord|adresa de email nu|prea lung|prea scurt/i, "validare"],
];

/**
 * Felul unei erori de formular, pentru rapoarte.
 *
 * ⚠ Intoarce INTOTDEAUNA una din valorile de mai sus. Nimic din mesaj nu iese
 * de aici — nici transformat, nici trunchiat.
 */
export function felEroare(mesaj: string | null | undefined): FelEroareFormular {
  if (!mesaj) return "altul";
  for (const [tipar, fel] of TIPARE) if (tipar.test(mesaj)) return fel;
  return "altul";
}
