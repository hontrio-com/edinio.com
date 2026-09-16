import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { cheieToken } from "@/lib/integrari/cheie-token";

/*
 * ⚠⚠ PROBA CARE LIPSEA, SI PE CARE UN COMENTARIU O CITA CA EXISTENTA.
 *
 * `src/lib/integrari/secret-server.ts` scrie, la randul 34: „Vezi proba din
 * `fancourier.token.test.ts`". Fisierul acela NU EXISTA in depozit. Adica exact
 * locul unde s-a inchis cea mai lata gaura de securitate a platformei isi trimitea
 * cititorul la o dovada care nu e nicaieri, iar cine venea sa refactorizeze pleca
 * linistit.
 *
 * ═══ CE S-A INTAMPLAT PE 09.09.2026, SI DE CE CONTEAZA ORDINEA ═══
 *
 * Gaura avea DOUA jumatati, si numai impreuna scoteau date:
 *
 *   1. In `secretDinConfig`, scurtatura `if (dinFormular) return dinFormular` sta
 *      INAINTEA lui `getUser`. Toti cei 19 apelanti ai functiei („testeaza
 *      conexiunea", „incarca datele contului"), din 17 fisiere de actiuni, se
 *      bazau pe ea ca pe o poarta si nu mai verificau nimic ei insisi. Cine
 *      trimitea o parola NEVIDA sarea peste tot restul: `businessId` devenea
 *      decorativ si sesiunea nu se cerea deloc.
 *   2. Cache-ul de token era cheiat DOAR dupa partea publica (`username` la FAN),
 *      deci dupa un login reusit orice cerere cu acelasi username si un secret
 *      gresit primea tokenul valid din cache, fara sa mai atinga furnizorul.
 *
 * Compuse: o singura cerere neautentificata scotea contul altui comerciant din
 * `reports/branches`, cu denumire, persoana de contact, ambele telefoane, email si
 * IBAN.
 *
 * ═══ DE CE PROBELE ARATA ASA ═══
 *
 * Amandoua reparatiile sunt ORDINE si FORMA, nu purtare noua: o mutare de trei
 * randuri sau un argument scapat le desfac, si nimic nu cade. Nu exista baza la
 * indemana in probe, iar un `secretDinConfig` chemat fara Supabase n-ar dovedi
 * nimic despre ordine. Deci se citeste SURSA, ca la
 * `scrierile-din-actiuni-poarta-magazinul` si `citire-secrete`.
 *
 * ⚠ Si proba nu apara FAN, ci REGULA: censul de mai jos trece prin toti clientii
 * care tin token in proces, fiindca a noua integrare care apare maine e cea care
 * il va cheia iar dupa username.
 */

const SRC = join(process.cwd(), "src");

// ─── 1. Cheia se schimba odata cu secretul ────────────────────────────────────

describe("cheia de token amesteca SECRETUL, nu doar partea publica", () => {
  test("acelasi username cu parola alta da alta cheie", () => {
    const a = cheieToken(["magazin@exemplu.ro"], ["parola-buna"]);
    const b = cheieToken(["magazin@exemplu.ro"], ["parola-gresita"]);
    assert.notEqual(a, b, "doua parole diferite ar imparti acelasi token din cache");
  });

  test("secretul NU ajunge in clar in cheie", () => {
    /* Cheia ajunge in mesaje de diagnostic si in denumiri de intrari: o parola in
       clar acolo ar fi al doilea defect peste primul. */
    const k = cheieToken(["magazin@exemplu.ro"], ["parola-foarte-secreta"]);
    assert.doesNotMatch(k, /parola-foarte-secreta/);
  });

  test("partile nu se pot lipi una in alta", () => {
    /* Fara separator, ["ab","c"] si ["a","bc"] ar da acelasi hash, deci doua
       conturi diferite ar imparti acelasi token. */
    assert.notEqual(cheieToken(["a"], ["b", "c"]), cheieToken(["a"], ["bc"]));
    assert.notEqual(cheieToken(["ab"], ["c"]), cheieToken(["a", "b"], ["c"]));
  });

  test("aceleasi date dau aceeasi cheie: cache-ul chiar trebuie sa nimereasca", () => {
    assert.equal(
      cheieToken(["u", "test"], ["p"]),
      cheieToken(["u", "test"], ["p"]),
    );
  });
});

// ─── 2. Censul: niciun client nu-si cheiaza tokenul fara secret ───────────────

/** Toate fisierele `.ts` din `src`, fara probe. */
function surse(dir = SRC): string[] {
  const iesire: string[] = [];
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) {
      iesire.push(...surse(cale));
      continue;
    }
    if (!nume.endsWith(".ts") && !nume.endsWith(".tsx")) continue;
    if (nume.includes(".test.")) continue;
    iesire.push(cale);
  }
  return iesire;
}

describe("niciun client nu-si cheiaza tokenul doar dupa partea publica", () => {
  /** Apelurile catre ajutorul comun, cu cele doua liste ale lor. */
  function apeluri(): { fisier: string; publice: string; secrete: string }[] {
    const gasite: { fisier: string; publice: string; secrete: string }[] = [];
    for (const cale of surse()) {
      const text = readFileSync(cale, "utf8");
      if (!text.includes("cheieToken(")) continue;
      for (const m of text.matchAll(/cheieToken\(\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]\s*\)/g)) {
        gasite.push({ fisier: cale.slice(SRC.length + 1).split("\\").join("/"), publice: m[1], secrete: m[2] });
      }
    }
    return gasite;
  }

  /*
   * ⚠ GARDA DE NUMARATOARE, obligatorie aici.
   *
   * Tiparul de mai sus poate inceta sa potriveasca dintr-o schimbare de forma (o
   * variabila in loc de tablou literal, un `prettier` care rupe randul). Atunci
   * censul ar trece pe o lista GOALA, verde si inutil: exact modul de esec pe care
   * proiectul il are scris in [[proba-pe-subsir-nu-apara-o-lista]].
   */
  test("cititorul chiar gaseste apelurile", () => {
    assert.ok(apeluri().length >= 6, `am citit doar ${apeluri().length} apeluri: cititorul s-a rupt`);
  });

  test("fiecare apel trece SI un secret, nu doar partea publica", () => {
    for (const a of apeluri()) {
      assert.notEqual(
        a.secrete.trim(), "",
        `${a.fisier}: tokenul se cheiaza fara secret, deci un secret gresit ar primi tokenul valid din cache`,
      );
    }
  });

  /*
   * ⚠ SI NICIUN CACHE DE TOKEN NU RAMANE PE DINAFARA CENSULUI.
   *
   * Regula nu e „toti cheama `cheieToken`”: cele doua OAuth-uri Google isi pun chiar
   * jetonul de reimprospatare in cheie, adica secretul E acolo, doar ca in clar.
   * Regula e mai simpla si mai tare: ORICE cache de token din proces are secretul
   * in cheie. Cele doua liste de mai jos spun pe ce cale o face fiecare, iar un
   * fisier care tine token si nu e in niciuna dintre ele cade: a noua integrare
   * care apare maine e cea care il va cheia iar dupa partea publica.
   */
  const PRIN_AJUTORUL_COMUN = [
    "lib/cargus.ts", "lib/colete.ts", "lib/fancourier.ts", "lib/oblio.ts",
    "lib/sameday/client.ts", "lib/woot.ts",
  ];
  /* ⚠ Aici secretul e chiar jetonul de reimprospatare, pus in cheie NEHASUIT. Merge
     (cheia se schimba odata cu el), dar e mai slab decat ajutorul comun: cheia poate
     ajunge in diagnostice. Se trec aici pe fata, nu se strecoara. */
  const CU_SECRETUL_IN_CHEIE = [
    { fisier: "lib/google-analytics/oauth.ts", secret: "refreshToken" },
    { fisier: "lib/google-merchant/oauth.ts", secret: "refreshToken" },
  ];

  function tinTokenInProces(): string[] {
    const gasite: string[] = [];
    for (const cale of surse()) {
      const text = readFileSync(cale, "utf8");
      if (!/tokenCache|TOKEN_CACHE|cacheToken/.test(text)) continue;
      gasite.push(cale.slice(SRC.length + 1).split("\\").join("/"));
    }
    return gasite.sort();
  }

  test("censul chiar gaseste cache-urile", () => {
    assert.ok(tinTokenInProces().length >= 8, "cititorul de cache-uri s-a rupt");
  });

  test("fiecare cache de token e pe una din cele doua cai, si pe niciuna alta", () => {
    const stiute = new Set([...PRIN_AJUTORUL_COMUN, ...CU_SECRETUL_IN_CHEIE.map((x) => x.fisier)]);
    const straine = tinTokenInProces().filter((f) => !stiute.has(f));
    assert.deepEqual(
      straine, [],
      "un cache de token nou nu e in cens: verifica daca secretul chiar intra in cheie",
    );
  });

  test("cele care merg prin ajutorul comun chiar il cheama", () => {
    for (const f of PRIN_AJUTORUL_COMUN) {
      const text = readFileSync(join(SRC, f), "utf8");
      assert.match(text, /cheieToken\(/, `${f} nu mai trece prin ajutorul comun`);
    }
  });

  test("cele doua OAuth Google au secretul in chiar cheia de cache", () => {
    for (const { fisier, secret } of CU_SECRETUL_IN_CHEIE) {
      const text = readFileSync(join(SRC, fisier), "utf8");
      const cautari = [...text.matchAll(/tokenCache\.get\(([^)]*)\)/g)].map((m) => m[1].trim());
      assert.ok(cautari.length > 0, `${fisier}: nu mai gasesc cautarea in cache`);

      for (const arg of cautari) {
        /* Cand cheia sta intr-o variabila, se urmareste un pas: ne intereseaza
           EXPRESIA din care iese cheia, nu numele ei. */
        const prinVariabila = /^[A-Za-z_$][\w$]*$/.test(arg)
          ? new RegExp(`const\\s+${arg}\\s*=\\s*([^;]+);`).exec(text)?.[1] ?? ""
          : "";
        const expresie = `${arg} ${prinVariabila}`;
        assert.ok(
          expresie.includes(secret),
          `${fisier}: cheia de cache (${expresie.trim()}) nu cuprinde secretul, deci un secret gresit ar primi tokenul valid`,
        );
      }
    }
  });
});

// ─── 3. Identitatea se verifica INAINTE de scurtatura din formular ───────────

describe("secretDinConfig: identitatea vine INAINTEA credentialei din formular", () => {
  const CALE = join(SRC, "lib", "integrari", "secret-server.ts");

  function sursa(): string {
    return readFileSync(CALE, "utf8").replace(/\r\n/g, "\n");
  }

  test("sesiunea si proprietatea se cer inaintea scurtaturii", () => {
    const s = sursa();

    const sesiune = s.indexOf('if (!user) return "";');
    const proprietate = s.indexOf('if (!biz) return "";');
    const scurtatura = s.indexOf("if (dinFormular) return dinFormular;");

    assert.ok(sesiune > 0, "nu mai gasesc verificarea de sesiune");
    assert.ok(proprietate > 0, "nu mai gasesc verificarea de proprietate");
    assert.ok(scurtatura > 0, "nu mai gasesc scurtatura din formular");

    assert.ok(
      sesiune < scurtatura,
      "credentiala din formular are iar intaietate fata de sesiune: actiunea raspunde oricui",
    );
    assert.ok(
      proprietate < scurtatura,
      "credentiala din formular are iar intaietate fata de proprietatea magazinului: `businessId` redevine decorativ",
    );
  });

  /*
   * ⚠ Si citirea din baza ramane dupa amandoua. O scurtatura mutata jos, dar o
   * citire urcata sus, ar scoate acelasi secret pe alt drum.
   */
  test("citirea din baza sta dupa ambele verificari", () => {
    const s = sursa();
    const citire = s.indexOf("createAdminClient()");
    assert.ok(citire > s.indexOf('if (!biz) return "";'), "citirea cu service role a urcat deasupra gardii");
  });

  /*
   * ⚠ Esecul se intoarce ca SIR GOL, nu ca exceptie si nu ca `null`.
   *
   * Toti apelantii trateaza golul ca „lipseste credentiala" si raspund cu un mesaj
   * omenesc. Un `null` strecurat aici ar trece de `if (!parola)` la fel, dar un
   * `throw` ar scoate o pagina de eroare in locul mesajului, iar o valoare
   * plauzibila ar pleca mai departe la furnizor.
   */
  test("orice esec intoarce sirul gol", () => {
    const s = sursa();
    const corp = s.slice(s.indexOf("export async function secretDinConfig"));
    assert.equal((corp.match(/return "";/g) ?? []).length >= 5, true, "iesirile de esec nu mai intorc sirul gol");
    assert.doesNotMatch(corp, /return null;/);
  });
});
