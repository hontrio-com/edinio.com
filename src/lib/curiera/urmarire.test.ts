import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { EvenimentCuriera, StareCuriera } from "./client";
import { evenimenteDeSemnalat } from "./statusuri";
import {
  alarmaMagazinului,
  citesteStarea,
  galeataGoala,
  semnalareCuriera,
  trebuieSpus,
  type Citire,
} from "./urmarire";

/*
 * Regulile cronului `curiera-tracking`, pe purtare. Ruta le cheama; cablarea ei o apara
 * `src/app/api/cron/curiera-isi-urmareste-coletul.test.ts`.
 */

const stare = (p: Partial<StareCuriera>): StareCuriera => ({
  cerut: "710915533", no: "710915533", status: "in_curs", cod: "", numeCod: "", data: null, locatie: "", ...p,
});

function cunoscuta(c: Citire): Extract<Citire, { fel: "stare" }> {
  assert.equal(c.fel, "stare", "intrarea trebuia sa fie o stare");
  return c as Extract<Citire, { fel: "stare" }>;
}

const ev = (tip: string, data: number, status = "", cod = "", descriere = ""): EvenimentCuriera =>
  ({ tip, status, cod, descriere, locatie: "", data });

describe("citirea unei intrari din lot", () => {
  test("⚠⚠ AWB necunoscut vine GOL, nu lipseste: e necunoscut, nu stare", () => {
    /* Masurat: `{no: "", status: "", code: "", date: 0, request_no: "999999"}` cu `status: "done"`. */
    assert.deepEqual(citesteStarea(stare({ cerut: "999999", no: "", status: "", data: 0 }), null), { fel: "necunoscut" });
    assert.deepEqual(citesteStarea(stare({ no: "", status: "in_curs" }), null), { fel: "necunoscut" },
      "numarul gol hotaraste, oricat de plauzibila ar parea starea");
    assert.deepEqual(citesteStarea(stare({ status: "" }), "in_curs"), { fel: "necunoscut" });
    assert.deepEqual(citesteStarea(undefined, "in_curs"), { fel: "necunoscut" }, "neintors = necunoscut");
  });

  test("cheia e `stare|cod`, in forma romaneasca, si se compara normalizat", () => {
    const c = cunoscuta(citesteStarea(stare({ status: "notified", cod: "A2", numeCod: "Nu raspunde la telefon" }), null));
    assert.equal(c.cheie, "avizat|A2");
    assert.equal(c.status, "avizat");
    assert.equal(c.schimbata, true, "fata de nimic scris e o schimbare");
    assert.equal(c.eticheta, "Livrare nereusita, urmeaza o noua incercare (Nu raspunde la telefon)");

    assert.equal(cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A2" }), "avizat|A2")).schimbata, false);
    assert.equal(cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A2" }), " AVIZAT|a2 ")).schimbata, false);
    assert.equal(cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A3" }), "avizat|A2")).schimbata, true,
      "un motiv nou al aceleiasi livrari esuate e un eveniment nou");
  });

  test("⚠ istoricul se cere doar la schimbare, si niciodata pentru neridicat / initial", () => {
    assert.equal(cunoscuta(citesteStarea(stare({ status: "in_curs" }), "neridicat")).cereIstoric, true,
      "un avizat pierdut intre doua treceri se afla doar din istoric");
    assert.equal(cunoscuta(citesteStarea(stare({ status: "in_curs" }), "in_curs")).cereIstoric, false);
    for (const s of ["neridicat", "uncollected", "initial", "draft"]) {
      assert.equal(cunoscuta(citesteStarea(stare({ status: s }), null)).cereIstoric, false,
        `${s} vine la emitere: fiecare AWB nou ar costa un apel degeaba`);
    }
  });

  test("⚠⚠ aceeasi cheie la alta clipa cere istoricul: a doua livrare esuata cu acelasi motiv", () => {
    /* avizat|A2 (spus) -> in_curs -> avizat|A2 intre doua treceri: cheia e la fel, clipa nu. */
    const salvat = "2026-09-29T08:00:00+00:00"; /* forma in care o intoarce baza */
    const aceeasi = Date.parse(salvat) / 1000;
    const c = cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A2", data: aceeasi + 3600 }), "avizat|A2", salvat));
    assert.equal(c.schimbata, false);
    assert.equal(c.cereIstoric, true);
    assert.equal(cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A2", data: aceeasi }), "avizat|A2", salvat)).cereIstoric, false,
      "aceeasi clipa nu cere nimic: altfel fiecare trecere ar costa un apel");
    assert.equal(cunoscuta(citesteStarea(stare({ status: "neridicat", data: aceeasi + 60 }), "neridicat", salvat)).cereIstoric, false,
      "neridicat nu cere istoric nici la clipa noua");
  });

  test("starea necunoscuta ramane bruta, ca sa se poata strange pe nume", () => {
    const c = cunoscuta(citesteStarea(stare({ status: "in_depozit", cod: "X" }), null));
    assert.equal(c.status, null);
    assert.equal(c.brut, "in_depozit");
    assert.equal(c.cheie, "in_depozit|X");
  });

  test("data vine in SECUNDE; 0 inseamna lipsa", () => {
    assert.equal(cunoscuta(citesteStarea(stare({ data: 1727600000 }), null)).la, new Date(1727600000 * 1000).toISOString());
    assert.equal(cunoscuta(citesteStarea(stare({ data: null }), null)).la, null);
  });
});

describe("ce se spune omului", () => {
  const avizat = cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A2" }), "in_curs"));
  const avizatVechi = cunoscuta(citesteStarea(stare({ status: "avizat", cod: "A2" }), "avizat|A2"));
  const inCurs = cunoscuta(citesteStarea(stare({ status: "in_curs" }), "avizat|A2"));

  test("⚠⚠ cu istoricul citit, hotarasc evenimentele NESPUSE, nu starea curenta", () => {
    /* Starea curenta e deja printre evenimente; strigata si separat, ar veni de doua ori. */
    assert.equal(trebuieSpus(avizat, []), false, "totul era deja spus");
    assert.equal(trebuieSpus(inCurs, [ev("StatusChanged:avizat", 4, "avizat")]), true,
      "avizatul pierdut sub un in_curs se spune, desi starea curenta nu cere atentie");
  });

  test("⚠ istoricul picat cade pe starea curenta, doar daca cere atentie SI e noua", () => {
    assert.equal(trebuieSpus(avizat, null), true);
    assert.equal(trebuieSpus(avizatVechi, null), false, "aceeasi stare s-ar striga la fiecare doua ore");
    assert.equal(trebuieSpus(inCurs, null), false);
  });

  test("istoricul trecut prin memorie: a doua trecere nu mai spune nimic", () => {
    const istoric = [
      ev("StatusChanged:in_curs", 3, "in_curs"),
      ev("StatusChanged:avizat", 4, "avizat"),
      ev("StatusChanged:in_curs", 6, "in_curs"),
    ];
    const prima = evenimenteDeSemnalat(istoric, null);
    assert.equal(trebuieSpus(inCurs, prima.noi), true);
    assert.equal(trebuieSpus(inCurs, evenimenteDeSemnalat(istoric, prima.memorie).noi), false);
  });

  test("returul spune ca banii nu s-au incasat, si decizia e a lui", () => {
    const r = semnalareCuriera({ orderNumber: "1001", awb: "710915533", cheie: "returnat|RET", eticheta: "Colet returnat expeditorului", evenimente: null });
    assert.equal(r.titlu, "Colet Curiera returnat");
    assert.match(r.mesaj, /^Comanda 1001: coletul 710915533 se intoarce la tine \(Colet returnat expeditorului\)/);
    assert.match(r.mesaj, /rambursul NU s-a incasat/);
  });

  test("⚠ anularea vazuta de cron s-a facut din contul Curiera, si mesajul o spune", () => {
    const r = semnalareCuriera({ orderNumber: null, awb: "7", cheie: "anulat", eticheta: "AWB anulat", evenimente: null });
    assert.equal(r.titlu, "AWB Curiera anulat");
    assert.match(r.mesaj, /^O comanda: AWB-ul 7 a fost anulat la Curiera/);
    assert.doesNotMatch(r.mesaj, /nu din Edinio/, "anularea poate fi chiar a noastra, cu raspunsul pierdut");
    assert.match(r.mesaj, /Anuleaza AWB/);
  });

  test("notificarea duce la istoricul real, pe pagina lor de urmarire", () => {
    /* Panoul arata doar ultima stare: „deschide comanda pentru istoric" ar fi trimis omul in gol. */
    const r = semnalareCuriera({ orderNumber: "#0001", awb: "710915533", cheie: "avizat|A2", eticheta: "x", evenimente: null });
    assert.match(r.mesaj, /Istoricul complet: https:\/\/app\.curiera\.ro\/cscourier\/Main\?tracking=true&appcont=4416&awbno=710915533/);
  });

  test("O SINGURA notificare, cu toate evenimentele noi, pe limba omului", () => {
    const r = semnalareCuriera({
      orderNumber: "1002", awb: "8", cheie: "in_curs", eticheta: "In curs de livrare",
      evenimente: [
        ev("StatusChanged:avizat", 4, "avizat", "", "Destinatarul nu a raspuns"),
        ev("CodeChanged:A2", 5, "avizat", "A2", "Nu raspunde la telefon"),
      ],
    });
    assert.equal(r.titlu, "Expediere Curiera care cere atentie");
    assert.match(r.mesaj, /are 2 evenimente care cer o decizie: Destinatarul nu a raspuns; Nu raspunde la telefon \(A2\)\./);

    const unul = semnalareCuriera({ orderNumber: "1003", awb: "9", cheie: "exceptie|X", eticheta: "Exceptie la Curiera (X)", evenimente: null });
    assert.match(unul.mesaj, /are un eveniment care cere o decizie: Exceptie la Curiera \(X\)\./);
  });
});

describe("alarma magazinului", () => {
  /* Pragurile cronului: vezi `MIN_*_ALARMA` din curiera-tracking/route.ts. */
  const PRAGURI = { autentificare: 1, refuz: 1, esecuri: 3, necunoscute: 1 };
  const g = (p: Partial<ReturnType<typeof galeataGoala>>) => ({ ...galeataGoala(), ...p });

  test("⚠⚠ numai BAD_LOGIN primeste „verifica cheia”, si e critica", () => {
    const a = alarmaMagazinului(g({ autentificare: 3 }), PRAGURI);
    assert.equal(a?.severity, "critical");
    assert.match(a!.mesaj, /BAD_LOGIN/);
    assert.match(a!.mesaj, /Verifica cheia din configurarea Curiera/);
  });

  test("⚠⚠ o cadere la ei spune sa NU se schimbe cheia, si nu e critica", () => {
    for (const galeata of [g({ indisponibil: 3, exemplu: "timeout" }), g({ refuz: 2, indisponibil: 1, exemplu: "x" })]) {
      const a = alarmaMagazinului(galeata, PRAGURI);
      assert.equal(a?.severity, "warning");
      assert.match(a!.mesaj, /NU din cauza cheii/);
      assert.match(a!.mesaj, /nu schimba cheia/);
      assert.doesNotMatch(a!.mesaj, /Verifica cheia/, "sfatul gresit l-ar trimite sa strice o cheie buna");
    }
  });

  test("⚠⚠ un magazin mic isi primeste alarma: BAD_LOGIN si AWB-urile necunoscute alarmeaza de la primul", () => {
    /* La Curiera amandoua sunt deterministe (un apel acopera tot magazinul; un AWB e cunoscut
       din clipa emiterii, masurat). Cu praguri de 3 si 5, un magazin cu 1-2 colete tacea mereu. */
    assert.equal(alarmaMagazinului(g({ autentificare: 1 }), PRAGURI)?.fel, "autentificare");
    assert.match(alarmaMagazinului(g({ necunoscute: 1 }), PRAGURI)!.mesaj, /altui cont/);
  });

  test("⚠ un refuz care nu e BAD_LOGIN alarmeaza si el de la primul, fara sfatul de cheie", () => {
    const a = alarmaMagazinului(g({ refuz: 1, exemplu: "FORBIDDEN" }), PRAGURI);
    assert.equal(a?.severity, "warning");
    assert.match(a!.mesaj, /nu schimba cheia/);
  });

  test("⚠ caderile trecatoare au prag, iar macar o reusita opreste orice alarma", () => {
    assert.equal(alarmaMagazinului(g({ indisponibil: 2, exemplu: "x" }), PRAGURI), null);
    assert.equal(alarmaMagazinului(g({ necunoscute: 3, reusite: 1 }), PRAGURI), null);
    assert.equal(alarmaMagazinului(g({ autentificare: 9, reusite: 1 }), PRAGURI), null);
    assert.equal(alarmaMagazinului(g({}), PRAGURI), null);
  });

  test("autentificarea are intaietate cand galetile se umplu deodata", () => {
    assert.equal(alarmaMagazinului(g({ autentificare: 3, indisponibil: 5, necunoscute: 9 }), PRAGURI)?.fel, "autentificare");
  });
});
