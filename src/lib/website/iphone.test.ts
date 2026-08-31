import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUTOANE_IPHONE,
  CORP_MM,
  ECRAN_MM,
  RAMA,
  RAPORT_CORP,
  RAPORT_ECRAN,
  RAZA_CORP,
  RAZA_ECRAN,
} from "./iphone";

/*
 * Clientul a cerut un mockup „1 la 1 cu realitatea". Ce se poate proba din afara
 * unui browser nu e cum ARATĂ, ci dacă numerele se potrivesc ÎNTRE ELE — iar
 * potrivirea e chiar ce face desenul să pară un aparat și nu un dreptunghi
 * rotunjit.
 *
 * Trei lucruri se pot desincroniza tăcut, și toate trei se văd:
 *   - rama plus ecranul plus rama nu mai fac exact corpul;
 *   - razele colțurilor nu mai sunt concentrice;
 *   - fracțiile din CSS nu mai sunt cele de aici.
 */

const AICI = dirname(fileURLToPath(import.meta.url));
/*
  ⚠ `stil-comun.css`, NU `globals.css`. Pe 31.08.2026 foaia unica s-a despartit
  in doua — `globals.css` pentru panou si magazine, `website.css` pentru site-ul
  de prezentare — iar regulile scrise de mana, printre care si `.iphone`, s-au
  mutat in fisierul pe care il importa amandoua. `globals.css` mai are acum doar
  cele trei importuri.

  Proba asta a cazut la mutare, si bine a facut: fara ea, `.iphone` ar fi putut
  ramane in urma fara sa se vada.
*/
const CSS = join(AICI, "..", "..", "app", "stil-comun.css");

test("rama plus ecranul plus rama fac exact corpul", () => {
  /* Pe orizontală, prin construcție. */
  assert.ok(Math.abs(2 * RAMA + ECRAN_MM.latime / CORP_MM.latime - 1) < 1e-9);

  /*
    Pe VERTICALĂ nu e prin construcție, și tocmai de aia merită probat: rama iese
    din lățimi, dar trebuie să încapă și pe înălțime. La aparatul adevărat e
    aceeași de jur împrejur — dacă ar ieși altfel, ori cifrele de corp sunt
    greșite, ori aparatul chiar are ramă inegală și desenul trebuie schimbat.
  */
  const ramaVerticalaMm = (CORP_MM.inaltime - ECRAN_MM.inaltime) / 2;
  const ramaOrizontalaMm = (CORP_MM.latime - ECRAN_MM.latime) / 2;
  assert.ok(
    Math.abs(ramaVerticalaMm - ramaOrizontalaMm) < 0.06,
    `ramă inegală: ${ramaVerticalaMm.toFixed(3)}mm sus, ${ramaOrizontalaMm.toFixed(3)}mm lateral`,
  );
});

test("colțurile sunt concentrice", () => {
  /* Asta E definiția: raza exterioară minus distanța dintre ele dă raza
     interioară. Aceeași regulă ca la cardurile de pe pagina de start. */
  assert.ok(Math.abs(RAZA_CORP - RAZA_ECRAN - RAMA) < 1e-9);
  /* Și niciuna nu poate depăși jumătate din latura scurtă, altfel colțul nu mai
     e colț, ci o pastilă. */
  assert.ok(RAZA_CORP < 0.5);
});

test("raporturile sunt cele ale aparatului", () => {
  /* Ecranul: 2868 / 1320. */
  assert.ok(Math.abs(RAPORT_ECRAN - 2868 / 1320) < 0.002, `ecran ${RAPORT_ECRAN}`);
  /* Corpul: 163,4 / 78,0. */
  assert.ok(Math.abs(RAPORT_CORP - 2.0949) < 0.001, `corp ${RAPORT_CORP}`);
  /* Iar corpul e mereu mai puțin alungit decât ecranul: rama adaugă la fel de
     mult de jur împrejur, deci proporțional mai mult pe latura scurtă. */
  assert.ok(RAPORT_CORP < RAPORT_ECRAN);
});

test("CSS-ul folosește chiar fracțiile de aici", () => {
  /*
    ⚠ Numerele trăiesc în două locuri: aici, ca să poată fi probate, și în
    `globals.css`, ca să deseneze. Proba asta e tot ce le ține împreună — fără
    ea, cineva ar putea schimba rama într-un loc, iar în celălalt ar rămâne
    ecranul de altă mărime, fără ca nimic să se plângă.
  */
  const css = readFileSync(CSS, "utf8");
  const bloc = css.slice(css.indexOf(".iphone {"), css.indexOf(".iphone-ecran {"));

  const scrisInCss = (nume: string): number => {
    const gasit = new RegExp(`--${nume}:\\s*([0-9.]+)`).exec(bloc);
    assert.ok(gasit, `\`--${nume}\` lipsește din \`.iphone\``);
    return Number(gasit[1]);
  };

  /* Patru zecimale: atât se scrie în CSS, și e destul — la un aparat desenat la
     190px, o zecime de procent înseamnă o cincime de pixel. */
  assert.ok(Math.abs(scrisInCss("rama") - RAMA) < 5e-5, "rama diferă de CSS");
  assert.ok(Math.abs(scrisInCss("raza-corp") - RAZA_CORP) < 5e-5, "raza corpului diferă");
  assert.ok(Math.abs(scrisInCss("raza-ecran") - RAZA_ECRAN) < 5e-5, "raza ecranului diferă");

  /* Și raportul corpului, scris ca `aspect-ratio`. */
  const raport = /aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/.exec(bloc);
  assert.ok(raport, "`aspect-ratio` lipsește din `.iphone`");
  assert.ok(
    Math.abs(Number(raport[2]) / Number(raport[1]) - RAPORT_CORP) < 0.001,
    `aspect-ratio ${raport[1]}/${raport[2]} nu e raportul corpului`,
  );
});

test("butoanele stau pe aparat, nu pe lângă el", () => {
  for (const b of BUTOANE_IPHONE) {
    assert.ok(b.sus > RAZA_CORP / RAPORT_CORP, `un buton urcă în colțul de sus`);
    assert.ok(
      b.sus + b.lungime < 1 - RAZA_CORP / RAPORT_CORP,
      "un buton coboară în colțul de jos",
    );
  }
  /* Și nu se suprapun între ele, pe aceeași parte. */
  for (const parte of ["stanga", "dreapta"] as const) {
    const aleParte = BUTOANE_IPHONE.filter((b) => b.parte === parte).sort(
      (a, b) => a.sus - b.sus,
    );
    for (let i = 1; i < aleParte.length; i++) {
      assert.ok(
        aleParte[i].sus > aleParte[i - 1].sus + aleParte[i - 1].lungime,
        `două butoane se suprapun pe ${parte}`,
      );
    }
  }
});
