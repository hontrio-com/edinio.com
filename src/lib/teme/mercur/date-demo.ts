import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Mercur (pet shop, etapa 24 din `docs/editor-magazin/PLAN.md`). Pozele generate cu ElevenLabs
  (grile 3x3 taiate de `scripts/teme/imagini-generate.mjs`, manifestul in `scripts/teme/imagini/mercur.json`), in
  `public/teme/mercur/`; adresele RELATIVE, ca la Jupiter. Textele si preturile sunt scrise aici. Cheile sunt stabile.
*/

const poza = (cale: string) => `/teme/mercur/${cale}.webp`;

const RAIOANE_MENIU = ["Hrană pentru câini", "Hrană pentru pisici", "Jucării", "Lese și accesorii", "Culcușuri", "Acvaristică"];

export const MENIU_DEMO_MERCUR: MenuItem[] = [
  { id: "demo_toate", type: "home", label: "Toate produsele" },
  ...RAIOANE_MENIU.map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume })),
];

export const DATE_DEMO_MERCUR: SetDateDemo = {
  categorii: [
    { nume: "Hrană pentru câini", imagine: poza("categorii/hrana-caini"), copii: ["Hrană uscată câini", "Conserve câini"] },
    { nume: "Hrană pentru pisici", imagine: poza("categorii/hrana-pisici"), copii: ["Hrană uscată pisici", "Hrană umedă pisici"] },
    { nume: "Recompense", imagine: poza("categorii/recompense"), copii: [] },
    { nume: "Jucării", imagine: poza("categorii/jucarii"), copii: [] },
    { nume: "Lese și accesorii", imagine: poza("categorii/lese-si-zgarzi"), copii: [] },
    { nume: "Culcușuri", imagine: poza("categorii/culcusuri"), copii: [] },
    { nume: "Igienă și îngrijire", imagine: poza("categorii/igiena"), copii: [] },
    { nume: "Acvaristică", imagine: poza("categorii/acvaristica"), copii: [] },
  ],
  produse: [
    { cheie: "hrana-caini-talie-mare", nume: "Hrană uscată câini adulți talie mare, miel și orez, 12 kg", categorie: "Hrană uscată câini", pret: 289, pretVechi: 329, imagine: poza("produse/hrana-caini-talie-mare"), recomandat: true, descriere: "Hrană completă pentru câinii adulți de talie mare, cu miel și orez, pentru digestie ușoară și blană strălucitoare." },
    { cheie: "hrana-pui-caine", nume: "Hrană uscată pui de câine, pui și orez, 3 kg", categorie: "Hrană uscată câini", pret: 94.99, imagine: poza("produse/hrana-pui-caine"), recomandat: true, descriere: "Granule mici, ușor de mestecat, cu calciu și DHA pentru creșterea sănătoasă a puiului." },
    { cheie: "conserve-caini-vita", nume: "Conserve câini cu vită, 6 x 400 g", categorie: "Conserve câini", pret: 59.99, pretVechi: 69.99, imagine: poza("produse/conserve-caini-vita"), descriere: "Bucăți fragede de vită în sos, fără coloranți adăugați. Pachet economic de șase conserve." },
    { cheie: "hrana-pisici-sterilizate", nume: "Hrană uscată pisici sterilizate, somon, 2 kg", categorie: "Hrană uscată pisici", pret: 89.99, imagine: poza("produse/hrana-pisici-sterilizate"), recomandat: true, descriere: "Rețetă cu somon, cu mai puține calorii, pentru pisicile sterilizate care își păstrează greutatea ideală." },
    { cheie: "plicuri-pisici", nume: "Plicuri pisici, pui în aspic, 12 x 85 g", categorie: "Hrană umedă pisici", pret: 42.99, pretVechi: 49.99, imagine: poza("produse/plicuri-pisici"), descriere: "Bucățele de pui în aspic, în plicuri de o porție. Ideal ca masă principală sau ca supliment." },
    { cheie: "recompense-dentare", nume: "Recompense dentare câini talie medie, 28 buc", categorie: "Recompense", pret: 54.99, imagine: poza("produse/recompense-dentare"), descriere: "Batoane care curăță dinții și împrospătează respirația. O recompensă pe zi." },
    { cheie: "batoane-pisici-ton", nume: "Batoane recompensă pisici cu ton, 10 buc", categorie: "Recompense", pret: 14.99, imagine: poza("produse/batoane-pisici-ton"), descriere: "Batoane moi cu ton, pentru dresaj sau pur și simplu pentru răsfăț." },
    { cheie: "minge-cauciuc", nume: "Minge din cauciuc rezistent pentru câini, 7 cm", categorie: "Jucării", pret: 24.99, imagine: poza("produse/minge-cauciuc"), recomandat: true, descriere: "Cauciuc natural, greu de rupt, care sare imprevizibil. Potrivită pentru aport în parc." },
    { cheie: "ansamblu-joaca-pisici", nume: "Ansamblu de joacă pentru pisici cu stâlpi de zgâriat, 90 cm", categorie: "Jucării", pret: 179, pretVechi: 219, imagine: poza("produse/ansamblu-joaca-pisici"), recomandat: true, descriere: "Două platforme, căsuță și stâlpi din sisal natural. Pisica are unde să se cațere, să doarmă și să-și ascută ghearele." },
    { cheie: "soricei-catnip", nume: "Șoricei din pâslă cu catnip, set de 3", categorie: "Jucării", pret: 19.99, imagine: poza("produse/soricei-catnip"), descriere: "Trei șoricei moi, umpluți cu catnip, care trezesc instinctul de vânătoare." },
    { cheie: "lesa-extensibila", nume: "Lesă extensibilă 5 m, până la 25 kg", categorie: "Lese și accesorii", pret: 69.99, imagine: poza("produse/lesa-extensibila"), descriere: "Mâner ergonomic, buton de blocare și bandă rezistentă de 5 metri." },
    { cheie: "ham-reglabil", nume: "Ham reglabil căptușit pentru câini, mărimea M", categorie: "Lese și accesorii", pret: 84.99, pretVechi: 99.99, imagine: poza("produse/ham-reglabil"), descriere: "Căptușit, cu patru puncte de reglaj și inel metalic pentru lesă. Nu apasă pe gât." },
    { cheie: "bol-ceramic-caini", nume: "Bol din ceramică pentru câini, 1,2 l", categorie: "Lese și accesorii", pret: 39.99, imagine: poza("produse/bol-ceramic-caini"), descriere: "Ceramică groasă, stabilă, ușor de spălat. Nu alunecă pe gresie." },
    { cheie: "culcus-rotund-plus", nume: "Culcuș rotund din pluș, 60 cm", categorie: "Culcușuri", pret: 109, imagine: poza("produse/culcus-rotund-plus"), recomandat: true, descriere: "Pluș moale cu margine înaltă, în care animalul se cuibărește. Se spală la mașină." },
    { cheie: "pat-ortopedic-caini", nume: "Pat ortopedic pentru câini talie mare, 100 x 70 cm", categorie: "Culcușuri", pret: 249, imagine: poza("produse/pat-ortopedic-caini"), descriere: "Spumă cu memorie care sprijină articulațiile, husă detașabilă și bază antiderapantă." },
    { cheie: "asternut-aglomerant", nume: "Așternut aglomerant pentru pisici, 10 l", categorie: "Igienă și îngrijire", pret: 34.99, imagine: poza("produse/asternut-aglomerant"), descriere: "Formează bulgări compacți, ușor de scos, și ține mirosurile sub control." },
    { cheie: "sampon-hipoalergenic", nume: "Șampon hipoalergenic pentru câini, 250 ml", categorie: "Igienă și îngrijire", pret: 29.99, imagine: poza("produse/sampon-hipoalergenic"), descriere: "Formulă blândă, fără parfum puternic, pentru pielea sensibilă." },
    { cheie: "acvariu-echipat-60l", nume: "Acvariu complet echipat, 60 l", categorie: "Acvaristică", pret: 399, pretVechi: 459, imagine: poza("produse/acvariu-echipat-60l"), descriere: "Vine cu capac cu lumină LED, filtru și încălzitor. Se pune în funcțiune în aceeași zi." },
    { cheie: "filtru-intern-acvariu", nume: "Filtru intern pentru acvariu, 400 l/h", categorie: "Acvaristică", pret: 79.99, imagine: poza("produse/filtru-intern-acvariu"), descriere: "Silențios, cu debit reglabil, pentru acvarii de până la 100 de litri." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Hrană pentru câini" }],
  carduri: [],
  placi: [
    { titlu: "Totul pentru câini", imagine: poza("categorii/hrana-caini"), categorie: "Hrană pentru câini" },
    { titlu: "Totul pentru pisici", imagine: poza("categorii/hrana-pisici"), categorie: "Hrană pentru pisici" },
    { titlu: "Jucării noi", imagine: poza("categorii/jucarii"), categorie: "Jucării" },
    { titlu: "Acvaristică", imagine: poza("categorii/acvaristica"), categorie: "Acvaristică" },
  ],
  randuri: [
    { cheie: "iubite", titlu: "Cele mai iubite", produse: ["hrana-caini-talie-mare", "ansamblu-joaca-pisici", "culcus-rotund-plus", "minge-cauciuc", "hrana-pisici-sterilizate"] },
    { cheie: "oferte", titlu: "Oferte săptămâna asta", produse: ["conserve-caini-vita", "plicuri-pisici", "ham-reglabil", "acvariu-echipat-60l", "hrana-caini-talie-mare"] },
  ],
};
