import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  asTablou, avertismenteleDin, codEroare, descrieEroarea, dhlGata, eMediuDeTest, erorileDin,
  FORMAT_IMPLICIT, GAZDE, gazda, INCOTERM_IMPLICIT, INCOTERMURI, linkUrmarire, lunaRidicare,
  MAX_AWB_PE_CERERE, momentExpedierii, numarSauNull, primulCod, referintaMesaj, SABLOANE,
  SABLON_IMPLICIT, serviciileDin, statusEroare, urmareste, VERSIUNE_API, ziuaDhl,
  type DhlConfig, type MediuDhl,
} from "./client";
import { COD_RAMBURS } from "./servicii";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * DHL e al saisprezecelea curier, si e singurul la care o citire gresita a raspunsului
 * costa BANI care nu se mai pot lua inapoi: NU EXISTA ANULARE DE EXPEDIERE (`delete:` apare
 * o singura data in toata specificatia lor, pe ridicare) si NU EXISTA IDEMPOTENTA
 * („idempot" = zero potriviri in 1,2 MB de OpenAPI + 473 de pagini de ghid SOAP). Un AWB
 * emis din greseala ramane emis, si conditiile lor spun verbatim ca „DHL Express may request
 * that You compensate it in the event that You do not subsequently tender a shipment".
 *
 * De aceea probele de aici tin patru clase de defecte tacute:
 *
 *   1. GAZDA. Productia e PREFIXUL testului (`/mydhlapi` fata de `/mydhlapi/test`) — nu
 *      host-uri diferite, ca la FedEx si UPS. Un segment de cale pierdut nu da 404, da
 *      expedieri REALE, facturabile, pe magazine care credeau ca fac probe.
 *
 *   2. CORPUL DE EROARE, care are SASE forme. Codul lor nu are camp propriu: e lipit in
 *      textul liber al lui `detail` („7008: …"), si lipseste cu totul in destule cazuri. Iar
 *      `status` din corp e SUPRAINCARCAT — o data codul HTTP („400"), o data codul lor intern
 *      („998"), pe `/servicepoints` un OBIECT. Cine ia codul de acolo clasifica dupa un numar
 *      care nu inseamna ce pare.
 *
 *   3. `warnings[]` PE UN 200/201. Acolo scrie ca expedierea s-a creat FARA PRET (`7991`,
 *      `7995`), ca ti-au SCHIMBAT codul de judet (`7992`) sau ca tariful intors e cel de
 *      LISTA, nu cel din contractul tau (`6994`-`6996`). Ignorate, totul „reuseste" si
 *      factura vine alta.
 *
 *   4. `998`, codul care inseamna PATRU lucruri, dintre care unul („Process failure occurred")
 *      e „nu stim daca s-a creat". Un `if (cod === "998") return REFUZ` e chiar defectul care
 *      emite al doilea AWB.
 *
 * Fara retea: se probeaza exporturile pure. Singurul `fetch` fals din fisier e cel al
 * urmaririi, si isi spune motivul acolo unde e scris.
 */

function config(peste: Partial<DhlConfig> = {}): DhlConfig {
  return {
    enabled: true,
    username: "utilizator",
    password: "parola",
    account_number: "123456789",
    expeditor: {
      nume: "Depozit",
      telefon: "0721000111",
      strada: "Str. Fabricii nr. 1",
      oras: "Cluj-Napoca",
      cod_postal: "400001",
    },
    ...peste,
  };
}

/** Expeditorul de baza, ca sa se poata strica UN singur camp din el pe rand. */
const EXPEDITOR = config().expeditor!;

describe("DHL: gazdele, si garda dintre „test” si o factura reala", () => {
  test("⚠ productia e PREFIXUL testului — de aici vine toata clasa de defecte", () => {
    /* Nu e o observatie de stil: `"…/mydhlapi/test".slice(0, -5)` e o adresa VALIDA care
       creeaza expedieri reale. La FedEx (`apis-sandbox` fata de `apis`) greseala asta nu se
       putea face. Daca DHL schimba vreodata schema de adrese, proba asta cade si obliga pe
       cineva sa reciteasca garda din `gazda()` inainte sa mearga mai departe. */
    assert.equal(GAZDE.test, `${GAZDE.productie}/test`);
    assert.ok(GAZDE.test.endsWith("/mydhlapi/test"));
    assert.equal(GAZDE.productie.endsWith("/test"), false);
  });

  test("mediul „test” duce in test, productia in productie", () => {
    assert.equal(gazda({ mediu: "test" }), GAZDE.test);
    assert.equal(gazda({ mediu: "productie" }), GAZDE.productie);
  });

  test("⚠ implicitul e PRODUCTIA, si tot acolo cade orice valoare necunoscuta din baza", () => {
    /* `dhl_config.mediu` e text in baza. O valoare veche sau scrisa de mana („sandbox”) nu
       trebuie sa trimita un magazin viu in mediul lor de test, unde AWB-urile nu intra in
       reteaua DHL si nu le ridica nimeni. */
    assert.equal(gazda({}), GAZDE.productie);
    assert.equal(gazda({ mediu: undefined }), GAZDE.productie);
    assert.equal(gazda({ mediu: "sandbox" as MediuDhl }), GAZDE.productie);
  });

  test("⚠ eticheta din panou nu poate minti despre gazda folosita", () => {
    /* Comerciantul nu are alta cale sa afle in ce mediu e: nu exista niciun camp in niciun
       raspuns al lor care sa spuna. Daca cele doua s-ar departa, panoul ar arata „test” in
       timp ce cererile pleaca in productie. */
    for (const m of [undefined, "test", "productie", "sandbox"]) {
      const c = { mediu: m as MediuDhl };
      assert.equal(eMediuDeTest(c), gazda(c).endsWith("/mydhlapi/test"), String(m));
    }
  });

  test("⚠ garda CHIAR arunca daca tabelul de gazde pierde bucata „/test”", () => {
    /* Singura proba care poate arata ca garda functioneaza: se strica tabelul, se cere gazda,
       se pune la loc in `finally`. Fara asta, garda ar fi cod pe care nu-l executa nimeni
       niciodata — si care s-ar putea sterge la o curatenie fara ca nimic sa se schimbe. */
    const tabel = GAZDE as unknown as Record<string, string>;
    const vechiTest = tabel.test;
    const vechiProductie = tabel.productie;
    try {
      tabel.test = GAZDE.productie;
      assert.throws(() => gazda({ mediu: "test" }), (e: unknown) => {
        assert.match((e as Error).message, /nu se termina/);
        /* ⚠ Si e REFUZ, nu „nu stim": n-a plecat nicio cerere, deci reincercarea de dupa ce
           omul repara configurarea trebuie sa fie libera. */
        assert.equal(verdictFurnizor(e), "esuat");
        return true;
      });

      tabel.test = vechiTest;
      tabel.productie = vechiTest;
      assert.throws(() => gazda({}), /mediul de test/);
    } finally {
      tabel.test = vechiTest;
      tabel.productie = vechiProductie;
    }
    assert.equal(gazda({ mediu: "test" }), GAZDE.test);
    assert.equal(gazda({}), GAZDE.productie);
  });
});

describe("DHL: citirea erorilor — sase forme, un singur cititor", () => {
  test("forma documentata: codul e LIPIT in textul lui `detail`, nu are camp propriu", () => {
    const corp = {
      instance: "/mydhlapi/shipments",
      detail: "7008: The requested Special Service Code 'KB' is not available between this origin and destination.",
      title: "Bad request",
      status: "400",
    };
    assert.equal(primulCod(corp), "7008");
    assert.equal(erorileDin(corp)[0].message.startsWith("The requested"), true);
  });

  test("⚠ `status` din corp NU e cod de eroare: uneori e HTTP, uneori codul lor intern", () => {
    /* Amandoua sunt `type: string` in schema lor. Cine citeste codul de acolo primeste „400”
       — care nu e in niciun nomenclator — sau „998”, care inseamna patru lucruri. */
    assert.equal(primulCod({ status: "400", detail: "7008: x" }), "7008");
    assert.equal(primulCod({ status: "998" }), null);
    /* Si nu ajunge nici macar linie de eroare: „400” pus in fata comerciantului nu inseamna
       nimic pentru el, si ar ascunde singurul text pe care il avem. */
    assert.deepEqual(erorileDin({ status: "400", title: "Bad request" }), []);
    assert.equal(descrieEroarea({ status: "400", title: "Bad request" }, ""), "Bad request");
    /* Si nici `code`, cum il scriu noua dintre exemplele lor oficiale, incalcandu-si schema. */
    assert.equal(primulCod({ code: 400, title: "Bad request" }), null);
  });

  test("⚠ forma NEDOCUMENTATA a gateway-ului: `reasons[].msg`, zero campuri comune", () => {
    /* Asa raspunde stratul din fata la credentiale gresite — 147 de octeti, `application/json`,
       fara `detail`, fara `title`, fara `status`. Un cititor scris doar pentru forma
       documentata raporteaza „raspuns gol” pentru un refuz perfect determinist. */
    const corp = { reasons: [{ msg: "Invalid Credentials" }], details: { msgId: "1234" } };
    assert.equal(descrieEroarea(corp, ""), "Invalid Credentials");
    assert.equal(primulCod(corp), null);
  });

  test("⚠ `/servicepoints`: `status` e OBIECT, iar `statusCode: 1` inseamna SUCCES", () => {
    assert.deepEqual(erorileDin({ status: { statusCode: 1, statusMessage: "Success" } }), []);
    const rau = { status: { statusCode: 0, statusMessage: "Error: no service points found" } };
    assert.ok(descrieEroarea(rau, "").includes("no service points"));
  });

  test("`ExceptionResponse` si orice corp care poarta doar `message`", () => {
    assert.ok(descrieEroarea({ message: "Internal Server Error", exception: "…" }, "").includes("Internal"));
  });

  test("⚠ `message` NU se adauga peste `detail` — ele poarta acelasi lucru de doua ori", () => {
    assert.deepEqual(erorileDin({ message: "acelasi lucru", detail: "1004: x" }).map((e) => e.code), ["1004"]);
  });

  test("`additionalDetails[]` se citeste, si repetitiile lor nu ajung la comerciant", () => {
    const corp = {
      detail: "Validation failed",
      additionalDetails: ["410117: Weight is below minimum", "410117: Weight is below minimum"],
    };
    assert.equal(erorileDin(corp).length, 3);
    /* Trei erori, doua texte: cel repetat apare o singura data in mesajul final. */
    assert.equal(descrieEroarea(corp, "").split(" | ").length, 2);
  });

  test("un cod lipsa nu e un defect — destule mesaje ale lor n-au niciunul", () => {
    const corp = { detail: "Missing mandatory parameters: shipperAccountNumber" };
    assert.equal(primulCod(corp), null);
    assert.ok(descrieEroarea(corp, "").includes("shipperAccountNumber"));
  });

  test("⚠ `title` NU e discriminator: acelasi „Bad request” pe cauze fara nicio legatura", () => {
    /* Apare de nouasprezece ori in specificatia lor, de la „data prost formatata” pana la
       „serviciul nu exista pe ruta asta”. Se foloseste doar cand nu mai e nimic altceva. */
    assert.ok(descrieEroarea({ title: "Bad request", detail: "1004: x" }, "").includes("produsul asta"));
    assert.equal(descrieEroarea({ title: "Bad request" }, ""), "Bad request");
  });

  test("corp necitibil: se arata textul brut, nu „raspuns gol”", () => {
    assert.ok(descrieEroarea(null, "<html>502 Bad Gateway</html>").includes("502"));
    assert.equal(descrieEroarea(null, ""), "raspuns gol");
    assert.equal(descrieEroarea(undefined, "   "), "raspuns gol");
    /* Un corp HTML de cateva zeci de kiloocteti nu are ce cauta intr-un jurnal de comanda. */
    assert.ok(descrieEroarea(null, "x".repeat(5000)).length <= 300);
  });
});

describe("DHL: nomenclatorul de erori, si `998` care inseamna PATRU lucruri", () => {
  test("⚠⚠ „Process failure” NU e „cont invalid”, desi amandoua vin ca `998`", () => {
    const proces = descrieEroarea(
      { detail: "998: Process failure occurred. Process ID associated for that transaction is 1234." },
      "",
    );
    assert.ok(proces.includes("NU o repeta"));
    /* Daca ar cadea pe ramura contului, comerciantul ar cauta o greseala de configurare
       inexistenta — si, mai rau, ar reincerca o emitere care poate a reusit deja. */
    assert.equal(proces.includes("numarul de cont"), false);
  });

  test("celelalte trei intelesuri ale lui `998` se despart dupa TEXT", () => {
    assert.ok(descrieEroarea({ detail: "998: The shipment date cannot be in the past or more than 10 days in future." }, "").includes("10 zile"));
    assert.ok(descrieEroarea({ detail: "998: The account number is not allowed for PaperLessTrade." }, "").includes("Paperless"));
    assert.ok(descrieEroarea({ detail: "998: The account number is not found or invalid." }, "").includes("numarul de cont"));
  });

  test("⚠ `7008` spune si ce sa faca omul: DHL nu vinde ramburs cu origine Romania", () => {
    /* Nu cade la cotare, cade la EMITERE — adica dupa ce cumparatorul a comandat si a plecat. */
    assert.ok(descrieEroarea({ detail: "7008: The requested Special Service Code 'KB' is not available." }, "").includes("ramburs"));
  });

  test("codurile care se pot repara singure ajung in romana", () => {
    assert.ok(descrieEroarea({ detail: "3008: Postal code is invalid" }, "").includes("6 cifre"));
    assert.ok(descrieEroarea({ detail: "9001: The x-version header value is invalid." }, "").includes("x-version"));
    assert.ok(descrieEroarea({ detail: "1504: No document images found" }, "").includes("copia pastrata"));
    assert.ok(descrieEroarea({ detail: "410117: below minimum" }, "").includes("0,1 kg"));
  });

  test("un cod necunoscut trece mai departe cu mesajul si codul LOR", () => {
    /* 1830 de coduri in nomenclatorul lor; traduse sunt doar cele din fluxul nostru. Un mesaj
       strain e mai bun decat unul romanesc inventat gresit. */
    const text = descrieEroarea({ detail: "424242: Ceva nou si neasteptat" }, "");
    assert.ok(text.includes("Ceva nou si neasteptat"));
    assert.ok(text.includes("424242"));
  });
});

describe("DHL: `warnings[]` pe un raspuns de SUCCES", () => {
  test("⚠⚠ un 201 cu AWB si FARA pret: expedierea exista si e facturabila", () => {
    /* Cine ia tariful din raspunsul de emitere si il trece in comanda incaseaza zero, in timp
       ce DHL factureaza transportul. Avertismentul e singurul semn ca s-a intamplat. */
    const corp = {
      shipmentTrackingNumber: "1234567890",
      warnings: ["7991: Rate Request service failure. No charges returned in response message."],
    };
    assert.deepEqual(erorileDin(corp), []);
    assert.ok(avertismenteleDin(corp)[0].includes("fara niciun pret"));
  });

  test("`7992`: DHL ti-a SCHIMBAT codul de judet, si eticheta se tipareste cu al lor", () => {
    assert.ok(avertismenteleDin({ warnings: ["7992: County code has been changed"] })[0].includes("judet"));
  });

  test("⚠ `6994`: pretul intors e cel de LISTA, nu cel din contractul tau", () => {
    /* Cotarea „reuseste”, cumparatorul plateste tariful public, iar diferenta o vede
       comerciantul abia pe factura DHL. */
    const corp = { products: [{ productCode: "P" }], warnings: [{ message: "6994: account settings" }] };
    assert.ok(avertismenteleDin(corp)[0].includes("cel de lista"));
  });

  test("⚠ un singur avertisment poate veni ca SIR, nu ca tablou", () => {
    assert.deepEqual(
      avertismenteleDin({ warnings: "7995: No charges returned in response message." }),
      ["DHL a creat expedierea dar n-a intors niciun pret."],
    );
  });

  test("avertismentele netraduse se arata ca atare, cu codul lor cu tot", () => {
    assert.deepEqual(avertismenteleDin({ warnings: ["200203: #/items/number:1/ bla"] }), ["200203: #/items/number:1/ bla"]);
  });

  test("fara avertismente nu se inventeaza niciunul, si nimic nu crapa", () => {
    assert.deepEqual(avertismenteleDin({ products: [] }), []);
    assert.deepEqual(avertismenteleDin(null), []);
    assert.deepEqual(avertismenteleDin("nu e obiect"), []);
  });

  test("se repeta o singura data, si nu inunda jurnalul comenzii", () => {
    assert.equal(avertismenteleDin({ warnings: ["acelasi", "acelasi"] }).length, 1);
    assert.equal(avertismenteleDin({ warnings: Array.from({ length: 25 }, (_, i) => `numarul ${i}`) }).length, 20);
  });
});

describe("DHL: tablourile care nu sunt mereu tablouri", () => {
  test("⚠ exemplele lor isi incalca propria schema pe `documents[]`, `warnings[]` si 422", () => {
    assert.deepEqual(asTablou({ a: 1 }), [{ a: 1 }]);
    assert.deepEqual(asTablou([{ a: 1 }, { a: 2 }]), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(asTablou(null), []);
    assert.deepEqual(asTablou(undefined), []);
    assert.deepEqual(asTablou([]), []);
  });

  test("numerele lor vin ca siruri, si „lipsa” nu e zero", () => {
    /* `Number(null)` si `Number("")` dau ZERO, iar un zero pus in locul unei lipse a golit
       deja toate feedurile Facebook o data (august 2026). */
    assert.equal(numarSauNull("12.50"), 12.5);
    assert.equal(numarSauNull(""), null);
    assert.equal(numarSauNull(null), null);
    assert.equal(numarSauNull(undefined), null);
    assert.equal(numarSauNull("nu e numar"), null);
    assert.equal(numarSauNull(0), 0);
  });
});

describe("DHL: „configurat” inseamna acelasi lucru peste tot", () => {
  test("fara credentiale sau fara cont nu e gata", () => {
    assert.equal(dhlGata(config()), true);
    assert.equal(dhlGata(config({ enabled: false })), false);
    assert.equal(dhlGata(config({ username: "" })), false);
    assert.equal(dhlGata(config({ password: "" })), false);
    assert.equal(dhlGata(config({ account_number: "" })), false);
    assert.equal(dhlGata(null), false);
    assert.equal(dhlGata(undefined), false);
  });

  test("⚠ adresa de expeditie intra in ea: fara ea, checkoutul arata tariful FIX", () => {
    /* Si nu arata nicaieri ca lipseste ceva — cumparatorii platesc alt transport, iar
       comerciantul afla din factura. Aceeasi lectie ca la FedEx, UPS si Shipo. */
    assert.equal(dhlGata(config({ expeditor: undefined })), false);
    assert.equal(dhlGata(config({ expeditor: { ...EXPEDITOR, oras: "" } })), false);
    assert.equal(dhlGata(config({ expeditor: { ...EXPEDITOR, cod_postal: "" } })), false);
  });

  test("spatiile nu tin loc de valoare", () => {
    assert.equal(dhlGata(config({ username: "   " })), false);
    assert.equal(dhlGata(config({ account_number: " " })), false);
    assert.equal(dhlGata(config({ expeditor: { ...EXPEDITOR, cod_postal: "  " } })), false);
  });

  test("restul configurarii e optional: un cont proaspat legat e deja gata", () => {
    assert.equal(dhlGata(config({ mediu: "test" })), true);
    assert.equal(dhlGata(config({ produse_permise: [], incoterm: undefined })), true);
  });
});

describe("DHL: data si ora, in fusul Romaniei", () => {
  test("⚠ ziua ROMANEASCA, nu cea UTC — `toISOString()` ar muta granita cu trei ore", () => {
    /* 02:30 in Romania pe 16 august = inca 15 august in UTC. Fereastra `dateRangeFrom` a
       cautarii dupa referinta e singura cale inapoi dintr-un raspuns pierdut; daca ea cade pe
       ziua UTC, cauta in ziua in care AWB-ul nu s-a emis. */
    assert.equal(ziuaDhl(new Date("2026-08-15T23:30:00Z")), "2026-08-16");
    assert.equal(ziuaDhl(new Date("2026-01-05T21:59:00Z")), "2026-01-05");
  });

  test("⚠ intre 00:00 si 00:59 ziua NU se da inapoi (`h23`, nu `h24`)", () => {
    /* Cu `hour12: false`, ICU poate alege `h24`, unde miezul noptii se formateaza „24” cu ziua
       CARE SE INCHEIE. Adica exact in prima ora a zilei, data ar fi cea de ieri. Regresia
       gasita la FedEx. 22:30 UTC iarna = 00:30 in Romania. */
    assert.equal(ziuaDhl(new Date("2026-01-05T22:30:00Z")), "2026-01-06");
    assert.equal(ziuaDhl(new Date("2026-06-30T21:30:00Z")), "2026-07-01");
  });

  test("⚠ si ora din prima ora a zilei se scrie „00”, nu „24” si nu „12 AM”", () => {
    /* Pe ICU-ul de azi, `h24` lasa ziua pe loc si strica DOAR ora: DHL ar primi
       `…T24:30:00 GMT+02:00`, o ora care nu exista, la o cerere care altfel e corecta. Iar
       fara `hourCycle` deloc, implicitul lui `en-US` e `h12` si iese „12:30”, adica pranzul.
       22:30 UTC iarna = 00:30 in Romania a doua zi. */
    const an = new Date().getUTCFullYear() + 1;
    assert.equal(momentExpedierii(new Date(Date.UTC(an, 0, 15, 22, 30, 0))), `${an}-01-16T00:30:00 GMT+02:00`);
  });

  test("⚠ `plannedShippingDateAndTime`: forma CU SPATIU inainte de `GMT`, exact 29 de caractere", () => {
    /* Documentatia lor scrie amandoua formele in acelasi fisier. Arbitrul e `maxLength: 29`:
       forma cu spatiu are 29 de caractere, cea fara are 28. Un plafon de 29 n-are alta
       explicatie, iar mesajul lor de eroare 400 arata tot forma cu spatiu. */
    const an = new Date().getUTCFullYear() + 1;
    const iarna = momentExpedierii(new Date(Date.UTC(an, 0, 15, 10, 0, 0)));
    assert.equal(iarna, `${an}-01-15T12:00:00 GMT+02:00`);
    assert.equal(iarna.length, 29);
    assert.match(iarna, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} GMT[+-]\d{2}:\d{2}$/);
  });

  test("⚠ decalajul NU e fix: +02:00 iarna, +03:00 vara", () => {
    /* Scris in cod, ar fi gresit vreo sapte luni pe an si ar muta ora fata de pragul lor de
       preluare cu 60 de minute — fara nicio eroare, doar cu alt set de produse si alta data
       estimata de livrare. Anul urmator, ca proba sa fie mereu in viitor. */
    const an = new Date().getUTCFullYear() + 1;
    assert.equal(momentExpedierii(new Date(Date.UTC(an, 6, 15, 10, 0, 0))), `${an}-07-15T13:00:00 GMT+03:00`);
  });

  test("⚠ un moment din TRECUT e impins inainte, nu trimis ca atare", () => {
    /* Verbatim: „It is not recommended to populate this field with current time … as it may be
       evaluated as being in the past”. Evaluat asa, cade cu `998 The shipment date cannot be in
       the past`. */
    const impins = momentExpedierii(new Date("2020-01-01T00:00:00Z"));
    assert.equal(impins.startsWith("2020"), false);
    assert.ok(impins.slice(0, 10) >= ziuaDhl(new Date()));
    assert.equal(impins.length, 29);
  });

  test("⚠ luna ridicarii: fara ea nu se poate reimprima NIMIC, si ghicita gresit tace", () => {
    /* `pickupYearAndMonth` e obligatoriu la `get-image`. O luna gresita primeste `1504`, care
       arata exact ca „DHL a pierdut documentul”. De aceea se ia din ce am trimis NOI si nu se
       recalculeaza niciodata din fusuri. */
    assert.equal(lunaRidicare("2026-08-16T12:00:00 GMT+03:00"), "2026-08");
    assert.equal(lunaRidicare("2026-08-16"), "2026-08");
    /* Prefixul literal castiga: un moment de la granita lunii nu se muta in luna urmatoare. */
    assert.equal(lunaRidicare("2026-08-31T22:30:00Z"), "2026-08");
    assert.equal(lunaRidicare("Aug 16 2026 12:00:00 GMT+0300"), "2026-08");
  });

  test("⚠ cand nu se poate citi, iese GOL — niciodata luna curenta", () => {
    /* O luna ghicita ar cere documentul altei luni si ar raporta „nu exista”, in loc sa spuna
       ca nu stim din ce luna e. */
    assert.equal(lunaRidicare(""), "");
    assert.equal(lunaRidicare("nu e o data"), "");
    assert.equal(lunaRidicare("   "), "");
  });
});

describe("DHL: `Message-Reference`, si de ce EXACT 32 de caractere", () => {
  test("⚠ 32 satisface simultan cele PATRU intervale contradictorii ale lor", () => {
    /* schema REST `minLength: 1, maxLength: 36`; ghidul SOAP, tabelul RateResponse `AN 32`;
       proza TrackingRequest „between 28 and 32 characters”; tabelul TrackingRequest `M AN 32`.
       Un `crypto.randomUUID()` cu cratime are 36 si trece azi doar fiindca REST nu verifica. */
    const r = referintaMesaj();
    assert.equal(r.length, 32);
    assert.match(r, /^[0-9A-Z]{32}$/);
    assert.equal(r.includes("-"), false);
  });

  test("⚠ nu e cheie de idempotenta, deci doua cereri nu au voie sa arate la fel", () => {
    /* „not required to be unique between requests” — DHL nu deduplica dupa ea si nu exista
       niciun endpoint care s-o caute. E pentru suportul uman: doua cereri identice trimise cu
       aceeasi referinta ar face un tichet DHL imposibil de dezlegat. */
    assert.notEqual(referintaMesaj(), referintaMesaj());
  });
});

describe("DHL: metadatele care calatoresc PE eroare", () => {
  test("⚠ statusul se citeste ca NUMAR, altfel `=== 429` e mereu fals", () => {
    /* Pe el se decide daca reincercarea are voie: 429 da, 401/403 nu. Un status ajuns ca sir
       ar face fiecare comparatie falsa in tacere, si tot ce e reincercabil ar parea definitiv. */
    assert.equal(statusEroare({ statusHttp: 429 }), 429);
    assert.equal(statusEroare({ statusHttp: "429" }), null);
  });

  test("codul DHL lipseste de cele mai multe ori, si atunci e `null`, nu sir gol", () => {
    assert.equal(codEroare({ codDhl: "998" }), "998");
    assert.equal(codEroare({ codDhl: "" }), null);
  });

  test("⚠ pe orice se prinde intr-un `catch`, nu doar pe erorile noastre", () => {
    /* Se cheama pe `unknown`: un `TypeError` din codul nostru, un sir aruncat de o
       biblioteca, `null`. Daca ar crapa aici, ar acoperi cauza adevarata. */
    for (const e of [null, undefined, "text", 7, new Error("simpla"), {}]) {
      assert.equal(statusEroare(e), null);
      assert.equal(codEroare(e), null);
    }
  });
});

describe("DHL: linkul public de urmarire", () => {
  test("⚠ SE COMPUNE — `trackingUrl` din raspunsul lor e chiar endpointul de API", () => {
    /* Exemplele lor arata `https://expressapi.dhl.com/mydhlapi/shipments/…/tracking`, care cere
       `Authorization: Basic`. Trimis cumparatorului, el primeste un 401. */
    const link = linkUrmarire("1234567890");
    assert.ok(link.startsWith("https://www.dhl.com/"));
    assert.ok(link.includes("1234567890"));
    assert.equal(link.includes("api.dhl.com"), false);
  });

  test("AWB-ul se codeaza: un spatiu ramas din baza nu rupe adresa", () => {
    assert.ok(linkUrmarire("12 34").includes("12%2034"));
  });
});

describe("DHL: serviciile din devizul unei oferte", () => {
  test("⚠ codurile se ridica la MAJUSCULE, altfel rambursul nu se vede niciodata", () => {
    /* Proba de conexiune raspunde la o singura intrebare: apare `KB` pentru contul asta? Fara
       ridicarea la majuscule, raspunsul ar fi „nu” de fiecare data — adica exact concluzia pe
       care o asteptam, confirmata dintr-un defect. O dovada negativa care nu poate esua. */
    const servicii = serviciileDin({
      detailedPriceBreakdown: [{
        currencyType: "BILLC",
        breakdown: [
          { name: "FUEL SURCHARGE", serviceCode: "FF", serviceTypeCode: "SCH" },
          { name: "Cash on Delivery", serviceCode: "kb", serviceTypeCode: "XCH" },
        ],
      }],
    });
    assert.deepEqual(servicii.map((s) => s.cod), ["FF", COD_RAMBURS]);
  });

  test("⚠ `isCustomerAgreement` se citeste STRICT: „cere acord”, nu „contul tau il are”", () => {
    const cu = serviciileDin({ detailedPriceBreakdown: [{ breakdown: [{ serviceCode: "II", isCustomerAgreement: true }] }] });
    assert.equal(cu[0].cereContract, true);
    /* Un sir „true” din JSON-ul lor nu e o confirmare; o verificare adevarat/fals ar marca
       drept „cere contract” fiecare serviciu care poarta campul. */
    const sir = serviciileDin({ detailedPriceBreakdown: [{ breakdown: [{ serviceCode: "II", isCustomerAgreement: "true" }] }] });
    assert.equal(sir[0].cereContract, false);
  });

  test("acelasi serviciu in doua blocuri de deviz se numara o singura data", () => {
    const servicii = serviciileDin({
      detailedPriceBreakdown: [
        { currencyType: "BILLC", breakdown: [{ serviceCode: "FF" }] },
        { currencyType: "PULCL", breakdown: [{ serviceCode: "FF" }] },
      ],
    });
    assert.equal(servicii.length, 1);
  });

  test("un deviz lipsa nu crapa si nu inventeaza servicii", () => {
    assert.deepEqual(serviciileDin({}), []);
    assert.deepEqual(serviciileDin(null), []);
    assert.deepEqual(serviciileDin({ detailedPriceBreakdown: { breakdown: [{ serviceCode: "" }] } }), []);
  });
});

/**
 * ⚠ SINGURUL `fetch` fals din fisier, si e aici dintr-un motiv anume.
 *
 * `citesteExpedierea` — cea care compune `areDovadaLivrarii` — nu e exportata, iar a o exporta
 * doar ca sa poata fi probata ar largi granita modulului pentru comoditatea unei probe.
 * `urmareste` e exportul prin care trece si el, iar el trece prin `fetch`: raspunsul lor se
 * poate deci da de mana, exact in forma in care vine de la `GET /tracking`.
 */
function fetchUrmarire(corp: unknown) {
  const original = globalThis.fetch;
  const adrese: string[] = [];
  globalThis.fetch = (async (url: string) => {
    adrese.push(String(url));
    return new Response(JSON.stringify(corp), { status: 200 });
  }) as unknown as typeof fetch;
  return { adrese, restaureaza: () => { globalThis.fetch = original; } };
}

/** Un eveniment de urmarire, in forma lor: `typeCode`, `date`, `time`, `signedBy`. */
function eveniment(cod: string, data: string, semnatar = "") {
  return { typeCode: cod, date: data, time: "12:00:00", description: `DHL ${cod}`, signedBy: semnatar };
}

function raspunsUrmarire(evenimente: unknown[]) {
  return { shipments: [{ shipmentTrackingNumber: "1234567890", status: "Success", events: evenimente }] };
}

describe("DHL: dovada livrarii se citeste DOAR de pe evenimentul de livrare", () => {
  /*
   * ⚠⚠ CE DEFECT PRIND PROBELE ASTEA.
   *
   * Prima varianta scria `areDovadaLivrarii: evenimente.some((e) => e.semnatar.length > 0)`,
   * adica „a semnat cineva, undeva, candva". Dar semnatura apare — prin chiar documentatia lor,
   * la campul `Signatory` — la fiecare „final disposition event", iar predarea coletului INAPOI
   * la expeditor (`RT`) e si ea o dispozitie finala si e si ea semnata. Steagul iesea `true` pe
   * un colet returnat, `eLivrat()` trecea comanda pe „Livrata", `maybeAutoInvoice` emitea
   * factura la ANAF pentru marfa intoarsa in depozit, iar cronul scotea comanda din urmarire.
   *
   * `eLivrat` are acum si el o garda proprie, dar CAMPUL trebuie sa fie adevarat prin el insusi:
   * numele lui spune „dovada LIVRARII", si asa il va citi si urmatorul care se uita aici.
   */
  test("⚠⚠ o semnatura pe `RT` (returnat expeditorului) NU e dovada de livrare", async () => {
    const f = fetchUrmarire(raspunsUrmarire([
      eveniment("PU", "2026-08-10"),
      eveniment("RD", "2026-08-12"),
      eveniment("RT", "2026-08-14", "IONESCU"),
    ]));
    try {
      const [u] = await urmareste(config(), ["1234567890"]);
      assert.equal(u.cod, "RT");
      assert.equal(u.livratLa, null);
      assert.equal(u.areDovadaLivrarii, false);
    } finally {
      f.restaureaza();
    }
  });

  test("⚠ nici una pe `PD` (livrare partiala), cu expedierea inca la curier", async () => {
    /* Doua colete catre SUA, unde semnatarul nu e mascat de GDPR: `PD` semnat la 10:00 pentru
       primul colet, `WC` la 14:00 pentru restul. Cu steagul ridicat de pe orice eveniment,
       comanda se inchidea ca livrata si se factura integral cu jumatate din marfa in masina. */
    const f = fetchUrmarire(raspunsUrmarire([
      eveniment("PD", "2026-08-14", "SMITH"),
      eveniment("WC", "2026-08-15"),
    ]));
    try {
      const [u] = await urmareste(config(), ["1234567890"]);
      assert.equal(u.cod, "WC");
      assert.equal(u.livratLa, null);
      assert.equal(u.areDovadaLivrarii, false);
    } finally {
      f.restaureaza();
    }
  });

  test("⚠ pe `OK` insa steagul se ridica — reparatia nu are voie sa taie si semnalul bun", async () => {
    /* Fara el nu s-ar mai putea deosebi „gol fiindca DHL l-a mascat din GDPR" de „gol fiindca
       nu s-a semnat", si am raporta livrari nesemnate care de fapt sunt semnate. */
    const f = fetchUrmarire(raspunsUrmarire([
      eveniment("WC", "2026-08-14"),
      eveniment("OK", "2026-08-15", "ALBY H"),
    ]));
    try {
      const [u] = await urmareste(config(), ["1234567890"]);
      assert.equal(u.cod, "OK");
      assert.equal(u.livratLa, "2026-08-15T12:00:00");
      assert.equal(u.areDovadaLivrarii, true);
    } finally {
      f.restaureaza();
    }
  });

  test("⚠ un `OK` NESEMNAT ramane livrare: semnatura intareste, nu conditioneaza", async () => {
    /* `signedBy` e gol din oficiu, din GDPR. Facut conditie, nicio comanda DHL n-ar trece
       vreodata pe „Livrata". */
    const f = fetchUrmarire(raspunsUrmarire([
      eveniment("RT", "2026-08-10", "CINEVA"),
      eveniment("OK", "2026-08-15"),
    ]));
    try {
      const [u] = await urmareste(config(), ["1234567890"]);
      assert.equal(u.cod, "OK");
      assert.equal(u.livratLa, "2026-08-15T12:00:00");
      /* Semnatura de pe `RT` nu se imprumuta livrarii. */
      assert.equal(u.areDovadaLivrarii, false);
    } finally {
      f.restaureaza();
    }
  });
});

describe("DHL: nomenclatoarele de configurare", () => {
  test("⚠ antetul `x-version` e obligatoriu, si o valoare gresita da `9001`", () => {
    /* Se schimba IMPREUNA cu schemele citite in `client.ts`, niciodata singur. */
    assert.equal(VERSIUNE_API, "3.3.1");
  });

  test("⚠ cel mult 200 de AWB-uri pe cerere — `maxItems: 200` la ei", () => {
    assert.ok(MAX_AWB_PE_CERERE > 0 && MAX_AWB_PE_CERERE <= 200);
  });

  test("⚠ sablonul implicit trebuie sa stie sa tipareasca FORMATUL implicit", () => {
    /* Capcana e a lor: implicitul DECLARAT `ECOM26_84_001` e listat in nomenclatorul lor ca
       fiind DOAR termic, in timp ce `encodingFormat` are `default: pdf`. Cele doua implicituri
       ale lor nu se potrivesc, iar un comerciant fara imprimanta termica ar primi un fisier pe
       care nu-l poate tipari, fara nicio eroare. */
    const implicit = SABLOANE.find((s) => s.valoare === SABLON_IMPLICIT);
    assert.ok(implicit, "sablonul implicit nu e in lista");
    assert.ok(implicit.formate.includes(FORMAT_IMPLICIT));
  });

  test("`templateName` are `maxLength: 25` — toate valorile propuse incap", () => {
    for (const s of SABLOANE) {
      assert.ok(s.valoare.length <= 25, s.valoare);
      assert.ok(s.formate.length > 0, s.valoare);
    }
  });

  test("⚠ incotermurile MARITIME si cele retrase nu se propun intr-un magazin online", () => {
    /* `FAS`, `FOB`, `CFR`, `CIF`, `DES`, `DEQ`, `DAF`, `DAT` sunt valide la ei, dar intr-o lista
       derulanta de magazin nu sunt optiuni, sunt capcane: DHL Express e curier aerian si rutier. */
    const coduri = INCOTERMURI.map((i) => i.cod);
    assert.ok(coduri.includes(INCOTERM_IMPLICIT));
    for (const maritim of ["FAS", "FOB", "CFR", "CIF", "DES", "DEQ", "DAF", "DAT"]) {
      assert.equal(coduri.includes(maritim), false, maritim);
    }
  });
});
