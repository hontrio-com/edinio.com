/**
 * Piesele consumate de o configuratie: cate sunt, ce costa, si din ce stoc ies.
 *
 * ═══ ⚠ CE SE INTAMPLA CAND NU LE CITESTE NIMENI ═══
 *
 * `Optiune.componenta` se parsa (`citeste.ts`), se pastreaza la compilare (`compileaza.ts`) —
 * si atat. `validare.ts` n-o verifica, iar pasul 6 din `pret.ts` primea `componente` de la un
 * apelant care nu exista: `raspuns.ts` chema `calculeazaPretul` FARA el. Deci o optiune care
 * consuma patru balamale nu costa nimic si nu scadea nimic. Comerciantul completa campul, il
 * vedea salvat, si vindea balamalele pe gratis pana cand le termina din depozit — fara nicio
 * eroare nicaieri.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ HOTARAREA: COMPONENTA E UN RAND NOU CARE ARATA CATRE UN PRODUS OBISNUIT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Adica AMANDOUA, si fiecare pentru partea pe care o duce cel mai bine:
 *
 *   - IDENTITATEA, PRETUL SI COSTUL stau intr-un rand nou, in `configurator_componente`;
 *   - STOCUL nu e al ei. E stocul unui produs obisnuit, prin `product_id`.
 *
 * DE CE NU UN TABEL CU STOC PROPRIU. Trei lucruri masurate in proiect, nu presupuse:
 *
 *   1. `orders.stoc_rezervat` are EXACT DOUA CHEI — `produse` si `variante` — si TREI functii
 *      din baza o REscriu intreaga cu `jsonb_build_object('produse', …, 'variante', …)`:
 *      `adauga_stoc_rezervat`, `ajusteaza_stoc_comanda_marketplace` si actualizarea comenzii.
 *      O a treia cheie `componente` ar fi fost stearsa TACUT la prima editare de comanda sau la
 *      prima potrivire de marketplace — iar la anulare piesele nu s-ar mai fi intors niciodata
 *      pe raft, fiindca nimeni n-ar mai fi stiut ca au plecat.
 *
 *   2. Rezervarea e o SINGURA instructiune atomica, `revendica_stoc_complet`, si isi ia lacatele
 *      pe `products` intr-o ordine scrisa. Un al doilea fel de stoc ar fi cerut a doua
 *      instructiune, cu a doua ordine de lacate: fie interblocare, fie o fereastra intre ele in
 *      care se vinde ce nu mai e.
 *
 *   3. Proiectul a raspuns deja o data la aceeasi intrebare, si tot asa: PACHETELE.
 *      `expandBundleStock` desface un pachet in PRODUSELE lui si le adauga la `decrements`.
 *      Zero masinarie noua. Componentele intra pe chiar drumul acela.
 *
 * CE S-AR FI PIERDUT PE CEALALTA CALE — componenta = de-a dreptul un `products.id`, fara tabel:
 *
 *   - COSTUL INTERN n-ar fi avut unde sta. `products` n-are coloana de cost, iar `price` e
 *     pretul PUBLIC de raft. `compileaza.ts` scrie negru pe alb ca „costul intern e date de
 *     afacere ale comerciantului” si ca nu pleaca la vitrina — o promisiune fara loc unde sa fie
 *     tinuta e mai rea decat una nescrisa.
 *   - PRETUL PIESEI ar fi fost silit sa fie pretul de raft. O balama vanduta la bucata cu 9 lei
 *     nu costa 9 lei consumata in cadrul unei usi, si comerciantul n-ar fi avut cum sa spuna
 *     asta decat inventand un al doilea produs.
 *   - O componenta care NU se tine pe stoc (o manopera, un consumabil socotit la litru) ar fi
 *     cerut un produs fantoma in catalog, cu `is_active = false`, care apare in import, in
 *     feeduri si in cautarea din panou.
 *
 * ═══ ⚠ PRETUL SE SOCOTESTE PE AMANDOUA PARTILE, DAR SE HOTARASTE PE SERVER ═══
 *
 * `configurator_componente` n-are nicio politica publica: in acelasi rand cu `pret_bucata` sta
 * `cost_bucata`, adica exact cat plateste comerciantul pe piesa la furnizor. Tabelul nu pleaca
 * la browser, si nici nu se intreaba serverul la fiecare tasta.
 *
 * Se face ce face tot restul configuratorului: SE INGHEATA LA PUBLICARE. `compileaza` rezolva o
 * singura data, pe server, fiecare `componenta.id` in `{ produsId, pretBucata, nume }` si le
 * scrie in versiune. Din rand pleaca numai ce PLATESTE cumparatorul; `cost_bucata` nu ajunge
 * nicaieri, niciodata.
 *
 * Asa amandoua partile socotesc din ACELASI instantaneu si dau acelasi numar — regula scrisa in
 * antetul lui `raspuns.ts` — fara ca browserul sa afle nici ce plateste comerciantul pe piesa,
 * nici din ce produs iese ea pe raft mai mult decat ii trebuie ca sa arate „mai sunt 3”.
 *
 * ⚠ Si de aceea o versiune PUBLICATA nu se schimba cand comerciantul urca pretul piesei: ea
 * poarta pretul de la data publicarii. Aceeasi hotarare ca la etichete si la greutate, si din
 * acelasi motiv — versiunile sunt imutabile, comanda trebuie sa se poata citi si peste un an.
 */

import type { Compilat } from "./compileaza";
import {
  areOptiuni, optiuneaDupaId, toateNodurile,
  type Definitie, type Nod, type Optiune,
} from "./definitie";
import type { LinieDescompunere } from "./pret";
import { aplicaRegulile, esteAscuns, type Stare } from "./reguli";
import { eNumarBun } from "./unitati";
import { normalizeazaValori, type Valori } from "./valori";

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFOANE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cate bucati poate consuma o singura optiune.
 *
 * ⚠ Nu e o cochetarie. Numarul ajunge inmultit cu cantitatea liniei intr-un `quantity` pe care
 * `revendica_stoc_complet` il trece prin `(i->>'quantity')::int`. Un `int4` din Postgres se
 * opreste la 2.147.483.647, iar peste el instructiunea NU scade prea mult — CADE, si cade
 * intreaga plasare de comanda, cu tot cu liniile bune de langa.
 */
export const MAX_BUCATI_PE_OPTIUNE = 100_000;

/** Cate bucati poate cere in total o linie de comanda, dupa inmultirea cu cantitatea. */
export const MAX_BUCATI_PE_LINIE = 1_000_000;

/* ═══════════════════════════════════════════════════════════════════════════
   CE IESE
   ═══════════════════════════════════════════════════════════════════════════ */

/** O piesa si cat se consuma din ea, PENTRU O BUCATA de produs configurat. */
export interface BucataConsumata {
  /** Id-ul randului din `configurator_componente`. */
  id: string;
  /** Cate bucati, insumate peste toate optiunile alese care cer aceeasi piesa. */
  bucati: number;
  /**
   * Produsul al carui stoc E stocul piesei. Se scrie la PUBLICARE.
   *
   * Lipsa inseamna „piesa nu se tine pe stoc” — costa, dar nu scade nimic.
   */
  produsId?: string;
  /** Cat plateste CUMPARATORUL pe bucata. Se scrie la PUBLICARE, din `pret_bucata`. */
  pretBucata?: number;
  /** Numele piesei la data publicarii, pentru linia din descompunere. */
  nume?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITIREA DEFENSIVA A CAMPULUI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `componenta` a unei optiuni, citita fara sa se creada nimic.
 *
 * ⚠ `citesteCompilat` intoarce `o.definitie as Definitie`, adica un CAST, nu o parsare: ce sta
 * in `configurator_versiuni.compilat` a fost scris de codul de acum, dar putea fi scris si de
 * unul mai vechi, si putea fi atins dintr-o consola. Crezut pe cuvant, un `bucati` de tip sir ar
 * fi ajuns inmultit cu cantitatea si de acolo in `::int`.
 */
function componentaOptiunii(o: Optiune): BucataConsumata | null {
  const c = (o as { componenta?: unknown }).componenta;
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const r = c as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;

  const bucati = eNumarBun(r.bucati) ? r.bucati : 0;
  if (bucati <= 0) return null;

  const out: BucataConsumata = { id, bucati: Math.min(bucati, MAX_BUCATI_PE_OPTIUNE) };

  const produsId = typeof r.produsId === "string" ? r.produsId.trim() : "";
  if (produsId) out.produsId = produsId;

  /*
   * ⚠ Numai pretul POZITIV se ia in seama, si e aceeasi hotarare ca la `grame` in `greutate.ts`.
   * Un pret negativ pe piesa ar fi insemnat ca cine consuma din depozit primeste bani inapoi:
   * cumparatorul ar fi ales optiunea cea mai scumpa pentru noi ca sa-si ieftineasca comanda, si
   * cu cat mai multe bucati, cu atat mai ieftin.
   */
  if (eNumarBun(r.pretBucata) && r.pretBucata >= 0) out.pretBucata = r.pretBucata;

  const nume = typeof r.nume === "string" ? r.nume.trim().slice(0, 200) : "";
  if (nume) out.nume = nume;

  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSUMUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce piese consuma configuratia, PER BUCATA de produs.
 *
 * ⚠ Nu arunca niciodata. O configuratie venita de la client, un compilat vechi sau un rand
 * editat de mana n-au voie sa doboare nici pagina de produs, nici plasarea unei comenzi.
 */
export function consumulConfiguratiei(compilat: Compilat | undefined, brut: unknown): BucataConsumata[] {
  const definitie = compilat?.definitie;
  if (!definitie) return [];
  const stare = aplicaRegulile(definitie, compilat?.reguli ?? [], normalizeazaValori(brut));
  return consumulPeStare(definitie, stare);
}

/**
 * Acelasi consum, pornit de la starea pe care a asezat-o deja motorul de reguli.
 *
 * ═══ ⚠ ACEEASI STARE CA PRETUL, NU O SOCOTEALA PARALELA ═══
 *
 * Un camp ascuns de reguli nu plateste (`pret.ts`, pasul 3) si nu cantareste (`greutate.ts`) —
 * si atunci nu are voie nici sa consume. Socotite pe multimi diferite, cele doua ar fi divergit
 * la prima regula noua, iar divergenta s-ar fi vazut ca „balamalele scad din depozit pentru o
 * usa pe care nimeni n-a comandat-o”: piesele ar fi plecat de pe raft fara sa fie nici platite,
 * nici montate.
 *
 * Se trece deci prin CHIAR `aplicaRegulile`, si se sare peste noduri cu CHIAR `esteAscuns`.
 */
export function consumulPeStare(definitie: Definitie, stare: Stare): BucataConsumata[] {
  /*
   * ⚠ Se INSUMEAZA pe componenta, nu se pun doua randuri.
   *
   * Doua optiuni de pe noduri diferite pot cere aceeasi piesa („manere: doua” si „balamale
   * suplimentare: doua”). Lasate ca doua randuri, scaderea ar fi trimis doua intrari pentru
   * acelasi produs — pe care baza le insumeaza oricum — dar linia din descompunerea de pret ar
   * fi aparut de doua ori pe ecran, cu acelasi nume, si nimeni n-ar fi stiut care e care.
   */
  const insumate = new Map<string, BucataConsumata>();

  for (const nod of toateNodurile(definitie)) {
    if (!areOptiuni(nod)) continue;
    /*
     * ⚠ Se verifica si aici, desi `aplicaRegulile` goleste valorile campurilor ascunse — exact
     * ca la pret si la greutate. Consumul nu are voie sa depinde de faptul ca altcineva a golit
     * valorile inainte: cine aduce o stare de aiurea primeste tot raspunsul corect.
     */
    if (esteAscuns(definitie, stare, nod.id)) continue;

    for (const o of optiunileAlese(nod, stare.valori)) {
      const c = componentaOptiunii(o);
      if (!c) continue;
      const deja = insumate.get(c.id);
      if (!deja) { insumate.set(c.id, { ...c }); continue; }
      const total = deja.bucati + c.bucati;
      deja.bucati = eNumarBun(total) ? Math.min(total, MAX_BUCATI_PE_LINIE) : deja.bucati;
      /*
       * Ce s-a inghetat la publicare e acelasi pentru toate optiunile care trimit la aceeasi
       * piesa — `compileaza` le completeaza dintr-o singura harta. Se pastreaza totusi PRIMUL
       * gasit, ca doua randuri scrise de mana sa nu poata schimba raspunsul dupa ordinea
       * nodurilor.
       */
      if (deja.produsId === undefined && c.produsId !== undefined) deja.produsId = c.produsId;
      if (deja.pretBucata === undefined && c.pretBucata !== undefined) deja.pretBucata = c.pretBucata;
      if (deja.nume === undefined && c.nume !== undefined) deja.nume = c.nume;
    }
  }

  return [...insumate.values()];
}

/**
 * Optiunile alese pe un nod.
 *
 * ⚠ Scrisa aici, nu imprumutata din `pret.ts` sau din `greutate.ts`: acolo sunt functii private,
 * iar exportata una ar fi legat trei module care trebuie sa se poata schimba separat. Regula e
 * insa aceeasi, si probele o tin lipita de purtarea pretului.
 */
function optiunileAlese(nod: Nod, valori: Valori): Optiune[] {
  if (!areOptiuni(nod)) return [];
  const v = valori[nod.id];
  const ids = v?.f === "alegere" ? [v.v] : v?.f === "alegeri" ? v.v : [];
  return ids.map((id) => optiuneaDupaId(nod, id)).filter((o): o is Optiune => !!o);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PASUL 6 DIN PRET
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce costa piesele consumate, gata de dat lui `calculeazaPretul` ca pasul 6.
 *
 * ⚠ O piesa FARA `pretBucata` nu adauga nimic, si nu e o scapare: ori comerciantul n-a pus pret
 * pe ea (piesa intra in pretul optiunii, prin `Optiune.pret`), ori versiunea a fost publicata
 * inainte sa existe fisierul asta. Amandoua inseamna „nu se plateste separat” — iar cazut pe un
 * pret ghicit, pasul 6 ar fi scumpit tacit comenzi publicate demult.
 */
export function costulComponentelor(consum: BucataConsumata[]): LinieDescompunere[] {
  const linii: LinieDescompunere[] = [];
  for (const c of consum) {
    if (c.pretBucata === undefined) continue;
    const suma = c.bucati * c.pretBucata;
    if (!eNumarBun(suma) || suma === 0) continue;
    linii.push({ id: c.id, eticheta: c.nume ?? c.id, suma });
  }
  return linii;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCADEREA DIN STOC
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Piesele consumate de o LINIE, in forma pe care o asteapta drumul de stoc al comenzii.
 *
 * ═══ ⚠ NU E O A DOUA CALE DE SCADERE, E ACEEASI ═══
 *
 * Ce iese de aici se contopeste cu `decrements` — lista pe care o duce mai departe fiecare cale
 * de comanda. De acolo incolo totul e drumul care exista deja: `revendica_stoc_complet` verifica
 * si scade atomic, `stocRezervat` scrie sub cheia `produse`, `elibereaza_stoc_comanda` da inapoi
 * la anulare. Nicio functie noua in baza, nicio cheie noua pe comanda — si tocmai de aceea cele
 * trei functii din baza care REscriu `stoc_rezervat` cu exact doua chei n-au ce sterge.
 *
 * ⚠ SE ROTUNJESTE IN SUS, NU IN JOS.
 *
 * `bucati` are voie sa fie fractionar (0,25 dintr-un tub de silicon). Din depozit nu iese insa
 * un sfert de tub: iese unul intreg. Rotunjit in jos, patru usi ar fi consumat ZERO tuburi, iar
 * depozitul ar fi ramas fara ele fara ca vreo comanda sa arate ca le-a luat. Si mai e un motiv
 * mecanic: `revendica_stoc_complet` face `(i->>'quantity')::int`, iar Postgres NU accepta „0.25”
 * acolo — cade intreaga instructiune, deci intreaga comanda.
 */
export function decrementeleComponentelor(
  consum: BucataConsumata[],
  cantitate: number,
): { product_id: string; quantity: number }[] {
  const bucatiLinie = eNumarBun(cantitate) ? Math.max(1, Math.floor(cantitate)) : 1;
  const pePr = new Map<string, number>();

  for (const c of consum) {
    if (!c.produsId) continue;
    const brut = c.bucati * bucatiLinie;
    if (!eNumarBun(brut) || brut <= 0) continue;
    const cerut = Math.min(Math.ceil(brut), MAX_BUCATI_PE_LINIE);
    pePr.set(c.produsId, (pePr.get(c.produsId) ?? 0) + cerut);
  }

  return [...pePr.entries()]
    .map(([product_id, quantity]) => ({ product_id, quantity: Math.min(quantity, MAX_BUCATI_PE_LINIE) }))
    .filter((x) => x.quantity > 0);
}

/**
 * Piesele se adauga la scaderile comenzii, un singur rand pe produs.
 *
 * ═══ ⚠ DE CE NU PRIN `expandBundleStock`, UNDE INTRA COMPONENTELE UNUI PACHET ═══
 *
 * Fiindca aceea REFUZA comanda cand produsul nu e `is_active` — si asta e purtarea buna pentru
 * un pachet, dar exact pe dos pentru o piesa. Balamaua, tubul de silicon si ora de manopera se
 * tin STINSE dinadins: sunt randuri de stoc, nu marfa de raft. Trecute pe acolo, fiecare comanda
 * cu o usa configurata ar fi fost oprita cu „Un produs din pachet nu mai este disponibil. Scoate
 * pachetul din cos” — un mesaj despre un pachet care nu exista, pe o comanda perfect buna, si
 * niciun magazin n-ar fi putut vinde nimic configurat.
 *
 * ⚠ NU SE PIERDE NICIO APARARE IMPOTRIVA SUPRAVANZARII. `revendica_stoc_complet` insumeaza el
 * insusi pe produs (`group by`), verifica sub acelasi lacat sub care scade, si refuza cu numele
 * si cu cate au mai ramas. Iar cand aceeasi balama e si vanduta la bucata, si consumata de o
 * configuratie in aceeasi comanda, randurile de mai jos sunt deja adunate, deci nu se poate lua
 * de doua ori.
 *
 * ⚠ DAR NUMELE CU CARE REFUZA E AL PRODUSULUI ASCUNS, si mesajul lui de-a gata suna „„Balama
 * Blum 110” tocmai s-a epuizat. Scoate-l din cos” — despre ceva ce cumparatorul n-are in cos si
 * n-are cum sa scoata, cu numele intern al unui rand de stoc pe care comerciantul il tine
 * stins dinadins. De aceea trece pe langa `numelePieselor` (mai jos), care spune care produse
 * sunt PIESE, si `mesajRefuzStoc` scrie atunci o propozitie pe care omul o poate urma.
 *
 * ⚠ CE SE PIERDE, si e scris ca sa nu fie luat drept intamplare: daca produsul unei piese e
 * STERS dupa publicare, versiunea publicata mai cere id-ul lui, iar `revendica_stoc_complet` sare
 * peste un rand care nu mai exista. Piesa nu mai scade nimic, tacut. Nu se vinde nimic ce nu
 * exista — se pierde doar vederea corecta a raftului — si e chiar purtarea pe care o are azi
 * orice produs cu `track_inventory` stins.
 */
export function contopesteConsumul(
  decremente: readonly { product_id: string; quantity: number }[],
  consum: readonly { product_id: string; quantity: number }[],
): { product_id: string; quantity: number }[] {
  const pePr = new Map<string, number>();
  const ordine: string[] = [];
  for (const d of [...decremente, ...consum]) {
    if (!d?.product_id) continue;
    const q = eNumarBun(d.quantity) ? Math.max(0, Math.floor(d.quantity)) : 0;
    if (q <= 0) continue;
    if (!pePr.has(d.product_id)) ordine.push(d.product_id);
    pePr.set(d.product_id, Math.min((pePr.get(d.product_id) ?? 0) + q, MAX_BUCATI_PE_LINIE));
  }
  return ordine.map((product_id) => ({ product_id, quantity: pePr.get(product_id)! }));
}

/**
 * Care dintre produsele cerute sunt PIESE, si cum se numesc pentru cumparator.
 *
 * ⚠ SE SCOT CELE CARE SUNT SI MARFA DIN COS. Aceeasi balama poate fi si vanduta la bucata, si
 * consumata de o usa configurata, in aceeasi comanda. Atunci „scoate-o din cos" chiar are inteles,
 * deci ramane pe mesajul de produs; piesa e o explicatie in plus doar cand omul NU are de unde
 * sti despre ce i se vorbeste.
 *
 * ⚠ Numele care iese e cel INGHETAT LA PUBLICARE (`BucataConsumata.nume`), nu `products.name`.
 * Al doilea e date interne ale comerciantului si nu se arata nimanui; primul apare oricum in
 * descompunerea de pret pe care cumparatorul o vede inainte sa plateasca. O piesa fara nume intra
 * totusi in lista, cu sirul gol: important e sa NU cada pe mesajul de produs, nu sa aiba nume.
 */
export function numelePieselor(
  liniiDeCos: readonly { product_id?: string | null }[],
  consum: readonly BucataConsumata[],
): Map<string, string> {
  const aleCosului = new Set(liniiDeCos.map((l) => l?.product_id).filter((x): x is string => !!x));
  const out = new Map<string, string>();
  for (const b of consum) {
    const id = b?.produsId;
    if (!id || aleCosului.has(id)) continue;
    const nume = typeof b.nume === "string" ? b.nume.trim().slice(0, 60) : "";
    // Prima aparitie cu nume castiga: doua optiuni pot trimite la aceeasi piesa.
    if (!out.get(id)) out.set(id, nume);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE CERE DEFINITIA
   ═══════════════════════════════════════════════════════════════════════════ */

/** O trimitere de la o optiune catre o piesa, cu tot cu locul de unde pleaca. */
export interface TrimitereLaComponenta {
  nodId: string;
  nodEticheta: string;
  optiuneEticheta: string;
  componentaId: string;
}

/**
 * Fiecare loc din definitie care cere o piesa.
 *
 * ⚠ SI OPTIUNILE STINSE. O optiune stinsa se pastreaza pentru comenzile vechi, dar poate fi
 * reaprinsa oricand dintr-un singur clic — iar atunci nimeni nu mai valideaza nimic. Un id care
 * nu exista e o greseala a comerciantului in amandoua cazurile, si singurul moment in care mai e
 * ieftin de reparat e inainte de publicare.
 *
 * Iese cu locul, nu doar cu id-ul, fiindca validatorul trebuie sa poata spune COMERCIANTULUI
 * unde sa se uite: „componenta de la «Balamale» din «Feronerie»”, nu un uuid singur pe ecran.
 */
export function trimiterileLaComponente(d: Definitie): TrimitereLaComponenta[] {
  const out: TrimitereLaComponenta[] = [];
  for (const nod of toateNodurile(d)) {
    if (!areOptiuni(nod)) continue;
    for (const o of nod.optiuni ?? []) {
      const c = componentaOptiunii(o);
      if (!c) continue;
      out.push({
        nodId: nod.id,
        nodEticheta: nod.eticheta,
        optiuneEticheta: o.eticheta,
        componentaId: c.id,
      });
    }
  }
  return out;
}

/** Toate id-urile de componenta la care trimite definitia, o singura data fiecare. */
export function componenteleCerute(d: Definitie): string[] {
  return [...new Set(trimiterileLaComponente(d).map((t) => t.componentaId))];
}

/**
 * O optiune are un `componenta` scris, dar STRICAT?
 *
 * ⚠ Deosebirea fata de `componentaOptiunii` e chiar rostul functiei: aceea ARUNCA in tacere ce
 * nu se incadreaza, fiindca asa se citeste `jsonb` peste tot in proiect. Aruncat tacut, insa,
 * comerciantul care scrie „doua” in loc de „2” vede campul salvat, publica, si piesele nu se
 * scad niciodata — fara nicio eroare nicaieri. Validatorul e singurul loc unde tacerea aia se
 * poate transforma intr-o propozitie pe ecranul lui.
 */
export function componentaEStricata(o: Optiune): boolean {
  const c = (o as { componenta?: unknown }).componenta;
  if (c === undefined || c === null) return false;
  return componentaOptiunii(o) === null;
}
