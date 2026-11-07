import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Capella (pet shop, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 4). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/capella.json`), in `public/teme/capella/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/capella/${cale}.webp`;

export const MENIU_DEMO_CAPELLA: MenuItem[] = ["Câini", "Pisici", "Păsări", "Pești", "Rozătoare", "Reptile"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_CAPELLA: SetDateDemo = {
  categorii: [
    { nume: "Câini", imagine: poza("categorii/caini"), copii: [] },
    { nume: "Pisici", imagine: poza("categorii/pisici"), copii: [] },
    { nume: "Păsări", imagine: poza("categorii/pasari"), copii: [] },
    { nume: "Pești", imagine: poza("categorii/pesti"), copii: [] },
    { nume: "Rozătoare", imagine: poza("categorii/rozatoare"), copii: [] },
    { nume: "Reptile", imagine: poza("categorii/reptile"), copii: [] },
    { nume: "Jucării", imagine: poza("categorii/jucarii"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "os-piele", nume: "Os din piele presată pentru câini, 15 cm", categorie: "Jucării", pret: 19, imagine: poza("produse/os-piele"), descriere: "Ține câinele ocupat și îi curăță dinții." },
    { cheie: "hrana-caini", nume: "Hrană uscată pentru câini adulți, 12 kg", categorie: "Câini", pret: 289, pretVechi: 329, imagine: poza("produse/hrana-caini"), recomandat: true, descriere: "Cu pui și orez, fără coloranți artificiali." },
    { cheie: "hrana-pisici", nume: "Hrană uscată pentru pisici, 2 kg", categorie: "Pisici", pret: 79, imagine: poza("produse/hrana-pisici"), recomandat: true, descriere: "Cu somon, pentru blană lucioasă și digestie ușoară." },
    { cheie: "nisip-pisici", nume: "Nisip aglomerant pentru pisici, 10 l", categorie: "Pisici", pret: 49, pretVechi: 59, imagine: poza("produse/nisip-pisici"), descriere: "Fără praf, cu neutralizator de mirosuri." },
    { cheie: "colivie", nume: "Colivie pentru păsări mici", categorie: "Păsări", pret: 199, imagine: poza("produse/colivie"), descriere: "Cu bețe de stat, hrănitoare și tavă detașabilă." },
    { cheie: "acvariu-60", nume: "Acvariu de 60 l cu filtru și lumină", categorie: "Pești", pret: 449, pretVechi: 499, imagine: poza("produse/acvariu-60"), recomandat: true, descriere: "Capac cu iluminare LED, filtru intern silențios." },
    { cheie: "cusca-hamster", nume: "Cușcă pentru hamsteri, cu accesorii", categorie: "Rozătoare", pret: 179, imagine: poza("produse/cusca-hamster"), descriere: "Roată, căsuță și adăpătoare incluse." },
    { cheie: "terariu", nume: "Terariu din sticlă, 45 cm", categorie: "Reptile", pret: 399, imagine: poza("produse/terariu"), descriere: "Uși frontale cu încuietoare și ventilație pe capac." },
    { cheie: "culcus-caine", nume: "Culcuș moale pentru câini, mărimea M", categorie: "Accesorii", pret: 149, pretVechi: 179, imagine: poza("produse/culcus-caine"), recomandat: true, descriere: "Margini înalte, husă lavabilă la 30 de grade." },
    { cheie: "ansamblu-zgariat", nume: "Ansamblu de zgâriat pentru pisici, 90 cm", categorie: "Pisici", pret: 229, imagine: poza("produse/ansamblu-zgariat"), recomandat: true, descriere: "Stâlpi cu sfoară de sisal, culcuș și jucării agățate." },
  ],
  bannere: [{ imagine: poza("bannere/prieteni"), categorie: "Câini" }, { imagine: poza("bannere/hrana"), categorie: "Pisici" }],
  carduri: [{ titlu: "Totul pentru câini", text: "Hrană, culcușuri și jucării.", imagine: poza("produse/hrana-caini"), categorie: "Câini" }, { titlu: "Totul pentru pisici", text: "Hrană, nisip și ansambluri de zgâriat.", imagine: poza("produse/ansamblu-zgariat"), categorie: "Pisici" }],
  placi: [],
  randuri: [
    { cheie: "vandute", titlu: "Cele mai vândute", produse: ["hrana-caini", "hrana-pisici", "acvariu-60", "culcus-caine", "ansamblu-zgariat"] },
    { cheie: "casa", titlu: "Pentru casa lor", produse: ["nisip-pisici", "colivie", "cusca-hamster", "terariu", "os-piele"] },
  ],
};
