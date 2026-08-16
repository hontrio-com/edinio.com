import { asTablou, numarSauNull, type AlertaUps, type OfertaUps, type UpsConfig } from "./client";
import { codServiciu, eMarfaGrea, eVandutInRomania, numeServiciu } from "./servicii";

/**
 * Cotarea UPS → ce vede cumparatorul in checkout si comerciantul in panou.
 *
 * ⚠ PUR: nu atinge reteaua. Aici stau chiar hotararile care se vad pe ecran — care
 * oferte se arata, in ce ordine si cum se numesc — deci sunt si singurele care se pot
 * proba fara cont.
 *
 * ═══ ⚠ CHEIA UNEI OFERTE E `Service.Code`, SI E DE AJUNS ═══
 *
 * `RatedShipment[]` are cate o intrare pe SERVICIU, si acelasi cod nu apare de doua
 * ori: UPS e un singur transportator, nu un broker care revinde mai multe contracte.
 * (La SmartShip cheia a trebuit sa aiba doua parti, la Shipo e `rate_id`.)
 *
 * ═══ ⚠ TREI NUME PENTRU „CAT COSTA", SI ELE NU INSEAMNA ACELASI LUCRU ═══
 *
 *   `RatedShipment.TotalCharges`                        pretul de LISTA
 *   `RatedShipment.NegotiatedRateCharges.TotalCharge`   tariful CONTRACTULUI  ← singular!
 *   `RatedPackage.NegotiatedCharges`                    tariful pe colet      ← al treilea nume
 *
 * Al doilea e cel care se factureaza, si el se cere explicit
 * (`NegotiatedRatesIndicator`). Dar POATE LIPSI cu totul, si asta nu e un defect —
 * verbatim: „if a particular shipment … doesn't qualify for the existing discount then
 * **no negotiated rates container will be returned. Published rates will be the
 * applicable rate.**" Cand lipseste, cotam la lista si o spunem.
 *
 * ⚠ Iar singularul din `TotalCharge` (fara `s`) langa pluralul din `TotalCharges` e
 * chiar felul in care se pierde reducerea intr-o integrare scrisa repede.
 *
 * ═══ ⚠ VALUTA: SINGURUL LUCRU CARE POATE SUBFACTURA DE CINCI ORI ═══
 *
 * ⚠ **UPS NU ARE NICIUN CAMP PRIN CARE SA CERI VALUTA RASPUNSULUI.** Cautat in tot
 * `Rating.yaml`: fiecare `CurrencyCode` din cerere descrie o suma pe care o dai TU
 * (ramburs, valoare declarata), niciunul nu cere valuta tarifului. Singura afirmatie
 * despre valuta raspunsului e pe `TotalChargesWithTaxes`: „The currency code used in
 * the Shipment request is returned" — ceea ce nu spune nimic despre `TotalCharges`.
 *
 * Deci un cont care coteaza in EUR intoarce „12", si scris pe o comanda romaneasca 12
 * euro devin 12 lei. Nu exista curs pe care sa-l inventam, si nici n-avem voie: e
 * transport real, platit de comerciant. Ofertele care nu vin in RON se ARUNCA, iar
 * motivul iese la suprafata prin `valuteRefuzate`.
 */

/** Valuta in care lucreaza platforma. Un singur loc, ca sa nu apara doua adevaruri. */
export const VALUTA = "RON";

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/** O suma din raspunsul lor: `{ CurrencyCode, MonetaryValue }`, amandoua siruri. */
function suma(v: unknown): { valoare: number; valuta: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const valoare = numarSauNull(o.MonetaryValue);
  if (valoare === null || !(valoare > 0)) return null;
  return { valoare, valuta: text(o.CurrencyCode).toUpperCase() };
}

/**
 * TVA-ul raportat pe o oferta.
 *
 * ⚠ SE CAUTA IN DOUA LOCURI, si care dintre ele e populat depinde de ce am cerut:
 * „If this indicator is requested with NegotiatedRatesIndicator, Tax related
 * information … would be returned **only for Negotiated Rates and not for Published
 * Rates**." Adica exact configuratia noastra obisnuita muta taxele sub
 * `NegotiatedRateCharges` si goleste nivelul de sus.
 *
 * ⚠ Si `TaxCharges[]` NU are `CurrencyCode` — nicaieri, la niciun nivel. Suma lor se
 * presupune in aceeasi valuta cu tariful; alta lectura n-are cum sa existe.
 */
function taxeleDin(oferta: Record<string, unknown>, negociate: Record<string, unknown> | null): number | null {
  const din = (nod: Record<string, unknown> | null): number | null => {
    if (!nod) return null;
    const lista = asTablou<Record<string, unknown>>(nod.TaxCharges);
    if (lista.length === 0) return null;
    let s = 0;
    let gasit = false;
    for (const t of lista) {
      if (!t || typeof t !== "object") continue;
      const a = numarSauNull(t.MonetaryValue);
      if (a !== null) { s += a; gasit = true; }
    }
    return gasit ? Math.round(s * 100) / 100 : null;
  };
  return din(negociate) ?? din(oferta);
}

/**
 * Timpul de tranzit, in forma in care il putem arata.
 *
 * ⚠ Vine din DOUA locuri, si al doilea exista numai daca s-a cerut
 * `Shoptimeintransit` IMPREUNA cu `DeliveryTimeInformation`. Ghidul lor de bune
 * practici cere chiar asta: „determine how to react if a non-required reply element,
 * such as a rate, is not returned."
 */
function tranzitul(oferta: Record<string, unknown>): string | null {
  const zile = (n: unknown): string | null => {
    const v = numarSauNull(n);
    if (v === null || v <= 0) return null;
    return v === 1 ? "o zi lucratoare" : `${v} zile lucratoare`;
  };

  const tit = oferta.TimeInTransit as Record<string, unknown> | undefined;
  const rezumat = tit?.ServiceSummary as Record<string, unknown> | undefined;
  const sosire = rezumat?.EstimatedArrival as Record<string, unknown> | undefined;
  const dinTit = zile(sosire?.BusinessDaysInTransit);
  if (dinTit) return dinTit;

  const garantat = oferta.GuaranteedDelivery as Record<string, unknown> | undefined;
  return zile(garantat?.BusinessDaysInTransit);
}

/**
 * Data estimata de livrare (`YYYYMMDD`), cand UPS o da.
 *
 * ⚠ `TimeInTransit…Arrival.Date` e documentat `YYYYMMDD`.
 * `GuaranteedDelivery.ScheduledDeliveryDate` **nu are format documentat** — de aia se
 * ia primul, si al doilea doar ca rezerva.
 */
function livrareaEstimata(oferta: Record<string, unknown>): string | null {
  const tit = oferta.TimeInTransit as Record<string, unknown> | undefined;
  const rezumat = tit?.ServiceSummary as Record<string, unknown> | undefined;
  const sosire = rezumat?.EstimatedArrival as Record<string, unknown> | undefined;
  const sosireDetaliu = sosire?.Arrival as Record<string, unknown> | undefined;
  const dinTit = text(sosireDetaliu?.Date);
  if (dinTit) return dinTit;

  const garantat = oferta.GuaranteedDelivery as Record<string, unknown> | undefined;
  return text(garantat?.ScheduledDeliveryDate) || null;
}

export type FiltruOferte = {
  /** Greutatea comenzii, pentru a scoate serviciile de marfa grea din checkout. */
  greutateKg?: number;
  /**
   * Tara de plecare si cea de destinatie.
   *
   * ⚠ NU filtreaza — vezi nota din bucla. Serveste doar la `neVanduteInRomania`, care
   * e un semnal pentru comerciant, nu o poarta.
   */
  taraExpeditor?: string;
  taraDestinatar?: string;
};

export type RezultatOferte = {
  oferte: OfertaUps[];
  /**
   * ⚠ Valutele in care a cotat UPS si pe care le-am refuzat.
   *
   * Nu e statistica: e singurul fel in care un comerciant afla de ce nu vede UPS in
   * checkout desi „conexiunea merge". Se arata in pagina de configurare.
   */
  valuteRefuzate: string[];
  /**
   * ⚠ Toate ofertele au venit la pret de LISTA?
   *
   * Inseamna ca `NegotiatedRateCharges` n-a fost intors — fie contul nu e indreptatit
   * (`120900`, `128320`), fie expedierea asta nu se califica. In amandoua cazurile
   * comerciantul plateste mai mult decat crede, si trebuie sa afle.
   */
  doarPretDeLista: boolean;
  /** Avertismentele de la nivelul cererii. Se arata, nu se ascund. */
  alerte: string[];
  /**
   * ⚠ Servicii pe care UPS le-a cotat desi ghidul lor romanesc spune ca nu se vand
   * pe ruta asta.
   *
   * Nu se ascund si nu se blocheaza — daca ei le-au intors, ei le vand (vezi nota din
   * bucla). Dar se SPUN, fiindca sunt exact locul in care ori documentul lor comercial
   * e invechit, ori contul comerciantului are un contract aparte. Comerciantul merita
   * sa stie inainte sa afle de la un colet refuzat.
   */
  neVanduteInRomania: string[];
};

/**
 * Ofertele care se pot arata, filtrate si asezate.
 *
 * ⚠ Filtrul pe servicii e alegerea comerciantului; lista goala inseamna „toate cele
 * pe care le da contul", nu „niciunul". Aceeasi regula ca la `curieri_permisi` al
 * Shipo si `servicii_permise` al FedEx.
 */
export function ofertePosibile(
  brute: unknown[],
  config?: Pick<UpsConfig, "servicii_permise">,
  filtru?: FiltruOferte,
  alerteCerere: AlertaUps[] = [],
): RezultatOferte {
  const permise = new Set(
    (config?.servicii_permise ?? []).map((x) => String(x).trim().toUpperCase()).filter(Boolean),
  );
  const taraExpeditor = (filtru?.taraExpeditor || "RO").toUpperCase();
  const taraDestinatar = (filtru?.taraDestinatar || "RO").toUpperCase();

  const oferte: OfertaUps[] = [];
  const valuteRefuzate = new Set<string>();
  const neVandute = new Set<string>();
  const vazute = new Set<string>();
  let total = 0;
  let deLista = 0;

  for (const brut of brute ?? []) {
    if (!brut || typeof brut !== "object") continue;
    const o = brut as Record<string, unknown>;

    const serviciu = (o.Service ?? {}) as Record<string, unknown>;
    const cod = codServiciu(serviciu.Code);
    if (!cod || vazute.has(cod)) continue;
    if (permise.size > 0 && !permise.has(cod)) continue;

    /*
     * ⚠⚠ AICI NU SE FILTREAZA DUPA TABELUL NOSTRU DE RUTE, SI E O HOTARARE.
     *
     * Prima varianta scotea `11 UPS Standard` si `54 Express Plus` de pe rutele
     * interne, fiindca ghidul romanesc al UPS scrie „Nu este disponibil pentru
     * expedieri interne". Verificarea adversa a aratat ca e gresit: `Shop` „**validates
     * the shipment**, and returns rates for **all UPS products from the ShipFrom to the
     * ShipTo addresses**" — deci UPS a filtrat deja, pe contul real. Ce a intors el, el
     * il vinde; ascuns de noi, cumparatorul ar fi platit varianta mai scumpa fara motiv.
     *
     * Se pastreaza doar `eVandutInRomania`, ca SFAT in configurare. Vezi `servicii.ts`.
     */

    /*
     * ⚠ Marfa grea nu se ofera unui cumparator obisnuit. In practica nici nu apare
     * (cerem `PackageBillType: "03"`, nu `"04"`), dar „nu apare" nu e „nu poate aparea".
     */
    if (eMarfaGrea(cod) && Number(filtru?.greutateKg ?? 0) <= 70) continue;

    const negociate = (o.NegotiatedRateCharges ?? null) as Record<string, unknown> | null;
    /* ⚠ `TotalCharge` SINGULAR la negociat, `TotalCharges` PLURAL la lista. */
    const alContractului = negociate ? suma(negociate.TotalCharge) : null;
    const alListei = suma(o.TotalCharges);
    const ales = alContractului ?? alListei;
    if (!ales) continue;

    /*
     * ⚠ AICI SE OPRESTE PRETUL IN ALTA VALUTA. Vezi antetul: 12 euro scrisi ca 12 lei
     * sunt o subfacturare de cinci ori, si tacuta.
     */
    if (ales.valuta !== VALUTA) {
      valuteRefuzate.add(ales.valuta || "necunoscuta");
      continue;
    }

    total += 1;
    if (!alContractului) deLista += 1;
    if (!eVandutInRomania(cod, taraExpeditor, taraDestinatar)) neVandute.add(cod);
    vazute.add(cod);

    const cuTva = suma(negociate?.TotalChargesWithTaxes) ?? suma(o.TotalChargesWithTaxes);

    oferte.push({
      serviceCode: cod,
      serviceName: numeServiciu(cod, text(serviciu.Description)),
      pret: Math.round(ales.valoare * 100) / 100,
      valuta: ales.valuta,
      negociat: !!alContractului,
      /* ⚠ Numai daca vine in ACEEASI valuta — altfel n-are ce compara cu pretul. */
      cuTva: cuTva && cuTva.valuta === ales.valuta ? Math.round(cuTva.valoare * 100) / 100 : null,
      tva: taxeleDin(o, negociate),
      tranzit: tranzitul(o),
      livrareEstimata: livrareaEstimata(o),
      alerte: asTablou<Record<string, unknown>>(o.RatedShipmentAlert)
        .filter((a) => !!a && typeof a === "object")
        .map((a) => ({ code: text(a.Code), description: text(a.Description) }))
        .filter((a) => a.code || a.description),
    });
  }

  return {
    oferte: oferte.sort((a, b) => a.pret - b.pret),
    valuteRefuzate: [...valuteRefuzate],
    doarPretDeLista: total > 0 && deLista === total,
    alerte: [...new Set(alerteCerere.map((a) => a.description || a.code).filter(Boolean))],
    neVanduteInRomania: [...neVandute],
  };
}

/** Eticheta ofertei, asa cum o vede cumparatorul. */
export function etichetaOferta(o: Pick<OfertaUps, "serviceName" | "tranzit">): string {
  const nume = (o.serviceName ?? "").trim() || "UPS";
  return o.tranzit ? `${nume} (${o.tranzit})` : nume;
}

/** Cheia unei oferte. Un singur loc care o compune, ca sa nu apara doua forme. */
export function cheiaOfertei(o: Pick<OfertaUps, "serviceCode">): string {
  return o.serviceCode;
}

/**
 * Cat TVA are oferta, si cum se spune omului.
 *
 * ⚠ NU se presupune nimic. UPS nu spune NICAIERI daca `TotalCharges` include TVA-ul —
 * singurul lucru pe care il spune e ca `TotalChargesWithTaxes` „contains total charges
 * **including** total taxes". Deci relatia se citeste din numere, nu din documentatie:
 *
 *   `cuTva > pret`   → pretul e FARA TVA, iar diferenta e taxa;
 *   `cuTva ≈ pret`   → nu s-a aplicat nicio taxa pe cotarea asta;
 *   `cuTva` lipsa    → n-au raportat, si asta NU inseamna „fara TVA".
 *
 * Ultimul caz e cel care conteaza: un „fara TVA" afirmat gresit l-ar face pe
 * comerciant sa-si calculeze marja pe un pret cu o cincime mai mic decat il costa.
 */
export function explicatieTva(o: Pick<OfertaUps, "pret" | "cuTva" | "tva">): string | null {
  if (o.cuTva === null) return null;
  const diferenta = Math.round((o.cuTva - o.pret) * 100) / 100;
  if (diferenta <= 0.01) return "UPS n-a aplicat TVA pe cotarea asta.";
  return `+ TVA ${diferenta.toFixed(2)} lei (total cu TVA ${o.cuTva.toFixed(2)} lei)`;
}
