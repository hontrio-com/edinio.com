import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AVERTISMENT_VS, LEGENDA_VS, TABELE_VS } from "./comparatii-vs";
import { CULORI_MARCI } from "./versus-culori";

test("fiecare platforma comparata are tabelul ei", () => {
  /* Cheia tabelului e chiar slug-ul din adresa. Una lipsa n-ar da nicio eroare
     la scris: pagina ar randa un tabel gol. */
  for (const cheie of Object.keys(CULORI_MARCI)) {
    if (cheie === "edinio") continue;
    const tabel = TABELE_VS[cheie as keyof typeof TABELE_VS];
    assert.ok(tabel, `lipseste tabelul pentru ${cheie}`);
    assert.ok(tabel.randuri.length >= 10, `${cheie}: doar ${tabel.randuri.length} randuri`);
    assert.ok(tabel.intro.length > 40, `${cheie}: randul de deschidere e prea scurt`);
    assert.ok(tabel.coloanaRival.length > 0);
  }
});

test("niciun rand nu compara altceva decat acelasi lucru", () => {
  /*
    ⚠ PROBA DE PUBLICITATE COMPARATIVA, nu de desen.

    Un tabel care ne pune langa concurenti NUMITI intra sub reguli: fiecare
    afirmatie trebuie sa compare ACEEASI caracteristica la amandoua platformele.
    Un rand cu o celula goala compara ceva cu nimic — si asta e chiar felul de
    scapare care nu se vede la citit, fiindca randul arata intreg pe ecran.
  */
  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    for (const rand of tabel.randuri) {
      assert.ok(rand.criteriu.trim().length > 5, `${cheie}: criteriu prea scurt`);
      assert.notEqual(rand.edinio, "", `${cheie} / ${rand.criteriu}: celula noastra goala`);
      assert.notEqual(rand.rival, "", `${cheie} / ${rand.criteriu}: celula lor goala`);
      assert.ok(
        typeof rand.edinio === "boolean" || rand.edinio.length > 0,
        `${cheie} / ${rand.criteriu}: valoare fara continut`,
      );
    }
  }
});

test("tabelele isi pastreaza randurile in care noi stam mai prost", () => {
  /*
    ⚠ CEA MAI IMPORTANTA PROBA DIN FISIER.

    Controlul asupra codului sursa, ecosistemul de extensii, customizarea foarte
    avansata — la astea concurentii stau mai bine, si asa scrie in PDF-ul
    clientului. Un tabel din care dispar n-ar mai fi o comparatie, ar fi o
    reclama, si ar cadea la prima verificare.

    Numerele de mai jos sunt CATE ERAU IN PDF, numarate cand s-a facut extragerea.
    Proba nu cere sa fie multe: cere sa NU SCADA. Cine sterge un rand incomod, il
    sterge sub ochii probei.

    ⚠ CARTUM ARE ZERO, si nu fiindca s-a sters ceva: asa vine din PDF. Din
    unsprezece randuri, opt sunt in favoarea noastra, doua sunt la fel la
    amandoua, iar la trial noi dam 15 zile fata de 7. E singurul tabel in care
    concurentul nu castiga niciodata — semnalat clientului (14.08), fiindca un
    tabel comparativ in care celalalt nu castiga nimic se citeste a reclama, nu a
    comparatie, iar Cartum e concurent direct pe aceeasi piata. Daca se adauga un
    rand, numarul de aici urca.
  */
  const MINIM_IN_FAVOAREA_LOR: Record<string, number> = {
    shopify: 2,
    cartum: 0,
    wix: 1,
    woocommerce: 2,
    opencart: 2,
    magento: 5,
  };

  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    const inFavoareaLor = tabel.randuri.filter(
      (r) => r.edinio === false || (r.rival === true && r.edinio !== true),
    );
    assert.ok(
      inFavoareaLor.length >= MINIM_IN_FAVOAREA_LOR[cheie],
      `${cheie}: ${inFavoareaLor.length} randuri in favoarea lor, erau ${MINIM_IN_FAVOAREA_LOR[cheie]} in PDF — s-a sters un rand incomod?`,
    );
  }
});

test("editia comparata e spusa acolo unde conteaza", () => {
  /* OpenCart si Magento au si editii comerciale. Aceleasi randuri ar fi
     neadevarate despre alea, deci editia trebuie numita — si in capul coloanei,
     si in randul de deschidere. */
  for (const cheie of ["opencart", "magento"] as const) {
    const tabel = TABELE_VS[cheie];
    assert.match(tabel.coloanaRival, /Open Source/, `${cheie}: capul coloanei nu spune editia`);
    assert.match(tabel.intro, /Open Source/, `${cheie}: deschiderea nu spune editia`);
  }
});

test("legenda si avertismentul exista si spun ce trebuie", () => {
  assert.ok(LEGENDA_VS.da.length > 10);
  assert.ok(LEGENDA_VS.nu.length > 40, "explicatia lui X e cea care tine tabelul onest");
  /* ⚠ Avertismentul nu e de politete: tabelul spune lucruri despre firme straine,
     iar ce ofera ele se schimba fara sa ne anunte. */
  assert.match(AVERTISMENT_VS, /se pot modifica/);
});
