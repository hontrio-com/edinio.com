import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Key extraction recognizes every equivalent origin (raw *.r2.dev + CDN domain),
// not just the configured PUBLIC_URL — see r2-url.ts. Re-exported so existing
// `@/lib/r2` imports keep working.
export { r2KeyFromUrl, isOurR2Url } from "./r2-url";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!; // raw bucket (*.r2.dev) or the CDN domain (https://edinio-cdn.com)

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
  /**
   * ⚠ Implicitul e bun pentru imagini de produs si GRESIT pentru documente.
   *
   * `public, max-age=31536000, immutable` inseamna ca fisierul poate fi tinut un
   * an de orice intermediar si de CDN. Pentru o poza de produs e chiar ce vrem.
   * Pentru o eticheta AWB — care contine numele, adresa si telefonul
   * CUMPARATORULUI — e exact ce se straduieste sa evite ruta care o serveste, cu
   * `Cache-Control: private, no-store`. Cele doua se bateau cap in cap.
   *
   * Apelantii care urca documente cu date personale dau `private, no-store`.
   */
  cacheControl = "public, max-age=31536000, immutable",
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Create a short-lived presigned PUT URL for a direct browser → R2 upload.
 * Used for large files (video) that would otherwise exceed the serverless
 * request-body limit if routed through an API function. Only the ContentType is
 * signed, so the client must send a matching `Content-Type` header (and nothing
 * else) — this keeps the browser PUT simple and CORS-friendly.
 */
export async function createPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 600,
  /** Cand e dat, intra in semnatura: incarcarea reala trebuie sa aiba EXACT
   *  aceasta dimensiune, altfel R2 o refuza. Fara el, limita de dimensiune
   *  verificata pe server era doar o promisiune a clientului. */
  contentLength?: number,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
  return { uploadUrl, publicUrl: `${PUBLIC_URL}/${key}` };
}

/**
 * Ce s-a intamplat la o citire din depozit.
 *
 * ═══ ⚠ „NU EXISTA” SI „N-AM PUTUT CITI” NU SUNT ACELASI LUCRU ═══
 *
 * `getFromR2` intoarce `null` pentru amandoua, fiindca a fost scris pentru optimizatorul de
 * imagini, unde raspunsul e acelasi: se cade pe originalul intreg. Pentru un fisier de tipar al
 * unui cumparator raspunsul NU e acelasi: „negasit” il trimite pe comerciant sa ceara clientului
 * macheta din nou, cand de fapt R2 avea un incident de zece minute sau cineva schimbase
 * `R2_ACCESS_KEY_ID`. Octetii erau acolo tot timpul.
 *
 * Acelasi rationament e scris deja, cu aceleasi cuvinte, la citirea comenzii din
 * `/api/customization-file`: o citire cazuta nu e „n-are dreptul” si nu e „nu exista”.
 */
export type CitireR2 =
  | { fel: "octeti"; octeti: Buffer }
  | { fel: "lipsa" }
  | { fel: "eroare"; motiv: string };

/**
 * Eroarea asta inseamna „obiectul nu e acolo”, nu „n-am putut citi”?
 *
 * ⚠ LISTA E SCURTA DINADINS. `NoSuchBucket`, `InvalidAccessKeyId`, `AccessDenied`, un timeout sau
 * un 500 de la Cloudflare sunt configurari sau caderi — cine le-ar trece drept „lipsa” ar spune
 * exact minciuna pe care tipul asta o repara. Numai obiectul care chiar nu exista (`NoSuchKey`,
 * `NotFound`) e lipsa.
 *
 * ⚠ SI 404 NU E DE AJUNS CA SEMN. `NoSuchBucket` vine tot cu 404: o galeata redenumita sau cu
 * credentiale schimbate ar fi iesit „fisier negasit” pe TOATE fisierele deodata, adica exact cand
 * minciuna costa cel mai mult. De-aia caderile cunoscute se numesc pe nume inainte de a privi
 * codul HTTP.
 */
const CADERI_CU_404 = ["NoSuchBucket", "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"];

export function esteObiectLipsa(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: number } };
  const nume = typeof err.name === "string" ? err.name
    : typeof err.Code === "string" ? err.Code : "";
  if (nume === "NoSuchKey" || nume === "NotFound") return true;
  if (CADERI_CU_404.includes(nume)) return false;
  return err.$metadata?.httpStatusCode === 404;
}

/** Citeste un obiect din R2 si SPUNE care din cele trei lucruri s-a intamplat. */
export async function citesteDinR2(key: string): Promise<CitireR2> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    /* Un raspuns fara corp nu e o lipsa: obiectul a fost gasit si tot n-avem octetii. */
    if (!res.Body) return { fel: "eroare", motiv: "raspuns fara corp" };
    const bytes = await res.Body.transformToByteArray();
    return { fel: "octeti", octeti: Buffer.from(bytes) };
  } catch (e) {
    if (esteObiectLipsa(e)) return { fel: "lipsa" };
    return { fel: "eroare", motiv: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

/**
 * Read an object from R2 as a Buffer; null if it doesn't exist (used by the image optimizer).
 *
 * ⚠ PURTAREA RAMANE EXACT CEA DE DINAINTE — si lipsa, si eroarea ies `null` — fiindca cei cinci
 * apelanti (`api/img` de doua ori, `ecolet/awb`, `gls/awb`, `pallex/document`) se sprijina pe ea:
 * toti au deja o cale de rezerva (originalul, sau reemiterea documentului) si un `null` acolo nu
 * minte pe nimeni. Cine are nevoie de deosebire cheama `citesteDinR2`.
 */
export async function getFromR2(key: string): Promise<Buffer | null> {
  const r = await citesteDinR2(key);
  return r.fel === "octeti" ? r.octeti : null;
}

/**
 * Exista obiectul asta, fara sa-i aducem octetii?
 *
 * ⚠ DE CE NU `getFromR2(...) !== null`. Aia descarca fisierul intreg doar ca sa afle daca e
 * acolo. Pe drumul pentru care s-a scris functia — `/api/img`, care raspunde cu o REDIRECTARE
 * catre varianta gata facuta — octetii nu-i trebuie nimanui: ii ia browserul, direct de la
 * Cloudflare. O varianta de un megaoctet adusa si aruncata la fiecare cerere ar fi transformat
 * chiar economia pe care o cauta ruta intr-o cheltuiala de timp.
 *
 * ⚠ SI RASPUNDE `false` NUMAI LA LIPSA ADEVARATA. `esteObiectLipsa` deosebeste „nu exista" de
 * „nu am voie" / „galeata nu e acolo" — vezi nota de la ea. O credentiala schimbata ar fi iesit
 * ca „nu exista" pe TOATE obiectele deodata, iar apelantul ar fi refacut linistit tot depozitul.
 * Aici, o asemenea cadere ARUNCA, si apelantul hotaraste ce face cu ea.
 */
export async function existaInR2(key: string): Promise<boolean> {
  return existaInGaleata(key, BUCKET);
}

/**
 * Acelasi lucru, dar in galeata pe care o spui.
 *
 * ⚠ EXISTA CA SA POATA FI INTREBATA SI CEA PRIVATA. `existaInR2` cauta in galeata publica; o
 * eticheta de colet nu e acolo si nu trebuie sa fie, iar o cautare in galeata gresita ar fi
 * raspuns linistit „nu exista" pentru fiecare eticheta din depozit.
 */
export async function existaInGaleata(key: string, bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (esteObiectLipsa(e)) return false;
    throw e;
  }
}

export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  );
}

/** Un obiect din depozit, cat foloseste cui il listeaza. */
export interface ObiectListat {
  cheie: string;
  incarcatLa: Date;
  octeti: number;
}

/**
 * Tot ce sta sub un prefix, paginat pana la capat.
 *
 * ⚠ CLIENTUL S3 RAMANE PRIVAT, si de-aia listarea se scrie aici, nu la apelant: el e facut o
 * singura data, din variabilele de mediu, si scos afara ar fi inceput sa fie facut si in alte
 * locuri, cu alte reglaje.
 *
 * ⚠ `maxObiecte` NU E O OPTIMIZARE. Fara el, un prefix crescut peste asteptari ar tine o ruta
 * ocupata pana la timeout, iar apelantul n-ar afla niciodata ca n-a vazut tot. Cu el, se intoarce
 * `trunchiat: true` — o afirmatie pe care apelantul o poate citi si de care poate tine seama.
 */
export async function listeazaPrefix(
  prefix: string,
  maxObiecte: number,
): Promise<{ obiecte: ObiectListat[]; trunchiat: boolean }> {
  const obiecte: ObiectListat[] = [];
  let cursor: string | undefined;

  do {
    const r = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: cursor,
        MaxKeys: 1000,
      }),
    );
    for (const o of r.Contents ?? []) {
      /* Fara cheie sau fara data nu se poate hotari nimic despre el; se sare, nu se ghiceste. */
      if (!o.Key || !o.LastModified) continue;
      obiecte.push({ cheie: o.Key, incarcatLa: new Date(o.LastModified), octeti: o.Size ?? 0 });
    }
    if (obiecte.length >= maxObiecte) return { obiecte, trunchiat: true };
    cursor = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (cursor);

  return { obiecte, trunchiat: false };
}

/**
 * Sterge mai multe obiecte deodata.
 *
 * ⚠ RASPUNSUL SE CITESTE, si asta e tot rostul functiei. `DeleteObjects` intoarce 200 si atunci
 * cand obiecte individuale n-au putut fi sterse — ele stau in `Errors`, nu in codul HTTP. Cine
 * numara felia ca reusita raporteaza o curatenie care nu s-a facut, si aceleasi fisiere ii ies
 * „sterse" la fiecare rulare, la nesfarsit.
 */
export async function stergeMulteDinR2(chei: string[]): Promise<{ sterse: number; esecuri: string[] }> {
  let sterse = 0;
  const esecuri: string[] = [];

  /* Cate 1000, cat primeste `DeleteObjects` intr-o cerere. */
  for (let i = 0; i < chei.length; i += 1000) {
    const felie = chei.slice(i, i + 1000);
    try {
      const r = await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: felie.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      for (const e of r.Errors ?? []) esecuri.push(`${e.Key}: ${e.Code}`);
      sterse += felie.length - (r.Errors?.length ?? 0);
    } catch (e) {
      esecuri.push(`felia care incepe la ${i}: ${(e as Error).message}`);
    }
  }

  return { sterse, esecuri };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GALEATA PRIVATA — fisierele urcate de cumparatori
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Unde stau fisierele urcate din formularul public de personalizare.
 *
 * ═══ ⚠ DE CE O GALEATA SEPARATA, SI NU ALT PREFIX ═══
 *
 * Fisierele astea sunt poza de nunta, poza copilului, macheta de tipar — date ale unor OAMENI care
 * n-au fost intrebati nimic despre stocare. Ele au capatat, pe rand: o cheie cu semnatura HMAC, o
 * ruta de servire care cere sesiune si proprietatea magazinului, antetul `private, no-store`, si
 * refuzul din `/api/img`.
 *
 * ⚠ SI TOTUSI OCTETII STATEAU IN GALEATA PUBLICA. Cine are cheia INTREAGA — iar cheia o primeste
 * chiar clientul care a urcat fisierul — o putea lipi dupa domeniul public si ocolea toate cele
 * patru porti. Comentariul din `fisiere-private.ts` o spunea limpede: neghicibil nu inseamna
 * privat. `Cache-Control: private` nu face o galeata publica sa fie privata.
 *
 * Aici se inchide asta: alta galeata, fara domeniu propriu si fara adresa de dezvoltare, deci fara
 * NICIO cale de acces in afara credentialelor serverului.
 *
 * ⚠ CAND `R2_BUCKET_PRIVAT` NU E CONFIGURATA se foloseste galeata de pana acum, exact ca inainte.
 * Purtarea nu se inrautateste niciodata fata de azi, iar desfasurarea codului nu trebuie sa astepte
 * o variabila — dar cat timp lipseste, aparearea nu exista. De-aia cheia e trecuta si in
 * `CHEI_ASTEPTATE` din `next.config.ts`, care STRIGA in jurnalul de build fara sa opreasca nimic.
 */
const BUCKET_PRIVAT = process.env.R2_BUCKET_PRIVAT?.trim() || "";

/**
 * Unde se SCRIU incarcarile cumparatorilor.
 *
 * ═══ ⚠ NU MAI CADE PE GALEATA PUBLICA — 07.09.2026 ═══
 *
 * Aici era `BUCKET_PRIVAT || BUCKET`, si a fost purtarea corecta cat timp galeata privata nu
 * exista: fara ea, o cadere ar fi oprit vanzarea produselor personalizate pe toata platforma, iar
 * asta era o paguba mai mare decat cea pe care o apara.
 *
 * Acum galeata EXISTA si variabila e obligatorie in productie (vezi `CHEI_OBLIGATORII`). Deci
 * caderea pe cea publica nu mai apara nimic — ar face doar ca o variabila stearsa din greseala sa
 * trimita TACUT pozele de familie ale cumparatorilor inapoi pe un domeniu public. Un capat care
 * refuza e ceva ce se vede si se repara; unul care scrie in alta parte, nu.
 *
 * ⚠ ARUNCA, si e chemata numai pe drumurile de SCRIERE (linkul de incarcare, mutarea, stergerea).
 * Citirea are propria ei cadere inapoi — vezi `citestePrivat`: fisierele urcate inainte de mutare
 * stau in galeata veche, iar cheile lor sunt deja scrise in comenzi.
 */
export function galeataIncarcarilor(): string {
  if (!BUCKET_PRIVAT) {
    throw new Error(
      "[r2] R2_BUCKET_PRIVAT lipseste: incarcarile cumparatorilor nu se scriu in galeata publica.",
    );
  }
  return BUCKET_PRIVAT;
}

/** Chiar exista o galeata privata, sau ne bazam inca pe cea publica? */
export function incarcarileSuntPrivate(): boolean {
  return BUCKET_PRIVAT !== "" && BUCKET_PRIVAT !== BUCKET;
}

/**
 * Scrie octeti in galeata PRIVATA.
 *
 * ═══ ⚠ A FOST SCOASA, SI S-A INTORS — AMANDOUA CU MOTIV ═══
 *
 * Pe 07.09.2026 a fost stearsa fiindca n-o mai chema nimeni: incarcarile cumparatorilor trec de
 * atunci direct in depozit, printr-un link semnat, iar o a doua cale de scriere pe care n-o
 * probeaza nimeni e o datorie, nu o comoditate.
 *
 * Pe 08.09.2026 s-a intors fiindca are un apelant ADEVARAT si probat: eticheta de colet trimisa de
 * Pepita in corpul comenzii. Acolo octetii SUNT deja la noi in memorie — au venit in sarcina utila
 * — deci nu exista link semnat de dat cuiva; singura intrebare e in ce galeata ajung.
 *
 * ⚠ SI DE CE NU `uploadToR2`: aceea scrie in galeata PUBLICA, intoarce adresa publica, si are
 * implicit `public, max-age=31536000, immutable`. Pentru un document cu numele, adresa si
 * telefonul unui cumparator, fiecare dintre cele trei e gresita.
 */
export async function incarcaPrivat(
  key: string, body: Buffer, contentType: string,
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: galeataIncarcarilor(),
    Key: key,
    Body: body,
    ContentType: contentType,
    /* ⚠ Explicit, nu implicit: vezi nota de la `uploadToR2`. */
    CacheControl: "private, no-store",
  }));
}


/**
 * Citeste un fisier de cumparator, cu CADERE INAPOI pe galeata de pana acum.
 *
 * ⚠ CADEREA INAPOI NU E O SLABICIUNE, E MIGRAREA. Fisierele urcate inainte de a exista galeata
 * privata stau in cea veche, iar cheile lor sunt deja scrise in comenzi. Citite doar din cea noua,
 * comerciantul ar fi deschis o comanda de saptamana trecuta si n-ar mai fi gasit macheta dupa care
 * trebuie sa produca marfa.
 *
 * ⚠ SI NU LARGESTE NIMIC: caderea e la CITIRE, pe ruta care cere deja sesiune, proprietatea
 * magazinului si ca fisierul sa fie chiar pe comanda ceruta. Nimeni nu ajunge aici fara ele.
 *
 * ⚠ CAND SE SCOATE: dupa ce cronul de retentie a golit prefixul din galeata veche. Pana atunci,
 * scoasa, ar rupe comenzile vechi.
 */
export async function citestePrivat(key: string): Promise<CitireR2> {
  /*
   * ⚠ CITIREA NU ARUNCA FARA VARIABILA, spre deosebire de scriere. `galeataIncarcarilor` refuza
   * acum sa cada pe galeata publica — dar aia e regula SCRIERII: acolo, o cadere ar trimite tacut
   * poze de familie pe un domeniu public. Aici e invers: fara variabila, singurul loc unde pot sta
   * fisierele e galeata veche, iar o exceptie ar ascunde comerciantului machetele comenzilor lui.
   */
  if (!incarcarileSuntPrivate()) return citesteDinGaleata(BUCKET, key);
  const principala = await citesteDinGaleata(galeataIncarcarilor(), key);
  if (principala.fel !== "lipsa") return principala;
  return citesteDinGaleata(BUCKET, key);
}

async function citesteDinGaleata(bucket: string, key: string): Promise<CitireR2> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return { fel: "eroare", motiv: "raspuns fara corp" };
    const bytes = await res.Body.transformToByteArray();
    return { fel: "octeti", octeti: Buffer.from(bytes) };
  } catch (e) {
    if (esteObiectLipsa(e)) return { fel: "lipsa" };
    return { fel: "eroare", motiv: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

/** Ce sta sub un prefix, in AMANDOUA galetile. Cronul de retentie trebuie sa le curete pe ambele. */
export async function listeazaIncarcari(
  prefix: string,
  maxObiecte: number,
): Promise<{ obiecte: (ObiectListat & { bucket: string })[]; trunchiat: boolean }> {
  const galeti = incarcarileSuntPrivate() ? [galeataIncarcarilor(), BUCKET] : [BUCKET];
  const obiecte: (ObiectListat & { bucket: string })[] = [];
  let trunchiat = false;

  for (const bucket of galeti) {
    let cursor: string | undefined;
    do {
      const r = await s3.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: prefix, ContinuationToken: cursor, MaxKeys: 1000,
      }));
      for (const o of r.Contents ?? []) {
        if (!o.Key || !o.LastModified) continue;
        obiecte.push({ cheie: o.Key, incarcatLa: new Date(o.LastModified), octeti: o.Size ?? 0, bucket });
      }
      if (obiecte.length >= maxObiecte) return { obiecte, trunchiat: true };
      cursor = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (cursor);
  }

  return { obiecte, trunchiat };
}

/**
 * Sterge fisiere de cumparator, fiecare din galeata LUI.
 *
 * ⚠ GALEATA VINE CU OBIECTUL, nu se ghiceste. Aceeasi cheie poate exista in amandoua in timpul
 * migrarii; stearsa din galeata gresita, ar fi iesit „sters" fara sa dispara nimic — si cronul ar
 * fi raportat o curatenie care nu s-a facut, in fiecare zi.
 */
export async function stergeIncarcari(
  tinte: { cheie: string; bucket: string }[],
): Promise<{ sterse: number; esecuri: string[] }> {
  let sterse = 0;
  const esecuri: string[] = [];
  const peGaleata = new Map<string, string[]>();
  for (const t of tinte) peGaleata.set(t.bucket, [...(peGaleata.get(t.bucket) ?? []), t.cheie]);

  for (const [bucket, chei] of peGaleata) {
    for (let i = 0; i < chei.length; i += 1000) {
      const felie = chei.slice(i, i + 1000);
      try {
        const r = await s3.send(new DeleteObjectsCommand({
          Bucket: bucket, Delete: { Objects: felie.map((Key) => ({ Key })), Quiet: true },
        }));
        for (const e of r.Errors ?? []) esecuri.push(`${bucket}/${e.Key}: ${e.Code}`);
        sterse += felie.length - (r.Errors?.length ?? 0);
      } catch (e) {
        esecuri.push(`${bucket}, felia care incepe la ${i}: ${(e as Error).message}`);
      }
    }
  }

  return { sterse, esecuri };
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRANSPORTUL FISIERELOR MARI — direct intre browser si depozit
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ DE CE EXISTA, si de ce nu e o optimizare.

   Vercel refuza cererile SI raspunsurile de peste 4,5 MB, cu 413
   `FUNCTION_PAYLOAD_TOO_LARGE` — inainte ca vreun rand din codul nostru sa ruleze
   (masurat in documentatia lor, verificata pe 07.09.2026). Iar platforma promitea
   10 MB pe imagini si 40 MB pe fisiere de tipar: din 26 de campuri vii, 16 promiteau
   peste 4 MB. O poza de telefon de 6 MB — perfect obisnuita — pica pe un camp
   OBLIGATORIU, si cumparatorul citea „incarcarea a esuat" pentru un fisier despre
   care ecranul tocmai ii spusese ca e bun.

   Deci octetii nu mai trec prin functie deloc: browserul ii pune de-a dreptul in
   galeata privata, printr-un link semnat de noi si valabil cateva minute.

   ⚠ CE NU SE SCHIMBA: nicio verificare nu se pierde. Se MUTA dupa incarcare
   (`finalizeaza`), unde se citesc octetii ADEVARATI din depozit — si daca nu trec,
   obiectul se sterge pe loc si nu devine niciodata o cheie buna. */

/**
 * Link semnat pentru o incarcare directa in galeata INCARCARILOR (cea privata).
 *
 * ⚠ ALTA GALEATA DECAT `createPresignedPutUrl`. Aia scrie in galeata publica, pentru
 * videoclipurile comerciantului; asta scrie unde stau pozele cumparatorilor. Doua functii, ca
 * nimeni sa nu poata trimite din greseala fisierul unui client in galeata publica printr-un
 * argument uitat.
 *
 * ⚠ SI NU INTOARCE NICIO ADRESA PUBLICA, spre deosebire de sora ei: galeata n-are domeniu, iar
 * continutul se serveste doar prin `/api/customization-file`.
 *
 * ⚠ `contentLength` INTRA IN SEMNATURA, si de-aia e obligatoriu aici. Fara el, plafonul de
 * marime ar fi ramas o promisiune a clientului: ar fi cerut un link pentru 2 MB si ar fi urcat
 * 500. Cu el, R2 refuza orice incarcare care n-are EXACT dimensiunea semnata.
 */
export async function linkDeIncarcarePrivata(
  key: string,
  contentType: string,
  contentLength: number,
  expiresIn = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: galeataIncarcarilor(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Link semnat pentru CITIREA unui fisier de cumparator, dat comerciantului dupa ce a trecut de
 * toate portile.
 *
 * ⚠ INLOCUIESTE UN RASPUNS DE 40 MB PRIN FUNCTIE. Ruta citea tot obiectul intr-un `Buffer` si il
 * intorcea ca raspuns — peste 4,5 MB, Vercel il taia. Deci comerciantul nu-si putea descarca
 * tocmai fisierul de tipar dupa care produce marfa.
 *
 * ⚠ SCURT DINADINS (un minut): linkul ocoleste cele patru porti ale rutei, deci nu are voie sa
 * traiasca mai mult decat ii trebuie browserului ca sa inceapa descarcarea.
 *
 * ⚠ NUMELE DE SALVARE se semneaza si el: fara `ResponseContentDisposition`, browserul ar fi
 * salvat fisierul cu numele cheii — 65 de caractere de hexazecimal.
 *
 * ⚠ `inline`, NU `attachment`, si e purtarea de dinainte de mutare. Prima varianta a acestei
 * functii scria `attachment`, ceea ce ar fi schimbat tacut ce se intampla la clic in panou: linkul
 * de sub miniatura deschide fisierul intr-o fila noua, si asa il stiu comerciantii. Cu `attachment`
 * ar fi inceput sa se descarce, fara ca nimeni sa fi cerut schimbarea.
 *
 * ⚠ Miniaturile mergeau si asa (Chrome randeaza `<img>` dupa `Content-Type`, nu dupa dispozitie),
 * deci deosebirea NU s-ar fi vazut la o privire pe ecran — s-ar fi vazut abia la primul clic al
 * unui comerciant care se astepta la altceva.
 */
export async function linkDeCitirePrivata(
  key: string,
  bucket: string,
  numeDeSalvare: string,
  contentType: string,
  expiresIn = 60,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType,
    /* ⚠ Numele se curata: un `"` sau un rand nou in antet ar fi despartit raspunsul in doua. */
    ResponseContentDisposition:
      `inline; filename="${numeDeSalvare.replace(/[^\w.\- ]+/g, "_").slice(0, 120)}"`,
    ResponseCacheControl: "private, no-store",
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/** In care galeata sta cheia — sau `null` daca in niciuna. Descarcarea are nevoie sa stie. */
export async function galeataCheii(key: string): Promise<string | null> {
  for (const bucket of incarcarileSuntPrivate() ? [galeataIncarcarilor(), BUCKET] : [BUCKET]) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return bucket;
    } catch (e) {
      if (!esteObiectLipsa(e)) throw e;
    }
  }
  return null;
}

/** Cat de mare e si ce zice ca e — fara sa aducem octetii. */
export async function masoaraIncarcarea(
  key: string,
): Promise<{ octeti: number; contentType: string } | null> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: galeataIncarcarilor(), Key: key }));
    return { octeti: r.ContentLength ?? 0, contentType: r.ContentType ?? "" };
  } catch (e) {
    if (esteObiectLipsa(e)) return null;
    throw e;
  }
}

/**
 * Primii octeti ai unui obiect, fara sa-l aducem intreg.
 *
 * ⚠ ATAT TREBUIE ca sa se hotarasca ce e fisierul: semnatura de format sta in primii octeti, iar
 * `sharp().metadata()` citeste doar ANTETUL, nu decodeaza imaginea. Adus intreg, un PDF de tipar
 * de 40 MB ar fi intrat in memoria functiei degeaba — si tocmai de asemenea drumuri scapam aici.
 */
export async function inceputulIncarcarii(key: string, octeti: number): Promise<Buffer | null> {
  try {
    const r = await s3.send(new GetObjectCommand({
      Bucket: galeataIncarcarilor(), Key: key, Range: `bytes=0-${Math.max(0, octeti - 1)}`,
    }));
    if (!r.Body) return null;
    return Buffer.from(await r.Body.transformToByteArray());
  } catch (e) {
    if (esteObiectLipsa(e)) return null;
    throw e;
  }
}

/**
 * Muta obiectul de pe cheia provizorie pe cea definitiva, in aceeasi galeata.
 *
 * ⚠ COPIEREA E FACUTA DE DEPOZIT, nu de noi: octetii nu trec prin functie, deci un fisier de 40 MB
 * costa aici cat unul de 40 KB.
 *
 * ⚠ DE CE PRIN DOUA CHEI, si nu direct pe cea buna: cheia definitiva poarta semnatura noastra, iar
 * `esteCheiaNoastra` o accepta la comanda. Daca browserul ar scrie de-a dreptul pe ea, un fisier
 * NEVERIFICAT ar fi avut deja o cheie valabila — clientul ar fi putut sari peste `finalizeaza` si
 * trimite in comanda orice octeti, sub o cheie pe care poarta comenzii o crede a noastra. Asa,
 * cheia buna se naste abia DUPA ce octetii au trecut verificarea.
 */
export async function mutaIncarcarea(deLa: string, la: string, contentType: string): Promise<void> {
  const bucket = galeataIncarcarilor();
  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${encodeURIComponent(deLa).replace(/%2F/g, "/")}`,
    Key: la,
    ContentType: contentType,
    MetadataDirective: "REPLACE",
    CacheControl: "private, no-store",
  }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: deLa }));
}

/** Sterge o incarcare din galeata incarcarilor. Se cheama cand verificarea de dupa incarcare pica. */
export async function stergeIncarcarea(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: galeataIncarcarilor(), Key: key }));
  } catch { /* stergerea unui obiect deja disparut nu e o problema */ }
}

/**
 * Scrie o miniatura langa fisierul cumparatorului, in galeata incarcarilor.
 *
 * ⚠ Aceleasi antete ca originalul: `private, no-store`. E tot poza omului, doar mai mica.
 */
export async function incarcaMiniatura(key: string, buffer: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: galeataIncarcarilor(),
    Key: key,
    Body: buffer,
    ContentType: "image/webp",
    CacheControl: "private, no-store",
  }));
}
