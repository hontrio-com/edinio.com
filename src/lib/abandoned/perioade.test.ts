import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PE_PAGINA, catePagini, fereastra, marginile } from "./perioade";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Doua defecte tacute: o fereastra gresita da cifre plauzibile, iar o margine
  gresita de paginare pierde sau dubleaza randuri fara sa dea vreo eroare.
*/

test("⚠ MARGINILE SUNT INCLUSIVE LA AMANDOUA CAPETELE, ca la PostgREST", () => {
  /*
    ⚠ Scrise ca la `slice`, fiecare pagina ar fi avut un rand in plus, iar
    ultimul rand al unei pagini ar fi fost si primul celei urmatoare. Nimic
    n-ar fi dat eroare: omul ar fi vazut acelasi cos de doua ori.
  */
  assert.deepEqual(marginile(1, 25), { de: 0, la: 24 });
  assert.deepEqual(marginile(2, 25), { de: 25, la: 49 });
  assert.deepEqual(marginile(3, 50), { de: 100, la: 149 });

  /* Paginile nu se suprapun si nu lasa goluri. */
  for (const pePagina of PE_PAGINA) {
    for (let p = 1; p < 6; p++) {
      const a = marginile(p, pePagina);
      const b = marginile(p + 1, pePagina);
      assert.equal(a.la - a.de + 1, pePagina, "pagina n-are cate randuri spune");
      assert.equal(b.de, a.la + 1, "intre pagini e un gol sau o suprapunere");
    }
  }
});

test("o pagina sub unu nu cere randuri negative", () => {
  assert.deepEqual(marginile(0, 25), { de: 0, la: 24 });
  assert.deepEqual(marginile(-3, 25), { de: 0, la: 24 });
});

test("numarul de pagini: zero randuri inseamna tot o pagina", () => {
  assert.equal(catePagini(0, 25), 1, "„pagina 1 din 0” n-are inteles");
  assert.equal(catePagini(25, 25), 1);
  assert.equal(catePagini(26, 25), 2);
  assert.equal(catePagini(430, 50), 9);
});

test("⚠ „LUNA ACEASTA” SE TAIE PE CEASUL ROMANESC, nu pe UTC", () => {
  /*
    ⚠ La 1 septembrie ora 01:30 in Romania, pe UTC e inca 31 august 22:30.
    Taiata pe UTC, luna ar fi inceput mai tarziu si un cos din noaptea de 1 ar
    fi cazut in luna trecuta - o cifra mai mica, plauzibila, si gresita.
  */
  const noapteaDe1 = new Date("2026-09-01T01:30:00+03:00");
  const f = fereastra("luna", noapteaDe1);
  assert.ok(f.deLa <= noapteaDe1, "inceputul lunii a cazut DUPA clipa masurata");

  const inRomania = new Date(f.deLa.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  assert.equal(inRomania.getDate(), 1, "luna nu incepe pe 1 in Romania");
  assert.equal(inRomania.getMonth(), 8, "luna taiata nu e septembrie");
  assert.equal(inRomania.getHours(), 0);
});

test("ferestrele de zile se numara inapoi de la clipa data", () => {
  const acum = new Date("2026-09-21T12:00:00Z");
  assert.equal(fereastra("7z", acum).deLa.toISOString(), "2026-09-14T12:00:00.000Z");
  assert.equal(fereastra("30z", acum).deLa.toISOString(), "2026-08-22T12:00:00.000Z");
  assert.equal(fereastra("tot", acum).deLa.getTime(), 0);
});

test("⚠ CAPATUL DE SUS E IN VIITOR, nu „acum”", () => {
  /*
    ⚠ Cu `panaLa = acum`, un cos scris cu o secunda in urma pe un ceas de baza
    care merge putin inainte ar fi cazut in afara ferestrei - adica tocmai
    cosul cel mai nou ar fi lipsit din numaratoare.
  */
  const acum = new Date("2026-09-21T12:00:00Z");
  assert.ok(fereastra("7z", acum).panaLa > acum);
});

test("fiecare perioada isi are eticheta ei, si nu se repeta", () => {
  const nume = (["7z", "30z", "90z", "luna", "tot"] as const).map((n) => fereastra(n).eticheta);
  assert.equal(new Set(nume).size, nume.length);
});

test("⚠ NICIO ETICHETA DE PE ECRAN NU-SI SPUNE SINGURA PERIOADA", () => {
  /*
    ⚠ DEFECTUL REPARAT, SI CUM SE INTOARCE. Pagina avea trei cifre despre trei
    ferestre diferite. Dupa ce a aparut selectorul, defectul s-a intors de doua
    ori in aceeasi zi, prin text scris de-a gata: bannerul zicea „luna aceasta"
    cu perioada pe 7 zile, iar cardul ratei avea subtitlul „luna aceasta" fix.
    Amandoua aratau cifra corecta sub o eticheta gresita - adica mai rau decat
    o cifra gresita, fiindca nimic nu parea in neregula.

    Proba cere ca orice pomenire de perioada de pe ecran sa vina din `data.perioada`.
  */
  const ecran = readFileSync(
    new URL("../../components/dashboard/AbandonedCartsClient.tsx", import.meta.url), "utf8",
  );
  /*
    Se sar comentariile (acolo se POVESTESTE despre defect) si trupul lui
    `rastimpul`, care e chiar SINGURUL loc unde perioadele au voie sa fie
    scrise in cuvinte: el e tabla de traducere, nu o eticheta ratacita.
  */
  const faraComentarii = ecran
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/function rastimpul[\s\S]*?\n}\n/, "");

  for (const scrisDeGata of [
    /sub="luna aceasta"/,
    /sub="ultimele/i,
    /recuperat luna aceasta/i,
    /abandonate luna aceasta/i,
    /ultimele \d+ (de )?zile/i,
  ]) {
    assert.doesNotMatch(faraComentarii, scrisDeGata, `perioada scrisa de-a gata: ${scrisDeGata}`);
  }

  /* Si ca amandoua locurile chiar citesc perioada aleasa. */
  assert.match(faraComentarii, /ETICHETE\[data\.perioada\]/, "eticheta nu vine din perioada aleasa");
  assert.match(faraComentarii, /rastimpul\(data\.perioada\)/, "fraza nu vine din perioada aleasa");
});
