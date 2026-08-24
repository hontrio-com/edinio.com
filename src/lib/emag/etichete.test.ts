import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { BLOC_PREGATIRE_PUBLICARE, BUTON_ADU_OFERTELE, BUTON_ADU_OFERTELE_SCURT } from "./etichete";
import { ceLipsestePentruPublicare } from "./sync";
import { rutaDeTrimitere } from "./rute";
import { mesajOmenesc } from "./errors";

/*
 * ═══ UN MESAJ CARE NUMEȘTE UN BUTON TREBUIE SĂ NUMEASCĂ UN BUTON CARE EXISTĂ ═══
 *
 * Aceeași greșeală de două ori în două zile:
 *
 *   23.08  „Alege cota de TVA … în setările integrării” — în setări nu exista niciun
 *          câmp pentru TVA. Drum înfundat, publicarea blocată, fără ieșire.
 *   24.08  „Apasă «Importă din eMAG»” — butonul se numește „Adu ofertele”. A întrebat
 *          comerciantul: „nu există buton cu «Importă din eMag», eu îl văd doar pe
 *          ăsta cu «Adu ofertele»”.
 *
 * De două ori înseamnă că nu e o scăpare, ci o gaură: mesajul și butonul stăteau în
 * fișiere diferite, fără nimic care să le țină legate. Probele de aici sunt legătura.
 *
 * ⚠ Ele NU verifică o formulare frumoasă. Verifică un singur lucru, verificabil:
 * numele rostit de mesaj e chiar numele scris pe ecran.
 */

const ECRANE = [
  "src/components/dashboard/EmagClient.tsx",
  "src/components/dashboard/EmagPregatirePublicare.tsx",
];

const CONFIG_FARA_CATALOG = {
  connected: true, username: "u", password: "p", vat_id: 1, handling_time: 1,
} as const;

test("eMAG etichete: mesajul care cere citirea catalogului numește butonul adevărat", () => {
  const m = ceLipsestePentruPublicare({ ...CONFIG_FARA_CATALOG });
  assert.ok(m, "fără catalog citit, trebuie să lipsească ceva");
  assert.ok(
    m.includes(BUTON_ADU_OFERTELE),
    `mesajul trimite la un buton care nu există: ${m}`,
  );
});

test("eMAG etichete: motivul din rută numește butonul adevărat", () => {
  const r = rutaDeTrimitere({
    op: "oferta", existaLaEmag: false, autoSync: true, catalogCitit: false,
  });
  assert.equal(r.fel, "nimic");
  assert.ok((r.motiv ?? "").includes(BUTON_ADU_OFERTELE), r.motiv);
});

test("eMAG etichete: refuzul „ai deja produsul” numește butonul adevărat", () => {
  const m = mesajOmenesc("You already hold a Product associated with this PN:115228.");
  assert.ok(m.includes(BUTON_ADU_OFERTELE), m);
});

test("eMAG etichete: fața butonului e o bucată din titlu", () => {
  /* ⚠ Altfel titlul putea ajunge „Sincronizează” și butonul „Adu ofertele”, iar
     mesajul ar fi citat un nume pe care nu-l poartă niciunul. */
  assert.ok(
    BUTON_ADU_OFERTELE.includes(BUTON_ADU_OFERTELE_SCURT),
    `„${BUTON_ADU_OFERTELE_SCURT}” nu se regăsește în „${BUTON_ADU_OFERTELE}”`,
  );
});

test("eMAG etichete: ecranele NU rescriu numele de mână", () => {
  /*
   * ⚠ Proba care chiar închide gaura. Celelalte trec și dacă cineva scrie iar șirul
   * cu mâna în ecran — atunci constanta și ecranul spun același lucru azi, și se
   * despart la prima redenumire, tăcut.
   *
   * Aici se cere ca numele să apară în ecran DOAR ca `{CONSTANTA}`, niciodată ca text.
   */
  for (const cale of ECRANE) {
    const sursa = readFileSync(cale, "utf8");
    for (const nume of [BUTON_ADU_OFERTELE, BUTON_ADU_OFERTELE_SCURT, BLOC_PREGATIRE_PUBLICARE]) {
      assert.equal(
        sursa.includes(`"${nume}"`) || sursa.includes(`>${nume}<`) || sursa.includes(`\n          ${nume}\n`),
        false,
        `${cale} scrie „${nume}” de mână. Randează constanta din etichete.ts.`,
      );
    }
  }
});
