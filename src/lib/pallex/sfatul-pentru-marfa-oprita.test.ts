import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

import { sfatPentruMarfaOprita } from "./sfatul-pentru-marfa-oprita";
import {
  BORDEROU_NEVALIDAT,
  BORDEROU_VALIDAT_DE_CLIENT,
  BORDEROU_VALIDAT_DE_TRANSPORTATOR,
} from "./client";
import { partidaPallEx } from "./expediere";

/*
 * ⚠ AVERTISMENTUL CARE TRIMITEA OMUL SA VALIDEZE CE VALIDASE DEJA.
 *
 * La Pall-Ex marfa nu pleaca la emitere: partida intra intr-un borderou, si abia
 * validarea borderoului o porneste. De aceea cronul are un avertisment pe care
 * niciun alt curier nu-l are: „a trecut o zi si partida tot nu e in retea".
 *
 * Mesajul spunea intotdeauna acelasi lucru: „cel mai des inseamna ca borderoul nu
 * a fost validat, deschide comanda si valideaza-l". Dar fluxul lor are TREI stari
 * (clasa `Bordereau` din specificatie):
 *
 *   0  nevalidat                  marfa sta, si comerciantul chiar o poate porni
 *   1  validat de CLIENT          si-a facut partea; asteapta transportatorul
 *   2  validat de TRANSPORTATOR   ar trebui sa fie pe drum
 *
 * Deci cine si-a validat borderoul acum doua zile si asteapta masina era trimis sa
 * apese un buton stins. Merge in ClientPlus, nu gaseste nimic de facut, si a doua
 * oara nu mai crede avertismentul.
 *
 * ⚠ Si nu e o teama inventata: chiar cronul avea deja scris in el de ce conteaza.
 * Cand lista de statusuri a magazinului nu se putea citi, TOATE partidele primeau
 * „valideaza borderoul", iar comentariul de acolo numeste tocmai urmarea asta.
 * Paza fusese pusa pentru o singura cauza a mesajului fals; cealalta, mai deasa,
 * ramasese deschisa.
 *
 * ═══ CE APARA PROBELE ═══
 *
 *   1. fiecare dintre cele trei stari primeste sfatul EI;
 *   2. ⚠ cand nu stim, mesajul nu AFIRMA nicio cauza: cere doar sa se uite;
 *   3. ⚠ si cronul chiar intreaba borderoul, in loc sa presupuna.
 */

describe("Pall-Ex: sfatul se potriveste cu starea borderoului", () => {
  test("nevalidat: omul chiar are ce apasa, si i se spune", () => {
    const s = sfatPentruMarfaOprita(BORDEROU_NEVALIDAT);
    assert.match(s, /NU e validat/);
    assert.match(s, /Valideaza borderoul/);
  });

  test("validat de client: i se spune ca NU mai are ce valida", () => {
    const s = sfatPentruMarfaOprita(BORDEROU_VALIDAT_DE_CLIENT);
    assert.match(s, /nu mai ai\s+ce valida/);
    assert.match(s, /transportator/);
    /* ⚠ Chiar defectul, scris ca proba: niciun indemn de a valida. */
    assert.doesNotMatch(s, /apasa „Valideaza/);
  });

  test("validat de transportator: marfa ar trebui sa fie preluata", () => {
    const s = sfatPentruMarfaOprita(BORDEROU_VALIDAT_DE_TRANSPORTATOR);
    assert.match(s, /validat si de transportator/);
    assert.doesNotMatch(s, /apasa „Valideaza/);
  });

  /*
   * ⚠ Necunoscutul nu se umple cu presupunerea cea mai deasa. Aici intra si
   * comanda fara borderou pe ea, si citirea picata, si o stare pe care ei ar
   * adauga-o maine.
   */
  test("cand nu stim, mesajul cere sa se UITE, nu sa valideze", () => {
    for (const stare of [null, undefined, 7, -1, 3]) {
      const s = sfatPentruMarfaOprita(stare);
      assert.match(s, /Verifica in comanda/);
      assert.doesNotMatch(s, /NU e validat/);
      assert.doesNotMatch(s, /apasa „Valideaza/);
    }
  });

  test("toate patru raspunsurile sunt diferite intre ele", () => {
    const toate = [
      sfatPentruMarfaOprita(BORDEROU_NEVALIDAT),
      sfatPentruMarfaOprita(BORDEROU_VALIDAT_DE_CLIENT),
      sfatPentruMarfaOprita(BORDEROU_VALIDAT_DE_TRANSPORTATOR),
      sfatPentruMarfaOprita(null),
    ];
    assert.equal(new Set(toate).size, 4, "doua stari primesc acelasi sfat");
  });
});

/*
 * ⚠ MUTANTUL PE APELANT.
 *
 * Sfatul poate fi perfect si tot fals, daca cine il cheama nu-i da starea
 * adevarata. Cronul e singurul loc care trimite avertismentul, si el trebuie sa
 * CITEASCA borderoul comenzii.
 *
 * ⚠ Proba citeste SURSA fiindca ruta cere Supabase, autentificare de cron si un
 * cont Pall-Ex. Aceeasi unealta ca la `scrierile-din-actiuni-poarta-magazinul`.
 */
describe("Pall-Ex: cronul intreaba borderoul, nu presupune", () => {
  const SURSA = "src/app/api/cron/pallex-tracking/route.ts";

  test("avertismentul se compune din starea citita a borderoului", () => {
    const text = readFileSync(SURSA, "utf8").replace(/\r\n/g, "\n");

    assert.match(text, /citesteBorderou\(config, o\.pallex_bordereau_id as number\)/);
    assert.match(text, /\+ sfatPentruMarfaOprita\(stareBorderou\),/);

    /*
     * ⚠ Si coloana chiar se CERE din baza. Fara ea, `o.pallex_bordereau_id` ar fi
     * `undefined` la fiecare rand, citirea n-ar avea loc niciodata si sfatul ar
     * cadea pe ramura „nu stim" pentru toata lumea: o reparatie care arata ca
     * merge si nu schimba nimic. Vezi [[coloana-lipsa-rupe-toata-interogarea]].
     */
    assert.match(text, /\.select\("[^"]*pallex_bordereau_id[^"]*"\)/);

    /* ⚠ Vechiul text, care afirma cauza, n-are voie sa se intoarca. */
    assert.doesNotMatch(text, /Cel mai des inseamna ca borderoul nu a fost validat/);
  });

  test("citirea picata NU se citeste ca „nevalidat”", () => {
    const text = readFileSync(SURSA, "utf8").replace(/\r\n/g, "\n");
    const start = text.indexOf("let stareBorderou");
    assert.notEqual(start, -1, "nu gasesc citirea borderoului");
    const bucata = text.slice(start, start + 900);
    assert.match(bucata, /catch\s*\{[\s\S]*?stareBorderou = null;/);
  });
});

/*
 * ⚠ CELE DOUA ADRESE TRECEAU PRIN REGULI DIFERITE.
 *
 * `consignee_locality` se plia prin ajutorul comun („Sector 3" devine
 * „Bucuresti"), iar `consignor_locality` nu. Asimetria n-avea niciun motiv scris,
 * si conteaza: comerciantul isi scrie orasul DE MANA in setari, deci un depozit
 * bucurestean putea pleca drept localitatea „Sector 3", pe care reteaua lor de
 * hub-uri n-o cunoaste ca oras.
 */
describe("Pall-Ex: amandoua localitatile se plieaza la fel", () => {
  const ADRESA = {
    nume: "Magazinul Meu SRL",
    strada: "Calea Victoriei 12",
    oras: "Sector 3",
    judet: "Municipiul Bucuresti",
    codPostal: "030167",
    telefon: "0721000000",
  };

  function partida(peste: Record<string, unknown> = {}) {
    return partidaPallEx({
      tip: 3,
      referinta: "CMD-1",
      expeditor: { ...ADRESA },
      destinatar: { ...ADRESA, nume: "Client SRL" },
      dataRidicare: "2026-09-17",
      oraDeschidereRidicare: "08:00",
      oraInchidereRidicare: "17:00",
      dataLivrare: "2026-09-18",
      oraDeschidereLivrare: "08:00",
      oraInchidereLivrare: "17:00",
      numarPaleti: 1,
      greutateKg: 100,
      ...peste,
    } as Parameters<typeof partidaPallEx>[0]);
  }

  test("„Sector 3” se plieaza in „Bucuresti” pe AMANDOUA adresele", () => {
    const p = partida();
    assert.equal(p.consignee_locality, "Bucuresti");
    assert.equal(p.consignor_locality, "Bucuresti");
  });

  test("in afara Bucurestiului numele ramane al lui", () => {
    const p = partida({
      expeditor: { ...ADRESA, oras: "Cluj-Napoca", judet: "Cluj" },
      destinatar: { ...ADRESA, nume: "Client SRL", oras: "Sibiu", judet: "Sibiu" },
    });
    assert.equal(p.consignor_locality, "Cluj-Napoca");
    assert.equal(p.consignee_locality, "Sibiu");
  });
});
