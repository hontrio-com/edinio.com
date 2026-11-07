import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Spica (energie solara, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 5). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/spica.json`), in `public/teme/spica/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/spica/${cale}.webp`;

export const MENIU_DEMO_SPICA: MenuItem[] = ["Panouri fotovoltaice", "Invertoare", "Baterii", "Kituri complete", "Încărcătoare EV", "Accesorii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_SPICA: SetDateDemo = {
  categorii: [
    { nume: "Panouri fotovoltaice", imagine: poza("categorii/panouri"), copii: [] },
    { nume: "Invertoare", imagine: poza("categorii/invertoare"), copii: [] },
    { nume: "Baterii", imagine: poza("categorii/baterii"), copii: [] },
    { nume: "Kituri complete", imagine: poza("categorii/kituri"), copii: [] },
    { nume: "Încărcătoare EV", imagine: poza("categorii/incarcatoare-ev"), copii: [] },
    { nume: "Structuri de montaj", imagine: poza("categorii/structuri"), copii: [] },
    { nume: "Cabluri și conectori", imagine: poza("categorii/cabluri"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "conectori-mc4", nume: "Set conectori MC4, 10 perechi", categorie: "Cabluri și conectori", pret: 69, imagine: poza("produse/conectori-mc4"), descriere: "IP68, pentru cabluri de 4-6 mm², rezistență UV." },
    { cheie: "panou-450w", nume: "Panou fotovoltaic monocristalin 450 W", categorie: "Panouri fotovoltaice", pret: 549, pretVechi: 619, imagine: poza("produse/panou-450w"), recomandat: true, descriere: "Celule N-type, ramă neagră, garanție de producție 25 de ani." },
    { cheie: "invertor-hibrid-6kw", nume: "Invertor hibrid monofazat 6 kW", categorie: "Invertoare", pret: 3990, pretVechi: 5190, imagine: poza("produse/invertor-hibrid-6kw"), recomandat: true, descriere: "Două MPPT, funcționare off-grid și on-grid, monitorizare prin aplicație." },
    { cheie: "baterie-litiu-5kwh", nume: "Baterie LiFePO4 5 kWh, montaj pe perete", categorie: "Baterii", pret: 6190, imagine: poza("produse/baterie-litiu-5kwh"), recomandat: true, descriere: "Peste 6000 de cicluri, BMS integrat, extensibilă până la 30 kWh." },
    { cheie: "kit-5kw", nume: "Kit fotovoltaic complet 5 kW", categorie: "Kituri complete", pret: 15990, pretVechi: 17490, imagine: poza("produse/kit-5kw"), recomandat: true, descriere: "12 panouri, invertor hibrid, structură, cabluri și protecții." },
    { cheie: "wallbox-11kw", nume: "Încărcător EV wallbox 11 kW", categorie: "Încărcătoare EV", pret: 2490, imagine: poza("produse/wallbox-11kw"), descriere: "Cablu tip 2 de 5 m, programare din aplicație." },
    { cheie: "structura-tigla", nume: "Structură de montaj pentru acoperiș de țiglă", categorie: "Structuri de montaj", pret: 389, imagine: poza("produse/structura-tigla"), descriere: "Aluminiu și inox, pentru 4 panouri." },
    { cheie: "cablu-solar", nume: "Cablu solar 6 mm², rolă de 100 m", categorie: "Cabluri și conectori", pret: 649, pretVechi: 729, imagine: poza("produse/cablu-solar"), descriere: "Dublă izolație, roșu sau negru, rezistent la UV." },
    { cheie: "contor-inteligent", nume: "Contor inteligent trifazat", categorie: "Accesorii", pret: 459, imagine: poza("produse/contor-inteligent"), descriere: "Limitare a injecției în rețea, comunicare RS485." },
    { cheie: "panou-bifacial", nume: "Panou bifacial dublă sticlă 485 W", categorie: "Panouri fotovoltaice", pret: 629, imagine: poza("produse/panou-bifacial"), recomandat: true, descriere: "Produce și pe spate până la 25% în plus." },
  ],
  bannere: [{ imagine: poza("poze/mozaic"), categorie: "Kituri complete" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "oferte", titlu: "Oferte la invertoare și baterii", produse: ["invertor-hibrid-6kw", "baterie-litiu-5kwh", "kit-5kw", "panou-450w", "panou-bifacial"] },
    { cheie: "instalare", titlu: "Tot pentru instalare", produse: ["structura-tigla", "cablu-solar", "conectori-mc4", "contor-inteligent", "wallbox-11kw"] },
  ],
};

export const MOZAIC_DEMO_SPICA = [
  { titlu: "Energie de la soare, factură mai mică", text: "Kituri complete montate în toată țara.", imagine: poza("poze/mozaic"), categorie: "Kituri complete", fond: "inchis" },
  { titlu: "Invertor hibrid 6 kW", text: "3.990 lei, cu 1.200 lei mai puțin.", imagine: poza("produse/invertor-hibrid-6kw"), categorie: "Invertoare", fond: "inchis" },
  { titlu: "Baterii LiFePO4", text: "Stochează energia pentru seară.", imagine: poza("produse/baterie-litiu-5kwh"), categorie: "Baterii", fond: "principala" },
  { titlu: "Panouri bifaciale", text: "Până la 25% mai multă energie.", imagine: poza("produse/panou-bifacial"), categorie: "Panouri fotovoltaice", fond: "deschis" },
] as const;
