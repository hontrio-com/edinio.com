import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PE SUPRAFETELE EDINIO, NIMIC NU VORBESTE DIRECT CU FURNIZORII
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE INSUSIRE APARA. Poarta de consimtamant sta in magistrala: `areVoie` se
  intreaba la FIECARE eveniment, si de aceea o retragere se aplica pe loc, fara
  reincarcarea paginii. Insusirea asta tine doar cat timp toate masuratorile trec
  pe acolo. O singura chemare directa de `gtag`, `fbq` sau `ttq` intr-o componenta
  ar ocoli poarta — si n-ar cadea nimic, si n-ar arata nimic.

  ⚠ DE CE E O PROBA SI NU O REGULA SCRISA. Un audit a cerut o dovada ca dupa
  retragere nu mai pleaca nimic. Partea de furnizor se masoara in browser (facut:
  zero cereri, cu SDK-urile inca in pagina). Partea NOASTRA e o insusire a
  codului, si aia se poate pazi aici, pentru totdeauna.

  ⚠ GRANITA, si de ce nu e tot repo-ul. Magazinele clientilor au sistemul LOR de
  pixeli, configurat de ei — `src/components/public/` si `src/lib/marketing.ts`.
  Acela nu trece si nu trebuie sa treaca prin consimtamantul Edinio: e alt site,
  alt operator, alta hotarare. Proba se opreste la suprafetele noastre.
*/

const SUPRAFETELE_NOASTRE = [
  "src/components/edinio-marketing",
  "src/lib/edinio-marketing",
  "src/app/(website)",
  "src/app/(ajutor)",
  "src/app/(auth)",
  "src/app/(onboarding)",
  "src/app/(dashboard)",
  "src/app/(admin)",
];

/**
 * Fisierele care AU VOIE sa atinga furnizorii, fiecare cu motivul lui.
 *
 * ⚠ LISTA E SCURTA DINADINS. Ce se adauga aici trebuie sa vina cu un motiv, iar
 * motivul trebuie sa fie „asta ESTE poarta", nu „aici era mai comod".
 */
const AU_VOIE: Record<string, string> = {
  "src/lib/edinio-marketing/corp-gtag.ts": "temeiul comun: el DEFINESTE gtag si declara consimtamantul",
  "src/lib/edinio-marketing/consimtamant-browser.ts": "spune furnizorilor sa REVOCE — singura chemare care stinge, nu porneste",
  "src/lib/edinio-marketing/adaptor-ga4.ts": "adaptor: chemat NUMAI de magistrala, dupa poarta",
  "src/lib/edinio-marketing/adaptor-google-ads.ts": "adaptor: chemat NUMAI de magistrala, dupa poarta",
  "src/lib/edinio-marketing/adaptor-meta.ts": "adaptor: chemat NUMAI de magistrala, dupa poarta",
  "src/lib/edinio-marketing/adaptor-tiktok.ts": "adaptor: chemat NUMAI de magistrala, dupa poarta",
  "src/components/edinio-marketing/EtichetaGa4.tsx": "scriptul de pornire: `config` pentru propria proprietate",
  "src/components/edinio-marketing/EtichetaGoogleAds.tsx": "scriptul de pornire: `config` pentru contul de reclame",
  "src/components/edinio-marketing/EdinioMetaPixel.tsx": "scriptul de pornire al pixelului Meta",
  "src/components/edinio-marketing/EdinioTikTokPixel.tsx": "scriptul de pornire al pixelului TikTok",
};

/** `gtag(`, `fbq(`, `ttq.track(` si rudele lor. */
const CHEMARI = [/\bgtag\s*\(/, /\bfbq\s*\(/, /\bttq\s*\./];

function fisiere(dir: string): string[] {
  let iesire: string[] = [];
  let intrari;
  try { intrari = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const it of intrari) {
    const p = join(dir, it.name);
    if (it.isDirectory()) { iesire = iesire.concat(fisiere(p)); continue; }
    if (/\.tsx?$/.test(it.name) && !/\.test\.tsx?$/.test(it.name)) iesire.push(p);
  }
  return iesire;
}

/** Sursa fara comentarii: altfel o nota care POMENESTE `gtag(` ar da alarma falsa. */
function faraComentarii(s: string): string {
  return s
    .split("/*").map((b, i) => (i === 0 ? b : b.slice(b.indexOf("*/") + 2))).join("")
    .split(String.fromCharCode(10)).map((r) => {
      const i = r.indexOf("//");
      return i >= 0 && !r.slice(0, i).includes("http") ? r.slice(0, i) : r;
    }).join(String.fromCharCode(10));
}

test("⚠ nicio chemare directa catre furnizori in afara portii", () => {
  const vinovate: string[] = [];
  let cercetate = 0;

  for (const dosar of SUPRAFETELE_NOASTRE) {
    for (const f of fisiere(join(process.cwd(), dosar))) {
      const relativ = f.replace(process.cwd(), "").split(String.fromCharCode(92)).join("/").replace(/^\//, "");
      cercetate++;
      if (AU_VOIE[relativ]) continue;
      const cod = faraComentarii(readFileSync(f, "utf8"));
      if (CHEMARI.some((c) => c.test(cod))) vinovate.push(relativ);
    }
  }

  assert.ok(cercetate > 60, `s-au cercetat doar ${cercetate} fisiere — cautarea s-a stricat?`);
  assert.deepEqual(
    vinovate, [],
    "vorbesc direct cu furnizorii, deci ocolesc poarta de consimtamant: " + vinovate.join(", "),
  );
});

test("⚠ si lista celor cu voie nu poate creste in tacere", () => {
  /*
    ⚠ CE APARA. `AU_VOIE` e o portita. Prima cale a cuiva care vrea sa faca proba
    de mai sus sa taca e sa-si adauge fisierul aici. Deci: fiecare intrare trebuie
    sa existe chiar, si sa aiba un motiv scris.
  */
  for (const [f, motiv] of Object.entries(AU_VOIE)) {
    assert.doesNotThrow(() => readFileSync(join(process.cwd(), f), "utf8"),
      `"${f}" e pe lista celor cu voie, dar nu mai exista`);
    assert.ok(motiv.length > 25, `"${f}" e pe lista fara un motiv scris`);
  }
  assert.ok(Object.keys(AU_VOIE).length <= 12,
    `lista celor cu voie a ajuns la ${Object.keys(AU_VOIE).length} fisiere — poarta se subtiaza`);
});
