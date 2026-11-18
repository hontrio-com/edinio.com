/*
  ═══════════════════════════════════════════════════════════════════════════════
  RECENZIILE DIN MODULUL FEEDBACK AL THEMARKETER (`GET product_reviews`). Pur.
  ═══════════════════════════════════════════════════════════════════════════════

  Raspunsul e XML (documentatia lor publica, sectiunea 12, si pluginul oficial de WooCommerce care il
  citeste cu `simplexml_load_string`):

      <reviews><review>
        <review_id>123</review_id><review_date>2022-03-01 17:44:32</review_date>
        <review_author>John Doe</review_author><review_email>…</review_email>
        <product_id>1234</product_id><product_sku>ABC123</product_sku>
        <rating>10</rating>   ← nota e din 10, nu din 5 (pluginul o imparte la 2)
        <review_text><![CDATA[…]]></review_text>
        <media_files><media type="image">https://cdn.themarketer.com/…</media></media_files>
      </review></reviews>

  ⚠ `review_email` NU e in documentatia publica, dar pluginul il citeste. Se pastreaza in baza (ca sa
  se poata sterge la anonimizare) si NU se arata niciodata in magazin.

  Fara biblioteca de XML: `fast-xml-parser` e numai in `devDependencies`, iar forma de aici e mica si
  fixa. Cititorul de mai jos e strict: ce nu se potriveste se sare, nu se ghiceste.
*/

export type RecenzieTM = {
  idExtern: string;
  /** Clipa recenziei, ISO. Ora lor e a Romaniei. */
  data: string | null;
  autor: string;
  email: string | null;
  productId: string;
  productSku: string | null;
  /** 0-10, ca la ei. */
  nota: number;
  text: string;
  media: { tip: "image" | "video"; url: string }[];
};

const ENTITATI: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeaza(s: string): string {
  return s
    .replace(/&#(\d{1,7});/g, (_m, n: string) => {
      const c = Number(n);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => {
      const c = parseInt(h, 16);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    })
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, e: string) => ENTITATI[e]);
}

/** Textul dintr-un element: CDATA desfacut, entitatile decodate. */
function textul(interior: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(interior);
  if (cdata) return cdata[1];
  return decodeaza(interior.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function element(bloc: string, nume: string): string | null {
  const m = new RegExp(`<${nume}(?:\\s[^>]*)?>([\\s\\S]*?)</${nume}>`).exec(bloc);
  return m ? textul(m[1]).trim() : null;
}

/** O adresa de imagine sau video pe care o putem arata: numai https. */
function adresaMedia(u: string): string | null {
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" ? x.toString() : null;
  } catch {
    return null;
  }
}

/** „2022-03-01 17:44:32” (ora Romaniei) → ISO. `null` daca nu se poate citi. */
export function dataRecenziei(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (!m) return null;
  const [, an, luna, zi, h, min, sec] = m;
  /* Ora Romaniei → UTC: decalajul se afla din formatarea clipei aproximative. */
  const aprox = Date.UTC(Number(an), Number(luna) - 1, Number(zi), Number(h), Number(min), Number(sec ?? 0));
  if (!Number.isFinite(aprox)) return null;
  const parti = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(aprox)).map((p) => [p.type, p.value]));
  const caLocal = Date.UTC(Number(parti.year), Number(parti.month) - 1, Number(parti.day), Number(parti.hour), Number(parti.minute), Number(parti.second));
  return new Date(aprox - (caLocal - aprox)).toISOString();
}

/** Recenziile din raspuns. Ce nu are id, produs sau nota se sare. */
export function citesteRecenziile(xml: string): RecenzieTM[] {
  const iesire: RecenzieTM[] = [];
  const re = /<review(?:\s[^>]*)?>([\s\S]*?)<\/review>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const bloc = m[1];
    const idExtern = element(bloc, "review_id");
    const productId = element(bloc, "product_id");
    const notaBruta = element(bloc, "rating");
    const nota = Number(notaBruta);
    if (!idExtern || !productId || notaBruta == null || notaBruta === "" || !Number.isFinite(nota)) continue;
    const media: RecenzieTM["media"] = [];
    /* ⚠ `(?=[\s>])`: fara el, `<media` se potrivea si pe `<media_files>` si inghitea PRIMA poza. */
    const reMedia = /<media(?=[\s>])(?:\s+type="(image|video)")?[^>]*>([\s\S]*?)<\/media>/g;
    let mm: RegExpExecArray | null;
    while ((mm = reMedia.exec(bloc))) {
      const url = adresaMedia(textul(mm[2]));
      if (url && media.length < 10) media.push({ tip: mm[1] === "video" ? "video" : "image", url });
    }
    const email = element(bloc, "review_email");
    iesire.push({
      idExtern: idExtern.slice(0, 100),
      data: dataRecenziei(element(bloc, "review_date")),
      autor: (element(bloc, "review_author") ?? "").slice(0, 120),
      email: email ? email.slice(0, 254).toLowerCase() : null,
      productId: productId.slice(0, 100),
      productSku: element(bloc, "product_sku")?.slice(0, 120) ?? null,
      nota: Math.max(0, Math.min(10, Math.round(nota))),
      text: (element(bloc, "review_text") ?? "").slice(0, 5000),
      media,
    });
  }
  return iesire;
}

/** Nota din 10, ca stele din 5, cu o zecimala („4,5”). */
export function stele(nota: number): number {
  return Math.round((Math.max(0, Math.min(10, nota)) / 2) * 10) / 10;
}

/**
 * Prenumele autorului si initiala numelui („Ion P.”): recenzia apare public pe pagina produsului, iar
 * numele intreg al unui cumparator n-are ce cauta acolo.
 */
export function autorPublic(autor: string): string {
  const parti = autor.trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return "Client";
  if (parti.length === 1) return parti[0].slice(0, 40);
  return `${parti[0].slice(0, 40)} ${parti[parti.length - 1].charAt(0).toUpperCase()}.`;
}
