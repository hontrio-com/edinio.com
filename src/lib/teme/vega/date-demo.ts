import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Vega (imbracaminte sport, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 3). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/vega.json`), in `public/teme/vega/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/vega/${cale}.webp`;

export const MENIU_DEMO_VEGA: MenuItem[] = ["Colanți", "Tricouri", "Alergare", "Încălțăminte", "Hanorace", "Accesorii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_VEGA: SetDateDemo = {
  categorii: [
    { nume: "Colanți", imagine: poza("categorii/colanti"), copii: [] },
    { nume: "Tricouri", imagine: poza("categorii/tricouri"), copii: [] },
    { nume: "Alergare", imagine: poza("categorii/alergare"), copii: [] },
    { nume: "Încălțăminte", imagine: poza("categorii/incaltaminte"), copii: [] },
    { nume: "Hanorace", imagine: poza("categorii/hanorace"), copii: [] },
    { nume: "Yoga", imagine: poza("categorii/yoga"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
    { nume: "Șorturi", imagine: poza("categorii/sorturi"), copii: [] },
  ],
  produse: [
    { cheie: "colanti-seamless", nume: "Colanți seamless cu talie înaltă, negri", categorie: "Colanți", pret: 199, pretVechi: 249, imagine: poza("produse/colanti-seamless"), recomandat: true, descriere: "Tricot fără cusături, talie înaltă care nu alunecă, opaci la genuflexiuni." },
    { cheie: "bustiera-sport", nume: "Bustieră sport cu susținere medie, neagră", categorie: "Yoga", pret: 129, imagine: poza("produse/bustiera-sport"), recomandat: true, descriere: "Bretele încrucișate, burete detașabil, uscare rapidă." },
    { cheie: "tricou-oversized", nume: "Tricou oversized din bumbac, gri", categorie: "Tricouri", pret: 119, imagine: poza("produse/tricou-oversized"), descriere: "Bumbac gros, croi lejer, umeri căzuți." },
    { cheie: "sort-antrenament", nume: "Șort de antrenament 2 în 1, negru", categorie: "Șorturi", pret: 139, pretVechi: 169, imagine: poza("produse/sort-antrenament"), descriere: "Strat interior elastic, buzunar cu fermoar pentru telefon." },
    { cheie: "hanorac-fermoar", nume: "Hanorac cu fermoar, cărbune", categorie: "Hanorace", pret: 249, imagine: poza("produse/hanorac-fermoar"), recomandat: true, descriere: "Interior pufos, glugă cu șnur, buzunare laterale." },
    { cheie: "jacheta-alergare", nume: "Jachetă ușoară de alergare, albă", categorie: "Alergare", pret: 289, pretVechi: 329, imagine: poza("produse/jacheta-alergare"), recomandat: true, descriere: "Rezistentă la vânt, se strânge în propriul buzunar, detalii reflectorizante." },
    { cheie: "pantofi-antrenament", nume: "Pantofi de antrenament, alb-negru", categorie: "Încălțăminte", pret: 449, imagine: poza("produse/pantofi-antrenament"), recomandat: true, descriere: "Talpă stabilă pentru ridicări, plasă respirabilă." },
    { cheie: "geanta-sala", nume: "Geantă de sală, 35 l, neagră", categorie: "Accesorii", pret: 219, imagine: poza("produse/geanta-sala"), descriere: "Compartiment separat pentru încălțăminte și buzunar ventilat." },
    { cheie: "sticla-apa", nume: "Sticlă termos din oțel, 750 ml, neagră", categorie: "Accesorii", pret: 89, imagine: poza("produse/sticla-apa"), descriere: "Ține apa rece 24 de ore, capac cu mâner." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Colanți" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți", produse: ["colanti-seamless", "hanorac-fermoar", "jacheta-alergare", "pantofi-antrenament", "bustiera-sport"] },
    { cheie: "esentiale", titlu: "Esențiale pentru sală", produse: ["tricou-oversized", "sort-antrenament", "geanta-sala", "sticla-apa", "colanti-seamless"] },
  ],
};
