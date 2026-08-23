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
 * Centrul de ajutor Edinio: 453 de ghiduri, în nouă categorii.
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
 * ⚠ Semnele de exclamare și liniuțele DIN GHILIMELE sunt îngăduite, și proba le
 * lasă să treacă. Sunt citate din interfață: butonul chiar scrie „Copiat!”, iar
 * contorul chiar scrie „1–50 din 320 clienți”. Regula 7, care cere denumirile
 * exacte, bate aici regula 15. Un ghid care „îndreaptă” textul unui buton trimite
 * omul să caute altceva decât scrie pe ecran.
 *
 * ═══ DE CE UN FIȘIER PE CATEGORIE ═══
 *
 * 453 de ghiduri într-un singur fișier înseamnă vreo 400KB pe care nimeni nu-i
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
  prin fisierul asta vin si cele 531 de ghiduri.
*/
export * from "./ajutor-texte";
