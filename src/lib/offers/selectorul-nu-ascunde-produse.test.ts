import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DESPRE_TIPUL_OFERTEI, OFFER_TYPES, type OfferType } from "./offer.types";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SELECTORUL DE PRODUSE AL OFERTELOR NU ASCUNDE NIMIC           (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECTUL PE CARE ÎL APĂRĂ PROBA ASTA. Cele două ecrane de oferte își luau
 * lista de produse din `getBundleEligibleProducts`, adică din filtrul făcut pentru
 * PACHETE. Acela scoate, pe lângă pachete, produsele INACTIVE, pe cele cu VARIANTE
 * și pe cele care cer PERSONALIZARE — pe drept, fiindcă `BundleItem` n-are câmp de
 * variantă.
 *
 * Numai că o ofertă nu e un pachet, iar filtrul lovea și secțiunea „Când apare”,
 * unde produsul ales spune doar PE CE PAGINĂ se vede oferta.
 *
 * Măsurat pe producție la 24.09.2026, și de-aia s-a reparat:
 *   nordic-outlet-bucovina 468/468 ascunse (niciun produs de ales)
 *   rallsro                113/113,  royal-boutique 44/44,  yulmis-sound 26/26
 *   esafero              3.047/3.351 (91%)
 *   atelierul-larisei      22/28,  jhbijuterii 34/59,  caian-textile 18/35
 *
 * Adică magazinele de haine și de echipamente — chiar cele pentru care
 * recomandările contează cel mai mult — deschideau „Ofertă nouă”, își căutau
 * produsul, și el nu era acolo. Fără nicio explicație.
 *
 * ⚠ E același defect ca la SmartShip, în altă formă: ce nu poate apărea în listă
 * nu poate fi ales, iar ce nu poate fi ales e tăiat pentru totdeauna, tăcut.
 */

const sursa = (f: string) => readFileSync(f, "utf8");

const PAGINA_NOUA = "src/app/(dashboard)/dashboard/offers/new/page.tsx";
const PAGINA_EDIT = "src/app/(dashboard)/dashboard/offers/[offerId]/edit/page.tsx";
const LISTA = "src/lib/offers/produse-pentru-formular.ts";
const FORMULAR = "src/components/dashboard/OfferForm.tsx";

/* ══ 1. Ofertele nu se mai ating de lista pachetelor ═══════════════════════ */

test("⚠⚠ ecranele de oferte NU mai folosesc lista de produse a PACHETELOR", () => {
  for (const f of [PAGINA_NOUA, PAGINA_EDIT]) {
    const s = sursa(f);
    assert.ok(
      !s.includes("getBundleEligibleProducts"),
      `${f} s-a intors la filtrul de pachete, care ascunde produsele cu variante`,
    );
    assert.ok(s.includes("produsePentruOferte"), `${f} nu mai cere lista de oferte`);
  }
});

test("⚠ lista ofertelor scoate DOAR pachetele si produsele inactive", () => {
  /*
   * Cele două sunt aruncate și de vitrină (`fetchOfferProducts` cere `is_active` și
   * nu-i place `is_bundle`), deci alese în formular ar fi fost o promisiune care nu
   * se vede nicăieri. Variantele și personalizarea NU sunt motive de scoatere.
   */
  const s = sursa(LISTA);
  assert.ok(s.includes('.eq("is_active", true)'), "lista lasa inauntru produse inactive");
  assert.ok(s.includes('.eq("is_bundle", false)'), "lista lasa inauntru pachete");
  assert.ok(
    !/\.filter\([^)]*hasVariants/.test(s),
    "lista ARUNCA iar produsele cu variante — exact defectul reparat",
  );
});

test("⚠ steagul `cereAlegere` se ia din ACELEASI functii ca vitrina", () => {
  /*
   * Panoul și magazinul trebuie să răspundă la fel despre același produs. Scrise a
   * doua oară aici, cele două ar fi putut ajunge la răspunsuri diferite.
   */
  const s = sursa(LISTA);
  assert.match(s, /hasVariants\(p\.page_sections\)\s*\|\|\s*cerePersonalizare\(p\.page_sections\)/);
  assert.ok(
    s.includes('from "@/lib/storefront/variants"'),
    "steagul nu mai vine din sursa pe care o citeste vitrina",
  );
});

/* ══ 2. Declansatorul nu se filtreaza NICIODATA ════════════════════════════ */

test("⚠⚠ „Când apare” primeste TOATE produsele: acolo se alege o PAGINA, nu o marfa", () => {
  /*
   * `triggerMatchesProduct` compară id-uri și categorii, nimic altceva. Un produs cu
   * mărimi e o pagină perfect bună pe care să se vadă o ofertă. Filtrat, magazinele
   * de haine rămâneau fără declanșator.
   */
  const s = sursa(FORMULAR);
  const de = s.indexOf("{scope === \"products\" && (");
  assert.ok(de > 0, "selectorul de declansator s-a mutat");
  const bucata = s.slice(de, s.indexOf("{scope === \"categories\"", de));
  assert.ok(
    !bucata.includes("motivNepotrivit"),
    "declansatorul a capatat un filtru: acolo produsul spune doar PE CE PAGINA apare oferta",
  );
});

/* ══ 3. Ce nu se poate oferi se ARATA cu motivul, nu se ascunde ════════════ */

test("⚠⚠ produsul care nu poate fi oferit ramane in lista, STINS, cu motivul scris", () => {
  const s = sursa(FORMULAR);
  assert.ok(s.includes("motivPentruProdusulOferit"), "regula a disparut din formular");
  /* Randul se deseneaza oricum: `disabled` plus motivul, nu `filter`. */
  assert.match(s, /disabled=\{!!motiv\}/, "randul nepotrivit nu mai e doar stins");
  assert.match(s, /\{motiv && <span/, "motivul nu se mai scrie pe ecran");
  assert.ok(
    !/results\s*=\s*useMemo[\s\S]{0,400}motivNepotrivit/.test(s),
    "produsele nepotrivite au fost scoase din rezultate in loc sa fie stinse",
  );
});

test("⚠ recomandarile accepta si produse cu variante; cele bifabile, nu", () => {
  /*
   * Cardul de recomandare DUCE pe pagina produsului, deci acolo o rochie cu mărimi e
   * perfect bună. O ofertă care se ia cu o bifă n-are unde să întrebe mărimea.
   */
  assert.equal(DESPRE_TIPUL_OFERTEI.cross_sell.cereProduseGataDeAdaugat, undefined,
    "recomandarile au capatat filtrul: magazinele de haine raman fara ele");
  for (const t of ["frequently_bought", "order_bump", "upgrade", "bogo", "gift"] as OfferType[]) {
    assert.equal(DESPRE_TIPUL_OFERTEI[t].cereProduseGataDeAdaugat, true, t);
  }
});

test("⚠ orice tip care OFERA produse si le ia dintr-o apasare poarta steagul", () => {
  /*
   * Plasa pentru tipul urmator. Un tip nou care ofera produse si se ia cu o bifa,
   * dar fara steag, ar fi lasat comerciantul sa aleaga o rochie cu marimi — iar
   * vitrina ar fi aruncat-o in tacere.
   */
  for (const t of OFFER_TYPES) {
    const d = DESPRE_TIPUL_OFERTEI[t];
    if (!d.numeleProduselorOferite) continue;          // nu ofera produse
    if (t === "cross_sell") continue;                   // duce pe pagina produsului
    if (!d.sePoateFace) continue;                       // inca nefacut
    assert.equal(d.cereProduseGataDeAdaugat, true,
      `„${d.eticheta}” ofera produse luate dintr-o apasare, dar n-are steagul`);
  }
});
