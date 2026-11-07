import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Marte (mobila, aspect intunecat, etapa 24 din `docs/editor-magazin/PLAN.md`). Pozele generate cu
  ElevenLabs (manifestul `scripts/teme/imagini/marte.json`), in `public/teme/marte/`: categoriile sunt fotografii de
  interior (merg pe fond inchis), produsele decupate de pe negru. Textele si preturile sunt scrise aici.
*/

const poza = (cale: string) => `/teme/marte/${cale}.webp`;

export const MENIU_DEMO_MARTE: MenuItem[] = [
  ...["Canapele", "Fotolii", "Mese", "Paturi", "Iluminat", "Decorațiuni"]
    .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume })),
];

export const DATE_DEMO_MARTE: SetDateDemo = {
  categorii: [
    { nume: "Canapele", imagine: poza("categorii/canapele"), copii: [] },
    { nume: "Fotolii", imagine: poza("categorii/fotolii"), copii: [] },
    { nume: "Mese", imagine: poza("categorii/mese"), copii: [] },
    { nume: "Scaune", imagine: poza("categorii/scaune"), copii: [] },
    { nume: "Paturi", imagine: poza("categorii/paturi"), copii: [] },
    { nume: "Depozitare", imagine: poza("categorii/depozitare"), copii: [] },
    { nume: "Iluminat", imagine: poza("categorii/iluminat"), copii: [] },
    { nume: "Decorațiuni", imagine: poza("categorii/decoratiuni"), copii: [] },
  ],
  produse: [
    { cheie: "canapea-catifea-verde", nume: "Canapea 3 locuri, catifea verde smarald", categorie: "Canapele", pret: 4890, pretVechi: 5490, imagine: poza("produse/canapea-catifea-verde"), recomandat: true, descriere: "Catifea densă, perne cu puf și picioare din lemn masiv de nuc. 220 cm lățime." },
    { cheie: "coltar-gri", nume: "Colțar modular, țesătură gri deschis", categorie: "Canapele", pret: 6290, imagine: poza("produse/coltar-gri"), descriere: "Se montează pe stânga sau pe dreapta. Huse detașabile, lavabile." },
    { cheie: "fotoliu-ratan", nume: "Fotoliu din lemn de stejar cu șezut din ratan", categorie: "Fotolii", pret: 1690, imagine: poza("produse/fotoliu-ratan"), recomandat: true, descriere: "Ratan împletit manual pe cadru de stejar masiv. Ușor, aerisit, rezistent." },
    { cheie: "fotoliu-piele-coniac", nume: "Fotoliu rotativ din piele, coniac", categorie: "Fotolii", pret: 3490, pretVechi: 3890, imagine: poza("produse/fotoliu-piele-coniac"), recomandat: true, descriere: "Piele naturală care se patinează frumos în timp, bază rotativă din metal." },
    { cheie: "masa-stejar-6", nume: "Masă dining din stejar masiv, 6 persoane", categorie: "Mese", pret: 3890, imagine: poza("produse/masa-stejar-6"), descriere: "Blat de 4 cm din stejar masiv, finisat cu ulei natural. 200 x 95 cm." },
    { cheie: "masuta-marmura", nume: "Măsuță de cafea rotundă, marmură și nuc", categorie: "Mese", pret: 2190, pretVechi: 2490, imagine: poza("produse/masuta-marmura"), recomandat: true, descriere: "Blat din marmură albă de Carrara, bază din nuc cu raft." },
    { cheie: "scaun-nuc", nume: "Scaun dining din lemn de nuc", categorie: "Scaune", pret: 890, imagine: poza("produse/scaun-nuc"), descriere: "Spătar curbat, ergonomic, din nuc masiv. Se potrivește cu masa din stejar." },
    { cheie: "scaun-bar-alama", nume: "Scaun de bar, șezut tapițat, picioare din alamă", categorie: "Scaune", pret: 990, imagine: poza("produse/scaun-bar-alama"), descriere: "Înălțime de șezut de 75 cm, potrivit pentru insule de bucătărie." },
    { cheie: "pat-tapitat-160", nume: "Pat tapițat 160 x 200 cm, in bej", categorie: "Paturi", pret: 3990, pretVechi: 4490, imagine: poza("produse/pat-tapitat-160"), recomandat: true, descriere: "Tăblie înaltă tapițată, somieră din lemn inclusă, fără saltea." },
    { cheie: "noptiera-stejar", nume: "Noptieră din stejar cu un sertar", categorie: "Paturi", pret: 790, imagine: poza("produse/noptiera-stejar"), descriere: "Sertar cu închidere lină și raft deschis dedesubt." },
    { cheie: "comoda-6-sertare", nume: "Comodă cu 6 sertare, stejar", categorie: "Depozitare", pret: 2590, imagine: poza("produse/comoda-6-sertare"), descriere: "Șase sertare încăpătoare, glisiere cu închidere lină, 140 cm lățime." },
    { cheie: "biblioteca-alama", nume: "Bibliotecă deschisă, cadru din alamă, rafturi din nuc", categorie: "Depozitare", pret: 2890, imagine: poza("produse/biblioteca-alama"), descriere: "Cinci rafturi din nuc pe cadru subțire din metal alămit." },
    { cheie: "lampa-arc", nume: "Lampă de podea arc, alamă și opal", categorie: "Iluminat", pret: 1290, pretVechi: 1490, imagine: poza("produse/lampa-arc"), recomandat: true, descriere: "Braț de 2 m peste canapea, abajur din sticlă opal, bază de marmură." },
    { cheie: "veioza-ceramica", nume: "Veioză din ceramică, abajur din in", categorie: "Iluminat", pret: 490, imagine: poza("produse/veioza-ceramica"), descriere: "Ceramică lucrată manual, glazură mată, abajur din in natural." },
    { cheie: "pendul-ratan", nume: "Pendul din ratan împletit, 50 cm", categorie: "Iluminat", pret: 690, imagine: poza("produse/pendul-ratan"), descriere: "Lumină caldă, filtrată prin împletitură. Perfect deasupra mesei." },
    { cheie: "oglinda-alama", nume: "Oglindă rotundă, ramă subțire din alamă, 80 cm", categorie: "Decorațiuni", pret: 590, imagine: poza("produse/oglinda-alama"), descriere: "Ramă de 1 cm din alamă periată. Lărgește vizual orice cameră." },
    { cheie: "vaze-teracota", nume: "Set 3 vaze din teracotă", categorie: "Decorațiuni", pret: 290, imagine: poza("produse/vaze-teracota"), descriere: "Trei înălțimi, finisaj mat, pentru crengi uscate sau flori." },
    { cheie: "covor-lana", nume: "Covor din lână, țesut manual, 200 x 300 cm", categorie: "Decorațiuni", pret: 2490, pretVechi: 2890, imagine: poza("produse/covor-lana"), descriere: "Lână naturală țesută manual, textură discretă, ton crem." },
  ],
  bannere: [
    { imagine: poza("poze/hero-fotoliu"), categorie: "Fotolii" },
    { imagine: poza("poze/hero-living"), categorie: "Canapele" },
  ],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți în colecție", produse: ["fotoliu-ratan", "canapea-catifea-verde", "masuta-marmura", "lampa-arc", "pat-tapitat-160"] },
    { cheie: "favorite", titlu: "Favoritele clienților", produse: ["fotoliu-piele-coniac", "masa-stejar-6", "scaun-nuc", "comoda-6-sertare", "covor-lana"] },
  ],
};
