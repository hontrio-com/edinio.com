import { createHmac, timingSafeEqual } from "crypto";
import { MB_DOCUMENT, MB_IMAGINE } from "./definitie";
import type { DefinitiePersonalizare } from "./definitie";

/**
 * ═══ PERMISUL DE INCARCARE ═══
 *
 * `/api/upload-customization` e cel mai expus capat din proiect: public, neautentificat, primeste
 * pana la 40 MB pe fisier si SCRIE in depozitul platit — iar ce se scrie nu se sterge niciodata
 * singur. Tot ce cerea pana acum era un `business_id` care sa fie un UUID valid SI un magazin
 * publicat. Adica: oricine ii citea id-ul din pagina oricarui magazin (e in HTML) putea urca
 * fisiere pe factura acelui comerciant, la nesfarsit, in marginea plafoanelor.
 *
 * ═══ ⚠ CE LEAGA PERMISUL, SI DE CE FIECARE ═══
 *
 * - MAGAZINUL: ca pana acum, dar acum nu mai poate fi ales de cel care incarca.
 * - PRODUSUL: fisierele se urca de pe o pagina de produs. Fara el, un id de magazin era o cheie
 *   catre tot depozitul lui.
 * - CAMPUL: numai campurile care CHIAR cer un fisier. Un produs cu un singur camp de text nu mai
 *   e o usa de incarcare.
 * - FELUL CAMPULUI (imagine sau document): asta inchide o gaura pe care ruta si-o marturisea
 *   singura in comentariu. `documente=1` venea de la client, deci oricine cerea plafonul de 40 MB
 *   al documentelor si de pe un camp de imagine, unde plafonul e 10. Acum felul se citeste din
 *   permis, adica din definitia produsului, si clientul nu-l mai poate spune.
 *
 * ═══ ⚠ SI CE INLOCUIESTE: INTEROGAREA CARE CADEA DESCHIS ═══
 *
 * Ruta intreba baza daca magazinul exista si e publicat, si la eroare de baza lasa incarcarea sa
 * treaca („fail open") — dinadins, fiindca alternativa era ca poza sa dispara tacut din formular
 * si omul sa ramana blocat la un camp obligatoriu.
 *
 * Auditul cerea sa devina „fail closed". Ar fi fost mai rau: o clipire a bazei ar fi oprit ATUNCI
 * toate comenzile personalizate din platforma. Permisul face intrebarea inutila — el se emite
 * CHIAR CAND se randeaza pagina produsului, iar pagina aia nu se randeaza pentru un magazin
 * nepublicat ori pentru un produs care nu exista. Deci ruta nu mai intreaba nimic, si n-are cum
 * sa cada nici intr-un fel, nici in celalalt.
 *
 * ⚠ CE NU FACE: nu spune ca omul are dreptul sa comande. Potrivirea adevarata dintre ce s-a urcat
 * si ce cere campul se face tot la COMANDA, in `verificaPersonalizarea`, unde se stie definitia
 * intreaga. Permisul apara DEPOZITUL, nu comanda.
 */

/*
 * ⚠ ACELASI SECRET CA LA `fisiere-private`, si dinadins acelasi.
 *
 * Doua secrete diferite pentru acelasi drum ar insemna ca o desfasurare cu unul pus si altul nu
 * trece pe jumatate: cheile se scriu, permisele nu se verifica. Fiind unul singur, ori merg
 * amandoua, ori niciunul.
 *
 * (Aici scria „acelasi LANT DE REZERVE". Lantul a disparut pe 07.09.2026, si randurile astea au
 * ramas in urma o zi. Ce era adevarat in ele si a ramas adevarat e chiar propozitia de mai sus.)
 */

/**
 * Secretul de semnare al fisierelor cumparatorilor.
 *
 * ═══ ⚠ FARA REZERVE, DIN 07.09.2026 ═══
 *
 * Aici era un lant: `CUSTOMIZATION_FILE_SECRET` sau `SHIPPING_QUOTE_SECRET` sau
 * `SUPABASE_SERVICE_ROLE_KEY`. Criptografic mergea, dar lega trei lucruri care n-au nimic de-a face
 * unul cu altul: cheile fisierelor personale, cotatiile de transport si cheia de serviciu a bazei.
 *
 * Urmarea practica: secretul asta nu se putea roti. Cine ar fi vrut sa-l schimbe ar fi trebuit sa
 * atinga transportul sau cheia de serviciu, adica sa opreasca altceva. Iar un secret care nu se
 * poate roti nu e o masura de securitate, e o speranta.
 *
 * ⚠ E OBLIGATORIU IN PRODUCTIE (vezi `CHEI_OBLIGATORII` din `next.config.ts`), deci o desfasurare
 * fara el se opreste cu numele cheii in jurnal. Aruncarea de mai jos e a doua plasa, pentru cazul
 * in care variabila dispare DUPA o desfasurare reusita.
 *
 * ⚠ SI ARUNCA, nu cade pe sirul gol: cu secret vid HMAC merge mai departe si semnatura tot iese,
 * deci oricine ar fi putut compune o cheie valida fara sa stie nimic.
 */
function secret(): string {
  const s = process.env.CUSTOMIZATION_FILE_SECRET?.trim();
  if (!s) throw new Error("[permis-incarcare] lipseste CUSTOMIZATION_FILE_SECRET");
  return s;
}

/**
 * Cat traieste un permis.
 *
 * ⚠ DOUASPREZECE ORE, si nu din generozitate. Cine comanda un fototapet completeaza formularul in
 * minute — dar lasa fila deschisa peste noapte, cauta pozele in telefon, se intoarce a doua zi
 * dimineata. Un permis de-o ora ar fi picat exact peste omul care si-a facut timp, la un camp
 * OBLIGATORIU, si el n-ar fi inteles de ce. Ce margineste abuzul nu e durata, ci plafoanele
 * durabile ale rutei (80/ora pe IP, 400/ora pe magazin), care raman neatinse.
 */
export const VALABILITATE_MS = 12 * 60 * 60 * 1000;

/** `i` = camp de imagine, `d` = camp de document (PDF). */
export type FelDeCamp = "i" | "d";

/**
 * Un camp de incarcare, asa cum sta in permis.
 *
 * ═══ ⚠ DOUA FORME, SI AMANDOUA SE CITESC ═══
 *
 * Sirul scurt (`"i"`) e forma de la inceput si ramane cea obisnuita: majoritatea campurilor n-au
 * limita proprie, si atunci n-are ce sa se scrie. Forma cu obiect apare numai cand comerciantul a
 * pus o limita sub plafonul global.
 *
 * ⚠ FORMA VECHE TREBUIE SA SE CITEASCA MAI DEPARTE, si nu e politete: permisele traiesc 12 ore.
 * O schimbare care ar fi acceptat doar forma noua ar fi rupt, pentru o jumatate de zi, fiecare
 * fila deschisa in clipa desfasurarii, pe un camp de obicei OBLIGATORIU, deci pe comenzi, nu pe
 * un colt de interfata.
 */
export type CampDeIncarcare = FelDeCamp | { t: FelDeCamp; m: number };

/**
 * Campurile produsului care CHIAR primesc fisiere, cu felul si limita fiecaruia.
 *
 * ⚠ Un produs fara niciun camp de fisier intoarce `{}` — si atunci nu se emite niciun permis, deci
 * pagina lui nu e o usa de incarcare deloc.
 *
 * ═══ ⚠ SI LIMITA COMERCIANTULUI INTRA IN PERMIS ═══
 *
 * `max_file_size_mb` se putea pune in Admin („Logo: cel mult 2 MB") si se respecta numai in
 * browser. Serverul stia doar plafoanele globale, 10 MB la imagini si 40 la documente, deci cine
 * trimitea cererea de mana cerea link pentru 8 MB pe un camp de 2 si trecea. Nu falsifica niciun
 * pret, dar o regula pusa de magazin era, practic, o sugestie.
 *
 * ⚠ SE SEMNEAZA, nu se cere de la client. Trimisa in cerere, limita ar fi fost aleasa chiar de cel
 * pe care il margineste. Aici vine din definitia produsului, citita pe server cand se randeaza
 * pagina.
 *
 * ⚠ SI NU POATE URCA PESTE PLAFONUL GLOBAL. `salvare.ts` refuza deja o limita mai mare, dar
 * definitiile sunt vechi de luni si se pot fi scris si altfel; `Math.min` de la verificare face ca
 * permisul sa nu poata RIDICA niciodata plafonul, doar sa-l coboare.
 */
export function campurileDeIncarcare(
  definitie: DefinitiePersonalizare | null,
): Record<string, CampDeIncarcare> {
  const out: Record<string, CampDeIncarcare> = {};
  for (const c of definitie?.fields ?? []) {
    const fel: FelDeCamp | null = c.type === "image" ? "i" : c.type === "fisier" ? "d" : null;
    if (!fel) continue;
    const mb = c.max_file_size_mb;
    const plafon = fel === "d" ? MB_DOCUMENT : MB_IMAGINE;
    out[c.id] = typeof mb === "number" && Number.isFinite(mb) && mb > 0 && mb < plafon
      ? { t: fel, m: Math.floor(mb * 1024 * 1024) }
      : fel;
  }
  return out;
}

interface Continut {
  b: string;
  p: string;
  c: Record<string, CampDeIncarcare>;
}

function mac(sarcina: string, expira: number): string {
  return createHmac("sha256", secret())
    .update(`permis-incarcare|${sarcina}|${expira}`)
    .digest("base64url");
}

/**
 * Emite permisul. Se cheama DE PE SERVER, cand se randeaza pagina produsului.
 *
 * ⚠ Intoarce `null` cand produsul n-are niciun camp de fisier: un permis emis degeaba ar fi fost o
 * cheie in plus plimbata prin HTML, fara nimic de deschis.
 */
export function semneazaPermisul(
  businessId: string,
  productId: string,
  campuri: Record<string, CampDeIncarcare>,
  expiraLa?: number,
): string | null {
  if (!businessId || !productId || Object.keys(campuri).length === 0) return null;
  const expira = expiraLa ?? Date.now() + VALABILITATE_MS;
  /*
   * ⚠ CHEILE SE SORTEAZA, ca sarcina sa iasa la fel de fiecare data. Ordinea campurilor din
   * definitie o poate schimba comerciantul; o semnatura care depinde de ea ar fi fost valabila si
   * nevalabila pe rand, fara nicio schimbare de inteles.
   */
  const ordonate: Record<string, CampDeIncarcare> = {};
  for (const k of Object.keys(campuri).sort()) ordonate[k] = campuri[k];
  const continut: Continut = { b: businessId, p: productId, c: ordonate };
  const sarcina = Buffer.from(JSON.stringify(continut), "utf8").toString("base64url");
  return `${expira}.${sarcina}.${mac(sarcina, expira)}`;
}

export type Verdict =
  | {
      ok: true;
      businessId: string;
      productId: string;
      document: boolean;
      /**
       * Cati octeti are voie fisierul de pe CAMPUL asta.
       *
       * ⚠ E deja impletit cu plafonul global, deci apelantul nu mai are de ales intre doua numere:
       * un permis nu poate ridica plafonul, doar sa-l coboare. Vezi `campurileDeIncarcare`.
       */
      maxOcteti: number;
    }
  | { ok: false; motiv: "lipsa" | "expirat" | "stricat" | "camp" };

/**
 * Chiar am emis noi permisul asta, si chiar pentru campul asta?
 *
 * ⚠ MOTIVUL IESE AFARA fiindca ecranul are ce face cu el: un permis EXPIRAT nu e un abuz, e o fila
 * lasata deschisa prea mult — si omului trebuie sa i se spuna sa reincarce pagina, nu ca fisierul
 * lui e nevalid. Un singur „nu" pentru toate ar fi trimis exact mesajul gresit celui nevinovat.
 */
export function verificaPermisul(permis: string | null | undefined, campId: string): Verdict {
  if (!permis || !campId) return { ok: false, motiv: "lipsa" };
  const bucati = permis.split(".");
  if (bucati.length !== 3) return { ok: false, motiv: "stricat" };
  const [expiraText, sarcina, semnatura] = bucati;

  const expira = Number(expiraText);
  if (!Number.isFinite(expira)) return { ok: false, motiv: "stricat" };

  /*
   * ⚠ SEMNATURA SE VERIFICA INAINTE DE EXPIRARE, si inainte de a citi sarcina.
   *
   * Altfel un permis inventat, cu o data din viitor si un JSON oarecare, ar fi ajuns sa fie
   * DESPACHETAT — adica `JSON.parse` peste un sir ales de cel care incarca. Nimic din ce nu poarta
   * semnatura noastra nu are voie sa fie citit ca date.
   */
  const asteptat = Buffer.from(mac(sarcina, expira));
  const primit = Buffer.from(semnatura);
  if (asteptat.length !== primit.length) return { ok: false, motiv: "stricat" };
  try {
    if (!timingSafeEqual(asteptat, primit)) return { ok: false, motiv: "stricat" };
  } catch {
    return { ok: false, motiv: "stricat" };
  }

  if (expira < Date.now()) return { ok: false, motiv: "expirat" };

  let continut: Continut;
  try {
    continut = JSON.parse(Buffer.from(sarcina, "base64url").toString("utf8")) as Continut;
  } catch {
    return { ok: false, motiv: "stricat" };
  }
  if (!continut?.b || !continut?.p || !continut?.c) return { ok: false, motiv: "stricat" };

  /*
   * ⚠ SE CITESC AMANDOUA FORMELE: sirul scurt de la inceput, si obiectul cu limita proprie. Vezi
   * `CampDeIncarcare` pentru de ce forma veche nu se poate scoate.
   */
  const camp = continut.c[campId];
  const fel = typeof camp === "string" ? camp : camp?.t;
  if (fel !== "i" && fel !== "d") return { ok: false, motiv: "camp" };

  const plafon = (fel === "d" ? MB_DOCUMENT : MB_IMAGINE) * 1024 * 1024;
  const alCampului = typeof camp === "object" && Number.isFinite(camp.m) && camp.m > 0
    ? camp.m
    : plafon;

  return {
    ok: true,
    businessId: continut.b,
    productId: continut.p,
    document: fel === "d",
    /* ⚠ `min`, ca permisul sa nu poata RIDICA plafonul global, oricat ar scrie in el. */
    maxOcteti: Math.min(alCampului, plafon),
  };
}
