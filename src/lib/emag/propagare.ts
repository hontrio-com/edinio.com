/**
 * Propagarea setarilor de magazin catre ofertele deja publicate.
 *
 * ═══ ⚠ DE CE EXISTA UN FISIER PENTRU ASTA ═══
 *
 * Cateva setari ale magazinului (`green_tax`, `supply_lead_time`, GPSR, `vat_id`,
 * `handling_time`, `stoc_rezervat`) nu sunt decor: pleaca spre eMAG in chiar incarcaturile
 * ofertelor. Schimbate dupa publicare, nu ajung acolo singure — nu sunt in amprenta de
 * continut a produsului si nu sunt in deriva. Deci trebuie impinse anume.
 *
 * Pana acum impingerea se facea o singura data, in `dupaRaspuns`, la salvare. Asta lasa o
 * gaura care nu se putea inchide de nicaieri:
 *
 *   ⚠ DACA INSTANTA MOARE INTRE SALVARE SI PUNEREA IN COADA, INTENTIA SE PIERDE FARA URMA.
 *
 * Si nu e o pierdere pe care s-o repare altcineva mai tarziu. Plasa de schimbari neplecate
 * (`produse_nesincronizate_emag`) compara AMPRENTA DE CONTINUT a produsului. O setare de
 * magazin nu schimba nicio amprenta, deci plasa nu vede nimic — si asa trebuie sa fie, ea
 * repara ce s-a stricat, nu porneste ce n-a fost cerut. Nimic nu recupereaza asta vreodata.
 * Iar pe ecran scrie deja „Datele pleaca la ofertele tale in cateva minute”.
 *
 * ═══ ⚠ CUM SE INCHIDE, FARA TABEL NOU ═══
 *
 * Intentia calatoreste in CHIAR peticul care duce datele. `patchEmagConfig` merge printr-o
 * singura instructiune Postgres (`jsonb_merge_config`), deci `propagare_ceruta_la` devine
 * durabil in aceeasi clipa cu `green_tax`-ul care l-a cerut. Nu exista fereastra intre ele:
 * ori s-au scris amandoua, ori niciunul.
 *
 * Apoi doua brate, amandoua chemand FUNCTIA ASTA:
 *   - `dupaRaspuns`, la salvare, ca sa mearga repede in cazul obisnuit;
 *   - cronul, care ridica ce-a ramas neterminat.
 *
 * ⚠ SI ANUME UN SINGUR LOC. Doua copii ale aceleiasi puneri in coada se departeaza mai
 * devreme sau mai tarziu — chiar lectia scrisa in antetul lui `config.ts`, unde departarea
 * insemna un magazin deconectat fara ca nimeni sa fi atins butonul.
 *
 * ⚠ REPETAREA E NEVINOVATA: `emag_sync_queue` are `unique (business_id, offer_id, op)`,
 * deci o a doua punere in coada nu face nimic. De-aia bratul lent nu trebuie sa se
 * fereasca de cel iute.
 *
 * ═══ ⚠ CE ACOPERA SI CE NU ═══
 *
 * ACOPERA: moartea instantei intre salvare si punerea in coada, si citirea catalogului
 * picata — `fetchAllRowsStrict` chiar arunca, deci marcajul ramane nepus si cronul reia.
 *
 * NU ACOPERA: o punere in coada picata. `enqueueMany` isi inghite eroarea si intoarce 0,
 * la fel ca atunci cand n-are ce pune, iar contractul lui e al multor chematori. Deci
 * cazul asta nu se REPARA singur — dar se SPUNE, cu un rand care numeste a cui intentie
 * era, nu doar ca a picat o coada. Vezi `propagaSetarile`.
 *
 * ⚠ Si numai ruta grea ramane chiar descoperita: pretul si stocul le repara deriva.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import { enqueueEmagStrict } from "./queue";
import type { EmagConfig } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export type OpPropagare = "oferta" | "pret" | "stoc";

/**
 * ⚠ `oferta` duce si pretul, si stocul, deci e cea mai grea si le acopera pe celelalte.
 * Ordinea asta e singurul lucru care hotaraste cine castiga la doua cereri suprapuse.
 */
const GREUTATE: Record<OpPropagare, number> = { stoc: 1, pret: 2, oferta: 3 };

/**
 * Care dintre doua operatii o acopera pe cealalta.
 *
 * ⚠ CONTEAZA LA DOUA SALVARI APROPIATE. Comerciantul schimba `green_tax` (cere `oferta`),
 * iar inainte ca propagarea sa apuce sa plece schimba `stoc_rezervat` (cere `stoc`). Daca
 * a doua cerere ar inlocui-o pe prima, taxa verde n-ar mai pleca NICIODATA — si asta e
 * exact paguba pe care o vanam: tacuta, si vizibila abia la contabilitate.
 */
export function opulMaiGreu(a: OpPropagare | null | undefined, b: OpPropagare): OpPropagare {
  if (!a) return b;
  return GREUTATE[a] >= GREUTATE[b] ? a : b;
}

/**
 * Peticul care face intentia durabila. Se IMBINA in peticul cu datele, nu se scrie separat.
 *
 * ⚠ Scris separat, ar fi a doua scriere — si atunci ar exista iar o fereastra intre date si
 * intentie, adica tocmai lucrul reparat aici.
 */
export function peticDeIntentie(
  vechi: EmagConfig | null | undefined,
  op: OpPropagare,
  acum: string,
): Partial<EmagConfig> {
  /* ⚠ „In asteptare" inseamna simplu ca CHEIA E ACOLO: `emag_stinge_propagarea` o sterge la
     terminare. De-aia nu se compara doua marcaje — starea „dus la capat, dar cu cheia inca
     pusa" nu mai exista, si un rand terminat nici nu mai trece de filtrul din PostgREST. */
  const inAsteptare = !!vechi?.propagare_ceruta_la;

  return {
    propagare_ceruta_la: acum,
    propagare_op: opulMaiGreu(inAsteptare ? (vechi?.propagare_op ?? null) : null, op),
  };
}

/**
 * Stinge intentia — dar NUMAI daca e chiar cea servita.
 *
 * ⚠ COMPARE-AND-SET, IN POSTGRES, si nu o scriere obisnuita. Intre clipa in care s-a citit
 * intentia si clipa stingerii poate veni o cerere noua de la comerciant. Stinsa orbeste, a
 * doua lui schimbare n-ar mai pleca NICIODATA. Comparatia si scrierea stau sub acelasi
 * `for update` ca `jsonb_merge_config`, deci nu e „fereastra mica", ci nicio fereastra.
 *
 * Intoarce daca a stins ceva. `false` inseamna „intre timp s-a cerut alta" sau „nu era
 * nimic" — amandoua sunt in regula si nu-s erori.
 */
export async function stingePropagarea(
  admin: Admin, businessId: string, cerutaLa: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("emag_stinge_propagarea", {
    p_business_id: businessId,
    p_ceruta_la: cerutaLa,
  });
  if (error) {
    await logError({
      action: "emag.propagare",
      message: `intentia de propagare nu s-a putut stinge: ${error.message}`,
      details: { businessId, cerutaLa },
      businessId,
      severity: "warning",
    });
    return false;
  }
  return data === true;
}

/**
 * Pune tot catalogul magazinului in coada, pe operatia ceruta.
 *
 * Intoarce cate produse au fost puse la rand, si daca intentia poate fi stinsa.
 */
export async function propagaSetarile(
  admin: Admin, businessId: string, op: OpPropagare,
): Promise<{ puse: number; sigur: boolean }> {
  /*
   * ⚠ `fetchAllRowsStrict`: PostgREST taie la 1000 FARA sa spuna, iar aici lista e catalogul
   * intreg. Taiata, restul ofertelor ar fi ramas cu setarea veche — adica exact defectul,
   * doar mai mic si mai greu de vazut.
   */
  const randuri = await fetchAllRowsStrict<{ product_id: string | null }>(
    "emag.setari-propagate", (from, to) =>
      admin.from("emag_offers").select("product_id")
        .eq("business_id", businessId).eq("auto_sync", true).not("product_id", "is", null)
        .order("emag_id", { ascending: true }).range(from, to),
  );

  const ids = [...new Set(randuri.map((r) => r.product_id).filter((x): x is string => !!x))];
  /* ⚠ Niciun produs de atins e un sfarsit legitim, deci intentia se poate stinge. */
  if (ids.length === 0) return { puse: 0, sigur: true };

  /* ⚠ O SINGURA operatie, cea mai grea dintre cele cerute: trei puneri in coada pe acelasi
     produs ar fi insemnat trei treceri pentru un singur efect — si trei cereri din cele 3
     pe secunda ale magazinului, aceleasi prin care pleaca o miscare de stoc dupa o vanzare. */
  /* ⚠ Varianta cu VERDICT, nu cea cu numar: aici se hotaraste daca intentia poate fi stinsa,
     iar un `0` nu spune daca n-a fost ce pune sau daca scrierea a picat. */
  const verdict = await enqueueEmagStrict(businessId, ids, op);
  const puse = verdict.fel === "puse" ? verdict.cate : 0;

  /*
   * ═══ ⚠ ZERO PUS LA ID-URI EXISTENTE SE SPUNE, SI ANUME AICI ═══
   *
   * `enqueueMany` intoarce 0 si cand n-are ce pune, si cand a picat — le inghite pe
   * amandoua prin `inghiteDarScrie`. Contractul lui e folosit de multi chemator, iar
   * schimbat ca sa le deosebeasca ar fi cerut ca fiecare sa hotarasca ce face cu esecul;
   * iar aici „nu stampila si mai incearca" ar fi insemnat reincercare la NESFARSIT pentru
   * un magazin cu sincronizarea oprita anume de om — mai rau decat ce reparam.
   *
   * ⚠ Deci nu se schimba purtarea, se NUMESTE consecinta. `inghiteDarScrie` scrie o eroare
   * de coada fara sa spuna a cui intentie era; randul asta spune ce a pierdut comerciantul.
   * Cazul e citibil: id-urile au fost citite chiar acum cu `auto_sync = true`, deci zero
   * inseamna ori magazin oprit, ori o punere picata.
   */
  if (verdict.fel === "eroare") {
    await logError({
      action: "emag.propagare",
      message: `propagarea setarilor a picat la punerea in coada (${ids.length} produse): ${verdict.mesaj}`,
      details: { businessId, op, produse: ids.length },
      businessId,
      severity: "error",
    });
  }

  /*
   * ⚠ `sigur` spune daca intentia poate fi STINSA.
   *
   * `puse` si `nimic` si `oprit` sunt toate sfarsituri legitime: s-a facut ce era de facut,
   * ori omul insusi a oprit sincronizarea. `eroare` NU e: acolo scrierea a picat, iar
   * stingerea ar arunca intentia comerciantului la gunoi, tacut.
   *
   * ⚠ Si conteaza cel mai mult pe ruta grea: pretul si stocul le repara deriva, dar GPSR,
   * `green_tax` si `supply_lead_time` n-au a doua plasa. Pierdute aici, se pierd de tot.
   */
  return { puse, sigur: verdict.fel !== "eroare" };
}

/**
 * Cat asteapta cronul inainte sa ridice o intentie ramasa in aer.
 *
 * ⚠ NU E O PAZA DE CORECTITUDINE, ci una de risipa: bratul iute chiar are nevoie de o
 * clipa ca sa citeasca un catalog de mii de oferte, si n-are rost sa-l citim de doua ori.
 * Daca cronul ar veni mai devreme, nu s-ar strica nimic — punerea in coada e idempotenta.
 */
export const RABDARE_PROPAGARE_MS = 3 * 60 * 1000;

export interface IntentieNeterminata {
  businessId: string;
  op: OpPropagare;
  ceruta_la: string;
}

/**
 * Ce intentii de propagare au ramas neduse la capat.
 *
 * ⚠ Filtrul e „cheia exista", si de-aia intoarce numai ce chiar asteapta:
 * `emag_stinge_propagarea` sterge `propagare_ceruta_la` cand duce lucrul la capat. Prima
 * forma tinea doua marcaje si le compara aici, in Node — mergea, dar un rand TERMINAT
 * trecea la nesfarsit de filtru, si la destule magazine `limit` pe ordine fixa ar fi devenit
 * chiar fereastra fixa din §12.5.
 */
export async function propagariNeterminate(
  admin: Admin, acum: number, limita = 5,
): Promise<IntentieNeterminata[]> {
  const { data, error } = await admin
    .from("store_settings")
    .select("business_id, emag_config")
    /* `->>` da text; „nu e null” inseamna ca cineva chiar a cerut o propagare. */
    .not("emag_config->>propagare_ceruta_la", "is", null)
    .filter("emag_config->>connected", "eq", "true")
    .order("business_id", { ascending: true })
    .limit(200);

  /*
   * ⚠ EROAREA SE SPUNE. Inghitita, o citire picata ar fi insemnat ca nicio intentie nu se
   * mai ridica NICIODATA, si fara nicio urma — adica exact tiparul reparat de fisierul asta,
   * mutat cu un etaj mai sus. Nu se arunca: o exceptie aici ar rupe trecerea cronului si ar
   * pierde si ce a mers pana in pasul 5b.
   */
  if (error) {
    await logError({
      action: "emag.propagare",
      message: `intentiile de propagare nu s-au putut citi: ${error.message}`,
      severity: "warning",
    });
    return [];
  }
  if (!data) return [];

  const rezultat: IntentieNeterminata[] = [];
  for (const rand of data as { business_id: string; emag_config: unknown }[]) {
    const c = (rand.emag_config ?? {}) as EmagConfig;
    const ceruta = c.propagare_ceruta_la;
    if (!ceruta) continue;

    const t = Date.parse(ceruta);
    /* ⚠ Un marcaj necitibil s-ar reciti la fiecare trecere, la nesfarsit. Se sare. */
    if (!Number.isFinite(t)) continue;
    if (acum - t < RABDARE_PROPAGARE_MS) continue;

    rezultat.push({
      businessId: rand.business_id,
      op: (c.propagare_op ?? "oferta") as OpPropagare,
      ceruta_la: ceruta,
    });
    if (rezultat.length >= limita) break;
  }
  return rezultat;
}
