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
 * ⚠ SI CE NU FACE ASTA, ca sa nu para mai mult decat e: galeata R2 ramane publica pe domeniul ei,
 * deci cine are cheia INTREAGA poate ajunge la octeti fara sa treaca pe la noi. Paza nu e o
 * politica de acces pe depozit, e faptul ca adresa nu mai circula nicaieri. O galeata privata cu
 * adrese semnate temporar ar fi pasul urmator, si e o schimbare de infrastructura, nu de cod.
 */

/**
 * Secretul de semnare.
 *
 * ⚠ NU CADE PE SIRUL GOL. Cu secret gol semnatura tot iese — HMAC merge si cu cheie vida — deci
 * oricine ar fi putut compune o cheie valida fara sa stie nimic. Se arunca, si asta e purtarea
 * corecta chiar pe drumul cel mai fierbinte: la INCARCARE cade cererea (500, un fisier neurcat),
 * la VERIFICARE cade in `false` (vezi `esteCheiaNoastra`), niciodata intr-un „da" nemeritat.
 */
function secret(): string {
  const s = process.env.CUSTOMIZATION_FILE_SECRET
    || process.env.SHIPPING_QUOTE_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "";
  if (!s) throw new Error("[fisiere-private] lipseste secretul de semnare");
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
