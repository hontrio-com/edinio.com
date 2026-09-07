import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
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
