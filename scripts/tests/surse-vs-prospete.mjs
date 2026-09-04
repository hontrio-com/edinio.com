/*
  ═══════════════════════════════════════════════════════════════════════════════
  CÂT DE VECHI SUNT AFIRMAȚIILE DESPRE CONCURENȚI
  ═══════════════════════════════════════════════════════════════════════════════

      npm run verifica:surse-vs

  ⚠ DE CE E UN SCRIPT SEPARAT ȘI NU O PROBĂ ÎN SUITĂ.

  O probă care cade după 183 de zile e o bombă cu ceas: devine roșie într-o zi în
  care nimeni n-a atins codul, iar în depozitul ăsta suita rulează înaintea
  FIECĂRUI push. Ar fi blocat un push urgent — o reparație de plată, un magazin
  căzut — pentru un tabel de marketing care mai putea aștepta o zi. Un instrument
  care oprește lucrul urgent ca să semnaleze ceva neurgent va fi ocolit, apoi
  scos.

  Aici cade doar când e chemat: în revizuiri, înainte de o campanie, sau când
  cineva se întreabă „mai e adevărat?". Iese cu 1 dacă ceva e prea vechi, deci
  poate fi pus într-un cron sau într-o verificare periodică fără să atingă suita.

  ⚠ CE NU FACE: nu deschide site-urile lor și nu compară nimic. Nu poate — două
  din cele șase (`opencart.com`, măsurat 403 la orice cerere automată) nici nu
  răspund unui script, iar „se potrivește rândul cu pagina" e o judecată de om,
  nu una de program. Spune doar CÂT E DE VECHE ultima privire omenească.
*/

import { TABELE_VS } from "../../src/lib/website/comparatii-vs.ts";

/** Peste atâtea zile, afirmațiile despre o platformă se reverifică. */
const ZILE_PRAG = 183;

/*
  ⚠ 183, adică jumătate de an, și e o alegere cu preț. Prețul unei valori mai
  mari: un tabel învechit rămâne pe pagină, iar publicitatea comparativă
  învechită e chiar riscul. Prețul uneia mai mici: șase platforme × trei pagini,
  reverificate prea des, devin o corvoadă pe care o va face cineva „pe fugă" —
  adică o dată nouă pusă fără să se fi uitat, exact minciuna pe care câmpul
  există s-o închidă.
*/

const azi = new Date();
const zileDe = (iso) => Math.floor((azi - new Date(`${iso}T12:00:00Z`)) / 86_400_000);

let vechi = 0;
console.log(`Afirmațiile despre concurenți, la ${azi.toISOString().slice(0, 10)}:\n`);

for (const [cheie, t] of Object.entries(TABELE_VS)) {
  const zile = zileDe(t.verificatLa);
  const prea = zile > ZILE_PRAG;
  if (prea) vechi++;
  console.log(
    `  ${prea ? "!" : " "} ${cheie.padEnd(14)} ${t.verificatLa}  ${String(zile).padStart(4)} zile` +
      `  ${t.randuri.length} rânduri  ${t.siteOficial}`,
  );
}

console.log("");
if (vechi === 0) {
  console.log(`Toate sub ${ZILE_PRAG} de zile. Nimic de făcut.`);
  process.exit(0);
}

console.log(
  `${vechi} din ${Object.keys(TABELE_VS).length} au trecut de ${ZILE_PRAG} de zile.\n\n` +
    "Ce se face, în ordinea asta:\n" +
    "  1. deschide `siteOficial` al platformei și verifică rândurile ei;\n" +
    "  2. dacă ceva s-a schimbat, ADUCI schimbarea proprietarului — rândurile vin\n" +
    "     din PDF-ul lui, deci nu se rescriu fără el;\n" +
    "  3. abia apoi muți `verificatLa` la ziua în care CHIAR te-ai uitat.\n\n" +
    "⚠ Nu muta data fără pasul 1. O dată nouă pe un tabel neverificat e mai rea\n" +
    "decât una veche: cea veche spune adevărul despre cât de veche e.",
);
process.exit(1);
