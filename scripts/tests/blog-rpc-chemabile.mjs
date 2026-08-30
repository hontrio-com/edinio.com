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
 * ⚠ NU CHEAMA FUNCTIILE CARE SCRIU. Se intreaba doar daca PostgREST le CUNOASTE,
 * trimitand argumentele intr-o cerere pe care o refuza pentru alt motiv. Altfel
 * proba ar fi lasat gunoi in baza de productie.
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
  { fn: "blog_creste_citirile", args: { p_slug: "___proba___" }, publica: false },
  { fn: "blog_etichete_folosite", args: {}, publica: true },
  { fn: "blog_categorii_folosite", args: {}, publica: true },
  { fn: "blog_subiectele_autorului", args: { p_autor: "00000000-0000-0000-0000-000000000000" }, publica: true },
  { fn: "blog_cere_confirmare", args: { p_email: "", p_token_hash: "", p_expira_la: null, p_sursa: "" }, publica: false },
  { fn: "blog_confirma", args: { p_token_hash: "___proba___", p_ip: "" }, publica: false },
  { fn: "blog_dezaboneaza", args: { p_unsub_token: "___proba___" }, publica: false },
  { fn: "blog_muta_taxonomia", args: { p_fel: "categorie", p_slug_vechi: null, p_slug_nou: null }, publica: false },
  {
    fn: "blog_salveaza_articol",
    args: {
      p_id: "00000000-0000-0000-0000-000000000000",
      p_rand: {}, p_etichete: null, p_slug_vechi: null, p_lasa_redirect: false,
      p_salvat_de: null, p_titlu_vechi: null, p_html_vechi: null, p_versiuni: 50,
    },
    /*
      ⚠ Aceasta ARUNCA dinadins, pe un id care nu exista: `no_data_found`.
      E singurul fel de a-i vedea semnatura fara sa scriem nimic — iar chiar
      exceptia aceea dovedeste ca PostgREST a gasit functia si i-a potrivit
      TOATE argumentele pe nume.
    */
    asteptat: "PGRST",
    publica: false,
  },
  { fn: "redactorii_blogului", args: {}, publica: false },
  { fn: "cont_dupa_email", args: { p_email: "___proba___@nicaieri.invalid" }, publica: false },
];

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

if (rele > 0) {
  console.error(`\n${rele} functii nu sunt chemabile asa cum le cheama codul.`);
  console.error("PostgREST alege functia dupa NUMELE argumentelor. `tsc` nu vede nimic din asta.");
  process.exit(1);
}
console.log(`\nOK: toate cele ${CHEMARI.length} functii sunt chemabile exact cum le cheama codul.`);
