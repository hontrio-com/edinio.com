import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Neptun (moda, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 2). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/neptun.json`), in `public/teme/neptun/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/neptun/${cale}.webp`;

export const MENIU_DEMO_NEPTUN: MenuItem[] = ["Geci", "Genți", "Încălțăminte", "Pulovere", "Rochii", "Accesorii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_NEPTUN: SetDateDemo = {
  categorii: [
    { nume: "Geci", imagine: poza("categorii/geci"), copii: [] },
    { nume: "Genți", imagine: poza("categorii/genti"), copii: [] },
    { nume: "Încălțăminte", imagine: poza("categorii/incaltaminte"), copii: [] },
    { nume: "Sneakers", imagine: poza("categorii/sneakers"), copii: [] },
    { nume: "Pulovere", imagine: poza("categorii/pulovere"), copii: [] },
    { nume: "Rochii", imagine: poza("categorii/rochii"), copii: [] },
    { nume: "Blugi și pantaloni", imagine: poza("categorii/blugi"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "palton-camel", nume: "Palton lung din lână, camel", categorie: "Geci", pret: 899, pretVechi: 1199, imagine: poza("produse/palton-camel"), recomandat: true, descriere: "Croială dreaptă, lână cu cașmir, căptușit." },
    { cheie: "parka-olive", nume: "Parka cu glugă și blană, olive", categorie: "Geci", pret: 749, imagine: poza("produse/parka-olive"), recomandat: true, descriere: "Impermeabilă, căptușită, cu glugă detașabilă." },
    { cheie: "geanta-crossbody", nume: "Geantă crossbody cu lanț, neagră", categorie: "Genți", pret: 329, pretVechi: 399, imagine: poza("produse/geanta-crossbody"), descriere: "Piele ecologică, lanț auriu și compartiment interior." },
    { cheie: "botine-suede", nume: "Botine din piele întoarsă, maro", categorie: "Încălțăminte", pret: 459, imagine: poza("produse/botine-suede"), recomandat: true, descriere: "Toc de 5 cm, talpă flexibilă, fermoar lateral." },
    { cheie: "sneakers-alergare", nume: "Sneakers de alergare, gri", categorie: "Sneakers", pret: 389, pretVechi: 449, imagine: poza("produse/sneakers-alergare"), descriere: "Talpă cu amortizare, plasă respirabilă." },
    { cheie: "helanca-crem", nume: "Helancă din tricot fin, crem", categorie: "Pulovere", pret: 219, imagine: poza("produse/helanca-crem"), recomandat: true, descriere: "Tricot moale, guler înalt, croială dreaptă." },
    { cheie: "rochie-satin-rosie", nume: "Rochie din satin, roșie", categorie: "Rochii", pret: 349, imagine: poza("produse/rochie-satin-rosie"), descriere: "Bretele subțiri, croi pe bie, lungime midi." },
    { cheie: "pantaloni-largi", nume: "Pantaloni largi, negri", categorie: "Blugi și pantaloni", pret: 259, pretVechi: 299, imagine: poza("produse/pantaloni-largi"), descriere: "Talie înaltă, cută în față, material fluid." },
    { cheie: "esarfa-lana", nume: "Eșarfă din lână, gri", categorie: "Accesorii", pret: 129, imagine: poza("produse/esarfa-lana"), descriere: "Lână moale, franjuri scurți, 180 cm." },
    { cheie: "sacou-bleumarin", nume: "Sacou la două rânduri, bleumarin", categorie: "Geci", pret: 589, imagine: poza("produse/sacou-bleumarin"), recomandat: true, descriere: "Croială structurată, nasturi aurii, căptușit." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Geci" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți", produse: ["palton-camel", "botine-suede", "helanca-crem", "sacou-bleumarin", "parka-olive"] },
    { cheie: "reduceri", titlu: "La reducere", produse: ["geanta-crossbody", "sneakers-alergare", "pantaloni-largi", "palton-camel", "rochie-satin-rosie"] },
  ],
};
