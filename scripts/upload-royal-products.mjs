import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

const BUSINESS_ID = "adc4c2b6-9c82-4815-93ea-7891419a7117";
const IMAGES_DIR = "C:/Users/iorda/Desktop/Produse Royal Boutique/Compleuri Disney";

const products = [
  { file: "P1.jpeg", slug: "compleu-mickey-mouse-verde" },
  { file: "P2.jpeg", slug: "compleu-spider-man-rosu" },
  { file: "P3.jpeg", slug: "compleu-spider-man-albastru" },
  { file: "P4.jpeg", slug: "compleu-batman-albastru" },
  { file: "P5.jpeg", slug: "compleu-sonic-rosu" },
  { file: "P6.jpeg", slug: "compleu-spider-man-rosu-masca" },
  { file: "P7.jpeg", slug: "compleu-sonic-verde" },
  { file: "P8.jpeg", slug: "compleu-sonic-verde-sapca" },
  { file: "P9.jpeg", slug: "compleu-paw-patrol-albastru" },
  { file: "P10.jpeg", slug: "compleu-batman-albastru-royal" },
  { file: "P11.jpeg", slug: "compleu-mickey-mouse-gri" },
  { file: "P12.jpeg", slug: "compleu-sonic-bleu" },
  { file: "P13.jpeg", slug: "compleu-mickey-mouse-alb-rosu" },
  { file: "P14.jpeg", slug: "compleu-sonic-bleu-baiat" },
  { file: "P15.jpeg", slug: "compleu-spider-man-albastru-royal" },
];

async function main() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL } = process.env;

  console.error("R2_ACCOUNT_ID:", R2_ACCOUNT_ID ? "SET" : "MISSING");
  console.error("R2_BUCKET_NAME:", R2_BUCKET_NAME || "MISSING");
  console.error("R2_PUBLIC_URL:", R2_PUBLIC_URL || "MISSING");

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("R2 env vars not set!");
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });

  const results = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const filePath = `${IMAGES_DIR}/${p.file}`;
    const r2Key = `products/${BUSINESS_ID}/${Date.now()}-${p.slug}.jpeg`;

    try {
      console.error(`[${i + 1}/15] ${p.file}...`);
      const buffer = readFileSync(filePath);
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: buffer,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      const url = `${R2_PUBLIC_URL}/${r2Key}`;
      results.push({ slug: p.slug, url });
      console.error("  OK");
    } catch (err) {
      console.error(`  FAIL: ${err.message}`);
    }
  }

  console.log(JSON.stringify(results));
}

main();
