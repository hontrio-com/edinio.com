import { asTablou, numarSauNull, type DhlConfig, type OfertaDhl, type ServiciuOferta } from "./client";
import {
  codProdus,
  codProdusLocal,
  eDocument,
  eMarfaGrea,
  eVandutInRomania,
  numeProdus,
  numeServiciu,
  seCere,
} from "./servicii";

/**
 * Cotarea DHL Express → ce vede cumparatorul in checkout si comerciantul in modalul de AWB.
 *
 * ⚠ PUR: nu atinge reteaua. Aici stau chiar hotararile care se vad pe ecran — care oferte
 * se arata, in ce ordine, cum se numesc si ce se spune despre TVA — deci sunt si singurele
 * care se pot proba fara cont. La DHL asta atarna mai greu decat la ceilalti: mediul lor de
 * test da 500 de invocari pe zi pe credentiale, iar credentialele vin de la un consultant
 * DHL Express, nu dintr-un formular.
 *
 * ═══ ⚠ CHEIA UNEI OFERTE ARE DOUA PARTI ═══
 *
 * La UPS cheia era `Service.Code` si era de ajuns. Aici nu:
 *
 *   `productCode`       codul GLOBAL, o litera (`P`, `N`, `H`, `W`, `K`…)
 *   `localProductCode`  codul LOCAL al tarii, pe care ei il descriu „Important when
 *                       shipping domestic products."
 *
 * Acelasi `productCode` poate veni cu coduri locale diferite pe rute diferite, iar
 * `POST /shipments` le primeste pe amandoua. Reemiterea trebuie sa plece pe EXACT produsul
 * pentru care a platit cumparatorul — de aceea cheia le poarta pe amandoua, si de aceea
 * baza are doua coloane (`dhl_product_code`, `dhl_local_product_code`), nu una.
 *
 * ⚠ Codul local NU se compune niciodata de noi. Vezi `codProdusLocal` din `servicii.ts`:
 * documentatia lor se contrazice pe latimea lui (schema zice 1-3, exemplele scriu unul,
 * codurile publicate de DHL UK au trei). Se copiaza literal din raspunsul cotarii.
 *
 * ═══ ⚠ TREI PRETURI PENTRU ACELASI TRANSPORT, IN ACELASI RASPUNS ═══
 *
 * `totalPrice[]` e un TABLOU, si vine cu acelasi transport exprimat simultan in mai multe
 * valute. Verbatim, repetat identic in trei locuri din specificatia lor:
 *
 *   „Possible Values : 'BILLC', billing currency / 'PULCL', country public rates currency /
 *    'BASEC', base currency"
 *
 * In exemplul lor oficial: `BILLC` 157,95 GBP, `PULCL` 157,95 GBP, `BASEC` 182,84 EUR.
 *
 *   `BILLC`  valuta de FACTURARE a contului. ← SINGURUL care se citeste.
 *   `PULCL`  tariful PUBLIC al tarii, adica pretul de lista. Poate fi vizibil peste
 *            contractul comerciantului; citit din greseala, ii supraincarca cumparatorul.
 *   `BASEC`  valuta de baza a retelei lor, si prin propria lor definitie „either USD or
 *            EUR" — deci nu va fi NICIODATA RON. Citit primul element la intamplare,
 *            acelasi transport iese cand 250 (lei), cand 50 (euro).
 *
 * ⚠ Ghidul lor SOAP numeste `PULCL` „pickup location currency" la pagina 27, de doua ori,
 * si „country public rates currency" la pagina 39. Specificatia REST tine cu a doua, in
 * toate cele trei locuri. Nu conteaza care e adevarata: niciuna nu e `BILLC`.
 *
 * ⚠ SI NU E GARANTAT CA VIN TOATE TREI. `currencyType` si `priceCurrency` NU sunt in lista
 * `required` a elementului (`required: [price]`). Un `totalPrice[0]` luat ca rezerva cand
 * `BILLC` lipseste ia o valuta arbitrara. Aici lipsa lui `BILLC` opreste oferta.
 *
 * ═══ ⚠ `SPRQT` NU E TOTALUL ═══
 *
 * In devizul lor, `SPRQT` e „Net shipment / weight charge" — tariful de transport gol.
 * In exemplul lor oficial `SPRQT = 130` iar totalul e `157,95`: diferenta o fac suprataxa
 * de combustibil (27,68) si cea de situatie exceptionala (0,27). Cine afiseaza `SPRQT` ca
 * pret pierde 17,7% pe FIECARE comanda, tacut. Pretul e `totalPrice[BILLC].price`.
 *
 * ═══ ⚠ TVA-UL NU E DECLARAT NICAIERI, SE RECONSTITUIE ═══
 *
 * DHL nu are echivalentul lui `TotalChargesWithTaxes` de la UPS. Are un singur numar,
 * `STTXA` („Total tax for the shipment"), si NU spune daca el e deja inauntrul totalului.
 * Ce se poate dovedi e o singura afirmatie a lor, verbatim: „the sum of the charges
 * communicated in this structure will be equal to the charge in TotalNet." Deci suma
 * liniilor de deviz spune in ce tabara e taxa — vezi `totalulCuTva`. Cand nu se inchide
 * aritmetica, `cuTva` ramane `null` si se spune „nu stim". Vezi `explicatieTva`.
 */

/** Valuta in care lucreaza platforma. Un singur loc, ca sa nu apara doua adevaruri. */
export const VALUTA = "RON";

/**
 * ⚠ Singurul `currencyType` din care se citeste un ban. Vezi antetul.
 *
 * Nomenclatorul lor de tari da pentru `RO` `isoCurrency: RON`, iar ghidul lor de tarife
 * pentru Romania scrie sub fiecare din cele patru tabele „Rates are in lei" — deci un cont
 * romanesc factureaza in lei si `BILLC` trebuie sa vina `RON`.
 */
const TIP_FACTURARE = "BILLC";

/**
 * Cat se accepta ca diferenta cand se verifica daca suma liniilor de deviz da totalul.
 *
 * Fiecare linie vine rotunjita de ei la doi zecimali; un deviz de zece linii poate acumula
 * pana la 5 bani de eroare de rotunjire. Sub prag = „se inchide", nu „e egal".
 */
const TOLERANTA_RECONCILIERE = 0.05;

/**
 * ⚠ Sub greutatea asta, produsele de marfa grea nu se arata unui cumparator obisnuit.
 *
 * Aceeasi valoare ca la UPS, si din acelasi motiv: in practica `F`/`A`/`B` nici nu apar la
 * cotarea unui colet, dar „nu apar" nu e „nu pot aparea", iar tariful lor e de alta scara.
 */
const PRAG_MARFA_GREA_KG = 70;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/** Un ban din raspunsul lor, adus la doi zecimali. `price` poate veni si ca sir. */
function bani(v: unknown): number | null {
  const n = numarSauNull(v);
  return n === null ? null : Math.round(n * 100) / 100;
}

type Suma = { valoare: number; valuta: string };

/**
 * Suma in valuta de FACTURARE a contului.
 *
 * ⚠ NU are rezerva. Daca `BILLC` nu apare, oferta se pierde cu totul — si asa trebuie:
 * `PULCL` e tariful public si `BASEC` e in euro sau dolari. O rezerva pe `totalPrice[0]`
 * ar fi taxat magazinul cu pretul de lista sau ar fi scris 50 de euro ca 50 de lei.
 */
function sumaDeFacturare(lista: unknown): Suma | null {
  for (const x of asTablou<Record<string, unknown>>(lista)) {
    if (!x || typeof x !== "object") continue;
    if (text(x.currencyType).toUpperCase() !== TIP_FACTURARE) continue;
    const valoare = bani(x.price);
    if (valoare === null) continue;
    /* ⚠ `priceCurrency` nu e obligatoriu nici el. Lipsa lui se vede mai jos ca valuta
       goala, deci ca oferta refuzata — nu ca „probabil lei". */
    return { valoare, valuta: text(x.priceCurrency).toUpperCase() };
  }
  return null;
}

/**
 * Blocul de deviz din aceeasi valuta cu pretul ales.
 *
 * ⚠ `totalPriceBreakdown[]` si `detailedPriceBreakdown[]` vin AMANDOUA cate o data pentru
 * fiecare valuta, cu aceleasi coduri si alte cifre. Luata din blocul gresit, taxa ar fi in
 * euro peste un pret in lei — o suma care arata cuminte si e falsa.
 *
 * Cand blocul isi declara si `priceCurrency`, ea trebuie sa fie chiar valuta pretului;
 * cand nu si-o declara (nu e camp obligatoriu), `currencyType` ramane singurul martor.
 */
function blocul(lista: unknown, valuta: string | null): Record<string, unknown> | null {
  for (const b of asTablou<Record<string, unknown>>(lista)) {
    if (!b || typeof b !== "object") continue;
    if (text(b.currencyType).toUpperCase() !== TIP_FACTURARE) continue;
    if (valuta !== null) {
      const a = text(b.priceCurrency).toUpperCase();
      if (a && a !== valuta) continue;
    }
    return b;
  }
  return null;
}

/** Primul bloc de deviz, oricare ar fi valuta lui. Numai pentru ce NU tine de bani. */
function primulBloc(lista: unknown): Record<string, unknown> | null {
  for (const b of asTablou<Record<string, unknown>>(lista)) {
    if (b && typeof b === "object") return b;
  }
  return null;
}

/**
 * TVA-ul raportat de ei, `STTXA` („Total tax for the shipment").
 *
 * ⚠⚠ ZERO SI LIPSA INSEAMNA ACELASI LUCRU AICI: „nu au raportat". NU inseamna „fara TVA".
 * In exemplul lor oficial `STTXA` e `0` pe toate cele trei valute, iar ghidul lor de tarife
 * pentru Romania spune de patru ori „Rates are in lei and exclude ... VAT and all
 * surcharges" — deci zeroul lor e cel mai probabil „nu-l calculam noi", nu „nu se aplica".
 *
 * Un „fara TVA" afirmat gresit il face pe comerciant sa-si calculeze marja pe un pret cu o
 * cincime mai mic decat il costa. De aceea zeroul iese de aici ca `null`, iar mai departe
 * `explicatieTva` spune „nu stim" in loc sa linisteasca pe cineva degeaba.
 */
function taxaRaportata(bloc: Record<string, unknown> | null): number | null {
  if (!bloc) return null;
  for (const p of asTablou<Record<string, unknown>>(bloc.priceBreakdown)) {
    if (!p || typeof p !== "object") continue;
    if (text(p.typeCode).toUpperCase() !== "STTXA") continue;
    const v = bani(p.price);
    return v !== null && v > 0 ? v : null;
  }
  return null;
}

/**
 * Suma liniilor de deviz care CHIAR au un pret.
 *
 * ⚠ `breakdown[]` amesteca doua lucruri care nu seamana: liniile FACTURATE (transportul,
 * combustibilul, suprataxele — cu `price`) si CATALOGUL serviciilor doar disponibile pe
 * ruta aceea (livrare sambata, posta diplomatica, GoGreen — FARA `price`), pe care ei il
 * trimit cand cererea a cerut `getAdditionalInformation: allValueAddedServices`.
 * Adunate laolalta, catalogul ar adauga zerouri si suma s-ar inchide degeaba.
 */
function sumaLiniilor(bloc: Record<string, unknown> | null): number | null {
  if (!bloc) return null;
  let suma = 0;
  let gasit = false;
  for (const linie of asTablou<Record<string, unknown>>(bloc.breakdown)) {
    if (!linie || typeof linie !== "object") continue;
    const v = numarSauNull(linie.price);
    if (v === null) continue;
    suma += v;
    gasit = true;
  }
  return gasit ? Math.round(suma * 100) / 100 : null;
}

/**
 * Totalul cu TVA — dar numai cand se poate DOVEDI, nu cand se poate banui.
 *
 * Temeiul e o singura afirmatie a lor, verbatim: „the sum of the charges communicated in
 * this structure will be equal to the charge in TotalNet." Verificata pe exemplul lor
 * oficial: 130 (transport) + 0,27 (situatie exceptionala) + 27,68 (combustibil) = 157,95,
 * adica exact `totalPrice[BILLC]`. Deci suma liniilor spune in ce tabara e taxa:
 *
 *   suma liniilor ≈ pret          → in pret intra numai transportul si suprataxele,
 *                                   deci `STTXA` sta PE DEASUPRA  → cuTva = pret + tva
 *   suma liniilor + tva ≈ pret    → taxa e deja INAUNTRU           → cuTva = pret
 *   nimic nu se inchide           → nu stim, si nu inventam        → null
 *
 * ⚠ Ramura a treia nu e un esec, e raspunsul corect cand ei nu trimit deviz detaliat.
 * Alternativa — sa presupunem ca tarifele romanesti sunt fara TVA fiindca asa scrie in
 * ghidul lor comercial — ar fi o afirmatie despre API scoasa dintr-un PDF de vanzari.
 */
function totalulCuTva(pret: number, tva: number | null, liniile: number | null): number | null {
  if (tva === null || liniile === null) return null;
  if (Math.abs(liniile - pret) <= TOLERANTA_RECONCILIERE) return Math.round((pret + tva) * 100) / 100;
  if (Math.abs(liniile + tva - pret) <= TOLERANTA_RECONCILIERE) return pret;
  return null;
}

/**
 * Serviciile de pe oferta, pentru devizul din panou.
 *
 * ⚠ PRIMA LINIE DIN `breakdown[]` NU E UN SERVICIU. Verbatim: „name within the first
 * occurrence of breakdown will be the Global Product Name." Ea poarta transportul insusi
 * (in exemplul lor: „EXPRESS WORLDWIDE", 130) si NU are `serviceCode`. De aceea filtrul e
 * chiar pe existenta lui `serviceCode`: el desparte devizul de produs.
 *
 * ⚠ CE INSEAMNA `tip`, fiindca de el atarna cum se citeste lista in interfata. Ghidul lor:
 *   XCH = Extra charge — serviciu OPTIONAL, „should be displayed to users for selection";
 *   SCH = Surcharge    — suprataxa automata, e DEJA in pret (combustibil, zona indepartata);
 *   FEE = Fee          — taxa aplicata de ei;
 *   TEC = technical, NRI = Non Revenue Item — marcaje interne, nu se arata ca optiuni.
 * Deci „din ce se compune pretul" sunt liniile `SCH`/`FEE`, iar „ce se mai poate cere" sunt
 * cele `XCH`. Aceeasi lista, doua citiri; de asta `tip` calatoreste pe fiecare rand.
 *
 * ⚠ `serviceTypeCode` din raspuns bate tabelul nostru din `servicii.ts`: el e al CONTULUI
 * si al RUTEI, tabelul nostru e o transcriere globala. Tabelul ramane doar ca rezerva, cand
 * ei nu trimit tipul.
 *
 * ⚠⚠ SI AICI E LOCUL DIN CARE CINEVA VA FI TENTAT SA RECICLEZE CODURI LA EMITERE. Verbatim,
 * despre exact lista asta: „Please note that FF (Fuel Surcharge) should not be used as this
 * is automatically added during billing." In exemplul lor `FF` face 27,68 din 157,95 — adica
 * 17,5% cerut a doua oara. Nu se trimit inapoi decat coduri `XCH`, si nici acelea din oficiu.
 */
function serviciileDin(bloc: Record<string, unknown> | null): ServiciuOferta[] {
  const rezultat: ServiciuOferta[] = [];
  const vazute = new Set<string>();
  for (const linie of asTablou<Record<string, unknown>>(bloc?.breakdown)) {
    if (!linie || typeof linie !== "object") continue;
    const cod = text(linie.serviceCode).toUpperCase();
    /* ⚠ Se pastreaza PRIMA aparitie: liniile facturate vin inaintea catalogului, deci
       prima poarta tipul real al platii, nu pe cel al ofertei nefolosite. */
    if (!cod || vazute.has(cod)) continue;
    vazute.add(cod);

    const tipulLor = text(linie.serviceTypeCode).toUpperCase();
    rezultat.push({
      cod,
      nume: numeServiciu(cod, text(linie.name)),
      tip: tipulLor || (seCere(cod) ? "XCH" : ""),
      /* ⚠ La nivel de linie, `isCustomerAgreement` inseamna „serviciul asta cere acord
         prealabil", nu „contul tau il are". Vezi nota de la oferta. */
      cereContract: linie.isCustomerAgreement === true,
    });
  }
  return rezultat;
}

export type FiltruOferte = {
  /** Greutatea comenzii, pentru a scoate produsele de marfa grea din checkout. */
  greutateKg?: number;
  /**
   * Tara de plecare si cea de destinatie.
   *
   * ⚠ NU filtreaza — vezi nota din bucla. Alimenteaza doar `neVanduteInRomania`, care e un
   * semnal pentru comerciant, nu o poarta.
   */
  taraExpeditor?: string;
  taraDestinatar?: string;
};

export type RezultatOferte = {
  oferte: OfertaDhl[];
  /**
   * ⚠ Valutele in care a cotat DHL si pe care le-am refuzat.
   *
   * Nu e statistica: e singurul fel in care un comerciant afla de ce nu vede DHL in checkout
   * desi „conexiunea merge". Un cont care nu factureaza in lei nu e o problema de curs, e o
   * problema de cont — si se rezolva la reprezentantul DHL, nu in cod.
   *
   * ⚠ Contine si „necunoscuta", pentru ofertele la care `BILLC` lipsea cu totul sau venea
   * fara `priceCurrency`. Nu sunt valute, dar sunt tot oferte pierdute, si tacerea ar fi
   * fost mai rea decat cuvantul aproximativ.
   */
  valuteRefuzate: string[];
  /**
   * `warnings[]` de la nivelul raspunsului. Se arata, nu se ascund.
   *
   * ⚠ Ele sosesc pe un HTTP 200. Al lor „Price can't be calculated" e chiar cazul in care
   * cotarea „reuseste" si nu are pret; seria `410501-410515` („Pickup/Delivery PL fallback
   * rule applied") spune ca DHL a ales SINGUR o locatie fiindca adresa noastra era ambigua —
   * ceea ce pentru Bucuresti fara sector se va intampla des, cu 200 si cu alt pret.
   */
  alerte: string[];
  /**
   * ⚠ Produse pe care DHL le-a cotat desi documentele lor comerciale romanesti nu le dau pe
   * ruta asta.
   *
   * Nu se ascund si nu se blocheaza — daca ei le-au intors pe contul real, ei le vand (vezi
   * nota din bucla si antetul lui `servicii.ts`). Dar se SPUN: acolo ori documentul lor e
   * invechit, ori contul comerciantului are un contract aparte.
   */
  neVanduteInRomania: string[];
  /**
   * ⚠ Produse marcate de ei `isCustomerAgreement: true`, adica „the product only can be
   * offered to customers with prior agreement".
   *
   * Se ARATA, nu se filtreaza: e o insusire a PRODUSULUI, nu un raspuns despre contul asta.
   * Daca lipseste acordul, emiterea cade zgomotos cu `8003` („Account not allowed for this
   * service. Please contact your DHL Express representative.") sau `8036` — deci pierderea e
   * o comanda blocata, nu un cost tacut. Merita spus inainte, nu dupa.
   */
  cerContract: string[];
};

/**
 * Ofertele care se pot arata, filtrate si asezate.
 *
 * ⚠ Filtrul pe produse e alegerea comerciantului; lista goala inseamna „toate cele pe care
 * le da contul", nu „niciunul". Aceeasi regula ca la `servicii_permise` al UPS/FedEx si
 * `curieri_permisi` al Shipo.
 */
export function ofertePosibile(
  brute: unknown[],
  config?: Pick<DhlConfig, "produse_permise">,
  filtru?: FiltruOferte,
  avertismenteCerere: string[] = [],
): RezultatOferte {
  const permise = new Set(
    (config?.produse_permise ?? []).map((x) => codProdus(x)).filter((x): x is string => !!x),
  );
  const taraExpeditor = (filtru?.taraExpeditor || "RO").toUpperCase();
  const taraDestinatar = (filtru?.taraDestinatar || "RO").toUpperCase();
  const greutateKg = Number(filtru?.greutateKg ?? 0);

  const oferte: OfertaDhl[] = [];
  const valuteRefuzate = new Set<string>();
  const neVandute = new Set<string>();
  const cerAcord = new Set<string>();
  const vazute = new Set<string>();

  for (const brut of brute ?? []) {
    if (!brut || typeof brut !== "object") continue;
    const o = brut as Record<string, unknown>;

    const cod = codProdus(o.productCode);
    if (!cod) continue;
    if (permise.size > 0 && !permise.has(cod)) continue;
    if (eMarfaGrea(cod) && greutateKg <= PRAG_MARFA_GREA_KG) continue;

    /*
     * ⚠⚠ AICI NU SE FILTREAZA DUPA TABELUL NOSTRU DE PRODUSE, SI E O HOTARARE.
     *
     * `POST /rates` primeste `accounts[]` cu contul real al comerciantului, iar prin propria
     * lor descriere intoarce produsele pentru care „the delivery is feasible respecting the
     * input data from the request". Deci DHL a filtrat deja, pe contract, pe ruta si pe zi.
     * Ce a intors el, el vinde. Ascuns de noi pe temeiul unui PDF comercial din care am citit
     * sase randuri din doua sute treizeci si patru, cumparatorul ar fi platit varianta mai
     * scumpa fara motiv.
     *
     * Ramane doar semnalul: `neVanduteInRomania`. Aceeasi lectie ca la UPS, unde prima
     * varianta folosea lista comerciala ca poarta si a trebuit intoarsa.
     */

    const local = codProdusLocal(o.localProductCode);
    const cheie = local ? `${cod}|${local}` : cod;
    if (vazute.has(cheie)) continue;

    const ales = sumaDeFacturare(o.totalPrice);
    if (!ales) {
      /* ⚠ Nu e o valuta, dar e tot o oferta pierduta. Vezi `valuteRefuzate`. */
      valuteRefuzate.add("necunoscuta");
      continue;
    }
    /*
     * ⚠ Un transport de 0 lei ar fi ales de FIECARE cumparator, si ar fi platit de magazin.
     * Zeroul apare tocmai cand ei nu stiu sa coteze — avertismentul lor propriu, verbatim,
     * e „Price can't be calculated", si vine pe un 200.
     */
    if (!(ales.valoare > 0)) continue;
    if (ales.valuta !== VALUTA) {
      valuteRefuzate.add(ales.valuta || "necunoscuta");
      continue;
    }

    vazute.add(cheie);

    /*
     * ⚠ Numele omenesc, nu codul. Un `productCode` are o singura litera; „P" scris intr-un
     * checkout romanesc arata a defect si nu se apasa. `numeProdus` cade pe numele LOR cand
     * codul ne e necunoscut, si abia la urma pe cod.
     */
    const nume = numeProdus(cod, text(o.productName));
    if (!eVandutInRomania(cod, taraExpeditor, taraDestinatar)) neVandute.add(nume);

    /*
     * ⚠ La nivel de produs, `isCustomerAgreement` inseamna „produsul asta CERE acord
     * prealabil", nu „contul tau il are". Nu e un raspuns despre comerciant, deci nu poate
     * fi o poarta — dar interfata trebuie sa-i poata spune ca s-ar putea sa nu-i mearga.
     */
    const cereContract = o.isCustomerAgreement === true;
    if (cereContract) cerAcord.add(nume);

    const blocTotal = blocul(o.totalPriceBreakdown, ales.valuta);
    /* Codurile de serviciu sunt aceleasi in orice valuta, deci pentru ELE se poate cadea pe
       primul bloc. Pentru bani, niciodata — vezi `blocul`. */
    const blocDetaliat = blocul(o.detailedPriceBreakdown, ales.valuta) ?? primulBloc(o.detailedPriceBreakdown);
    const tva = taxaRaportata(blocTotal);

    const livrare = (o.deliveryCapabilities ?? {}) as Record<string, unknown>;
    const zile = numarSauNull(livrare.totalTransitDays);

    oferte.push({
      productCode: cod,
      localProductCode: local,
      productName: nume,
      pret: ales.valoare,
      valuta: ales.valuta,
      cuTva: totalulCuTva(ales.valoare, tva, sumaLiniilor(blocDetaliat)),
      tva,
      /* ⚠ Zeroul se trateaza ca necunoscut, nu ca „in aceeasi zi": campul e optional la ei,
         iar o promisiune de livrare in aceeasi zi scoasa dintr-un zero implicit nu se poate
         sustine. Pierdem o informatie rara; cealalta greseala ar fi o comanda ratata. */
      tranzit: zile !== null && zile > 0 ? Math.round(zile) : null,
      /* ⚠ Sirul lor NU are fus („2019-09-20T12:00:00") si e ora locala a DESTINATIEI:
         „the local timestamp (based on delivery location) when the shipment will be
         delivered by". Citit ca UTC sau ca ora magazinului, da alta zi pe rutele externe.
         De aceea pleaca de aici BRUT, si se formateaza acolo unde se stie tara. */
      livrareEstimata: text(livrare.estimatedDeliveryDateAndTime) || null,
      tipEstimare: text(livrare.deliveryTypeCode).toUpperCase() || null,
      document: eDocument(cod),
      cereContract,
      servicii: serviciileDin(blocDetaliat),
    });
  }

  return {
    /*
     * ⚠ SORTAREA DUPA PRET NU E UN MOFT, E O REPARATIE.
     *
     * Din tabelele lor de tarife pentru Romania, Zona 1: la 1 kg Express Worldwide costa
     * 452,50 lei si Economy Select 473,00 — Economy Select e mai SCUMP. Abia de la 2 kg se
     * inverseaza (659,26 fata de 625,00), iar in Zona 4 punctul de incrucisare urca la ~3 kg.
     * Coletul tipic al unui magazin online e sub 2 kg. O ordine scrisa de noi („economy =
     * ieftin") ar fi facturat in plus exact pe cazul cel mai des.
     */
    oferte: oferte.sort((a, b) => a.pret - b.pret),
    valuteRefuzate: [...valuteRefuzate],
    alerte: [...new Set(avertismenteCerere.map((a) => text(a)).filter(Boolean))],
    neVanduteInRomania: [...neVandute],
    cerContract: [...cerAcord],
  };
}

/** „o zi lucratoare" / „3 zile lucratoare". Un singur loc, ca sa nu apara doua forme. */
function zileText(n: number): string {
  return n === 1 ? "o zi lucratoare" : `${n} zile lucratoare`;
}

/**
 * Eticheta ofertei, asa cum o vede cumparatorul.
 *
 * ⚠ „ESTIMATIV" NU E O POLITETE. Functia nu primeste `tipEstimare` — si nici nu ar ajuta-o,
 * fiindca implicitul lor e `QDDF`, despre care ei insisi scriu ca „does not constitute DHL's
 * service commitment"; numai `QDDC` e angajament, si el include timpul de vamuire. Pe o ruta
 * extra-UE diferenta dintre cele doua e de ZILE. Un termen scris ca promisiune, dar cotat pe
 * `QDDF`, devine o reclamatie pe care magazinul o plateste, nu DHL.
 */
export function etichetaOferta(o: Pick<OfertaDhl, "productName" | "tranzit">): string {
  const nume = (o.productName ?? "").trim() || "DHL";
  return o.tranzit !== null && o.tranzit > 0 ? `${nume} (estimativ ${zileText(o.tranzit)})` : nume;
}

/**
 * Cheia unei oferte. Un singur loc care o compune, ca sa nu apara doua forme.
 *
 * ⚠ Sirul e OPAC: nu se desface inapoi niciodata. Cele doua coduri se pastreaza separat
 * (`dhl_product_code`, `dhl_local_product_code`) tocmai ca sa nu depinda emiterea de un
 * separator ales aici.
 */
export function cheiaOfertei(o: Pick<OfertaDhl, "productCode" | "localProductCode">): string {
  const local = (o.localProductCode ?? "").trim();
  return local ? `${o.productCode}|${local}` : o.productCode;
}

/**
 * Cat TVA are oferta, si cum se spune omului.
 *
 * ⚠ NU SE PRESUPUNE NIMIC, si sunt trei raspunsuri, nu doua:
 *
 *   pretul NU include TVA   — s-a putut dovedi: suma liniilor de deviz da chiar totalul,
 *                             deci `STTXA` sta pe deasupra;
 *   pretul INCLUDE TVA      — s-a putut dovedi invers: suma liniilor plus taxa da totalul;
 *   NU STIM                 — ei n-au raportat taxa, sau devizul nu s-a inchis nicicum.
 *
 * ⚠ Functia nu intoarce niciodata `null`, desi tipul o permite: tacerea e chiar cazul
 * periculos. Un „fara TVA" presupus il face pe comerciant sa-si calculeze marja pe un pret
 * cu o cincime mai mic decat il costa, iar un TVA adaugat peste un pret care il continea
 * deja il aplica de doua ori. Amandoua se vad abia pe factura, luna urmatoare.
 */
export function explicatieTva(o: Pick<OfertaDhl, "pret" | "cuTva" | "tva">): string | null {
  if (o.tva === null || !(o.tva > 0)) {
    return "DHL n-a raportat TVA pe cotarea asta (campul STTXA lipseste sau e zero). Zero inseamna ca nu l-au calculat, nu ca pretul e fara TVA.";
  }
  if (o.cuTva === null) {
    return `DHL a raportat TVA ${o.tva.toFixed(2)} lei, dar devizul nu spune daca e deja in pret. Verifica pe prima factura.`;
  }
  const diferenta = Math.round((o.cuTva - o.pret) * 100) / 100;
  if (diferenta <= 0.01) return `Pretul include deja TVA ${o.tva.toFixed(2)} lei.`;
  return `+ TVA ${diferenta.toFixed(2)} lei (total cu TVA ${o.cuTva.toFixed(2)} lei)`;
}
