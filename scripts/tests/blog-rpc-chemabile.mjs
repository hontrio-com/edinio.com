#!/usr/bin/env node
/**
 * Fiecare functie din baza pe care o cheama blogul chiar exista, cu numele de
 * argumente pe care le trimite codul?
 *
 * ═══ DE CE EXISTA UNEALTA ASTA ═══
 *
 * Blogul cheama zece functii din baza prin `.rpc(...)`. Niciuna nu e vazuta de
 * `tsc`: tabelele si functiile de blog nu sunt in `database.types.ts`, deci
 * clientii sunt fara tipuri. Iar PostgREST alege functia dupa NUMELE
 * argumentelor, nu dupa ordine — deci un `p_slug_vechi` scris `p_vechi_slug`
 * trece de typecheck, trece de build, si cade abia cand un om apasa „Salveaza".
 *
 * Mai rau: cateva dintre ele sunt pe cai rare. `blog_dezaboneaza` se cheama doar
 * cand cineva iese de pe lista; o nepotrivire acolo poate sta stricata luni de
 * zile, iar cand se vede, se vede sub forma unei plangeri de spam.
 *
 * ⚠ CUM SE INTREABA FARA SA SE SCRIE, SI DE CE NU E DE AJUNS SA CREZI CA ASA E.
 *
 * Prima scriere a acestui fisier spunea, exact aici, „nu cheama functiile care
 * scriu... altfel proba ar fi lasat gunoi in baza de productie". Propozitia era
 * FALSA. `blog_cere_confirmare` chemata cu argumente goale a inserat un rand in
 * `blog_subscribers` pe PRODUCTIE, pe 30.08.2026 la 18:44. L-am gasit din
 * intamplare, numarand abonatii pentru altceva.
 *
 * Deci acum sunt doua lucruri, nu unul:
 *
 * 1. Fiecare chemare are un motiv ANUME pentru care nu poate scrie, scris langa
 *    ea. Pentru cele mai multe e „argumentul nu se potriveste cu niciun rand".
 *    Pentru `blog_cere_confirmare`, care insereaza chiar si pe o adresa goala, e
 *    o data NEVALIDA: PostgREST potriveste intai functia dupa numele
 *    argumentelor (deci un nume gresit tot da PGRST202, care e ce probam), si
 *    abia apoi Postgres incearca sa faca din sir un `timestamptz` si cade cu
 *    22007 — inainte sa se execute vreo instructiune.
 *
 * 2. Se NUMARA randurile inainte si dupa. Fiindca punctul 1 e tot un rationament
 *    al meu, iar rationamentul de dinainte era gresit. Daca vreun numar s-a
 *    schimbat, proba cade si spune care tabela.
 *
 * ═══ CUM SE FOLOSESTE ═══
 *
 *   node scripts/tests/blog-rpc-chemabile.mjs
 *
 * Cere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, si foloseste si cheia anon
 * ca sa verifice cine ARE si cine NU ARE voie.
 *
 * ⚠ NU intra in `npm test`: aia ruleaza offline. Se ruleaza INAINTE DE PUSH.
 */

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!url || !service) {
  console.error("Lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Vezi antetul fisierului.");
  process.exit(2);
}

/**
 * Ce cheama codul, si cu ce argumente.
 *
 * `publica: true` inseamna ca se cheama de pe paginile publice, cu cheia
 * anonima — deci `anon` TREBUIE sa aiba voie. Restul trec prin cheia de
 * serviciu, si pentru ele se verifica si ca `anon` NU are voie: cheia anonima e
 * publica, deci un grant in plus acolo inseamna ca oricine poate chema functia
 * direct, ocolind orice plafon scris in actiunea de server.
 */
const CHEMARI = [
  /* Nu scrie: niciun articol n-are slugul asta, deci `insert ... select` nu alege nimic. */
  { fn: "blog_creste_citirile", args: { p_slug: "___proba___" }, publica: false },

  /* Nu scriu: sunt `stable`, doar citesc. */
  { fn: "blog_etichete_folosite", args: {}, publica: true },
  { fn: "blog_categorii_folosite", args: {}, publica: true },
  { fn: "blog_subiectele_autorului", args: { p_autor: "00000000-0000-0000-0000-000000000000" }, publica: true },

  /*
    ⚠ ASTA CHIAR SCRIE, SI A SCRIS. Insereaza pe orice adresa, inclusiv una goala.
    `p_expira_la` e dinadins un sir care nu poate fi o data: PostgREST potriveste
    intai functia dupa numele argumentelor, apoi Postgres cade la conversie cu
    22007 — deci aflam ce voiam fara sa se execute nicio instructiune.
  */
  { fn: "blog_cere_confirmare", args: { p_email: "", p_token_hash: "", p_expira_la: "___nu-e-o-data___", p_sursa: "" }, publica: false },

  /* Nu scriu: `where` pe un jeton care nu poate exista (24 de octeti de intamplare). */
  { fn: "blog_confirma", args: { p_token_hash: "___proba___", p_ip: "" }, publica: false },
  { fn: "blog_dezaboneaza", args: { p_unsub_token: "___proba___" }, publica: false },

  /* Nu scrie: iese pe prima linie cand vreun slug e null. */
  { fn: "blog_muta_taxonomia", args: { p_fel: "categorie", p_slug_vechi: null, p_slug_nou: null }, publica: false },

  /* Nu scriu: id inexistent, deci ies fara sa atinga nimic. */
  { fn: "blog_sterge_articol", args: { p_id: "00000000-0000-0000-0000-000000000000" }, publica: false },
  { fn: "blog_sterge_eticheta", args: { p_id: "00000000-0000-0000-0000-000000000000" }, publica: false },
  { fn: "blog_sterge_taxonomia", args: { p_fel: "categorie", p_id: "00000000-0000-0000-0000-000000000000" }, publica: false },
  {
    fn: "blog_actualizeaza_taxonomia",
    args: { p_fel: "categorie", p_id: "00000000-0000-0000-0000-000000000000", p_rand: {} },
    publica: false,
  },

  /*
    ⚠ ASTA CHIAR SCRIE. Un `p_rand` gol cade pe NOT NULL (`slug`) inainte sa se
    scrie ceva — dar rationamentul asta e tot al meu, iar unul de-al meu a fost
    deja gresit o data. Plasa care chiar apara e numaratoarea de randuri de la
    final.
  */
  { fn: "blog_creeaza_articol", args: { p_rand: {}, p_etichete: null }, publica: false },

  /* Nu scrie: amprenta si adresa care nu pot exista. */
  {
    fn: "blog_anuleaza_confirmare",
    args: { p_email: "___proba___@nicaieri.invalid", p_token_hash: "___proba___" },
    publica: false,
  },

  {
    fn: "blog_salveaza_articol",
    args: {
      p_id: "00000000-0000-0000-0000-000000000000",
      p_rand: {},
      p_etichete: null,
      p_salvat_de: null,
      p_versiuni: 50,
      p_versiune_asteptata: null,
      p_creeaza_versiune: false,
    },
    /*
      ⚠ Aceasta ARUNCA dinadins, pe un id care nu exista: `no_data_found`. E
      singurul fel de a-i vedea semnatura fara sa scriem nimic — iar chiar
      exceptia aceea dovedeste ca PostgREST a gasit functia si i-a potrivit TOATE
      argumentele pe nume.
    */
    asteptat: "PGRST",
    publica: false,
  },

  /* Nu scrie: e `stable`, doar citeste. Publica, fiindca feedul se serveste
     de pe o ruta fara sesiune. */
  { fn: "blog_articole_pentru_feed", args: { p_cate: 1 }, publica: true },

  /*
    ⚠ ARUNCA dinadins, pe un articol care nu exista: `no_data_found`. Ca la
    `blog_salveaza_articol`, chiar exceptia dovedeste ca PostgREST a gasit
    functia si i-a potrivit toate argumentele pe nume.
  */
  {
    fn: "blog_restaureaza_versiune",
    args: {
      p_articol: "00000000-0000-0000-0000-000000000000",
      p_versiune: "00000000-0000-0000-0000-000000000000",
      p_versiune_asteptata: null, p_salvat_de: null, p_minute: 1, p_versiuni: 50,
    },
    asteptat: "PGRST",
    publica: false,
  },

  { fn: "redactorii_blogului", args: {}, publica: false },
  { fn: "cont_dupa_email", args: { p_email: "___proba___@nicaieri.invalid" }, publica: false },
];

/**
 * Cate randuri are fiecare tabela pe care proba ar putea-o atinge.
 *
 * ⚠ ASTA E PLASA ADEVARATA. Motivele scrise langa fiecare chemare sunt tot
 * rationamente ale mele, iar unul dintre ele a fost deja gresit. Numerele nu sunt.
 */
const TABELE_DE_PAZIT = [
  "blog_subscribers", "blog_posts", "blog_post_tags", "blog_post_revisions",
  "blog_redirects", "blog_post_stats", "blog_tags", "blog_authors", "blog_categories",
];

async function numaraRanduri() {
  const out = {};
  for (const t of TABELE_DE_PAZIT) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=0`, {
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        Prefer: "count=exact",
      },
    });
    // Antetul `content-range` are forma `<interval>/<total>`; cu `limit=0`,
    // intervalul lipseste si ramane doar totalul dupa bara.
    const cr = r.headers.get("content-range") ?? "";
    out[t] = Number.parseInt(cr.split("/")[1] ?? "-1", 10);
  }
  return out;
}

async function cheama(fn, args, cheie) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: cheie,
      Authorization: `Bearer ${cheie}`,
      "Content-Type": "application/json",
      /* Nu se cere niciun rand inapoi: unele intorc tabele mari. */
      Prefer: "count=none",
    },
    body: JSON.stringify(args),
  });
  let corp = null;
  try { corp = await r.json(); } catch { /* raspuns gol e in regula */ }
  return { stare: r.status, cod: corp?.code ?? null, mesaj: corp?.message ?? "" };
}

let rele = 0;
const inainte = await numaraRanduri();

for (const { fn, args, publica } of CHEMARI) {
  const cu = await cheama(fn, args, service);

  /*
   * PGRST202 = „nu am gasit functia cu argumentele astea". E singurul raspuns
   * care inseamna ca ne-am inselat noi. Orice altceva — inclusiv o exceptie
   * ridicata de functie — dovedeste ca a fost gasita si potrivita.
   */
  if (cu.cod === "PGRST202") {
    rele++;
    console.error(`LIPSA     ${fn}(${Object.keys(args).join(", ")})`);
    console.error(`          ${cu.mesaj}`);
    continue;
  }
  if (cu.stare === 404) {
    rele++;
    console.error(`LIPSA     ${fn} — 404: ${cu.mesaj}`);
    continue;
  }

  /* Si cine are voie sa o cheme. */
  if (anon) {
    const fara = await cheama(fn, args, anon);
    const anonPoate = fara.cod !== "42501" && fara.stare !== 401 && fara.stare !== 403;
    if (publica && !anonPoate) {
      rele++;
      console.error(`INCHISA   ${fn} — se cheama de pe pagini publice, dar anon nu are voie`);
      continue;
    }
    if (!publica && anonPoate) {
      rele++;
      console.error(`DESCHISA  ${fn} — cheia anonima e PUBLICA, deci oricine o poate chema direct`);
      continue;
    }
  }

  console.log(`OK        ${fn}  (${publica ? "publica" : "doar cheia de serviciu"})`);
}

/* ═══ Si acum: a scris ceva? ═══ */
const dupa = await numaraRanduri();
for (const t of TABELE_DE_PAZIT) {
  if (inainte[t] < 0 || dupa[t] < 0) {
    console.warn(`NENUMARAT ${t} — n-am putut citi numarul de randuri`);
    continue;
  }
  if (inainte[t] !== dupa[t]) {
    rele++;
    console.error(`A SCRIS    ${t}: ${inainte[t]} -> ${dupa[t]} randuri`);
    console.error("           Proba asta NU are voie sa schimbe nimic. Vezi nota de sus:");
    console.error("           pe 30.08.2026 a lasat un rand in `blog_subscribers` pe productie.");
  }
}

if (rele > 0) {
  console.error(`\n${rele} functii nu sunt chemabile asa cum le cheama codul.`);
  console.error("PostgREST alege functia dupa NUMELE argumentelor. `tsc` nu vede nimic din asta.");
  process.exit(1);
}
console.log(`\nOK: toate cele ${CHEMARI.length} functii sunt chemabile exact cum le cheama codul.`);
