import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { linkDeIncarcarePrivata } from "@/lib/r2";
import { cheieProvizorie } from "@/lib/customization/fisiere-private";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { verificaPermisul } from "@/lib/customization/permis-incarcare";

/*
 * ═══ ⚠ CAPATUL ASTA NU MAI PRIMESTE OCTETI ═══
 *
 * Pana pe 07.09.2026 fisierul trecea prin functie: `formData()`, `sharp`, apoi scrierea in depozit.
 * Nu putea sa mearga, si nu din vina codului: Vercel refuza cererile SI raspunsurile de peste
 * 4,5 MB, cu 413 `FUNCTION_PAYLOAD_TOO_LARGE`, INAINTE ca vreun rand de-al nostru sa ruleze.
 *
 * Iar platforma promitea 10 MB pe imagini si 40 MB pe fisiere de tipar. Masurat in productie in
 * ziua reparatiei: din 26 de campuri de incarcare vii, 16 promiteau peste 4 MB. O poza de telefon
 * de 6 MB — perfect obisnuita — pica pe un camp OBLIGATORIU, iar cumparatorul citea „incarcarea a
 * esuat" pentru un fisier despre care ecranul tocmai ii spusese ca e bun. Comanda pierduta, si
 * niciun semn la comerciant.
 *
 * ═══ ⚠ CUM MERGE ACUM: DOI PASI ═══
 *
 * 1. AICI se cere voie. Se verifica permisul, marimea DECLARATA si plafoanele, si se intoarce un
 *    link semnat, valabil cinci minute, catre o cheie PROVIZORIE.
 * 2. Browserul pune octetii DE-A DREPTUL in galeata privata, prin linkul ala.
 * 3. `finalizeaza` citeste octetii ADEVARATI din depozit, ii verifica, si abia atunci muta
 *    obiectul pe cheia definitiva — cea pe care poarta comenzii o accepta.
 *
 * ⚠ NICIO VERIFICARE NU S-A PIERDUT, s-au mutat toate dupa incarcare, unde se uita la octetii
 * reali in loc de cei promisi. Vezi `finalizeaza/route.ts`.
 *
 * ⚠ SI MARIMEA NU E PE CUVANTUL CLIENTULUI: `contentLength` intra in semnatura linkului, deci R2
 * refuza orice incarcare care n-are EXACT dimensiunea pentru care s-a dat voie. Cine cere un link
 * pentru 2 MB nu poate urca 500.
 */
export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const TIPURI_DOCUMENT = [...ALLOWED_TYPES, "application/pdf"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Terminatia pusa pe cheia PROVIZORIE.
 *
 * ⚠ E doar un loc de pastrare, nu o hotarare: cea definitiva se ia din OCTETI, la finalizare. Aici
 * se margineste doar ca sa nu ajunga in cheie un sir oarecare din numele fisierului clientului.
 */
function terminatiaDeclarata(tip: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/heic": "heic", "image/heif": "heic", "application/pdf": "pdf" } as Record<string, string>)[tip] ?? "bin";
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!rateLimit(`upload-customization:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Prea multe incarcari. Incearca din nou in scurt timp." }, { status: 429 });
  }

  /* ⚠ JSON, nu `formData`: nu mai vine niciun fisier pe aici. */
  let corp: { permis?: unknown; camp?: unknown; tip?: unknown; octeti?: unknown };
  try {
    corp = await request.json();
  } catch {
    return NextResponse.json({ error: "Cerere invalida." }, { status: 400 });
  }

  const permis = typeof corp.permis === "string" ? corp.permis : null;
  const campId = typeof corp.camp === "string" ? corp.camp : "";
  const tip = typeof corp.tip === "string" ? corp.tip.toLowerCase().trim() : "";
  const octeti = Number(corp.octeti);

  const verdict = verificaPermisul(permis, campId);
  if (!verdict.ok) {
    if (verdict.motiv === "expirat") {
      return NextResponse.json(
        { error: "Pagina e deschisa de prea mult timp. Reincarc-o si incearca din nou." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Incarcare nepermisa." }, { status: 403 });
  }
  const businessId = verdict.businessId;
  const cereDocumente = verdict.document;

  if (!UUID_RE.test(businessId)) {
    return NextResponse.json({ error: "business_id invalid." }, { status: 400 });
  }

  /*
   * ⚠ TIPUL DECLARAT E O PRE-FILTRARE, NU O POARTA — si scrie aici ca sa nu creada nimeni altceva.
   * Adevarul il dau OCTETII, la finalizare. Aici se refuza doar ce nici macar nu se pretinde a fi
   * bun, ca sa nu se dea un link degeaba.
   */
  const permise = cereDocumente ? TIPURI_DOCUMENT : ALLOWED_TYPES;
  if (!permise.includes(tip)) {
    return NextResponse.json(
      { error: cereDocumente ? "Accepta imagini si PDF." : "Accepta doar imagini." },
      { status: 400 },
    );
  }

  /*
   * ═══ ⚠ PLAFONUL VINE DIN PERMIS, NU DIN CONSTANTELE GLOBALE ═══
   *
   * Comerciantul poate pune pe camp „cel mult 2 MB". Pana acum regula aia se respecta numai in
   * browser: serverul stia doar 10 MB la imagini si 40 la documente, deci cine trimitea cererea de
   * mana cerea link pentru 8 MB pe campul de 2 si il primea. Nu falsifica niciun pret, dar limita
   * pusa de magazin nu era o limita, era o sugestie.
   *
   * ⚠ SI VINE SEMNATA. Ceruta in corpul cererii, limita ar fi fost aleasa chiar de cel pe care il
   * margineste. `maxOcteti` e citit din permisul emis de noi, cand s-a randat pagina produsului, si
   * e deja impletit cu plafonul global, deci nu-l poate ridica.
   *
   * ⚠ SI E IMPORTANT SA CADA AICI, nu doar la finalizare: marimea intra in SEMNATURA linkului, deci
   * un link dat pentru 8 MB e un link cu care se pot chiar scrie 8 MB in depozitul platit. Oprit
   * abia la finalizare, fisierul ar fi fost deja urcat si ar fi trebuit sters.
   */
  const plafon = verdict.maxOcteti;
  if (!Number.isFinite(octeti) || octeti <= 0 || octeti > plafon) {
    return NextResponse.json(
      { error: `Fisierul depaseste limita de ${Math.round(plafon / 1024 / 1024)}MB.` },
      { status: 400 },
    );
  }

  /*
   * ═══ ⚠ PLAFOANELE DURABILE, NEATINSE DE MUTARE ═══
   *
   * `rateLimit` de sus sta in memoria procesului si se pierde la fiecare desfasurare. Contorul din
   * Postgres e cel care tine — vezi `limita-durabila.ts`: obligatoriu la „orice actiune care costa
   * bani", iar asta scrie in depozitul platit.
   *
   * ⚠ SE CONSUMA LA DAREA LINKULUI, pe marimea DECLARATA — nu la finalizare. Cine cere o mie de
   * linkuri de 40 MB si nu urca niciodata a consumat deja cota magazinului; altfel plafonul ar fi
   * fost ocolit chiar de cei impotriva carora exista. Iar cine declara mai putin decat urca e
   * refuzat de R2, fiindca marimea e semnata in link.
   *
   * ⚠ 80/ora pe IP: un cumparator adevarat completeaza formularul o data sau de doua ori. Cifra
   * lasa loc si reincercarilor, si mai multor cumparatori in spatele aceleiasi iesiri NAT
   * (operatorii de mobil pun mii de abonati pe un IP) — o limita stransa ar fi blocat oameni
   * nevinovati la un camp OBLIGATORIU.
   *
   * ⚠ 2 GB si 400 de fisiere pe ora pe MAGAZIN: cheia care ramane in picioare cand abuzatorul isi
   * schimba IP-ul, si el si-l schimba. Cea in octeti exista fiindca ce se plateste nu e numarul de
   * cereri, ci ce se scrie in depozit — 400 x 40 MB ar fi insemnat ~16 GB pe ora.
   *
   * ⚠ FARA BLOCARE PROGRESIVA: cheia poate fi un IP impartit de un oras intreg, iar o blocare de-o
   * ora peste el ar tine departe cumparatori care n-au facut nimic.
   *
   * ⚠ CADE DESCHIS la eroare de baza — limitatorul nu are voie sa devina el caderea care opreste
   * vanzarile.
   */
  if (!(await consumaLimita(`upload-personalizare:ip:${ip}`, 80, 3600)).permis) {
    return NextResponse.json(
      { error: "Prea multe incarcari de pe aceasta conexiune. Incearca din nou peste o ora." },
      { status: 429 },
    );
  }
  const megaocteti = Math.max(1, Math.ceil(octeti / (1024 * 1024)));
  if (!(await consumaLimita(`upload-personalizare:mb:${businessId}`, 2048, 3600, 0, megaocteti)).permis) {
    return NextResponse.json(
      { error: "Magazinul a primit prea multe fisiere in ultima ora. Incearca din nou mai tarziu." },
      { status: 429 },
    );
  }
  if (!(await consumaLimita(`upload-personalizare:mag:${businessId}`, 400, 3600)).permis) {
    return NextResponse.json(
      { error: "Magazinul a primit prea multe fisiere in ultima ora. Incearca din nou mai tarziu." },
      { status: 429 },
    );
  }

  /*
   * ⚠ NUMELE E `randomUUID`, nu `Date.now()`-`Math.random()`: `Math.random()` in V8 e xorshift128+,
   * nu criptografic, deci cine urca el insusi cateva fisiere isi vede sufixele in raspuns si poate
   * deduce starea generatorului — adica numele urmatoarelor incarcari facute de pe aceeasi instanta.
   */
  const referinta = cheieProvizorie(businessId, randomUUID(), terminatiaDeclarata(tip));

  try {
    const incarcare = await linkDeIncarcarePrivata(referinta, tip, octeti);
    /*
     * ⚠ SE INTOARCE CHEIA PROVIZORIE, care NU e o legitimatie: `esteCheiaNoastra` o refuza, deci
     * n-are cum sa intre intr-o comanda. Cheia buna se naste abia la finalizare, dupa ce octetii
     * au fost cititi si masurati.
     */
    return NextResponse.json({ incarcare, referinta });
  } catch (err) {
    console.error("[upload-customization] presemnarea a esuat:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
