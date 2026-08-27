/**
 * Veghea: produsele cu istoric de lot orb, tinute sub observatie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ O SINGURA PRIVIRE NU DOVEDESTE CA UN LOT ORB S-A TERMINAT (27.08.2026, noaptea)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un lot ORB — trimis, cu raspunsul pierdut — se lamurea pana acum CITIND o data ce au ei
 * (`derivaFataDeEi`). Daca la ei era deja starea de acum, lotul se inchidea ca `depasit` si nu se
 * mai revenea niciodata.
 *
 * ⚠ DAR LOTUL ALA SE POATE ASEZA LA EI SI DUPA CITIREA NOASTRA. Loturile lor se prelucreaza
 * asincron, iar in contractul lor public nu scrie nicaieri ca doua loturi diferite se aseaza in
 * ordinea trimiterii:
 *
 *     10:00  GEN 10 pleaca, raspunsul se pierde   -> `necunoscut`
 *     10:05  GEN 11 pleaca si se incheie          -> la ei e starea noua ✅
 *     10:10  citim: identic                       -> inchidem GEN 10
 *     11:30  GEN 10 se aseaza in sfarsit          -> la ei e IAR starea veche ❌
 *
 * Si de la 11:30 incolo nu mai exista nimic care sa observe asta.
 *
 * ⚠ RASPUNSUL NU E O CITIRE MAI DESTEAPTA, E MAI MULTE CITIRI, raspandite in timp. Produsul intra
 * sub veghe, iar veghea nu se stinge la prima citire curata — ci dupa cateva la rand, si dupa ce
 * fereastra s-a scurs.
 *
 * ═══ ⚠ SI CELE 48 DE ORE ERAU TOT O PRESUPUNERE (27.08.2026, tarziu) ═══
 *
 * Documentatia lor spune ca un lot poate fi `pending`, `processing`, `retry`, `completed` sau
 * `failed`. NU publica nicaieri un termen maxim dupa care un lot nevazut poate fi declarat
 * imposibil de aplicat. Cele 48 de ore de webhook delivery sunt ale ALTUI mecanism si nu spun
 * nimic despre loturi de produs — o confuzie usor de facut si care ar fi transformat o presupunere
 * in „garantie".
 *
 * Deci veghea are doua viteze: DEASA cat timp lucrul e proaspat, apoi RARA — o data pe zi, o luna.
 * Nu fiindca stim ca dupa o luna nu se mai poate aseza nimic, ci fiindca la un moment dat costul
 * unei citiri zilnice pe veci depaseste ce mai poate ea afla.
 *
 * ⚠ SI ARE UN CAPAT SI LA RETRIMITERI. Dupa cateva care nu au adus convergenta, se striga o
 * singura data si se inceteaza trimiterea: o bucla care se reia la nesfarsit costa o cerere la
 * fiecare trecere si nu repara nimic. Vezi `PRAG_REASERTARI`.
 *
 * ⚠ CE NU FACE FISIERUL ASTA: nu citeste nimic de la About You si nu compara nimic. Aici sta doar
 * cand se uita si cat tine veghea; comparatia e `derivaFataDeEi` din `sync.ts`. Despartirea nu e
 * de dragul curateniei — asa `sync.ts` poate importa de aici fara sa se nasca un cerc.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { randuriCitite } from "@/lib/supabase/rand-citit";

type Db = SupabaseClient<Database>;

/** Cat tine veghea DEASA, de la ultima deriva gasita: citiri la sfert de ora pana la sase ore. */
export const FEREASTRA_DEASA_MS = 48 * 60 * 60 * 1000;

/** Cat tine veghea cu totul, de la ultima deriva. Dupa fereastra deasa: o citire pe zi. */
export const ORIZONT_VEGHE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cate citiri CURATE LA RAND inchid veghea.
 *
 * ⚠ Una singura era chiar defectul: „la ei e deja starea buna" nu spune nimic despre ce se aseaza
 * peste zece minute.
 */
export const PRAG_CURATE = 3;

/**
 * Cate retrimiteri se fac inainte de a striga dupa un om.
 *
 * ⚠ O deriva care nu se inchide dupa atatea retrimiteri nu e o cursa, e altceva: o mapare
 * respinsa, o valoare pe care ei o normalizeaza altfel, un camp pe care il comparam gresit.
 * Retrimis mai departe, ar fi o roata care se invarte la nesfarsit si acopera cauza.
 */
export const PRAG_REASERTARI = 5;

/** Cate veghi se duc la capat intr-o trecere, pe magazin. Fiecare costa o citire la ei. */
export const MAX_VEGHI_PE_TRECERE = 10;

export interface RandVeghe {
  id: string;
  business_id: string;
  style_key: string;
  product_id: string | null;
  motiv: string;
  incident: string | null;
  pornita_la: string;
  pana_la: string;
  ultima_deriva_la: string | null;
  curate_la_rand: number;
  reasertari: number;
  verificari: number;
  necesita_om: boolean;
  alarma_scrisa_la: string | null;
}

/**
 * Peste cat se uita din nou.
 *
 * ⚠ RAR SI TOT MAI RAR. Primele citiri sunt dese, fiindca acolo e cel mai probabil sa se aseze
 * lotul vechi; pe urma se raresc, fiindca o veghe de doua zile la un sfert de ora ar insemna
 * aproape doua sute de cereri pentru un singur produs.
 *
 * ⚠ SI DUPA FEREASTRA DEASA, O DATA PE ZI. Coada lunga exista fiindca nimeni nu ne-a promis un
 * termen maxim de asezare; o citire pe zi e destul de rara cat sa nu conteze si destul de deasa
 * cat sa prinda un lot care se aseaza a treia zi.
 */
export function urmatoareaVerificareMs(curateLaRand: number, varstaDeLaReperMs = 0): number {
  const UN_SFERT = 15 * 60 * 1000;
  const SASE_ORE = 6 * 60 * 60 * 1000;
  const O_ZI = 24 * 60 * 60 * 1000;
  if (varstaDeLaReperMs >= FEREASTRA_DEASA_MS) return O_ZI;
  return Math.min(SASE_ORE, UN_SFERT * 2 ** Math.max(0, curateLaRand));
}

/**
 * De cand se socoteste vechimea veghii: de la ultima deriva gasita, ori de la pornire.
 *
 * ⚠ O DERIVA NOUA REPORNESTE CEASUL. Altfel un produs care deriveaza in ziua a treia ar fi
 * verificat mai departe o data pe zi, taman cand are cea mai mare nevoie de citiri dese.
 */
export function reperulVeghii(r: { pornita_la: string; ultima_deriva_la: string | null }): number {
  const d = r.ultima_deriva_la ? Date.parse(r.ultima_deriva_la) : NaN;
  if (Number.isFinite(d)) return d;
  const p = Date.parse(r.pornita_la);
  return Number.isFinite(p) ? p : Date.now();
}

/**
 * Veghea s-a terminat: orizontul s-a scurs, ultimele citiri au fost curate, si nu asteapta un om.
 *
 * ⚠ TOATE TREI. Numai orizontul ar inchide o veghe care tocmai a gasit deriva; numai sirul curat
 * ar inchide-o la un ceas dupa pornire, adica exact prea devreme.
 *
 * ⚠ SI `necesita_om` OPRESTE INCHIDEREA, oricat de curate ar fi citirile. Un SKU strain la ei nu
 * se atinge — nu stim ce e —, dar nici nu se poate numi „curat": inchisa asa, veghea ar declara
 * „totul in regula" pentru un produs pe care ea insasi tocmai a scris ca are ceva nelamurit.
 */
export function vegheaSAIncheiat(
  r: { pana_la: string; curate_la_rand: number; necesita_om?: boolean }, acum = Date.now(),
): boolean {
  if (r.necesita_om) return false;
  return Date.parse(r.pana_la) <= acum && r.curate_la_rand >= PRAG_CURATE;
}

/**
 * Pune un produs sub veghe. Intoarce `false` daca n-a putut fi scris.
 *
 * ⚠ RASPUNSUL SE CITESTE LA APELANT, si acolo hotaraste daca lotul se mai poate inchide. Scrisa
 * pe tacute, veghea ar fi o promisiune goala tocmai in clipa in care stim ca produsul e in
 * primejdie.
 *
 * ⚠ NU SCURTEAZA O VEGHE CARE MERGE. `pana_la` se duce inainte, niciodata inapoi: un al doilea
 * motiv aparut peste unul vechi nu are voie sa taie observatia care era deja pornita.
 *
 * ═══ ⚠ SI UN INCIDENT NOU PRIMESTE CONTOARE NOI (27.08.2026, tarziu) ═══
 *
 * Cheia unica e `(business_id, style_key)`, deci al doilea incident pe acelasi produs cadea peste
 * randul primului si ii MOSTENEA numaratorile. Un produs ajuns la `reasertari = 5`, cu alarma deja
 * scrisa, nu mai primea NICIO retrimitere pentru incidentul urmator — pragul era atins din
 * povestea veche — si nici alarma noua, fiindca `alarma_scrisa_la` era pus. Veghea ramanea in
 * picioare si nu mai facea nimic: cea mai rea forma de plasa.
 *
 * ⚠ SI NICI INVERS: acelasi incident semnalat de doua ori NU repune contoarele la zero, altfel
 * pragul de retrimiteri n-ar fi atins niciodata. De-aia se compara `incident`, nu se reseteaza
 * orbeste.
 */
export async function pornesteVeghea(
  admin: Db, businessId: string, styleKey: string, productId: string | null,
  motiv: string, incident: string,
): Promise<boolean> {
  const acum = Date.now();
  const panaLa = new Date(acum + ORIZONT_VEGHE_MS).toISOString();

  const { data, error } = await admin
    .from("aboutyou_veghe").select("id, pana_la, incident")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle();
  if (error) return false;

  if (data) {
    const r = data as { id: string; pana_la: string; incident: string | null };
    const altIncident = r.incident !== incident;
    const veche = Date.parse(r.pana_la);
    const { error: eUpd } = await admin.from("aboutyou_veghe").update({
      /* ⚠ Numai in fata: vezi nota de mai sus. */
      pana_la: Number.isFinite(veche) && veche > acum + ORIZONT_VEGHE_MS ? r.pana_la : panaLa,
      motiv,
      incident,
      product_id: productId,
      updated_at: new Date(acum).toISOString(),
      ...(altIncident
        ? {
          /* Incident nou: povestea celui vechi nu mai are ce sa hotarasca despre asta. */
          curate_la_rand: 0, reasertari: 0, alarma_scrisa_la: null, ultima_deriva_la: null,
          pornita_la: new Date(acum).toISOString(),
          /* ⚠ Si prima citire vine repede, chiar daca veghea veche ajunsese la o citire pe zi. */
          urmatoarea_verificare: new Date(acum + urmatoareaVerificareMs(0)).toISOString(),
        }
        : {}),
    } as never).eq("id", r.id);
    return !eUpd;
  }

  const { error: eIns } = await admin.from("aboutyou_veghe").insert({
    business_id: businessId, style_key: styleKey, product_id: productId, motiv, incident,
    pana_la: panaLa,
    urmatoarea_verificare: new Date(acum + urmatoareaVerificareMs(0)).toISOString(),
  } as never);
  /*
   * ⚠ O cursa cu alta instanta care tocmai a pornit aceeasi veghe nu e un esec: cheia unica a
   * respins randul al doilea, dar veghea EXISTA — si asta era tot ce ceream.
   */
  if (eIns && (eIns as { code?: string }).code === "23505") return true;
  return !eIns;
}

/** Veghile scadente ale unui magazin, cele mai vechi intai. */
export async function veghiScadente(
  admin: Db, businessId: string, limita = MAX_VEGHI_PE_TRECERE,
): Promise<RandVeghe[]> {
  return randuriCitite<RandVeghe>("aboutyou.veghiScadente", await admin
    .from("aboutyou_veghe")
    .select("id, business_id, style_key, product_id, motiv, incident, pornita_la, pana_la, ultima_deriva_la, curate_la_rand, reasertari, verificari, necesita_om, alarma_scrisa_la")
    .eq("business_id", businessId)
    .lte("urmatoarea_verificare", new Date().toISOString())
    .order("urmatoarea_verificare", { ascending: true })
    .limit(limita) as never);
}
