/**
 * Adresele centrului de ajutor și căutarea peste ghiduri.
 *
 * ═══ ⚠ FIȘIERUL ĂSTA NU IMPORTĂ DATELE CENTRULUI ═══
 *
 * Și e singurul lucru care contează la el. Îl folosește `CautareGhiduri`, care e
 * componentă de CLIENT: tot ce ajunge aici prin import ajunge și în pachetul
 * trimis browserului.
 *
 * A fost o vreme altfel. `cautaGhiduri` citea direct `TOATE_GHIDURILE`, iar la
 * douăzeci și patru de ghiduri era în regulă. La 531, pagina `/ajutor` ajunsese să
 * trimită 1,79 MB de JavaScript, dintr-o singură bucată de 1,1 MB care era chiar
 * textul ghidurilor. Se vedea cu ochiul liber: pagina se randa în secunde.
 *
 * Acum funcțiile de aici primesc indexul ca ARGUMENT. Cine îl are îl dă: pe server
 * ruta care îl construiește, în browser componenta care îl aduce. Fișierul rămâne
 * de câteva sute de rânduri, oricâte ghiduri s-ar adăuga.
 */
export const RADACINA = "/ajutor";

/** Adresa fișierului cu indexul de căutare. Vezi `app/indice-ajutor.json/route.ts`. */
export const ADRESA_INDEX = "/indice-ajutor.json";

export function adresaCategorie(slug: string): string {
  return `${RADACINA}/${slug}`;
}

export function adresaGhid(categorieSlug: string, ghidSlug: string): string {
  return `${RADACINA}/${categorieSlug}/${ghidSlug}`;
}

/**
 * Textul fără diacritice și fără majuscule.
 *
 * ⚠ FĂRĂ ASTA, CĂUTAREA E APROAPE INUTILĂ ÎN ROMÂNEȘTE. Aproape nimeni nu scrie cu
 * diacritice într-un câmp de căutare, mai ales de pe telefon: se tastează „livrare
 * gratuita”, „factura”, „retururi”. Ghidurile, în schimb, sunt scrise CU
 * diacritice, fiindcă așa se citesc. Fără potrivirea asta, „gratuita” n-ar găsi
 * „gratuită”, iar omul ar pleca crezând că nu scrie nicăieri.
 *
 * `normalize("NFD")` desparte litera de semnul de deasupra, iar clasa de semne le
 * șterge. Merge și pentru ș/ț scrise cu virgulă, și pentru cele scrise cu sedilă:
 * două coduri diferite pentru aceeași literă, amestecate în orice text care a
 * trecut prin mai multe programe.
 */
export function faraDiacritice(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * O intrare din indexul de căutare.
 *
 * ⚠ NUME DE O LITERĂ, și nu din lene. Indexul e un fișier trimis prin rețea, cu
 * 531 de intrări: fiecare literă în plus dintr-o cheie se înmulțește cu 531. Cu
 * denumiri întregi (`slug`, `categorieSlug`, `cuvinte`) fișierul creștea cu vreo
 * 25 KB fără să spună nimic în plus. Sunt scrise o dată aici și citite din trei
 * locuri.
 */
export interface IntrareIndex {
  /** slug-ul ghidului */
  s: string;
  /** slug-ul categoriei */
  c: string;
  /** titlul categoriei */
  ct: string;
  /** titlul grupului */
  g: string;
  /** titlul ghidului */
  t: string;
  /** rezumatul */
  r: string;
  /** cuvintele după care se caută, deja pliate și fără repetiții */
  w: string;
}

/** Forma minimă de care are nevoie construirea indexului. */
export interface GhidPentruIndex {
  slug: string;
  titlu: string;
  rezumat: string;
  intro?: string;
  nota?: string;
  termeni?: string[];
  pasi: (string | { text: string })[];
  detalii?: { titlu: string; text: string }[];
  categorie: { slug: string; titlu: string };
  grup: string;
}

/**
 * Indexul, construit din ghiduri.
 *
 * ═══ CUVINTE UNICE, NU TEXTUL ÎNTREG ═══
 *
 * Se caută oricum fără diacritice și fără majuscule, deci textul original n-are ce
 * căuta în index. Iar un ghid repetă aceleași cuvinte de zeci de ori („produs”,
 * „apasă”, „Setări”): păstrate o singură dată, textul de căutat scade de la 894 KB
 * la 466. Cu titlurile și rezumatele pentru afișare, fișierul iese 574 KB, adică
 * 149 comprimat.
 *
 * ⚠ Cuvintele de cel mult două litere se aruncă. „la”, „de”, „în”, „ce” apar în
 * fiecare ghid, deci nu deosebesc nimic, dar ocupă.
 */
export function construiesteIndex(ghiduri: GhidPentruIndex[]): IntrareIndex[] {
  return ghiduri.map((g) => {
    const bucati = [
      g.titlu,
      g.rezumat,
      g.intro ?? "",
      g.nota ?? "",
      g.categorie.titlu,
      g.grup,
      ...(g.termeni ?? []),
      ...g.pasi.map((p) => (typeof p === "string" ? p : p.text)),
      ...(g.detalii ?? []).flatMap((d) => [d.titlu, d.text]),
    ];
    const cuvinte = new Set(
      faraDiacritice(bucati.join(" "))
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2),
    );
    return {
      s: g.slug,
      c: g.categorie.slug,
      ct: g.categorie.titlu,
      g: g.grup,
      t: g.titlu,
      r: g.rezumat,
      w: [...cuvinte].sort().join(" "),
    };
  });
}

/**
 * Ghidurile care se potrivesc cu ce a scris omul.
 *
 * ═══ TOATE CUVINTELE, NU MĂCAR UNUL ═══
 *
 * Cine scrie „livrare gratuita” vrea ghidul care le conține pe amândouă. Cu „măcar
 * un cuvânt”, căutarea ar fi întors și tot ce pomenește „gratuit”, adică aproape
 * tot, iar o listă care nu se scurtează când adaugi cuvinte nu se simte a căutare,
 * ci a defecțiune.
 *
 * ⚠ Se caută pe BUCĂȚI de cuvânt, nu pe cuvinte întregi: „factur” trebuie să
 * găsească și „factura”, și „facturare”, și „facturi”. În românește terminațiile se
 * schimbă la aproape orice cuvânt, iar potrivirea pe cuvânt întreg ar rata exact
 * interogările scurte, scrise repede.
 *
 * ═══ ORDINEA REZULTATELOR ═══
 *
 * Potrivirile din TITLU urcă primele. Un ghid al cărui titlu conține ce ai scris e
 * aproape sigur ăla; unul care pomenește cuvântul la al patrulea pas e, cel mult,
 * înrudit. La 531 de ghiduri, „retur” apare în zeci de pași: fără ordonare, primul
 * rezultat ar fi fost la întâmplare.
 */
export function cautaInIndex(index: IntrareIndex[], interogare: string): IntrareIndex[] {
  const cuvinte = faraDiacritice(interogare).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return [];

  const gasite = index.filter((i) => {
    /* Titlul și rezumatul se caută întregi, nu doar prin cuvintele pliate: acolo
       contează și grupurile de două litere, iar potrivirea pe bucată trebuie să
       prindă și o terminație care în lista de cuvinte a fost tăiată. */
    const tot = `${i.w} ${faraDiacritice(i.t)} ${faraDiacritice(i.r)}`;
    return cuvinte.every((c) => tot.includes(c));
  });

  return gasite
    .map((i) => {
      const titlu = faraDiacritice(i.t);
      return { i, inTitlu: cuvinte.filter((c) => titlu.includes(c)).length };
    })
    .sort((a, b) => b.inTitlu - a.inTitlu)
    .map((r) => r.i);
}
