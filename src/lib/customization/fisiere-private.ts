import { createHmac, timingSafeEqual } from "node:crypto";
import { PREFIX_INCARCARI } from "./adresa";

/**
 * Fisierele incarcate de CUMPARATORI: cheia lor, si de ce nu mai pleaca nicio adresa publica.
 *
 * ═══ ⚠ CE E IN ELE ═══
 *
 * Poza unui copil pentru un puzzle. Fotografia de nunta pentru un tablou canvas. Logo-ul unei
 * firme, inainte de lansare. Fisierul de tipar al unui roll-up. Nu sunt datele comerciantului: sunt
 * ale unui TERT care a completat un formular public si n-a fost intrebat nimic despre stocare.
 *
 * ═══ ⚠ CE ERA INAINTE, SI DE CE NU AJUNGEA ═══
 *
 * Ruta de incarcare intorcea adresa PUBLICA din R2, iar ea se scria ca atare in
 * `orders.items[].customization`. De acolo pleca in emailul catre atelier si in panou, ca `<a href>`.
 * Comentariul de atunci o spunea limpede: „Numele e SINGURUL control de acces al fisierului:
 * depozitul e public".
 *
 * Un nume neghicibil e bun impotriva ghicitului. Dar `unguessable != private`: adresa ajungea
 * intr-un email, care trece prin serverele a doi furnizori si ramane in casute ani de zile; putea
 * fi copiata dintr-un panou, trimisa mai departe, indexata daca nimerea undeva public. Si nimic
 * n-o expira vreodata.
 *
 * ═══ ⚠ DOUA PAZE, INDEPENDENTE ═══
 *
 * Acelasi tipar ca la etichetele AWB, care poarta numele, adresa si telefonul cumparatorului —
 * vezi `ecolet/documente.ts` si `gls/eticheta.ts`.
 *
 * 1. **Cheia nu se poate COMPUNE.** Are o semnatura HMAC din secretul serverului. Cine stie
 *    `business_id` — iar el e public, sta in fiecare pagina de magazin — si ghiceste un UUID tot
 *    nu poate scrie adresa fisierului.
 * 2. **Adresa nu se mai DA.** Ruta de incarcare intoarce CHEIA; in comanda se scrie cheia; iar
 *    continutul se serveste printr-o ruta care cere sesiune si proprietatea magazinului, cu
 *    `Cache-Control: private, no-store`. ⚠ Vreme de o desfasurare ruta a intors si `url`, ca
 *    paginile ramase deschise in browsere sa nu se rupa; fereastra aia s-a INCHIS pe 07.09.2026,
 *    odata cu `esteAdresaVeche` din `comanda.ts`. Acum nicio adresa nu mai iese din ruta si niciuna
 *    nu mai intra pe poarta comenzii.
 *
 * Sunt independente dinadins: daca o cheie scapa, tot nu se poate compune alta; daca cineva
 * deduce structura cheii, ruta tot cere autentificare.
 *
 * ⚠ AICI SCRIA CA „galeata R2 ramane publica pe domeniul ei, deci cine are cheia INTREAGA poate
 * ajunge la octeti fara sa treaca pe la noi", si ca o galeata privata ar fi pasul urmator. Pasul
 * acela s-a facut pe 07.09.2026: incarcarile se scriu intr-o galeata FARA domeniu public, iar
 * octetii se dau numai prin adrese semnate scurt, emise dupa cele patru porti ale rutei de servire.
 * Deci paza nu mai e „adresa nu circula" — e o politica de acces pe depozit.
 *
 * ⚠ CE RAMANE ADEVARAT: fisierele urcate INAINTE de mutare stau mai departe in galeata veche, iar
 * pentru ele apararea e tot cea de mai sus. Cheia semnata si ruta cu porti conteaza si acolo — de
 * aceea nimic din ce scrie mai sus nu s-a scos, doar concluzia s-a mutat.
 */

/**
 * Secretul de semnare al fisierelor cumparatorilor.
 *
 * ═══ ⚠ FARA REZERVE, DIN 07.09.2026 ═══
 *
 * Aici era un lant: `CUSTOMIZATION_FILE_SECRET` sau `SHIPPING_QUOTE_SECRET` sau
 * `SUPABASE_SERVICE_ROLE_KEY`. Criptografic mergea, dar lega trei lucruri care n-au nimic de-a face
 * unul cu altul: cheile fisierelor personale, cotatiile de transport si cheia de serviciu a bazei.
 *
 * Urmarea practica: secretul asta nu se putea roti. Cine ar fi vrut sa-l schimbe ar fi trebuit sa
 * atinga transportul sau cheia de serviciu, adica sa opreasca altceva. Iar un secret care nu se
 * poate roti nu e o masura de securitate, e o speranta.
 *
 * ⚠ E OBLIGATORIU IN PRODUCTIE (vezi `CHEI_OBLIGATORII` din `next.config.ts`), deci o desfasurare
 * fara el se opreste cu numele cheii in jurnal. Aruncarea de mai jos e a doua plasa, pentru cazul
 * in care variabila dispare DUPA o desfasurare reusita.
 *
 * ⚠ SI ARUNCA, nu cade pe sirul gol: cu secret vid HMAC merge mai departe si semnatura tot iese,
 * deci oricine ar fi putut compune o cheie valida fara sa stie nimic. La INCARCARE cade cererea
 * (500, un fisier neurcat), la VERIFICARE cade in `false` (vezi `esteCheiaNoastra`), niciodata
 * intr-un „da" nemeritat.
 */
function secret(): string {
  const s = process.env.CUSTOMIZATION_FILE_SECRET?.trim();
  if (!s) throw new Error("[fisiere-private] lipseste CUSTOMIZATION_FILE_SECRET");
  return s;
}

function semnatura(businessId: string, nume: string, ext: string): string {
  return createHmac("sha256", secret())
    .update(`personalizare:${businessId}:${nume}:${ext}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Cheia R2 a unui fisier incarcat de client.
 *
 * ⚠ Prefixul ramane cel de dinainte, caracter cu caracter: pe el se sprijina verificarea de
 * proprietate din `comanda.ts`, si mutat ar fi rupt-o tacut.
 */
export function cheieIncarcare(businessId: string, nume: string, ext: string): string {
  const e = /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : "bin";
  return `${PREFIX_INCARCARI}${businessId}/${nume}-${semnatura(businessId, nume, e)}.${e}`;
}

/**
 * E cheia asta una scrisa de NOI, pentru magazinul asta?
 *
 * ⚠ Se compara in timp CONSTANT. O comparatie obisnuita se opreste la primul caracter diferit,
 * iar diferenta de timp e masurabila de cine incearca de destule ori — asa se poate ghici
 * semnatura caracter cu caracter, fara sa stii secretul.
 *
 * ⚠ Si intoarce `false` la orice forma neasteptata, nu arunca: e chemata pe drumul comenzii, unde
 * o exceptie ar opri o vanzare pentru un rand scris strambe.
 */
export function esteCheiaNoastra(cheie: string, businessId: string): boolean {
  if (typeof cheie !== "string") return false;
  const prefix = `${PREFIX_INCARCARI}${businessId}/`;
  if (!cheie.startsWith(prefix)) return false;

  const rest = cheie.slice(prefix.length);
  /* Fara alte niveluri: o cheie cu `/` in coada ar putea arata catre alt dosar. */
  if (rest.includes("/")) return false;

  const m = /^(.+)-([0-9a-f]{24})\.([a-z0-9]{1,5})$/.exec(rest);
  if (!m) return false;
  const [, nume, semn, ext] = m;

  try {
    const asteptat = semnatura(businessId, nume, ext);
    const a = Buffer.from(semn, "utf8");
    const b = Buffer.from(asteptat, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    /* Secret lipsa: nicio cheie nu e a noastra. Vezi `secret()`. */
    return false;
  }
}

/**
 * E cheia asta scrisa de noi pentru magazinul asta, DUPA FORMA, fara semnatura?
 *
 * ═══ ⚠ UNDE SE FOLOSESTE ASTA IN LOC DE `esteCheiaNoastra`, SI DE CE ═══
 *
 * Semnatura atarna de un secret care se poate schimba. La INTRARE (poarta comenzii) asta e in
 * regula: se semneaza si se verifica in aceeasi clipa, si tocmai semnatura opreste pe cineva sa
 * trimita in comanda o cheie compusa de el.
 *
 * La SERVIRE insa cheia se verifica luni mai tarziu. Daca secretul s-a rotit intre timp,
 * `esteCheiaNoastra` ar raspunde „nu" pentru fisiere ale caror octeti stau nevatamati in
 * depozit — iar comerciantul ar ramane fara hartia dupa care produce marfa, la o comanda pe care
 * a incasat-o. De-aia ruta care serveste octetii nu cere semnatura: dreptul ei e dovedit oricum
 * mai tare, de trei ori — sesiune, proprietatea magazinului, si cheia sa fie CHIAR pe o comanda a
 * lui. Un fisier care nu e pe nicio comanda nu se serveste, semnat sau nu.
 */
export function areFormaCheii(cheie: string, businessId: string): boolean {
  if (typeof cheie !== "string") return false;
  const prefix = `${PREFIX_INCARCARI}${businessId}/`;
  if (!cheie.startsWith(prefix)) return false;
  const rest = cheie.slice(prefix.length);
  if (rest.includes("/")) return false;
  return /^.+-[0-9a-f]{24}\.[a-z0-9]{1,5}$/.test(rest);
}

/**
 * Unde stau incarcarile care N-AU TRECUT INCA verificarea.
 *
 * ⚠ E sub acelasi prefix ca restul, dinadins: cronul de retentie listeaza
 * `products/customizations/` si nimic altceva, deci obiectele lasate aici de cineva care n-a mai
 * chemat `finalizeaza` se curata singure dupa termenul orfanilor. Un prefix nou ar fi fost un colt
 * de depozit pe care nu-l mai matura nimeni.
 */
const PREFIX_PROVIZORIU = `${PREFIX_INCARCARI}_provizoriu/`;

/**
 * Cheia pe care o primeste browserul ca sa incarce DIRECT in depozit.
 *
 * ═══ ⚠ DE CE NU SE INCARCA DE-A DREPTUL PE CHEIA BUNA ═══
 *
 * Fiindca cheia buna e o LEGITIMATIE: `esteCheiaNoastra` o accepta la comanda, iar poarta comenzii
 * o crede scrisa de noi. Daca browserul ar putea scrie direct pe ea, ar fi de ajuns sa ceara un
 * link, sa urce ce vrea, si sa NU mai cheme `finalizeaza`: octetii n-ar fi trecut nicio verificare,
 * dar cheia lor ar fi fost valabila, si ar fi intrat in comanda. Comerciantul ar fi descarcat orice.
 *
 * Cheia provizorie are un nivel de dosar in plus, deci `esteCheiaNoastra` o refuza prin chiar
 * conditia ei („fara alte niveluri"). Cheia buna se naste abia dupa ce octetii au fost cititi si
 * masurati — vezi `mutaIncarcarea`.
 *
 * ⚠ SI E TOT SEMNATA: altfel cine cheama `finalizeaza` ar putea da orice sir ca „referinta" si ar
 * pune platforma sa copieze un obiect ales de el pe o cheie buna.
 */
export function cheieProvizorie(businessId: string, nume: string, ext: string): string {
  const e = /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : "bin";
  const mac = createHmac("sha256", secret())
    .update(`provizoriu:${businessId}:${nume}:${e}`)
    .digest("hex")
    .slice(0, 24);
  return `${PREFIX_PROVIZORIU}${businessId}/${nume}-${mac}.${e}`;
}

/** Chiar noi am dat cheia provizorie asta, magazinului asta? Refuza orice altceva. */
export function esteCheieProvizorie(cheie: string, businessId: string): boolean {
  if (typeof cheie !== "string") return false;
  const prefix = `${PREFIX_PROVIZORIU}${businessId}/`;
  if (!cheie.startsWith(prefix)) return false;
  const rest = cheie.slice(prefix.length);
  if (rest.includes("/")) return false;

  const punct = rest.lastIndexOf(".");
  if (punct <= 0) return false;
  const ext = rest.slice(punct + 1);
  const corp = rest.slice(0, punct);
  const liniuta = corp.lastIndexOf("-");
  if (liniuta <= 0) return false;

  const asteptat = Buffer.from(cheieProvizorie(businessId, corp.slice(0, liniuta), ext));
  const primit = Buffer.from(cheie);
  if (asteptat.length !== primit.length) return false;
  try {
    return timingSafeEqual(asteptat, primit);
  } catch {
    return false;
  }
}

/**
 * Cheia definitiva care ii corespunde unei chei provizorii.
 *
 * ⚠ TERMINATIA VINE DIN OCTETI, nu de pe cheia provizorie. Aceea o compune clientul din numele
 * fisierului lui: cine urca un PDF numit „poza.jpg" ar fi primit o cheie definitiva `.jpg` pentru
 * un document. Iar mai tarziu, in panoul atelierului — unde nu mai exista octeti — terminatia e
 * SINGURUL lucru pe care `sePoateRandaCaImagine` il are la dispozitie: ar fi desenat o poza rupta
 * comerciantului care trebuie sa execute comanda.
 */
export function cheiaDefinitiva(provizorie: string, businessId: string, ext: string): string | null {
  if (!esteCheieProvizorie(provizorie, businessId)) return null;
  const rest = provizorie.slice(`${PREFIX_PROVIZORIU}${businessId}/`.length);
  const corp = rest.slice(0, rest.lastIndexOf("."));
  return cheieIncarcare(businessId, corp.slice(0, corp.lastIndexOf("-")), ext);
}

/**
 * Cheia MINIATURII unui fisier de cumparator.
 *
 * ═══ ⚠ DE CE EXISTA ═══
 *
 * In panoul comenzii, pozele clientului se arata intr-un patrat de 56 de pixeli. Pana acum patratul
 * ala tragea ORIGINALUL: o poza de telefon de 8 MB, nemicsorata, la fiecare deschidere a paginii.
 * Iar `private, no-store` (corect, sunt date personale) inseamna ca nici browserul n-o tine, deci se
 * plateste din nou la fiecare reincarcare. O comanda cu zece poze cerea zeci de megaocteti ca sa
 * arate zece patratele.
 *
 * ⚠ SE DERIVA DIN CHEIA ORIGINALULUI, si numai pe server. Clientul cere „vreau miniatura", nu „vreau
 * cheia asta": altfel ar fi fost inca un sir venit din browser care ajunge la depozit.
 *
 * ⚠ SI STA SUB ACELASI PREFIX, ca sa fie maturata de cronul de retentie odata cu originalul. Un
 * dosar nou ar fi fost un colt de depozit pe care nu-l mai curata nimeni.
 *
 * ⚠ NU TRECE de `esteCheiaNoastra` si nici de `areFormaCheii`, si asa trebuie: miniatura nu e un
 * fisier pe care sa-l poata trimite cineva intr-o comanda. Ruta o serveste doar dupa ce ORIGINALUL
 * a trecut toate portile.
 */
export function cheieMiniatura(cheie: string): string {
  return `${cheie}.mic.webp`;
}
