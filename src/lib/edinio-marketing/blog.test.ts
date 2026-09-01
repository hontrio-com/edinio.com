import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  BLOGUL: CE S-A CITIT, NU CAT S-A DERULAT
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DEOSEBIREA CARE FACE RAPORTUL FOLOSITOR. `scroll_depth` obisnuit masoara
  procente din TOT documentul: antet, articol, indemn, autor, articole inrudite,
  abonare, subsol. Pe o pagina de blog corpul articolului e poate jumatate din
  inaltime — deci „a derulat 90% din pagina" nu inseamna „a citit articolul", iar
  „a citit articolul" se intampla pe la 50-60% din pagina.

  Un raport construit pe procente de PAGINA spune ceva despre subsol.
*/

const RAD = process.cwd();
const citeste = (c: string) => readFileSync(join(RAD, c), "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");

test("⚠ progresul se masoara in CORPUL articolului, nu in pagina", () => {
  const urma = faraComentarii(citeste("src/components/edinio-marketing/UrmaArticol.tsx"));
  assert.match(
    urma, /querySelector<HTMLElement>\("\[data-articol-corp\]"\)/,
    "reperele nu mai sunt legate de corpul articolului",
  );
  assert.match(urma, /corp\.appendChild\(r\)/, "reperele nu se mai pun INAUNTRUL corpului");
  assert.doesNotMatch(
    urma, /document\.body\.appendChild/,
    "reperele au ajuns pe pagina intreaga — atunci procentele descriu subsolul, nu textul",
  );

  const corp = citeste("src/components/website/blog/CorpArticol.tsx");
  assert.match(corp, /<div data-articol-corp/, "corpul articolului nu mai e marcat");
});

test("un articol foarte scurt nu raporteaza ca a fost citit 90%", () => {
  /*
    ⚠ Daca tot corpul incape pe un ecran, cele patru repere se aprind DEODATA la
    incarcare — si raportul ar spune ca a citit complet cineva care poate n-a
    citit niciun rand.
  */
  const urma = faraComentarii(citeste("src/components/edinio-marketing/UrmaArticol.tsx"));
  assert.match(
    urma, /if \(inaltime < window\.innerHeight \* 1\.2\) return;/,
    "s-a pierdut paza pentru articolele scurte",
  );
});

test("vizualizarea articolului se trage o SINGURA data", () => {
  const urma = faraComentarii(citeste("src/components/edinio-marketing/UrmaArticol.tsx"));
  assert.match(urma, /if \(vazut\.current\) return;/, "articolul poate fi numarat de mai multe ori");
});

test("⚠ cererea de abonare si confirmarea sunt DOUA lucruri", () => {
  /*
    Confundate, raportul umfla numarul de abonati cu toti cei care n-au confirmat
    niciodata — iar rata de confirmare, singura cifra care spune daca emailurile
    chiar ajung, nu se mai poate calcula.
  */
  const cerere = faraComentarii(citeste("src/components/website/blog/AbonareBlog.tsx"));
  assert.match(cerere, /name: "newsletter_subscribe_request"/, "cererea nu se mai masoara");
  assert.doesNotMatch(cerere, /newsletter_subscribe_confirmed/, "cererea se raporteaza drept confirmare");

  const buton = faraComentarii(citeste("src/components/website/blog/ApasaCaSaConfirmi.tsx"));
  assert.match(buton, /name: "newsletter_subscribe_confirmed"/, "confirmarea nu se mai masoara");
});

test("⚠ dezabonarea NU se numara drept abonare confirmata", () => {
  /*
    Componenta butonului e folosita si la confirmare, si la dezabonare. O
    masuratoare neconditionata inauntru ar fi crescut cifra exact cand scadea
    realitatea — cel mai inselator fel de defect.
  */
  const buton = faraComentarii(citeste("src/components/website/blog/ApasaCaSaConfirmi.tsx"));
  assert.match(
    buton, /if \(r\.ok && masoaraConfirmarea\)/,
    "confirmarea se masoara neconditionat — deci si la dezabonare",
  );

  const dez = citeste("src/app/(website)/blog/dezabonare/page.tsx");
  assert.doesNotMatch(dez, /masoaraConfirmarea/, "pagina de dezabonare cere masurarea confirmarii");

  const conf = citeste("src/app/(website)/blog/confirma/page.tsx");
  assert.match(conf, /masoaraConfirmarea/, "pagina de confirmare nu mai cere masurarea");
});

test("hotararea trece granita server/client ca VALOARE, nu ca functie", () => {
  /*
    ⚠ Prima mea forma trecea o functie. Paginile sunt componente de SERVER; o
    functie de acolo nu se poate serializa catre client. `tsc` a prins-o.
  */
  const buton = citeste("src/components/website/blog/ApasaCaSaConfirmi.tsx");
  assert.match(buton, /masoaraConfirmarea\?: boolean;/, "semnalul nu mai e o valoare simpla");
  assert.doesNotMatch(buton, /laReusita\?: \(\) => void/, "s-a intors functia peste granita server/client");
});
