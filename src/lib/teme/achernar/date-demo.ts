import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Achernar (bricolaj si amenajari, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 6). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/achernar.json`), in `public/teme/achernar/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/achernar/${cale}.webp`;

export const MENIU_DEMO_ACHERNAR: MenuItem[] = ["Unelte", "Construcții", "Baie", "Grădină", "Iluminat", "Încălzire"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ACHERNAR: SetDateDemo = {
  categorii: [
    { nume: "Unelte", imagine: poza("categorii/unelte"), copii: [] },
    { nume: "Construcții", imagine: poza("categorii/constructii"), copii: [] },
    { nume: "Baie", imagine: poza("categorii/baie"), copii: [] },
    { nume: "Bucătărie", imagine: poza("categorii/bucatarie"), copii: [] },
    { nume: "Grădină", imagine: poza("categorii/gradina"), copii: [] },
    { nume: "Iluminat", imagine: poza("categorii/iluminat"), copii: [] },
    { nume: "Încălzire", imagine: poza("categorii/incalzire"), copii: [] },
    { nume: "Decorațiuni", imagine: poza("categorii/decoratiuni"), copii: [] },
  ],
  produse: [
    { cheie: "masina-gaurit", nume: "Mașină de găurit și înșurubat, 18 V", categorie: "Unelte", pret: 399, pretVechi: 499, imagine: poza("produse/masina-gaurit"), recomandat: true, descriere: "Două acumulatori, încărcător rapid și 13 accesorii în valiză." },
    { cheie: "polizor-unghiular", nume: "Polizor unghiular 125 mm, 900 W", categorie: "Unelte", pret: 219, imagine: poza("produse/polizor-unghiular"), descriere: "Mâner lateral, protecție reglabilă, pornire lină." },
    { cheie: "vopsea-lavabila", nume: "Vopsea lavabilă albă, 15 l", categorie: "Construcții", pret: 189, pretVechi: 229, imagine: poza("produse/vopsea-lavabila"), recomandat: true, descriere: "Acoperire foarte bună, lavabilă, pentru interior." },
    { cheie: "baterie-cada", nume: "Baterie pentru cadă cu duș, crom", categorie: "Baie", pret: 279, imagine: poza("produse/baterie-cada"), descriere: "Cartuș ceramic, pară de duș cu trei jeturi." },
    { cheie: "chiuveta-inox", nume: "Chiuvetă din inox cu o cuvă și picurător", categorie: "Bucătărie", pret: 349, pretVechi: 399, imagine: poza("produse/chiuveta-inox"), descriere: "Inox periat, sifon inclus." },
    { cheie: "masina-tuns-gazon", nume: "Mașină de tuns gazonul electrică, 1600 W", categorie: "Grădină", pret: 599, imagine: poza("produse/masina-tuns-gazon"), recomandat: true, descriere: "Lățime de tăiere 38 cm, coș de 40 l." },
    { cheie: "corp-led", nume: "Corp de iluminat LED, 36 W, alb", categorie: "Iluminat", pret: 129, imagine: poza("produse/corp-led"), descriere: "Lumină neutră, montaj aparent, potrivit pentru bucătărie și hol." },
    { cheie: "calorifer-ulei", nume: "Calorifer electric cu ulei, 9 elemente", categorie: "Încălzire", pret: 299, pretVechi: 349, imagine: poza("produse/calorifer-ulei"), recomandat: true, descriere: "Trei trepte de putere, termostat reglabil." },
    { cheie: "oglinda-rotunda", nume: "Oglindă rotundă cu ramă neagră, 60 cm", categorie: "Decorațiuni", pret: 159, imagine: poza("produse/oglinda-rotunda"), descriere: "Ramă metalică subțire, prindere pe perete." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Unelte" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "oferte", titlu: "Top oferte", produse: ["masina-gaurit", "vopsea-lavabila", "masina-tuns-gazon", "calorifer-ulei", "polizor-unghiular"] },
    { cheie: "casa", titlu: "Pentru casa ta", produse: ["baterie-cada", "chiuveta-inox", "corp-led", "oglinda-rotunda", "masina-gaurit"] },
  ],
};
