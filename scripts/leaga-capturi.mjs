/**
 * Leaga fisierele din `public/capturi/ajutor/` de capturile din ghiduri.
 *
 * ═══ DE CE E NEVOIE DE PASUL ASTA ═══
 *
 * O poza pusa in folder NU se vede singura: `Captura.src` trebuie scris in ghid.
 * Cat timp lipseste, `CapturaGhid` deseneaza substituentul punctat cu textul
 * `alt`, adica sarcina pentru cine face poza. Scriptul asta scrie calea, ca sa
 * nu se faca de mana de zeci de ori.
 *
 * ⚠ NUMELE FISIERULUI POATE FI SI TITLUL GHIDULUI, nu doar slug-ul. Vezi mai jos
 * de ce, si ce se intampla cand un nume s-ar potrivi la doua ghiduri.
 *
 * Se ruleaza ori de cate ori se adauga capturi:  npm run capturi
 *
 * ═══ NUMELE FISIERULUI E SLUG-UL GHIDULUI ═══
 *
 * `public/capturi/ajutor/<categorie>/<slug-ul-ghidului>.webp`
 *
 * Fara numarul pasului in nume, dinadins: pasii se rescriu si se reordoneaza, iar
 * un „pas3” in nume ar ramane lipit de pasul gresit dupa prima reordonare, fara
 * sa crape nimic si fara sa observe cineva. Slug-urile sunt unice in tot centrul
 * (exista o proba pentru asta), deci numele nu se pot ciocni.
 *
 * ═══ SE VERIFICA SI FORMA POZEI, NU DOAR CA EXISTA ═══
 *
 * Locul capturii e desenat la raportul cerut, iar poza se aseaza in el cu
 * `object-cover`. Adica o poza 4:3 pusa intr-un loc 16:10 nu iese stramba si nu
 * da nicio eroare: i se TAIE marginile, tacut. De aceea fiecare fisier e masurat
 * cu `sharp` inainte de legare, iar cel cu raportul gresit e RAPORTAT si LASAT
 * nelegat, nu legat cu un avertisment pe care nu-l citeste nimeni.
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync, renameSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import sharp from "sharp";

const RADACINA = path.resolve(import.meta.dirname, "..");
const FOLDER = path.join(RADACINA, "public", "capturi", "ajutor");
const CATEGORII_DIR = path.join(RADACINA, "src", "lib", "website", "ajutor-categorii");

/** Cat de departe de raportul cerut se accepta o poza. 0.5% inseamna cateva pixeli. */
const TOLERANTA = 0.005;
const EXTENSII = [".webp", ".png", ".jpg", ".jpeg", ".avif"];

/**
 * Locul capturii se deseneaza pe 672px: coloana de text are 720px, iar bulina
 * pasului plus spatiul ei iau 48px. Pe un ecran cu doua puncte fizice pe punct
 * logic, asta cere 1344px in fisier. Sub atat, poza se vede moale.
 *
 * ⚠ Nu se RESPINGE pentru asta, doar se spune. `unoptimized` e pus pe `Image`,
 * deci Next nu redimensioneaza nimic: fisierul pleaca la vizitator asa cum e.
 * O poza mai mica arata prost, dar functioneaza; una respinsa n-ar arata deloc.
 */
const LATIME_MINIMA = 1344;
/** Peste atat, fisierul e mai greu decat trebuie pentru o poza de interfata. */
const OCTETI_MULTI = 200 * 1024;

const { TOATE_GHIDURILE } = await import(
  pathToFileURL(path.join(RADACINA, "src", "lib", "website", "ajutor.ts")).href
);

const capturaPasului = (p) => (typeof p === "string" ? undefined : p.captura);

/** slug -> ce stim despre ghid si despre captura lui */
const dupaSlug = new Map();
for (const g of TOATE_GHIDURILE) {
  const capturi = g.pasi.map(capturaPasului).filter(Boolean);
  dupaSlug.set(g.slug, { categorie: g.categorie.slug, titlu: g.titlu, capturi });
}

/*
  `--lista` rescrie lista de lucru din DATE. Fara asta, `CAPTURI-AJUTOR.csv` ar
  fi o poza de moment: ghidurile se mai adauga si se mai scot, iar cine ar lucra
  dupa lista veche ar fotografia ecrane pentru ghiduri care nu mai exista.
  Ies doar capturile care inca N-AU fisier, deci lista se scurteaza singura.
*/
if (process.argv.includes("--lista")) {
  const scapa = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const linii = [
    ["fisier", "categorie", "grup", "ghid", "titlu ghid", "pasul", "din pasi", "ce se fotografiaza"]
      .map(scapa)
      .join(","),
  ];
  let n = 0;
  for (const g of TOATE_GHIDURILE) {
    g.pasi.forEach((pas, i) => {
      const c = capturaPasului(pas);
      if (!c || c.src) return;
      n++;
      linii.push(
        [
          `public/capturi/ajutor/${g.categorie.slug}/${g.slug}.webp`,
          g.categorie.slug,
          g.grup,
          g.slug,
          g.titlu,
          i + 1,
          g.pasi.length,
          c.alt,
        ]
          .map(scapa)
          .join(","),
      );
    });
  }
  // BOM la inceput: fara el, Excel pe Windows citeste diacriticele gresit.
  writeFileSync(path.join(RADACINA, "CAPTURI-AJUTOR.csv"), "﻿" + linii.join("\r\n") + "\r\n", "utf8");

  /*
    Si o lista de bifat, pentru cine face pozele. CSV-ul e bun de filtrat si de
    sortat, dar nu se citeste pe rand cand ai 344 de ecrane de fotografiat: aici
    numele fisierului sta langa ce trebuie sa arate poza, grupat exact cum e
    grupat si centrul de ajutor.
  */
  const md = ["# Lista capturilor de făcut", ""];
  md.push(`${n} rămase. Se rescrie cu \`npm run capturi -- --lista\`, iar ce s-a legat deja iese din listă.`);
  md.push("");
  md.push("Numele fișierului e slug-ul ghidului. Pune-l în folderul categoriei lui,");
  md.push("sub `public/capturi/ajutor/<categorie>/`. Toate sunt 16:10, 1440 × 900, `.webp`.");
  md.push("");

  for (const cat of new Set(TOATE_GHIDURILE.map((g) => g.categorie.slug))) {
    const ale = TOATE_GHIDURILE.filter((g) => g.categorie.slug === cat);
    const cate = ale.reduce(
      (s, g) => s + g.pasi.filter((p) => capturaPasului(p) && !capturaPasului(p).src).length,
      0,
    );
    if (!cate) continue;
    md.push(`## ${ale[0].categorie.titlu} — ${cate} de făcut`);
    md.push("");
    md.push(`Folder: \`public/capturi/ajutor/${cat}/\``);
    md.push("");
    for (const grup of new Set(ale.map((g) => g.grup))) {
      const dinGrup = ale.filter((g) => g.grup === grup);
      const randuri = [];
      for (const g of dinGrup) {
        g.pasi.forEach((pas, i) => {
          const c = capturaPasului(pas);
          if (!c || c.src) return;
          randuri.push(
            `- [ ] **\`${g.slug}.webp\`**  \n` +
              `      ${g.titlu} — pasul ${i + 1} din ${g.pasi.length}  \n` +
              `      *${c.alt}*`,
          );
        });
      }
      if (!randuri.length) continue;
      md.push(`### ${grup}`);
      md.push("");
      md.push(...randuri);
      md.push("");
    }
  }
  writeFileSync(path.join(RADACINA, "CAPTURI-AJUTOR-LISTA.md"), md.join("\n") + "\n", "utf8");

  console.log(`lista de lucru rescrisa (${n} capturi inca fara fisier):`);
  console.log("   CAPTURI-AJUTOR.csv        — de filtrat si sortat");
  console.log("   CAPTURI-AJUTOR-LISTA.md   — de bifat pe rand, grupata ca centrul de ajutor");
  process.exit(0);
}

/*
  ═══ NUMELE FISIERULUI POATE FI SI TITLUL GHIDULUI ═══

  Cine face capturile lucreaza dupa lista si scrie numele asa cum il vede acolo:
  `Cum-deschizi-lista-de-comenzi-și-ce-vezi-în-ea.webp`, cu diacritice, cu
  majuscule, uneori cu un spatiu ramas. E numirea fireasca, si a cere 23 de
  redenumiri de mana ca sa incapa in tiparul unui script e pe dos.

  Deci se incearca, in ordine: slug-ul exact, apoi titlul normalizat (fara
  diacritice, fara majuscule, semnele devin liniute), apoi un inceput de titlu
  destul de lung cat sa nu fie ambiguu — fisierul poate sari partea din
  paranteza, ca `(SMTP propriu)`.

  ⚠ Daca un nume se potriveste la DOUA ghiduri, nu se alege niciunul. O
  redenumire gresita muta poza in alt ghid, si nimeni n-ar observa.

  Cand potrivirea vine din titlu, fisierul se REDENUMESTE pe disc la slug, ca in
  depozit sa ramana o singura conventie.
*/
function normalizeaza(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Indicele de dupa acolada care inchide obiectul deschis la `start`. */
function sfarsitulObiectului(txt, start) {
  let adanc = 0;
  for (let i = start; i < txt.length; i++) {
    const c = txt[i];
    if (c === '"' || c === "'" || c === "`") {
      const ghil = c;
      i++;
      while (i < txt.length) {
        if (txt[i] === "\\") { i += 2; continue; }
        if (txt[i] === ghil) break;
        i++;
      }
    } else if (c === "{") adanc++;
    else if (c === "}") {
      adanc--;
      if (adanc === 0) return i + 1;
    }
  }
  throw new Error(`acolada neinchisa de la ${start}`);
}

const fisiere = [];
if (existsSync(FOLDER)) {
  for (const cat of readdirSync(FOLDER, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const f of readdirSync(path.join(FOLDER, cat.name))) {
      const ext = path.extname(f).toLowerCase();
      if (!EXTENSII.includes(ext)) continue;
      fisiere.push({ categorie: cat.name, fisier: f, fisierPeDisc: f, slug: path.basename(f, ext), ext });
    }
  }
}

/* Se citeste inaintea buclei: redenumirea fisierelor se face IN bucla, deci
   `--proba` trebuie sa fie stiut de acolo, nu de la finalul scriptului. */
const scrieFisiere = !process.argv.includes("--proba");

const legate = [];
const respinse = [];
const orfane = [];
const modificari = new Map(); // fisier .ts -> text

/** slug normalizat si titlu normalizat -> slug adevarat */
const dupaTitlu = new Map();
for (const g of TOATE_GHIDURILE) dupaTitlu.set(normalizeaza(g.titlu), g.slug);

const redenumite = [];

for (const f of fisiere.sort((a, b) => a.slug.localeCompare(b.slug))) {
  if (!dupaSlug.has(f.slug)) {
    const n = normalizeaza(f.slug);
    let gasit = dupaSlug.has(n) ? n : dupaTitlu.get(n);
    if (!gasit) {
      // inceput de titlu: fisierul poate sari coada, ca `(SMTP propriu)`
      const candidati = [...dupaTitlu].filter(([t]) => n.length >= 12 && t.startsWith(n));
      if (candidati.length === 1) gasit = candidati[0][1];
      else if (candidati.length > 1) {
        orfane.push({ ...f, motiv: `numele se potriveste la ${candidati.length} ghiduri, deci nu aleg niciunul` });
        continue;
      }
    }
    if (gasit) {
      const nou = `${gasit}${f.ext}`;
      const de_la = path.join(FOLDER, f.categorie, f.fisier);
      const la = path.join(FOLDER, f.categorie, nou);
      if (scrieFisiere && de_la !== la) renameSync(de_la, la);
      redenumite.push({ vechi: f.fisier, nou, categorie: f.categorie });
      /*
        ⚠ Doua nume, nu unul. `fisier` e cum SE VA numi, `fisierPeDisc` e de unde
        se citeste ACUM. La `--proba` nu se redenumeste nimic, deci masurarea
        trebuie sa deschida tot numele vechi. Fara despartirea asta, proba raporta
        cincisprezece fisiere „lipsa” care erau toate acolo, doar sub alt nume,
        si arata exact ca cincisprezece poze pierdute.
      */
      f.fisierPeDisc = scrieFisiere ? nou : f.fisier;
      f.fisier = nou;
      f.slug = gasit;
    }
  }

  const ghid = dupaSlug.get(f.slug);
  if (!ghid) {
    orfane.push({ ...f, motiv: "numele nu se potriveste cu niciun ghid, nici ca slug, nici ca titlu" });
    continue;
  }
  if (ghid.categorie !== f.categorie) {
    orfane.push({ ...f, motiv: `ghidul e in categoria "${ghid.categorie}", nu in "${f.categorie}"` });
    continue;
  }
  if (ghid.capturi.length === 0) {
    orfane.push({ ...f, motiv: "ghidul nu cere nicio captura" });
    continue;
  }
  if (ghid.capturi.length > 1) {
    orfane.push({ ...f, motiv: `ghidul cere ${ghid.capturi.length} capturi, deci numele singur nu spune care e` });
    continue;
  }

  const cerut = ghid.capturi[0].raport;
  const cale = path.join(FOLDER, f.categorie, f.fisierPeDisc);
  let meta;
  try {
    meta = await sharp(cale).metadata();
  } catch (e) {
    respinse.push({ ...f, motiv: `nu se poate citi ca imagine: ${e.message}` });
    continue;
  }
  const raportReal = meta.width / meta.height;
  if (Math.abs(raportReal - cerut) / cerut > TOLERANTA) {
    respinse.push({
      ...f,
      motiv: `raport ${raportReal.toFixed(3)} (${meta.width}x${meta.height}), se cere ${cerut.toFixed(3)} — s-ar taia din margini`,
    });
    continue;
  }

  const caleTs = path.join(CATEGORII_DIR, `${f.categorie}.ts`);
  let txt = modificari.get(caleTs) ?? readFileSync(caleTs, "utf8");

  const ancora = `slug: "${f.slug}",`;
  const p = txt.indexOf(ancora);
  if (p < 0) {
    orfane.push({ ...f, motiv: `nu gasesc slug-ul in ${f.categorie}.ts` });
    continue;
  }
  const inceputGhid = txt.lastIndexOf("{", p);
  const sfarsitGhid = sfarsitulObiectului(txt, inceputGhid);
  const bucata = txt.slice(inceputGhid, sfarsitGhid);

  const pozaCaptura = bucata.indexOf("captura: {");
  if (pozaCaptura < 0) {
    orfane.push({ ...f, motiv: "ghidul nu are `captura:` in fisier" });
    continue;
  }
  const capInc = inceputGhid + pozaCaptura + "captura: ".length;
  const capSf = sfarsitulObiectului(txt, capInc);
  const obiect = txt.slice(capInc, capSf);

  const url = `/capturi/ajutor/${f.categorie}/${f.fisier}`;
  let nou;
  if (/\bsrc:\s*"/.test(obiect)) {
    nou = obiect.replace(/\bsrc:\s*"[^"]*"/, `src: "${url}"`);
    if (nou === obiect) { continue; }
  } else {
    // Ordinea din interfata e alt, src, raport. `src` intra inaintea lui `raport`.
    nou = obiect.replace(/\braport:/, `src: "${url}", raport:`);
    if (nou === obiect) {
      orfane.push({ ...f, motiv: "nu gasesc `raport:` in obiectul capturii" });
      continue;
    }
  }

  txt = txt.slice(0, capInc) + nou + txt.slice(capSf);
  modificari.set(caleTs, txt);

  /*
    Greutatea se ia de la SISTEMUL DE FISIERE, nu din `meta.size`.

    `sharp(...).metadata()` pe o CALE nu completeaza `size` — vine `undefined`.
    Iar `undefined > OCTETI_MULTI` e `false`, deci verificarea trecea de fiecare
    data si arata exact ca o verificare care merge. Prins abia cand prima poza
    adevarata a scos `NaN kB` la masurare.
  */
  const octeti = statSync(cale).size;
  const semne = [];
  if (meta.width < LATIME_MINIMA) semne.push(`sub ${LATIME_MINIMA}px, se va vedea moale`);
  if (octeti > OCTETI_MULTI) semne.push(`${Math.round(octeti / 1024)}kB, mai greu decat trebuie`);
  legate.push({ ...f, url, dimensiune: `${meta.width}x${meta.height}`, octeti, semne });
}

const scrie = scrieFisiere;
if (scrie) {
  for (const [cale, txt] of modificari) writeFileSync(cale, txt, "utf8");
}

const totalCerute = [...dupaSlug.values()].reduce((n, g) => n + g.capturi.length, 0);
const legateAcum = [...dupaSlug.values()].reduce(
  (n, g) => n + g.capturi.filter((c) => c.src).length,
  0,
);

console.log(`fisiere gasite in public/capturi/ajutor: ${fisiere.length}`);
console.log(`legate acum:                             ${legate.length}${scrie ? "" : "  (proba, nu s-a scris nimic)"}`);
console.log(`capturi cerute de ghiduri:               ${totalCerute}`);
console.log(`inca fara fisier:                        ${totalCerute - legateAcum - legate.length}`);

if (legate.length) {
  if (redenumite.length) {
    console.log("\nredenumite dupa titlu, ca in depozit sa ramana o singura conventie:");
    for (const r of redenumite) console.log(`   ${r.categorie}/${r.vechi}\n      -> ${r.nou}`);
  }
  console.log("\nlegate:");
  for (const l of legate) {
    const coada = l.semne.length ? `   <-- ${l.semne.join("; ")}` : "";
    console.log(`   ${l.dimensiune.padStart(11)}  ${l.url}${coada}`);
  }
  const slabe = legate.filter((l) => l.semne.length).length;
  if (slabe) console.log(`\n   ${slabe} legate, dar cu observatii mai sus. Merg, doar ca nu arata cum trebuie.`);
}
if (respinse.length) {
  console.log("\nRESPINSE (nu s-au legat, ca sa nu se taie tacut din ele):");
  for (const r of respinse) console.log(`   ${r.categorie}/${r.fisier}: ${r.motiv}`);
}
if (orfane.length) {
  console.log("\nFISIERE FARA GHID:");
  for (const o of orfane) console.log(`   ${o.categorie}/${o.fisier}: ${o.motiv}`);
}
if (respinse.length || orfane.length) process.exitCode = 1;
