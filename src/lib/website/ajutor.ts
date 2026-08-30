import { PRIMII_PASI } from "./ajutor-categorii/primii-pasi";
import { PRODUSE } from "./ajutor-categorii/produse";
import { COMENZI_SI_LIVRARE } from "./ajutor-categorii/comenzi-si-livrare";
import { PLATI_SI_FACTURARE } from "./ajutor-categorii/plati-si-facturare";
import { DESIGN_SI_PAGINI } from "./ajutor-categorii/design-si-pagini";
import { MARKETING_SI_CLIENTI } from "./ajutor-categorii/marketing-si-clienti";
import { MARKETPLACE } from "./ajutor-categorii/marketplace";
import { SETARI } from "./ajutor-categorii/setari";
import { SUPORT } from "./ajutor-categorii/suport";
import {
  capturaPasului,
  ghidurileCategoriei,
  type CategorieAjutor,
  type Ghid,
} from "./ajutor-tipuri";

export * from "./ajutor-tipuri";

/*
  ⚠ DATELE STAU ÎN `ajutor-categorii/`, NU ÎNTR-UN DIRECTOR `ajutor/`.

  Prima formă avea `ajutor/index.ts` cu datele alături, iar importul scria
  `@/lib/website/ajutor`. Next îl rezolva; runner-ul de probe, care e Node ESM
  curat, NU: importul de DIRECTOR nu e sprijinit acolo, iar toate probele
  centrului au căzut deodată cu `ERR_UNSUPPORTED_DIR_IMPORT`.

  Acum fiecare import duce la un FIȘIER, deci merge la fel în amândouă. Tipurile
  stau separat, în `ajutor-tipuri.ts`, ca fișierele de categorii să nu se importe
  înapoi pe ăsta și să iasă un ciclu.
*/


/**
 * Centrul de ajutor Edinio: 406 de ghiduri, în nouă categorii.
 *
 * ═══ DE UNDE VIN TEXTELE ═══
 *
 * Dintr-un audit al codului panoului, cerut de client (19.08) după ce prima
 * variantă, cu patru ghiduri scurte de categorie, i s-a părut că „nu ajută prea
 * mult”. Auditul a mers pe douăzeci și cinci de zone ale panoului, câte una
 * pentru fiecare rubrică din meniu, pentru fiecare grup de integrări și pentru
 * cele paisprezece secțiuni din Setări.
 *
 * Fiecare zonă a trecut prin trei mâini: una care a citit codul și a scos
 * acțiunile cu șirurile exacte din interfață, una care a încercat să RESPINGĂ ce
 * scrisese prima, și una care a scris ghidurile din ce a rămas. Verificarea n-a
 * fost o formalitate: a respins 219 afirmații care nu se susțineau din nicio linie
 * de cod. Alte 238 de lucruri n-au putut fi stabilite deloc și au rămas nescrise,
 * în loc să fie completate cu ce părea probabil.
 *
 * ⚠ TOT CIORNĂ SUNT. Se corectează de client, ca înainte. Ce s-a schimbat e că
 * acum descriu platforma care există, cu denumirile ei, nu una plauzibilă.
 *
 * ═══ CURĂȚENIA DIN 30.08: 531 → 422 ═══
 *
 * Cerută de client, care s-a plâns că centrul e prea încărcat cu lucruri pe care
 * le știe oricine. Citind toate cele 531, s-a văzut că plângerea nimerea doar
 * jumătate din problemă: a doua jumătate erau ghiduri scrise DE DOUĂ ORI. Cele
 * două valuri de scriere s-au suprapus fără să se vadă, fiindcă titlurile diferă
 * exact acolo unde nu contează: „Cum schimbi prețul mai multor produse dintr-o
 * dată” și „...deodată” erau două intrări separate, iar „Cum vezi câte produse
 * mai poți adăuga” apărea de două ori în ACELAȘI grup.
 *
 * S-au scos 109, pe șapte motive, în ordinea cât au cântărit:
 *   36 dublură   — același subiect de două ori; a rămas varianta mai completă
 *   25 navigare  — „unde se deschide ecranul X”, adică un rând de meniu
 *   14 fragment  — un singur comutator dintr-un ecran acoperit deja de alt ghid
 *   12 ecran     — descriau ce se vede, fără nicio acțiune de făcut
 *   12 listă     — mecanica listei: caută, sortează, paginează
 *    6 banal     — cont nou, conectare, ieșire din cont
 *    4 clipboard — un buton care copiază ceva
 *
 * ⚠ CE N-A FOST ATINS, DINADINS: tot ce cere o configurare adevărată sau are
 * urmări pe bani, pe marfă sau pe lege. DNS, SMTP, ANAF, TVA, facturarea
 * automată, feedurile de stoc, toți curierii, toate marketplace-urile,
 * retururile, politicile. Trei ghiduri care păreau dubluri au rămas amândouă
 * fiindcă NU erau: UPS și FedEx sunt curieri diferiți, SmartBill și Oblio case
 * de facturare diferite, iar activarea și dezactivarea 2FA sunt două drumuri.
 *
 * Nimic nu s-a rescris, doar s-a scos: ce a rămas e text NEATINS, deci
 * corecturile făcute de client până acum se păstrează întregi. Care ghid anume
 * a plecat se vede în diff-ul care a făcut tăierea.
 *
 * ═══ A DOUA TRECERE, TOT PE 30.08: 422 → 406, ȘI CAPTURILE 345 → 39 ═══
 *
 * Clientul a recitit tot și a numit 24 de ghiduri de scos, unul câte unul. Sunt
 * scoase întocmai, fără să fie completate cu altele apropiate.
 *
 * ⚠ TREI LUCRURI AU RĂMAS NEDOCUMENTATE ÎN URMA LOR, și e bine să se știe:
 * pragul „Notifică la stoc mic” (au plecat amândouă ghidurile care îl atingeau),
 * trimiterea unui singur produs pe Trendyol din pagina lui, și publicarea unei
 * selecții pe OLX din lista de produse. Rămâne „Publică tot” pentru OLX și
 * listarea completă pentru Trendyol.
 *
 * CAPTURILE. Din 345 de locuri de poză au rămas 39. Regula, pe scurt: ghidurile
 * astea citează denumirile exacte din panou, deci când pasul spune «apasă
 * „Rulează acum”», CUVINTELE sunt poza. O fotografie a unui buton pe care scrie
 * „Rulează acum” nu adaugă nimic. Captura rămâne în trei cazuri:
 *   A. ținta n-are nume de citit (o iconiță, o săgeată, un X într-un colț);
 *   B. orientarea într-un ecran, câte UNA pe grup, la primul ghid din el;
 *   C. forma sau culoarea e chiar informația (un grafic, o hartă, o bară de
 *      progres, o etichetă de stare).
 * Toate cele nouă categorii au rămas cu cel puțin o captură, iar 26 de grupuri
 * din 26 au poza lor de orientare.
 *
 * ═══ eMAG, ADĂUGAT PE 30.08: 395 → 406 ═══
 *
 * eMAG lipsea cu totul, deși e canalul cel mai activ din producție. Nu era o
 * scăpare de redactare, era o urmare a felului în care s-a făcut auditul:
 * auditul din 19.08 a citit panoul de pe ramura ASTA, iar integrarea eMAG
 * trăiește pe `main`, adăugată după. Cuvântul „eMAG” apărea o singură dată în
 * tot centrul, în descrierea categoriei Marketplace.
 *
 * S-a văzut abia când a fost măsurată căutarea: „emag” întorcea zero rezultate.
 * Merită reținut cum a ieșit la iveală, fiindcă nicio recitire a textelor n-ar
 * fi găsit-o. Lipsa nu se vede citind ce e scris.
 *
 * Cele unsprezece ghiduri noi acoperă drumul întreg: conectarea cu adresa IP
 * declarată dinainte, ce cere eMAG înaintea primei publicări, datele GPSR,
 * legarea categoriilor, legarea ofertelor existente, trimiterea produselor noi,
 * citirea celor nouă stări, cele două feluri de oprire, comenzile, AWB-ul și
 * retururile.
 *
 * ⚠ SCRISE DIN CODUL DE PE `main`, nu din cel de pe ramura asta, fiindcă acolo e
 * panoul adevărat. Toate cele 109 denumiri citate au fost verificate una câte
 * una în `components/dashboard/Emag*.tsx` și `lib/emag/`. Zero citate fără
 * acoperire. Verificarea se poate reface oricând, cu aceeași măsură.
 *
 * ⚠ CE N-A INTRAT, DINADINS: campaniile, facturile lor, panoul de fulfillment și
 * jurnalul. Sunt zone mai rar atinse, iar un ghid scris pe fugă acolo ar fi mai
 * rău decât lipsa lui. Rămân pentru o rundă următoare.
 *
 * ═══ REGULILE DE SCRIERE SUNT ALE CLIENTULUI (19.08) ═══
 *
 * Treizeci și cinci de reguli, date în scris. Cele care se văd cel mai des:
 * fără liniuță lungă, fără emoji, fără semne de exclamare, fără introduceri și
 * fără concluzii, pași scurți cu denumirile exacte din panou, limitările spuse
 * direct, nimic inventat.
 *
 * Patru dintre ele sunt PROBATE în `ajutor-cautare.test.ts`, fiindcă o regulă de
 * stil pe care n-o verifică nimic se încalcă la al treilea ghid adăugat.
 *
 * ⚠ SEMNELE DE EXCLAMARE din ghilimele sunt îngăduite, și proba le lasă să treacă.
 * Sunt citate din interfață: butonul chiar scrie „Copiat!”. Regula 7, care cere
 * denumirile exacte, bate aici regula 15. Un ghid care „îndreaptă” textul unui
 * buton trimite omul să caute altceva decât scrie pe ecran.
 *
 * ⚠ LINIUȚA LUNGĂ NU MAI E ÎNGĂDUITĂ NICĂIERI, nici în citate (cerut 30.08).
 * Erau șase, toate în citate adevărate. Nu s-au ciuntit citatele: s-au rescris
 * frazele ca să nu mai aibă nevoie de ele. Așa se face și data viitoare.
 *
 * ═══ DE CE UN FIȘIER PE CATEGORIE ═══
 *
 * 406 de ghiduri într-un singur fișier înseamnă vreo 400KB pe care nimeni nu-i
 * deschide de două ori. Așa, clientul corectează o categorie fără să vadă
 * celelalte opt, iar două corecturi în paralel nu se ciocnesc.
 *
 * ═══ MUTAREA PE `ajutor.edinio.com` ═══
 *
 * Clientul a spus (19.08) că paginile astea ajung pe un subdomeniu. Nu s-a
 * pregătit nimic acum, dinadins: rutarea n-are efect până nu e legat DNS-ul, iar
 * codul scris „pentru mai târziu” nu-l probează nimeni. Ce se atinge ATUNCI,
 * într-un singur loc fiecare:
 *
 * 1. `lib/website/footer.ts` și `lib/website/nav.ts`, cele două linkuri.
 * 2. `lib/website/metadata.ts`, adresa canonică.
 * 3. `app/sitemap.ts`, care nu poate cuprinde alt domeniu.
 * 4. `next.config.ts`, o redirecționare permanentă de la `/ajutor/*`.
 * 5. `app/(ajutor)/layout.tsx`, cele trei linkuri din bara de sus: de pe
 *    subdomeniu, `/login` ar duce la `ajutor.edinio.com/login`, care nu există.
 *
 * ⚠ Secțiunea stă din 30.08 în grupul ei de rute, `(ajutor)`, nu în `(website)`.
 * Clientul a cerut altă bară de sus, iar un layout imbricat nu poate scoate ce
 * desenează părintele. Adresele n-au fost atinse: grupurile de rute nu apar în
 * URL. Mutarea pe subdomeniu are acum un singur înveliș de schimbat, nu unul
 * împărțit cu tot site-ul de prezentare.
 *
 * Adresele se construiesc toate din `RADACINA`, în `ajutor-cautare.ts`.
 */
export const CATEGORII_AJUTOR: CategorieAjutor[] = [
  PRIMII_PASI,
  PRODUSE,
  COMENZI_SI_LIVRARE,
  PLATI_SI_FACTURARE,
  DESIGN_SI_PAGINI,
  MARKETING_SI_CLIENTI,
  MARKETPLACE,
  SETARI,
  SUPORT,
];

/** Un ghid împreună cu categoria din care face parte. Pentru căutare și sitemap. */
export interface GhidCuCategorie extends Ghid {
  categorie: { slug: string; titlu: string };
  /** Grupul din care face parte, pentru rezultatele căutării. */
  grup: string;
}

export const TOATE_GHIDURILE: GhidCuCategorie[] = CATEGORII_AJUTOR.flatMap((c) =>
  c.grupuri.flatMap((gr) =>
    gr.ghiduri.map((g) => ({
      ...g,
      categorie: { slug: c.slug, titlu: c.titlu },
      grup: gr.titlu,
    })),
  ),
);

/** Câte ghiduri are o categorie, pentru cardul din pagina de start. */
export function numaraGhiduri(c: CategorieAjutor): number {
  return ghidurileCategoriei(c).length;
}

/**
 * Capturile care încă n-au fișier.
 *
 * ⚠ E lista de lucru pentru cine face capturile. O întoarce codul, deci nu poate
 * rămâne în urmă: o captură pusă azi dispare de aici azi. Numărul ei se scrie în
 * mesajul unei probe, ca să se vadă cât a mai rămas.
 */
export function capturiLipsa(): { ghid: string; pas: number; alt: string }[] {
  const lipsa: { ghid: string; pas: number; alt: string }[] = [];
  for (const g of TOATE_GHIDURILE) {
    g.pasi.forEach((pas, i) => {
      const c = capturaPasului(pas);
      if (c && !c.src) {
        lipsa.push({ ghid: `${g.categorie.slug}/${g.slug}`, pas: i + 1, alt: c.alt });
      }
    });
  }
  return lipsa;
}

/*
  Textele paginii stau in `ajutor-texte.ts` si se re-exporta de aici, ca importul
  sa ramana unul singur pentru cine are nevoie si de date, si de texte.

  ⚠ Componentele de CLIENT trebuie sa le ia direct din `ajutor-texte`, nu de aici:
  prin fisierul asta vin si cele 406 de ghiduri.
*/
export * from "./ajutor-texte";
