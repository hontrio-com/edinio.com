import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   BUTONUL CARE SE INVARTE PANA LA REINCARCAREA PAGINII      (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Tiparul primejdios, scris la fel in toate ferestrele de curier:

       setEmitand(true);
       const r = await createXAwbAction(...);
       setEmitand(false);          // ⚠ randul asta NU se mai executa daca apelul se RESPINGE
       if ("error" in r) return toast.error(r.error);

   O actiune de server nu raspunde intotdeauna cu `{ error }`: la o desfasurare in curs, o
   retea cazuta sau un termen depasit, ea ARUNCA. Atunci stingerea nu mai ruleaza, nu apare
   niciun mesaj, si butonul ramane invartindu-se pe „Se emite…" pana cand omul reincarca
   pagina. Iar el nu stie daca AWB-ul s-a facut sau nu, deci ori apasa iar (al doilea AWB,
   taxabil), ori asteapta degeaba.

   ⚠ MASURAT (14.09.2026): 69 de functii aprind un steag, 56 au `await` si NU au `finally`,
   in 17 ferestre. Dintre cele 56, 47 lasa fereastra deschisa, deci butonul chiar se vede
   blocat; 9 o inchid la reusita, si acolo steagul aprins se simte doar pe calea de eroare.

   ═══ FORMA E CEA DE LA ECOLET, NU CEA DE LA FAN, SI ASTA CONTEAZA ═══

   Amandoua repara blocarea, dar difera unde se opreste `try`. FAN tine si ramificarea de
   dupa apel inauntru; eColet declara rezultatul inainte, pune in `try` DOAR apelul, si lasa
   toasturile si starile dupa bloc:

       setCreeaza(true);
       let r: Awaited<ReturnType<typeof createEcoletAwbAction>>;
       try {
         r = await createEcoletAwbAction(...);
       } catch (e) {
         toast.error(`eColet nu a raspuns. Verifica starea inainte sa incerci din nou: …`);
         return;
       } finally {
         setCreeaza(false);
       }
       if ("error" in r) { … }     // ⚠ ramificarea, AFARA din try

   ⚠ De ce a doua e mai buna: cu forma FAN, daca `toast.success` sau `onSuccess()` arunca,
   `catch`-ul spune „nu stim daca a ajuns la curier" pentru o expediere care CHIAR plecase.
   Un mesaj fals, exact in clipa in care omul are nevoie de unul adevarat.

   ═══ CE SPUNE `catch`-ul: TREI CAZURI, NU DOUA ═══

   Masurat pe fiecare actiune in parte, nu ghicit din verbul numelui:

     * SCHIMBA LA CURIER (`create*`, `delete*`, `cancel*`, `request*Pickup`,
       `valideazaBorderouAction`, `cereOfertaTransportAction`, `finalizeazaEcoletAction`):
       „nu stim daca a ajuns la <curier>, verifica in contul lor inainte sa incerci din nou".
     * SCHIMBA DOAR LA NOI (`dezleagaPacketaAction`): nu vorbeste deloc cu Packeta, scrie
       `null` in randul comenzii. Mesajul „verifica in contul curierului" ar fi o minciuna
       politicoasa; adevarul e „nu stim daca s-a salvat, reimprospateaza comanda".
     * CITESTE (`coteaza*`, `verifica*Awb`, `get*`, `stare*`, `optiuni*`, `pregatireAwbEmag`,
       `validesteShipoAction`): nimic nu s-a schimbat, deci doar mesajul erorii.

   ⚠ Clasificarea NU se face dupa metoda HTTP: la Shipo anularea e `GET /shipment/cancel/{awb}`,
   un GET care SCRIE, si clientul o marcheaza de mana `efect: "scriere"`. Iar `efect` exista
   doar la patru clienti (DHL, FedEx, Shipo, UPS), deci nu se poate deduce nici de acolo.

   ═══ DE CE O HARTA CU NUMERE, SI NU O LISTA DE SCUTIRI ═══

   Sunt 17 ferestre vii, folosite chiar acum de clienti pentru coletele lor. Nu le ating
   intr-un singur val. Harta de mai jos spune cate manere sunt INCA stricate in fiecare, iar
   proba cere ca masuratoarea sa fie EXACT ea.

   ⚠ Numarul, nu scutirea fisierului. `GlsAwbModal` are un maner bun (`descarcaSalvata`) langa
   unul stricat, si la fel `SamedayAwbModal` (`handleDownload`). O scutire pe fisier intreg
   le-ar fi lasat nepazite tocmai pe cele reparate. Asa, orice regresie oriunde urca numarul
   si cade proba, iar orice reparatie il scade si cere ca harta sa fie adusa la zi in acelasi
   commit. Cele 9 manere deja corecte (FAN 3 + ridicarea FAN 2, eColet 4) sunt aparate din
   prima zi: fisierele lor nu apar in harta, deci numarul lor asteptat e ZERO.

   ═══ ⚠⚠ SI NU ORICE `setX(true)` E UN STEAG DE INCARCARE (14.09.2026) ═══

   `vezBorderoul` din `PallexAwbModal` a fost numarat de scaner ca al 56-lea, fiindca arata
   exact ca celelalte. Nu era: `borderouCerut` inseamna „omul a cerut sa vada borderoul”, si pe
   calea de REUSITA ramane dinadins aprins, ca panoul sa stea deschis; se stinge doar pe cele
   doua cai de eroare. Un `finally` l-ar fi inchis chiar in clipa in care se umplea, la un
   curier viu, pe pasul fara de care marfa nu pleaca. Si ar fi trecut de `tsc`, de suita si de
   build fara ca nimic sa para stricat.

   De aceea exista `NU_SUNT_STEAGURI`: scutire de `finally`, NU de reparatie. Acolo steagul se
   stinge in `catch`, si proba de mai jos cere ca scutirea sa ramana cinstita.
*/

const DIR = "src/components/dashboard";

/**
 * Cate manere mai asteapta reparatia, pe fereastra. ⚠ LISTA SCADE, si fiecare numar coborat
 * merge in acelasi commit cu reparatia lui. O fereastra reparata de tot IESE din harta.
 */
const INCA_NEREPARATE: Record<string, number> = {
  /*
   * ⚠ GOALA, si asta e chiar sfarsitul arcului (14.09.2026). Toate cele 56 de aprinderi de steag
   * din ferestrele de curier au acum stingere in `finally`, sau o scutire numita cu motivul
   * scris in `NU_SUNT_STEAGURI`.
   *
   * ⚠ CLICHETUL NU DISPARE ODATA CU LISTA. Dimpotriva: de acum orice aprindere noua fara
   * stingere face masuratoarea sa nu mai fie goala, si proba cade cu numele fisierului in mesaj.
   * O lista goala e cea mai stransa forma a ei, nu sfarsitul ei.
   */
};

/**
 * Manere unde `setX(true)` NU e steag de incarcare, cu motivul scris. Lista e scurta dinadins.
 *
 * ⚠ SCANERUL POTRIVESTE FORMA, NU INTELESUL. Aici un `finally` ar STRICA o functionalitate, nu
 * ar repara una, si nici `tsc`, nici suita, nici buildul n-ar clipi. Reparatia lor e
 * `try/catch` care stinge steagul DOAR pe caderi, fara `finally`.
 *
 * ⚠ Scutirea se verifica PE DOS, mai jos, ca sa nu devina o portita.
 */
const NU_SUNT_STEAGURI: Record<string, string> = {
  "PallexAwbModal.tsx · vezBorderoul":
    "`borderouCerut` inseamna „omul a cerut sa vada borderoul”, nu „se incarca”: pe calea de "
    + "reusita ramane dinadins aprins, ca panoul sa stea deschis. Un `finally` l-ar inchide "
    + "exact cand se umple, pe pasul fara de care marfa nu pleaca.",

  /*
   * ⚠ AL DOILEA CAZ, CU ALT MECANISM. Aici steagul CHIAR e de incarcare, deci motivul de sus
   * nu-l acopera: ce difera e DRUMUL DE IESIRE.
   *
   * ⚠ Numele e al `const`-ului dinaintea efectului, fiindca asa taie `manere()` corpul, nu al
   * efectului insusi. Daca se muta ceva intre ele, cheia nu mai potriveste si proba de mai jos
   * o spune, in loc sa ingroape scutirea.
   */
  "SamedayAwbModal.tsx · isEasyboxDelivery":
    "steagul sta intr-un efect cu anulare, iar `if (anulat) return` sare peste stingere "
    + "dinadins: ori componenta s-a demontat, ori a pornit o rulare mai noua care si-a aprins "
    + "ea steagul. Un `finally` ar stinge rotirea aceleia. Stingerea se face in `catch`, sub "
    + "`if (!anulat)`.",
};

/* ── Citirea surselor ─────────────────────────────────────────────────────── */

/** ⚠ Comentariile se taie: o nota care POMENESTE `finally` nu repara nimic. */
function sursa(nume: string): string {
  return readFileSync(`${DIR}/${nume}`, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function ferestreleDeCurier(): string[] {
  return readdirSync(DIR).filter((f) => /(Awb|Pickup)Modal\.tsx$/.test(f));
}

/* ── Manerele ─────────────────────────────────────────────────────────────── */

type Maner = { fisier: string; nume: string; steag: string; corp: string; asteapta: boolean };

/* Antetul unei functii din corpul componentei, si acolada care o inchide la acelasi nivel. */
const ANTET = /^ {2}(?:const [A-Za-z_$][\w$]*\s*=|async function |function )/;
/*
 * ⚠ SI INCHIDEREA UNUI EFECT, nu doar a unei functii (14.09.2026).
 *
 * `useEffect(() => { … }, [deps]);` se termina cu `  }, [`, care NU potrivea tiparul de sus.
 * Slice-ul mergea atunci mai departe, pana la acolada urmatoare, si inghitea manerul VECIN cu
 * tot cu `finally`-ul lui. Cat timp vecinul era nereparat nu se vedea nimic; reparandu-l,
 * `isEasyboxDelivery` de la Sameday a aparut dintr-odata ca avand `finally`.
 *
 * ⚠ L-a aratat proba, nu eu, si tocmai fiindca afirmatia despre scutiri cere lucrul ingust:
 * „scutitul NU are voie sa capete `finally`".
 */
const SFARSIT = /^ {2}\}[;)]*\s*$|^ {2}\}, \[/;

/**
 * Fiecare functie care APRINDE un steag, cu corpul ei.
 *
 * ⚠ Se leaga steagul de FUNCTIA in care sta, nu de o fereastra de caractere in jurul lui.
 * O fereastra fixa ajunge in manerul vecin si ii citeste `finally`-ul, deci ar declara
 * reparat ceva ce nu e. (Am patit-o deja, la proba motivelor de sarire.)
 */
function manere(fisier: string, s: string): Maner[] {
  const linii = s.split("\n");
  const gasite: Maner[] = [];
  const vazute = new Set<string>();

  for (let i = 0; i < linii.length; i++) {
    const m = /\bset([A-Za-z][A-Za-z0-9]*)\(true\)/.exec(linii[i]);
    if (!m) continue;

    let start = 0;
    for (let j = i; j >= 0; j--) {
      if (ANTET.test(linii[j])) { start = j; break; }
    }
    /*
     * ⚠ UN RAND PE (FUNCTIE, STEAG), nu pe functie (14.09.2026).
     *
     * `handleSelectService` de la Woot porneste DOUA functii asincrone scrise pe loc, fiecare
     * cu steagul ei. Legand un singur steag de functie, a doua asteptare ramanea nevazuta. Mai
     * rau: reparand-o doar pe prima, corpul capata `finally`, numarul scade, si a doua ar fi
     * ramas stricata pentru totdeauna, fara ca nimic sa para lipsa.
     */
    if (vazute.has(`${start}·${m[1]}`)) continue;
    vazute.add(`${start}·${m[1]}`);

    let sfarsit = linii.length;
    for (let j = i; j < linii.length; j++) {
      if (SFARSIT.test(linii[j])) { sfarsit = j + 1; break; }
    }

    /*
     * ⚠ SI ASTEPTAREA TREBUIE SA VINA DUPA APRINDERE, altfel nu e steag de incarcare.
     *
     * `setPricesFetched(true)` la Woot si `setBorderouCerut(true)` din `handleCreate` la Pall-Ex
     * se aprind DUPA apel, ca semn ca raspunsul a venit. Cerute cu `finally`, ar fi umplut lista
     * de scutiri cu zgomot, iar o lista de scutiri plina de zgomot nu mai apara nimic.
     */
    const asteapta = linii.slice(i + 1, sfarsit).join("\n").includes("await ");

    const antet = linii[start].trim();
    const nume = antet.replace(/^(?:const |async function |function )/, "").split(/\s*=|\(/)[0].trim();
    gasite.push({ fisier, nume, steag: m[1], corp: linii.slice(start, sfarsit).join("\n"), asteapta });
  }

  return gasite;
}

function toateManerele(): Maner[] {
  return ferestreleDeCurier().flatMap((f) => manere(f, sursa(f)));
}

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("⚠⚠ steagul de incarcare se stinge in `finally`, nu pe randul de dupa apel", () => {
  const toate = toateManerele();

  /*
   * ⚠ SE NUMARA. Fara randul asta, o schimbare de asezare care nu mai potriveste `ANTET`
   * ar face proba sa treaca peste ZERO manere si sa iasa verde. Masurat: 69.
   */
  /* ⚠ 72, nu 69: se numara APRINDERILE, nu functiile. Vezi nota din `manere()`. */
  assert.ok(toate.length >= 72, `gasite doar ${toate.length} aprinderi de steag: plasa n-are pe cine cadea`);

  const cuAsteptare = toate.filter((m) => m.asteapta);
  assert.ok(cuAsteptare.length >= 65,
    `doar ${cuAsteptare.length} manere asteapta ceva: plasa s-a ingustat pe nesimtite`);

  /* ⚠ Scutitele nu se numara aici: la ele `finally` ar fi chiar defectul. Vezi
     `NU_SUNT_STEAGURI` si proba care le tine cinstite, mai jos. */
  const stricate = cuAsteptare.filter(
    (m) => !m.corp.includes("finally") && !NU_SUNT_STEAGURI[`${m.fisier} · ${m.nume}`],
  );

  const masurat: Record<string, number> = {};
  for (const m of stricate) masurat[m.fisier] = (masurat[m.fisier] ?? 0) + 1;

  /*
   * ⚠ EGALITATE, nu „cel mult". Un `>=` ar fi lasat reparatiile sa se piarda tacut, iar un
   * `<=` ar fi lasat harta sa ramana in urma. Asa, si regresia, si reparatia nedeclarata cad.
   */
  assert.deepEqual(
    masurat, INCA_NEREPARATE,
    "harta manerelor fara `finally` nu mai e cea scrisa. Daca ai REPARAT una, coboara numarul "
    + "(sau scoate fereastra din harta) in acelasi commit; daca a aparut una noua, un buton "
    + "ramane invartindu-se pana la reincarcarea paginii:\n"
    + `masurat  = ${JSON.stringify(masurat, null, 2)}\n`
    + `asteptat = ${JSON.stringify(INCA_NEREPARATE, null, 2)}`,
  );
});

test("⚠⚠ si acolo unde E pus, `finally` stinge CHIAR steagul aprins", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT. Un `try/finally` pus corect, dar cu stingerea ramasa
   * afara, arata la fel in diff si trece de proba de mai sus: `finally` exista in corp. Aici
   * se cere lucrul care conteaza, adica `setX(false)` sa fie chiar INAUNTRUL lui.
   */
  const gresite: string[] = [];

  for (const m of toateManerele()) {
    if (!m.asteapta || !m.corp.includes("finally")) continue;

    /*
     * ⚠ VREUN `finally` CARE STINGE CHIAR STEAGUL ASTA, nu primul din corp (14.09.2026).
     *
     * De cand se numara pe APRINDERE, o functie cu doua steaguri da doua randuri care impart
     * acelasi corp. `handleSelectService` de la Woot are doua asteptari, fiecare cu `finally`-ul
     * ei; uitandu-ma doar la primul, randul celui de-al doilea steag cadea desi era reparat.
     * Afirmatia fusese scrisa cand un rand insemna o functie.
     */
    const tipar = new RegExp(`finally\\s*\\{[^}]*set${m.steag}\\(false\\)`);

    if (!tipar.test(m.corp)) {
      gresite.push(`${m.fisier} · ${m.nume}: \`finally\` nu stinge \`set${m.steag}\``);
    }
  }

  assert.deepEqual(gresite, [],
    "la manerele astea `finally` e pus, dar stingerea steagului a ramas afara, deci butonul "
    + `tot se blocheaza cand apelul se respinge:\n${gresite.join("\n")}`);
});

test("⚠ ferestrele deja reparate raman reparate, si sunt numite", () => {
  /*
   * FAN (3 manere + 2 la ridicare) si eColet (4) au primit leacul in valul lor. Ele NU sunt in
   * harta, deci numarul lor asteptat e zero, si asta e chiar ce le apara: orice `finally` scos
   * de acolo urca harta si cade proba de mai sus. Randul asta exista ca sa se vada de ce.
   */
  const reparate = ["FanCourierAwbModal.tsx", "FanCourierPickupModal.tsx", "EcoletAwbModal.tsx"];

  for (const nume of reparate) {
    assert.equal(INCA_NEREPARATE[nume], undefined,
      `${nume} e reparata, deci n-are ce cauta in harta celor nereparate`);
  }

  const cateReparate = toateManerele()
    .filter((m) => reparate.includes(m.fisier) && m.asteapta)
    .length;
  assert.ok(cateReparate >= 9,
    `doar ${cateReparate} manere reparate gasite in FAN si eColet, asteptam macar 9`);
});

test("⚠⚠ un callback de tranzitie care asteapta trebuie sa PRINDA caderea", () => {
  /*
   * ⚠ ALT DEFECT DECAT STEAGURILE, si de aceea nu e in harta.
   *
   * `startCreate(async () => …)` nu aprinde niciun steag de mana: butonul se stinge dupa
   * `isPending`. Dar o actiune care ARUNCA acolo nu e prinsa de nimeni IN FEREASTRA. Singurele
   * granite de erori din proiect sunt `app/error.tsx` si `app/global-error.tsx`, amandoua la
   * radacina, iar cea dintai inlocuieste TOT panoul cu o pagina de 500: comerciantul pierde
   * formularul completat si tot nu afla daca AWB-ul a plecat.
   *
   * ⚠ Documentatia React NU spune ce se intampla cu `isPending` la o respingere; spune doar ca
   * ramane `true` pana cand Actiunile „se incheie", si trimite la o granita de erori. Deci nu se
   * pretinde aici nimic despre butonul care ramane rotind: se cere doar ca omul sa primeasca un
   * mesaj in loc de o pagina de 500.
   *
   * ⚠ MASURAT: 4 callbackuri de tranzitie in ferestrele de curier, Colete doua si Woot doua.
   */
  const DESCHIDE = /^ {4}start[A-Z][A-Za-z]*\(async \(\) => \{$/;
  const INCHIDE = /^ {4}\}\);$/;

  let cate = 0;
  const fara: string[] = [];

  for (const nume of ferestreleDeCurier()) {
    const linii = sursa(nume).split("\n");
    for (let i = 0; i < linii.length; i++) {
      if (!DESCHIDE.test(linii[i])) continue;
      let j = i + 1;
      while (j < linii.length && !INCHIDE.test(linii[j])) j++;
      const corp = linii.slice(i, j).join("\n");
      cate++;
      if (corp.includes("await ") && !/catch\s*[({]/.test(corp)) {
        fara.push(`${nume} · callbackul de la randul ${i + 1}`);
      }
    }
  }

  assert.ok(cate >= 4,
    `gasite doar ${cate} callbackuri de tranzitie: plasa n-are pe cine cadea`);

  assert.deepEqual(fara, [],
    "callbackurile astea asteapta o actiune de server fara sa prinda caderea, deci o aruncare "
    + "inlocuieste tot panoul cu pagina de 500 de la radacina, si omul pierde formularul "
    + `completat fara sa afle daca expedierea a plecat:\n${fara.join("\n")}`);
});

test("⚠⚠ scutirile raman cinstite: exista, sunt reparate ALTFEL, si n-au voie sa capete `finally`", () => {
  /*
   * ⚠ O scutire nesupravegheata e o portita. Trei lucruri se cer de la fiecare:
   *
   *   1. manerul CHIAR exista. Redenumit sau sters, scutirea ar acoperi neantul, iar un maner
   *      nou cu acelasi nume ar mosteni-o fara sa fi cerut-o nimeni;
   *   2. e scutit de `finally`, NU de reparatie: steagul tot trebuie stins pe CADERI, deci
   *      trebuie sa existe o prindere a caderii;
   *   3. si nu are `finally`. Daca ajunge sa aiba, ori cineva l-a pus din obisnuinta si a
   *      stricat panoul, ori intelesul steagului s-a schimbat si scutirea trebuie SCOASA.
   */
  const toate = toateManerele();

  for (const [cheie, motiv] of Object.entries(NU_SUNT_STEAGURI)) {
    const [fisier, nume] = cheie.split(" · ");
    const m = toate.find((x) => x.fisier === fisier && x.nume === nume);

    if (!m) {
      assert.fail(
        `scutirea \`${cheie}\` nu mai potriveste niciun maner: redenumit sau sters. `
        + `Scoate-o, altfel acopera neantul. Motivul ei era: ${motiv}`,
      );
    }

    /* ⚠ SI `catch {`, nu doar `catch (e)`. Legatura e optionala in limbaj si se foloseste chiar
       in fisierele astea (vezi `handleDownload` la Sameday). Tiparul dintai cerea paranteza si
       cadea pe cod BUN, adica plasa era prea ingusta, nu codul gresit. */
    assert.match(
      m.corp, /catch\s*[({]/,
      `${cheie}: e scutit de \`finally\`, dar nu prinde caderea nicaieri, deci steagul ramane `
      + "aprins cand apelul arunca. Scutirea e de la FORMA reparatiei, nu de la reparatie.",
    );

    assert.ok(
      !m.corp.includes("finally"),
      `${cheie}: are acum \`finally\`. Ori l-a pus cineva din obisnuinta si a stricat purtarea `
      + `descrisa in scutire, ori intelesul steagului s-a schimbat si scutirea trebuie scoasa `
      + `din NU_SUNT_STEAGURI. Motivul scutirii: ${motiv}`,
    );
  }
});
