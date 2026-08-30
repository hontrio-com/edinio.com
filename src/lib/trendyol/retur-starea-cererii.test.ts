import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asteaptaHotarare, stareaCererii, STARI_DE_HOTARAT } from "./retur-forma";
import type { TrendyolClaim } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   EI NU TRIMIT NICIUN STATUS LA NIVEL DE CERERE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Se scria `claim_status: c.status ?? null`, iar `status` era un camp pe care nu-l verificase
   nimeni. VERIFICAT in raspunsul-exemplu din `reference/getclaims`: campurile de nivel intai ale
   unei cereri sunt

       id · claimId · orderNumber · orderDate · customerFirstName · customerLastName · claimDate
       cargoTrackingNumber · cargoTrackingLink · cargoSenderNumber · cargoProviderName
       orderShipmentPackageId · replacementOutboundpackageinfo · rejectedpackageinfo · items
       lastModifiedDate · orderOutboundPackageId

   `status` NU e printre ele. Starea sta la `items[].claimItems[].claimItemStatus.name` — de-aia
   si parametrul lor de cautare se numeste `claimItemStatus`.

   ⚠ CE COSTA: `claim_status` iesea NULL la FIECARE cerere, iar panoul cerea
   `in("claim_status", [...])`, care nu potriveste niciodata un NULL. Lista „Așteaptă răspunsul
   tău" ar fi fost GOALA oricat de multe retururi ar fi avut comerciantul — fara eroare, fara
   jurnal, doar un ecran linistit. Retururile lui expirau netratate.

   ⚠ PROBA ASTA CHEAMA FUNCTIA, nu scaneaza sursa. Tocmai o proba care scana sursa a lasat
   defectul sa treaca: confirma ca scrie `c.status`, nu ca `c.status` are ce citi.
*/

/** Tiparul lor, cu invelisul `items[] -> claimItems[]` din referinta. */
const cerere = (...stari: string[]): TrendyolClaim => ({
  id: "f9da2317-876b-4b86-b8f7-0535c3b65731",
  orderNumber: "1234567890",
  items: [{
    orderLine: { id: 1, productName: "Ceva", barcode: "BC1" },
    claimItems: stari.map((s, i) => ({
      id: `linie-${i}`,
      claimItemStatus: { name: s },
    })),
  }] as never,
});

test("⚠ starea vine din LINII, fiindca acolo o trimit ei", () => {
  assert.equal(stareaCererii(cerere("Created")), "Created");
  assert.equal(stareaCererii(cerere("WaitingInAction")), "WaitingInAction");
  assert.equal(stareaCererii(cerere("Accepted")), "Accepted");
});

test("⚠ un `status` de nivel intai NU se citeste, fiindca ei nu-l trimit", () => {
  /*
   * Daca vreodata ar aparea, tot liniile sunt adevarul: parametrul lor de cautare e
   * `claimItemStatus`, iar ghidul spune ca rezultatul unei respingeri se urmareste pe el.
   */
  const c = { ...cerere("Created"), status: "Accepted" } as TrendyolClaim;
  assert.equal(stareaCererii(c), "Created", "linia bate un camp inventat de nivel intai");
});

test("⚠ un retur PARTIAL trage toata cererea in „de hotarat”", () => {
  /*
   * Ordinea e o hotarare, nu o socoteala: ce conteaza pentru comerciant e daca MAI ARE CEVA DE
   * FACUT. O singura linie care asteapta trage toata cererea.
   *
   * ⚠ IAR „DE HOTARAT" INSEAMNA `WaitingInAction`, NU `Created` (indreptat 26.08.2026). Din
   * ghidul lor: `Created` e „when the customer presses the return button", iar `WaitingInAction`
   * „when the returned orders reaches the supplier". Pe `Created` marfa e inca la client.
   */
  assert.equal(stareaCererii(cerere("Accepted", "WaitingInAction")), "WaitingInAction");
  assert.equal(stareaCererii(cerere("Created", "WaitingInAction")), "WaitingInAction",
    "cea la care omul chiar poate apasa trage, nu cea abia initiata");
  assert.equal(stareaCererii(cerere("Cancelled", "Accepted", "WaitingInAction")), "WaitingInAction");

  /*
   * ⚠ FARA NICIO LINIE DE HOTARAT, CASTIGA CEA MAI DESCHISA — nu prima din tablou (indreptat
   * 26.08.2026). `Rejected` e HOTARATA (s-a respins; mai asteptam doar coletul), iar `Created` NU
   * e: se poate schimba in orice. Deci cea nehotarata trage, oricum ar veni ele in raspuns.
   */
  assert.equal(stareaCererii(cerere("Rejected", "Created")), "Created");
  assert.equal(stareaCererii(cerere("Created", "Rejected")), "Created", "si invers, la fel");
  assert.equal(stareaCererii(cerere("Cancelled", "Accepted", "Created")), "Created");
});

test("⚠ fara nicio linie de hotarat, se ia o stare inca vie", () => {
  /* `Rejected` nu e incheiata: dupa o respingere ei pot crea un colet catre client, iar
     `rejectedPackageInfo` apare abia atunci. */
  assert.equal(stareaCererii(cerere("Accepted", "Rejected")), "Rejected");
  assert.equal(stareaCererii(cerere("Accepted", "InAnalysis")), "InAnalysis");
  /* ⚠ Si un status pe care documentatia lor internationala nu-l explica deloc. */
  assert.equal(stareaCererii(cerere("Accepted", "WaitingFraudCheck")), "WaitingFraudCheck");
});

test("⚠ toate incheiate inseamna incheiata", () => {
  assert.equal(stareaCererii(cerere("Accepted", "Accepted")), "Accepted");
  assert.equal(stareaCererii(cerere("Cancelled")), "Cancelled");
});

test("⚠ fara linii citibile NU se ghiceste", () => {
  /* `null` inseamna „nu stim", iar reconcilierea il trateaza anume ca pe o cerere de
     reintrebat — vezi `STARI_INCHEIATE` si paza `claim_status.is.null`. */
  assert.equal(stareaCererii({ id: "x" } as TrendyolClaim), null);
  assert.equal(stareaCererii(cerere()), null);
});

test("⚠ nici `InAnalysis`, nici `Created` nu sunt „așteaptă răspunsul tău”", () => {
  /*
   * `InAnalysis`: acolo se uita EI. `Created`: din definitia lor, clientul abia a apasat butonul
   * si coletul e inca la el — vezi `retur-cine-poate-apasa.test.ts`. Amandoua aratate asa, l-ar
   * fi trimis pe comerciant sa caute un buton care nu exista, sau sa se uite intr-un colet care
   * nu a sosit.
   */
  assert.equal(asteaptaHotarare("InAnalysis"), false);
  assert.equal(asteaptaHotarare("Created"), false);
  assert.equal(asteaptaHotarare("WaitingInAction"), true);
  assert.equal(asteaptaHotarare(null), false);
  assert.deepEqual([...STARI_DE_HOTARAT], ["WaitingInAction"]);
});

test("⚠ si nimeni nu mai scrie `c.status` in baza", () => {
  const mod = readFileSync("src/lib/trendyol/retururi.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(mod, /claim_status: stareaCererii\(c\)/);
  assert.doesNotMatch(mod, /claim_status: c\.status/);

  /* ⚠ Si panoul filtreaza pe lista adevarata, nu pe una scrisa de mana. */
  const act = readFileSync("src/lib/actions/trendyol-retururi.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(act, /"Created", "WaitingInAction", "InAnalysis"/);
});

test("⚠ si un status pe care NU-L STIM se arata, nu se ascunde", () => {
  /*
   * ═══ ⚠ ACEEASI CAPCANA, IN ALTA HAINA ═══
   *
   * `in(...)` nu potriveste un NULL. `claim_status` se aduna acum din liniile lor — iar daca
   * vreodata n-am putea citi starea unei linii (o forma noua a lui `claimItemStatus`, un raspuns
   * pe care nu l-am mai vazut), cererea ar iesi cu `null` si ar DISPAREA din lista. Adica exact
   * defectul de azi, reintors pe alt drum.
   *
   * ⚠ DIRECTIA SIGURA E INVERSA: mai bine aratat un retur la care omul n-are ce face, decat
   * ascuns unul care cere o apasare si expira netratat.
   *
   * ⚠ MASURAT pe sase cazuri, in tranzactie anulata pe schema adevarata:
   *     forma veche  ->  InAnalysis, WaitingInAction, Created      (GOLUL LIPSESTE)
   *     forma noua   ->  WaitingInAction, GOL                      (fara InAnalysis SI fara Created)
   *
   * ⚠ Masuratoarea de mai sus a fost luata in starea INTERMEDIARA a listei, cand mai continea
   * `Created`. Randul ei spunea, negru pe alb, ca lista „Așteaptă răspunsul tău" contine si
   * retururi abia initiate de client — iar proba trecea, fiindca asertiunile se uita la sintaxa
   * filtrului, nu la randurile intoarse. Un numar masurat care ramane in urma e mai rau decat
   * niciun numar: se citeste ca dovada.
   */
  const act = readFileSync("src/lib/actions/trendyol-retururi.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(act, /claim_status\.is\.null,claim_status\.in\.\(\$\{STARI_DE_HOTARAT\.join\(","\)\}\)/);
  assert.doesNotMatch(act, /q\.in\("claim_status"/, "un `in` simplu ar pierde golul");
});

test("⚠ o cerere pe care n-o citim INTREAGA nu e incheiata", () => {
  /*
   * ═══ ⚠ FUNDUL DE SAC PE CARE MI L-AM FACUT SINGUR (26.08.2026) ═══
   *
   * `stareaCererii` filtra liniile fara stare si hotara din ce ramanea. Deci un retur PARTIAL cu
   * linia A pe `Accepted` si linia B necitibila iesea `Accepted`. De-acolo:
   *
   *   1. `Accepted` e in `STARI_INCHEIATE`, deci reconcilierea scoate cererea din bazin.
   *   2. Aducerea pe fereastra filtreaza dupa data CREARII, care a trecut demult.
   *   3. Starea liniei B ramane NULL pe veci.
   *   4. Iar de cand repunerea in stoc e fail-closed, comerciantul are marfa pe raft si nu o mai
   *      poate repune NICIODATA.
   *
   * ⚠ Fail-closed-ul avea nevoie de o cale de iesire si n-o avea. Calea e asta: cat timp o linie
   * ne scapa, cererea ramane in bazin si se reintreaba.
   */
  const INCHEIATE = ["Accepted", "Cancelled"];
  const iese = (c: TrendyolClaim) => {
    const st = stareaCererii(c);
    return st != null && INCHEIATE.includes(st);
  };

  /* ⚠ Cu o linie necitibila, cererea NU se declara incheiata — oricat ar spune celelalte. */
  assert.equal(stareaCererii(cerere("Accepted", null as never)), null);
  assert.equal(iese(cerere("Accepted", null as never)), false);
  assert.equal(iese(cerere("Cancelled", null as never)), false);

  /* ⚠ Dar cand toate liniile SE CITESC si toate sunt incheiate, cererea iese — altfel bazinul ar
     creste la nesfarsit cu retururi terminate, si i-ar inghesui pe cei vii. */
  assert.equal(stareaCererii(cerere("Accepted", "Accepted")), "Accepted");
  assert.equal(iese(cerere("Accepted", "Accepted")), true);
  assert.equal(iese(cerere("Accepted", "Cancelled")), true);

  /* ⚠ Mingea la comerciant bate orice, inclusiv necunoscutul: acolo chiar are ce apasa. */
  assert.equal(stareaCererii(cerere("Accepted", "WaitingInAction")), "WaitingInAction");
  assert.equal(stareaCererii(cerere("WaitingInAction", null as never)), "WaitingInAction");

  /* ⚠ Dar `Rejected` NU bate necunoscutul: una e hotarata, cealalta se poate schimba in orice.
     Iar daca `Rejected` ar castiga si coletul de retur-respins ar aparea, cererea ar IESI din
     bazin — si linia necitibila ar ramane inghetata pe veci. */
  assert.equal(stareaCererii(cerere("Rejected", null as never)), null);
});

test("⚠ si aflam cand forma starii lor se schimba", () => {
  /*
   * `numeStare` da `null` si cand campul LIPSESTE, si cand exista dar are o forma necunoscuta.
   * Cele doua nu sunt la fel: lipsa e a lor, forma necunoscuta e a noastra.
   *
   * ⚠ Si costa mai mult ca inainte: o stare necitita tine marfa blocata pe raft (repunerea e
   * fail-closed) si tine cererea in bazin pana la `ZILE_DE_REINTREBAT`.
   */
  const mod = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
  assert.match(mod, /const nedescifrate = liniileReturului\(c\)\.filter/);
  assert.match(mod, /brut\.claimItemStatus != null && brut\.claimItemStatus !== ""/);
  assert.match(mod, /forma lor s-a schimbat/);
});

test("⚠ soarta cererii NU atarna de ordinea in care ne dau ei liniile", () => {
  /*
   * ═══ ⚠ FUNDUL DE SAC ADUS DE REGULA „NUMAI ACCEPTED" (26.08.2026) ═══
   *
   * `stareaCererii` lua PRIMA linie neincheiata din tablou, iar `Rejected` si `InAnalysis` erau
   * amandoua „neincheiate". Deci aceeasi cerere primea doua stari dupa cum le trimiteau ei:
   *
   *     [Rejected, InAnalysis] -> „Rejected"      [InAnalysis, Rejected] -> „InAnalysis"
   *
   * ⚠ SI DE ASTA ATARNA O SOARTA. Cererea `Rejected` careia i-a aparut coletul de retur-respins
   * IESE din bazinul de reconciliere; aducerea pe fereastra filtreaza dupa data CREARII, deci
   * n-o mai vede niciodata. Linia `InAnalysis` ramanea inghetata pe veci — si de cand repunerea
   * cere `Accepted`, marfa de pe raftul comerciantului nu se mai putea repune NICIODATA.
   *
   * ⚠ Ghidul lor nu documenteaza nicio sortare a lui `items[]`. Deci cam jumatate din cererile
   * partiale de felul asta cadeau in capcana — si care jumatate, la intamplare.
   */
  const perechi: [string, string][] = [
    ["Rejected", "InAnalysis"],
    ["Rejected", "WaitingFraudCheck"],
    ["Rejected", "Unresolved"],
    ["Rejected", "Created"],
    ["Rejected", "WaitingInAction"],
    ["Accepted", "Rejected"],
    ["Cancelled", "InAnalysis"],
  ];
  for (const [a, b] of perechi) {
    assert.equal(
      stareaCererii(cerere(a, b)), stareaCererii(cerere(b, a)),
      `[${a}, ${b}] si [${b}, ${a}] trebuie sa dea acelasi lucru`,
    );
  }

  /* ⚠ Si o linie NECITIBILA are acelasi rang cu una nehotarata: cat stim noi, se poate schimba
     in orice. Deci nici ea nu poate fi batuta de `Rejected`. */
  assert.equal(stareaCererii(cerere("Rejected", null as never)), null);
  assert.equal(stareaCererii(cerere(null as never, "Rejected")), null);
});

test("⚠ `Rejected` pierde in fata oricarei linii NEHOTARATE, si castiga in fata celor incheiate", () => {
  /*
   * Amandoua sunt „neincheiate", dar una e HOTARATA (s-a respins; mai asteptam doar coletul) si
   * cealalta NU (se poate schimba in orice). Cea nehotarata trebuie sa traga cererea, ca sa ramana
   * in bazin si sa se poata inca rezolva.
   */
  for (const nehotarata of ["Created", "InAnalysis", "WaitingFraudCheck", "Unresolved"]) {
    assert.equal(stareaCererii(cerere("Rejected", nehotarata)), nehotarata, nehotarata);
  }
  /* ⚠ Dar fata de cele incheiate castiga: dupa o respingere poate inca aparea `rejectedPackageInfo`,
     si aia e chiar informatia dupa care ii spunem daca are un colet de trimis inapoi. */
  for (const incheiata of ["Accepted", "Cancelled"]) {
    assert.equal(stareaCererii(cerere(incheiata, "Rejected")), "Rejected", incheiata);
  }
  /* ⚠ Si mingea la comerciant bate tot. */
  assert.equal(stareaCererii(cerere("Rejected", "WaitingInAction")), "WaitingInAction");
});

test("⚠ INVARIANTUL: daca cererea iese din bazin, nicio linie nu mai e nehotarata", () => {
  /*
   * ═══ ⚠ PROPRIETATEA CARE FACE TOT RESTUL SIGUR ═══
   *
   * Reconcilierea scoate din bazin cererile cu `claim_status` in `["Accepted","Cancelled"]`, si
   * pe cele `Rejected` carora le-a aparut coletul de retur-respins. Iesita din bazin, o cerere nu
   * se mai reintreaba NICIODATA: aducerea pe fereastra filtreaza dupa data CREARII.
   *
   * ⚠ DECI TOT CE TREBUIE SA FIE ADEVARAT E ATAT: cand starea cererii e una din alea, nicio linie
   * a ei sa nu mai poata ajunge `Accepted` mai tarziu. Altfel marfa ramane blocata pe raft.
   *
   * ⚠ SE PROBEAZA PE TOATE COMBINATIILE, nu pe cazuri alese de mine. Cele trei funduri de sac de
   * azi au fost toate cazuri la care nu ma gandisem — iar o proba care numara cazurile la care
   * m-am gandit nu prinde exact felul asta de defect.
   */
  const NEHOTARATE = ["Created", "WaitingInAction", "InAnalysis", "WaitingFraudCheck", "Unresolved"];
  const HOTARATE = ["Accepted", "Cancelled", "Rejected"];
  const TOATE = [...NEHOTARATE, ...HOTARATE, null];
  const IESE_DIN_BAZIN = new Set(["Accepted", "Cancelled", "Rejected"]);

  let verificate = 0;
  /* Toate perechile si toate tripletele: noua stari cu putinta (cinci nehotarate, trei hotarate,
     plus „necitibila"), deci 9² + 9³ = 810 cereri. */
  const combinatii: (string | null)[][] = [];
  for (const a of TOATE) {
    for (const b of TOATE) {
      combinatii.push([a, b]);
      for (const c of TOATE) combinatii.push([a, b, c]);
    }
  }

  for (const linii of combinatii) {
    const st = stareaCererii(cerere(...(linii as string[])));
    verificate++;
    if (st == null || !IESE_DIN_BAZIN.has(st)) continue;

    /* ⚠ Cererea poate iesi din bazin. Deci NICIUNA din liniile ei nu mai are voie sa fie
       nehotarata sau necitibila — altfel ar ramane inghetata pe veci. */
    for (const l of linii) {
      assert.ok(
        l !== null && !NEHOTARATE.includes(l),
        `[${linii.map(String).join(", ")}] -> "${st}" iese din bazin, dar linia "${String(l)}" e inca nehotarata`,
      );
    }
  }
  /* ⚠ Pragul e aici ca sa prinda ziua in care cineva scurteaza listele si proba pare sa treaca
     fiindca n-a mai verificat nimic. Prima oara l-am pus la 2000 dintr-o socoteala gresita, si
     proba a picat cu invariantul intreg — un prag trebuie sa fie masurat, nu ghicit. */
  assert.equal(verificate, 810, "s-au verificat mai putine combinatii decat trebuie");
});
