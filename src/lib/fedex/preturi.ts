import { tvaDinIntrare, verdictTva, type FedexConfig, type OfertaFedex, type VerdictTva } from "./client";
import { eMarfaGrea, numeServiciu } from "./servicii";

/**
 * Cotarea FedEx → ce vede cumparatorul in checkout si comerciantul in panou.
 *
 * ⚠ PUR: nu atinge reteaua. Aici stau chiar hotararile care se vad pe ecran — care
 * oferte se arata, in ce ordine si cum se numesc — deci sunt si singurele care se
 * pot proba fara cont.
 *
 * ═══ ⚠ CHEIA UNEI OFERTE E `serviceType`, SI E DE AJUNS ═══
 *
 * La SmartShip cheia a trebuit sa aiba doua parti (curier + contract propriu), la
 * Shipo e `rate_id`. Aici e mai simplu si mai sigur: `rateReplyDetails[]` are cate o
 * intrare pe SERVICIU, si acelasi `serviceType` nu apare de doua ori — FedEx e un
 * singur transportator, nu un broker care revinde mai multe contracte.
 *
 * ═══ ⚠ DOUA NIVELURI, SI ALEGEREA DINTRE ELE ═══
 *
 * `rateReplyDetails[i]`                  — un SERVICIU (`FEDEX_PRIORITY`)
 *   `.ratedShipmentDetails[j]`           — un TIP DE TARIF pe acelasi serviciu
 *
 * Al doilea e un tablou fiindca `rateRequestType: ["ACCOUNT", "PREFERRED"]` intoarce
 * mai multe variante ale aceluiasi pret. **NU se ia `[0]` orbeste** — ordinea nu e
 * garantata nicaieri in documentatia lor, iar prima intrare poate fi pretul de LISTA
 * (aproape mereu mai mare decat cel negociat, si nu e ce se factureaza).
 *
 * ═══ ⚠ VALUTA: SINGURUL LUCRU CARE POATE SUBFACTURA DE CINCI ORI ═══
 *
 * `totalNetCharge` e un NUMAR simplu, iar valuta sta in alta parte
 * (`shipmentRateDetail.currency`). Un cont care coteaza in EUR ar intoarce „12" — si
 * scris pe o comanda romaneasca, 12 euro devin 12 lei. Nu exista curs de schimb pe
 * care sa-l inventam, si nici n-avem voie: e transport real, platit de comerciant.
 *
 * Deci ofertele care nu vin in RON se ARUNCA, si motivul iese la suprafata prin
 * `valuteRefuzate` — comerciantul afla din pagina de configurare de ce nu vede
 * FedEx in checkout, in loc sa caute o zi.
 */

/** Valuta in care lucreaza platforma. Un singur loc, ca sa nu apara doua adevaruri. */
export const VALUTA = "RON";

/*
 * ⚠ TVA-ul se DEDUCE din numerele raspunsului, nu se presupune — vezi antetul lui
 * `verdictTva` din `client.ts`.
 *
 * Sta acolo, si se re-exporta de aici, fiindca il foloseste si `probaConexiune`,
 * iar `client.ts` nu poate importa din modulul asta (ar fi un ciclu). Aceeasi
 * asezare ca la `ziuaAzi`.
 */
export { verdictTva, EXPLICATIE_TVA, type VerdictTva } from "./client";

function numar(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/**
 * Valuta unei intrari de tarif.
 *
 * ⚠ Se citeste din DOUA locuri. `shipmentRateDetail.currency` e cel documentat in
 * OpenAPI; `ratedShipmentDetails[].currency` apare in raspunsuri reale dar **nu e in
 * schema** (am numarat: `RatedShipmentDetail` are 24 de proprietati, `currency` nu e
 * printre ele). Se citeste cel documentat intai, cu al doilea ca plasa.
 */
function valutaIntrarii(intrare: Record<string, unknown>): string {
  const detaliu = intrare.shipmentRateDetail as Record<string, unknown> | undefined;
  return (text(detaliu?.currency) || text(intrare.currency)).toUpperCase();
}


/**
 * Timpul de tranzit, in forma in care il putem arata.
 *
 * Vine din DOUA locuri paralele, amandoua pe serviciu, si amandoua optionale — de
 * aia se incearca pe rand. Ghidul lor de bune practici o si cere: „determine how to
 * react if a non-required reply element, such as a rate, is not returned."
 */
function tranzitul(serviciu: Record<string, unknown>): string | null {
  const angajament = serviciu.commit as Record<string, unknown> | undefined;
  const zile = angajament?.transitDays as Record<string, unknown> | undefined;

  const descriere = text(zile?.description);
  if (descriere) return descriere;

  const traducere = (enumerare: string): string | null => {
    const cuvinte: Record<string, string> = {
      ONE_DAY: "o zi lucratoare", TWO_DAYS: "2 zile lucratoare", THREE_DAYS: "3 zile lucratoare",
      FOUR_DAYS: "4 zile lucratoare", FIVE_DAYS: "5 zile lucratoare", SIX_DAYS: "6 zile lucratoare",
      SEVEN_DAYS: "7 zile lucratoare", EIGHT_DAYS: "8 zile lucratoare", NINE_DAYS: "9 zile lucratoare",
      TEN_DAYS: "10 zile lucratoare",
    };
    return cuvinte[enumerare] ?? null;
  };

  const dinCommit = text(angajament?.daysInTransit);
  if (dinCommit) return traducere(dinCommit) ?? null;

  const operational = serviciu.operationalDetail as Record<string, unknown> | undefined;
  const dinOperational = text(operational?.transitTime);
  if (dinOperational) return traducere(dinOperational) ?? null;

  return null;
}

/** Data estimata de livrare, cand FedEx o da. */
function livrareaEstimata(serviciu: Record<string, unknown>): string | null {
  const angajament = serviciu.commit as Record<string, unknown> | undefined;
  const detaliu = angajament?.dateDetail as Record<string, unknown> | undefined;
  const dinCommit = text(detaliu?.dayFormat);
  if (dinCommit) return dinCommit;

  const operational = serviciu.operationalDetail as Record<string, unknown> | undefined;
  return text(operational?.deliveryDate) || null;
}

/**
 * Tariful pe care il PLATESTE comerciantul, dintr-un serviciu.
 *
 * Ordinea de preferinta, si de ce:
 *   1. `ACCOUNT` — „account specific rates", tariful negociat al contului. Asta se
 *      factureaza.
 *   2. `PREFERRED_CURRENCY` / `PREFERRED` — acelasi tarif, convertit de EI in valuta
 *      ceruta. Al doilea, fiindca conversia e a lor si e explicita.
 *   3. orice altceva care vine in RON — inclusiv `LIST`, pretul de lista. Se ia doar
 *      ca sa nu ramana checkout-ul gol, si se semnaleaza.
 *
 * ⚠ Se filtreaza INTAI pe valuta, apoi pe tip. O intrare `ACCOUNT` in euro e mai
 * periculoasa decat una `LIST` in lei: prima ar scrie un numar gresit pe comanda, a
 * doua doar un pret mai mare decat trebuie.
 */
type Tarif = { pret: number; valuta: string; tipTarif: string; faraTva: number | null; tva: number | null };

function tarifulPotrivit(intrari: unknown[]): Tarif | null {
  const candidati = intrari
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      pret: numar(x.totalNetCharge),
      valuta: valutaIntrarii(x),
      tipTarif: text(x.rateType).toUpperCase(),
      /* ⚠ Singurul camp despre care FedEx spune EXPLICIT ca e fara taxe. */
      faraTva: numar(x.totalNetFedExCharge),
      tva: tvaDinIntrare(x),
    }))
    /* Zero sau lipsa NU inseamna „gratuit": inseamna ca n-au cotat. */
    .filter((x): x is Tarif => x.pret !== null && x.pret > 0);

  const inLei = candidati.filter((x) => x.valuta === VALUTA);
  if (inLei.length === 0) return candidati[0] ?? null;

  const ordine = ["ACCOUNT", "PREFERRED_CURRENCY", "PREFERRED", "PREFERRED_INCENTIVE", "INCENTIVE", "ACTUAL", "CURRENT", "CUSTOM", "LIST"];
  for (const tip of ordine) {
    const gasit = inLei.find((x) => x.tipTarif === tip);
    if (gasit) return gasit;
  }
  return inLei[0];
}

export type FiltruOferte = {
  /**
   * Comanda are ramburs?
   *
   * ⚠ La FedEx raspunsul e mereu acelasi: cu ramburs, NICIO oferta. Nu e o
   * configurare — C.O.D. a fost retras de ei in 2023 peste tot in afara de FedEx
   * Ground in/spre Canada. Steagul exista ca apelantii sa nu trebuiasca sa stie asta.
   */
  cuRamburs?: boolean;
  /** Greutatea comenzii, pentru a scoate serviciile de marfa grea din checkout. */
  greutateKg?: number;
};

export type RezultatOferte = {
  oferte: OfertaFedex[];
  /**
   * ⚠ Valutele in care FedEx a cotat si pe care le-am refuzat.
   *
   * Nu e statistica: e singurul fel in care un comerciant afla de ce nu vede FedEx
   * in checkout desi „conexiunea merge". Se arata in pagina de configurare.
   */
  valuteRefuzate: string[];
  /** S-a cotat doar la pret de LISTA? Atunci contul n-are tarife negociate. */
  doarPretDeLista: boolean;
  /**
   * ⚠ Preturile intoarse includ TVA-ul, sau nu?
   *
   * DEDUS din numerele raspunsului, nu presupus — vezi `verdictTva`. E o
   * proprietate a CONTULUI, nu a comenzii, deci se afla o data si ramane valabila.
   * Se arata in „Testeaza conexiunea" si langa fiecare oferta din panou.
   */
  tva: VerdictTva;
};

/**
 * Ofertele care se pot arata, filtrate si asezate.
 *
 * ⚠ Filtrul pe servicii e alegerea comerciantului; lista goala inseamna „toate cele
 * pe care le da contul", nu „niciunul". Aceeasi regula ca la `curieri_permisi` al
 * Shipo.
 */
export function ofertePosibile(
  detalii: unknown[],
  config?: Pick<FedexConfig, "servicii_permise">,
  filtru?: FiltruOferte,
): RezultatOferte {
  /* ⚠ Cu ramburs, FedEx nu are ce oferi. Se opreste inainte de orice altceva. */
  if (filtru?.cuRamburs) return { oferte: [], valuteRefuzate: [], doarPretDeLista: false, tva: "necunoscut" };

  const permise = new Set(
    (config?.servicii_permise ?? []).map((x) => String(x).trim().toUpperCase()).filter(Boolean),
  );

  const oferte: OfertaFedex[] = [];
  const valuteRefuzate = new Set<string>();
  const verdicteTva = new Set<VerdictTva>();
  const vazute = new Set<string>();
  let tipuri = 0;
  let deLista = 0;

  for (const brut of detalii ?? []) {
    if (!brut || typeof brut !== "object") continue;
    const serviciu = brut as Record<string, unknown>;

    const serviceType = text(serviciu.serviceType).toUpperCase();
    if (!serviceType || vazute.has(serviceType)) continue;
    if (permise.size > 0 && !permise.has(serviceType)) continue;

    /*
     * ⚠ Marfa grea nu se ofera unui cumparator obisnuit: FedEx Priority Freight e
     * pentru 68-1.000 kg si e alta scara de pret. Ramane disponibil la emiterea
     * manuala din panou, unde comerciantul stie ce trimite.
     */
    if (eMarfaGrea(serviceType) && Number(filtru?.greutateKg ?? 0) <= 68) continue;

    const intrari = serviciu.ratedShipmentDetails;
    if (!Array.isArray(intrari)) continue;

    const tarif = tarifulPotrivit(intrari);
    if (!tarif) continue;

    /*
     * ⚠ AICI SE OPRESTE PRETUL IN ALTA VALUTA. Vezi antetul: 12 euro scrisi ca 12
     * lei sunt o subfacturare de cinci ori, si tacuta.
     */
    if (tarif.valuta !== VALUTA) {
      valuteRefuzate.add(tarif.valuta || "necunoscuta");
      continue;
    }

    tipuri += 1;
    if (tarif.tipTarif === "LIST") deLista += 1;

    vazute.add(serviceType);
    const verdict = verdictTva(tarif.pret, tarif.faraTva, tarif.tva);
    if (verdict !== "necunoscut") verdicteTva.add(verdict);

    oferte.push({
      serviceType,
      serviceName: numeServiciu(serviceType, text(serviciu.serviceName)),
      pret: Math.round(tarif.pret * 100) / 100,
      valuta: tarif.valuta,
      tipTarif: tarif.tipTarif,
      tva: tarif.tva,
      pretFaraTva: tarif.faraTva,
      verdictTva: verdict,
      tranzit: tranzitul(serviciu),
      livrareEstimata: livrareaEstimata(serviciu),
    });
  }

  return {
    oferte: oferte.sort((a, b) => a.pret - b.pret),
    valuteRefuzate: [...valuteRefuzate],
    doarPretDeLista: tipuri > 0 && deLista === tipuri,
    /*
     * ⚠ Un singur verdict pe cont. Daca serviciile ar da raspunsuri DIFERITE (unul
     * cu TVA, altul fara), nu se alege niciunul: „necunoscut" e mai cinstit decat o
     * majoritate care ascunde ca ei nu sunt consecventi.
     */
    tva: verdicteTva.size === 1 ? [...verdicteTva][0] : "necunoscut",
  };
}

/** Eticheta ofertei, asa cum o vede cumparatorul. */
export function etichetaOferta(o: Pick<OfertaFedex, "serviceName" | "tranzit">): string {
  const nume = (o.serviceName ?? "").trim() || "FedEx";
  return o.tranzit ? `${nume} (${o.tranzit})` : nume;
}

/** Cheia unei oferte. Un singur loc care o compune, ca sa nu apara doua forme. */
export function cheiaOfertei(o: Pick<OfertaFedex, "serviceType">): string {
  return o.serviceType;
}
