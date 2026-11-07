import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Aldebaran (vinuri si bauturi premium, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 4). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/aldebaran.json`), in `public/teme/aldebaran/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/aldebaran/${cale}.webp`;

export const MENIU_DEMO_ALDEBARAN: MenuItem[] = ["Vin roșu", "Vin alb", "Spumant", "Whisky", "Gin", "Coniac"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ALDEBARAN: SetDateDemo = {
  categorii: [
    { nume: "Vin roșu", imagine: poza("categorii/vin-rosu"), copii: [] },
    { nume: "Vin alb", imagine: poza("categorii/vin-alb"), copii: [] },
    { nume: "Spumant", imagine: poza("categorii/spumant"), copii: [] },
    { nume: "Whisky", imagine: poza("categorii/whisky"), copii: [] },
    { nume: "Gin", imagine: poza("categorii/gin"), copii: [] },
    { nume: "Rom", imagine: poza("categorii/rom"), copii: [] },
    { nume: "Coniac", imagine: poza("categorii/coniac"), copii: [] },
    { nume: "Lichior", imagine: poza("categorii/lichior"), copii: [] },
  ],
  produse: [
    { cheie: "lichior-cafea", nume: "Lichior de cafea, 0,7 l", categorie: "Lichior", pret: 79, imagine: poza("produse/lichior-cafea"), descriere: "Cafea arabica și vanilie, servit cu gheață sau în cocktailuri." },
    { cheie: "whisky-single-malt", nume: "Whisky single malt 12 ani, 0,7 l", categorie: "Whisky", pret: 289, pretVechi: 329, imagine: poza("produse/whisky-single-malt"), recomandat: true, descriere: "Maturat în butoaie de stejar, note de miere, vanilie și fum ușor." },
    { cheie: "vin-rosu-reserva", nume: "Vin roșu sec Reserva, 0,75 l", categorie: "Vin roșu", pret: 89, imagine: poza("produse/vin-rosu-reserva"), recomandat: true, descriere: "Fructe negre coapte, taninuri catifelate, 12 luni în baric." },
    { cheie: "spumant-brut", nume: "Spumant brut, 0,75 l", categorie: "Spumant", pret: 129, pretVechi: 149, imagine: poza("produse/spumant-brut"), recomandat: true, descriere: "Fermentat în sticlă, perlaj fin, note de măr verde și brioșă." },
    { cheie: "gin-botanic", nume: "Gin cu botanice, 0,7 l", categorie: "Gin", pret: 149, imagine: poza("produse/gin-botanic"), recomandat: true, descriere: "Ienupăr, coajă de citrice și flori de soc." },
    { cheie: "rom-negru", nume: "Rom negru învechit, 0,7 l", categorie: "Rom", pret: 169, imagine: poza("produse/rom-negru"), descriere: "Note de caramel, banană coaptă și condimente." },
    { cheie: "coniac-xo", nume: "Coniac XO în cutie de cadou, 0,7 l", categorie: "Coniac", pret: 699, pretVechi: 799, imagine: poza("produse/coniac-xo"), recomandat: true, descriere: "Distilate învechite cel puțin 10 ani, final lung și cald." },
    { cheie: "vin-alb-sec", nume: "Vin alb sec, 0,75 l", categorie: "Vin alb", pret: 69, imagine: poza("produse/vin-alb-sec"), descriere: "Proaspăt și mineral, cu note de citrice și piersică albă." },
    { cheie: "bourbon", nume: "Bourbon, 0,7 l", categorie: "Whisky", pret: 159, pretVechi: 179, imagine: poza("produse/bourbon"), descriere: "Porumb dulce, vanilie și stejar ars." },
    { cheie: "vin-desert", nume: "Vin dulce de desert, 0,5 l", categorie: "Vin alb", pret: 99, imagine: poza("produse/vin-desert"), descriere: "Caise uscate și miere, servit răcit, la desert." },
  ],
  bannere: [{ imagine: poza("poze/mozaic"), categorie: "Whisky" }],
  carduri: [],
  placi: [{ titlu: "Vinuri roșii", imagine: poza("categorii/vin-rosu"), categorie: "Vin roșu" }, { titlu: "Whisky", imagine: poza("categorii/whisky"), categorie: "Whisky" }, { titlu: "Spumante", imagine: poza("categorii/spumant"), categorie: "Spumant" }, { titlu: "Coniac", imagine: poza("categorii/coniac"), categorie: "Coniac" }],
  randuri: [
    { cheie: "selectia", titlu: "Selecția săptămânii", produse: ["whisky-single-malt", "coniac-xo", "spumant-brut", "gin-botanic", "vin-rosu-reserva"] },
    { cheie: "vinuri", titlu: "Vinuri și lichioruri", produse: ["vin-alb-sec", "vin-desert", "bourbon", "rom-negru", "lichior-cafea"] },
  ],
};

export const MOZAIC_DEMO_ALDEBARAN = [
  { titlu: "Seara începe cu un pahar bun", text: "Whisky, coniac și rom, alese pentru degustări lungi.", imagine: poza("poze/mozaic"), categorie: "Whisky", fond: "inchis" },
  { titlu: "Coniac XO", text: "În cutie de cadou, cu 100 de lei mai puțin.", imagine: poza("produse/coniac-xo"), categorie: "Coniac", fond: "principala" },
  { titlu: "Spumant pentru sărbători", text: "Fermentat în sticlă, perlaj fin.", imagine: poza("produse/spumant-brut"), categorie: "Spumant", fond: "deschis" },
  { titlu: "Gin cu botanice", text: "Ienupăr, citrice și flori de soc.", imagine: poza("produse/gin-botanic"), categorie: "Gin", fond: "inchis" },
] as const;
