import type { TipIndemn } from "./indemn";

/**
 * Șabloane de articol.
 *
 * ⚠ NU SUNT „DESIGN", SUNT SCHELE DE GÂNDIRE. Fiecare pune titlurile în ordinea
 * în care se scrie bine felul acela de articol, și lasă între ele instrucțiuni
 * pentru autor. Un șablon care ar da doar text frumos n-ar ajuta pe nimeni; unul
 * care spune „aici pui pasul 1, scurt, cu butonul pe care îl apeși" chiar ajută.
 *
 * ⚠ RĂSPUNSUL SCURT E ÎN FIECARE ȘABLON. E câmpul de care depinde cel mai mult
 * dacă articolul ajunge citat de motoarele care răspund cu text, și e cel mai
 * ușor de uitat fiindcă nu se vede în corpul textului. Pus în șablon, se scrie.
 *
 * ⚠ ȘABLOANELE STAU ÎN COD, NU ÎN BAZĂ. Se schimbă odată cu felul în care
 * scriem, nu odată cu conținutul, și n-au nevoie de ecran de administrare: un
 * tabel cu patru rânduri care se modifică o dată pe an ar fi fost muncă în plus
 * pentru nimic.
 */
export interface SablonArticol {
  cheie: string;
  nume: string;
  /** O frază despre când se folosește. Se vede la alegere. */
  cand: string;
  raspunsScurt: string;
  html: string;
  /** Îndemnul potrivit felului acesta de articol. */
  indemn: TipIndemn;
  intrebari: { q: string; a: string }[];
}

export const SABLOANE: SablonArticol[] = [
  {
    cheie: "ghid",
    nume: "Ghid pas cu pas",
    cand: "Când cititorul are ceva de făcut și vrea să afle cum.",
    raspunsScurt:
      "Scrie aici, în două-trei propoziții, RĂSPUNSUL, nu promisiunea lui. Trebuie să se înțeleagă citit singur, rupt de restul articolului.",
    indemn: "start",
    html: [
      "<p>Un paragraf despre cui i se întâmplă lucrul ăsta și de ce contează. Fără introducere de complezență.</p>",
      "<h2>De ce ai avea nevoie de asta</h2>",
      "<p>Situația concretă. Dacă cititorul nu se recunoaște aici, e mai bine să plece acum decât după cinci minute.</p>",
      "<h2>Ce îți trebuie înainte</h2>",
      "<ul><li>Prima condiție</li><li>A doua</li></ul>",
      "<h2>Pasul 1: ...</h2>",
      "<p>Unde intri și ce apeși. Scurt. O poză aici, dacă ținta n-are nume scris pe ea.</p>",
      "<h2>Pasul 2: ...</h2>",
      "<p></p>",
      "<h2>Ce faci dacă nu merge</h2>",
      "<p>Cazurile care chiar apar, nu toate cele închipuite.</p>",
    ].join(""),
    intrebari: [
      { q: "Cât durează?", a: "" },
      { q: "Se poate strica ceva?", a: "" },
    ],
  },
  {
    cheie: "comparatie",
    nume: "Comparație",
    cand: "Când cititorul are de ales între două-trei lucruri.",
    raspunsScurt:
      "Spune de la început CARE e alegerea potrivită și pentru cine. O comparație care nu răspunde până la capăt lasă omul exact unde era.",
    indemn: "preturi",
    html: [
      "<p>Ce se compară și pentru cine se pune întrebarea.</p>",
      "<h2>Pe scurt: ce alegi și când</h2>",
      "<p>Răspunsul, înainte de argumente. Cine are răbdare citește mai jos de ce.</p>",
      "<h2>Prima variantă</h2>",
      "<h3>Ce face bine</h3><p></p>",
      "<h3>Unde te încurcă</h3><p></p>",
      "<h2>A doua variantă</h2>",
      "<h3>Ce face bine</h3><p></p>",
      "<h3>Unde te încurcă</h3><p></p>",
      "<h2>Cât costă, de fapt</h2>",
      "<p>Costul întreg, cu ce se plătește separat. Aici se vede diferența adevărată.</p>",
    ].join(""),
    intrebari: [
      { q: "Se poate schimba mai târziu?", a: "" },
      { q: "Care iese mai ieftin pe an?", a: "" },
    ],
  },
  {
    cheie: "greseli",
    nume: "Greșeli frecvente",
    cand: "Când cititorul face deja ceva, dar îi merge prost.",
    raspunsScurt:
      "Cea mai des întâlnită greșeală și reparația ei, într-o propoziție fiecare.",
    indemn: "contact",
    html: [
      "<p>De unde știm care sunt greșelile: din ce vedem la magazinele de pe platformă, nu din presupuneri.</p>",
      "<h2>1. Prima greșeală</h2>",
      "<h3>Cum se vede</h3><p>Semnul după care o recunoști.</p>",
      "<h3>Ce se întâmplă de fapt</h3><p></p>",
      "<h3>Cum o repari</h3><p></p>",
      "<h2>2. A doua greșeală</h2>",
      "<h3>Cum se vede</h3><p></p>",
      "<h3>Ce se întâmplă de fapt</h3><p></p>",
      "<h3>Cum o repari</h3><p></p>",
    ].join(""),
    intrebari: [{ q: "Cum îmi dau seama care mi se aplică?", a: "" }],
  },
  {
    cheie: "noutate",
    nume: "Ce e nou",
    cand: "Când a apărut ceva în platformă.",
    raspunsScurt: "Ce s-a schimbat și ce înseamnă pentru cine folosește deja platforma.",
    indemn: "start",
    html: [
      "<h2>Ce s-a schimbat</h2>",
      "<p>Lucrul în sine, fără laude.</p>",
      "<h2>De ce am făcut-o</h2>",
      "<p>Problema pe care o rezolvă, în cuvintele celor care ne-au cerut-o.</p>",
      "<h2>Cum o folosești</h2>",
      "<p>Unde intri și ce apeși.</p>",
      "<h2>Ce NU face</h2>",
      "<p>Marginile, spuse limpede. Scutesc pe toată lumea de o dezamăgire.</p>",
    ].join(""),
    intrebari: [{ q: "Trebuie să fac ceva ca să o am?", a: "" }],
  },
];

export function sablonDupaCheie(cheie: string): SablonArticol | null {
  return SABLOANE.find((s) => s.cheie === cheie) ?? null;
}
