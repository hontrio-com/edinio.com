import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cosulMaiPoateFiRecuperat, COS_PREA_VECHI } from "./abandoned-cart";
import { pragulComenzilor, LUNI_PE_COMANDA } from "@/app/api/cron/curata-fisiere/reguli";

/**
 * NICIUN MESAJ DE RECUPERARE PENTRU UN COS IESIT DIN FEREASTRA DE SASE LUNI.
 *
 * ═══ ⚠ RETENTIA A FOST REPARATA PE JUMATATE ═══
 *
 * Linkul avea regula: `getRecoverableCart` refuza un cos a carui ultima miscare e mai veche decat
 * `pragulComenzilor`, si bine, fiindca acela e chiar termenul dupa care cronul de curatenie sterge
 * pozele cumparatorilor din cosurile deschise.
 *
 * TRIMITEREA insa nu se uita la nicio varsta. Nici emailul de mana, care nici macar nu cerea
 * `last_activity_at` din baza; nici SMS-ul de mana; nici automatizarea din cron, care avea numai
 * marginea de SUS („mai vechi de o ora"), fara una de jos.
 *
 * Deci un cos de sapte luni primea mesajul. Clientul apasa, iar la capat vitrina iese pe
 * `items.length === 0` inainte de `restoreCart` si sterge si parametrul `recover` din adresa: omul
 * ajunge pe prima pagina, fara cos si fara nicio explicatie.
 *
 * ⚠ LA SMS COSTA BANI. Mesajul e platit de comerciant, deci se platea ca sa fie trimis clientul
 * intr-un zid. Aceeasi familie de defecte ca in [[recuperare-sms-cos-gol]], si de aceea proba sta
 * langa ea.
 *
 * ⚠ DE CE SE CITESTE SI SURSA. Regula insasi e o functie pura si se probeaza ca atare mai jos. Dar
 * ce s-a stricat n-a fost regula, ci faptul ca TREI drumuri din patru n-o chemau — iar amandoua
 * trimiterile cer un client Supabase si un furnizor de SMS ca sa poata fi rulate. Ce trebuie aparat
 * aici e ca poarta EXISTA pe fiecare drum, si asta se vede din sursa.
 */

const RAD = process.cwd();

/**
 * Sursa fara comentarii.
 *
 * ⚠ COMENTARIILE SE TAIE, si nu de eleganta: o cautare peste fisierul intreg s-ar fi indeplinit pe
 * chiar comentariul care explica poarta, deci ar fi trecut si daca poarta ar fi fost stearsa iar
 * explicatia ei ar fi ramas. S-a intamplat de patru ori in proiectul asta.
 *
 * ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF.
 */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const ACTIUNI = "src/lib/actions/abandoned-cart.actions.ts";
const CRON = "src/app/api/cron/abandoned-recovery/route.ts";

/* ═══════════════════════════════════════════════════════════════════════════
   REGULA INSASI
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ regula spune «da» pana la prag si «nu» dupa el", () => {
  const acum = new Date("2026-09-07T12:00:00.000Z");
  const prag = pragulComenzilor(acum);

  /* Cu o zi inainte de prag: cosul e iesit din fereastra. */
  const inainte = new Date(prag.getTime() - 24 * 3600 * 1000).toISOString();
  assert.equal(cosulMaiPoateFiRecuperat(inainte, prag), false);

  /* Cu o zi dupa: e inca inauntru. */
  const dupa = new Date(prag.getTime() + 24 * 3600 * 1000).toISOString();
  assert.equal(cosulMaiPoateFiRecuperat(dupa, prag), true);

  /* ⚠ Si CHIAR pe prag e inauntru: `>=`, ca sa nu existe o clipa fara raspuns. */
  assert.equal(cosulMaiPoateFiRecuperat(prag.toISOString(), prag), true);
});

test("⚠ o data lipsa sau stricata inseamna «prea vechi», nu «proaspat»", () => {
  /*
   * ⚠ SE CADE INCHIS, si asta e alegerea. Un cos fara `last_activity_at` e un rand pe care nu-l
   * intelegem; pe el nu se trimite un SMS platit si nu se promite o recuperare. Aceeasi purtare o
   * are si linkul, de unde vine regula.
   */
  const prag = pragulComenzilor(new Date());
  for (const d of [null, undefined, "", "maine", "nu-e-o-data"]) {
    assert.equal(cosulMaiPoateFiRecuperat(d, prag), false, `«${String(d)}» a trecut drept cos viu`);
  }
});

test("⚠ pragul e CHIAR cel al fisierelor, nu unul apropiat", () => {
  /*
   * ═══ ⚠ DOUA NUMERE AR FI LASAT O FEREASTRA ═══
   *
   * Daca recuperarea ar tine, sa zicem, sapte luni si fisierele sase, ar exista o luna in care
   * cosul se recupereaza si pozele lui nu mai sunt. Clientul si-ar vedea comanda refuzata la
   * trimitere fara sa inteleaga de ce. De-aia amandoua vin din `pragulComenzilor`, o singura sursa.
   */
  const acum = new Date("2026-09-07T12:00:00.000Z");
  const prag = pragulComenzilor(acum);
  const asteptat = new Date(acum);
  asteptat.setMonth(asteptat.getMonth() - LUNI_PE_COMANDA);
  assert.equal(prag.getTime(), asteptat.getTime(), "recuperarea si retentia fisierelor s-au despartit");
});

/* ═══════════════════════════════════════════════════════════════════════════
   SI CA TOATE PATRU DRUMURILE O CHEAMA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ EMAILUL de mana cere `last_activity_at` din baza SI il judeca", () => {
  const s = sursa(ACTIUNI);
  const i = s.indexOf("export async function sendAbandonedCartEmail");
  assert.ok(i > 0, "actiunea de email si-a schimbat numele");
  const corp = s.slice(i, s.indexOf("export async function sendAbandonedCartSms"));

  /*
   * ⚠ AMANDOUA JUMATATILE. Verificarea fara coloana ceruta in `select` ar fi comparat mereu
   * `undefined`, deci ar fi refuzat FIECARE cos — un defect la fel de rau, doar in cealalta
   * directie, si tot cu suita verde.
   */
  assert.match(corp, /last_activity_at/, "emailul nu cere coloana din baza");
  assert.match(
    corp, /cosulMaiPoateFiRecuperat\(cart\.last_activity_at/,
    "emailul poate pleca pe un cos iesit din fereastra",
  );
});

test("⚠ SMS-ul de mana la fel, si acolo conteaza mai mult: mesajul e PLATIT", () => {
  const s = sursa(ACTIUNI);
  const i = s.indexOf("export async function sendAbandonedCartSms");
  assert.ok(i > 0, "actiunea de SMS si-a schimbat numele");
  const corp = s.slice(i, s.indexOf("export async function deleteAbandonedCart"));

  assert.match(corp, /last_activity_at/, "SMS-ul nu cere coloana din baza");
  assert.match(
    corp, /cosulMaiPoateFiRecuperat\(cart\.last_activity_at/,
    "SMS-ul platit poate pleca pe un cos iesit din fereastra",
  );
});

test("⚠ CRONUL are si margine de JOS, nu doar «mai vechi de o ora»", () => {
  const s = sursa(CRON);

  /*
   * ⚠ Se cere chiar filtrul din interogare, nu doar prezenta pragului in fisier: calculat si
   * nefolosit, el ar fi aratat exact ca o reparatie facuta.
   */
  assert.match(
    s, /\.gte\("last_activity_at", pragRecuperare\)/,
    "automatizarea culege si cosuri iesite din fereastra de sase luni",
  );
  assert.match(
    s, /const pragRecuperare = pragulComenzilor\(now\)/,
    "pragul cronului nu mai vine din aceeasi sursa ca al fisierelor",
  );

  /* ⚠ Si marginea de sus ramane: fara ea, cronul ar trimite pe cosuri de acum zece minute. */
  assert.match(s, /\.lt\("last_activity_at", thresholdIso\)/, "marginea de sus s-a pierdut");
});

test("⚠ LINKUL foloseste acelasi ajutor, nu o copie a regulii", () => {
  /*
   * Regula era scrisa desfasurat aici (`new Date(...)`, `Number.isNaN`, comparatie). Scrisa o data
   * si copiata in patru locuri, s-ar fi departat la prima corectie facuta intr-unul singur; e chiar
   * tiparul din [[socoteala-din-componenta-nu-se-probeaza]].
   */
  const s = sursa(ACTIUNI);
  const i = s.indexOf("export async function getRecoverableCart");
  assert.ok(i > 0, "linkul de recuperare si-a schimbat numele");
  const corp = s.slice(i, i + 2000);
  assert.match(corp, /cosulMaiPoateFiRecuperat\(cart\.last_activity_at/, "linkul si-a facut copie proprie");
});

test("⚠ mesajul catre comerciant spune DE CE, si ce mai poate face", () => {
  /*
   * „Nu se poate" l-ar fi trimis la suport. Textul spune varsta, urmarea (linkul duce la un cos
   * gol) si faptul ca mesajul NU a plecat, ca sa nu creada ca a trimis si n-a ajuns.
   */
  assert.match(COS_PREA_VECHI, /sase luni/);
  assert.match(COS_PREA_VECHI, /cos gol/);
  assert.match(COS_PREA_VECHI, /nu a plecat/);
});
