/**
 * Nomenclatorul de servicii UPS.
 *
 * ═══ ⚠ DE CE E UN FISIER SEPARAT, SI DE CE E O TRADUCERE, NU O VALIDARE ═══
 *
 * `Service.Code` are enumerare in OpenAPI, dar ea e a INTREGII LUMI: 34 de coduri,
 * din care majoritatea sunt produse americane (`01` Next Day Air, `03` Ground),
 * poloneze (`82`-`86` UPS Today) sau de marfa. Iar specificatia **nu spune pentru
 * nicio tara care dintre ele sunt valabile** — scrie doar „For a complete listing of
 * values, refer to Service Codes in the Appendix", si apendicele nu e publicat.
 *
 * Deci lista de mai jos e o TRADUCERE. Cotarea cu `Shop` intoarce ce intoarce; un
 * serviciu pe care nu-l cunoastem primeste un nume citibil si apare in checkout ca
 * oricare altul.
 *
 * ═══ ⚠ „DOMESTIC" IN SPECIFICATIA LOR INSEAMNA „AMERICAN" ═══
 *
 * `Rating.yaml` imparte codurile in „Valid domestic values" (`01`, `02`, `03`, `12`,
 * `13`, `14`, `59`, `75`) si „Valid international values" (`07`, `08`, `11`, `54`,
 * `65`, `96`, `71`). E o capcana curata: prima lista e linia de produse din STATELE
 * UNITE. Un `if (intern) foloseste lista domestica` ar trimite `03 Ground` pe o
 * comanda Bucuresti-Cluj, iar UPS n-are ce face cu el.
 *
 * Pentru Romania, si intern si international, se folosesc coduri din a doua lista.
 *
 * ═══ ⚠ CE VINDE UPS CU ADEVARAT IN ROMANIA ═══
 *
 * Sursa nu e API-ul, ci documentele lor comerciale romanesti — si se confirma intre
 * ele in trei feluri independente:
 *
 * 1. **„Ghidul Serviciilor de Transport UPS" (RO), pagina 4**, verbatim:
 *      UPS Express Plus®  — „Nu este disponibil pentru expedierile interne."
 *      UPS Express®       — „Livrare in majoritatea zonelor de afaceri din Romania
 *                            pana la ora 12.00 …, in urmatoarea zi lucratoare."
 *      UPS Express Saver® — „Livrare in urmatoarea zi lucratoare in majoritatea
 *                            zonelor de afaceri din Romania."
 *      UPS Standard®      — „catre destinatii din UE si din Marea Britanie" +
 *                            „Nu este disponibil pentru expedieri interne."
 *      UPS Expedited      — „catre destinatii din afara UE, Norvegia si Elvetia" +
 *                            „Nu este disponibil pentru expedieri interne."
 *
 * 2. **„Ghidul Tarifelor UPS" (RO), tabelul de zone**: randul Romaniei are numar de
 *    zona (99, zona interna) DOAR pe coloanele Express si Express Saver. Restul
 *    coloanelor sunt goale, iar regula lor de citire e scrisa acolo: „un serviciu
 *    este disponibil daca exista un numar de zona in coloana de trimitere sau de
 *    primire".
 *
 * 3. **Paginile de tarife**: Express (p.10) si Express Saver (p.11) incep cu „Zona
 *    99"; Express Plus, Standard si Worldwide Express Freight nu au zona 99 deloc.
 *
 * ═══ ⚠ SI CODURILE 82-86 SUNT POLONEZE, NU EUROPENE ═══
 *
 * „UPS Today Standard/Dedicated Courier/Express/Express Saver" apar in apendicele lor
 * de coduri sub titlul **„Polish Domestic Shipments"**, nu sub „Shipments Originating
 * in the European Union". Nu se ofera in Romania — un integrator care le-ar copia
 * din enumerarea globala ar propune cumparatorului servicii inexistente.
 */

/** Un serviciu, cu ce stim despre el pentru Romania. */
type Serviciu = {
  nume: string;
  /** Se poate expedia RO → RO cu el? */
  intern: boolean;
  /** Se poate expedia RO → alta tara din UE? */
  extern: boolean;
  /** E produs de marfa grea (paleti), nu de colete? */
  marfaGrea?: boolean;
};

/**
 * ⭐ ROMANIA — cele patru servicii de colete care exista cu adevarat.
 *
 * ⚠ `08 UPS Expedited` NU e aici: ghidul romanesc il descrie „catre destinatii din
 * AFARA UE, Norvegia si Elvetia". Pentru RO→RO si RO→UE nu are ce cauta. Ramane in
 * `SERVICII_ALTELE`, ca sa aiba nume daca UPS il intoarce totusi la cotare.
 */
export const SERVICII_RO: Record<string, Serviciu> = {
  "07": { nume: "UPS Express — pana la pranz, ziua urmatoare", intern: true, extern: true },
  "65": { nume: "UPS Express Saver — ziua urmatoare", intern: true, extern: true },
  /* ⚠ Cel mai ieftin pentru UE, si singurul la care descrierea marfii nu e ceruta
     intre doua tari din Uniune. Dar NU merge intern. */
  "11": { nume: "UPS Standard — economic, catre Uniunea Europeana", intern: false, extern: true },
  "54": { nume: "UPS Express Plus — pana dimineata, ziua urmatoare", intern: false, extern: true },
};

/**
 * Serviciile pe care le stim ca exista, dar pe care nu le oferim din Romania.
 *
 * Sunt aici ca sa aiba un nume citibil daca UPS le intoarce totusi la cotare — nu ca
 * sa fie propuse. Numele sunt cele din enumerarea lor, traduse acolo unde au
 * echivalent comercial romanesc.
 */
const SERVICII_ALTELE: Record<string, Serviciu> = {
  "08": { nume: "UPS Expedited — in afara Uniunii Europene", intern: false, extern: false },
  "74": { nume: "UPS Express 12:00", intern: false, extern: false },
  "70": { nume: "UPS Access Point Economy", intern: false, extern: false },
  "96": { nume: "UPS Worldwide Express Freight — paleti", intern: false, extern: false, marfaGrea: true },
  "71": { nume: "UPS Worldwide Express Freight Midday — paleti", intern: false, extern: false, marfaGrea: true },
  "75": { nume: "UPS Heavy Goods", intern: false, extern: false, marfaGrea: true },
  "17": { nume: "UPS Worldwide Economy DDU", intern: false, extern: false },
  "72": { nume: "UPS Worldwide Economy DDP", intern: false, extern: false },
  "30": { nume: "UPS Pallet", intern: false, extern: false, marfaGrea: true },
  /* Linia americana — apare numai daca un cont are alta tara de expeditie. */
  "01": { nume: "UPS Next Day Air", intern: false, extern: false },
  "02": { nume: "UPS 2nd Day Air", intern: false, extern: false },
  "03": { nume: "UPS Ground", intern: false, extern: false },
  "12": { nume: "UPS 3 Day Select", intern: false, extern: false },
  "13": { nume: "UPS Next Day Air Saver", intern: false, extern: false },
  "14": { nume: "UPS Next Day Air Early", intern: false, extern: false },
  "59": { nume: "UPS 2nd Day Air A.M.", intern: false, extern: false },
  /* Linia poloneza. Vezi antetul: apar sub „Polish Domestic Shipments". */
  "82": { nume: "UPS Today Standard (numai Polonia)", intern: false, extern: false },
  "83": { nume: "UPS Today Dedicated Courier (numai Polonia)", intern: false, extern: false },
  "84": { nume: "UPS Today Intercity (numai Polonia)", intern: false, extern: false },
  "85": { nume: "UPS Today Express (numai Polonia)", intern: false, extern: false },
  "86": { nume: "UPS Today Express Saver (numai Polonia)", intern: false, extern: false },
};

const TOATE: Record<string, Serviciu> = { ...SERVICII_RO, ...SERVICII_ALTELE };

/**
 * Codul, normalizat.
 *
 * ⚠ NU SE COMPLETEAZA CU ZEROURI SI NU SE VALIDEAZA PE LUNGIME.
 *
 * Cele doua specificatii ale lor se contrazic pe latimea campului — `Rating.yaml`
 * declara `minLength: 3, maxLength: 3`, `Shipping.yaml` declara `2/2` — iar propriile
 * lor exemple incalca amandoua: exemplul de cotare trimite `'03'` (doua caractere,
 * sub minimul lor), iar exemplul de expediere Polonia→Polonia trimite `'011'` (trei
 * caractere, peste maximul lor) pentru acelasi serviciu pe care alte exemple il scriu
 * `'11'`. **Daca `'11'` si `'011'` sunt acelasi lucru NU e documentat nicaieri.**
 *
 * Deci codul se pastreaza EXACT cum l-a intors cotarea si se retrimite la fel. Singura
 * normalizare e trimul si majusculele (codurile lor cu litere sunt majuscule peste tot).
 *
 * ⚠ Iar zeroul din fata nu se poate pierde pe drum: trecut printr-un `Number()`,
 * `"07"` devine `7` si nu se mai potriveste cu nimic. De aia numerele — care pot veni
 * doar dintr-o configurare veche scrisa gresit — se aduc inapoi la doua caractere.
 */
export function codServiciu(v: unknown): string | null {
  if (typeof v === "number") return String(v).padStart(2, "0");
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 3 ? t : null;
}

/**
 * Numele omenesc al unui serviciu.
 *
 * ⚠ Pentru un serviciu necunoscut NU se intoarce codul brut si nici „Serviciu UPS":
 * primul arata a defect („65" intr-un checkout romanesc), al doilea sterge singura
 * informatie utila. Se ia descrierea LOR cand o dau, si abia la urma codul.
 */
export function numeServiciu(cod: string | null | undefined, numeDeLaEi?: string | null): string {
  const c = codServiciu(cod);
  const cunoscut = c ? TOATE[c] : undefined;
  if (cunoscut) return cunoscut.nume;

  const alLor = (numeDeLaEi ?? "").trim();
  if (alLor) return alLor.startsWith("UPS") ? alLor : `UPS ${alLor}`;
  return c ? `UPS (serviciu ${c})` : "UPS";
}

/**
 * E serviciu de marfa grea (paleti)?
 *
 * ⚠ Conteaza in checkout: un cumparator cu o cutie de 2 kg n-are ce cauta pe
 * Worldwide Express Freight, iar tariful de acolo e de alta scara. In practica ele
 * nici nu apar la cotare — `DeliveryTimeInformation.PackageBillType` trebuie sa fie
 * `04` (palet) ca sa fie incluse, iar noi trimitem `03` (non-document). Filtrul
 * ramane fiindca „nu apar" nu e acelasi lucru cu „nu pot aparea".
 */
export function eMarfaGrea(cod: string | null | undefined): boolean {
  const c = codServiciu(cod);
  return !!c && TOATE[c]?.marfaGrea === true;
}

/**
 * ⚠⚠ STIM NOI ca serviciul asta nu se vinde pe ruta asta? — SI DE CE NU FILTREAZA NIMIC.
 *
 * Prima varianta a integrarii folosea functia asta ca POARTA: ofertele pentru care ea
 * raspundea `false` erau scoase din checkout, iar emiterea era refuzata. Verificarea
 * adversa a aratat ca era gresit, si merita scris de ce.
 *
 * `requestoption=Shop` e descris de ei asa: „The server **validates the shipment**, and
 * returns rates for **all UPS products from the ShipFrom to the ShipTo addresses**."
 * Adica UPS filtreaza deja dupa ruta, pe contul real al comerciantului. Daca el intoarce
 * `11 UPS Standard` pentru o comanda Bucuresti→Cluj, atunci UPS il vinde — iar noi l-am
 * fi ascuns pe temeiul unui PDF comercial, si cumparatorul ar fi platit un serviciu mai
 * scump degeaba. Invers, un serviciu pe care UPS nu-l vinde nu apare in raspuns, deci
 * n-are ce filtra.
 *
 * Ce ramane adevarat e ca ghidul lor romanesc chiar scrie „Nu este disponibil pentru
 * expedieri interne" la UPS Standard si la Express Plus, si ca tabelul lor de zone da
 * zona interna (99) doar la Express si Express Saver. Informatia aia e reala si e utila
 * — dar ca SFAT in pagina de configurare, nu ca poarta peste raspunsul lor.
 *
 * Deci: se foloseste in interfata, ca sa i se spuna comerciantului ce vinde UPS in
 * Romania. Niciodata ca filtru peste ce a intors cotarea.
 */
export function eVandutInRomania(cod: string | null | undefined, taraExpeditor: string, taraDestinatar: string): boolean {
  const c = codServiciu(cod);
  if (!c) return false;
  const s = TOATE[c];
  /* Necunoscut nu inseamna „nu exista" — vezi antetul fisierului. */
  if (!s) return true;

  const de = (taraExpeditor || "RO").trim().toUpperCase();
  const la = (taraDestinatar || "RO").trim().toUpperCase();
  /* Pentru orice alta tara de plecare n-avem matricea lor. */
  if (de !== "RO") return true;

  return de === la ? s.intern : s.extern;
}

/**
 * Serviciile pe care le propunem in configurare, pentru tara de expeditie data.
 *
 * ⚠ Se opreste la RO. Pentru orice alta tara de plecare, matricea de zone e alta si
 * noi n-avem de ce s-o ghicim: se intoarce lista goala, ceea ce in interfata inseamna
 * „toate cele pe care le intoarce cotarea", nu „niciunul".
 */
export function serviciiPropuse(taraExpeditor: string): { cod: string; nume: string; intern: boolean; extern: boolean }[] {
  const tara = (taraExpeditor || "RO").trim().toUpperCase();
  if (tara !== "RO") return [];
  return Object.entries(SERVICII_RO).map(([cod, s]) => ({
    cod, nume: s.nume, intern: s.intern, extern: s.extern,
  }));
}

/**
 * ⚠ SERVICIUL IMPLICIT LA EMITERE — SI DE CE NU SE POATE LASA GOL.
 *
 * Ghidul romanesc, verbatim: „Daca nicio optiune de serviciu nu este selectata de
 * dvs., atunci expedierea se va efectua si **factura automat prin UPS Express**,
 * acolo unde este disponibil." Adica lipsa alegerii nu produce o eroare — produce
 * cel mai scump produs al lor, pe factura comerciantului.
 *
 * De aia `Service.Code` pleaca INTOTDEAUNA. Cand alegerea clientului lipseste, se ia
 * cel mai ieftin serviciu valabil pe ruta — nu cel mai scump, care e chiar implicitul
 * lor.
 */
export function serviciulImplicit(taraExpeditor: string, taraDestinatar: string): string {
  const de = (taraExpeditor || "RO").trim().toUpperCase();
  const la = (taraDestinatar || "RO").trim().toUpperCase();
  if (de !== "RO") return "65";
  /* Intre tari: UPS Standard e produsul economic si singurul fara descriere de marfa
     ceruta intre doua state din Uniune. Intern: Express Saver, cel mai ieftin din cele doua. */
  return de === la ? "65" : "11";
}
