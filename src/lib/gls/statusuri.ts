import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusul unui colet GLS → statusul comenzii.
 *
 * ═══ CODURILE SUNT NUMERICE, SI SUNT CELE REALE ═══
 *
 * Din Appendix G al documentatiei MyGLS (ver. 25.12.11), nu ghicite. `StatusCode`
 * vine ca sir, dar continutul e un numar: „5", „55", „23".
 *
 * ⚠ Prima forma a fisierului folosea siruri („DELIVERED", „INTRANSIT"), luate din
 * webhook-ul GLS din developer portal — alt API, alt vocabular. A fost stearsa.
 *
 * ═══ ⚠ 55 NU E 5 ═══
 *
 * `5` = „The parcel has been delivered."
 * `55` = „The parcel has been delivered at the ParcelShop."
 *
 * A doua inseamna ca respectivul colet a ajuns LA PUNCT, nu la client — omul inca
 * nu l-a ridicat. Tratata ca livrare:
 *   - comanda se inchide inainte de vreme;
 *   - la ramburs, marcam INCASAT ce nu s-a incasat (GLS ia banii la ridicare);
 *   - daca nu se ridica in termen (cod 57), coletul se intoarce si noi avem in
 *     baza o comanda „livrata" care de fapt s-a returnat.
 *
 * Acelasi rationament la `56` (stocat in ParcelShop) si `59` (ridicare din
 * ParcelShop, adica in curs).
 *
 * ═══ ⚠ 54 SI 58 SUNT LIVRARI ADEVARATE ═══
 *
 * `54` = predat la parcel box, `58` = predat vecinului, cu semnatura. Coletul a
 * iesit din mana GLS catre destinatie, deci comanda se inchide.
 *
 * ═══ ⚠ 23 SI 40 NU SUNT „LIVRAT" SI NU SUNT „ANULAT" ═══
 *
 * „The parcel has been returned to sender." Marfa se intoarce la comerciant, dar
 * comanda NU e anulata automat de noi: anularea atrage dupa ea eliberarea de
 * stoc si, uneori, rambursarea. Alea sunt decizii ale comerciantului, nu ale
 * curierului. Se semnaleaza, atat.
 */

/**
 * Statusuri care inchid comanda ca LIVRATA.
 *
 * ⚠ `92` = „The parcel has been delivered." — acelasi inteles ca 5, cu alt
 * numar. Lipsea, si costa exact cat o livrare nedescoperita: comanda ramanea
 * „expediata" pentru totdeauna, facturarea automata nu pornea niciodata, iar
 * cronul reintreba de coletul ala inca 21 de zile.
 *
 * `93` = „Signature confirmed." — semnatura de primire, deci coletul e la om.
 */
const LIVRAT = new Set([5, 54, 58, 92, 93]);

/** Coletul a plecat de la comerciant si e pe drum (ori a incercat sa ajunga). */
const EXPEDIAT = new Set([
  1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  24, 25, 26, 27, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 41, 43, 44, 46, 47,
  53, 55, 56, 57, 59,
  /* Vama: coletul e in retea, doar oprit. */
  60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72,
  /* ⚠ Restul familiei de vama, care lipsea: 73 blocat in tara de origine, 74
     inspectie, 76 date inregistrate si coletul poate merge mai departe. */
  73, 74, 76,
  /* `80` = redirectionat catre adresa dorita; coletul merge in continuare. */
  80,
  /*
   * ⚠ `97` = „Parcel is placed to parcellocker."
   *
   * Acelasi rationament ca la 55 si 56: coletul e IN locker, omul inca nu l-a
   * ridicat. La ramburs, GLS ia banii abia la ridicare — deci „livrat" ar
   * insemna sa marcam incasat ce nu s-a incasat.
   */
  97,
  /* `99` = destinatarul a fost instiintat pe email. Doar o informare. */
  99,
  /*
   * ⚠ Problemele de locker: coletul E in retea, doar ca nu poate intra in
   * dulap. Nu misca statusul, dar se SEMNALEAZA — vezi `DE_SEMNALAT`.
   */
  401, 402, 403, 404, 420,
]);

/**
 * Datele au intrat in sistemul GLS, dar coletul e INCA la comerciant.
 *
 * `51` — „the parcel was not yet handed over to GLS"
 * `52` — datele de ramburs introduse
 *
 * ⚠ NU inseamna „expediat". O comanda marcata expediata aici ar minti clientul,
 * care primeste si email de expediere.
 */
const LA_COMERCIANT = new Set([51, 52]);

/**
 * Coletul s-a intors sau nu mai exista. Comanda NU se inchide singura.
 *
 * ⚠ `75` = „Parcel was confiscated by the Customs authorities." Marfa nu mai
 * ajunge nici la client, nici inapoi la comerciant: e cel mai prost sfarsit
 * posibil, si lipsea cu totul. Fara el, cronul ar fi intrebat de coletul ala
 * pana la capatul ferestrei, iar comerciantul n-ar fi aflat niciodata.
 */
const NELIVRAT_FINAL = new Set([23, 40, 28, 31, 42, 75]);

/**
 * ⚠ Codurile serviciului de RIDICARE de la comerciant (Pickup-Service), 83-91.
 *
 * Descriu o comanda de ridicare, nu drumul unui colet catre cumparator — iar
 * ridicarea nu e inca implementata (`CreatePickupRequest` e pe lista de facut).
 * Nu misca statusul comenzii: ar fi o minciuna sa spunem „expediat" fiindca
 * soferul a primit ordinul de ridicare.
 *
 * Cele care inseamna ESEC (87-91: ridicare anulata, marfa nepregatita, clientul
 * neinstiintat) intra totusi in `DE_SEMNALAT`: acolo chiar trebuie sa se miste
 * cineva.
 */
const RIDICARE = new Set([83, 84, 85, 86, 87, 88, 89, 90, 91]);

/**
 * Toate codurile pe care codul le RECUNOASTE, indiferent ce face cu ele.
 *
 * ⚠ Exista pentru proba care compara mecanic cu Appendix G. „Recunoscut" nu e
 * acelasi lucru cu „muta comanda": 23 (retur) si 75 (confiscat) sunt cunoscute
 * si dinadins nu misca nimic. Fara distinctia asta, o proba scrisa pe
 * `statusComandaDinCod(...) !== null` ar cere ca fiecare cod sa schimbe statusul
 * — adica exact greseala pe care fisierul o evita.
 */
export const CODURI_TRATATE: readonly number[] = [
  ...new Set([...LIVRAT, ...EXPEDIAT, ...LA_COMERCIANT, ...NELIVRAT_FINAL, ...RIDICARE]),
].sort((a, b) => a - b);

const TRATATE = new Set(CODURI_TRATATE);

/** Stim ce inseamna codul asta? (Chiar daca raspunsul e „nu se schimba nimic".) */
export function eCunoscut(statusCode: string | number | null | undefined): boolean {
  const cod = typeof statusCode === "number" ? statusCode : codNumeric(statusCode);
  return cod !== null && TRATATE.has(cod);
}

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

/** `StatusCode` vine ca sir; aici devine numar, sau `null` daca nu e unul. */
export function codNumeric(statusCode: string | null | undefined): number | null {
  if (statusCode == null) return null;
  const curat = String(statusCode).trim();
  /*
   * ⚠ Sirul gol trebuie oprit AICI, explicit: `Number("")` e 0, iar 0 e intreg.
   * Fara randul asta, un `StatusCode` lipsa ar deveni „codul 0" — un cod care nu
   * exista in Appendix G, deci ar trece drept necunoscut si n-ar face nimic…
   * pana cand cineva ar adauga cândva un inteles pentru 0. Proba a prins-o.
   */
  if (curat === "") return null;
  const n = Number(curat);
  return Number.isInteger(n) ? n : null;
}

/**
 * Statusul comenzii pentru un cod GLS, fara sa tina cont de unde venim.
 *
 * `null` = „nu schimba nimic". Acopera doua situatii diferite, si ambele merita
 * lasate in pace: coduri pe care nu le cunoastem (GLS poate adauga oricand) si
 * coduri care descriu un sfarsit prost, unde decizia e a comerciantului.
 */
export function statusComandaDinCod(statusCode: string | null | undefined): OrderStatus | null {
  const cod = codNumeric(statusCode);
  if (cod === null) return null;
  if (LIVRAT.has(cod)) return "delivered";
  if (LA_COMERCIANT.has(cod)) return "processing";
  if (EXPEDIAT.has(cod)) return "shipped";
  /*
   * Ramura scrisa explicit, nu lasata sa cada in `null` din intamplare: aici
   * sunt sfarsiturile PROASTE (retur, distrus, aruncat). Ele chiar au un
   * inteles, dar decizia — anulare, rambursare, reexpediere — e a
   * comerciantului, nu a curierului. Deci comanda nu se misca, iar
   * `trebuieSemnalat` il anunta.
   */
  if (NELIVRAT_FINAL.has(cod)) return null;
  /*
   * Codurile de RIDICARE de la comerciant: cunoscute, dar dinadins fara efect
   * asupra comenzii. Scrise aparte, nu lasate sa cada in ramura de mai jos, ca
   * sa nu para o scapare la urmatoarea citire.
   */
  if (RIDICARE.has(cod)) return null;
  /* Cod necunoscut: GLS poate adauga oricand. Nu ghicim. */
  return null;
}

/**
 * Ce status primeste comanda dupa un eveniment GLS — sau `null` daca nu se
 * schimba nimic.
 *
 * 1. **Cod necunoscut** → nimic. GLS poate adauga coduri; a le trata pe toate ca
 *    „altceva" ar muta comenzi pe baza unui numar pe care nu-l intelegem.
 * 2. **Comanda incheiata** (`cancelled`, `refunded`) → nu se atinge. Un eveniment
 *    intarziat nu reinvie o comanda anulata sau rambursata.
 * 3. **Nu se coboara.** Statusurile pot sosi in alta ordine decat s-au produs, si
 *    de mai multe ori: un „pe drum" venit dupa „livrat" ar trage comanda inapoi.
 */
export function statusUrmator(statusCurent: string, statusCode: string | null | undefined): OrderStatus | null {
  const tinta = statusComandaDinCod(statusCode);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/**
 * Evenimentele care cer atentia comerciantului, chiar daca nu misca statusul.
 *
 * Sunt lucrurile pe care altfel le afli dupa trei zile, de la client: retur,
 * refuz, adresa gresita, colet distrus, vama blocata. Fiecare cere o decizie
 * OMENEASCA — de aia nu schimbam noi statusul in locul lui.
 */
const DE_SEMNALAT = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 28, 29, 30, 31, 33, 34, 35,
  36, 38, 39, 42, 43, 44, 57, 60, 62, 66, 68, 69, 70, 71, 72,
  /* Returnat expeditorului: cel mai important dintre toate. */
  23, 40,
  /* ⚠ Vama, restul familiei: blocat in tara de origine, inspectie, CONFISCAT. */
  73, 74, 75,
  /*
   * ⚠ Lockerul care nu primeste coletul: plin (401), colet prea mare (402),
   * avariat (403), defectiune tehnica (404), dulap stricat (420).
   *
   * Toate cer o decizie omeneasca — se schimba livrarea, se suna clientul, se
   * cere despagubire. Niciunul nu era cunoscut de cod, deci coletul ramanea
   * blocat in dulap si singurul care afla era clientul, dupa cateva zile.
   */
  401, 402, 403, 404, 420,
  /* Ridicarea de la comerciant care NU s-a putut face. */
  87, 88, 89, 90, 91,
]);

export function trebuieSemnalat(statusCode: string | null | undefined): boolean {
  const cod = codNumeric(statusCode);
  return cod !== null && DE_SEMNALAT.has(cod);
}

/** Coletul s-a intors la expeditor: marfa vine inapoi, banii nu s-au incasat. */
export function esteRetur(statusCode: string | null | undefined): boolean {
  const cod = codNumeric(statusCode);
  return cod === 23 || cod === 40;
}

// ─── Ce se face cu TOATA lista de stari a unui colet ──────────────────────────
//
// `GetParcelStatuses` nu intoarce ultimul eveniment, ci ISTORICUL intreg. Cronul
// primeste deci un teanc, nu o stire — si trebuie sa scoata din el un singur
// raspuns. Bucatile de mai jos sunt pure dinadins: sunt singura parte a urmaririi
// care se poate proba fara sa vorbim cu GLS.

/** O stare, redusa la ce ne trebuie ca sa hotaram. */
export type StareCitita = {
  cod: string | null | undefined;
  /** Data evenimentului, deja trecuta prin `dataDinNet` (ISO), sau `null`. */
  data: string | null;
  /**
   * Textul trimis de GLS. Se poate cere in romana (`LanguageIsoCode: RO`), deci
   * merita aratat comerciantului asa cum a venit: „cod GLS 23" nu spune nimic,
   * „coletul a fost returnat expeditorului" spune tot.
   */
  descriere?: string | null;
};

/**
 * Statusul comenzii dupa ce se trece prin TOATE starile, nu doar prin ultima.
 *
 * ⚠ DE CE NU „ULTIMA STARE".
 *
 * Ar parea firesc sa luam evenimentul cel mai recent si sa-l traducem. Dar
 * istoricul GLS contine si evenimente care NU descriu inaintarea coletului:
 * blocaje de vama, incercari de livrare esuate, note de depozit. Un colet livrat
 * luni poate avea marti o linie de „vama" (60-72), care se traduce „shipped" —
 * si comanda ar cobori de la livrata la expediata.
 *
 * `statusUrmator` stie deja sa nu coboare. Trecand fiecare stare prin el si
 * pastrand ce a urcat, rezultatul e treapta cea mai INALTA atinsa vreodata. Asta
 * il face independent de ordinea in care vin starile — si chiar nu avem nicio
 * garantie ca vin sortate.
 *
 * `null` = nu se schimba nimic.
 */
export function statusFinalDinStari(
  statusCurent: string,
  stari: readonly StareCitita[],
): OrderStatus | null {
  let curent = statusCurent;
  for (const s of stari) {
    const urmator = statusUrmator(curent, s.cod);
    if (urmator) curent = urmator;
  }
  return curent === statusCurent ? null : (curent as OrderStatus);
}

/**
 * Starea cea mai recenta din teanc — cea care se tine minte pe comanda.
 *
 * ⚠ Se tine minte ca sa nu semnalam DE DOUA ORI acelasi eveniment. Un colet
 * returnat (cod 23) ramane returnat: fara memorie, cronul ar striga „colet
 * returnat" la fiecare rulare, la nesfarsit — iar un avertisment care se repete
 * la infinit nu mai e citit de nimeni.
 *
 * ⚠ Sortarea e dupa DATA, nu dupa pozitia in tablou. MyGLS nu promite nicaieri ca
 * lista vine cronologic, iar daca ordinea s-ar schimba vreodata am tine minte un
 * eveniment vechi si am resemnala unul nou la fiecare rulare.
 *
 * Cand datele lipsesc cu totul, se cade pe ULTIMUL element: e cea mai buna
 * presupunere disponibila si e mai buna decat „niciuna".
 */
export function ultimaStare(stari: readonly StareCitita[]): StareCitita | null {
  if (stari.length === 0) return null;

  let cea: StareCitita | null = null;
  let ceaMs = Number.NEGATIVE_INFINITY;
  for (const s of stari) {
    const ms = s.data ? Date.parse(s.data) : Number.NaN;
    if (Number.isNaN(ms)) continue;
    /* `>=` : la date egale castiga ultima din lista, adica ordinea GLS. */
    if (ms >= ceaMs) { ceaMs = ms; cea = s; }
  }
  return cea ?? stari[stari.length - 1];
}

/**
 * Coletul si-a incheiat drumul: nu mai are rost sa fie intrebat.
 *
 * Livrarile ies oricum din raza cronului (comanda trece pe `delivered`, iar
 * interogarea sare peste comenzile incheiate). Aici raman sfarsiturile care NU
 * misca statusul — retur, distrus, aruncat: comanda ramane „expediata" pentru ca
 * decizia e a comerciantului, deci fara steagul asta cronul ar intreba de ele
 * pana la sfarsitul lumii.
 */
export function eStareFinala(statusCode: string | null | undefined): boolean {
  const cod = codNumeric(statusCode);
  if (cod === null) return false;
  return LIVRAT.has(cod) || NELIVRAT_FINAL.has(cod);
}
