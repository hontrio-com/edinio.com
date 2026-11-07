import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Sirius (moda pentru femei, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 2). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/sirius.json`), in `public/teme/sirius/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/sirius/${cale}.webp`;

export const MENIU_DEMO_SIRIUS: MenuItem[] = ["Rochii", "Pantofi", "Genți", "Bijuterii", "Parfumuri", "Ceasuri"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_SIRIUS: SetDateDemo = {
  categorii: [
    { nume: "Rochii", imagine: poza("categorii/rochii"), copii: [] },
    { nume: "Pantofi", imagine: poza("categorii/pantofi"), copii: [] },
    { nume: "Genți", imagine: poza("categorii/genti"), copii: [] },
    { nume: "Bijuterii", imagine: poza("categorii/bijuterii"), copii: [] },
    { nume: "Parfumuri", imagine: poza("categorii/parfumuri"), copii: [] },
    { nume: "Ochelari de soare", imagine: poza("categorii/ochelari"), copii: [] },
    { nume: "Ceasuri", imagine: poza("categorii/ceasuri"), copii: [] },
    { nume: "Pălării", imagine: poza("categorii/palarii"), copii: [] },
  ],
  produse: [
    { cheie: "sacou-alb", nume: "Sacou alb croit", categorie: "Rochii", pret: 489, imagine: poza("produse/sacou-alb"), descriere: "Croială acinturată, umeri structurați, căptușit." },
    { cheie: "rochie-paiete", nume: "Rochie de seară cu paiete, neagră", categorie: "Rochii", pret: 549, pretVechi: 749, imagine: poza("produse/rochie-paiete"), recomandat: true, descriere: "Croială dreaptă, paiete cusute manual, lungime midi." },
    { cheie: "sandale-negre", nume: "Sandale cu toc și barete, negre", categorie: "Pantofi", pret: 329, imagine: poza("produse/sandale-negre"), recomandat: true, descriere: "Toc de 9 cm, barete fine, talpă din piele." },
    { cheie: "geanta-matlasata", nume: "Geantă matlasată cu lanț auriu", categorie: "Genți", pret: 459, pretVechi: 529, imagine: poza("produse/geanta-matlasata"), recomandat: true, descriere: "Piele ecologică matlasată, lanț lung, închidere magnetică." },
    { cheie: "cercei-perle", nume: "Cercei cu perle", categorie: "Bijuterii", pret: 149, imagine: poza("produse/cercei-perle"), descriere: "Perle de cultură, tijă din argint placat cu aur." },
    { cheie: "parfum-ambra", nume: "Apă de parfum cu note de ambră, 100 ml", categorie: "Parfumuri", pret: 389, pretVechi: 449, imagine: poza("produse/parfum-ambra"), recomandat: true, descriere: "Note de ambră, vanilie și lemn de santal. Persistență mare." },
    { cheie: "ochelari-supradimensionati", nume: "Ochelari de soare supradimensionați, maro", categorie: "Ochelari de soare", pret: 219, imagine: poza("produse/ochelari-supradimensionati"), descriere: "Protecție UV400, ramă din acetat." },
    { cheie: "ceas-argintiu", nume: "Ceas minimalist cu brățară mesh, argintiu", categorie: "Ceasuri", pret: 399, imagine: poza("produse/ceas-argintiu"), descriere: "Cadran de 32 mm, mecanism quartz, rezistent la stropi." },
    { cheie: "bereta-crem", nume: "Beretă tricotată, crem", categorie: "Pălării", pret: 89, imagine: poza("produse/bereta-crem"), descriere: "Tricot moale din lână, mărime universală." },
    { cheie: "trench-camel", nume: "Trench clasic, camel", categorie: "Rochii", pret: 699, pretVechi: 849, imagine: poza("produse/trench-camel"), recomandat: true, descriere: "Bumbac rezistent la apă, cordon în talie, nasturi la două rânduri." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Rochii" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți de sezon", produse: ["rochie-paiete", "geanta-matlasata", "parfum-ambra", "trench-camel", "sandale-negre"] },
    { cheie: "reduceri", titlu: "Reduceri de până la 30%", produse: ["cercei-perle", "ochelari-supradimensionati", "ceas-argintiu", "bereta-crem", "sacou-alb"] },
  ],
};
