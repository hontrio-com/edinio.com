import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
const PUBLIC_URL = process.env.R2_PUBLIC_URL!; // e.g. https://cdn.edinio.com

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

export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  );
}

/**
 * Extract R2 key from a full public URL.
 * e.g. "https://cdn.edinio.com/products/abc.webp" → "products/abc.webp"
 */
export function r2KeyFromUrl(url: string): string | null {
  if (!url.startsWith(PUBLIC_URL)) return null;
  return url.slice(PUBLIC_URL.length + 1);
}
