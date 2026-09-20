/*
  ═══════════════════════════════════════════════════════════════════════════
  CAT COSTA DE FAPT UN SMS DE RECUPERARE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE SCRIA PANA ACUM, SI DE CE ERA GRESIT.

  Sub campul de mesaj scria „`length` caractere · `ceil(length/160)` SMS (+
  linkul de recuperare)". Doua lucruri nu se potriveau cu ce se plateste:

  1. **160 nu e o regula generala, ci limita alfabetului GSM-7.** Diacriticele
     romanesti (a-breve, a-circumflex, i-circumflex, s-virgula, t-virgula) NU
     sunt in el. Un singur „ă" muta tot mesajul pe UCS-2, unde un segment are
     **70** de caractere, nu 160. Un text de 150 de caractere scris romaneste
     nu e „1 SMS", ci trei.

  2. **Linkul se adauga DUPA.** Era pomenit in paranteza, dar nu intra in
     socoteala - tocmai partea care poate impinge mesajul peste inca un prag.

  Rezultatul: comerciantul scria un mesaj frumos cu diacritice, citea „1 SMS"
  si platea trei. La 21 de SMS-uri trimise pe productie inca nu se vede; la o
  campanie, se vede pe factura.

  ⚠ CATEVA SEMNE COSTA DOUA CHIAR SI IN GSM-7: `^ { } \ [ ] ~ |` si euro. Ele
  stau in „tabela de extensie" si se trimit ca doua caractere. `{nume}` din
  sabloane are DOUA acolade, deci sablonul singur consuma patru locuri, nu doua.
*/

/**
 * Alfabetul GSM 03.38, partea de baza. Ce nu e aici muta mesajul pe UCS-2.
 *
 * ⚠ Are `à`, `Ä`, `Ö`, `é` si altele, dar NU are diacriticele romanesti - de-aia
 * orice text scris corect romaneste iese Unicode.
 */
const GSM7_BAZA = new Set(
  (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    + "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
  ).split(""),
);

/** Semnele care incap in GSM-7, dar costa DOUA locuri. */
const GSM7_EXTINSE = new Set("^{}\\[~]|€".split(""));

export type CodareSms = "GSM-7" | "Unicode";

export interface SocotealaSms {
  codare: CodareSms;
  /** Cate locuri ocupa mesajul, cu semnele duble numarate de doua ori. */
  locuri: number;
  /** Cate caractere are textul, asa cum le numara omul. */
  caractere: number;
  segmente: number;
  /** Cat mai incape pana la urmatorul segment. */
  panaLaUrmatorul: number;
  /** Semnele care au scos mesajul din GSM-7, primele cateva. */
  semneleCareCostaScump: string[];
}

/** Limitele standardului: cate locuri incap intr-un segment. */
const LIMITE = {
  "GSM-7": { singur: 160, inLant: 153 },
  Unicode: { singur: 70, inLant: 67 },
} as const;

/**
 * Cat costa mesajul asta, cu tot cu ce se adauga dupa el.
 *
 * ⚠ `sufix` e linkul de recuperare, si intra in socoteala. El se lipeste de
 * text abia la trimitere, deci comerciantul nu-l vede cand scrie - dar il
 * plateste.
 */
export function socotesteSms(text: string, sufix = ""): SocotealaSms {
  const intreg = `${text}${sufix}`;
  const semne = [...intreg];

  const straine = semne.filter((c) => !GSM7_BAZA.has(c) && !GSM7_EXTINSE.has(c));
  const codare: CodareSms = straine.length > 0 ? "Unicode" : "GSM-7";

  /*
    ⚠ In Unicode NU se mai numara extinsele de doua ori (acolo toate au aceeasi
    marime), dar se numara UNITATILE UTF-16: un emoji din afara planului de baza
    ocupa DOUA locuri, desi omul vede un singur semn.
  */
  const locuri = codare === "GSM-7"
    ? semne.reduce((n, c) => n + (GSM7_EXTINSE.has(c) ? 2 : 1), 0)
    : intreg.length;

  const lim = LIMITE[codare];
  const segmente = locuri === 0 ? 0 : locuri <= lim.singur ? 1 : Math.ceil(locuri / lim.inLant);
  const capacitate = segmente <= 1 ? lim.singur : segmente * lim.inLant;

  return {
    codare,
    locuri,
    caractere: semne.length,
    segmente,
    panaLaUrmatorul: Math.max(0, capacitate - locuri),
    semneleCareCostaScump: [...new Set(straine)].slice(0, 6),
  };
}

/**
 * Randul de sub campul de mesaj.
 *
 * Exemplu: „124 caractere + link · Unicode · 3 SMS-uri".
 */
export function scrieSocoteala(s: SocotealaSms, areSufix: boolean): string {
  const bucati = [
    `${s.caractere} caractere${areSufix ? " (cu link)" : ""}`,
    s.codare,
    `${s.segmente} ${s.segmente === 1 ? "SMS" : "SMS-uri"}`,
  ];
  return bucati.join(" · ");
}

/**
 * Ce i se spune comerciantului cand mesajul il costa mai mult decat crede.
 *
 * `null` cand nu e nimic de spus: un mesaj scurt fara diacritice nu are nevoie
 * de nicio vorba.
 */
export function avertismentSms(s: SocotealaSms): string | null {
  if (s.segmente >= 4) {
    return `Mesajul se trimite ca ${s.segmente} SMS-uri si se plateste ca atare. Scurteaza-l.`;
  }
  if (s.codare === "Unicode" && s.semneleCareCostaScump.length > 0) {
    return `Diacriticele (${s.semneleCareCostaScump.join(" ")}) trec mesajul pe Unicode, unde un `
      + `SMS are 70 de caractere in loc de 160. Fara ele ar incapea mai mult text intr-un `
      + `singur mesaj.`;
  }
  if (s.segmente > 1) {
    return `Mesajul depaseste un singur SMS: se trimite ca ${s.segmente} si se plateste ca ${s.segmente}.`;
  }
  return null;
}
