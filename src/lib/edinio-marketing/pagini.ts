/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE FEL DE PAGINA E ASTA — INTR-UN SINGUR LOC
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ NAMESPACE: `edinio-marketing` inseamna MASURAREA NOASTRA — site-ul de
  prezentare, blogul, palnia de inregistrare. NU are nimic de-a face cu pixelii pe
  care si-i configureaza comerciantii pe magazinele lor; aia stau in
  `lib/marketing.ts` si `components/public/`. Granita e probata in
  `lib/granita-tracking.test.ts` si n-are voie sa se stearga.

  ⚠ DE CE UN SINGUR LOC. Clasificarea paginii intra in FIECARE eveniment, ca
  `page_type`. Scrisa in zece componente, cele zece se despart la prima ruta
  adaugata — iar rapoartele arata „other" fara ca nimic sa cada. Aici e o singura
  functie, cu o singura lista, si o proba care o confrunta cu rutele de pe disc.
*/

/** Felurile de pagina pe care le deosebim in rapoarte. */
export type FelPagina =
  | "home"
  | "pricing"
  | "integrations"
  | "optimization"
  | "maintenance"
  | "migration"
  | "contact"
  | "compare"
  | "industries"
  | "blog_index"
  | "blog_article"
  | "blog_category"
  | "blog_author"
  | "blog_tag"
  | "blog_search"
  | "help_index"
  | "help_category"
  | "help_guide"
  | "legal"
  | "register"
  | "login"
  | "onboarding"
  /** Orice ruta publica pe care n-am clasificat-o inca. Vezi nota de mai jos. */
  | "other";

/*
  ⚠ ORDINEA CONTEAZA: se ia PRIMA potrivire. Regulile mai lungi stau inaintea
  celor scurte, altfel `/blog` ar inghiti `/blog/categorie/x`.
*/
const REGULI: ReadonlyArray<readonly [RegExp, FelPagina]> = [
  [/^\/$/, "home"],
  [/^\/preturi(\/|$)/, "pricing"],
  [/^\/integrari(\/|$)/, "integrations"],
  [/^\/optimizare(\/|$)/, "optimization"],
  [/^\/mentenanta-gratuita(\/|$)/, "maintenance"],
  [/^\/migrare(\/|$)/, "migration"],
  [/^\/contact(\/|$)/, "contact"],
  [/^\/vs(\/|$)/, "compare"],
  /*
   * ⚠ RÂNDUL ĂSTA RĂMÂNE, DEȘI PAGINILE AU PLECAT (04.09.2026), și rămâne DINADINS.
   *
   * `/industrii` răspunde acum 410. Un răspuns de rută nu randează niciun layout,
   * deci pixelii din `(website)/layout.tsx` nu pleacă de acolo: regula e inertă,
   * nu greșită.
   *
   * Ce se strică dacă e ștearsă: fișierul ăsta e TAXONOMIA DE TRACKING, iar
   * evenimentele vechi din conturile de reclame poartă deja eticheta „industries".
   * Ștearsă, o comparație pe istoric ar arăta o categorie care se evaporă, fără
   * ca cineva să știe dacă a dispărut traficul sau doar numele lui.
   *
   * Deci: nu se atinge. E cea mai ieftină formă de a nu strica un raport.
   */
  [/^\/industrii(\/|$)/, "industries"],

  [/^\/blog\/categorie(\/|$)/, "blog_category"],
  [/^\/blog\/autor(\/|$)/, "blog_author"],
  [/^\/blog\/eticheta(\/|$)/, "blog_tag"],
  [/^\/blog\/cautare(\/|$)/, "blog_search"],
  [/^\/blog$/, "blog_index"],
  [/^\/blog\/[^/]+$/, "blog_article"],

  [/^\/ajutor$/, "help_index"],
  [/^\/ajutor\/[^/]+$/, "help_category"],
  [/^\/ajutor\/[^/]+\/[^/]+$/, "help_guide"],

  [/^\/(termeni|confidentialitate|cookies|gdpr|retur|anpc)(\/|$)/, "legal"],
  [/^\/register(\/|$)/, "register"],
  [/^\/login(\/|$)/, "login"],
  [/^\/onboarding(\/|$)/, "onboarding"],
];

/**
 * Felul paginii, dupa cale.
 *
 * ⚠ `other` NU E O SCAPARE, e un raspuns. O ruta noua ajunge acolo pana cand
 * cineva o clasifica — si asa se si observa in rapoarte ca a aparut ceva nou.
 * Ce NU are voie sa se intample e ca o ruta veche sa alunece in `other` fiindca
 * s-a schimbat o cale; de aia exista proba care confrunta lista cu discul.
 */
export function clasificaPagina(cale: string | null | undefined): FelPagina {
  if (!cale) return "other";
  const c = cale.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  for (const [tipar, fel] of REGULI) if (tipar.test(c)) return fel;
  return "other";
}

/*
  Gruparea mai larga, pentru rapoarte care nu vor douazeci de randuri.
  ⚠ Se deriva din `FelPagina`, nu se scrie a doua oara: doua liste s-ar desparti.
*/
export type GrupPagina = "site" | "blog" | "help" | "legal" | "funnel" | "other";

export function grupPagina(fel: FelPagina): GrupPagina {
  if (fel.startsWith("blog")) return "blog";
  if (fel.startsWith("help")) return "help";
  if (fel === "legal") return "legal";
  if (fel === "register" || fel === "login" || fel === "onboarding") return "funnel";
  if (fel === "other") return "other";
  return "site";
}
