import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   UN NUMAR MAI MARE NU INSEAMNA O CERERE MAI NOUA (28.08.2026, dupa-amiaza)
   ══════════════════════════════════════════════════════════════════════════

   Ceasul de stare da numere unice, si atat: cine cere ultimul primeste cel mai mare
   numar. Dar „ultimul care a cerut" nu e „ultimul care a vrut ceva", si prin gaura
   asta treceau doua curse care lasau marfa vandabila la ei si uitata la noi:

     ═══ 1. O REASERTARE VECHE SARIND PESTE O RELISTARE ═══

         piatra de mormant 1, listarea nu mai exista
         omul relisteaza -> ceasul 1 -> 2, listarea noua poarta 2
         reasertarea cere si ea -> ceasul 2 -> 3
         lotul reasertarii se aseaza: 3 = 3 -> STERGE listarea noua ❌

     ═══ 2. UN `published` VECHI INVIIND UN PRODUS SCOS ═══

         `setRemoteStatus` citeste listarea si se opreste o clipa
         intre timp: scoatere -> `inactive` la ei -> piatra -> randul local STERS
         `setRemoteStatus` isi reia drumul, cere ceasul, si trimite `published`
         la ei: PUBLICAT. La noi: nimic. Si nimeni nu mai cere `inactive`.

   ⚠ MASURAT PE BAZA ADEVARATA, in amandoua ordinile cursei, si calea veche confruntata
   cu cea noua pe acelasi scenariu:

     calea VECHE, piatra 1 / relistare 2 / reasertare 3  -> `sters`, listarea noua PIERDUTA
     calea NOUA,  aceeasi insiruire                      -> NULL, nu pleaca nimic, listarea traieste
     reasertarea castigand cursa (2), relistarea dupa (3) -> `depasit`, listarea traieste
     `published` dupa scoatere                            -> NULL, nu pleaca nimic

   Probele de aici pazesc chiar forma care face masuratoarea aceea sa fie adevarata:
   conditia din SQL — citita din temelia confruntata cu productia, nu din migratie — si
   faptul ca fiecare loc din cod care cere un numar isi citeste raspunsul inainte de a
   trimite ceva la ei.
*/

const temelie = readFileSync("migrations/000-schema-baseline.sql", "utf8");
const sync = readFileSync("src/lib/aboutyou/sync.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/aboutyou.actions.ts", "utf8");

/** Corpul unei functii din temelie, dintre cele doua `$function$` care il incadreaza. */
function corpFunctiei(nume: string): string {
  const i = temelie.indexOf(`FUNCTION public.${nume}(`);
  assert.notEqual(i, -1, `functia ${nume} lipseste din temelia schemei`);
  const inceput = temelie.indexOf("AS $function$", i);
  assert.notEqual(inceput, -1, `nu am gasit inceputul corpului lui ${nume}`);
  const sfarsit = temelie.indexOf("$function$", inceput + "AS $function$".length);
  assert.notEqual(sfarsit, -1, `nu am gasit sfarsitul functiei ${nume}`);
  return temelie.slice(inceput, sfarsit);
}

// ── Alocarea legata de randul de listare ────────────────────────────────────

test("ceasul pentru listare se uita la ID-ul randului, nu la cheia de stil", () => {
  const corp = corpFunctiei("aboutyou_ceas_pentru_listare");
  /*
   * ⚠ AICI E TOT MIEZUL. `style_key` supravietuieste relistarii — sters si refacut, produsul
   * are aceeasi cheie. Randul e incarnarea: alt `id` de fiecare data. O cerere pornita pentru
   * randul vechi n-are ce cauta la cel nou.
   */
  /*
   * ⚠ SE CITESTE CHIAR PAZA, nu tot corpul. Cautat pe intreaga functie, `id = p_listare_id` s-ar
   * fi potrivit pe scrierea de la sfarsit (`update … where id = p_listare_id`) — si atunci o paza
   * intoarsa inapoi la `style_key` ar fi trecut verde. Confruntat: cu paza slabita, proba cade.
   */
  const paza = corp.match(/if[\s\S]{0,20}not[\s\S]{0,20}exists\s*\(([\s\S]*?)\)\s*then[\s\S]{0,40}?return\s+null;/i);
  assert.ok(paza, "lipseste iesirea pe NULL cand randul nu mai exista");
  assert.match(paza[1], /id\s*=\s*p_listare_id/,
    "paza trebuie sa ceara chiar randul de la care a pornit cererea, nu cheia de stil");
  assert.match(paza[1], /from\s+public\.aboutyou_listings/i,
    "si sa se uite in listari, nu in altceva");
});

test("ceasul pentru listare nu se misca daca randul nu mai exista", () => {
  const corp = corpFunctiei("aboutyou_ceas_pentru_listare");
  /*
   * ⚠ Verificarea trebuie sa fie INAINTEA lui `insert … on conflict do update`: dupa el, ceasul
   * ar fi deja avansat, iar o scoatere care se aseaza intre timp ar gasi un numar strain si ar
   * raspunde „depasit" fara sa mai stearga nimic.
   */
  const iVerificare = corp.search(/if\s+not\s+exists/i);
  const iScriere = corp.indexOf("insert into public.aboutyou_ceas_stare");
  assert.ok(iVerificare !== -1 && iScriere !== -1);
  assert.ok(iVerificare < iScriere,
    "randul se verifica INAINTE ca ceasul sa fie avansat, altfel iesirea pe NULL lasa un numar ars");
});

test("ceasul pentru listare incuie randul de ceas inainte sa se uite", () => {
  const corp = corpFunctiei("aboutyou_ceas_pentru_listare");
  /* Fara incuietoare, verificarea s-ar putea invechi chiar in clipa dintre citire si scriere. */
  assert.match(corp, /aboutyou_ceas_stare[\s\S]{0,200}?for\s+update/i,
    "randul de ceas se incuie inainte de verificare");
});

// ── Alocarea pentru reasertare ──────────────────────────────────────────────

test("reasertarea cere EGALITATE cu generatia pietrei, nu „nu mai vechi”", () => {
  const corp = corpFunctiei("aboutyou_ceas_pentru_reasertare");
  /*
   * ⚠ `<` inseamna „nu e mai vechi", si lasa sa treaca orice numar mai mare. Aceeasi lectie ca
   * la incheierea scoaterii: o comparare-si-schimba adevarata cere egalitate.
   */
  assert.match(corp, /v_ceas\s*<>\s*p_generatie_asteptata|p_generatie_asteptata\s*<>\s*v_ceas/,
    "asteptarea se compara cu `<>`, nu cu `<`");
  assert.doesNotMatch(corp, /p_generatie_asteptata\s*<\s*v_ceas/,
    "compararea de ORDINE lasa sa treaca orice numar mai mare decat ceasul");
});

test("reasertarea intoarce NULL cand nu exista ceas si cand asteptarea e nula", () => {
  const corp = corpFunctiei("aboutyou_ceas_pentru_reasertare");
  assert.match(corp, /if\s+not\s+found\s+then\s+return\s+null/i,
    "fara ceas nu se aloca nimic");
  assert.match(corp, /p_generatie_asteptata\s+is\s+null/i,
    "o asteptare nula nu e o incuviintare");
});

test("incheierea scoaterii a ramas pe egalitate", () => {
  /* Regula de la 2026-12-09; aici doar ca sa nu se intoarca pe furis odata cu vreo rescriere. */
  const corp = corpFunctiei("aboutyou_incheie_scoaterea");
  assert.match(corp, /p_generatie\s*<>\s*v_ceas/);
  assert.doesNotMatch(corp, /p_generatie\s*<\s*v_ceas/);
});

// ── Cele trei functii de ceas raman inchise ─────────────────────────────────

test("niciun ceas nu e deschis lui anon sau authenticated", () => {
  for (const f of ["aboutyou_ceas_urmator", "aboutyou_ceas_pentru_listare", "aboutyou_ceas_pentru_reasertare"]) {
    const granturi = temelie.split("\n").filter((l) => l.includes(`function public.${f}(`) && l.startsWith("grant"));
    assert.ok(granturi.length > 0, `${f} n-are niciun grant in temelie`);
    for (const g of granturi) {
      assert.doesNotMatch(g, /\banon\b/, `${f} e deschisa lui anon`);
      assert.doesNotMatch(g, /\bauthenticated\b/, `${f} e deschisa lui authenticated`);
    }
  }
});

// ── Si codul care cheama ────────────────────────────────────────────────────

test("nicio schimbare de stare nu mai cere numarul neconditionat", () => {
  /*
   * ⚠ Paza impotriva derivei, nu o dovada ca merge: dovada e masuratoarea de sus. Aici se
   * pazeste doar ca o rescriere de maine sa nu strecoare inapoi alocarea neconditionata pe o
   * cale de stare — chiar forma care stergea listarea relistata.
   *
   * `aboutyou_ceas_urmator` ramane indreptatit intr-un singur loc: RELISTAREA, unde nu exista
   * nicio asteptare de verificat, fiindca ea insasi e cea mai noua intentie. Iar de cand salvarea
   * se face dintr-un singur RPC, relistarea se petrece IN SQL — deci din aplicatie nu-l mai
   * cheama nimeni, si asta se pazeste.
   */
  assert.ok(!sync.includes("aboutyou_ceas_urmator"),
    "in sync.ts orice cerere de numar porneste de la ceva anume: un rand sau o piatra");
  assert.ok(!actiuni.includes("aboutyou_ceas_urmator"),
    "in actiuni nu se mai cere niciun numar de-a dreptul");
  /* ⚠ Dar tot se cheama, din salvare — altfel randul nou ar porni de la un ceas nemiscat. */
  assert.match(corpFunctiei("aboutyou_salveaza_listarea"), /aboutyou_ceas_urmator\(/,
    "nasterea unei listari avanseaza ceasul inainte ca randul sa existe");
});

test("fiecare cerere de numar isi citeste raspunsul inainte sa trimita ceva", () => {
  /*
   * ⚠ `null` NU e o eroare de retea: e raspunsul „lumea s-a schimbat". Un `typeof … !== \"number\"`
   * lipsa ar trimite `undefined` mai departe si cererea ar pleca oricum la ei.
   */
  for (const [nume, sursa] of [["sync.ts", sync], ["aboutyou.actions.ts", actiuni]] as const) {
    const bucati = sursa.split(/admin\.rpc\("aboutyou_ceas_(?:pentru_listare|pentru_reasertare|urmator)"/);
    for (let i = 1; i < bucati.length; i++) {
      const dupa = bucati[i].slice(0, 600);
      assert.match(dupa, /typeof\s+\w+\s*!==\s*"number"/,
        `in ${nume}, o cerere de numar nu-si verifica raspunsul inainte de a merge mai departe`);
    }
  }
});

test("reasertarea trece prin ceasul conditionat, cu generatia pietrei ca asteptare", () => {
  assert.match(sync, /aboutyou_ceas_pentru_reasertare"[\s\S]{0,300}?p_generatie_asteptata:\s*piatra\.status_generatie/,
    "asteptarea e chiar generatia pietrei de mormant, nu altceva");
});

test("scrierea pietrei dupa reasertare isi citeste raspunsul", () => {
  /*
   * ⚠ Nescrisa, piatra ramane la generatia veche desi lotul a plecat cu una noua — iar
   * urmatoarea reasertare ar cere cu o asteptare gresita si n-ar mai porni niciodata.
   */
  assert.match(sync, /const\s*\{\s*error:\s*ePiatra\s*\}\s*=\s*await\s+admin\s*\.?\s*\n?\s*\.?from\("aboutyou_listari_scoase"\)\.update/,
    "actualizarea pietrei trebuie sa-si prinda eroarea");
  assert.match(sync, /if\s*\(ePiatra\)\s*\{[\s\S]{0,300}?asezat\s*=\s*false/,
    "o piatra nescrisa lasa lotul deschis, ca sa se reia");
});

test("si salvarea cere randul de la care a pornit, altfel nu creeaza nimic", () => {
  /*
   * ═══ ⚠ ACEEASI REGULA, PE A TREIA CALE (28.08.2026, noaptea) ═══
   *
   * Schimbarile de stare erau legate de rand de ieri. Salvarea nu era, si prin ea produsul putea
   * invia:
   *
   *     salvarea citeste listarea L1 si merge mai departe
   *     intre timp: scoaterea se incheie -> `inactive` la ei -> piatra -> L1 STEARSA
   *     RPC-ul nu mai gaseste nimic dupa (business_id, style_key) -> CREEAZA L2
   *     iar la „Salvează și trimite", produsul pleaca din nou la ei ❌
   *
   * ⚠ O ACTIUNE PORNITA CA „ACTUALIZEAZA" N-ARE VOIE SA SE FACA „CREEAZA" PE DRUM. Masurat:
   * `depasit`, si zero randuri create in locul celei eliminate.
   */
  const corp = corpFunctiei("aboutyou_salveaza_listarea");
  /* ⚠ Randul gasit trebuie sa fie CHIAR cel de la care s-a pornit, nu doar unul cu aceeasi cheie. */
  /*
   * ⚠ SI `null` INSEAMNA STRICT „N-A EXISTAT NICIUNA" (29.08.2026). Pana ieri, o salvare pornita
   * fara listare scria peste una aparuta intre timp — o fila deschisa zece minute putea calca
   * listarea facuta in alta fila. „Nu stiam de ea" nu e o incuviintare.
   */
  assert.match(corp, /p_listare_asteptata is null or v_id <> p_listare_asteptata[\s\S]{0,120}?depasit/i,
    "un rand cu alta incarnare — sau unul aparut cand nu era niciunul — nu se ia drept acelasi");
  /*
   * ⚠ Si ramura de CREARE ii e inchisa. Fara asta, defectul ramane intreg: tocmai lipsa randului
   * e cazul in care salvarea invia produsul.
   */
  const iNegasit = corp.indexOf("else");
  assert.ok(iNegasit > 0, "n-am gasit ramura de creare");
  const ramura = corp.slice(iNegasit, corp.indexOf("aboutyou_ceas_urmator"));
  assert.match(ramura, /p_listare_asteptata is not null[\s\S]{0,120}?depasit/i,
    "o salvare pornita de la o listare care nu mai exista NU creeaza alta in locul ei");
});

test("scoaterea si publicarea cer numarul legat de randul citit", () => {
  const cereri = sync.split('admin.rpc("aboutyou_ceas_pentru_listare"');
  assert.ok(cereri.length - 1 >= 3,
    "toate cele trei cai de stare (publicare, retragere, scoatere locala) trec pe aici");
  for (let i = 1; i < cereri.length; i++) {
    assert.match(cereri[i].slice(0, 400), /p_listare_id:\s*listing\.id/,
      "randul trimis e chiar cel citit mai sus, nu unul recitit intre timp");
  }
});

test("reconcilierea nu scrie peste o incarnare pe care n-a citit-o", () => {
  /*
   * ═══ ⚠ ACEEASI REGULA, PE A PATRA CALE (28.08.2026, noaptea) ═══
   *
   * Cele trei scrieri ale reconcilierii merg pe `(business_id, style_key)`, iar cheia
   * SUPRAVIETUIESTE relistarii. Intre citirea de la ei — pana la cincizeci de pagini, cu pauze —
   * si scriere incape tot ciclul:
   *
   *     citim la ei: styleKey ABC e `rejected`, cu motivele lui
   *     omul elimina listarea -> randul local se sterge
   *     omul o reface        -> rand NOU, `local`, care n-a plecat niciodata la ei
   *     scriem: randul nou primeste `rejected` si motivele produsului DINAINTE ❌
   *
   * ⚠ AICI NU EXISTA O INCARNARE ANUME DE CERUT: citirea e despre o CHEIE, nu despre un rand. Deci
   * se cere altceva, la fel de exact — randul sa fi existat inainte sa incepem sa citim.
   */
  const sync = readFileSync("src/lib/aboutyou/sync.ts", "utf8");
  const i = sync.indexOf("export async function reconcileStatuses");
  assert.notEqual(i, -1);
  const corp = sync.slice(i, sync.indexOf("\nexport ", i + 10));

  /*
   * ⚠ Clipa se ia INAINTE de prima cerere CATRE EI; luata mai tarziu, ar cuprinde chiar fereastra.
   *
   * ⚠ Ancora era `indexOf("await ")` — „prima asteptare din functie". A incetat sa fie potrivita
   * cand clipa insasi a inceput sa vina din baza, printr-un `await`: proba se compara cu propria
   * ei citire si cadea pe cod bun. Se cere ce trebuie cerut: cererea catre About You.
   */
  const iClipa = corp.indexOf("const inceputulCitirii");
  const iCatreEi = corp.indexOf("await getProducts(ctx.auth");
  assert.ok(iClipa > 0 && iCatreEi > iClipa,
    "clipa de citire se ia inaintea primei cereri catre ei, altfel nu acopera fereastra");
  /* ⚠ Si vine de la BAZA, nu din Node: se compara cu `created_at`, scris tot de Postgres. */
  assert.match(corp, /admin\.rpc\("ceasul_bazei"\)/);

  /* ⚠ Si TOATE cele trei scrieri o folosesc: una singura lasata pe dinafara e destula. */
  const scrieriPeCheie = (corp.match(/\.eq\("style_key", (?:styleKey|it\.style_key)\)/g) ?? []).length;
  const pazite = (corp.match(/\.lt\("created_at", inceputulCitirii\)/g) ?? []).length;
  assert.equal(scrieriPeCheie, 3, "s-au schimbat scrierile pe cheie: verifica paza fiecareia");
  assert.equal(pazite, scrieriPeCheie,
    "fiecare scriere pe cheie isi cere randul mai vechi decat citirea");
});
