import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Altair (piese agricole si de gradina, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 3). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/altair.json`), in `public/teme/altair/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/altair/${cale}.webp`;

export const MENIU_DEMO_ALTAIR: MenuItem[] = ["Transmisie", "Hidraulică", "Iluminat", "Anvelope", "Silvicultură", "Atelier"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ALTAIR: SetDateDemo = {
  categorii: [
    { nume: "Transmisie", imagine: poza("categorii/transmisie"), copii: [] },
    { nume: "Hidraulică", imagine: poza("categorii/hidraulica"), copii: [] },
    { nume: "Scaune și cabină", imagine: poza("categorii/scaune"), copii: [] },
    { nume: "Iluminat", imagine: poza("categorii/iluminat"), copii: [] },
    { nume: "Anvelope", imagine: poza("categorii/anvelope"), copii: [] },
    { nume: "Silvicultură", imagine: poza("categorii/silvicultura"), copii: [] },
    { nume: "Rulmenți", imagine: poza("categorii/rulmenti"), copii: [] },
    { nume: "Atelier", imagine: poza("categorii/atelier"), copii: [] },
  ],
  produse: [
    { cheie: "filtru-ulei-tractor", nume: "Filtru de ulei pentru tractor", categorie: "Transmisie", pret: 89, pretVechi: 109, imagine: poza("produse/filtru-ulei-tractor"), recomandat: true, descriere: "Filtrare fină pentru motoarele tractoarelor de 60-120 CP." },
    { cheie: "lampa-led-rotunda", nume: "Lampă de lucru LED rotundă, 27 W", categorie: "Iluminat", pret: 119, imagine: poza("produse/lampa-led-rotunda"), recomandat: true, descriere: "Carcasă din aluminiu, rezistentă la apă și vibrații, 12/24 V." },
    { cheie: "cuple-rapide", nume: "Set cuple rapide hidraulice, 1/2\"", categorie: "Hidraulică", pret: 149, imagine: poza("produse/cuple-rapide"), descriere: "Cuplare sub presiune, etanșare din NBR." },
    { cheie: "fir-trimmer", nume: "Fir pentru motocoasă, 3 mm, 50 m", categorie: "Silvicultură", pret: 59, imagine: poza("produse/fir-trimmer"), descriere: "Secțiune pătrată, taie curat iarba înaltă." },
    { cheie: "cutit-masina-tuns", nume: "Cuțit pentru mașina de tuns iarba, 46 cm", categorie: "Silvicultură", pret: 79, pretVechi: 99, imagine: poza("produse/cutit-masina-tuns"), descriere: "Oțel călit, echilibrat din fabrică." },
    { cheie: "tirant-central", nume: "Tirant central reglabil pentru tractor", categorie: "Transmisie", pret: 329, imagine: poza("produse/tirant-central"), recomandat: true, descriere: "Categoria 2, cu cârlige și blocare." },
    { cheie: "furtune-hidraulice", nume: "Set furtune hidraulice, 1 m", categorie: "Hidraulică", pret: 189, imagine: poza("produse/furtune-hidraulice"), descriere: "Presiune de lucru 250 bar, mufe sertizate." },
    { cheie: "manusi-lucru", nume: "Mănuși de lucru rezistente", categorie: "Atelier", pret: 39, imagine: poza("produse/manusi-lucru"), descriere: "Palmă din piele, dos respirabil, manșetă elastică." },
    { cheie: "canistra", nume: "Canistră metalică pentru combustibil, 20 l", categorie: "Atelier", pret: 149, pretVechi: 179, imagine: poza("produse/canistra"), descriere: "Tablă groasă, gură de turnare cu siguranță." },
    { cheie: "bolt-cupla", nume: "Bolț de cuplare pentru tracțiune", categorie: "Transmisie", pret: 69, imagine: poza("produse/bolt-cupla"), descriere: "Oțel forjat, cu siguranță și lanț." },
  ],
  bannere: [{ imagine: poza("bannere/piese"), categorie: "Transmisie" }, { imagine: poza("bannere/sezon"), categorie: "Anvelope" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "vandute", titlu: "Cele mai vândute", produse: ["filtru-ulei-tractor", "lampa-led-rotunda", "tirant-central", "cuple-rapide", "canistra"] },
    { cheie: "sezon", titlu: "Pregătit pentru sezon", produse: ["fir-trimmer", "cutit-masina-tuns", "furtune-hidraulice", "manusi-lucru", "bolt-cupla"] },
  ],
};
