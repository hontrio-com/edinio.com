/**
 * Întrebările frecvente de pe site-ul de prezentare.
 *
 * ═══ TEXTELE SUNT ALE CLIENTULUI ═══
 *
 * Cele zece perechi întrebare-răspuns au fost date cuvânt cu cuvânt
 * (2026-08-09). Nu se rescriu, nu se scurtează, nu se reordonează fără să
 * întrebi. Setul dinainte avea șase, altele — a fost înlocuit în întregime.
 *
 * ═══ ACELAȘI TEXT MERGE ȘI ÎN DATELE STRUCTURATE ═══
 *
 * Pagina de start trimite către Google un bloc `FAQPage`. Până acum el era scris
 * de mână, cu ÎNTREBĂRILE COPIATE — două locuri cu același conținut, deci la
 * prima corectură ar fi rămas unul în urmă, iar Google ar fi primit întrebări
 * care nu mai există pe pagină. Regulile lui cer explicit ca datele structurate
 * să corespundă conținutului vizibil.
 *
 * Acum `intrebariStructurate()` construiește blocul chiar din lista de mai jos.
 * Nu se mai pot despărți.
 */

export const FAQ_TITLE = "Întrebări frecvente";

export const FAQ_LEAD = "Răspunsuri la cele mai comune întrebări despre Edinio.";

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: "Ce este Edinio?",
    answer:
      "Edinio este o platformă românească prin care îți poți crea și administra propriul magazin online, fără să ai nevoie de cunoștințe tehnice. Ai într-un singur loc produsele, comenzile, plățile, curierii, facturarea și instrumentele necesare pentru a vinde online.",
  },
  {
    question: "Am nevoie de cunoștințe tehnice?",
    answer:
      "Nu. Edinio este construit pentru antreprenori, nu pentru programatori. Magazinul poate fi configurat și administrat simplu, inclusiv direct de pe telefon. Iar dacă ai nevoie de ajutor, ai asistență inclusă.",
  },
  {
    question: "În cât timp îmi pot lansa magazinul?",
    answer:
      "Poți avea magazinul pregătit în doar câteva minute. După creare, adaugi produsele, conectezi serviciile de care ai nevoie și poți începe să vinzi.",
  },
  {
    question: "Ce integrări pot conecta?",
    answer:
      "Poți conecta servicii pentru curierat, plăți online, facturare, marketing și alte operațiuni ale magazinului. Edinio include integrări precum FAN Courier, Sameday, Cargus, SmartBill, Oblio, FGO, Stripe, Netopia și multe altele.",
  },
  {
    question: "Pot integra plata cu cardul?",
    answer:
      "Da. Poți conecta un procesator de plăți disponibil în Edinio și le poți permite clienților să achite comenzile online cu cardul. Poți folosi și alte metode de plată, precum rambursul.",
  },
  {
    question: "Ce include mentenanța gratuită?",
    answer:
      "Noi ne ocupăm permanent de partea tehnică a platformei: actualizări, securitate, funcționarea magazinului și îmbunătățirile Edinio. Nu trebuie să angajezi un programator sau să plătești separat pentru mentenanța tehnică.",
  },
  {
    question: "Primesc ajutor dacă nu știu să configurez ceva?",
    answer:
      "Da. Asistența este inclusă, iar echipa noastră te poate ajuta cu întrebările și configurările necesare pentru magazinul tău.",
  },
  {
    question: "Pot administra magazinul de pe telefon?",
    answer:
      "Da. Edinio este construit astfel încât să poți administra magazinul și de pe telefon: produse, comenzi, clienți și celelalte operațiuni importante.",
  },
  {
    question: "Pot folosi propriul domeniu?",
    answer:
      "Da. Poți conecta un domeniu pe care îl deții deja sau poți cumpăra unul nou direct din Edinio. Totul se configurează din platformă, fără să fie nevoie să folosești servicii separate.",
  },
  {
    question: "Pot anula abonamentul oricând?",
    answer:
      "Da. Poți opri abonamentul atunci când dorești, fără să fii legat de un contract pe termen lung.",
  },
];

/**
 * Blocul `FAQPage` pentru datele structurate, construit din aceeași listă.
 *
 * ⚠ Textul pleacă CU diacritice, exact cum e pe pagină. Restul metadatelor din
 * repo sunt scrise fără, dar aici nu e o alegere de stil: Google cere ca
 * răspunsul din datele structurate să fie același cu cel vizibil, iar o
 * nepotrivire poate duce la ignorarea întregului bloc.
 */
export function intrebariStructurate(intrebari: FaqItem[] = FAQS) {
  return {
    "@type": "FAQPage",
    mainEntity: intrebari.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}
