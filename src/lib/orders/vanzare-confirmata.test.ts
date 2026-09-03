import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { vanzareaEConfirmata, asteaptaIncasareOnline, PLATI_ONLINE } from "./vanzare-confirmata";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  O PLATA REFUZATA NU E O VANZARE — NICI PE ECRAN, NICI IN CONTUL DE RECLAME
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DEFECTUL, MASURAT PE MAGAZINE VII (03.09.2026).

  Netopia e singurul procesator FARA ruta de intoarcere. `stripe`, `ipay`,
  `revolut` si `klarna` au fiecare un `/api/<furnizor>/return` care, la esec,
  trimite clientul la `/confirm?status=esuat`. Netopia il trimite direct la
  `/{slug}/confirm?orderId=…`, la orice deznodamant.

  Pagina de confirmare ARE ecran de esec si iese devreme la `status === "esuat"` —
  dar Netopia nu aseaza niciodata acel parametru. Deci o plata refuzata ajungea pe
  ecranul de izbanda si trimitea, in contul COMERCIANTULUI, Meta `Purchase`, TikTok
  `PlaceAnOrder` + `CompletePayment`, GA4 `purchase` si conversia Google Ads, cu
  valoarea intreaga.

  Din 32 de comenzi Netopia, 15 sunt neplatite.

  ⚠ SI A DOUA JUMATATE, gasita cautand-o pe prima: conversia GA4 de pe server pleca
  la CREAREA comenzii, deci inainte ca omul sa ajunga la procesator. Aceea nu
  depindea de nicio pagina.
*/

test("⚠ la RAMBURS comanda ESTE vanzarea, si asta nu se atinge", () => {
  /*
    ⚠ CE APARA, si e cea mai umblata cale din magazine: 165 din 343 de comenzi sunt
    cu plata la livrare, toate `unpaid` in clipa comenzii. O regula „doar `paid`"
    le-ar fi taiat conversia tuturor — adica reparatia ar fi facut mai mult rau
    decat defectul.
  */
  assert.equal(vanzareaEConfirmata("cash_on_delivery", "unpaid"), true,
    "rambursul a pierdut conversia — cea mai umblata cale din magazine");
  assert.equal(vanzareaEConfirmata("cash_on_delivery", null), true);
  assert.equal(vanzareaEConfirmata("cash_on_delivery", "paid"), true);

  /* ⚠ Si comenzile de marketplace, care nici nu trec pe aici, raman nevatamate. */
  assert.equal(vanzareaEConfirmata("emag", "unpaid"), true);
  assert.equal(vanzareaEConfirmata("trendyol", "paid"), true);
});

test("⚠ la plata ONLINE, vanzarea e incasarea", () => {
  for (const metoda of PLATI_ONLINE) {
    assert.equal(vanzareaEConfirmata(metoda, "paid"), true, `${metoda}: o plata reusita nu mai raporteaza`);
    assert.equal(vanzareaEConfirmata(metoda, "unpaid"), false, `${metoda}: o plata NEincasata raporteaza venit`);
    assert.equal(vanzareaEConfirmata(metoda, null), false, `${metoda}: lipsa starii raporteaza venit`);
    assert.equal(vanzareaEConfirmata(metoda, "refunded"), false, `${metoda}: o plata intoarsa raporteaza venit`);
  }

  /* ⚠ Netopia e cazul care a nascut regula. */
  assert.equal(vanzareaEConfirmata("netopia", "unpaid"), false,
    "o plata Netopia refuzata raporteaza iar venit in contul comerciantului");

  /* ⚠ Si scrierea cu majuscule nu ocoleste regula. */
  assert.equal(vanzareaEConfirmata("NETOPIA", "UNPAID"), false, "metoda scrisa cu majuscule ocoleste regula");
  assert.equal(vanzareaEConfirmata("Netopia", "Paid"), true, "starea scrisa cu majuscule blocheaza o vanzare adevarata");
});

test("⚠ o metoda necunoscuta se poarta ca rambursul, si de ce anume asa", () => {
  /*
    ⚠ LISTA E POZITIVA, dinadins. O metoda noua adaugata maine si uitata de aici va
    fi tratata ca ramburs — deci conversia pleaca la comanda. Directia asta
    greseste in PLUS.

    Alternativa („toate afara de ramburs asteapta incasare") ar fi taiat tacut
    rambursul la prima greseala de scriere a numelui — adica ar fi omorat 165 din
    343 de conversii, si nimic n-ar fi cazut.
  */
  assert.equal(asteaptaIncasareOnline("metoda-inventata"), false);
  assert.equal(vanzareaEConfirmata("metoda-inventata", "unpaid"), true);
  assert.equal(asteaptaIncasareOnline(null), false);
  assert.equal(asteaptaIncasareOnline(undefined), false);
});

test("⚠ toti procesatorii online sunt in lista, si lista e cea a rutelor lor", () => {
  /*
    ⚠ CE APARA, si e chiar felul in care s-a nascut defectul: patru procesatori
    aveau ruta de intoarcere, al cincilea nu, si nimic n-a cazut. Daca maine se
    adauga un al saselea si nimeni nu-l trece aici, plata lui refuzata ar raporta
    iar venit.

    Se cere ca fiecare director `src/app/api/<furnizor>` care porneste o plata sa
    fie in lista. Se citeste din STRUCTURA, nu dintr-o a doua lista scrisa de mana.
  */
  /* ⚠ Citirea de fisiere sta la IMPORTURI: `require` merge sub `tsx` dar nu si
     sub rulatorul oficial (ESM). Proba trecea intr-unul si cadea in celalalt. */
  const furnizoriCuStart = readdirSync("src/app/api", { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => existsSync(`src/app/api/${n}/start/route.ts`) || existsSync(`src/app/api/${n}/return/route.ts`));

  const lipsa = furnizoriCuStart.filter((n) => !(PLATI_ONLINE as readonly string[]).includes(n));
  assert.deepEqual(
    lipsa, [],
    "procesatori care pornesc o plata dar nu sunt in `PLATI_ONLINE` — o plata refuzata la ei ar raporta venit: " + lipsa.join(", "),
  );
});

test("⚠ pagina de confirmare CHIAR sta sub regula, si porneste de la `false`", () => {
  /*
    ⚠ CUTITUL TAIE IN AMANDOUA PARTILE. Regulile de mai sus sunt ale unei functii
    pure; ce conteaza e ca evenimentul de cumparare sa stea sub ea.
  */
  const cod = faraComentarii(readFileSync("src/app/(public)/[slug]/confirm/page.tsx", "utf8"));

  assert.match(cod, /vanzareaEConfirmata\(/, "pagina nu mai intreaba regula");
  assert.match(cod, /\{orderId && vanzareConfirmata && \(/,
    "`FbPurchaseEvent` nu mai sta sub regula — o plata refuzata raporteaza iar venit");

  /*
    ⚠ SI CA PORNESTE DE LA `false`. Fara `orderId`, sau daca citirea comenzii cade,
    nu stim nimic despre plata. Pornita de la `true`, orice cale pe care citirea
    esueaza ar trimite o conversie pe nestiute.
  */
  assert.match(cod, /let vanzareConfirmata = false;/,
    "steagul nu mai porneste de la `false` — o citire cazuta ar raporta venit");

  /* ⚠ Si ca randul chiar aduce campurile pe care regula le cere. */
  assert.match(cod, /payment_method, payment_status/,
    "pagina nu mai citeste starea platii din baza");
});

test("⚠ conversia de server pleaca la INCASARE pentru plati online, la CREARE pentru ramburs", () => {
  /*
    ⚠ A DOUA JUMATATE A DEFECTULUI. Conversia GA4 de pe server pleca la crearea
    comenzii, pentru orice metoda — deci si pentru carduri, inainte ca omul sa fi
    ajuns la procesator. Nu depindea de nicio pagina, deci poarta din pagina de
    confirmare n-ar fi acoperit-o.
  */
  const creare = faraComentarii(readFileSync("src/lib/actions/order.actions.ts", "utf8"));
  assert.ok(!/ga4OrderEvent\(/.test(creare), "ajutorul vechi s-a intors in actiunea de server");

  /* Ambele locuri de creare stau sub poarta. */
  const porti = (creare.match(/if \(!asteaptaIncasareOnline\(metodaPlata\)\) \{/g) ?? []).length;
  assert.equal(porti, 2,
    `doar ${porti} din cele doua cai de creare a comenzii sta sub poarta — una raporteaza iar venit pentru carduri`);

  /* Si finalizarea platii o raporteaza, o singura data. */
  const finalizare = faraComentarii(readFileSync("src/lib/orders/finalizare-plata.ts", "utf8"));
  const iDupaPlata = finalizare.indexOf("function dupaPlata(");
  assert.ok(iDupaPlata > 0, "nu mai gasesc drumul care se aprinde o singura data");
  assert.match(finalizare.slice(iDupaPlata), /raporteazaCumparareaDupaIncasare\(comanda\.id\)/,
    "conversia online nu mai pleaca la confirmarea incasarii — pentru carduri nu mai pleaca deloc");

  /* Si marcarea manuala din panou, care NU trece prin finalizare. */
  assert.match(creare, /paymentChanged && data\.payment_status === "paid" && asteaptaIncasareOnline\(/,
    "marcarea manuala a platii din panou nu mai raporteaza conversia — s-ar pierde tacut");
});
