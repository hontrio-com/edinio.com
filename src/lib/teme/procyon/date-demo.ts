import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Procyon (electronice si electrocasnice, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 5). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/procyon.json`), in `public/teme/procyon/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/procyon/${cale}.webp`;

export const MENIU_DEMO_PROCYON: MenuItem[] = ["Televizoare", "Electrocasnice mari", "Climatizare", "Bucătărie", "Laptopuri", "Telefoane"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_PROCYON: SetDateDemo = {
  categorii: [
    { nume: "Televizoare", imagine: poza("categorii/televizoare"), copii: [] },
    { nume: "Electrocasnice mari", imagine: poza("categorii/electrocasnice-mari"), copii: [] },
    { nume: "Climatizare", imagine: poza("categorii/climatizare"), copii: [] },
    { nume: "Bucătărie", imagine: poza("categorii/bucatarie"), copii: [] },
    { nume: "Îngrijire casă", imagine: poza("categorii/ingrijire-casa"), copii: [] },
    { nume: "Laptopuri", imagine: poza("categorii/laptopuri"), copii: [] },
    { nume: "Telefoane", imagine: poza("categorii/telefoane"), copii: [] },
    { nume: "Audio", imagine: poza("categorii/audio"), copii: [] },
  ],
  produse: [
    { cheie: "casti-anc", nume: "Căști wireless cu anulare a zgomotului", categorie: "Audio", pret: 499, pretVechi: 649, imagine: poza("produse/casti-anc"), recomandat: true, descriere: "30 de ore de autonomie, încărcare rapidă, multipoint." },
    { cheie: "televizor-55", nume: "Televizor QLED 55\", 4K, Smart TV", categorie: "Televizoare", pret: 1499, pretVechi: 1799, imagine: poza("produse/televizor-55"), recomandat: true, descriere: "HDR10+, 120 Hz, asistent vocal și Wi-Fi integrat." },
    { cheie: "masina-spalat", nume: "Mașină de spălat rufe 8 kg, 1400 rpm", categorie: "Electrocasnice mari", pret: 1049, pretVechi: 1699, imagine: poza("produse/masina-spalat"), recomandat: true, descriere: "Clasa A, motor inverter, 15 programe." },
    { cheie: "aer-conditionat", nume: "Aer condiționat inverter 12000 BTU", categorie: "Climatizare", pret: 1099, pretVechi: 1659, imagine: poza("produse/aer-conditionat"), recomandat: true, descriere: "Clasa A++, Wi-Fi, mod silențios de 22 dB." },
    { cheie: "frigider-combina", nume: "Combină frigorifică No Frost, 360 l", categorie: "Electrocasnice mari", pret: 2199, imagine: poza("produse/frigider-combina"), descriere: "Inox, compresor inverter, sertar pentru legume cu umiditate controlată." },
    { cheie: "espressor-automat", nume: "Espressor automat cu râșniță", categorie: "Bucătărie", pret: 1399, pretVechi: 1599, imagine: poza("produse/espressor-automat"), descriere: "Spumare automată a laptelui, 13 trepte de măcinare." },
    { cheie: "robot-aspirator", nume: "Robot aspirator cu mop și stație", categorie: "Îngrijire casă", pret: 1299, imagine: poza("produse/robot-aspirator"), recomandat: true, descriere: "Navigație laser, golire automată, hartă în aplicație." },
    { cheie: "laptop-15", nume: "Laptop 15,6\", 16 GB RAM, 1 TB SSD", categorie: "Laptopuri", pret: 2899, pretVechi: 3199, imagine: poza("produse/laptop-15"), descriere: "Ecran Full HD 144 Hz, tastatură iluminată." },
    { cheie: "telefon-256", nume: "Telefon 6,7\", 256 GB, verde", categorie: "Telefoane", pret: 1899, imagine: poza("produse/telefon-256"), descriere: "Cameră de 108 MP, baterie de 5000 mAh." },
    { cheie: "cuptor-microunde", nume: "Cuptor cu microunde 25 l, cu grill", categorie: "Bucătărie", pret: 399, pretVechi: 459, imagine: poza("produse/cuptor-microunde"), descriere: "Inox, 900 W, 8 programe automate." },
  ],
  bannere: [{ imagine: poza("poze/vitrina-tv"), categorie: "Televizoare" }],
  carduri: [],
  placi: [{ titlu: "Bucătăria ta", imagine: poza("poze/placa-bucatarie"), categorie: "Bucătărie" }, { titlu: "Sufrageria", imagine: poza("poze/placa-living"), categorie: "Televizoare" }, { titlu: "Biroul de acasă", imagine: poza("poze/placa-birou"), categorie: "Laptopuri" }, { titlu: "Pe drum", imagine: poza("poze/placa-drum"), categorie: "Audio" }],
  randuri: [
    { cheie: "oferte", titlu: "Ofertele zilei", produse: ["televizor-55", "masina-spalat", "aer-conditionat", "robot-aspirator", "casti-anc"] },
    { cheie: "populare", titlu: "Cele mai căutate", produse: ["frigider-combina", "espressor-automat", "laptop-15", "telefon-256", "cuptor-microunde"] },
  ],
};

export const VITRINA_DEMO_PROCYON = [
  { eticheta: "-300 lei", titlu: "Televizoare QLED", text: "Imagine 4K la prețul sezonului.", imagine: poza("poze/vitrina-tv"), categorie: "Televizoare" },
  { eticheta: "-38%", titlu: "Mașini de spălat", text: "Clasa A, motor inverter.", imagine: poza("poze/vitrina-spalat"), categorie: "Electrocasnice mari" },
  { eticheta: "-34%", titlu: "Aer condiționat", text: "Montaj rapid, Wi-Fi inclus.", imagine: poza("poze/vitrina-clima"), categorie: "Climatizare" },
  { eticheta: "Nou", titlu: "Robot aspirator", text: "Casa curată fără efort.", imagine: poza("poze/vitrina-aspirator"), categorie: "Îngrijire casă" },
  { eticheta: "-15%", titlu: "Espressoare", text: "Cafea ca la cafenea, acasă.", imagine: poza("poze/vitrina-cafea"), categorie: "Bucătărie" },
] as const;
