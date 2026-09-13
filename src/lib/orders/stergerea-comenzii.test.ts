import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deCeNuSeStergeComanda, sePoateStergeComanda } from "./stergerea-comenzii";
import { COLOANA_AWB, coloanelePortii, NUME_CURIER, type CurierPropriu } from "./awb-propriu";

/* ══════════════════════════════════════════════════════════════════════════
   O COMANDA CU COLETUL PE DRUM NU SE STERGE (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `deleteOrder` chema RPC-ul de stergere fara sa se uite daca pe comanda exista un colet
   viu, si citea din 17 coloane de AWB exact una: `gls_awb_number`, curierul cu ZERO
   expedieri in productie. Cele 211 de AWB-uri Woot si cele 5 DPD treceau nevazute.

   Masurat pe 14.09.2026, din 435 de comenzi, 218 poarta o expediere:
   shipped 192, refunded 15, cancelled 8, delivered 3.
*/

const fisier = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Comanda cu un singur colet, la curierul cerut. */
function cu(curier: CurierPropriu, numar: string, status: string | null) {
  return { status, awburi: { [curier]: numar } as Partial<Record<CurierPropriu, string | null>> };
}

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("⚠ o comanda expediata, cu AWB viu, NU se sterge", () => {
  const motiv = deCeNuSeStergeComanda(cu("woot", "12345678", "shipped"));
  assert.ok(motiv, "stergerea trebuie oprita");
  assert.match(motiv, /Woot/, "mesajul spune CARE curier");
  assert.match(motiv, /12345678/, "si CARE numar, ca omul sa-l poata cauta");
  assert.equal(sePoateStergeComanda(cu("woot", "12345678", "shipped")), false);
});

test("⚠ mesajul da DOUA iesiri, nu doar un refuz", () => {
  /*
   * Un „nu se poate" fara urmatoarea miscare l-a pus deja pe comerciant sa apese de 208
   * ori un buton care n-avea cum sa mearga. Cele doua iesiri sunt reale amandoua si
   * niciuna nu cere sa treaca pe la noi.
   */
  const motiv = deCeNuSeStergeComanda(cu("dpd", "AWB-1", "shipped"))!;
  assert.match(motiv, /Detașează AWB/, "iesirea 1: scoate AWB-ul de pe comanda");
  assert.match(motiv, /livrată, anulată sau restituită/, "iesirea 2: muta comanda in stare incheiata");
});

test("⚠ CELE 26 DE COMENZI INCHEIATE RAMAN STERGIBILE", () => {
  /*
   * ⚠ ASTA E JUMATATEA CARE SE UITA USOR. Un zid pus pe simpla existenta a AWB-ului ar fi
   * oprit toate cele 218 de comenzi cu expediere, adica si cele 26 la care transportul
   * s-a incheiat de mult si stergerea e curatenie curata. O paza care nu se mai ridica
   * niciodata nu e o paza, e o fundatura.
   */
  for (const stare of ["delivered", "cancelled", "refunded"]) {
    assert.equal(
      deCeNuSeStergeComanda(cu("woot", "12345678", stare)),
      null,
      `starea „${stare}" e un sfarsit: nu mai atarna nimic de comanda`,
    );
  }
});

test("⚠ starea incheiata se cantareste INAINTEA AWB-ului", () => {
  /*
   * Ordinea celor doua verificari E regula. Inversate, prima potrivire de AWB ar fi
   * intors refuzul si cele trei stari de mai sus n-ar mai fi ajuns niciodata sa conteze.
   */
  const cod = faraComentarii(fisier("src/lib/orders/stergerea-comenzii.ts"));
  const iStare = cod.indexOf("STARI_CU_TRANSPORTUL_INCHEIAT.has(o.status)");
  const iAwb = cod.indexOf("Object.entries(o.awburi)");
  assert.ok(iStare > 0, "ancora starii exista");
  assert.ok(iAwb > 0, "ancora AWB-ului exista");
  assert.ok(iStare < iAwb, "starea incheiata se verifica prima");
});

test("o comanda fara niciun colet se sterge in orice stare", () => {
  for (const stare of ["pending", "confirmed", "processing", "shipped", null]) {
    assert.equal(deCeNuSeStergeComanda({ status: stare, awburi: {} }), null, `stare: ${stare}`);
  }
});

test("⚠ TOTI CEI 17 CURIERI OPRESC STERGEREA, nu doar GLS", () => {
  /*
   * ⚠ PROBA ASTA E CHIAR DEFECTUL. `deleteOrder` citea `gls_awb_number` si atat. Se
   * enumera din `COLOANA_AWB`, nu dintr-o lista scrisa aici: un curier nou adaugat acolo
   * si uitat in regula pica proba, nu productia.
   */
  const curieri = Object.keys(COLOANA_AWB) as CurierPropriu[];
  assert.equal(curieri.length, 17, "harta are 17 curieri");
  for (const c of curieri) {
    const motiv = deCeNuSeStergeComanda(cu(c, "X1", "shipped"));
    assert.ok(motiv, `${c} nu opreste stergerea`);
    assert.match(motiv, new RegExp(NUME_CURIER[c].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("celula goala nu e colet", () => {
  /* `null`, sirul gol si `undefined` nu opresc nimic: altfel nicio comanda nu s-ar sterge. */
  assert.equal(deCeNuSeStergeComanda({ status: "shipped", awburi: { woot: null } }), null);
  assert.equal(deCeNuSeStergeComanda({ status: "shipped", awburi: { woot: "" } }), null);
});

/* ── Cusatura: serverul chiar o cheama, si LA TIMP ────────────────────────── */

test("⚠ deleteOrder cere TOATE coloanele portii", () => {
  /*
   * ⚠ Regula n-ar fi de niciun folos daca randul citit n-ar purta coloanele. Se cere
   * fiecare din `coloanelePortii()`, adica aceeasi lista pe care o citeste si poarta de
   * emitere: un curier nou nu poate fi uitat intr-un singur loc.
   */
  const cod = faraComentarii(fisier("src/lib/actions/order.actions.ts"));
  const i = cod.indexOf("export async function deleteOrder(");
  assert.ok(i > 0, "functia exista");
  const corp = cod.slice(i, i + 3000);

  /*
   * ═══ ⚠ SE SPARGE SELECTUL IN COLOANE, NU SE CAUTA SUBSIRURI ═══
   *
   * Prima forma intreba `corp.includes("cargus_awb_number")`. Un mutant care scria
   * `NUcargus_awb_number` a TRECUT nevazut: subsirul e tot acolo. O verificare pe subsir
   * nu apara o lista de coloane, fiindca fiecare coloana stricata o contine inca pe cea
   * buna. Aici lista se desface pe virgula si se compara ca multime, deci orice litera in
   * plus sau in minus face coloana alta.
   */
  const select = corp.match(/from\("orders"\)\.select\("([^"]+)"\)/);
  assert.ok(select, "selectul comenzii exista");
  const cerute = new Set(select[1].split(",").map((s) => s.trim()));
  for (const coloana of coloanelePortii()) {
    assert.ok(cerute.has(coloana), `deleteOrder nu cere ${coloana}`);
  }
  assert.ok(cerute.has("status"), "si starea, altfel regula n-are dupa ce sa se uite");
  assert.ok(cerute.has("order_source"), "si originea, pentru paza de marketplace de deasupra");
});

test("⚠ paza sta INAINTEA stergerii, nu dupa", () => {
  /*
   * O paza chemata dupa `sterge_comanda` n-ar apara nimic: randul ar fi deja disparut, iar
   * mesajul ar descrie o comanda care nu mai exista.
   */
  const cod = faraComentarii(fisier("src/lib/actions/order.actions.ts"));
  const iPaza = cod.indexOf("deCeNuSeStergeComanda({");
  const iRpc = cod.indexOf('.rpc("sterge_comanda"');
  assert.ok(iPaza > 0, "paza e chemata");
  assert.ok(iRpc > 0, "stergerea e chemata");
  assert.ok(iPaza < iRpc, "paza trebuie sa fie inaintea stergerii");
  /* ⚠ Si chiar intoarce refuzul, nu doar il socoteste. */
  assert.match(cod, /if \(opresteStergerea\) return \{ error: opresteStergerea \};/);
});

test("⚠ ecranul ia regula din ACELASI loc, nu o scrie a doua oara", () => {
  /* Doua copii ar fi insemnat doua adevaruri despre aceeasi comanda, si cel de pe ecran
     ar fi fost crezut. */
  const ui = fisier("src/components/dashboard/OrderDetailClient.tsx");
  assert.match(ui, /import \{ deCeNuSeStergeComanda \} from "@\/lib\/orders\/stergerea-comenzii";/);
  assert.match(faraComentarii(ui), /const refuzStergere = deCeNuSeStergeComanda\(\{/);
  /* ⚠ Si cartea rosie chiar sta sub ea: un buton care da eroare abia dupa apasare e o cursa. */
  const iButon = ui.indexOf("Sterge definitiv");
  assert.ok(iButon > 0, "butonul exista");
  assert.match(ui.slice(Math.max(0, iButon - 700), iButon), /!refuzStergere/);
});

/* ── Cusatura: eticheta pleaca odata cu comanda ───────────────────────────── */

test("⚠ se curata etichetele TUTUROR celor trei curieri care depoziteaza", () => {
  /*
   * Pana azi se stergeau doar cheile GLS. Pall-Ex scrie DOUA documente (eticheta si
   * avizul), eColet unul cu extensia in cheie. Toate poarta numele, adresa si telefonul
   * cumparatorului, si toate au chei derivate din `(business, comanda)`: dupa stergerea
   * randului nu le mai compune nimeni.
   */
  const cod = faraComentarii(fisier("src/lib/actions/order.actions.ts"));
  const i = cod.indexOf("export async function deleteOrder(");
  const corp = cod.slice(i, i + 6000);
  assert.match(corp, /cheiEticheta\(order\.business_id, orderId\)/, "GLS");
  assert.match(corp, /cheieDocumentPallex\(order\.business_id, orderId, "label"\)/, "Pall-Ex eticheta");
  assert.match(corp, /cheieDocumentPallex\(order\.business_id, orderId, "note"\)/, "Pall-Ex aviz");
  assert.match(corp, /cheieEtichetaEcolet\(order\.business_id, orderId, "pdf"\)/, "eColet PDF");
  assert.match(corp, /cheieEtichetaEcolet\(order\.business_id, orderId, "zpl"\)/, "eColet ZPL");
});

test("⚠ eticheta Pepita se sterge din galeata PRIVATA, nu din cea publica", () => {
  /*
   * ⚠ DEOSEBIREA CARE CONTEAZA. Eticheta Pepita se scrie cu `incarcaPrivat` in galeata
   * incarcarilor. Un `deleteFromR2` pe cheia ei ar fi cautat-o in galeata publica si ar fi
   * raportat linistit reusita, lasand in urma un PDF cu datele cumparatorului.
   *
   * ⚠ Si comenzile Pepita chiar ajung aici: `pepita` NU e in `MARKETPLACE_CU_CICLU_PROPRIU`.
   */
  const cod = faraComentarii(fisier("src/lib/actions/order.actions.ts"));
  const i = cod.indexOf("export async function deleteOrder(");
  const corp = cod.slice(i, i + 6000);
  assert.match(corp, /stergeIncarcarea\(cheieEtichetaPepita\(order\.business_id, orderId\)\)/);
  assert.doesNotMatch(corp, /deleteFromR2\(cheieEtichetaPepita/, "galeata publica e cea gresita");

  const origin = fisier("src/lib/orders/origin.ts");
  assert.doesNotMatch(
    origin,
    /MARKETPLACE_CU_CICLU_PROPRIU = new Set\(\[[^\]]*"pepita"/,
    "daca Pepita intra in lista, comenzile ei nu mai ajung la stergere si nota de mai sus minte",
  );
});
