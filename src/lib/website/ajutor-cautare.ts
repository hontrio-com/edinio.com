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
 * douăzeci și patru de ghiduri era în regulă. La 406, pagina `/ajutor` ajunsese să
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
 * 406 de intrări: fiecare literă în plus dintr-o cheie se înmulțește cu 406. Cu
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
 * înrudit. La 406 de ghiduri, „retur” apare în zeci de pași: fără ordonare, primul
 * rezultat ar fi fost la întâmplare.
 */
/**
 * Cât cântărește o potrivire, după UNDE s-a găsit cuvântul.
 *
 * Numerele nu sunt fine, și nici n-au de ce: singurul lucru care contează e
 * ordinea treptelor. Un cuvânt întreg din titlu bate un început de cuvânt din
 * titlu, care bate orice din rezumat, care bate orice din pași.
 */
const CANTAR = { titluIntreg: 100, titluInceput: 60, rezumatIntreg: 25, rezumatInceput: 15, corpIntreg: 8, corpInceput: 4 };

/** Semnele cu înțeles în expresii regulate, scăpate. Interogarea vine de la om. */
function scapa(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cuvintele cu care omul își împachetează întrebarea, fără să spună nimic despre
 * ce caută: „cum”, „vreau”, „unde”, „vad”.
 *
 * ═══ ⚠ DE CE O LISTĂ SCRISĂ DE MÂNĂ, DUPĂ CE TOT FIȘIERUL EVITĂ AȘA CEVA ═══
 *
 * Fiindcă pragul după frecvență NU le poate deosebi, și asta s-a măsurat:
 *
 *   „vad” -> 31 de ghiduri        (din „produsele nu se mai văd”)
 *   „awb” -> tot pe-acolo         (subiectul a zeci de ghiduri)
 *
 * Aceeași frecvență, roluri opuse. La „cum vad comenzile de pe trendyol”,
 * căutarea găsea UN singur ghid, „Cum ștergi definitiv mai multe produse
 * deodată”, fiindcă era singurul care conținea și „vad”, și „comenzile”, și
 * „trendyol”. Regula „toate cuvintele” lucra corect; cuvintele erau greșite.
 *
 * Deosebirea nu e în date, e în limbă: „vad” e un verb de intenție, „awb” e un
 * lucru. Un prag numeric n-are de unde să știe asta, oricât l-aș regla.
 *
 * ⚠ Lista rămâne SCURTĂ și numai cu vorbe de intenție. Nu intră aici substantive
 * și nici nume de funcții din panou, oricât ar fi de dese: dacă „comandă” ar
 * ajunge pe listă, căutarea ar înceta să răspundă la jumătate din întrebări.
 * Cuvintele astea sunt lăsate deoparte, nu interzise: dacă omul scrie NUMAI așa
 * ceva, se folosesc totuși.
 */
const VORBE_DE_INTENTIE = new Set([
  "cum", "ce", "unde", "cand", "care", "cine", "oare",
  "vreau", "vrea", "doresc", "pot", "poti", "poate",
  "fac", "faci", "face", "vad", "vezi", "stiu", "stie",
  "imi", "isi", "sa", "as", "ar", "sunt", "este", "sau", "din", "pentru", "despre",
]);

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
 * ═══ ⚠ POTRIVIREA E LA ÎNCEPUT DE CUVÂNT, NU ORIUNDE ÎN ȘIR ═══
 *
 * Asta a fost măsurat, nu presupus. Prima formă căuta bucata oriunde, cu
 * `includes`, iar rezultatul, pe 406 de ghiduri:
 *
 *   „pas”  -> 356 de ghiduri (90% din centru), fiindcă fiecare zice „a-pas-ă”
 *   „cont” -> 264 (67%), din „conectezi”, „continui”, „conține”, „contact”
 *   „not”  -> 86, din „notificări” dar și din „cunoscut”
 *
 * O căutare care întoarce nouă ghiduri din zece n-a căutat nimic. Acum cuvântul
 * trebuie să ÎNCEAPĂ un cuvânt din text: „pas” mai găsește „pașii”, dar nu mai
 * găsește „apasă”.
 *
 * ⚠ Începutul de cuvânt se păstrează dinadins, nu se cere cuvânt întreg. În
 * românește terminația se schimbă la aproape orice: cine scrie „factur” trebuie
 * să găsească și „factura”, și „facturare”, și „facturi”. Cuvântul întreg doar
 * URCĂ mai sus în listă, nu e o condiție.
 *
 * ═══ ORDINEA REZULTATELOR ═══
 *
 * Se adună cântarul de mai sus peste toate cuvintele scrise. Un ghid cu termenul
 * întreg în titlu ajunge înaintea unuia care îl are ca început de cuvânt în
 * titlu, iar amândouă înaintea unuia care îl pomenește la al patrulea pas.
 */
export function cautaInIndex(index: IntrareIndex[], interogare: string): IntrareIndex[] {
  const cuvinte = faraDiacritice(interogare).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return [];

  /*
    Tiparele se construiesc o dată pentru toată căutarea, nu o dată pe ghid:
    altfel s-ar compila de 406 de ori aceleași expresii pentru fiecare cuvânt.

    ⚠ SE POTRIVEȘTE ȘI CÂND OMUL SCRIE FORMA MAI LUNGĂ.

    Potrivirea pe început de cuvânt merge doar când ce a scris omul e mai scurt
    decât ce e în text: „factur” găsește „facturare”. Pe dos nu mergea, și asta
    se scrie des în românește, cu articolul lipit: cine caută „domeniul” nu
    găsea „domeniu”, iar „comenzile” nu găsea „comenzi”. Măsurat: „cum imi
    conectez domeniul” întorcea ghiduri despre feeduri Meta, fiindcă tocmai
    cuvântul care conta pica.

    Deci, pentru cuvintele de cel puțin șase litere, se încearcă și formele
    retezate cu una sau două litere, până la cinci. Sub atât nu se retează
    nimic: din „cont” ar ieși „con”, care prinde jumătate din centru.
  */
  const tipare = cuvinte.map((c) => {
    const forme = [c];
    if (c.length >= 6) {
      for (let taiat = 1; taiat <= 2 && c.length - taiat >= 5; taiat++) {
        forme.push(c.slice(0, c.length - taiat));
      }
    }
    const alternativa = forme.map(scapa).join("|");
    return {
      cuvant: c,
      inceput: new RegExp(`(?:^|[^a-z0-9])(?:${alternativa})`),
      intreg: new RegExp(`(?:^|[^a-z0-9])${scapa(c)}(?:[^a-z0-9]|$)`),
    };
  });

  /*
    ⚠ CUVINTELE CARE SUNT PESTE TOT NU SE FOLOSESC NICI CA FILTRU, NICI LA PUNCTAJ.

    Omul nu scrie cuvinte-cheie, scrie o întrebare: „cum sterg un produs”, „unde
    vad comenzile”. Cu regula „toate cuvintele trebuie să apară”, fiecare vorbă de
    umplutură devenea o condiție. Măsurat, înainte:

      „cum sterg un produs”  -> primul rezultat era „Cum adaugi un produs nou”,
                                fiindcă „un” elimina ghidurile fără vreun cuvânt
                                care să înceapă cu „un”, iar ghidul de ștergere
                                era printre ele;
      „unde vad comenzile”   -> patru rezultate, cu „Cum conectezi FedEx” pe trei.

    Iar „cum”, care e în aproape fiecare titlu, dădea +100 tuturor deodată, deci
    departajarea rămânea pe seama celorlalte cuvinte oricum.

    Un cuvânt care se potrivește la mai mult de jumătate din centru nu spune nimic
    despre ce caută omul, așa că se lasă deoparte cu totul. Pragul se calculează
    din date, nu dintr-o listă de cuvinte scrisă de mână: dacă mâine textele se
    rescriu, regula se mută singură.

    ⚠ Dacă TOATE cuvintele scrise sunt de umplutură, se folosesc totuși: e mai
    bine să întorci ceva pentru „cum” decât să răspunzi că nu există nimic.
  */
  const PRAG_PREA_DES = index.length * 0.5;
  const potriveste = (t: { inceput: RegExp }, i: IntrareIndex) =>
    t.inceput.test(faraDiacritice(i.t)) ||
    t.inceput.test(faraDiacritice(i.r)) ||
    t.inceput.test(i.w);

  /* De câte ghiduri se lipește fiecare cuvânt. Se calculează o dată. */
  const cate = tipare.map((t) => {
    let n = 0;
    for (const i of index) if (potriveste(t, i)) n++;
    return n;
  });

  /*
    Cuvintele care apar în peste jumătate din centru („cum”, „un”, „de”, „o”) nu
    spun nimic despre ce caută omul, deci nu se folosesc nici ca filtru, nici la
    punctaj. Dacă TOATE sunt așa, se folosesc totuși: e singurul fel în care
    „zzzqqq” întoarce zero, iar „cum” singur întoarce ceva.
  */
  let activi = tipare
    .map((_, k) => k)
    .filter((k) => cate[k] <= PRAG_PREA_DES && !VORBE_DE_INTENTIE.has(tipare[k].cuvant));
  if (activi.length === 0) activi = tipare.map((_, k) => k);

  const treceRandul = (cheiActive: number[]) => {
    const gasite: { i: IntrareIndex; scor: number }[] = [];
    for (const i of index) {
      /* Titlul și rezumatul se caută întregi, nu doar prin cuvintele pliate:
         acolo contează și grupurile de două litere, care din lista de cuvinte
         au fost aruncate. */
      const titlu = faraDiacritice(i.t);
      const rezumat = faraDiacritice(i.r);
      let scor = 0;
      let toate = true;

      for (const k of cheiActive) {
        const t = tipare[k];
        let punct = 0;
        if (t.intreg.test(titlu)) punct = CANTAR.titluIntreg;
        else if (t.inceput.test(titlu)) punct = CANTAR.titluInceput;
        else if (t.intreg.test(rezumat)) punct = CANTAR.rezumatIntreg;
        else if (t.inceput.test(rezumat)) punct = CANTAR.rezumatInceput;
        else if (t.intreg.test(i.w)) punct = CANTAR.corpIntreg;
        else if (t.inceput.test(i.w)) punct = CANTAR.corpInceput;

        if (punct === 0) {
          toate = false;
          break;
        }
        scor += punct;
      }

      if (toate) gasite.push({ i, scor });
    }
    return gasite;
  };

  /*
    ═══ ⚠ SE CERE TOTUL, DAR NU SE RĂSPUNDE CU NIMIC ═══

    Regula „toate cuvintele” e cea corectă cât timp cuvintele sunt despre
    platformă. Se rupe la un cuvânt de conversație care, din întâmplare, apare o
    singură dată undeva: „vreau sa sterg o pagina” întorcea ZERO, deși ghidul
    „Cum ștergi o pagină” există. „vreau” se lipea de exact un ghid, iar cu
    „sterg” nu se mai suprapunea nimic. Regula după frecvență nu-l prindea:
    apărea o dată, deci nu era nici prea des, nici deloc.

    Deci: se încearcă întâi cu tot ce a scris omul, iar dacă nu iese nimic, se
    lasă deoparte un cuvânt și se încearcă din nou.

    ⚠ SE LASĂ DEOPARTE DOAR CUVINTELE LIPITE DE CEL MULT DOUĂ GHIDURI, nu pur și
    simplu cel mai rar. Prima formă zicea „cel mai rar e cel străin de centru”, și
    era greșită: „trendyol” se lipește de 16 ghiduri, „comenzile” de 81, deci la
    „cum vad comenzile de pe trendyol” se arunca tocmai TRENDYOL, iar răspunsul
    ajungea „Cum ștergi definitiv mai multe produse deodată”. Un nume propriu e
    rar fiindcă e precis, nu fiindcă e de umplutură.

    Sub trei ghiduri, un cuvânt nu poate fi subiectul căutării, dar poate fi o
    vorbă care s-a nimerit o dată într-un text. Peste, se ia în serios: dacă nu
    se suprapun, răspunsul cinstit e că nu există niciun ghid despre toate.

    ⚠ Retragerea se face DOAR pe gol. Când căutarea strictă găsește ceva, ea e
    răspunsul; nu se lărgește niciodată o listă care avea deja rezultate.
  */
  const PRAG_DE_UMPLUTURA = 2;
  let rezultate = treceRandul(activi);
  while (rezultate.length === 0 && activi.length > 1) {
    const candidati = activi.filter((k) => cate[k] <= PRAG_DE_UMPLUTURA);
    if (candidati.length === 0) break;
    const celMaiRar = candidati.reduce((a, b) => (cate[a] <= cate[b] ? a : b));
    activi = activi.filter((k) => k !== celMaiRar);
    rezultate = treceRandul(activi);
  }

  return rezultate.sort((a, b) => b.scor - a.scor).map((r) => r.i);
}
