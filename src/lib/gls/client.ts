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

/** Formatul de tiparire a etichetei. */
export const TIPURI_IMPRIMANTA = ["A4_2x2", "A4_4x1", "Connect", "Thermo"] as const;
export type TipImprimanta = (typeof TIPURI_IMPRIMANTA)[number];

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
  PrintLabelsErrorList?: {
    ErrorCode?: number;
    ErrorDescription?: string;
    ClientReferenceList?: string[];
  }[];
  ErrorCode?: number;
  ErrorDescription?: string;
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
  GetParcelStatusErrors?: unknown[];
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
      signal: AbortSignal.timeout(ASTEPTARE_MS),
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
    throw eroareRefuz(
      `GLS ${metoda}: ${date.ErrorDescription ?? `eroare ${date.ErrorCode}`}`,
    );
  }

  return date;
}

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
    PrintPosition: config.pozitie_tiparire || 1,
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
 * Starile unui colet.
 *
 * ⚠ Citire pura: nu creeaza si nu schimba nimic la GLS, deci se poate reincerca
 * fara grija. De aia NU trece prin registrul de operatii externe.
 */
export async function stariColet(
  config: GlsConfig,
  numarColet: string | number,
): Promise<StareColet[]> {
  const numar = typeof numarColet === "number" ? numarColet : Number(numarColet);
  if (!Number.isFinite(numar)) throw eroareRefuz(`GLS: numar de colet invalid „${numarColet}"`);

  const r = await apelMyGls<RaspunsStari>(config, "GetParcelStatuses", {
    ParcelNumber: numar,
    ReturnPOD: true,
  });

  if (r.GetParcelStatusErrors?.length) {
    throw eroareRefuz(`GLS stari colet: ${JSON.stringify(r.GetParcelStatusErrors).slice(0, 300)}`);
  }
  return r.ParcelStatusList ?? [];
}

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
    const mesaj = (e as Error).message;
    /* Autentificarea a mers, doar coletul nu exista — exact ce speram. */
    if (/stari colet/i.test(mesaj)) return { ok: true };
    return { ok: false, eroare: mesaj };
  }
}
