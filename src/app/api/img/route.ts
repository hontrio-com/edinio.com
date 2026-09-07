import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { existaInR2, getFromR2, uploadToR2 } from "@/lib/r2";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { MAX_PIXELI } from "@/lib/utils/file-signature";
import { PREFIX_INCARCARI } from "@/lib/customization/adresa";

export const runtime = "nodejs";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

/**
 * Unde trimitem browserul dupa varianta gata facuta.
 *
 * ⚠ CDN-UL INAINTEA GALETII BRUTE, si nu din obisnuinta: domeniul Cloudflare e cel care tine
 * fisierul la margine si care nu taxeaza egress. Galeata bruta (`*.r2.dev`) ramane ca rezerva
 * pentru mediile in care CDN-ul nu e configurat.
 *
 * ⚠ SI FARA NICIUNA DIN ELE se serveste ca pana acum, cu octetii prin noi. Un mediu de proba fara
 * domeniu public trebuie sa arate poze, nu sa redirecteze catre nicaieri.
 */
function adresaPublica(): string {
  return (process.env.NEXT_PUBLIC_CDN_URL || R2_PUBLIC_URL || "").replace(/\/+$/, "");
}

// Only allow our own upload prefixes + image extensions — the route must not be
// usable to resize arbitrary objects.
const KEY_RE = /^(products|gallery|logos|covers|avatars)\/[\w./-]+\.(webp|jpe?g|png|gif|avif)$/i;

/*
 * ⚠ INCARCARILE CUMPARATORILOR NU TREC PE AICI, PE NICIUN DRUM.
 *
 * Fisierele urcate din formularul public de personalizare stau sub `PREFIX_INCARCARI`, adica
 * chiar sub `products/`, deci `KEY_RE` le primea INTREGI. Iar ruta asta n-are sesiune (e
 * scutita dinadins si de poarta MFA, vezi `API_FARA_POARTA` din `lib/auth/poarta-mfa.ts`), nu
 * stie de niciun magazin si de nicio comanda. Cele patru porti ale lui
 * `/api/customization-file` — semnatura cheii, sesiune, proprietatea magazinului, si cheia sa
 * fie chiar pe comanda ceruta — se ocoleau aici cu un singur GET fara cont:
 *
 *   1. cu `w`, se serveau OCTETII pozei, cu `public, max-age=31536000, immutable` — chiar
 *      antetul pe care ruta de incarcare tocmai il schimbase in `private, no-store`, ca poza
 *      de familie a unui cumparator sa nu ramana un an la un intermediar sau in CDN;
 *   2. si, ca efect secundar, se scria o A DOUA copie in depozit, la
 *      `_optim/w<W>q<Q>/<cheie>.webp`, tot cu antetul public implicit al lui `uploadToR2`.
 *      Copia aia nu sta sub prefixul incarcarilor, nu poarta semnatura si n-o cunoaste niciun
 *      drum de stergere: ramanea publica si dupa ce comanda ar fi fost stearsa;
 *   3. si oricand octetii lipseau din depozit, `fallback()` raspundea 302 catre
 *      `${R2_PUBLIC_URL}/<cheie>` — adica ruta noastra dadea inapoi chiar adresa publica pe
 *      care toata piesa exista ca s-o scoata din circulatie.
 *
 * ⚠ FARA `w` NU se ajungea la drumul 3, cum scria aici. Latimea cade pe 16 (vezi nota de la
 * `fallback()`, mai jos), deci se serveau tot octetii — drumul 1, la 16 pixeli. Masurat, cu
 * cheia in depozit si refuzul scos: 200, nu 302.
 *
 * De-aia refuzul se face AICI, inaintea oricarei atingeri a depozitului, si NU prin
 * `fallback()`: `fallback()` este drumul 3.
 *
 * ⚠ SE COMPARA PE SEGMENTE, nu cu `startsWith`. `KEY_RE` e insensibila la litere si `[\w./-]+`
 * primeste si `//`, si `/./` — deci `PRODUCTS/CUSTOMIZATIONS/…`, `products//customizations/…`
 * si `products/./customizations/…` treceau de un `startsWith`, iar de acolo plecau ca
 * `Location` catre un intermediar care aduna segmentele caii inapoi in cheia adevarata.
 *
 * ⚠ SI PANA UNDE TINE TITLUL DE SUS: pana la ruta ASTA. Cu `NEXT_PUBLIC_CDN_URL` pus,
 * `supabase-image-loader.ts` nu mai compune `/api/img?p=…`, ci
 * `${CDN}/cdn-cgi/image/width=…/<cheie>` — Cloudflare taie si tine la margine, si nicio ruta
 * de-a noastra nu mai e pe drum ca sa poata refuza ceva. Azi drumul ala nu e ajungibil pentru
 * incarcarile cumparatorilor: loaderul cere o ADRESA R2 ca `src`, iar campurile de personalizare
 * poarta acum o CHEIE, deci `extractR2Key` da null si `<Image>` lasa `src`-ul neatins — dar asta
 * e o conventie, nu o paza, si nu se probeaza de aici.
 */
const SEGMENTE_INCARCARI = PREFIX_INCARCARI.toLowerCase().split("/").filter(Boolean);

function esteIncarcareDeCumparator(cheie: string): boolean {
  /* Segmentele caii, cum le-ar citi depozitul: fara goluri, fara „.” si fara litere mari. */
  const segmente = cheie.toLowerCase().split("/").filter((s) => s !== "" && s !== ".");
  return segmente.some((_, i) => SEGMENTE_INCARCARI.every((s, j) => segmente[i + j] === s));
}

/**
 * Self-hosted image optimizer. Resizes an R2-hosted image to the requested width
 * (WebP) the first time it's requested, caches the variant back on R2, and serves
 * it with an immutable cache header (so Vercel's edge + the browser cache it). If
 * anything fails, it falls back to the original full-size image, so a product
 * image never breaks.
 */
export async function GET(req: NextRequest) {
  /*
   * ═══ ⚠ PLAFONUL S-A MUTAT UNDE SUNT BANII ═══
   *
   * Cifra de aici era 240 pe minut, si era buna cat timp ruta nu era pe drumul umblat: cu
   * `NEXT_PUBLIC_CDN_URL` pus, loaderul chema `/cdn-cgi/image/`, nu ruta asta.
   *
   * De cand ruta a devenit drumul TUTUROR imaginilor, 240 pe minut taia cumparatori adevarati: o
   * pagina de catalog cere lejer 30 de poze, deci un om care rasfoieste zece pagini atinge
   * plafonul si vede imagini rupte. Iar pe un IP de operator mobil, impartit de mii de abonati,
   * mult mai devreme.
   *
   * ⚠ SI CE COSTA NU E CEREREA, CI RATAREA. O cerere care gaseste varianta e o redirectare de
   * cateva sute de octeti; una care n-o gaseste ruleaza `sharp` si scrie in depozit. De-aia sunt
   * doua plafoane, si al doilea sta jos, pe drumul ratarii:
   *
   *   - AICI, in memorie: taie rafala, larg (2.000/minut), ca sa nu poata cineva tine functia
   *     ocupata. Nu apara banii — se pierde la fiecare desfasurare si se inmulteste cu instantele.
   *   - LA RATARE, in Postgres: acolo se cheltuie, si acolo se numara durabil.
   */
  if (!rateLimit(`img:${clientIp(req)}`, 2000, 60_000)) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const key = sp.get("p") ?? "";

  /*
   * ⚠ Vezi nota de la `esteIncarcareDeCumparator`: refuzul sta inaintea oricarei atingeri a
   * depozitului si nu trece prin `fallback()`. `searchParams` a decodat deja `%2F`, deci si
   * cheia scrisa procentual e citita tot ca o cale. Raspunsul e 404, acelasi pe care il da o
   * cheie inexistenta: ruta n-are voie sa spuna nimanui ca fisierul exista.
   */
  if (esteIncarcareDeCumparator(key)) return new NextResponse("Not found", { status: 404 });

  /*
   * Latimea si calitatea se ROTUNJESC la o lista fixa.
   *
   * Inainte erau doar limitate la interval: 16-2048 x 1-100, adica peste 200.000
   * de combinatii DISTINCTE pentru fiecare imagine. Fiecare combinatie noua
   * inseamna o rulare de `sharp` si un obiect NOU scris permanent in R2, care nu
   * se sterge niciodata. O bucla peste `w` si `q` umplea depozitul platformei si
   * factura, fara sa incalce nicio limita.
   *
   * Lista acopera latimile pe care le cere efectiv interfata; orice alta valoare
   * urca la prima treapta mai mare, deci imaginea ramane cel putin la fel de
   * clara ca cea ceruta.
   */
  const TREPTE_LATIME = [16, 32, 48, 64, 96, 128, 192, 256, 384, 512, 640, 768, 896, 1024, 1280, 1536, 1920, 2048];
  const TREPTE_CALITATE = [50, 65, 75, 85, 95];

  const latimeCeruta = Math.min(2048, Math.max(16, parseInt(sp.get("w") ?? "", 10) || 0));
  const calitateCeruta = Math.min(100, Math.max(1, parseInt(sp.get("q") ?? "", 10) || 75));

  const width = latimeCeruta ? (TREPTE_LATIME.find((t) => t >= latimeCeruta) ?? 2048) : 0;
  const quality = TREPTE_CALITATE.find((t) => t >= calitateCeruta) ?? 95;

  /*
   * ⚠ CHEIA SE VALIDEAZA INAINTE de a se compune adresa de rezerva.
   *
   * Pana acum `originalUrl` se construia din cheia BRUTA, iar `KEY_RE` se verifica dupa —
   * pe ramura de esec se chema chiar `fallback()`, adica redirectarea. Deci ruta asta
   * redirectiona 302 catre ORICE cheie din depozit, nu doar catre prefixele ei:
   * `/api/img?p=facturi-emag/<magazin>/<comanda>-<numar>.pdf` intorcea factura unui
   * cumparator, de pe originea edinio.com, fara sesiune. Depozitul e public oricum, deci
   * nu era o escaladare de drepturi — dar era o redirectare arbitrara servita de noi,
   * dintr-o ruta scutita dinadins de poarta MFA.
   *
   * ⚠ SI CE NU FACE `fallback()`: nu e drumul pentru „vreau imaginea intreaga”. Aici scria ca
   * „o cheie valida fara latime cade in continuare pe imaginea intreaga” — nu e adevarat, si
   * n-a fost niciodata: fara `w`, `parseInt` da NaN, `|| 0` da 0, iar `Math.max(16, 0)` da 16,
   * deci `width` nu poate fi 0 si `!width` nu se aprinde din lipsa de latime. Cine cere
   * `/api/img?p=<cheie>` fara `w` primeste o miniatura de 16 pixeli. Purtarea ramane cum e —
   * niciun apelant din proiect nu cere ruta fara `w` (`supabase-image-loader.ts` il pune
   * mereu) — dar promisiunea pleaca de aici: ea ar fi trimis pe drum gresit exact pe cine
   * repara ruta. `!width` ramane ca paza pentru ziua in care treptele se schimba, nu ca drum
   * umblat azi.
   */
  const cheieValida = !!key && !key.includes("..") && KEY_RE.test(key);
  const originalUrl = cheieValida && R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : null;
  const fallback = () =>
    originalUrl ? NextResponse.redirect(originalUrl, 302) : new NextResponse("Not found", { status: 404 });

  if (!cheieValida || !width) return fallback();

  try {
    const variantKey = `_optim/w${width}q${quality}/${key}.webp`;

    /*
     * ═══ ⚠ RUTA ASTA ARATA DRUMUL, NU MAI CARA OCTETII ═══
     *
     * Pana acum raspundea cu imaginea insasi. Mergea, dar punea Vercel pe drumul FIECARUI octet
     * de poza din platforma, iar Vercel factureaza transferul — pe cand depozitul, servit prin
     * domeniul lui Cloudflare, are egress ZERO.
     *
     * Deci acum: ne asiguram ca varianta EXISTA, si trimitem browserul direct la ea. Octetii nu
     * mai trec pe la noi niciodata. Ce ramane de partea noastra e o redirectare de cateva sute de
     * octeti, marcata `immutable` — deci o tine si marginea Vercel, si browserul, si functia nu se
     * mai trezeste a doua oara pentru aceeasi adresa.
     *
     * ⚠ SI DE-AIA NU SE MAI PREGENEREAZA NIMIC. Varianta se face la prima cerere si ramane pe
     * veci; se nasc doar latimile pe care le cere cineva cu adevarat. Alternativa — sa le facem pe
     * toate dinainte — insemna 25.227 de imagini × 8 latimi ≈ 200.000 de obiecte si vreo 6 GB din
     * cele 10 GB gratuite, ca sa acopere si latimi pe care nu le cere nimeni. Mai rau: o varianta
     * lipsa ar fi fost o POZA RUPTA, iar imaginile intra in depozit pe patru drumuri. Asa, ruta se
     * vindeca singura si nu poate lipsi nimic.
     *
     * ⚠ EXISTENTA SE VERIFICA CU `existaInR2`, nu aducand fisierul: octetii nu-i trebuie nimanui
     * aici, iar o varianta de un megaoctet adusa si aruncata la fiecare cerere ar fi mancat chiar
     * castigul.
     */
    if (!(await existaInR2(variantKey))) {
      /*
       * ⚠ AL DOILEA PLAFON, CHIAR INAINTE DE CHELTUIALA.
       *
       * Aici se ruleaza `sharp` si se scrie un obiect NOU, permanent, in depozit platit — si
       * capatul e public si neautentificat. Latimile si calitatile sunt rotunjite la 18 × 5
       * trepte, deci un singur atacator nu poate naste combinatii la nesfarsit; dar poate umbla
       * peste cheile REALE ale catalogului si sili platforma sa produca zeci de mii de variante
       * pe care nu le cere niciun cumparator.
       *
       * ⚠ CONTORUL DIN MEMORIE NU APARA ASTA: se pierde la fiecare desfasurare si se inmulteste
       * cu instantele calde. Regula casei o spune pe fata in `limita-durabila.ts` — orice actiune
       * care costa bani trece pe la contorul din Postgres.
       *
       * ⚠ SI STA PE DRUMUL RATARII, nu la intrare: cererile care gasesc varianta — adica aproape
       * toate, dupa primele zile — nu ating baza deloc. Plafonul nu costa nimic tocmai pe drumul
       * cel mai umblat.
       *
       * ⚠ CADE DESCHIS. Daca baza clipeste, imaginea se face. Vezi `consumaLimita`: un limitator
       * n-are voie sa devina el insusi caderea care goleste vitrinele.
       */
      const ip = clientIp(req);
      if (!(await consumaLimita(`img-variante:ip:${ip}`, 600, 3600)).permis) {
        return fallback();
      }

      const original = await getFromR2(key);
      if (!original) return fallback();
      /*
       * ⚠ PLAFON DE PIXELI, nu doar de octeti. Vezi `MAX_PIXELI`: un PNG interlazat de sub un
       * megaoctet se desface in peste un gigaoctet de memorie, iar capatul asta e public si scutit
       * de poarta MFA. Fara randul asta, o singura cerere omoara functia.
       */
      const out = await sharp(original, { limitInputPixels: MAX_PIXELI })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();

      /*
       * ⚠ AICI SCRIEREA NU MAI E „best-effort", si asta e schimbarea care conteaza.
       *
       * Cat timp raspunsul purta octetii, o scriere esuata insemna doar ca se reface data
       * viitoare. Acum adresa catre care trimitem TREBUIE sa existe, altfel browserul primeste
       * 404 — adica o poza rupta. Deci daca scrierea cade, se cade inapoi pe servirea octetilor,
       * ca pana acum: mai scump, dar intreg.
       */
      try {
        await uploadToR2(out, variantKey, "image/webp");
      } catch {
        return new NextResponse(new Uint8Array(out), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    const gazda = adresaPublica();
    /* Fara domeniu public configurat n-avem unde trimite: se serveste ca pana acum. */
    if (!gazda) {
      const out = await getFromR2(variantKey);
      if (!out) return fallback();
      return new NextResponse(new Uint8Array(out), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: `${gazda}/${variantKey}`,
        /*
         * ⚠ CHIAR REDIRECTAREA SE TINE IN CACHE. Fara antetul asta, functia s-ar trezi la fiecare
         * cerere de poza din platforma ca sa raspunda de fiecare data acelasi lucru — adica exact
         * costul pe care mutarea il inlatura, doar ca mutat din transfer in invocari.
         */
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return fallback();
  }
}
