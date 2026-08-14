import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { parolaMyGls } from "./parola";

/**
 * Clientul MyGLS.
 *
 * ═══ DE CE MyGLS SI NU API-UL DIN DEV-PORTAL ═══
 *
 * GLS are doua familii de API-uri sub acelasi brand. Portalul de developeri
 * (`api.gls-group.net`, ShipIT) cere un App cu drepturi acordate manual, nu
 * documenteaza nicaieri rambursul, si nu era accesibil pe contul nostru.
 * MyGLS (`api.mygls.ro`) e API-ul national: e ce primeste un comerciant roman
 * la semnarea contractului, are mediu de test, iar rambursul e un camp simplu.
 *
 * Contractul de mai jos e cel folosit in productie de pluginul oficial de
 * WooCommerce — deci nu e ghicit din documentatie, ci citit dintr-o integrare
 * care merge.
 *
 * ⚠ SE PROBEAZA DIRECT IN PRODUCTIE, pe contractul unui client real. De aceea
 * fiecare bucata care se poate verifica fara retea are probe, si de aceea
 * verdictele de eroare sunt tratate cu grija: o reincercare gresita inseamna un
 * al doilea colet real, facturat.
 */

/** Tarile in care MyGLS raspunde. Subdomeniul se formeaza din codul de tara. */
export const TARI_MYGLS = ["CZ", "HR", "HU", "RO", "SI", "SK", "RS"] as const;
export type TaraMyGls = (typeof TARI_MYGLS)[number];

/**
 * Formatul de tiparire a etichetei.
 *
 * ⚠ CELE DOUA METODE NU ACCEPTA ACELASI SET, si diferenta nu e teoretica.
 *
 * `GetPrintedLabelsRequest → TypeOfPrinter` (pagina 19) enumera OPT valori.
 * `PrintLabelsRequest → TypeOfPrinter` (pagina 23) enumera doar SAPTE: lipseste
 * `ShipItThermoZpl`, adaugat de GLS la 04.12.2025 (changelog, intrarea 25) —
 * adica la o saptamana dupa versiunea documentului (25.12.11), deci lista lui
 * `PrintLabels` pare pur si simplu neactualizata.
 *
 * Numai ca noi nu putem paria pe „pare". Appendix A are cod propriu pentru asta
 * (34, „Value of TypeOfPrinter is invalid"), iar formatul se alege O DATA in
 * configurare si se foloseste la FIECARE colet: daca GLS chiar il refuza, un
 * comerciant care il alege nu mai poate emite NIMIC, si mesajul nu-i spune ca
 * de vina e o optiune pe care i-am oferit-o noi.
 *
 * De aceea comerciantul alege doar dintre cele acceptate de EMITERE
 * (`TIPURI_IMPRIMANTA`), iar retiparirea le accepta pe toate opt — inclusiv
 * pentru configurarile salvate inainte de aceasta ingustare.
 *
 * ⚠ ThermoZPL tipareste la 203 DPI, ThermoZPL_300DPI la 300 — sunt doua
 * imprimante diferite, nu doua nume pentru aceeasi.
 *
 * ⚠ Ordinea conteaza: prima e cea implicita in formular.
 */
export const TIPURI_IMPRIMANTA = [
  "A4_2x2",
  "A4_4x1",
  "Connect",
  "Thermo",
  "ThermoZPL",
  "ThermoZPL_300DPI",
  "ShipItThermoPdf",
] as const;

/**
 * Ce accepta `GetPrintedLabels` in plus fata de emitere.
 *
 * ⚠ Tipul ramane larg (uniunea celor opt) fiindca in baza pot sta deja
 * configurari cu `ShipItThermoZpl`, salvate cat timp era oferit. Ele se citesc
 * fara sa cada; doar nu se mai pot ALEGE.
 */
export const TIPURI_IMPRIMANTA_RETIPARIRE = [
  ...TIPURI_IMPRIMANTA,
  "ShipItThermoZpl",
] as const;
export type TipImprimanta = (typeof TIPURI_IMPRIMANTA_RETIPARIRE)[number];

/**
 * Formatele care produc ZPL (text pentru imprimante Zebra), nu PDF.
 *
 * ⚠ Nu e un amanunt de prezentare: octetii intorsi de GLS se salveaza pe CDN si
 * se servesc mai departe. Declarati `application/pdf` si numiti `.pdf`, cum se
 * intampla pana acum, cititorul de PDF spune „fisier deteriorat" si comerciantul
 * n-are cum sa lege asta de formatul ales in configurare. Aceeasi lectie ca la
 * eColet.
 */
const FORMATE_ZPL = new Set<string>(["ThermoZPL", "ThermoZPL_300DPI", "ShipItThermoZpl"]);

/** Extensia si tipul MIME ale etichetei, dupa formatul ales de comerciant. */
export function felulEtichetei(tip: TipImprimanta | string | null | undefined): {
  ext: "zpl" | "pdf";
  tipMime: string;
} {
  return FORMATE_ZPL.has(String(tip))
    ? { ext: "zpl", tipMime: "application/vnd.zebra.zpl" }
    : { ext: "pdf", tipMime: "application/pdf" };
}

/**
 * ⚠ `PrintPosition` se trimite DOAR pentru formatele A4.
 *
 * Documentatia o spune la `PrintLabelsRequest` (pagina 23) si la
 * `GetPrintedLabelsRequest` (pagina 19), cu majuscule: „ACCEPTED ONLY FOR
 * A4-FORMAT". Trimis pe Thermo sau Connect, in cel mai bun caz e ignorat — dar
 * „in cel mai bun caz" nu e o garantie pe care s-o dam noi, cand alternativa e
 * sa nu-l trimitem deloc. Amandoi comerciantii cu GLS pornit azi sunt pe
 * „Connect", deci ramura asta chiar se foloseste.
 */
function pozitiaDeTiparit(config: GlsConfig): Record<string, number> {
  const esteA4 = config.tip_imprimanta === "A4_2x2" || config.tip_imprimanta === "A4_4x1";
  if (!esteA4) return {};
  const p = Math.trunc(Number(config.pozitie_tiparire));
  return { PrintPosition: p >= 1 && p <= 4 ? p : 1 };
}

export type GlsConfig = {
  enabled: boolean;
  username: string;
  password: string;
  /** `ClientNumber` din contract. Numar, nu sir — MyGLS il vrea ca intreg. */
  client_number: number;
  tara: TaraMyGls;
  sandbox: boolean;
  tip_imprimanta: TipImprimanta;
  /** 1..4 pentru A4_2x2; de unde incepe tiparirea pe coala. */
  pozitie_tiparire: number;
  /**
   * ⚠ Codul postal al adresei de RIDICARE.
   *
   * Sta aici, in configurare, si nu se ia din `businesses`, fiindca acolo nu
   * exista: tabelul are `store_address`, `store_city`, `store_county` — si
   * niciun camp de cod postal, nici pentru magazin, nici pentru firma.
   *
   * Ceilalti curieri nu-l cer, fiindca ridica de la un punct inregistrat la ei
   * (`location_id` la Cargus, `pickup_point_id` la Sameday). GLS primeste adresa
   * intreaga la fiecare colet, iar `ZipCode` e camp cerut in clasa `Address`.
   * Lasat gol, plecau toate expedierile cu el necompletat.
   */
  expeditor_cod_postal?: string;
};

/**
 * Adresa, in forma ceruta de MyGLS.
 *
 * ⚠ Numele campurilor sunt cele ale MyGLS (`ZipCode`, `CountryIsoCode`), nu ale
 * noastre. Nu se „infrumuseteaza": un camp scris altfel e ignorat tacut, iar
 * eticheta iese fara telefon sau fara cod postal.
 */
export type AdresaGls = {
  Name: string;
  Street: string;
  /**
   * ⚠ „Number of the house. (ONLY NUMBER)" — camp separat de `Street`.
   *
   * Pana acum totul intra in `Street` si se taia la 40 de caractere pe granita
   * de cuvant, deci numarul, care sta la sfarsit, era primul care pica. Vezi
   * `despartaAdresa` din expediere.ts.
   */
  HouseNumber?: string;
  /** „Additional information. (Building, stairway, etc.)" — bloc, scara, etaj. */
  HouseNumberInfo?: string;
  City: string;
  ZipCode: string;
  CountryIsoCode: string;
  ContactName: string;
  ContactPhone: string;
  ContactEmail: string;
};

/** Un serviciu de pe colet: cod plus, uneori, un parametru cu nume propriu. */
export type ServiciuGls = { Code: string } & Record<string, unknown>;

export type ColetGls = {
  ClientNumber: number;
  ClientReference: string;
  Count: number;
  PickupAddress: AdresaGls;
  DeliveryAddress: AdresaGls;
  ServiceList: ServiciuGls[];
  /** ⚠ Ramburs. Se trimite DOAR daca plata e ramburs — vezi `expediere.ts`. */
  CODAmount?: number;
  CODReference?: string;
  Content?: string;
};

export type RaspunsEtichete = {
  /** PDF-ul etichetelor, ca lista de octeti. */
  Labels?: number[];
  PrintLabelsInfoList?: { ParcelId?: number; ParcelNumber?: number; ClientReference?: string }[];
  PrintLabelsErrorList?: EroareColet[];
  ErrorCode?: number;
  ErrorDescription?: string;
};

/**
 * Eroarea unei metode de ParcelService.
 *
 * ⚠ `ParcelIdList` e o LISTA, nu un `ParcelId`.
 *
 * Documentatia MyGLS (ver. 25.12.11, pagina 11, clasa `ErrorInfo`) o defineste ca
 * „lista de ID-uri unde s-a produs eroarea". Adica o singura intrare de eroare
 * poate acoperi mai multe colete deodata — cine o citeste ca pe o pereche
 * eroare↔colet pierde restul coletelor din ea.
 */
export type EroareColet = {
  ErrorCode?: number;
  ErrorDescription?: string;
  ClientReferenceList?: string[];
  ParcelIdList?: number[];
};

export type RaspunsStergere = {
  DeleteLabelsErrorList?: EroareColet[];
  /** ⚠ Sub-coletele unei expedieri cu mai multe colete se sterg odata cu el. */
  SuccessfullyDeletedList?: { ParcelId?: number; SubParcelIdList?: number[] }[];
};

export type StareColet = {
  StatusCode?: string;
  StatusDescription?: string;
  StatusDate?: string;
  DepotCity?: string;
  DepotNumber?: string;
};

export type RaspunsStari = {
  ParcelStatusList?: StareColet[];
  /** Aceeasi clasa `ErrorInfo` ca peste tot, nu o forma proprie. */
  GetParcelStatusErrors?: EroareColet[];
};

/**
 * ⚠ Timp maxim de asteptare.
 *
 * Pluginul oficial foloseste 60s. Il pastram: MyGLS chiar raspunde lent la
 * loturi mari, iar un timeout prea scurt nu opreste expedierea de partea lor —
 * doar ne face sa credem ca n-a mers. Iar atunci reincercarea creeaza al doilea
 * colet, real si facturat.
 */
const ASTEPTARE_MS = 60_000;

function urlBaza(config: Pick<GlsConfig, "tara" | "sandbox">): string {
  const gazda = config.sandbox ? "api.test.mygls." : "api.mygls.";
  return `https://${gazda}${config.tara.toLowerCase()}`;
}

/** Adresa completa a unei metode MyGLS. */
export function urlMetoda(
  config: Pick<GlsConfig, "tara" | "sandbox">,
  metoda: string,
  serviciu = "ParcelService",
): string {
  return `${urlBaza(config)}/${serviciu}.svc/json/${metoda}`;
}

/**
 * Apel MyGLS.
 *
 * ═══ VERDICTELE, PE RAND ═══
 *
 * Registrul de operatii externe are nevoie de un singur raspuns: a REFUZAT
 * furnizorul, sau nu stim? Aici se hotaraste, fiindca doar aici se stie.
 *
 * ⚠ **MyGLS raspunde 200 si refuza in corp.** Exact ca DPD: `ErrorCode` diferit
 * de 0 pe un raspuns HTTP reusit. Daca ne-am uita doar la status, refuzul ala ar
 * iesi „necunoscut" si ar bloca comanda degeaba.
 *
 * ⚠ Timeout si retea cazuta sunt NESIGURE, nu esecuri: cererea poate sa fi ajuns
 * si coletul sa existe deja. O reincercare „libera" ar tipari a doua eticheta.
 */
async function apelMyGls<T>(
  config: GlsConfig,
  metoda: string,
  corp: Record<string, unknown>,
  serviciu = "ParcelService",
  asteptareMs = ASTEPTARE_MS,
): Promise<T> {
  const url = urlMetoda(config, metoda, serviciu);

  /* ⚠ Datele de acces se adauga AICI, o singura data. Nu intra in obiectele
     construite de apelanti, ca sa nu ajunga din greseala in loguri. */
  const cuAcces = {
    Username: config.username,
    Password: parolaMyGls(config.password),
    ...corp,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuAcces),
      signal: AbortSignal.timeout(asteptareMs),
    });
  } catch (e) {
    /* Retea cazuta sau timeout: nu stim daca a ajuns. */
    throw eroareNesigura(`GLS ${metoda}: ${(e as Error).message}`);
  }

  const text = await res.text();

  if (!res.ok) {
    /*
     * 401/403 merita mesaj propriu: la MyGLS inseamna aproape intotdeauna ori
     * date de acces gresite, ori un cont fara drepturi pe metoda ceruta — nu
     * ceva ce s-ar repara reincercand.
     */
    if (res.status === 401) {
      throw eroareRefuz("GLS: autentificare esuata — verifica utilizatorul, parola si mediul (test/productie)");
    }
    if (res.status === 403) {
      throw eroareRefuz("GLS: acces interzis — contul nu are drepturi pe aceasta operatiune");
    }
    throw eroareCuStatus(`GLS ${metoda}: ${res.status} — ${text.slice(0, 500)}`, res.status);
  }

  let date: T & { ErrorCode?: number; ErrorDescription?: string };
  try {
    date = JSON.parse(text) as T & { ErrorCode?: number; ErrorDescription?: string };
  } catch {
    /* Raspuns necitibil dupa un 200: poate a lucrat, poate nu. */
    throw eroareNesigura(`GLS ${metoda}: raspuns necitibil — ${text.slice(0, 300)}`);
  }

  /* ⚠ Refuzul din corp, pe 200. Vezi nota din antet. */
  if (typeof date.ErrorCode === "number" && date.ErrorCode !== 0) {
    const mesaj = `GLS ${metoda}: ${date.ErrorDescription ?? `eroare ${date.ErrorCode}`}`;
    throw Object.assign(
      CODURI_INCERTE.has(date.ErrorCode) ? eroareNesigura(mesaj) : eroareRefuz(mesaj),
      { cauze: [date.ErrorCode] },
    );
  }

  return date;
}

/**
 * ⚠ CODURILE DUPA CARE COLETUL POATE SA EXISTE DEJA.
 *
 * Pana acum, ORICE `ErrorCode` diferit de 0 iesea „refuz dovedit". Pentru
 * majoritatea codurilor e adevarat — o validare respinsa nu creeaza nimic. Dar
 * `esuat` inseamna pentru registru „nu s-a intamplat nimic acolo, reincercarea e
 * LIBERA", iar la `PrintLabels` reincercarea libera inseamna un al doilea colet
 * real si facturat.
 *
 * Si Appendix A insusi arata ca emiterea are FAZE: „Parcel number generator
 * failed" (19) si „Parcel numbers were not generated" (20) descriu esecuri de
 * DUPA ce inregistrarea coletului exista — altfel n-ar avea ce numar sa
 * genereze. La fel „Label is empty" (16) si „There are no printable labels"
 * (21): eticheta se produce dintr-un colet care exista deja.
 *
 *   16   Label is empty
 *   19   Parcel number generator failed
 *   20   Parcel numbers were not generated
 *   21   There are no printable labels
 *   31   Same request sent 5 times within last 5 minutes
 *   1000 Unexpected exception happened
 *   1001 Internal Problem
 *
 * ⚠ 31 e cel mai contraintuitiv, si merita citit de doua ori: GLS spune ca a
 * primit ACEEASI cerere de cinci ori in cinci minute. Adica primele patru au
 * ajuns la el. Refuzul lui e despre a CINCEA, si nu spune nimic despre ce s-a
 * intamplat cu celelalte — poate exista deja patru colete. „Refuz dovedit" ar fi
 * exact raspunsul gresit.
 *
 * ⚠ Ce NU e aici, dinadins: -1 („Unauthorized."), 13 („Parcel validation
 * issue"), 14, 22, 27, 28, 29, 30, 32, 33, 34, 43, 44, 48. Toate sunt validari
 * dinaintea oricarui efect, deci reincercarea dupa corectarea datelor e libera —
 * si chiar trebuie sa fie, altfel prima adresa gresita blocheaza comanda.
 */
const CODURI_INCERTE = new Set([16, 19, 20, 21, 31, 1000, 1001]);

/**
 * Emite etichetele pentru o lista de colete.
 *
 * ⚠ Metoda asta CREEAZA colete reale, facturate. Nu se cheama de doua ori pentru
 * aceeasi comanda fara sa treci prin registrul de operatii externe.
 */
export async function tipareste(
  config: GlsConfig,
  colete: ColetGls[],
): Promise<RaspunsEtichete> {
  if (colete.length === 0) throw eroareRefuz("GLS: nu s-a trimis niciun colet");

  const raspuns = await apelMyGls<RaspunsEtichete>(config, "PrintLabels", {
    /*
     * `WebshopEngine` e doar identificarea integratorului. GLS il foloseste ca
     * sa stie de unde vin cererile; nu schimba comportamentul.
     */
    WebshopEngine: "edinio",
    ParcelList: colete,
    ...pozitiaDeTiparit(config),
    TypeOfPrinter: config.tip_imprimanta || "A4_2x2",
    ShowPrintDialog: false,
  });

  /*
   * ⚠ Erorile PE COLET vin separat de `ErrorCode`-ul general, si un raspuns
   * poate avea si etichete, si erori: la un lot, unele colete trec si altele nu.
   * Nu se arunca aici — apelantul trebuie sa poata salva ce a reusit.
   */
  return raspuns;
}

/** Adevarat daca raspunsul chiar contine cel putin o eticheta. */
export function areEtichete(r: RaspunsEtichete): boolean {
  return Array.isArray(r.Labels) && r.Labels.length > 0;
}

/**
 * PDF-ul etichetelor, din lista de octeti trimisa de MyGLS.
 *
 * ⚠ `Labels` e un tablou de numere, nu base64 si nu text. Echivalentul PHP din
 * pluginul oficial e `implode(array_map('chr', $labels))`. Tratat ca sir, iese
 * un PDF corupt care se deschide gol — si afli abia cand curierul refuza coletul.
 */
export function pdfDinEtichete(r: RaspunsEtichete): Buffer | null {
  if (!areEtichete(r)) return null;
  return Buffer.from(Uint8Array.from(r.Labels as number[]));
}

/**
 * Numerele de colet (AWB) dintr-un raspuns.
 *
 * MyGLS intoarce si `ParcelId` (intern), si `ParcelNumber` (cel de pe eticheta,
 * cel pe care il urmareste clientul). Noi pastram `ParcelNumber`.
 */
export function numereColet(r: RaspunsEtichete): string[] {
  return (r.PrintLabelsInfoList ?? [])
    .map((i) => i.ParcelNumber)
    .filter((n): n is number => typeof n === "number")
    .map(String);
}

/**
 * ID-urile interne ale coletelor (`ParcelId`).
 *
 * ⚠ SE PASTREAZA OBLIGATORIU, chiar daca pe comanda afisam `ParcelNumber`.
 *
 * Documentatia MyGLS (ver. 25.12.11) arata ca `DeleteLabels` si
 * `GetPrintedLabels` cer amandoua `ParcelIdList` — adica ID-ul din baza GLS, NU
 * numarul de pe eticheta. Fara el nu se poate nici anula un AWB, nici retipari
 * eticheta. Numarul de colet, pe care il vede clientul, nu e acceptat de niciuna
 * dintre cele doua metode.
 */
export function idColete(r: RaspunsEtichete): number[] {
  return (r.PrintLabelsInfoList ?? [])
    .map((i) => i.ParcelId)
    .filter((n): n is number => typeof n === "number");
}

/** Erorile per colet, ca text citibil de comerciant. */
export function eroriPeColet(r: RaspunsEtichete): string[] {
  return (r.PrintLabelsErrorList ?? []).map((e) => {
    const referinte = e.ClientReferenceList?.length ? ` (${e.ClientReferenceList.join(", ")})` : "";
    return `${e.ErrorDescription ?? `eroare ${e.ErrorCode ?? "?"}`}${referinte}`;
  });
}

/**
 * ⚠ Cate ID-uri incap intr-o cerere de stergere.
 *
 * „MAX. 50 ITEMS PER REQUEST", scris chiar in tabelul lui `ParcelIdList`
 * (documentatia MyGLS ver. 25.12.11, pagina 27). Depasirea are cod propriu in
 * Appendix A: 22, „Count of parcels for deleting is out of limit".
 */
export const MAX_STERGERI_PE_CERERE = 50;

/** Bucati de cel mult `MAX_STERGERI_PE_CERERE`. */
function bucati<T>(lista: T[], marime: number): T[][] {
  const iesire: T[][] = [];
  for (let i = 0; i < lista.length; i += marime) iesire.push(lista.slice(i, i + marime));
  return iesire;
}

export type RodStergere = {
  /** ID-urile pe care GLS le-a confirmat ca sterse (inclusiv sub-coletele lor). */
  sterse: number[];
  /**
   * ID-uri despre care GLS spune ca NU EXISTA (Appendix A, codul 4).
   *
   * ⚠ Se numara separat de erori fiindca inseamna acelasi lucru ca o stergere
   * reusita: la GLS nu mai e nimic sub numarul ala.
   *
   * Cazul din care s-a nascut campul: `DeleteLabels` intra in timeout dupa ce
   * GLS apucase sa stearga. Verdictul e „necunoscut", deci comerciantul incearca
   * din nou — si a doua oara primeste codul 4. Fara randul asta, incercarea a
   * doua ar fi fost citita ca esec, iar comanda ar fi ramas cu un AWB pe care
   * nimeni nu-l mai putea scoate: nici anulat (nu mai exista la GLS), nici
   * reemis (registrul il tinea ocupat).
   *
   * ID-urile vin din raspunsul GLS la emitere, deci „nu exista" chiar inseamna
   * „a fost sters", nu „am cautat gresit".
   *
   * ⚠ ATENTIE: presupune ca intrebam ACEEASI instanta MyGLS in care s-a emis.
   * Productia si mediul de test sunt baze SEPARATE, la fel cele sapte tari, deci
   * un cod 4 primit dupa ce s-a schimbat mediul nu inseamna „sters", ci „ai
   * intrebat in alta parte". De aceea apelantul verifica mediul inainte — vezi
   * `mediulSePotriveste` din gls.actions.ts.
   */
  inexistente: number[];
  /**
   * ⚠ ID-uri la care GLS a raspuns cu codul 6, „different status than PRINTED".
   *
   * ACESTEA SUNT AMBIGUE, si de aici se nastea fundatura. Codul 6 acopera doua
   * situatii opuse:
   *
   *   a) coletul a fost DEJA sters de noi (o incercare anterioara a reusit, dar
   *      raspunsul ei s-a pierdut) — starea lui e acum DELETED, deci „diferita
   *      de PRINTED";
   *   b) GLS a PRELUAT coletul si chiar pleaca spre client.
   *
   * ⚠ Si nu e o speculatie: documentatia descrie `DeleteLabels` chiar in prima
   * ei linie ca „Set DELETED state for labels/parcels" (pagina 27). Deci metoda
   * NU sterge inregistrarea, ii schimba starea — iar la a doua cerere ID-ul
   * EXISTA in continuare si raspunsul NU mai poate fi codul 4.
   *
   * Asta darama argumentul pe care se sprijinea toata curatenia de dupa o
   * anulare pierduta („a doua apasare ia codul 4 si se repara singur"): a doua
   * apasare ia codul 6. Tratat ca eroare obisnuita, cum era pana acum, comanda
   * ramanea cu un AWB pe care nimeni nu-l mai putea scoate — nici anulat, nici
   * reemis, si nici macar vizibil in supapa de operatii atarnate.
   *
   * Se intorc deci APARTE, iar cine le primeste le deosebeste uitandu-se la
   * ISTORICUL coletului: unul care n-a plecat niciodata din depozit e cazul (a),
   * unul cu miscari reale in retea e cazul (b). Vezi `deleteGlsAwbAction`.
   */
  nesigure: number[];
  /** Mesajele de refuz, gata de aratat comerciantului. */
  erori: string[];
};

/** Appendix A: coletul cerut nu exista in baza GLS. */
const COD_INEXISTENT = 4;

/** Appendix A: „Parcel with this ID has different status than PRINTED". */
export const COD_ALTA_STARE = 6;

/**
 * Sterge etichetele, adica ANULEAZA coletele la GLS.
 *
 * ═══ ⚠ CERE `ParcelId`, NU NUMARUL DE PE ETICHETA ═══
 *
 * `ParcelIdList` e singurul camp al cererii (documentatia ver. 25.12.11, pagina
 * 27). Numarul de colet — cel pe care il vede clientul si pe care il tinem in
 * `orders.gls_awb_number` — NU e acceptat.
 *
 * Si nu e o scapare a documentatiei: `ModifyCOD`, in acelasi document (pagina
 * 29), primeste EXPLICIT si `ParcelId`, si `ParcelNumber`, fiecare „obligatoriu
 * daca celalalt lipseste". Deci autorii ofera numarul de colet acolo unde merge;
 * absenta lui aici e voita. De aceea `ParcelId` se pastreaza la emitere, in
 * `detalii` din registrul de operatii externe.
 *
 * ═══ ⚠ SUCCESUL E PARTIAL ═══
 *
 * Raspunsul poate avea in acelasi timp si `SuccessfullyDeletedList`, si
 * `DeleteLabelsErrorList`. Nici HTTP 200 nu inseamna „s-a sters tot", nici o
 * lista de erori nevida nu inseamna „nu s-a sters nimic". Se reconciliaza pe
 * `ParcelId`, si de aia functia intoarce amandoua listele in loc sa arunce.
 *
 * ⚠ Codul 6 („Parcel with this ID has different status than PRINTED", Appendix
 * A) inseamna ca GLS a preluat deja coletul: stergerea e permisa doar cat timp
 * eticheta e doar tiparita. Atunci coletul CHIAR pleaca spre client, si AWB-ul nu
 * are voie sa dispara de pe comanda.
 */
export async function stergeEtichete(
  config: GlsConfig,
  parcelIds: number[],
): Promise<RodStergere> {
  const curate = [...new Set(parcelIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (curate.length === 0) throw eroareRefuz("GLS: nu s-a trimis niciun ParcelId de sters");

  const sterse: number[] = [];
  const inexistente: number[] = [];
  const nesigure: number[] = [];
  const erori: string[] = [];

  const felii = bucati(curate, MAX_STERGERI_PE_CERERE);
  for (let i = 0; i < felii.length; i++) {
    const bucata = felii[i];
    /*
     * ⚠ NU se trimite `ClientNumberList`, desi e in `APIRequestBase` (pagina 6).
     *
     * Changelog-ul documentatiei, intrarea 2 (21.10.2019), spune despre el
     * literal „do not use". Contul are oricum un singur `ClientNumber`, iar
     * drepturile pe colet le verifica GLS singur (Appendix A: 5 „Access denied
     * for this parcel ID", 15 „User is not authorized to access parcel").
     */
    let r: RaspunsStergere;
    try {
      r = await apelMyGls<RaspunsStergere>(config, "DeleteLabels", {
        ParcelIdList: bucata,
      });
    } catch (e) {
      /*
       * ⚠ O BUCATA PICATA NU ARE VOIE SA ARUNCE REZULTATUL CELORLALTE.
       *
       * Pana acum exceptia urca direct din bucla, iar `deleteGlsAwbAction` o
       * prindea si intorcea doar mesajul — deci coletele DEJA sterse in feliile
       * dinainte se pierdeau fara urma. La reincercare ele raspund cu codul 6
       * („already DELETED"), adica exact ambiguitatea de mai sus, si comanda
       * ramanea infundata din cauza unei erori de retea la a doua felie.
       *
       * Acum esecul se noteaza si se merge mai departe: apelantul primeste si ce
       * a reusit, si ce n-a reusit, si poate hotari in cunostinta de cauza.
       */
      erori.push(
        `bucata ${i + 1} din ${felii.length} (colete ${bucata.join(", ")}): ${(e as Error).message}`,
      );
      continue;
    }

    for (const s of r.SuccessfullyDeletedList ?? []) {
      if (typeof s.ParcelId === "number") sterse.push(s.ParcelId);
      for (const sub of s.SubParcelIdList ?? []) {
        if (typeof sub === "number") sterse.push(sub);
      }
    }
    for (const e of r.DeleteLabelsErrorList ?? []) {
      const ale = (e.ParcelIdList ?? []).filter((n): n is number => typeof n === "number");

      /*
       * ⚠ Codul 4 se ia in seama DOAR daca spune si CARE colete.
       *
       * Fara `ParcelIdList`, o intrare inghitita aici ar disparea complet: n-ar
       * intra nici la disparute, nici la erori, iar comerciantul ar primi un
       * „GLS nu a confirmat anularea" fara sa afle niciodata ce a raspuns GLS.
       * Documentatia nu promite nicaieri ca lista e mereu completata.
       */
      if (e.ErrorCode === COD_INEXISTENT && ale.length > 0) {
        /* Nu e o eroare de aratat: sub numerele alea nu mai e nimic la GLS. */
        inexistente.push(...ale);
        continue;
      }
      /*
       * Codul 6 pleaca aparte, nici la sterse nici la erori: singur, nu spune
       * daca coletul a fost deja sters sau daca a plecat spre client. Vezi
       * `nesigure`.
       */
      if (e.ErrorCode === COD_ALTA_STARE && ale.length > 0) {
        nesigure.push(...ale);
        continue;
      }
      const ids = ale.length ? ` (colete ${ale.join(", ")})` : "";
      erori.push(`${e.ErrorDescription ?? `eroare ${e.ErrorCode ?? "?"}`}${ids}`);
    }
  }

  return { sterse, inexistente, nesigure, erori };
}

/**
 * ⚠ Cate ID-uri incap intr-o cerere de RETIPARIRE. Nu e acelasi numar ca la
 * stergere: 99 aici, 50 la `DeleteLabels`, 100 la `GetParcelListStatuses`
 * (documentatia MyGLS ver. 25.12.11, paginile 19, 27). O singura constanta
 * „limita GLS" ar fi gresita la doua dintre cele trei.
 */
export const MAX_RETIPARIRI_PE_CERERE = 99;

/**
 * ⚠ Raspunsul lui `GetPrintedLabels` NU are forma celui de la `PrintLabels`.
 *
 * PDF-ul se cheama la fel (`Labels`, tot tablou de octeti), dar celelalte doua
 * liste au ALTE NUME si alta forma: `PrintDataInfoList` de tip `PrintDataInfo`,
 * nu `PrintLabelsInfoList`, si `GetPrintedLabelsErrorList`, nu
 * `PrintLabelsErrorList` (documentatia ver. 25.12.11, paginile 19-20).
 *
 * De aia NU se refoloseste `RaspunsEtichete`. Ar fi compilat fara nicio plangere
 * — campurile lipsa sunt toate optionale — si `numereColet()`/`eroriPeColet()`
 * ar fi intors liste GOALE la fiecare apel, fara nicio eroare. Adica exact felul
 * de defect care se descopera dupa ce a mers „bine" o luna.
 */
export type PrintDataInfo = {
  ParcelId?: number;
  /** ⚠ Numarul FARA cifra de control; cel cu ea e `ParcelNumberWithCheckdigit`. */
  ParcelNumber?: number;
  ParcelNumberWithCheckdigit?: number;
  ClientReference?: string;
};

export type RaspunsRetiparire = {
  Labels?: number[];
  GetPrintedLabelsErrorList?: EroareColet[];
  PrintDataInfoList?: PrintDataInfo[];
};

/**
 * Cere DIN NOU eticheta unor colete deja emise.
 *
 * ═══ ⚠ CE CORECTEAZA ═══
 *
 * Prima forma a integrarii pornea de la ideea ca eticheta se pierde daca n-o
 * salvezi la creare, si ca singura cale de a o mai obtine ar fi `PrintLabels` —
 * adica un al DOILEA colet, real si facturat. Asa se poarta pluginul de
 * WooCommerce, care nici nu cheama metoda asta; nu asa se poarta API-ul.
 *
 * `GetPrintedLabels` primeste `ParcelIdList`, adica ID-uri de inregistrari care
 * EXISTA DEJA. Cererea nu are niciun camp prin care sa descrii un colet nou, deci
 * structural nu poate crea unul.
 *
 * ⚠ Cu o nuanta care merita scrisa, fiindca documentatia o spune si e usor de
 * citit gresit: metoda „genereaza numerele de colet". In fluxul in doi pasi
 * (`PrepareLabels` → `GetPrintedLabels`), PRIMUL apel e cel care da numarul de
 * urmarire, deci acolo nu e o retiparire. Noi insa emitem prin `PrintLabels`,
 * care face amandoi pasii deodata: coletele noastre au deja si `ParcelId`, si
 * `ParcelNumber`, deci aici nu mai are ce numar sa genereze.
 *
 * De aia se cheama DOAR cu ID-uri luate din raspunsul unei emiteri reusite, si
 * niciodata cu ID-uri venite din alta parte.
 */
export async function retipareste(
  config: GlsConfig,
  parcelIds: number[],
): Promise<RaspunsRetiparire> {
  const curate = [...new Set(parcelIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (curate.length === 0) throw eroareRefuz("GLS: nu s-a trimis niciun ParcelId de retiparit");
  if (curate.length > MAX_RETIPARIRI_PE_CERERE) {
    throw eroareRefuz(`GLS: cel mult ${MAX_RETIPARIRI_PE_CERERE} colete pe o cerere de retiparire`);
  }

  return apelMyGls<RaspunsRetiparire>(config, "GetPrintedLabels", {
    ParcelIdList: curate,
    ...pozitiaDeTiparit(config),
    TypeOfPrinter: config.tip_imprimanta || "A4_2x2",
    ShowPrintDialog: false,
  });
}

/**
 * ID-urile pe care GLS chiar le-a retiparit.
 *
 * ⚠ O retiparire poate fi PARTIALA: `Labels` vine nevid pentru coletele care au
 * mers, iar celelalte stau in `GetPrintedLabelsErrorList`. Cine se uita doar la
 * „am primit octeti?" ia un PDF cu doua etichete drept raspuns pentru trei
 * colete — si il si salveaza pe CDN, de unde va fi servit la nesfarsit.
 */
export function idRetiparite(r: RaspunsRetiparire): number[] {
  return (r.PrintDataInfoList ?? [])
    .map((i) => i.ParcelId)
    .filter((n): n is number => typeof n === "number");
}

/** PDF-ul dintr-o retiparire, sau `null` daca GLS n-a trimis niciun octet. */
export function pdfDinRetiparire(r: RaspunsRetiparire): Buffer | null {
  if (!Array.isArray(r.Labels) || r.Labels.length === 0) return null;
  return Buffer.from(Uint8Array.from(r.Labels));
}

/** Erorile unei retipariri, ca text citibil de comerciant. */
export function eroriRetiparire(r: RaspunsRetiparire): string[] {
  return (r.GetPrintedLabelsErrorList ?? []).map((e) => {
    const ids = e.ParcelIdList?.length ? ` (colete ${e.ParcelIdList.join(", ")})` : "";
    return `${e.ErrorDescription ?? `eroare ${e.ErrorCode ?? "?"}`}${ids}`;
  });
}

/**
 * Starile unui colet.
 *
 * ⚠ Citire pura: nu creeaza si nu schimba nimic la GLS, deci se poate reincerca
 * fara grija. De aia NU trece prin registrul de operatii externe.
 */
export async function stariColet(
  config: GlsConfig,
  numarColet: string | number,
  /**
   * ⚠ Cat asteptam, cand apelantul nu-si poate permite implicitul de 60 de secunde.
   *
   * Cronul de urmarire ruleaza in cel mult 60 de secunde cu totul, adica EXACT cat
   * asteptarea unui singur apel. Pe implicit, un colet care atarna consuma toata
   * tura, iar paza de termen n-apuca sa intervina niciodata — si cum el ramane
   * primul in coada, ar taia fiecare rulare la nesfarsit.
   */
  asteptareMs?: number,
): Promise<StareColet[]> {
  const numar = typeof numarColet === "number" ? numarColet : Number(numarColet);
  if (!Number.isFinite(numar)) throw eroareRefuz(`GLS: numar de colet invalid „${numarColet}"`);

  const r = await apelMyGls<RaspunsStari>(config, "GetParcelStatuses", {
    ParcelNumber: numar,
    /*
     * ⚠ `false`, si nu din economie de octeti.
     *
     * `ReturnPOD` aduce dovada de livrare: PDF-ul cu numele si SEMNATURA
     * destinatarului — date personale ale unui TERT, serializate ca tablou de
     * intregi (un PDF de 40 KB devine ~180 KB de JSON). Nimic din cod nu citeste
     * campul: nu e nici macar declarat in `RaspunsStari`. Deci pana acum
     * aduceam, la fiecare rulare a cronului si pentru fiecare colet livrat,
     * semnatura cumparatorului pe serverul nostru ca s-o aruncam la `JSON.parse`.
     *
     * Si costa exact acolo unde doare: apelurile lente sunt motivul pentru care
     * asteptarea pe colet a trebuit coborata la 12 secunde.
     *
     * Cand va exista un ecran care chiar arata dovada de livrare, se cere
     * PUNCTUAL, dintr-o actiune apasata de comerciant pe o comanda anume.
     */
    ReturnPOD: false,
    /*
     * Descrierile vin in romana. Conteaza: textul asta ajunge asa cum e in panou
     * si in notificarea de retur catre comerciant, iar „The parcel has been
     * returned to sender" nu spune nimic unui om care nu stie engleza — pe cand
     * cifra singura („cod 23") nu spune nimic nimanui.
     */
    LanguageIsoCode: "RO",
  }, "ParcelService", asteptareMs);

  if (r.GetParcelStatusErrors?.length) {
    /* Codurile se pastreaza in `cauze`: `probaConexiune` judeca dupa ele, nu dupa text. */
    throw Object.assign(
      eroareRefuz(`GLS stari colet: ${descrieErori(r.GetParcelStatusErrors)}`),
      { cauze: r.GetParcelStatusErrors.map((e) => e.ErrorCode).filter((c): c is number => typeof c === "number") },
    );
  }
  return r.ParcelStatusList ?? [];
}

/** Erorile unei metode, ca text scurt si citibil. */
function descrieErori(erori: EroareColet[]): string {
  return erori
    .map((e) => `${e.ErrorDescription ?? "eroare"} (${e.ErrorCode ?? "?"})`)
    .join("; ")
    .slice(0, 300);
}

/**
 * ⚠ Codurile care dovedesc ca GLS NE-A RECUNOSCUT si doar coletul nu e al nostru.
 *
 * Toate din Appendix A al documentatiei oficiale (`api.mygls.ro/docs/MyGLS_API.pdf`,
 * ver. 25.12.11):
 *
 *   4  Parcel ID not exists
 *   5  Access denied for this parcel ID
 *   9  Parcel number not exists
 *   10 Parcel number was not assigned yet
 *   15 User is not authorized to access parcel
 *   26 Parcel not found with current settings
 *
 * Ca sa raspunda oricare dintre ele, cererea a trecut DEJA de autentificare: GLS
 * s-a uitat la colet, nu la cine intreaba.
 *
 * ⚠ LISTA AVEA DOAR 4 SI 26, iar asta a picat pe un client real (Insula Bucuriei,
 * 14.08): MyGLS a raspuns cu 5 — „Access denied for this parcel ID" — si butonul
 * de conectare a iesit rosu desi datele erau bune. Coletul cu numarul 1, cel cu
 * care intreaba proba, exista la ei si e al altcuiva; de aici „acces refuzat" in
 * loc de „nu exista".
 *
 * ⚠ Si mai important: `GetParcelStatuses` primeste un ParcelNUMBER, nu un
 * ParcelID. Codurile pentru numar sunt 9 si 10 — niciunul nu era in lista.
 * Adica proba trecea doar din noroc, cand GLS raspundea cu un cod de ID.
 *
 * ⚠ CE NU E AICI, dinadins: 14 = „User not exists". Ala e chiar refuzul de
 * autentificare, adica exact ce trebuie sa iasa ROSU. La fel orice cod
 * necunoscut: mai bine o proba prea severa, pe care omul o poate cerceta, decat
 * una linistitoare si falsa.
 */
export const CODURI_COLET_NEGASIT = new Set([4, 5, 9, 10, 15, 26]);

/**
 * ⚠ Codul care inseamna „nu te cunoastem". Nu e in lista de mai sus si nu are ce
 * cauta acolo — sta scris aparte ca sa nu ajunga cineva sa-l adauge din greseala
 * cand mai apare vreun cod de colet negasit.
 */
export const COD_UTILIZATOR_INEXISTENT = 14;

/**
 * ⚠ Appendix A, 31: „Same request sent 5 times within last 5 minutes".
 *
 * Dovedeste recunoasterea la fel de bine ca un „colet negasit": ca sa numere
 * cererile identice, GLS le-a legat de contul nostru — deci autentificarea a
 * trecut. Si e SIGUR ca apare aici: proba trimite de fiecare data EXACT aceeasi
 * cerere (numarul de colet 1), iar butonul „Testeaza conexiunea" se apasa de
 * cateva ori la rand pana ies datele bune.
 *
 * Fara el, a cincea apasare in cinci minute scotea buton ROSU pe o configurare
 * perfect valida — si comerciantul incepea sa umble la datele de acces, care nu
 * aveau nimic.
 */
const COD_PREA_DES = 31;

/**
 * Proba de conexiune pentru panoul de configurare.
 *
 * ⚠ Foloseste o CITIRE, nu o creare. Un „testeaza conexiunea" care emite un AWB
 * ar factura un colet real la fiecare apasare pe buton — iar butonul ala se
 * apasa de zece ori pana iese configurarea.
 *
 * Se interogheaza un numar de colet care aproape sigur nu exista: daca datele de
 * acces sunt gresite, MyGLS raspunde cu eroare de autentificare INAINTE sa se
 * uite la numar. Deci „colet negasit" e un raspuns BUN — dovedeste ca ne-a
 * recunoscut.
 */
export async function probaConexiune(
  config: GlsConfig,
): Promise<{ ok: true } | { ok: false; eroare: string }> {
  try {
    await stariColet(config, 1);
    return { ok: true };
  } catch (e) {
    const cauze = (e as { cauze?: number[] }).cauze ?? [];

    /*
     * ⚠ LISTA ALBA, nu neagra. Implicit: ROSU.
     *
     * Varianta dintai spunea „daca mesajul contine «stari colet», conexiunea e
     * buna" — adica orice eroare venita in `GetParcelStatusErrors` trecea drept
     * succes, fiindca toate poarta acel text. Inclusiv un refuz de autentificare:
     * butonul „Testeaza conexiunea" iesea VERDE cu parola gresita, iar
     * comerciantul afla ca datele sunt gresite abia la primul colet real.
     *
     * Acum trece doar ce DOVEDESTE ca ne-a recunoscut: „coletul nu exista". Un
     * cod necunoscut ramane rosu, cu mesajul lui GLS cu tot — mai bine o proba
     * prea severa, pe care omul o poate cerceta, decat una linistitoare si falsa.
     */
    if (cauze.length > 0 && cauze.every((c) => CODURI_COLET_NEGASIT.has(c) || c === COD_PREA_DES)) {
      return { ok: true };
    }
    return { ok: false, eroare: (e as Error).message };
  }
}
