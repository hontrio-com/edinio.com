/**
 * Sterge din depozit copiile optimizate ale fisierelor incarcate de cumparatori.
 *
 * ═══ ⚠ CE CURATA, SI DE CE EXISTA ACESTE COPII ═══
 *
 * `/api/img` nu servea doar octetii ceruti: cand primea `w`, SCRIA si o a doua copie, la
 * `_optim/w<W>q<Q>/<cheie>.webp`, cu antetul public implicit al lui `uploadToR2` — un an,
 * `immutable`. Iar `KEY_RE` primea intreg prefixul incarcarilor, fiindca el sta chiar sub
 * `products/`. Deci fiecare fisier de personalizare cerut vreodata prin optimizator a lasat in
 * urma o copie PUBLICA, pe care n-o cunoaste niciun drum de stergere: ea ramanea si dupa ce
 * comanda era stearsa.
 *
 * Usa s-a inchis (vezi `esteIncarcareDeCumparator` din `src/app/api/img/route.ts`, care refuza
 * prefixul INAINTE de orice atingere a depozitului), deci copii NOI nu se mai fac. Scriptul asta
 * strange ce a ramas in urma.
 *
 * ═══ ⚠ CUM SE RULEAZA ═══
 *
 *   node scripts/curata-optim-personalizari.mjs            # numai NUMARA si arata (implicit)
 *   node scripts/curata-optim-personalizari.mjs --sterge    # sterge de-adevaratelea
 *
 * ⚠ CERE CREDENTIALELE DE PRODUCTIE. In `.env.local` din arbore toate cele cinci variabile R2
 * sunt goale, deci fara ele scriptul se opreste cu un mesaj, nu „nu gaseste nimic" — un zero
 * dintr-o galeata la care nici nu te-ai conectat e cel mai convingator raspuns fals cu putinta.
 *
 * ⚠ NU CITESTE `.env.local` SINGUR, dinadins: variabilele se dau la rulare, in shellul
 * proprietarului, si nu raman scrise nicaieri in arbore.
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const STERGE = process.argv.includes("--sterge");

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
const lipsa = Object.entries({ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (lipsa.length) {
  console.error(`Lipsesc credentialele R2: ${lipsa.join(", ")}`);
  console.error("Ruleaza cu ele in mediu; scriptul nu citeste .env.local dinadins.");
  process.exit(2);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

/**
 * ⚠ CE ARE VOIE SA FIE STERS, scris ca o singura regula stransa.
 *
 * Nu „contine `customizations`" si nu `startsWith`: cheia trebuie sa fie EXACT o varianta
 * optimizata a unei incarcari de cumparator. Orice altceva din `_optim/` — variantele pozelor de
 * produs, care sunt legitime si se refac scump — nu se atinge.
 *
 * Forma: `_optim/w<latime>q<calitate>/products/customizations/<uuid magazin>/<fisier>.webp`
 */
const DE_STERS =
  /^_optim\/w\d{1,5}q\d{1,3}\/products\/customizations\/[0-9a-f-]{36}\/[^/]+\.webp$/i;

/**
 * Cate incarcari ORIGINALE exista, si de cand — masuratoarea de care depinde retentia.
 *
 * ⚠ NU STERGE NIMIC, niciodata, nici cu `--sterge`. Scriptul asta are un singur drum de
 * stergere, cel al copiilor din `_optim/`. Aici doar se numara, fiindca inainte de a scrie un
 * cron care sterge fisiere ale unor OAMENI trebuie stiut cate sunt si ce vechime au. Un
 * stergator care n-a vazut niciodata galeata pe care o curata e o promisiune, nu o unealta.
 */
async function masoaraIncarcarile() {
  const PREFIX = "products/customizations/";
  const acum = Date.now();
  const ZI = 24 * 3600 * 1000;
  let cursor;
  let n = 0;
  let octeti = 0;
  const galeti = { "sub 30 de zile": 0, "30 de zile - 6 luni": 0, "peste 6 luni": 0 };
  const peMagazin = new Map();
  let ceaMaiVeche = null;

  do {
    const r = await s3.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: PREFIX,
        ContinuationToken: cursor,
        MaxKeys: 1000,
      }),
    );
    for (const o of r.Contents ?? []) {
      n++;
      octeti += o.Size ?? 0;
      const zile = (acum - new Date(o.LastModified).getTime()) / ZI;
      if (zile < 30) galeti["sub 30 de zile"]++;
      else if (zile < 183) galeti["30 de zile - 6 luni"]++;
      else galeti["peste 6 luni"]++;
      if (!ceaMaiVeche || new Date(o.LastModified) < ceaMaiVeche) ceaMaiVeche = new Date(o.LastModified);
      const mag = o.Key.slice(PREFIX.length).split("/")[0];
      peMagazin.set(mag, (peMagazin.get(mag) ?? 0) + 1);
    }
    cursor = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (cursor);

  console.log(`\n─── Incarcari originale sub ${PREFIX} ───`);
  console.log(`Total: ${n} fisiere, ${(octeti / 1024 / 1024).toFixed(2)} MB`);
  if (!n) return;
  console.log(`Cea mai veche: ${ceaMaiVeche.toISOString().slice(0, 10)}`);
  for (const [eticheta, cate] of Object.entries(galeti)) console.log(`  ${eticheta}: ${cate}`);
  console.log(`Magazine atinse: ${peMagazin.size}`);
  for (const [mag, cate] of [...peMagazin].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${mag}: ${cate}`);
  }
  /*
   * ⚠ CATE SUNT ORFANE nu se poate spune de aici: raspunsul sta in `orders`, nu in depozit.
   * Masurat pe 07.09.2026, din 384 de comenzi ZERO poarta vreo personalizare — deci, la ziua
   * asta, TOATE fisierele de mai sus sunt orfane. Cifra aia se reia inainte de orice stergere.
   */
}

async function main() {
  let cursor;
  let vazute = 0;
  const tinte = [];

  do {
    const r = await s3.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: "_optim/",
        ContinuationToken: cursor,
        MaxKeys: 1000,
      }),
    );
    for (const o of r.Contents ?? []) {
      vazute++;
      if (DE_STERS.test(o.Key)) tinte.push({ cheie: o.Key, octeti: o.Size ?? 0 });
    }
    cursor = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (cursor);

  const octeti = tinte.reduce((s, t) => s + t.octeti, 0);
  console.log(`Obiecte sub _optim/: ${vazute}`);
  console.log(`Copii de personalizari: ${tinte.length} (${(octeti / 1024 / 1024).toFixed(2)} MB)`);
  for (const t of tinte.slice(0, 20)) console.log(`  ${t.cheie}`);
  if (tinte.length > 20) console.log(`  ... si inca ${tinte.length - 20}`);

  await masoaraIncarcarile();

  if (!tinte.length) return;
  if (!STERGE) {
    console.log("\nNimic nu s-a sters. Ruleaza cu --sterge ca sa se stearga.");
    return;
  }

  /* ⚠ Cate 1000, cat primeste `DeleteObjects` intr-o cerere. */
  let sterse = 0;
  for (let i = 0; i < tinte.length; i += 1000) {
    const felie = tinte.slice(i, i + 1000);
    const r = await s3.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: { Objects: felie.map((t) => ({ Key: t.cheie })), Quiet: true },
      }),
    );
    /* ⚠ Raspunsul se CITESTE: `DeleteObjects` intoarce 200 si cu erori pe obiecte individuale. */
    for (const e of r.Errors ?? []) console.error(`  NESTERS ${e.Key}: ${e.Code} ${e.Message}`);
    sterse += felie.length - (r.Errors?.length ?? 0);
  }
  console.log(`\nSterse: ${sterse} din ${tinte.length}`);
  if (sterse !== tinte.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
