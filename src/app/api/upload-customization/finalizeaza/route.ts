import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  inceputulIncarcarii, masoaraIncarcarea, mutaIncarcarea, stergeIncarcarea,
} from "@/lib/r2";
import { detectDocMime, detectImageMime, isAllowedImage, MAX_PIXELI } from "@/lib/utils/file-signature";
import { MB_DOCUMENT, MB_IMAGINE } from "@/lib/customization/definitie";
import { cheiaDefinitiva, esteCheieProvizorie } from "@/lib/customization/fisiere-private";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { verificaPermisul } from "@/lib/customization/permis-incarcare";

/*
 * ═══ ⚠ AICI SE VERIFICA CE S-A INCARCAT CU ADEVARAT ═══
 *
 * Octetii nu mai trec prin functie (vezi ruta-sora, si de ce): browserul ii pune de-a dreptul in
 * depozit, pe o cheie PROVIZORIE. Pe aia poarta comenzii o refuza — deci pana aici fisierul nu e
 * inca nimic.
 *
 * Ruta asta face ce facea inainte pipa de incarcare, dar pe octetii ADEVARATI in loc de cei
 * promisi: marimea, semnatura de format, plafonul de pixeli. Daca trec, obiectul se MUTA pe cheia
 * definitiva — cea semnata, pe care `esteCheiaNoastra` o accepta. Daca nu trec, se STERGE pe loc.
 *
 * ⚠ CHEIA BUNA SE NASTE ABIA AICI, si asta e toata paza acestui drum. Daca browserul ar fi scris
 * de-a dreptul pe ea, ar fi fost de ajuns sa ceara un link, sa urce orice, si sa nu mai cheme
 * ruta asta: octetii n-ar fi trecut nicio verificare, dar cheia lor ar fi fost valabila si ar fi
 * intrat in comanda. Comerciantul ar fi descarcat orice.
 *
 * ⚠ CE RAMANE DACA NIMENI NU CHEAMA RUTA ASTA: un obiect sub `_provizoriu/`, pe care cronul de
 * retentie il matura ca orfan — prefixul lui e sub `products/customizations/`, dinadins.
 */
export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE = MB_IMAGINE * 1024 * 1024;
const MAX_SIZE_DOC = MB_DOCUMENT * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "application/pdf": "pdf",
};

/**
 * Cat se citeste inapoi din depozit ca sa se hotarasca ce e fisierul.
 *
 * ⚠ NU TOT. Semnatura de format sta in primii octeti, iar `sharp().metadata()` citeste doar
 * ANTETUL — nu decodeaza imaginea. Adus intreg, un PDF de tipar de 40 MB ar fi intrat degeaba in
 * memoria functiei, adica exact drumul de care scapam.
 *
 * ⚠ JUMATATE DE MEGAOCTET, nu cativa kiloocteti: la HEIC antetul poate sta mai departe de inceput,
 * iar `sharp` peste o bucata prea scurta ar fi ARUNCAT — si ruta ar fi refuzat, ca „nu se poate
 * citi", fotografii perfect bune facute cu un iPhone.
 */
const CAT_SE_CITESTE = 512 * 1024;

/**
 * Sub marimea asta se aduce fisierul INTREG.
 *
 * ⚠ Ca `sharp` sa nu vada niciodata o imagine taiata la mijloc pentru pozele obisnuite. Peste ea,
 * bucata de mai sus e oricum de ajuns pentru antet.
 */
const ADU_INTREG_SUB = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!rateLimit(`finalizeaza-customization:${ip}`, 40, 60_000)) {
    return NextResponse.json({ error: "Prea multe cereri. Incearca din nou in scurt timp." }, { status: 429 });
  }

  let corp: { permis?: unknown; camp?: unknown; referinta?: unknown };
  try {
    corp = await request.json();
  } catch {
    return NextResponse.json({ error: "Cerere invalida." }, { status: 400 });
  }

  const permis = typeof corp.permis === "string" ? corp.permis : null;
  const campId = typeof corp.camp === "string" ? corp.camp : "";
  const referinta = typeof corp.referinta === "string" ? corp.referinta : "";

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

  /*
   * ⚠ REFERINTA TREBUIE SA FIE UNA DATA DE NOI, MAGAZINULUI ASTA. Fara verificarea asta, cine
   * cheama ruta ar putea da orice sir si ar pune platforma sa copieze un obiect ales de el pe o
   * cheie buna — inclusiv unul din prefixul altui magazin.
   */
  if (!esteCheieProvizorie(referinta, businessId)) {
    return NextResponse.json({ error: "Incarcare nepermisa." }, { status: 403 });
  }

  const masura = await masoaraIncarcarea(referinta);
  if (!masura) {
    return NextResponse.json(
      { error: "Fisierul nu a ajuns in depozit. Incearca din nou." },
      { status: 404 },
    );
  }

  const refuza = async (mesaj: string, cod = 400) => {
    /*
     * ⚠ SE STERGE PE LOC, nu se lasa pe seama cronului: un fisier refuzat e ori o greseala, ori o
     * incercare — in amandoua cazurile n-are ce cauta pe factura comerciantului nici treizeci de
     * zile.
     */
    await stergeIncarcarea(referinta);
    return NextResponse.json({ error: mesaj }, { status: cod });
  };

  /*
   * ⚠ MARIMEA ADEVARATA, desi e si semnata in link. Semnatura o apara la scriere, dar plafonul
   * nostru se poate schimba intre darea linkului si finalizare, iar o a doua citire nu costa nimic:
   * `HeadObject` nu aduce octeti.
   */
  const plafon = cereDocumente ? MAX_SIZE_DOC : MAX_SIZE;
  if (masura.octeti > plafon) {
    return refuza(`Fisierul depaseste limita de ${Math.round(plafon / 1024 / 1024)}MB.`);
  }

  const cati = masura.octeti <= ADU_INTREG_SUB ? masura.octeti : CAT_SE_CITESTE;
  const inceput = await inceputulIncarcarii(referinta, cati);
  if (!inceput) return refuza("Fisierul nu a putut fi citit. Incearca din nou.", 502);

  /*
   * ⚠ OCTETII HOTARASC, nu antetul trimis de browser si nu numele fisierului. Documentele se
   * recunosc printr-un ajutor SEPARAT (`detectDocMime`): `isAllowedImage` e chemat din alte sase
   * locuri care inteleg toate prin „da" ca fisierul se poate randa ca imagine.
   */
  const imagine = detectImageMime(inceput);
  const document = cereDocumente ? detectDocMime(inceput) : null;
  const detected = imagine && isAllowedImage(inceput, ALLOWED_TYPES) ? imagine : document;
  if (!detected) {
    return refuza(cereDocumente ? "Fisierul nu e nici imagine, nici PDF." : "Fisierul nu este o imagine valida.");
  }

  /*
   * ⚠ SI CATI PIXELI SE DESFAC DIN EL, nu doar ce fel de octeti e.
   *
   * Semnatura spune „e un PNG", plafonul de marime spune „are sub 10 MB" — si amandoua sunt
   * adevarate despre un PNG interlazat de 16000x16000 care se desface in peste un gigaoctet. Oprit
   * aici, bomba nu ajunge niciodata pe o cheie buna; lasata sa treaca, o poate declansa oricine ii
   * cere miniatura, inclusiv comerciantul care deschide comanda fara sa stie ce apasa.
   */
  if (detected !== "application/pdf") {
    try {
      const m = await sharp(inceput).metadata();
      if ((m.width ?? 0) * (m.height ?? 0) > MAX_PIXELI) {
        return refuza("Imaginea are prea multi pixeli. Micsoreaz-o si incearca din nou.");
      }
    } catch {
      /*
       * ⚠ Antetul necitit inseamna REFUZ, nu „probabil e bine": pana aici s-a stabilit deja ca
       * octetii sunt ai unei imagini cunoscute, deci daca `sharp` nu-i poate citi antetul, fisierul
       * e stricat sau anume compus. Nu se pastreaza ce nu se poate masura.
       */
      return refuza("Imaginea nu a putut fi citita. Incearca alt fisier.");
    }
  }

  /* ⚠ TERMINATIA URMEAZA OCTETII — vezi `cheiaDefinitiva`, unde scrie ce costa cand nu o face. */
  const cheie = cheiaDefinitiva(referinta, businessId, EXT_BY_MIME[detected] ?? "bin");
  if (!cheie) return refuza("Incarcare nepermisa.", 403);

  try {
    await mutaIncarcarea(referinta, cheie, detected);
  } catch (err) {
    console.error("[finalizeaza] mutarea a esuat:", err);
    return refuza("Incarcarea a esuat. Incearca din nou.", 500);
  }

  /*
   * ⚠ SE INTOARCE DOAR CHEIA. Nicio adresa publica: continutul se serveste prin
   * `/api/customization-file`, care cere sesiune de comerciant, proprietatea magazinului, si ca
   * fisierul sa fie chiar pe o comanda a lui.
   */
  return NextResponse.json({ cheie });
}
