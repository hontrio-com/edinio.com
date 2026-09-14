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
*/

const DIR = "src/components/dashboard";

/**
 * Cate manere mai asteapta reparatia, pe fereastra. ⚠ LISTA SCADE, si fiecare numar coborat
 * merge in acelasi commit cu reparatia lui. O fereastra reparata de tot IESE din harta.
 */
const INCA_NEREPARATE: Record<string, number> = {
  "CargusAwbModal.tsx": 2,
  "CargusPickupModal.tsx": 1,
  "ColeteAwbModal.tsx": 2,
  "DhlAwbModal.tsx": 5,
  "DpdAwbModal.tsx": 2,
  "DpdPickupModal.tsx": 1,
  "FedexAwbModal.tsx": 4,
  "InnoshipAwbModal.tsx": 4,
  "PacketaAwbModal.tsx": 3,
  "PallexAwbModal.tsx": 3,
  "SamedayAwbModal.tsx": 4,
  "ShipoAwbModal.tsx": 5,
  "SmartshipAwbModal.tsx": 10,
  "UpsAwbModal.tsx": 5,
  "WootAwbModal.tsx": 2,
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

type Maner = { fisier: string; nume: string; steag: string; corp: string };

/* Antetul unei functii din corpul componentei, si acolada care o inchide la acelasi nivel. */
const ANTET = /^ {2}(?:const [A-Za-z_$][\w$]*\s*=|async function |function )/;
const SFARSIT = /^ {2}\}[;)]*\s*$/;

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
  const vazute = new Set<number>();

  for (let i = 0; i < linii.length; i++) {
    const m = /\bset([A-Za-z][A-Za-z0-9]*)\(true\)/.exec(linii[i]);
    if (!m) continue;

    let start = 0;
    for (let j = i; j >= 0; j--) {
      if (ANTET.test(linii[j])) { start = j; break; }
    }
    if (vazute.has(start)) continue;
    vazute.add(start);

    let sfarsit = linii.length;
    for (let j = i; j < linii.length; j++) {
      if (SFARSIT.test(linii[j])) { sfarsit = j + 1; break; }
    }

    const antet = linii[start].trim();
    const nume = antet.replace(/^(?:const |async function |function )/, "").split(/\s*=|\(/)[0].trim();
    gasite.push({ fisier, nume, steag: m[1], corp: linii.slice(start, sfarsit).join("\n") });
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
  assert.ok(toate.length >= 69, `gasite doar ${toate.length} manere cu steag: plasa n-are pe cine cadea`);

  const cuAsteptare = toate.filter((m) => m.corp.includes("await "));
  assert.ok(cuAsteptare.length >= 65,
    `doar ${cuAsteptare.length} manere asteapta ceva: plasa s-a ingustat pe nesimtite`);

  const stricate = cuAsteptare.filter((m) => !m.corp.includes("finally"));

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
    if (!m.corp.includes("await ") || !m.corp.includes("finally")) continue;

    const i = m.corp.indexOf("finally");
    const dupa = m.corp.slice(i);
    const inchidere = dupa.indexOf("}");
    const bloc = inchidere === -1 ? dupa : dupa.slice(0, inchidere);

    if (!bloc.includes(`set${m.steag}(false)`)) {
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
    .filter((m) => reparate.includes(m.fisier) && m.corp.includes("await "))
    .length;
  assert.ok(cateReparate >= 9,
    `doar ${cateReparate} manere reparate gasite in FAN si eColet, asteptam macar 9`);
});
