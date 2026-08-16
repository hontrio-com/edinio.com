import type { ServiciuShipo, ShipoConfig, TarifShipo } from "./client";
import { livreazaInPunct, ridicaDinPunct } from "./expediere";

/**
 * Tarifele Shipo → ce vede cumparatorul in checkout si comerciantul in panou.
 *
 * ⚠ PUR: nu atinge reteaua. Aici stau chiar hotararile care se vad pe ecran —
 * care oferte se arata, in ce ordine si cum se numesc — deci sunt si singurele
 * care se pot proba fara cont.
 *
 * ═══ ⚠ CHEIA UNEI OFERTE E `rate_id`, SI NUMAI EL ═══
 *
 * La SmartShip cheia a trebuit sa aiba DOUA parti (curier + contract propriu),
 * fiindca acelasi curier aparea de doua ori. Aici problema e aceeasi, dar
 * raspunsul e mai simplu: la Shipo acelasi curier apare de mai multe ori pentru
 * ca are servicii diferite — la adresa, in locker, in punct PUDO — si fiecare are
 * `rate_id`-ul lui, la alt pret.
 *
 * `rate_id` E identitatea serviciului si tot el se trimite la emitere. Deci o
 * cheie facuta din `courier_slug` ar prabusi doua sau trei oferte distincte una
 * peste alta: cumparatorul ar alege „FAN Courier 15 lei" (locker) si ar primi
 * „FAN Courier 22 lei" (la adresa), iar diferenta ar plati-o comerciantul. Exact
 * defectul gasit la Innoship.
 *
 * ═══ ⚠ TIPUL ADRESEI NU VINE DIN `/rates` ═══
 *
 * Raspunsul de tarife are `service_type` („standard"), care NU spune daca
 * livrarea e la adresa sau in locker. Asta sta doar in `/rates/services`
 * (`recipient_address_type`). De aia `ofertePosibile` cere AMANDOUA listele —
 * fara a doua, un serviciu de locker ar fi oferit ca livrare la domiciliu si
 * emiterea ar cadea la validare, dupa ce clientul a platit.
 */

export type OfertaShipo = {
  /** ⚠ Cheia. Vezi antetul. */
  rateId: number;
  courierSlug: string;
  numeCurier: string;
  /** Descrierea serviciului, cand contul o da („Livrare standard la adresa"). */
  descriere: string;
  /** Pretul intors de ei, in lei. */
  pret: number;
  /** Livreaza intr-un locker sau punct PUDO? Atunci trebuie ales un punct. */
  laPunct: boolean;
  /** Serviciul accepta ramburs? */
  acceptaRamburs: boolean;
};

/**
 * Pretul care ajunge la cumparator.
 *
 * ⚠ `total_fee` e singurul camp de pret pe care il dau, si documentatia nu spune
 * daca e cu sau fara TVA. Se ia asa cum vine, fiindca inventarea unui adaos ar fi
 * mai rea decat necunoscuta: daca s-ar dovedi ca e net, un „+19%" pus de noi peste
 * un pret care era deja brut ar umfla transportul la toate magazinele. Ramane de
 * lamurit la prima cheie de cont — scris si in pagina de configurare.
 *
 * Zero sau lipsa NU inseamna „gratuit": inseamna ca n-au cotat. Oferta se arunca.
 */
export function pretOferta(t: TarifShipo): number | null {
  const total = Number(t?.total_fee);
  if (Number.isFinite(total) && total > 0) return Math.round(total * 100) / 100;
  return null;
}

/** Eticheta ofertei. Cumparatorul vede CURIERUL REAL, nu numele brokerului. */
export function etichetaOferta(o: OfertaShipo): string {
  const nume = (o.numeCurier ?? "").trim();
  if (!nume) return o.laPunct ? "Livrare in locker" : "Livrare prin Shipo";
  /* ⚠ Se spune pe fata cand oferta e in punct: altfel doua randuri cu acelasi
     nume de curier, la preturi diferite, arata a defect. */
  return o.laPunct ? `${nume} (locker / punct de ridicare)` : nume;
}

/** Cheia unei oferte. Un singur loc care o compune, ca sa nu apara doua forme. */
export function cheiaOfertei(o: Pick<OfertaShipo, "rateId">): string {
  return String(o.rateId);
}

export type FiltruOferte = {
  /** Comanda are ramburs? Atunci serviciile fara ramburs nu se pot arata. */
  cuRamburs?: boolean;
};

/**
 * Ofertele care se pot arata, filtrate si asezate.
 *
 * ⚠ Filtrul pe curieri e alegerea comerciantului; lista goala inseamna „toti cei
 * pe care ii da contul", nu „niciunul".
 *
 * ⚠ Ordinea e dupa PRET, ca in tot checkout-ul. Raspunsul lor e un obiect indexat
 * dupa `rate_id`, deci ordinea cheilor nu inseamna nimic si trebuie asezata aici.
 */
export function ofertePosibile(
  tarife: TarifShipo[],
  servicii: ServiciuShipo[],
  config?: Pick<ShipoConfig, "curieri_permisi" | "foloseste_lockere">,
  filtru?: FiltruOferte,
): OfertaShipo[] {
  const dupaId = new Map<number, ServiciuShipo>();
  for (const s of servicii ?? []) dupaId.set(s.id, s);

  const permisi = new Set(
    (config?.curieri_permisi ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean),
  );

  const iesire: OfertaShipo[] = [];
  const vazute = new Set<number>();

  for (const t of tarife ?? []) {
    const rateId = Number(t?.rate_id);
    if (!Number.isInteger(rateId) || rateId <= 0) continue;
    if (vazute.has(rateId)) continue;

    const pret = pretOferta(t);
    if (pret === null) continue;

    const slug = (t?.courier_slug ?? "").trim().toLowerCase();
    if (permisi.size > 0 && !permisi.has(slug)) continue;

    /*
     * ⚠ Un tarif fara serviciu cunoscut se ARUNCA, nu se presupune „la adresa".
     *
     * Presupus, un serviciu de locker ar fi ajuns in checkout ca livrare la
     * domiciliu; cumparatorul si-ar fi dat adresa, iar emiterea ar fi cazut cu
     * „recipient_address_id este obligatoriu" — dupa plata. Lista de servicii se
     * citeste oricum la fiecare cotare si e cachata, deci lipsa ei e un semn ca
     * ceva nu e in regula, nu un caz de acoperit prin ghicit.
     */
    const serviciu = dupaId.get(rateId);
    if (!serviciu) continue;

    /* Ridicarea din locker nu e acoperita: expeditorul e mereu adresa magazinului. */
    if (ridicaDinPunct(serviciu)) continue;

    const laPunct = livreazaInPunct(serviciu);
    if (laPunct && config?.foloseste_lockere !== true) continue;

    const acceptaRamburs = t?.is_cod_available !== false;
    /* ⚠ Cu ramburs, un serviciu care nu-l accepta n-are ce cauta in lista: ales,
       ar cadea la emitere si comanda ar ramane fara transport. */
    if (filtru?.cuRamburs && !acceptaRamburs) continue;

    vazute.add(rateId);
    iesire.push({
      rateId,
      courierSlug: slug,
      numeCurier: (t?.courier_name ?? "").trim(),
      descriere: (serviciu.description ?? "").trim(),
      pret,
      laPunct,
      acceptaRamburs,
    });
  }

  return iesire.sort((a, b) => a.pret - b.pret);
}
