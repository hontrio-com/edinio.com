import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Arcturus (suplimente si nutritie sportiva, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 4). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/arcturus.json`), in `public/teme/arcturus/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/arcturus/${cale}.webp`;

export const MENIU_DEMO_ARCTURUS: MenuItem[] = ["Proteine", "Creatină", "Vitamine", "Pre-workout", "Gustări proteice", "Accesorii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ARCTURUS: SetDateDemo = {
  categorii: [
    { nume: "Proteine", imagine: poza("categorii/proteine"), copii: [] },
    { nume: "Creatină", imagine: poza("categorii/creatina"), copii: [] },
    { nume: "Vitamine", imagine: poza("categorii/vitamine"), copii: [] },
    { nume: "Pre-workout", imagine: poza("categorii/pre-workout"), copii: [] },
    { nume: "Gustări proteice", imagine: poza("categorii/gustari"), copii: [] },
    { nume: "Slăbire", imagine: poza("categorii/slabire"), copii: [] },
    { nume: "Regenerare", imagine: poza("categorii/regenerare"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "proteina-zer", nume: "Proteină din zer, 1 kg, ciocolată", categorie: "Proteine", pret: 149, pretVechi: 179, imagine: poza("produse/proteina-zer"), recomandat: true, descriere: "24 g de proteină pe porție, se dizolvă ușor, gust de ciocolată fără cocoloașe." },
    { cheie: "creatina", nume: "Creatină monohidrat, 500 g", categorie: "Creatină", pret: 89, imagine: poza("produse/creatina"), recomandat: true, descriere: "Pudră micronizată fără aromă, 100 de porții de 5 g." },
    { cheie: "multivitamine", nume: "Multivitamine, 90 de tablete", categorie: "Vitamine", pret: 59, imagine: poza("produse/multivitamine"), descriere: "13 vitamine și 10 minerale, o tabletă pe zi." },
    { cheie: "pre-workout", nume: "Pre-workout cu cofeină, 300 g, fructe de pădure", categorie: "Pre-workout", pret: 109, pretVechi: 129, imagine: poza("produse/pre-workout"), recomandat: true, descriere: "Cofeină, beta-alanină și citrulină pentru antrenamente intense." },
    { cheie: "batoane-proteice", nume: "Batoane proteice, cutie de 12", categorie: "Gustări proteice", pret: 119, imagine: poza("produse/batoane-proteice"), recomandat: true, descriere: "20 g de proteină și puțin zahăr în fiecare baton." },
    { cheie: "l-carnitina", nume: "L-carnitină lichidă, 500 ml", categorie: "Slăbire", pret: 79, imagine: poza("produse/l-carnitina"), descriere: "Concentrată, cu aromă de lămâie, 33 de porții." },
    { cheie: "bcaa", nume: "BCAA 2:1:1, 400 g, lămâie", categorie: "Regenerare", pret: 99, pretVechi: 119, imagine: poza("produse/bcaa"), descriere: "Aminoacizi esențiali pentru recuperarea după efort." },
    { cheie: "shaker", nume: "Shaker cu sită, 700 ml", categorie: "Accesorii", pret: 29, imagine: poza("produse/shaker"), descriere: "Capac etanș, gradații pe lateral, fără BPA." },
    { cheie: "omega-3", nume: "Omega 3, 120 de capsule", categorie: "Vitamine", pret: 69, imagine: poza("produse/omega-3"), recomandat: true, descriere: "Ulei de pește purificat, 1000 mg pe capsulă." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Proteine" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "vandute", titlu: "Cele mai vândute", produse: ["proteina-zer", "creatina", "pre-workout", "batoane-proteice", "omega-3"] },
    { cheie: "noutati", titlu: "Noutăți", produse: ["bcaa", "l-carnitina", "multivitamine", "shaker", "proteina-zer"] },
  ],
};
