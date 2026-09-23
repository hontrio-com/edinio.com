import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CE_NU_PUTEM_FACE, CE_RAMANE, CE_SE_STERGE, NUMELE_ANONIM, URMA_GOALA, aAtinsCeva,
  citesteUrma, intrebareaAnonimizarii, intrebareaAnonimizariiInMasa, rezumatulAnonimizarii,
} from "./anonimizare";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ANONIMIZAREA NU ARE VOIE SA STEARGA DEZABONAREA          (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ ASTA E REGULA CARE APARA CEL MAI MULT din tot ce s-a scris azi, si e si cea
 * mai usor de stricat, fiindca pare o inconsecventa: „stergem datele omului, dar
 * ii pastram randul cu telefonul in `recovery_optout`?"
 *
 * Da. Omul care cere sa fie sters e, de cele mai multe ori, chiar omul care
 * ceruse inainte sa nu mai primeasca mesaje. Sters si randul acela, prima
 * campanie de a doua zi l-ar gasi din nou — adica „stergerea" ar avea ca urmare
 * EXACT lucrul de care fugea, si nimeni n-ar lega cele doua intamplari.
 *
 * Urmatorul care citeste functia si vrea s-o faca „completa" pica aici.
 */

/*
  ⚠⚠ `000-schema-baseline.sql` NU E O MIGRATIE, e o FOTOGRAFIE generata din
  productie cu `pg_dump`. Citita ca migratie, probele de aici ar fi masurat textul
  masinii in loc de textul scris de om — si, fiind prima alfabetic, ar fi fost si
  cea gasita prima.

  S-a intamplat chiar asa, pe 21.09.2026: dupa regenerarea liniei de baza, doua
  probe au picat deodata, spunand „bucata gasita are 0 semne". Nu se stricase
  nimic: se schimbase ce citeau ele.
*/
const DOSAR = "migrations";
const MIGRATII = readdirSync(DOSAR)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-")).sort()
  .map((f) => ({ f, text: readFileSync(join(DOSAR, f), "utf8") }));

/*
  ⚠ ULTIMA definitie, nu prima: functia se rescrie (24.09.2026, anonimizarea care
  ajunge si in conturi). Citind-o pe prima, probele de aici ar fi ramas verzi pe
  o versiune care nu mai ruleaza nicaieri.
*/
const M = MIGRATII.filter((m) => m.text.includes("create or replace function public.customer_anonymize")).at(-1);

const CORP = M
  ? M.text.slice(
      M.text.indexOf("create or replace function public.customer_anonymize"),
      M.text.indexOf("revoke all on function public.customer_anonymize"),
    )
  : "";

/*
  ⚠ Curatarea lui `order_source` sta, din 24.09.2026, intr-o functie a ei
  (`privat.sursa_anonimizata`), folosita si de anonimizare, si de curatarea o data
  a comenzilor anonimizate inainte. Probele de mai jos citesc corpul ei.
*/
const M_SURSA = MIGRATII.filter((m) => m.text.includes("create or replace function privat.sursa_anonimizata")).at(-1);
const SURSA = M_SURSA
  ? M_SURSA.text.slice(
      M_SURSA.text.indexOf("create or replace function privat.sursa_anonimizata"),
      M_SURSA.text.indexOf("revoke all on function privat.sursa_anonimizata"),
    )
  : "";

test("⚠ migratia chiar a fost gasita, altfel proba n-are ce citi", () => {
  assert.ok(M, "nicio migratie nu defineste `customer_anonymize`");
  assert.ok(CORP.length > 1500, `bucata gasita are ${CORP.length} semne`);
});

test("⚠⚠ listele de dezabonare NU sunt atinse de anonimizare", () => {
  /*
   * Se cauta orice scriere pe cele doua tabele in corpul functiei. Nu doar
   * `delete`: un `update` care le-ar goli telefonul ar avea acelasi efect.
   */
  for (const tabela of ["recovery_optout", "sms_optout"]) {
    const scrieri = [
      `delete from public.${tabela}`,
      `update public.${tabela}`,
      `insert into public.${tabela}`,
    ];
    for (const s of scrieri) {
      assert.ok(
        !CORP.includes(s),
        `anonimizarea scrie in \`${tabela}\` (\`${s}\`) — omul ar reintra pe listele de campanii`,
      );
    }
  }
});

test("⚠⚠ comenzile NU se sterg, se curata", () => {
  /*
   * Un `delete from public.orders` aici ar face sa scada retroactiv venitul unei
   * luni incheiate si ar lasa facturi emise fara nimic in spate. Proprietarul a
   * ales anume anonimizarea, nu stergerea.
   */
  assert.ok(!CORP.includes("delete from public.orders"), "anonimizarea STERGE comenzi");
  assert.match(CORP, /update public\.orders/, "anonimizarea nu mai curata comenzile deloc");
});

test("⚠⚠ cheia clientului ramane UNA, nu se sparge in cate o comanda", () => {
  /*
   * Cheia se naste din telefon → email → `order:<id>`. Lasate amandoua goale,
   * fiecare comanda ar fi devenit un „client" al ei: in locul unui rand anonim
   * ar fi aparut cinci, iar numarul de clienti al magazinului ar fi CRESCUT
   * dupa o stergere.
   *
   * Masurat pe demo, pe un om cu 3 comenzi: 358 de clienti inainte, 358 dupa,
   * si un singur rand „Client șters".
   */
  assert.match(CORP, /@anonim\.invalid/, "nu se mai pune o adresa anonima pe comenzi");
  assert.match(CORP, /gen_random_uuid\(\)/, "adresa anonima nu mai e un uuid");
  /* ⚠ Si NU un hash al telefonului: zece cifre se sparg intr-o secunda. */
  assert.ok(!/md5|sha\d|digest|encode\(/i.test(CORP), "adresa anonima pare derivata din datele vechi");
});

test("⚠⚠ adresa se curata cu LISTA ALBA, sursa cu LISTA NEAGRA", () => {
  /*
   * Pare o nepotrivire; e chiar invers. In `shipping_address` partea PERSONALA
   * creste singura (fiecare curier isi scrie cheile lui), deci o lista neagra ar
   * fi tacut la al saptesprezecelea curier. In `order_source` partea personala e
   * scrisa de codul NOSTRU si e inchisa, pe cand cheile de BANI se inmultesc cu
   * fiecare marketplace — o lista alba ar fi aruncat tacut bani din raport.
   *
   * Regula din spate e aceeasi: partea care creste fara stirea noastra nu are
   * voie sa fie cea pe care o ghicim.
   */
  const adresa = CORP.slice(CORP.indexOf("shipping_address = case"), CORP.indexOf("notes = null"));
  assert.ok(adresa.length > 100, "nu mai gasesc curatarea adresei");
  assert.match(adresa, /where k in \(/, "adresa nu se mai curata cu lista alba");
  assert.ok(!adresa.includes(" - '"), "adresa a trecut pe lista neagra: se pierde la primul curier nou");

  assert.ok(CORP.includes("order_source = privat.sursa_anonimizata(o.order_source)"), "anonimizarea nu mai curata sursa prin functia comuna");
  const sursa = SURSA;
  assert.ok(sursa.length > 100, "nu mai gasesc curatarea sursei");
  for (const urmaritor of ["ga_client_id", "fbp", "fbclid", "gclid", "ttclid", "user_agent", "referrer"]) {
    assert.ok(sursa.includes(`- '${urmaritor}'`), `sursa nu mai scoate \`${urmaritor}\``);
  }
  assert.ok(!sursa.includes("where k in ("), "sursa a trecut pe lista alba: se pierd bani din raport");
});

test("⚠⚠ comenzile se strang INAINTE de prima scriere", () => {
  /*
   * Capcana intregii functii: dupa ce telefonul si emailul se schimba, cheia
   * clientului se naste ALTA. O a doua cautare dupa aceeasi cheie n-ar mai gasi
   * nimic, iar cosurile, retururile si SMS-urile lui ar fi ramas neatinse — o
   * „stergere" care lasa datele in trei tabele, fara nicio eroare.
   */
  const stranse = CORP.indexOf("into v_ids, v_telefoane");
  const primaScriere = CORP.indexOf("update public.");
  assert.ok(stranse > -1, "nu se mai strang comenzile deloc");
  assert.ok(
    stranse < primaScriere,
    "identificatorii se strang DUPA prima scriere: cheia s-a schimbat deja sub noi",
  );
});

/* ── Ce se spune pe ecran ───────────────────────────────────────────────── */

test("⚠ confirmarea spune si CE RAMANE, nu doar ce dispare", () => {
  /*
   * Un om care crede ca a sters un client si vede apoi comenzile lui in rapoarte
   * se sperie si cheama suportul. Mai rau: crede ca operatia n-a mers si o reia.
   */
  const i = intrebareaAnonimizarii("Ioana Popescu", 5);
  assert.match(i, /Ioana Popescu/);
  assert.match(i, /5 comenzi/);
  assert.match(i, /RĂMÂN/);
  assert.match(i, /factur/i);
  assert.match(i, /dezabonarea/);
  assert.match(i, /Nu se poate lua înapoi/);

  const m = intrebareaAnonimizariiInMasa(12);
  assert.match(m, /12 clienți/);
  assert.match(m, /RĂMÂN/);
  assert.match(m, /Nu se poate lua înapoi/);
});

test("singularul si pluralul sunt amandoua corecte", () => {
  assert.match(intrebareaAnonimizarii("Ana", 1), /1 comandă/);
  assert.match(intrebareaAnonimizariiInMasa(1), /1 client\b/);
});

test("⚠ se spune pe fata si ce NU putem face", () => {
  /* Facturile plecate poarta numele mai departe. Aflat dupa, pare o minciuna. */
  assert.match(CE_NU_PUTEM_FACE, /factur/i);
  assert.match(CE_NU_PUTEM_FACE, /zece ani/);
});

test("⚠ lista „ce rămâne” pomeneste dezabonarea", () => {
  assert.ok(
    CE_RAMANE.some((r) => /dezabonarea/.test(r)),
    "lista de pe ecran nu mai spune ca dezabonarea ramane",
  );
  assert.ok(CE_SE_STERGE.length >= 4 && CE_RAMANE.length >= 3);
});

test("⚠ rezumatul spune CIFRELE, nu „gata”", () => {
  assert.equal(
    rezumatulAnonimizarii({ comenzi: 3, contacte: 1, cosuri: 2, retururi: 0, mesaje: 5 }),
    "Date șterse din: 3 comenzi, 1 contact, 2 coșuri, 5 SMS-uri.",
  );
  assert.equal(rezumatulAnonimizarii({ ...URMA_GOALA, comenzi: 1 }), "Date șterse din: 1 comandă.");
});

test("⚠ zero randuri atinse NU se da drept izbanda", () => {
  /*
   * Dupa o operatie fara intoarcere, „gata" peste zero randuri il lasa pe om sa
   * creada ca a facut ceva. Se spune pe fata ca nu era nimic de sters.
   */
  assert.equal(aAtinsCeva(URMA_GOALA), false);
  assert.equal(aAtinsCeva({ ...URMA_GOALA, mesaje: 1 }), true);
  assert.match(rezumatulAnonimizarii(URMA_GOALA), /Nu era nimic de șters/);
});

test("⚠ un raspuns ciudat al bazei nu ajunge „NaN” pe ecran", () => {
  assert.deepEqual(citesteUrma(null), URMA_GOALA);
  assert.deepEqual(citesteUrma("da"), URMA_GOALA);
  assert.deepEqual(citesteUrma({}), URMA_GOALA);
  assert.deepEqual(citesteUrma({ comenzi: "3" }), { ...URMA_GOALA, comenzi: 3 });
  assert.deepEqual(citesteUrma({ comenzi: -5 }), URMA_GOALA);
  assert.deepEqual(citesteUrma({ comenzi: 2.7 }), { ...URMA_GOALA, comenzi: 2 });
});

test("⚠ numele anonim e acelasi in cod si in SQL", () => {
  /* Doua nume deosebite ar fi facut ca lista si comenzile sa arate altfel. */
  assert.ok(CORP.includes(`'${NUMELE_ANONIM}'`), `SQL nu mai scrie „${NUMELE_ANONIM}”`);
});

test("⚠⚠ fiecare cheie de urmarire scrisa la checkout e stearsa, sau lasata ANUME sa ramana", () => {
  /*
   * Lista din SQL e NEAGRA (cheile de bani ale marketplace-urilor trebuie sa
   * treaca neatinse), deci o cheie noua de urmarire adaugata la checkout ar fi
   * supravietuit anonimizarii fara nicio eroare. Asa s-a intamplat cu `client_ip`
   * (lista stergea `ip`), cu `fbc`, `ttp`, `mc_tc`, `ga_sesiuni` si acorduri.
   * Proba leaga lista de SURSA ei: `CHEI_ATRIBUIRE` din `order.actions.ts`.
   */
  const actiuni = readFileSync(join("src", "lib", "actions", "order.actions.ts"), "utf8");
  const bloc = actiuni.slice(actiuni.indexOf("const CHEI_ATRIBUIRE = ["), actiuni.indexOf("] as const;", actiuni.indexOf("const CHEI_ATRIBUIRE = [")));
  /* ⚠ Orice sir din lista, nu doar `[a-z_]`: o cheie cu cifre sau majuscule ar fi scapat tacut. */
  const chei = [...bloc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(chei.length >= 15, `am gasit doar ${chei.length} chei de atribuire`);
  /*
    Si cele scrise de SERVER (`curat.<cheie> =` in `buildOrderSource`), citite din cod,
    nu scrise de mana: tocmai asa scapase `client_ip`.
  */
  const construire = actiuni.slice(actiuni.indexOf("function buildOrderSource("), actiuni.indexOf("function buildOrderSource(") + 4000);
  const deServer = [...construire.matchAll(/curat\.(\w+)\s*=/g)].map((m) => m[1]);
  assert.ok(deServer.includes("client_ip") && deServer.includes("user_agent"), "nu mai gasesc cheile scrise de server");
  chei.push(...deServer);

  /* Canalul la nivel de CAMPANIE ramane: rapoartele pe canale n-au voie sa se strice. */
  const RAMAN = new Set(["utm_source", "utm_medium", "utm_campaign", "mc_cid", "captured_at", "direct"]);
  const sursa = SURSA;
  assert.ok(sursa.length > 100, "nu mai gasesc curatarea sursei");
  for (const cheie of chei) {
    const stearsa = sursa.includes(`- '${cheie}'`);
    if (RAMAN.has(cheie)) {
      assert.equal(stearsa, false, `\`${cheie}\` e pe lista celor care raman, dar e stearsa`);
    } else {
      assert.ok(stearsa, `\`${cheie}\` se scrie la checkout si supravietuieste anonimizarii`);
    }
  }
});

test("⚠⚠ IBAN-ul se goleste NUMAI pe retururile incheiate", () => {
  /*
   * Pe un retur `nou` sau `aprobat` comerciantul inca trebuie sa ramburseze, iar
   * fara IBAN n-ar mai avea unde. Golit pe toate, anonimizarea ar fi incalcat
   * chiar obligatia de rambursare.
   */
  const retur = CORP.slice(CORP.indexOf("update public.return_requests"), CORP.indexOf("where r.order_id"));
  assert.match(retur, /refund_iban = case when r\.status in \('rambursat', 'respins'\) then null else r\.refund_iban end/);
  assert.match(retur, /reason = case when r\.status in \('rambursat', 'respins'\) then null else r\.reason end/);
});

test("⚠⚠ contul omului se goleste INAINTE ca datele din comenzi sa dispara", () => {
  /* Conturile se gasesc dupa emailul si telefonul de pe comenzi: dupa anonimizare n-ar mai fi nimic de potrivit. */
  const conturi = CORP.indexOf("perform public.cont_rupe_legaturile(bid, v_chei)");
  assert.ok(conturi > 0, "anonimizarea nu mai ajunge in conturile de client");
  assert.ok(conturi < CORP.indexOf("update public."), "conturile se golesc DUPA ce comenzile si-au pierdut contactele");
});

test("⚠⚠ un cont se goleste numai cand e SIGUR al omului anonimizat", () => {
  /*
    Cine a trimis un cadou pe telefonul omului are emailul lui pe comanda aceea.
    Contul lui, cu alte comenzi proprii, nu se goleste: i se desface doar legatura
    cu comenzile anonimizate.
  */
  const m = MIGRATII.filter((x) => x.text.includes("create or replace function public.cont_rupe_legaturile")).at(-1);
  assert.ok(m, "nu gasesc `cont_rupe_legaturile`");
  const corp = m.text.slice(m.text.indexOf("create or replace function public.cont_rupe_legaturile"), m.text.indexOf("revoke all on function public.cont_rupe_legaturile"));
  assert.ok(corp.includes("l.order_id <> all(v_ids)"), "conturile gasite dupa comenzi nu mai cer lipsa altor comenzi");
  assert.ok(corp.includes("not (l.cont_id = any(coalesce(v_conturi, '{}')))"), "celelalte conturi nu mai pierd doar legatura");
});

test("⚠ SMS-urile pierd si TEXTUL, iar raspunsurile primite se golesc", () => {
  const sms = CORP.slice(CORP.indexOf("update public.notice_sms_log"), CORP.indexOf("update public.notice_inbox"));
  assert.ok(sms.includes("message = null"), "textul SMS-ului ramane (sabloanele pot purta numele si adresa)");
  assert.ok(sms.includes("s.order_id = any("), "SMS-urile nu se mai gasesc si dupa comanda");
  assert.match(CORP, /update public\.notice_inbox n\s+set from_number = null, body = null, raw = null/);
});

test("⚠ in masa, fiecare client isi pastreaza adresa anonima a lui", () => {
  /* Cu un singur `gen_random_uuid()` pe apel, N clienti anonimizati deodata deveneau unul. */
  assert.match(CORP, /select k, 'sters-' \|\| gen_random_uuid\(\)::text \|\| '@anonim\.invalid' as adresa\s+from unnest\(v_chei\) k/);
});
