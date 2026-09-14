/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GAZDA LUATA DIN CONFIG NU POATE PARASI DOMENIUL FURNIZORULUI  (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Doi clienti de curierat isi lasau adresa API sa fie suprascrisa dintr-un camp al
 * randului de setari: `posta_config.baza` si `packeta_config.bazaRest`. Amandoua
 * campurile se scriu prin actiuni de server, iar tipul lor TypeScript nu exista la
 * rulare: o chemare HTTP directa poate pune acolo orice.
 *
 * ⚠ CE SE TRIMITE LA GAZDA ACEEA. La Posta, un antet `Authorization: Basic` cu
 * numele si parola comerciantului. La Packeta, parola API chiar in corpul XML. Deci
 * un config injectat nu doar ca ne duce cererea altundeva: ii duce si credentialele.
 *
 * ⚠ SI E O CERERE FACUTA DE SERVERELE NOASTRE, catre o gazda aleasa din baza, al
 * carei raspuns se intoarce comerciantului in textul erorii. Adica si o portita de
 * citire catre orice poate atinge functia, nu doar o scurgere de parola. Depozitul
 * are deja un ajutor calit pentru adresele date de comerciant (`import/ssrf.ts`),
 * folosit la feeduri si imagini; aici lipsea.
 *
 * ═══ ⚠ DE CE UN SINGUR AJUTOR, SI NU CATE O VERIFICARE IN FIECARE CLIENT ═══
 *
 * Doua copii ale aceleiasi reguli se departeaza una de alta la prima schimbare, si
 * atunci un furnizor ramane aparat si celalalt nu, fara ca nimic sa cada.
 *
 * ═══ ⚠ REGULA: ACELASI DOMENIU, NU O LISTA DE GAZDE SCRISA DE MANA ═══
 *
 * Campul exista ca sa se poata arata catre un mediu de TEST al aceluiasi furnizor.
 * O lista de gazde scrisa de mana ar fi cerut sa ghicesc numele acelor medii, iar ce
 * n-as fi ghicit ar fi picat tacut pe productie. Se cere in schimb ca gazda sa fie
 * chiar cea implicita sau o subdomena a aceleiasi radacini.
 *
 * ⚠ Se compara `u.hostname`, NU sirul. `https://awb.posta-romana.ro@atacator.tld`
 * are gazda `atacator.tld`: tot ce sta inaintea lui `@` e nume de utilizator. O
 * verificare pe sir ar fi spus „incepe cu adresa buna" si ar fi trecut-o.
 *
 * ⚠ SI CADEREA E CATRE IMPLICIT, NU O EXCEPTIE. Un rand stricat in baza trebuie sa
 * ne intoarca la purtarea corecta, nu sa opreasca emiterea AWB-ului: altfel o
 * reparatie de securitate ar deveni o cadere de productie.
 *
 * ⚠ MASURAT INAINTE, PE PRODUCTIE (14.09.2026): ZERO magazine au scris vreodata
 * `posta_config.baza` sau `packeta_config.bazaRest`. Niciun comerciant de azi nu-si
 * schimba purtarea. Cine adauga maine un mediu de test sa recitesca randurile astea.
 */

/**
 * Gazda `a` e chiar `b` sau o subdomena a aceleiasi radacini?
 *
 * ⚠ RADACINA SE IA CA ULTIMELE DOUA ETICHETE, si asta e de ajuns AICI, nu oriunde:
 * cele doua adrese implicite sunt `.ro` si `.cz`, amandoua cu TLD de o eticheta.
 * Pentru un `.co.uk` regula ar fi prea larga si ar cere lista publica de sufixe.
 * Cine aduce un furnizor cu asemenea domeniu sa citeasca randul asta intai.
 */
function aceeasiRadacina(gazda: string, implicita: string): boolean {
  const g = gazda.toLowerCase();
  const i = implicita.toLowerCase();
  if (g === i) return true;
  const radacina = i.split(".").slice(-2).join(".");
  return g === radacina || g.endsWith(`.${radacina}`);
}

/**
 * Adresa de baza pe care chiar o folosim: suprascrierea din config daca e
 * ingaduita, altfel cea implicita.
 */
export function gazdaConfigurabila(
  suprascriere: string | null | undefined,
  implicit: string,
): string {
  const brut = String(suprascriere ?? "").trim().replace(/\/+$/, "");
  if (!brut) return implicit;

  let cerut: URL;
  let baza: URL;
  try {
    cerut = new URL(brut);
    baza = new URL(implicit);
  } catch {
    /* Nici macar o adresa: se cade pe implicit, tacut si corect. */
    return implicit;
  }

  /* ⚠ Doar HTTPS: pe `http:` credentialele ar pleca in clar chiar catre gazda buna. */
  if (cerut.protocol !== "https:") return implicit;
  if (!aceeasiRadacina(cerut.hostname, baza.hostname)) return implicit;

  return brut;
}
