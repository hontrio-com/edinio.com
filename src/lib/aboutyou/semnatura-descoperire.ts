/**
 * Ce fel de semnătură pune About You pe webhook-uri.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ DE CE EXISTĂ FIȘIERUL ĂSTA (27.08.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `verifyAboutYouSignature` încearcă HMAC-SHA256 peste corpul brut, în hex, pe patru antete
 * posibile. Nimic din asta nu e confirmat: documentația publică spune că la abonare primești un
 * `client_secret`, dar nu descrie antetul, algoritmul, codificarea sau ce anume se semnează.
 * Comentariul din `webhooks.ts` o spune pe față — „SEMNATURA NU E CONFIRMATA" — iar de-aia există
 * a doua încuietoare, tokenul din URL.
 *
 * ⚠ ÎNTREBAREA SE POATE RĂSPUNDE DINTR-O SINGURĂ LIVRARE ADEVĂRATĂ, iar ruta o arunca. Antetele
 * unei cereri primite conțin exact răspunsul; noi le citeam doar pe cele patru ghicite și, când
 * niciunul nu se potrivea, mergeam mai departe pe token fără să ne uităm ce era acolo.
 *
 * ⚠ CE FACE: la prima livrare care trece de token dar NU trece de verificarea semnăturii, se
 * încearcă toate combinațiile plauzibile și se scrie CARE s-a potrivit. Atât. Din clipa aia
 * schema nu mai e o presupunere, iar `verifyAboutYouSignature` se poate strânge la ea.
 *
 * ⚠ NU SE SCRIE NICIODATĂ SECRETUL, și nici valoarea întreagă a antetului. Se scriu: numele
 * antetului, lungimea valorii, alfabetul ei (hexa / base64 / altceva), și numele combinației care
 * s-a potrivit. Destul ca să știm ce să implementăm, nimic din ce ar folosi cuiva care citește
 * jurnalul.
 *
 * ⚠ SE SCRIE O SINGURĂ DATĂ pe magazin. Un webhook care vine des ar umple jurnalul cu același
 * lucru, iar o alarmă care se repetă încetează să fie citită.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Antetele pe care le-am văzut vreodată folosite de cineva pentru semnături de webhook. */
const ANTETE_CANDIDATE = [
  "x-signature", "x-aboutyou-signature", "x-scayle-signature", "signature",
  "x-hub-signature-256", "x-webhook-signature", "x-signature-256", "x-hmac-sha256",
];

/** Antetele care poartă de obicei marca de timp, când semnătura o cuprinde. */
const ANTETE_TIMP = ["x-timestamp", "x-request-timestamp", "x-webhook-timestamp", "timestamp"];

/**
 * Cum arată valoarea, fără să spunem care e.
 *
 * ⚠ Alfabetul e cel mai bun indiciu despre codificare: 64 de caractere hexa înseamnă SHA-256 în
 * hex, 44 cu `=` la coadă înseamnă base64.
 */
export function formaValorii(v: string): string {
  const t = v.trim();
  const fara = t.replace(/^sha256=/i, "");
  const alfabet = /^[0-9a-f]+$/i.test(fara) ? "hexa"
    : /^[A-Za-z0-9+/]+=*$/.test(fara) ? "base64"
      : "altceva";
  return `${alfabet}:${fara.length}${t !== fara ? ":cu-prefix-sha256" : ""}`;
}

function egal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  try { return timingSafeEqual(x, y); } catch { return false; }
}

/**
 * Toate felurile plauzibile de a construi semnătura, cu nume.
 *
 * ⚠ Numele e ce ne interesează: cu el, `verifyAboutYouSignature` se poate reduce la UNA singură,
 * iar restul dispar. Până atunci le încercăm pe toate — dar numai ca să AFLĂM, nu ca să acceptăm:
 * hotărârea de a lăsa evenimentul să treacă rămâne a tokenului.
 */
function candidati(secret: string, corp: string, timp: string | null): { nume: string; valoare: string }[] {
  const bucati: { nume: string; date: string }[] = [
    { nume: "corp", date: corp },
    ...(timp ? [
      { nume: `${timp}.corp`, date: `${timp}.${corp}` },
      { nume: `${timp}corp`, date: `${timp}${corp}` },
    ] : []),
  ];
  const out: { nume: string; valoare: string }[] = [];
  for (const b of bucati) {
    const h = createHmac("sha256", secret).update(b.date);
    const hex = h.digest("hex");
    const b64 = createHmac("sha256", secret).update(b.date).digest("base64");
    out.push(
      { nume: `hmac-sha256(${b.nume})/hex`, valoare: hex },
      { nume: `hmac-sha256(${b.nume})/hex+prefix`, valoare: `sha256=${hex}` },
      { nume: `hmac-sha256(${b.nume})/base64`, valoare: b64 },
      { nume: `hmac-sha256(${b.nume})/base64+prefix`, valoare: `sha256=${b64}` },
    );
  }
  return out;
}

export interface ConstatareSemnatura {
  /** Antetele candidate care CHIAR au venit, cu forma valorii lor. */
  antete: { nume: string; forma: string }[];
  /** Toate antetele primite, doar ca nume: poate schema folosește unul la care nu m-am gândit. */
  toateAnteteleNume: string[];
  /** Numele combinației care s-a potrivit, dacă vreuna s-a potrivit. */
  potrivire: string | null;
  /** Pe ce antet s-a potrivit. */
  potrivirePeAntet: string | null;
}

/**
 * Ce se poate afla despre semnătură dintr-o livrare adevărată.
 *
 * ⚠ NU HOTĂRĂȘTE NIMIC. Întoarce o constatare; cine o cheamă o scrie și merge mai departe. Un
 * instrument de măsură care schimbă și rezultatul n-ar fi un instrument de măsură.
 */
export function cercetareSemnatura(
  secret: string | undefined | null, headers: Headers, rawBody: string,
): ConstatareSemnatura {
  const toate: string[] = [];
  headers.forEach((_v, k) => toate.push(k.toLowerCase()));

  const antete = ANTETE_CANDIDATE
    .map((n) => ({ nume: n, v: headers.get(n) }))
    .filter((x): x is { nume: string; v: string } => !!x.v)
    .map((x) => ({ nume: x.nume, forma: formaValorii(x.v) }));

  const rezultat: ConstatareSemnatura = {
    antete, toateAnteteleNume: toate.sort(), potrivire: null, potrivirePeAntet: null,
  };
  if (!secret) return rezultat;

  const timp = ANTETE_TIMP.map((n) => headers.get(n)).find((v) => !!v) ?? null;

  /*
   * ⚠ SE ÎNCEARCĂ PE TOATE ANTETELE PRIMITE, nu doar pe cele candidate: dacă schema lor folosește
   * un nume la care nu m-am gândit, tocmai ăla e răspunsul căutat, și l-am rata exact pe el.
   */
  for (const nume of toate) {
    const v = headers.get(nume);
    if (!v || v.length < 16) continue;
    for (const c of candidati(secret, rawBody, timp)) {
      if (egal(v.trim(), c.valoare)) {
        rezultat.potrivire = c.nume;
        rezultat.potrivirePeAntet = nume;
        return rezultat;
      }
    }
  }
  return rezultat;
}
