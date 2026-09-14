import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cotatie de transport semnata.
 *
 * Costul livrarii era singurul numar din comanda pe care serverul il lua de la
 * client fara sa il verifice: preturile produselor, reducerea, TVA-ul,
 * extraoptiunile si reducerea de card se recalculeaza toate server-side, dar
 * transportul se scria asa cum venea. Cine trimitea zero primea livrare gratuita,
 * iar comerciantul platea oricum curierul.
 *
 * Verificarea nu se poate face recalculand la plasarea comenzii: pretul vine de
 * la API-urile curierilor, deci ar insemna inca un apel extern exact in pasul cu
 * banii, cu latenta si cu un mod nou de esec. Semnam in schimb fiecare optiune
 * chiar cand o calculam, iar la comanda verificam semnatura. E O(1), fara retea,
 * si exact — acelasi tipar cu tokenul de IPN Netopia.
 *
 * Semnatura leaga pretul de magazin SI de destinatie: altfel cineva ar cere o
 * cotatie pentru un oras apropiat si ar folosi-o pentru unul scump. Are si
 * termen de valabilitate, ca o cotatie veche sa nu poata fi refolosita la
 * nesfarsit dupa ce comerciantul si-a schimbat tarifele.
 *
 * REGULA, cand se adauga ceva: in amprenta intra tot ce a produs pretul SI se
 * poate reconstrui exact la plasarea comenzii. A doua conditie nu e un moft —
 * ce nu se reconstruieste exact cade la verificare si comanda pleaca pe
 * `max(suma ceruta, tarif implicit)`, adica omul vede 0,00 pe ecran la „Ridicare
 * personala" si plateste 18-45 de lei. De aceea sunt legate destinatia, curierul,
 * tipul de livrare, eticheta si regimul de ramburs, si NU e legat inca cosul:
 * greutatea iese din lista de produse declarata de client, dar la comanda ar
 * trebui reconstruita din liniile finale, cu pachete desfacute si oferte
 * acordate server-side. Vezi `getShippingOptions` pentru cat costa asta azi.
 *
 * DECIS 04.08.2026, dupa auditul de securitate: RAMANE ASA, deliberat.
 *
 * Compromisul, pus pe masa inainte de decizie: gaura e exploatabila azi de UN
 * SINGUR magazin (doar tonel-beauty are produse cantarite, maximum 1 kg bucata),
 * in timp ce o legare GRESITA a cosului trimite comenzi REALE pe
 * `max(suma ceruta, tarif implicit)` — adica omul vede 0,00 la „Ridicare
 * personala" si plateste 18-45 de lei. Cinci magazine publicate au ridicare
 * personala langa curieri platiti. Riscul pentru cumparatori depaseste castigul.
 *
 * Ce S-A facut in schimb, fiindca se putea face fara risc: subtotalul folosit de
 * REGULILE de transport e acum plafonat cu pretul din catalog
 * (`subtotalMaximDinCatalog` din cart-weight.ts), deci nu mai poate fi UMFLAT ca
 * sa scoata livrare gratuita semnata. Aia era partea exploatabila si de
 * magazinele fara greutati in catalog — adica de aproape toate.
 *
 * Daca cineva reia asta: nu lega cosul cu esec pe tariful implicit. Esueaza in
 * FAVOAREA clientului (refuza comanda si cere recotare), altfel un caz de colt
 * netestat se plateste din buzunarul cumparatorului.
 */
function secret(): string {
  return process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/** Cat timp ramane valabila o cotatie. Acopera lejer o sesiune de cumparaturi. */
const VALABILITATE_MS = 24 * 60 * 60 * 1000;

export interface QuoteDestination {
  county?: string | null;
  city?: string | null;
  country?: string | null;
  postCode?: string | null;
}

/**
 * Optiunea careia ii apartine pretul.
 *
 * Fara ea, semnatura spunea doar „am cotat noi suma asta pentru destinatia asta",
 * si toate optiunile aceleiasi destinatii se legitimau reciproc. „Ridicare
 * personala" produce mereu o optiune de 0 lei, semnata valid: cu tokenul ei si
 * `shipping_cost: 0` se putea comanda livrare la domiciliu. Cinci magazine
 * publicate au pickup pornit langa curieri platiti — tonel-beauty (0 langa
 * Cargus 17 si DPD 18), ciprian-piese-auto-brasov, esafero (0 langa 45),
 * yulmis-sound, medclean — deci comerciantul platea toata cursa.
 *
 * Aici sta TOT ce muta pretul in afara destinatiei, nu doar „ce a bifat omul":
 * regimul de ramburs schimba tariful la fel de tare ca alegerea curierului, deci
 * are acelasi drept sa fie in amprenta.
 */
export interface QuoteOption {
  courier?: string | null;
  deliveryType?: string | null;
  /**
   * Eticheta, semnata si ea.
   *
   * E textul pe care il citeste OMUL: in panou, in emailul de comanda noua si pe
   * randul de transport al facturii. Lasat sir liber de la client, legarea
   * curierului nu ajungea: se trimitea tokenul valid de „Ridicare personala"
   * (0 lei) cu eticheta „Livrare prin Cargus", si comerciantul citea Cargus
   * langa un transport de 0,00.
   *
   * Se SEMNEAZA in loc sa se deduca fiindca eticheta poarta lucruri pe care
   * comanda nu le mai stie: sufixul de locker („Sameday EasyBox (locker)"),
   * numele transportatorului real al unui broker si tara la international
   * („DPD International (Germania)"). Dedusa, toate astea se pierdeau.
   */
  courierLabel?: string | null;
  /**
   * Incaseaza curierul bani la livrare pentru cotatia asta?
   *
   * `cod` era un numar trimis de browser care intra DIRECT in cererea catre
   * curier — `estimateSamedayCost` (`cashOnDelivery`), `calculateDpdDomesticPrice`
   * si `calculateCargusPrice` (`cod`), FAN Courier (comuta serviciul pe „Cont
   * Colector"), Woot (`repayment`), Colete. Comisionul de ramburs iese din el.
   * Se cerea o cotatie cu `cod: 0`, iesea pretul FARA comision, se semna valid,
   * si cu el se comanda apoi ramburs. Nu depindea de nicio regula de transport,
   * deci era exploatabil chiar asa cum era productia.
   *
   * Trei magazine din 127 coteaza live (masurat 2026-08-03: okxi/sameday,
   * tonel-beauty/cargus+dpd, yulmis-sound/fan-courier) si TOATE TREI ofera
   * ramburs. Cel mai expus e okxi: are ramburs ca SINGURA metoda de plata, iar
   * `default_shipping_cost` si pretul zonei sunt amandoua 0,00 — adica rezerva
   * `max(suma ceruta, tarif implicit)` din `autoritativeShipping` nu apara acolo
   * nimic. O comanda reala de acolo a fost cotata live la 19,00 lei, cu zona pe
   * 0: deci cotatia live chiar raspunde, nu cade pe tarif fix.
   *
   * Se semneaza STEAGUL, nu suma. Suma nu se poate reconstrui la comanda: e
   * chiar totalul comenzii, care contine transportul pe care tocmai il
   * verificam, si oricum cele doua formulare trimit lucruri diferite (cosul
   * trimite totalul, formularul de produs subtotalul). Steagul, in schimb, se
   * reconstruieste EXACT din metoda de plata validata server-side.
   *
   * CAT ANUME LEAGA, pe fata: la FAN Courier pretul comuta pe un boolean
   * („Cont Colector" fata de „Standard"), deci acolo legarea e etansa. La
   * ceilalti cinci — Sameday, DPD, Cargus, Woot, Colete — ce ajunge la API e
   * SUMA, deci steagul nu face decat sa ridice pretul atacului de la `cod: 0` la
   * `cod: 0.01`: cine subdeclara pastreaza steagul si scapa cu partea
   * procentuala a comisionului. Cat inseamna partea aia NU s-a masurat — cere un
   * apel real la fiecare curier. Ce s-a inchis sigur e cazul `cod: 0`, adica
   * pretul fara niciun comision.
   */
  ramburs: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLANUL EXPEDIERII, SEMNAT SI EL                              (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana azi amprenta lega pretul, destinatia, curierul, tipul de livrare, eticheta si regimul
 * de ramburs. Nu lega SERVICIUL. Iar `ShippingOption` il poarta de mult, cu motivul scris pe
 * fiecare camp: `shipoRateId`, `upsServiceCode`, `dhlProductCode` plus `dhlLocalProductCode`,
 * `smartshipOwnContract`, `smartshipLockerNet`, `fanPointType`, `innoshipOptionId`,
 * `ecoletServiceSlug` si restul.
 *
 * ⚠ ATACUL, in forma lui cea mai ieftina: cumparatorul cere cotatiile cinstit si primeste doua
 * oferte ale ACELUIASI curier: `rate_id 101` la 18 lei si `rate_id 205`, express, la 42. Alege
 * pe cea de 18 si primeste tokenul ei. La trimiterea comenzii schimba UN SINGUR camp,
 * `shipo_rate_id`, si lasa neatinse pretul, tokenul, curierul, eticheta si destinatia. Totul
 * bate, fiindca nimic din ce bate nu cuprinde serviciul. Comanda intra la 18 lei pe un serviciu
 * de 42, iar diferenta o plateste comerciantul la emitere.
 *
 * Aceeasi forma la UPS (unde codul lipsa face furnizorul sa factureze TACIT cel mai scump
 * produs), la SmartShip (acelasi curier pe doua contracte, la preturi diferite) si la punctul de
 * ridicare, unde `locker_id` hotaraste UNDE ajunge coletul.
 */
export interface PlanExpedierii {
  /** Brokeri: cheia ofertei, cum o poarta chiar optiunea cotata. */
  wootServiceId?: number | null;
  coleteServiceId?: number | null;
  ecoletServiceSlug?: string | null;
  innoshipCourierId?: number | null;
  innoshipServiceId?: number | null;
  innoshipOptionId?: string | null;
  /** ⚠ Contractul intra in plan: acelasi curier apare de doua ori, la preturi diferite. */
  smartshipCourierId?: number | null;
  smartshipOwnContract?: boolean | null;
  smartshipLockerNet?: string | null;
  shipoRateId?: number | null;
  /** Transportatori: serviciul lor ales. */
  fedexServiceType?: string | null;
  upsServiceCode?: string | null;
  dhlProductCode?: string | null;
  dhlLocalProductCode?: string | null;
  /** ⚠ Reteaua punctului FAN: FANbox, PayPoint si oficiu vin toate sub acelasi `deliveryType`. */
  fanPointType?: string | null;
}

/*
 * ⚠ DE CE NU E AICI SI PUNCTUL DE RIDICARE, desi el hotaraste UNDE ajunge coletul.
 *
 * `locker_id` nu se poate semna la cotare fiindca la cotare NU EXISTA: lista de puncte se cere
 * separat, cu `getLockers`, dupa ce cumparatorul a ales curierul. `ShippingOption` nici nu are
 * un asemenea camp.
 *
 * Legat aici, amprenta semnata ar fi fost mereu fara punct, iar cea pretinsa la comanda ar fi
 * avut unul: FIECARE comanda cinstita la locker ar fi cazut cu motivul `plan`, adica ar fi fost
 * refuzata. Chiar capcana despre care antetul acestui fisier avertizeaza: „nu lega ce nu se poate
 * reconstrui exact la plasarea comenzii".
 *
 * Punctul cere alta paza, si ea e alta lucrare: ca id-ul ales sa apartina RETELEI semnate
 * (`fanPointType`, `smartshipLockerNet`), verificat la emitere, unde reteaua chiar se cunoaste.
 */

/**
 * Planul, normalizat la un sir stabil.
 *
 * ⚠ ORDINEA E FIXA SI SCRISA DE MANA, nu din `Object.keys`: ordinea cheilor unui obiect literal
 * depinde de cine l-a construit, iar doua obiecte cu aceleasi valori ar fi dat amprente diferite.
 * Atunci fiecare comanda cinstita ar fi cazut pe „plan schimbat", adica exact pe drumul care
 * REFUZA comanda.
 *
 * ⚠ Campul lipsa si campul gol se scriu la fel, fiindca si sunt la fel: browserul trimite cand
 * `undefined`, cand `""`, cand `null` pentru acelasi „n-am ales nimic".
 */
export function amprentaPlanului(plan: PlanExpedierii | null | undefined): string {
  if (!plan) return "";
  const p = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "1" : "0";
    return String(v).trim().toLowerCase();
  };
  const parti = [
    p(plan.wootServiceId), p(plan.coleteServiceId), p(plan.ecoletServiceSlug),
    p(plan.innoshipCourierId), p(plan.innoshipServiceId), p(plan.innoshipOptionId),
    p(plan.smartshipCourierId), p(plan.smartshipOwnContract), p(plan.smartshipLockerNet),
    p(plan.shipoRateId), p(plan.fedexServiceType), p(plan.upsServiceCode),
    p(plan.dhlProductCode), p(plan.dhlLocalProductCode), p(plan.fanPointType),
  ];
  /* Toate goale inseamna „fara plan de serviciu": un curier simplu, la adresa. */
  if (parti.every((x) => x === "")) return "";
  return createHmac("sha256", secret()).update(parti.join("~")).digest("base64url").slice(0, 16);
}

/** Cotatia, normalizata, ca sa semneze la fel si la cotare, si la comanda. */
function amprenta(businessId: string, dest: QuoteDestination, price: number, optiune: QuoteOption): string {
  const parte = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return [
    businessId,
    parte(dest.county),
    parte(dest.city),
    parte(dest.country) || "ro",
    parte(dest.postCode),
    // Doi bani sunt doi bani: semnam in bani, nu in lei cu virgula mobila.
    String(Math.round((Number(price) || 0) * 100)),
    parte(optiune.courier),
    parte(optiune.deliveryType),
    parte(optiune.courierLabel),
    optiune.ramburs ? "ramburs" : "platit",
  ].join("|");
}

/**
 * ═══ ⚠ GREUTATEA COTATA, PURTATA IN CLAR SI SEMNATA ═══
 *
 * Pana pe 08.09.2026 amprenta NU lega cosul, si asta era scris pe fata aici, ca decizie luata pe
 * 04.08 dupa auditul de securitate. Motivul de atunci: gaura era exploatabila la UN SINGUR magazin
 * (253 de produse cantarite, cel mult 1 kg bucata), in timp ce o legare GRESITA a cosului trimite
 * comenzi REALE pe `max(suma ceruta, tarif implicit)`, adica omul vede 0,00 lei la „Ridicare
 * personala" si plateste intre 18 si 45. Riscul pentru cumparatori depasea castigul.
 *
 * ⚠ PREMISA S-A SCHIMBAT, si asta s-a masurat, nu presupus. Pe 08.09.2026: 16 magazine cu curier
 * activ (erau 3), 16 magazine cu produse cantarite, 5.064 de produse cu greutate, pana la 40 de
 * kilograme bucata. Ce era un colt e acum drumul obisnuit.
 *
 * ═══ ⚠ DE CE GREUTATEA, SI DE CE IN CLAR ═══
 *
 * Nu se leaga lista de produse, ci NUMARUL pe care lista il produce si care pleaca la curier. Doua
 * castiguri:
 *
 *   1. Nu cere ca liniile finale sa fie identice cu cele cotate. Intre cotatie si comanda serverul
 *      repretuieste ofertele si desface pachetele pentru stoc; o amprenta pe linii ar fi cazut la
 *      fiecare dintre ele, si atunci ar fi cazut chiar comenzi cinstite.
 *
 *   2. Se poate compara cu „mai mic sau egal" in loc de „identic". Un cos mai USOR decat cel cotat
 *      trece: clientul plateste un transport prea scump pentru el, comerciantul nu pierde nimic, si
 *      nicio comanda cinstita nu se blocheaza. Doar cosul mai GREU cade, si aia e chiar singura
 *      forma a atacului.
 *
 * Ca sa se poata compara, gramele calatoresc IN CLAR in token si sunt acoperite de semnatura: doar
 * asa verificarea stie fata de ce sa compare, fara sa ghiceasca.
 *
 * ⚠ CE NU LEAGA: clasele si categoriile de transport, pe care se pot scrie reguli conditionate.
 * Masurat pe 08.09.2026: ZERO magazine din 131 au vreo clasa sau vreo regula de transport, deci azi
 * vectorul ala e gol. Cine adauga reguli sa recitesca randurile astea.
 */
export const TOLERANTA_GRAME = 5;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUMA RAMBURSULUI, SEMNATA CA SI GREUTATEA                    (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `pragulRambursului` primea drept podea `min(subtotal din browser, plafonul din catalog)`.
 * Amandoi termenii veneau de la client, deci podeaua se putea COBORI: `subtotal: 0.01` o duce
 * la un ban, iar `cart` omis o duce la ZERO, fiindca plafonul din catalog se socoteste chiar
 * din liniile declarate. Un `max` peste o podea coborata nu ridica nimic.
 *
 * ⚠ SI DE CE NU E DE AJUNS SA SE SCOATA `min`-ul. Plafonul din catalog ramane socotit din
 * `destination.cart`, tot de la client. Reparatia care se opreste acolo muta gaura cu un rand
 * mai jos si trece toate portile.
 *
 * Inchiderea are aceeasi forma ca la greutate, oglindita: suma socotita de server calatoreste
 * IN CLAR in token, acoperita de semnatura, iar la comanda se compara cu marfa adevarata, pe
 * care serverul o stie abia atunci. La greutate cade cosul mai GREU; aici cade suma semnata
 * mai MICA decat marfa reala. In amandoua, esecul e in favoarea cumparatorului: se cere
 * recotare, nu se schimba tacit pretul.
 *
 * ⚠ `amprenta()` NU se atinge, si asta e conditia intregii lucrari. Orice schimbare in ea ar
 * rescrie semnatura formelor vechi, iar cele 24 de ore de cotatii aflate in circulatie ar cadea
 * deodata, pe `max(suma ceruta, tarif implicit)`. Campurile noi intra DOAR in forma noua.
 */
export function signShippingQuote(
  businessId: string,
  dest: QuoteDestination,
  price: number,
  optiune: QuoteOption,
  /** Gramele pe care le-a socotit SERVERUL pentru cosul cotat. Vezi nota de mai sus. */
  grame: number,
  expiraLa?: number,
  /** Suma de ramburs cu care s-a cerut pretul, in BANI. `null` la cotatiile fara ramburs. */
  rambursBani?: number | null,
  /** Serviciul ales, cum il poarta chiar optiunea cotata. */
  plan?: PlanExpedierii | null,
): string {
  const expira = expiraLa ?? Date.now() + VALABILITATE_MS;
  const g = Math.max(0, Math.round(Number(grame) || 0));

  /*
   * ⚠ FORMA VECHE RAMANE FORMA IMPLICITA cat timp nu se cere nimic nou, ca sa nu se schimbe
   * niciun token din cele care circula azi. Forma noua apare doar cand apelantul chiar are ce
   * lega in plus.
   */
  const ampPlan = amprentaPlanului(plan);
  const bani = Number.isFinite(Number(rambursBani)) ? Math.max(0, Math.round(Number(rambursBani))) : null;
  if (bani === null && ampPlan === "") {
    const mac = createHmac("sha256", secret())
      .update(`${amprenta(businessId, dest, price, optiune)}|${g}|${expira}`)
      .digest("base64url");
    return `${expira}.${g}.${mac}`;
  }

  /*
   * ═══ ⚠ SI PRETUL COTAT CALATORESTE IN CLAR (14.09.2026) ═══
   *
   * Pretul era doar in AMPRENTA, deci verificarea avea nevoie de el ca sa refaca MAC-ul. Pe drumul
   * LIVRARII GRATUITE insa browserul trimite zero, iar pretul cotat al curierului nu mai exista
   * nicaieri la plasarea comenzii: nicio semnatura n-avea cum sa bata, si de aceea ramura aceea
   * taia scurt FARA sa judece nimic. Cine schimba atunci un singur camp de serviciu primea coletul
   * pe serviciul scump, iar diferenta o platea comerciantul.
   *
   * Purtat in clar SI acoperit de MAC, pretul se poate da inapoi verificarii, exact ca gramele si
   * ca suma rambursului. Rescris de mana, MAC-ul nu mai bate.
   *
   * ⚠ NU CERE NIMIC DE LA APELANTI: `signShippingQuote` avea deja `price` ca parametru, iar
   * `semneazaOptiuni` il trimite pe amandoua iesirile. Deci niciun camp nou prin browser, care s-ar
   * putea uita.
   *
   * ⚠ Si forma de TREI bucati ramane neatinsa cand nu e nimic nou de legat: cotatiile fara plan si
   * fara ramburs ies octet cu octet ca ieri.
   */
  /*
   * ⚠ CE LEAGA DE FAPT PRETUL PURTAT, MASURAT CU UN MUTANT, NU PRESUPUS.
   *
   * Scos pretul din coada MAC-ului la AMANDOUA capetele deodata, semnare si verificare, fiecare
   * afirmatie a ramas verde. Si pe drept: `amprenta()` cuprinde deja `Math.round(pret * 100)`, iar
   * pe drumul permisiv pretul dat ei E chiar `pret6 / 100`. Acelasi numar intra sub MAC pe alta
   * usa, deci pe drumul GRATUIT coada nu apara nimic in plus.
   *
   * ⚠ RAMANE TOTUSI, si nu din simetrie. Pe drumul STRICT `amprenta()` foloseste pretul PRETINS de
   * apelant, deci coada e SINGURUL lucru care leaga acolo pretul purtat. Azi nimeni nu-l citeste pe
   * drumul acela; in ziua in care cineva il va citi, coada e ce face citirea sigura.
   *
   * Scris aici fiindca altfel urmatorul om vede doua legari ale aceluiasi numar, o crede pe una de
   * prisos si o scoate pe cea gresita.
   */
  const pretBani = Math.max(0, Math.round((Number(price) || 0) * 100));
  const macNou = createHmac("sha256", secret())
    .update(`${amprenta(businessId, dest, price, optiune)}|${g}|${bani ?? 0}|${ampPlan}|${pretBani}|${expira}`)
    .digest("base64url");
  return `${expira}.${g}.${bani ?? 0}.${ampPlan || "-"}.${pretBani}.${macNou}`;
}

/**
 * Semneaza TOATE optiunile unei liste, intr-un singur loc.
 *
 * `getShippingOptions` are mai multe iesiri: una pentru international, care taie
 * scurt inainte de bucla de curieri interni, si una la final. Cat timp semnarea
 * statea doar pe cea de la final, ramura internationala pleca fara token — si
 * atunci comanda cadea pe tariful implicit intern al magazinului, 18 lei in loc
 * de 95,84 pentru un colet in Germania.
 *
 * Trecute amandoua prin ajutorul asta, o optiune nesemnata nu mai poate pleca
 * dintr-o iesire noua fara ca cineva sa scrie explicit alt drum.
 *
 * `ramburs` e OBLIGATORIU si al treilea, nu optional la coada: e regimul in care
 * s-a cerut tot lotul de preturi, deci cine adauga o iesire noua e obligat de
 * `tsc` sa spuna in ce regim a cotat. Optional, exact asta se uita — si o
 * cotatie semnata „platit" folosita la o comanda ramburs e chiar defectul.
 */
export function semneazaOptiuni<T extends {
  price: number;
  courier?: string;
  deliveryType?: string;
  courierLabel?: string;
} & PlanExpedierii>(
  businessId: string,
  dest: QuoteDestination,
  ramburs: boolean,
  /**
   * Gramele cosului, socotite de server din catalog.
   *
   * ⚠ OBLIGATORIU si inaintea listei, ca si `ramburs`, si din acelasi motiv: cine adauga o iesire
   * noua din `getShippingOptions` e obligat de `tsc` sa spuna pe ce greutate a cotat. Optional la
   * coada, exact asta s-ar fi uitat, iar iesirea noua ar fi plecat cu zero grame semnate, adica cu
   * poarta deschisa.
   */
  grame: number,
  optiuni: T[],
  /**
   * Suma de ramburs cu care s-a cerut tot lotul de preturi, in BANI, socotita de SERVER.
   *
   * ⚠ Ultima in lista, si nu din intamplare. Proba din `greutatea-cotata-se-leaga-de-comanda`
   * taie fiecare chemare si cere in ea subsirul literal `esteRamburs, grameCotate`. Un argument
   * strecurat INTRE cele doua ar fi rupt o proba buna, si atunci tentatia ar fi fost s-o slabesc
   * ca sa treaca, in loc s-o pastrez.
   *
   * ⚠ `undefined` inseamna „apelantul inca nu leaga suma", si atunci tokenul iese in forma VECHE,
   * octet cu octet. Asa nicio cotatie aflata in circulatie nu se clinteste si nicio proba veche
   * nu se misca: forma noua apare doar acolo unde chiar e ceva nou de legat.
   */
  rambursBani?: number | null,
): (T & { token: string })[] {
  return optiuni.map((o) => ({
    ...o,
    /*
     * ⚠ PLANUL SE IA DIN OPTIUNEA INSASI, nu de la apelant. Serverul il produce deja, cu motivul
     * scris pe fiecare camp din `ShippingOption`; ce lipsea era doar SEMNAREA lui. Luat de la
     * apelant, ar fi fost inca un loc unde cineva poate trimite altceva decat s-a cotat.
     */
    token: signShippingQuote(businessId, dest, o.price, {
      courier: o.courier, deliveryType: o.deliveryType, courierLabel: o.courierLabel, ramburs,
    }, grame, undefined, rambursBani, {
      wootServiceId: o.wootServiceId,
      coleteServiceId: o.coleteServiceId,
      ecoletServiceSlug: o.ecoletServiceSlug,
      innoshipCourierId: o.innoshipCourierId,
      innoshipServiceId: o.innoshipServiceId,
      innoshipOptionId: o.innoshipOptionId,
      smartshipCourierId: o.smartshipCourierId,
      smartshipOwnContract: o.smartshipOwnContract,
      smartshipLockerNet: o.smartshipLockerNet,
      shipoRateId: o.shipoRateId,
      fedexServiceType: o.fedexServiceType,
      upsServiceCode: o.upsServiceCode,
      dhlProductCode: o.dhlProductCode,
      dhlLocalProductCode: o.dhlLocalProductCode,
      fanPointType: o.fanPointType,
    }),
  }));
}

/**
 * Chiar am cotat noi pretul asta, pentru magazinul, destinatia, optiunea, regimul de plata SI
 * greutatea astea?
 *
 * ═══ ⚠ S-A REDENUMIT DIN `verifyShippingQuote`, SI NU DE STIL ═══
 *
 * Raspunsul nu mai e un boolean, ci un verdict cu motiv, fiindca cele doua feluri de esec cer
 * purtari OPUSE: o semnatura care nu bate cade pe tariful implicit (o cotatie pierduta n-are voie
 * sa coste o vanzare), iar o greutate depasita trebuie sa REFUZE comanda si sa ceara recotare.
 *
 * ⚠ Un obiect e insa mereu adevarat in JavaScript. Pastrat numele, fiecare `if (verifyShippingQuote(...))`
 * din proiect ar fi devenit „mereu da" fara ca `tsc` sa clipeasca: exact drumul prin care s-ar fi
 * deschis larg poarta pe care lucrarea asta o inchide. Redenumita, orice apelant neactualizat cade
 * la compilare.
 */
export function verificaCotatia(
  businessId: string,
  dest: QuoteDestination,
  price: number,
  token: string | null | undefined,
  optiune: QuoteOption,
  /**
   * Gramele cosului care se comanda ACUM, socotite din liniile finale.
   *
   * ⚠ `null` inseamna „n-am de unde sti", si atunci greutatea nu se judeca deloc. Nu e o portita:
   * apelantul care nu poate socoti greutatea n-are nici cu ce sa minta. Drumurile care CHIAR o pot
   * socoti o trimit, si acolo poarta lucreaza.
   */
  grameComandate?: number | null,
  /**
   * Planul PRETINS de comanda care se plaseaza acum.
   *
   * ⚠ `undefined` inseamna „apelantul nu poate spune", si atunci planul nu se judeca, exact ca
   * greutatea. Nu e o portita: cine nu-l poate socoti n-are nici cu ce sa minta. Drumurile care
   * CHIAR il stiu il trimit, si acolo poarta lucreaza.
   */
  planPretins?: PlanExpedierii | null,
  /**
   * Apelantul PRETINDE un pret, sau il ia pe cel purtat de token?
   *
   * ═══ ⚠ DE CE E UN MOD EXPLICIT, SI NU O CADERE TACUTA ═══
   *
   * Pe drumul livrarii gratuite browserul trimite zero, iar pretul cotat al curierului nu mai
   * exista nicaieri la plasarea comenzii. Acolo, si NUMAI acolo, verificarea trebuie sa ia pretul
   * din token ca sa poata judeca planul si greutatea.
   *
   * ⚠ DACA AR FI FOST O CADERE TACUTA (de pilda „cand `price` e zero, ia-l pe cel purtat"), atunci
   * oricine ar fi trimis `shipping_cost: 0` pe drumul PLATIT ar fi ocolit verificarea pretului cu
   * totul. Modul se cere deci pe fata, cu un sir care nu se poate nimeri din intamplare.
   *
   * ⚠ SI DE CE E OPTIONAL, DESI CASA CERE DE OBICEI PARAMETRI OBLIGATORII AICI.
   *
   * La `ramburs` si `grame` din `semneazaOptiuni` obligativitatea apara fiindca UITAREA DESCHIDE O
   * GAURA: un apelant nou care nu le da semneaza fara ele si nimeni nu afla. Aici e pe dos. Omis,
   * parametrul iese `undefined`, care nu e `"ia-l-pe-cel-purtat"`, deci se cade pe drumul STRICT,
   * unde pretul pretins trebuie sa bata. Purtarea permisiva nu se poate capata din uitare: cere un
   * sir exact, scris dinadins.
   *
   * Cerut, ar fi adaugat zgomot in vreo treizeci de chemari din probe al caror subiect e cu totul
   * altul (greutatea, planul, rambursul), fara niciun castig de siguranta.
   */
  pretPurtat?: "pretind-pretul" | "ia-l-pe-cel-purtat",
): { ok: true; rambursBani: number | null } | { ok: false; motiv: "semnatura" | "greutate" | "plan" } {
  const nu = (motiv: "semnatura" | "greutate" | "plan") => ({ ok: false as const, motiv });
  if (!token || !businessId) return nu("semnatura");
  const bucati = token.split(".");
  /*
   * ⚠ FORMELE ACCEPTATE, si de ce sunt trei. Doua bucati e forma de dinainte de 08.09.2026,
   * trei e cea cu greutatea, cinci e cea cu suma rambursului si planul. Toate trei se citesc
   * STRICT: orice alta lungime cade, deci o bucata lipita la coada nu poate trece.
   *
   * ⚠ Cele vechi raman acceptate DINADINS. Un token traieste 24 de ore, si in clipa desfasurarii
   * fiecare pagina de finalizare deschisa poarta unul vechi. Refuzate, ar cadea comenzi CINSTITE,
   * in curs. Se sting singure intr-o zi.
   */
  if (bucati.length !== 2 && bucati.length !== 3 && bucati.length !== 5 && bucati.length !== 6) {
    return nu("semnatura");
  }

  const expira = Number(bucati[0]);
  if (!Number.isFinite(expira) || expira < Date.now()) return nu("semnatura");

  /*
   * ⚠ TOKENELE DE FORMA VECHE (doua bucati) SE MAI ACCEPTA, si asta e dinadins.
   *
   * Un token traieste 24 de ore. In clipa desfasurarii, fiecare pagina de finalizare deschisa
   * poarta unul vechi: refuzate, ar fi cazut comenzi CINSTITE, in curs, la 16 magazine. Gaura pe
   * care o inchidem a stat deschisa luni de zile, deci inca o zi de coada nu schimba nimic, in timp
   * ce comenzile pierdute ar fi fost pierdute de-a binelea.
   *
   * ⚠ Ele nu poarta greutate, deci pe ele greutatea nu se judeca. Se sting singure in 24 de ore.
   */
  if (bucati.length === 2) {
    const macVechi = createHmac("sha256", secret())
      .update(`${amprenta(businessId, dest, price, optiune)}|${expira}`)
      .digest("base64url");
    const asteptatVechi = Buffer.from(`${expira}.${macVechi}`);
    const primitVechi = Buffer.from(token);
    if (asteptatVechi.length !== primitVechi.length) return nu("semnatura");
    try {
      /* ⚠ `rambursBani: null` inseamna „tokenul asta nu poarta suma", nu „suma e zero". */
      return timingSafeEqual(asteptatVechi, primitVechi) ? { ok: true, rambursBani: null } : nu("semnatura");
    } catch {
      return nu("semnatura");
    }
  }

  /*
   * ═══ FORMA CU SUMA RAMBURSULUI SI CU PLANUL (14.09.2026) ═══
   *
   * ⚠ ORDINEA CELOR DOUA VERIFICARI E CHIAR REGULA, si inversata ar apara atacatorul.
   *
   * MAC-ul se reface cu amprenta planului PURTATA in token, nu cu cea socotita din planul
   * pretins. Asa, un plan falsificat trece de MAC si cade abia la comparatia de dupa, cu motivul
   * `plan`, care REFUZA comanda. Refacut cu planul pretins, orice falsificare ar fi stricat MAC-ul
   * si ar fi iesit `semnatura`, adica drumul care cade pe tariful implicit si LASA comanda sa
   * intre. Exact pe dos fata de ce trebuie.
   */
  /*
   * ═══ FORMA CU PRETUL PURTAT (14.09.2026) ═══
   *
   * Aceeasi ca cea de cinci bucati, plus pretul cotat in bani, in clar si sub MAC. Singurul lucru
   * pe care il deschide e drumul LIVRARII GRATUITE: acolo apelantul nu poate pretinde niciun pret,
   * fiindca browserul trimite zero, si atunci se ia cel purtat.
   *
   * ⚠ ORDINEA VERIFICARILOR E ACEEASI SI DIN ACELASI MOTIV ca la forma de cinci: MAC-ul se reface
   * cu ce POARTA tokenul, nu cu ce pretinde apelantul, ca un plan falsificat sa cada pe `plan`
   * (care REFUZA comanda), nu pe `semnatura` (care o lasa sa intre pe tarif).
   */
  if (bucati.length === 6) {
    const g6 = Number(bucati[1]);
    const bani6 = Number(bucati[2]);
    const pret6 = Number(bucati[4]);
    if (!Number.isFinite(g6) || g6 < 0) return nu("semnatura");
    if (!Number.isFinite(bani6) || bani6 < 0) return nu("semnatura");
    if (!Number.isFinite(pret6) || pret6 < 0) return nu("semnatura");
    const ampPurtata6 = bucati[3] === "-" ? "" : bucati[3];

    /*
     * ⚠ PRETUL FOLOSIT LA MAC E CEL PURTAT, cand apelantul spune ca nu pretinde niciunul.
     *
     * Asa se poate verifica o cotatie pe drumul gratuit, unde `price` primit e zero. Iar pe drumul
     * platit se foloseste pretul PRETINS, deci o suma schimbata strica MAC-ul, ca pana acum.
     */
    const pretPentruMac = pretPurtat === "ia-l-pe-cel-purtat" ? pret6 / 100 : price;

    const macAsteptat6 = createHmac("sha256", secret())
      .update(`${amprenta(businessId, dest, pretPentruMac, optiune)}|${g6}|${bani6}|${ampPurtata6}|${pret6}|${expira}`)
      .digest("base64url");
    const a6 = Buffer.from(`${expira}.${g6}.${bani6}.${bucati[3]}.${pret6}.${macAsteptat6}`);
    const p6 = Buffer.from(token);
    if (a6.length !== p6.length) return nu("semnatura");
    try {
      if (!timingSafeEqual(a6, p6)) return nu("semnatura");
    } catch {
      return nu("semnatura");
    }

    if (planPretins !== undefined && ampPurtata6 !== "" && amprentaPlanului(planPretins) !== ampPurtata6) {
      return nu("plan");
    }

    if (grameComandate != null && Number.isFinite(grameComandate)
        && Math.round(grameComandate) > g6 + TOLERANTA_GRAME) {
      return nu("greutate");
    }
    return { ok: true, rambursBani: bani6 };
  }

  if (bucati.length === 5) {
    const g5 = Number(bucati[1]);
    const bani5 = Number(bucati[2]);
    if (!Number.isFinite(g5) || g5 < 0) return nu("semnatura");
    if (!Number.isFinite(bani5) || bani5 < 0) return nu("semnatura");
    const ampPurtata = bucati[3] === "-" ? "" : bucati[3];

    const macAsteptat = createHmac("sha256", secret())
      .update(`${amprenta(businessId, dest, price, optiune)}|${g5}|${bani5}|${ampPurtata}|${expira}`)
      .digest("base64url");
    const a5 = Buffer.from(`${expira}.${g5}.${bani5}.${bucati[3]}.${macAsteptat}`);
    const p5 = Buffer.from(token);
    if (a5.length !== p5.length) return nu("semnatura");
    try {
      if (!timingSafeEqual(a5, p5)) return nu("semnatura");
    } catch {
      return nu("semnatura");
    }

    /*
     * ⚠ Planul se judeca DOAR cand apelantul poate spune care e. `undefined` nu e o portita:
     * vezi `planPretins`. Iar cand tokenul n-a legat niciun plan (curier simplu, la adresa),
     * amprenta purtata e goala si nu e nimic de comparat.
     */
    if (planPretins !== undefined && ampPurtata !== "" && amprentaPlanului(planPretins) !== ampPurtata) {
      return nu("plan");
    }

    if (grameComandate != null && Number.isFinite(grameComandate)
        && Math.round(grameComandate) > g5 + TOLERANTA_GRAME) {
      return nu("greutate");
    }
    return { ok: true, rambursBani: bani5 };
  }

  const grameSemnate = Number(bucati[1]);
  if (!Number.isFinite(grameSemnate) || grameSemnate < 0) return nu("semnatura");

  const asteptat = Buffer.from(signShippingQuote(businessId, dest, price, optiune, grameSemnate, expira));
  const primit = Buffer.from(token);
  if (asteptat.length !== primit.length) return nu("semnatura");
  try {
    if (!timingSafeEqual(asteptat, primit)) return nu("semnatura");
  } catch {
    return nu("semnatura");
  }

  /*
   * ⚠ „MAI USOR TRECE", si numai mai greu cade.
   *
   * Cosul mai usor decat cel cotat inseamna ca omul plateste un transport prea scump PENTRU EL;
   * comerciantul nu pierde nimic, si nicio comanda cinstita nu se blocheaza. Cosul mai greu e chiar
   * atacul: se cere pretul pentru un kilogram si se comanda cincisprezece.
   *
   * ⚠ Toleranta e de cinci grame, cat sa absoarba o rotunjire, nu o bucata in plus: cel mai usor
   * produs cantarit din platforma are zeci de grame.
   */
  if (grameComandate != null && Number.isFinite(grameComandate)
      && Math.round(grameComandate) > grameSemnate + TOLERANTA_GRAME) {
    return nu("greutate");
  }
  /* ⚠ Forma de trei bucati nu poarta suma: `null` inseamna „n-am de unde sti", nu „zero". */
  return { ok: true, rambursBani: null };
}
