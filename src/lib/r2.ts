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
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
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
  expiresIn = 600
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
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
