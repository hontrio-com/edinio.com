import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

/*
 * O grila de campuri nu se impune pe telefon, si niciun copil nu cere o pista
 * care nu exista sub prag.
 *
 * ═══ CE S-A MASURAT, PE 14.09.2026 ═══
 *
 * 49 de grile fara prag in 20 de panouri de curier. Citite una cate una, doar
 * 27 erau defecte: perechi de campuri cu eticheta, care la 360px lasau ~158px
 * de camp si rupeau eticheta pe trei randuri. Celelalte 22 raman DINADINS:
 * triplete de dimensiuni, perechi de butoane, continut scurt.
 *
 * ⚠ Tiparul de masurare a fost `grid-cols-[23]`, deci prin constructie n-avea
 * cum sa vada `WootAwbModal` cu patru coloane: ~75px de camp, mai rau decat
 * tot ce repara lotul. Un numar care iese dintr-un tipar nu e populatia, e
 * umbra tiparului.
 *
 * ═══ REGULA PE CARE O APARA PLASA ═══
 *
 * Nu „cele 27 de locuri au primit `sm:`". Aia ar fi cablarea. Regula e:
 *
 *   1. in panourile de curier NU exista grile de doua coloane fara prag, in
 *      afara celor din harta de mai jos, fiecare cu motivul ei scris;
 *   2. niciun copil nu poarta `col-span-` fara prag decat sub o grila cu numar
 *      FIX de coloane.
 *
 * Mutantul cade pe autorul urmator, nu pe randurile reparate: cine scrie maine
 * inca o grila de doua coloane fara prag intr-un panou de curier face harta sa
 * difere, si proba pica numind fisierul. La fel si cine sterge un `sm:` dintr-un
 * loc reparat.
 *
 * ═══ ⚠ DE CE PLASA CERE SI LIPSA LUI `sm:grid-cols` PE ACELASI RAND ═══
 *
 * Dupa reparatie, grila de patru se scrie `grid grid-cols-2 gap-2
 * sm:grid-cols-4`, care CONTINE sirul `grid grid-cols-2 gap`. O plasa pe
 * subsir ar fi numarat-o drept nepragata si ar fi picat pe cod BUN. E aceeasi
 * capcana ca `NUcargus_awb_number` care contine `cargus_awb_number`.
 *
 * ═══ ⚠ DEFECTUL VIU PE CARE REGULA L-A GASIT, IAR TIPARUL NU ═══
 *
 * `ColeteConfigClient:272` avea grila deja pragata corect, dar copilul de la
 * `:273` purta `col-span-2` gol. Sub prag, grila are o singura pista si copilul
 * cere doua: grila o creeaza implicit, „Strada" se intinde pe ea si „Numar"
 * ramane dedesubt in prima coloana. Fisierul nu era in lotul masurat. A iesit
 * rationand despre regula, nu cautand forma.
 *
 * Daca cineva intoarce acel `sm:`, harta de copii capata inapoi intrarea si
 * proba pica. De aia a doua harta exista separat de prima.
 */

const PANOURI = "src/components/dashboard";

const CURIERI = [
  "Cargus", "Colete", "Gls", "Packeta", "Ups", "Woot", "Pallex", "Shipo",
  "Ecolet", "Dhl", "Fedex", "Posta", "Sameday", "Dpd", "FanCourier",
  "Innoship", "Smartship",
];

function panouriDeCurier(): string[] {
  return readdirSync(PANOURI)
    .filter((f) => f.endsWith(".tsx") && CURIERI.some((c) => f.startsWith(c)))
    .sort();
}

function sursa(fisier: string): string {
  return readFileSync(join(PANOURI, fisier), "utf8");
}

/** Numara aparitiile, pe fisier. Fisierele cu zero nu intra in harta. */
function harta(cateIntr: (text: string) => number): Record<string, number> {
  const h: Record<string, number> = {};
  for (const f of panouriDeCurier()) {
    const n = cateIntr(sursa(f));
    if (n > 0) h[f] = n;
  }
  return h;
}

/*
 * ⚠ Se cere si `!rand.includes("sm:grid-cols")`, altfel grila de patru
 *   reparata ar fi numarata drept nepragata. Vezi capcana de mai sus.
 */
function grileDeDouaFaraPrag(text: string): number {
  return text
    .split("\n")
    .filter((r) => r.includes("grid grid-cols-2 gap") && !r.includes("sm:grid-cols"))
    .length;
}

/*
 * `col-span-` care NU e precedat de doua puncte. Asa, `sm:col-span-4` nu intra,
 * dar `col-span-2` din `col-span-2 sm:col-span-4` intra - si trebuie sa intre:
 * acela e chiar intinderea ceruta sub prag, pe grila de doua coloane.
 */
function copiiFaraPrag(text: string): number {
  return (text.match(/(^|[^:])col-span-\d/g) ?? []).length;
}

/*
 * Cele noua grile de doua coloane care RAMAN fara prag, cu motivul fiecareia.
 * Nu sunt scapari: sunt locuri unde stivuirea ar innrautati panoul.
 */
const GRILE_CARE_RAMAN: Record<string, number> = {
  "CargusAwbModal.tsx": 1,        // Descarca A4 / Descarca A6, doua butoane scurte
  "ColeteAwbModal.tsx": 1,        // Format A4 / Format A6, la fel
  "DpdAwbModal.tsx": 1,           // Descarca A4 / Descarca A6, la fel
  "InnoshipConfigClient.tsx": 1,  // Format eticheta / Tip fisier: A4, ZPL, EPL
  "PostaConfigClient.tsx": 2,     // plaja de coduri, si expeditorul propriu cu sase copii col-span-2
  "ShipoAwbModal.tsx": 1,         // Greutate / Colete, doua numere scurte
  "WootAwbModal.tsx": 1,          // Pachet / Plic, doua butoane
  "WootConfigClient.tsx": 1,      // Firma / Persoana fizica, doua butoane
};

/*
 * Copiii care RAMAN fara prag, fiindca parintele lor are numar FIX de coloane
 * si atunci `col-span-` nu poate cere o pista inexistenta.
 */
const COPII_CARE_RAMAN: Record<string, number> = {
  "ColeteAwbModal.tsx": 1,     // :349, sub `grid grid-cols-3` fix (strada pe doua treimi)
  "PostaConfigClient.tsx": 6,  // sub cele doua grile de mai sus, fixe la doua coloane
  "WootAwbModal.tsx": 1,       // `col-span-2` din `col-span-2 sm:col-span-4`: intinderea sub prag
};

test("nicio grila de doua coloane fara prag in panourile de curier, in afara celor noua numite", () => {
  assert.deepEqual(
    harta(grileDeDouaFaraPrag),
    GRILE_CARE_RAMAN,
    "O grila de campuri fara prag se impune pe telefon. Daca ai adaugat una,"
      + " scrie `grid grid-cols-1 gap-N sm:grid-cols-2` ca restul casei."
      + " Daca ai sters un `sm:` dintr-un loc reparat pe 14.09, pune-l inapoi.",
  );
});

test("niciun `col-span-` fara prag sub o grila care are o singura coloana pe telefon", () => {
  assert.deepEqual(
    harta(copiiFaraPrag),
    COPII_CARE_RAMAN,
    "`col-span-2` intr-o grila de o coloana NU da latime intreaga: cere doua"
      + " piste si grila creeaza a doua coloana implicita. Exact asa era stricat"
      + " `ColeteConfigClient:273`. Sub o grila pragata, scrie `sm:col-span-N`.",
  );
});

/*
 * Harta de mai sus nu poate vedea intoarcerea asta: daca grila se face la loc
 * `grid grid-cols-4 gap-2`, randul inceteaza sa mai contina `grid grid-cols-2
 * gap`, deci numarul din harta nu se misca. De aceea locul se numeste aici.
 */
test("cele patru dimensiuni din WootAwbModal stau doua cate doua pe telefon", () => {
  const text = sursa("WootAwbModal.tsx");
  assert.match(
    text,
    /className="grid grid-cols-2 gap-2 sm:grid-cols-4"/,
    "La 360px, patru coloane lasau ~75px sub o eticheta `Inaltime (cm)`.",
  );
  assert.match(
    text,
    /className="col-span-2 sm:col-span-4 /,
    "Nota de greutate trebuie sa se intinda pe tot randul in AMANDOUA asezarile.",
  );
});

/*
 * `ColeteConfigClient` nu e in harta de copii fiindca are ZERO. Proba de mai
 * sus ar prinde intoarcerea, dar cu un mesaj despre o harta, nu despre defect.
 * Aici cade cu numele locului.
 */
test("Strada din ColeteConfigClient nu mai cere o a doua coloana pe telefon", () => {
  const text = sursa("ColeteConfigClient.tsx");
  assert.match(
    text,
    /<Field label="Strada" required className="sm:col-span-2">/,
    "Grila lui de la :272 e `grid-cols-1 ... sm:grid-cols-3`: o singura pista"
      + " sub prag. Cu `col-span-2` gol, Strada forta o a doua coloana si"
      + " Numar ramanea dedesubt, singur, in prima.",
  );
});
