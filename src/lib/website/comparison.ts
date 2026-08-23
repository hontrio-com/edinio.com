/**
 * Tabelul de comparație Edinio vs. celelalte platforme.
 *
 * ═══ TEXTELE SUNT ALE CLIENTULUI ═══
 *
 * Titlul și descrierea au fost date cuvânt cu cuvânt (2026-08-09), iar rândurile
 * tabelului vin dintr-un PDF trimis de el, din care s-a extras DOAR informația.
 * Nu se rescriu, nu se scurtează, nu se „îmbunătățesc" fără să întrebi.
 *
 * ═══ E PUBLICITATE COMPARATIVĂ ═══
 *
 * Un tabel care ne pune lângă concurenți nominalizați intră sub reguli: fiecare
 * afirmație trebuie să fie verificabilă și să compare ACEEAȘI caracteristică la
 * toate platformele. De aceea valorile sunt descriptive („Prin aplicații", „Prin
 * pluginuri"), nu judecăți: descriu CUM se face lucrul pe fiecare platformă, nu
 * cât de bună e platforma. Dacă cineva adaugă un rând, regula e aceeași.
 *
 * ⚠ Nota care lămurea rândul cu „X" a fost SCOASĂ la cererea clientului — vezi
 * la sfârșitul fișierului ce scria și ce anume susținea.
 */

export const COMPARISON_EYEBROW = "Comparație";

export const COMPARISON_TITLE = [
  "Construit în România.",
  "Gândit pentru antreprenorii români.",
];

export const COMPARISON_LEAD =
  "Nu trebuie să adaptezi o platformă globală la piața locală. Edinio a fost construit de la început pentru afacerile din România.";

/**
 * Platformele, în ordinea din PDF.
 *
 * Edinio stă separat, nu în listă: e coloana care se evidențiază, are alt desen
 * și pe telefon apare prima în fiecare card. Băgat în aceeași listă, ar fi
 * trebuit tratat cu excepții în trei locuri.
 */
export const COMPARISON_US = "Edinio";

export const COMPARISON_RIVALS = ["Shopify", "WooCommerce", "OpenCart", "Wix"] as const;

export type ComparisonRival = (typeof COMPARISON_RIVALS)[number];

/**
 * Siglele platformelor, din `public/platforme/`.
 *
 * ═══ SE EGALIZEAZĂ PE SUPRAFAȚĂ, NU PE ÎNĂLȚIME ═══
 *
 * Aceeași regulă ca la siglele de integrări (`logos.ts`), și din același motiv:
 * la înălțime egală, un cuvânt lung pare de câteva ori mai mare decât un semn
 * pătrat. Shopify are raportul 0,88 (aproape pătrat), Wix 2,48 (wordmark lat) —
 * puse la aceeași înălțime, Wix ar domina rândul fără să însemne nimic.
 *
 * Deci înălțimea se calculează: `h = √(arie / raport)`.
 *
 * ═══ TOATE NUMERELE SUNT MĂSURATE, NU CITITE DIN ANTET ═══
 *
 * `ratio` vine din `viewBox`, nu din atributele `width`/`height`: la Shopify și
 * WooCommerce cele două sunt declarate cu valori de zece ori mai mari, iar la
 * siglele de rețele sociale două din trei aveau chiar RAPOARTE diferite între
 * ele. Verificat aici cu `getBBox()` în browser: conturul real al fiecărui desen
 * umple cutia (0,96-1,00), deci nu e nevoie de corecție de margini goale.
 *
 * ═══ DE CE NU SE EGALIZEAZĂ ARIA VOPSITĂ ═══
 *
 * S-a măsurat și cât din cutie e CHIAR vopsit, desenând fiecare siglă pe o pânză
 * și numărând pixelii opaci: Shopify 0,71 · WooCommerce 0,83 · OpenCart 0,79 ·
 * Wix 0,44. (OpenCart iese 0,79, adică exact π/4 — confirmă că e un disc plin.)
 *
 * Egalizate după cerneală, semnele dense s-ar micșora și wordmark-urile s-ar
 * umfla: Wix ajungea vizibil cel mai mare din rând. Probat una lângă alta în
 * browser, la fel și un compromis pe radicalul cernelii. Cea care se citește ca
 * „toate la fel" e aria CUTIEI — de aceea `ink` e 1 peste tot și nu s-a păstrat
 * corecția de disc pentru OpenCart, care îl făcea și mai mare.
 *
 * Când lipsește fișierul, `src` rămâne gol și se scrie doar numele platformei.
 */
/**
 * Aria țintă a siglelor, în antetul de tabel.
 *
 * ⚠ Siglele apar DOAR pe desktop (cerut 2026-08-09). Pe telefon, unde rândul e
 * „platformă → valoare", rămân numai denumirile: acolo sigla nu adăuga nimic pe
 * care numele să nu-l spună, dar cerea un locaș de lățime fixă ca marginea
 * stângă a numelor să nu iasă zimțată. Mai puține piese, același înțeles.
 */
export const ARIE_SIGLA = 900;

export interface PlatformLogo {
  /** Calea din `public/`. Gol = nu avem fișierul, se scrie doar numele. */
  src: string;
  /** Lățime / înălțime, măsurat pe `viewBox`. */
  ratio: number;
  /**
   * Corecție OPTICĂ, aplicată peste socoteala de arie. 1 = neatinsă.
   *
   * Aria egală duce foarte aproape, dar nu până la capăt: un disc plin și
   * saturat trage mai greu decât un semn cu goluri, iar un wordmark subțire pare
   * mai mic decât e. Numerele de mai jos NU sunt din burtă — cele cinci sigle au
   * fost puse una lângă alta, mărite de trei ori, fără corecție și cu ea, și s-a
   * ales rândul care se citește ca o familie.
   *
   * Dacă se schimbă un fișier, se reface proba. Corecția e legată de DESENUL
   * acela, nu de platformă.
   */
  optic: number;
}

/*
 * ⚠ EDINIO NU ARE SIGLĂ ÎN TABEL, cerut explicit (2026-08-09): doar denumirea.
 *
 * Coloana noastră se deosebește deja prin tentă și prin verde; o siglă în plus
 * n-ar mai fi spus nimic nou, iar sigla noastră lângă patru sigle străine face
 * rândul să pară o listă de parteneri, nu o comparație.
 */

export const PLATFORM_LOGOS: Record<ComparisonRival, PlatformLogo> = {
  Shopify: { src: "/platforme/shopify.svg", ratio: 256 / 292, optic: 1 },
  // Semn + cuvânt, cu goluri între litere: puțin mai mare ca să țină pasul.
  WooCommerce: { src: "/platforme/woocommerce.svg", ratio: 256 / 153, optic: 1.05 },
  // Disc plin și saturat — cea mai grea formă din rând. Se micșorează.
  OpenCart: { src: "/platforme/opencart.svg", ratio: 2500 / 2500, optic: 0.92 },
  // Wordmark subțire și lat: la arie egală arată scund.
  Wix: { src: "/platforme/wix.svg", ratio: 311 / 125.2, optic: 1.1 },
};

/**
 * Înălțimea la care se randează o siglă, ca toate să ocupe aceeași SUPRAFAȚĂ.
 *
 * `h = √(arie / raport) × corecție`. De ce suprafață și nu înălțime, de ce
 * corecția optică și cum s-au ales cele două numere care nu sunt 1 — vezi nota
 * lungă de deasupra lui `PLATFORM_LOGOS`.
 *
 * ⚠ Stă AICI, lângă datele pe care le citește, nu în componenta care a avut-o
 * prima. O folosesc două locuri — antetul tabelului de comparație și cercurile de
 * pe pagina „Migrare" — iar cu o copie de fiecare parte, prima corectură făcută
 * într-un loc le-ar fi despărțit. Aceeași hotărâre ca la culorile din `linii.ts`.
 */
export function inaltimeSigla(logo: PlatformLogo, arie: number): number {
  return Math.round(Math.sqrt(arie / logo.ratio) * logo.optic);
}

export interface ComparisonRow {
  /** Criteriul, exact ca în PDF. */
  criteriu: string;
  /** Ce oferă Edinio. */
  edinio: string;
  /** Câte o valoare pentru fiecare concurent, în ordinea din `COMPARISON_RIVALS`. */
  rivali: [string, string, string, string];
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    criteriu: "Construit special pentru România",
    edinio: "Da",
    rivali: ["Platformă globală", "Platformă globală", "Platformă globală", "Platformă globală"],
  },
  {
    criteriu: "Curieri românești integrați nativ",
    edinio: "Da",
    rivali: ["Prin aplicații", "Prin pluginuri", "Prin extensii", "Aplicații / parteneri"],
  },
  {
    criteriu: "SmartBill / Oblio / FGO integrate direct",
    edinio: "Da",
    rivali: ["Aplicații terțe", "Prin pluginuri", "Prin extensii", "Soluții externe"],
  },
  {
    criteriu: "Fără pluginuri pentru fluxul local de bază",
    edinio: "Da",
    rivali: ["Nu", "Nu", "Nu", "Parțial"],
  },
  {
    criteriu: "AWB + factură + comandă în același flux",
    edinio: "Inclus nativ",
    rivali: ["Prin aplicații", "Prin pluginuri", "Prin extensii", "Depinde de integrare"],
  },
  {
    criteriu: "Mentenanță și asistență gratuită",
    edinio: "Da",
    rivali: ["X", "X", "X", "X"],
  },
  {
    criteriu: "Configurat din start pentru vânzarea în România",
    edinio: "Da",
    rivali: ["Necesită configurare", "Necesită configurare", "Necesită configurare", "Necesită configurare"],
  },
];

/*
 * ⚠ NOTA DE SUB TABEL A FOST SCOASĂ, la cererea clientului (2026-08-09).
 *
 * Textul era: „Notă: X indică faptul că mentenanța și asistența gratuită, în
 * forma inclusă de Edinio, nu sunt incluse ca beneficiu echivalent în
 * comparație." — adică exact lămurirea care îngusta rândul cu „X" de la o
 * afirmație absolută la una susținută.
 *
 * Rămâne scrisă aici, nu ștearsă din istorie, ca să se știe ce anume s-a scos
 * dacă vreodată cineva întreabă pe ce se sprijină rândul acela.
 *
 * Fără ea, „X" trebuie să-și ducă singur înțelesul, deci nu se mai desenează ca
 * literă, ci ca semn de „neinclus" — vezi `Comparison.tsx`.
 */
