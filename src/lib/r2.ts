import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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

/** Read an object from R2 as a Buffer; null if it doesn't exist (used by the image optimizer). */
export async function getFromR2(key: string): Promise<Buffer | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  );
}
