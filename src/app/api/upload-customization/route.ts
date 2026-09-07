import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { uploadToR2 } from "@/lib/r2";
import { detectDocMime, detectImageMime, isAllowedImage, MAX_PIXELI } from "@/lib/utils/file-signature";
import sharp from "sharp";
import { MB_DOCUMENT, MB_IMAGINE } from "@/lib/customization/definitie";
import { cheieIncarcare } from "@/lib/customization/fisiere-private";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";

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
  const businessId = formData.get("business_id") as string | null;
  /*
   * ⚠ CE FEL DE CONTINUT SE ASTEAPTA, spus de campul care cere incarcarea.
   *
   * `documente` inseamna „campul e de tip `fisier`, deci accepta si PDF”. Lipsa inseamna
   * IMAGINE, exact ca pana acum — deci paginile ramase deschise in browserele oamenilor si orice
   * alt apelant se poarta identic.
   *
   * ⚠ NU E O POARTA DE AUTORIZARE, si nu se preface ca ar fi: vine de la client, deci oricine
   * poate cere „documente” si urca un PDF si dintr-un camp de imagine. Ce apara asta e MARIMEA si
   * mesajul de eroare. Adevarata potrivire intre TIPUL campului si CE s-a incarcat se face la
   * COMANDA, in `verificaPersonalizarea`, unde se stie si definitia produsului — acolo un PDF
   * pus intr-un camp de imagine se refuza.
   */
  const cereDocumente = formData.get("documente") === "1";

  if (!file) {
    return NextResponse.json({ error: "Fisier obligatoriu." }, { status: 400 });
  }

  if (!businessId || !UUID_RE.test(businessId)) {
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
   * ⚠ SE CONSULTA INAINTEA INTEROGARII DE MAI JOS, nu dupa: si interogarea aia e o cerere de baza
   * pe care capatul asta o da oricui, iar fara plafon inaintea ei capatul devine si o sonda
   * gratuita de „exista magazinul asta?”.
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
   * Magazinul trebuie sa EXISTE si sa fie publicat.
   *
   * Pana acum se verifica doar FORMA lui `business_id` (UUID valid), deci oricine
   * putea scrie in R2 sub `products/customizations/<uuid-inventat>/` la nesfarsit,
   * pe orice UUID. Fisierele acelea nu sunt legate de nicio comanda si nimic nu le
   * sterge vreodata (`deleteOrphanImages` e no-op explicit), deci era stocare
   * platita pe veci, fara proprietar.
   *
   * FAIL OPEN la eroare de baza, deliberat: daca Supabase clipeste, incarcarea
   * trece. Alternativa — sa raspundem 400 — ar face imaginea de personalizare sa
   * dispara in tacere din formularul de comanda (OrderModal nu arata eroarea), iar
   * la un camp obligatoriu clientul ar ramane blocat fara sa inteleaga de ce.
   * Comanda pierduta e mai scumpa decat cateva fisiere orfane.
   */
  try {
    /*
     * ⚠ IMPORTUL ASTA NU MAI AMANA NIMIC, si e scris in asa fel incat pare ca amana. A fost
     * dinamic ca sa nu traga clientul de administrare pe drumurile care nu ajung pana aici; dar
     * `consumaLimita` (importat static, sus) vine din `limita-durabila.ts`, care importa STATIC
     * `@/lib/supabase/admin`. Modulul e deci deja incarcat cand se ajunge aici, iar `await
     * import()` doar il scoate din cache. Se lasa asa fiindca nu costa nimic si fiindca amanarea
     * redevine adevarata daca plafonul durabil iese vreodata din ruta — dar cine citeste sa nu
     * creada ca ruta EVITA clientul de administrare: nu-l evita.
     */
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: magazin, error } = await createAdminClient()
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("is_published", true)
      .maybeSingle();
    if (!error && !magazin) {
      return NextResponse.json({ error: "Magazin indisponibil." }, { status: 404 });
    }
  } catch {
    /* fail open — vezi comentariul de mai sus */
  }

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
    const url = await uploadToR2(buffer, key, detected, "private, no-store");
    /*
     * ⚠ SE INTOARCE CHEIA. Ea e forma noua: adresa publica nu mai pleaca in comanda si nici in
     * email. Continutul se serveste prin `/api/customization-file`, care cere sesiune,
     * proprietatea magazinului, si ca fisierul sa fie chiar pe o comanda a lui.
     *
     * ═══ ⚠ SI `url` PE LANGA EA, PENTRU FEREASTRA DE DESFASURARE ═══
     *
     * Raspunsul asta se intorcea doar ca `{ cheie }`, si aia rupea pagina ramasa deschisa in
     * browserul unui cumparator peste desfasurare. Pachetul de dinainte face
     * `if (date.url) adrese.push(date.url); else { refuzat = true; ... }` — deci fara `url` cadea
     * MEREU pe ramura de esec, iar `date.error` lipsind si el, sub camp iesea textul generic:
     * „Accepta JPG, PNG, WEBP si HEIC, pana in 10 MB”. Adica ii spuneam omului ca formatul sau
     * marimea nu se accepta, pentru un fisier care TOCMAI fusese scris cu succes in depozit. La un
     * camp obligatoriu asta inseamna comanda pierduta, si cate un obiect orfan la fiecare
     * reincercare. `comanda.ts` are dinadins ramura `esteAdresaVeche` pentru exact fereastra asta;
     * jumatatea de la incarcare lipsea, si tocmai ea e cea pe care o vede cumparatorul.
     *
     * ⚠ CE COSTA: cateva zile, adresa publica pleaca din nou in browser, si o pagina veche o va
     * scrie ca atare in comanda. Pretul e mic si masurat: adresa se da chiar celui care tocmai a
     * urcat octetii, deci nu afla nimic nou; poarta comenzii o accepta deliberat prin
     * `esteAdresaVeche`; iar emailul catre atelier nu mai scrie adrese deloc, deci partea care
     * chiar scurgea — casutele a doi furnizori, ani de zile — ramane inchisa. Pagina noua citeste
     * `cheie` si ignora `url`.
     *
     * ⚠ CAND SE SCOATE: la desfasurarea urmatoare, impreuna cu `esteAdresaVeche` din `comanda.ts`.
     * Cele doua ies IMPREUNA — scos doar `url`, paginile vechi se rup din nou; scoasa doar
     * `esteAdresaVeche`, adresele plecate in fereastra asta nu mai trec de poarta comenzii.
     */
    return NextResponse.json({ cheie: key, url });
  } catch (err) {
    console.error("[upload-customization] R2 upload failed:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
