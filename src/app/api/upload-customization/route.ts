import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { incarcaPrivat } from "@/lib/r2";
import { detectDocMime, detectImageMime, isAllowedImage, MAX_PIXELI } from "@/lib/utils/file-signature";
import sharp from "sharp";
import { MB_DOCUMENT, MB_IMAGINE } from "@/lib/customization/definitie";
import { cheieIncarcare } from "@/lib/customization/fisiere-private";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { verificaPermisul } from "@/lib/customization/permis-incarcare";

/*
 * ⚠ RULEAZA PE NODE, si nu e o formalitate: ruta foloseste `sharp`, care e un modul NATIV.
 *
 * Fara randul asta build-ul cade la export cu „Failed to load external module sharp:
 * sharp.libvipsVersion is not a function” — masurat. Cele doua surori care folosesc `sharp`
 * (`/api/img` si `/api/upload`) il aveau de la inceput; ruta asta n-avea nevoie pana cand a
 * capatat plafonul de pixeli.
 */
export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE = MB_IMAGINE * 1024 * 1024;
/*
 * ⚠ DOCUMENTELE AU PLAFONUL LOR, si nu din generozitate: un PDF de tipar la un metru patrat, cu
 * imagini incorporate, trece lejer de 10 MB. Cu plafonul imaginilor, campul de fisier ar fi fost o
 * capabilitate care se vede in meniu si refuza chiar fisierele pentru care exista.
 *
 * ⚠ Si ramane un plafon: capatul e PUBLIC si neautentificat, iar depozitul se plateste. 40 MB e
 * cat un PDF de tipar cinstit, si nu cat o arhiva.
 */
const MAX_SIZE_DOC = MB_DOCUMENT * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "application/pdf": "pdf",
};

/**
 * Public endpoint for customer customization image uploads.
 * No auth required — customers are anonymous on the public store.
 * File content is validated by magic bytes (not the spoofable MIME header) and
 * the storage key is derived from a validated UUID to prevent path injection.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  // Public, unauthenticated endpoint — throttle to curb storage-cost abuse.
  if (!rateLimit(`upload-customization:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Prea multe incarcari. Incearca din nou in scurt timp." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  /*
   * ═══ ⚠ PERMISUL, IN LOCUL LUI `business_id` SI AL LUI `documente` ═══
   *
   * Pana acum capatul cerea doar un `business_id` care sa fie UUID valid si un magazin publicat.
   * Id-ul ala e in HTML-ul fiecarui magazin: cine il citea putea urca fisiere pe factura acelui
   * comerciant, pe orice cale, la nesfarsit in marginea plafoanelor. Iar `documente=1` venea tot
   * de la client — asa ca plafonul de 40 MB al documentelor se putea cere si de pe un camp de
   * imagine, unde el e 10.
   *
   * Acum amandoua ies din PERMIS, emis pe server cand s-a randat pagina produsului. Vezi
   * `permis-incarcare.ts`: ce leaga, cat traieste, si de ce el inlocuieste interogarea de magazin
   * in loc s-o faca „fail closed".
   */
  const permis = formData.get("permis") as string | null;
  const campId = formData.get("camp") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Fisier obligatoriu." }, { status: 400 });
  }

  const verdict = verificaPermisul(permis, campId ?? "");
  if (!verdict.ok) {
    /*
     * ⚠ UN PERMIS EXPIRAT NU E UN ABUZ, e o fila lasata deschisa peste noapte — si omul trebuie sa
     * afle ca n-are de reparat fisierul, ci de reincarcat pagina. Un singur mesaj pentru toate ar
     * fi trimis exact indicatia gresita celui nevinovat, la un camp obligatoriu.
     */
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
   * ═══ ⚠ AL DOILEA STRAT DE LIMITARE, cel care CHIAR TINE ═══
   *
   * `rateLimit` de mai sus sta in memoria procesului. Pe serverless asta inseamna ca fereastra se
   * inmulteste cu numarul de instante calde si se pierde la FIECARE desfasurare — buna sa taie o
   * rafala, dar nu limiteaza nimic pentru cine incearca de-adevaratelea. Regula casei o spune pe
   * fata in `limita-durabila.ts`: contorul din Postgres e OBLIGATORIU la „orice actiune care
   * costa bani”.
   *
   * ⚠ SI ASTA E CEL MAI EXPUS CAPAT DIN PROIECT: public, neautentificat, primeste pana la 40 MB
   * pe fisier si SCRIE in depozitul platit. Iar ce se scrie nu se sterge niciodata: singurul
   * curatitor, `deleteOrphanImages` din `r2-cleanup.ts`, nu face nimic — dinadins. Un fisier care
   * nu ajunge pe nicio comanda ramane pe factura pe veci, fara proprietar si fara urma. Sora
   * autentificata `/api/upload` are demult amandoua straturile; asta le avea pe jumatate.
   *
   * ⚠ DE CE CIFRELE ASTEA, si de ce DOUA chei:
   *
   *   IP, 80/ora — cheia care apara depozitul de un singur abuzator. Un cumparator adevarat
   *   completeaza formularul o data, poate de doua ori, cu cateva fisiere pe camp; 80 lasa loc si
   *   pentru reincercari, si pentru mai multi cumparatori adevarati in spatele aceleiasi iesiri
   *   NAT (operatorii de mobil din Romania pun mii de abonati pe acelasi IP — o limita stransa
   *   aici ar bloca oameni nevinovati la un camp OBLIGATORIU, adica exact comanda pierduta pe
   *   care o apara restul rutei).
   *
   *   MAGAZIN, 400/ora — cheia care ramane in picioare cand abuzatorul isi schimba IP-ul, si el
   *   si-l schimba. Oricat de multe adrese ar folosi, prefixul unui magazin nu poate creste cu
   *   mai mult de 400 de obiecte pe ora. Un magazin adevarat ar trebui sa primeasca 400 de
   *   fisiere de personalizare intr-o singura ora ca s-o atinga; daca vreunul ajunge acolo, e o
   *   cifra de ridicat, nu o cadere tacuta — refuzul are text propriu si iese ca 429.
   *
   * ⚠ FARA BLOCARE PROGRESIVA (`blocareSec` = 0). La autentificare blocarea e buna, fiindca acolo
   * cel pedepsit e chiar cel care greseste. Aici cheia poate fi un IP impartit de un oras intreg:
   * o blocare de-o ora peste el ar tine departe cumparatori care n-au facut nimic. Fereastra
   * expira singura si omul poate continua.
   *
   * ⚠ SE CONSULTA DUPA PERMIS, si asta s-a schimbat pe 07.09.2026: aici scria ca plafoanele merg
   * INAINTEA interogarii de magazin, ca sa nu ramana capatul o sonda gratuita de „exista magazinul
   * asta?". Interogarea aia nu mai exista — permisul o inlocuieste (vezi mai sus) — si el nu
   * atinge baza deloc, deci nu mai e nimic de sondat inaintea plafoanelor. In schimb, contorul
   * durabil nu se mai consuma pentru cereri fara permis: cine bate la usa fara cheie nu mai poate
   * epuiza cota unui magazin adevarat.
   *
   * ⚠ CADE DESCHIS la eroare de baza, ca tot restul rutei — vezi `consumaLimita`, care raspunde
   * „permis” cand contorul nu poate fi consultat. Limitatorul nu are voie sa devina el insusi
   * caderea care opreste vanzarile.
   */
  if (!(await consumaLimita(`upload-personalizare:ip:${ip}`, 80, 3600)).permis) {
    return NextResponse.json(
      { error: "Prea multe incarcari de pe aceasta conexiune. Incearca din nou peste o ora." },
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
   * ═══ ⚠ AICI STATEA INTEROGAREA CARE CADEA DESCHIS. NU MAI E NEVOIE DE EA ═══
   *
   * Ruta intreba baza daca magazinul exista si e publicat, si la eroare de baza lasa incarcarea sa
   * treaca („fail open") — dinadins: alternativa era ca poza sa dispara tacut din formular si omul
   * sa ramana blocat la un camp obligatoriu.
   *
   * Auditul cerea sa devina „fail closed". Ar fi fost mai rau decat gaura pe care o inchidea: o
   * clipire a bazei ar fi oprit ATUNCI toate comenzile personalizate din platforma, si tot
   * platforma ar fi platit.
   *
   * Permisul face intrebarea inutila. El se emite CHIAR CAND se randeaza pagina produsului, iar
   * pagina aia nu se randeaza pentru un magazin nepublicat ori pentru un produs care nu exista —
   * verificarea s-a facut deci deja, o data, acolo unde oricum se facea. Ruta nu mai intreaba
   * nimic: nici nu cade inchis, nici nu cade deschis, si a mai scapat si de o interogare de pe
   * drumul cel mai fierbinte.
   */

  const plafon = cereDocumente ? MAX_SIZE_DOC : MAX_SIZE;
  if (file.size > plafon) {
    return NextResponse.json(
      { error: `Fisierul depaseste limita de ${Math.round(plafon / 1024 / 1024)}MB.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  /*
   * ⚠ OCTETII HOTARASC, nu antetul trimis de browser — la fel ca pana acum. Documentele se
   * recunosc printr-un ajutor SEPARAT (`detectDocMime`): `isAllowedImage` e chemat din alte
   * sase locuri care inteleg toate prin „da” ca fisierul se poate randa ca imagine.
   */
  const imagine = detectImageMime(buffer);
  const document = cereDocumente ? detectDocMime(buffer) : null;
  const detected = imagine && isAllowedImage(buffer, ALLOWED_TYPES) ? imagine : document;
  if (!detected) {
    return NextResponse.json(
      {
        error: cereDocumente
          ? "Fisierul nu e nici imagine, nici PDF."
          : "Fisierul nu este o imagine valida.",
      },
      { status: 400 },
    );
  }

  /*
   * ⚠ SI CATI PIXELI SE DESFAC DIN EI, nu doar ce fel de octeti sunt.
   *
   * Semnatura spune „e un PNG”, plafonul de marime spune „are sub 10 MB” — si amandoua sunt
   * adevarate despre un PNG interlazat de 16000x16000 care se desface in peste un gigaoctet.
   * Vezi `MAX_PIXELI` pentru cifrele masurate.
   *
   * ⚠ Se opreste AICI, la intrare, nu doar la `/api/img`. Altfel bomba se scrie in depozit, si
   * de acolo o poate declansa oricine ii cere miniatura — inclusiv comerciantul care deschide
   * comanda, fara sa stie ce apasa.
   *
   * ⚠ `metadata()` citeste doar ANTETUL, nu decodeaza; iar un PDF nu are antet de imagine, deci
   * la documente se sare (verificarea lor s-a facut deja, pe octeti).
   */
  if (detected !== "application/pdf") {
    try {
      const m = await sharp(buffer).metadata();
      const pixeli = (m.width ?? 0) * (m.height ?? 0);
      if (pixeli > MAX_PIXELI) {
        return NextResponse.json(
          { error: "Imaginea are prea multi pixeli. Micsoreaz-o si incearca din nou." },
          { status: 400 },
        );
      }
    } catch {
      /*
       * ⚠ Antetul necitit inseamna REFUZ, nu „probabil e bine”: pana aici s-a stabilit deja ca
       * octetii sunt ai unei imagini cunoscute, deci daca `sharp` nu-i poate citi antetul,
       * fisierul e stricat sau anume compus. Nu se pune in depozit ce nu se poate masura.
       */
      return NextResponse.json(
        { error: "Imaginea nu a putut fi citita. Incearca alt fisier." },
        { status: 400 },
      );
    }
  }

  const ext = EXT_BY_MIME[detected] ?? "jpg";
  /*
   * ⚠ NUMELE NU MAI E SINGURUL CONTROL DE ACCES — dar ramane un strat, si de-aia ramane
   * neghicibil.
   *
   * Aici scria pana acum ca depozitul e public si ca `/api/img` accepta si el prefixul `products`,
   * deci numele ar fi tot ce apara poza personala a unui cumparator. Niciuna din cele doua nu mai
   * e adevarata: cheia poarta o semnatura HMAC si continutul se serveste doar prin
   * `/api/customization-file` — sesiune, proprietatea magazinului, si cheia sa fie chiar pe comanda
   * ceruta (vezi blocul de mai jos) —, iar `/api/img` refuza acum chiar prefixul
   * (`esteIncarcareDeCumparator` raspunde 404).
   *
   * Ce ramane adevarat: obiectul sta in aceeasi galeata cu restul, si un nume ghicibil ar fi o cale
   * de ocolire pentru oricine ajunge sa poata cere obiecte de-a dreptul. De-aia sufixul e
   * `randomUUID` si nu ce era inainte, `Date.now()`-`Math.random()`: `Math.random()` in V8 e
   * xorshift128+, nu criptografic, deci cine incarca el insusi cateva fisiere isi vede sufixele in
   * raspuns si poate deduce starea generatorului, adica numele urmatoarelor incarcari facute de pe
   * ACEEASI instanta. `randomUUID` scoate cu totul problema si e oricum conventia proiectului.
   */
  /*
   * ⚠ CHEIA POARTA O SEMNATURA, si de-aia nu se mai compune de nimeni.
   *
   * Un UUID e neghicibil, si atat a fost pana acum. Dar cheia intreaga pleca in comanda ca ADRESA
   * PUBLICA, si de acolo in emailul catre atelier — care trece prin serverele a doi furnizori si
   * ramane in casute ani de zile. Vezi `fisiere-private.ts` pentru cele doua paze.
   */
  const key = cheieIncarcare(businessId, randomUUID(), ext);

  try {
    /*
     * ⚠ `private, no-store` in loc de un an de cache public. Continutul e poza de familie a
     * unui cumparator, nu o imagine de produs — aceeasi hotarare ca la etichetele AWB.
     */
    /*
     * ⚠ ADRESA INTOARSA DE DEPOZIT SE ARUNCA DINADINS, nu se leaga de nicio variabila.
     *
     * `uploadToR2` intoarce adresa publica fiindca asa o cer celelalte doua duzini de locuri care
     * urca imagini de produs. Aici ea e chiar lucrul de care scapam: octetii sunt poza de familie
     * a unui cumparator, iar adresa asta n-are voie sa iasa din functie.
     */
    await incarcaPrivat(buffer, key, detected);
    /*
     * ⚠ SE INTOARCE DOAR CHEIA. Adresa publica nu mai pleaca in comanda si nici in email.
     * Continutul se serveste prin `/api/customization-file`, care cere sesiune, proprietatea
     * magazinului, si ca fisierul sa fie chiar pe o comanda a lui.
     *
     * ═══ ⚠ FEREASTRA DE DESFASURARE: INCHISA 07.09.2026 ═══
     *
     * Vreme de o desfasurare raspunsul a purtat si `url`, ca pagina ramasa deschisa in browserul
     * unui cumparator peste desfasurare sa nu se rupa: pachetul de atunci facea
     * `if (date.url) adrese.push(date.url); else { refuzat = true; ... }`, deci fara `url` cadea
     * MEREU pe ramura de esec, si sub camp iesea textul generic despre format si marime — pentru
     * un fisier TOCMAI scris cu succes in depozit.
     *
     * Acum nu mai exista pagini pe forma aia: desfasurarea care le-a inlocuit e live, iar cheia e
     * singura forma pe care o scrie cineva. `url` iese IMPREUNA cu `esteAdresaVeche` din
     * `comanda.ts`, in acelasi comit — scoasa doar una, drumul se rupe pe cealalta jumatate.
     */
    return NextResponse.json({ cheie: key });
  } catch (err) {
    console.error("[upload-customization] R2 upload failed:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
