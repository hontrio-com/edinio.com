import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Venus (electronice si electrocasnice, etapa 24 din `docs/editor-magazin/PLAN.md`). Pozele generate
  cu ElevenLabs (manifestul `scripts/teme/imagini/venus.json`), in `public/teme/venus/`. Produse fara marca: numele
  descriu produsul, nu un model real. Textele si preturile sunt scrise aici.
*/

const poza = (cale: string) => `/teme/venus/${cale}.webp`;

export const MENIU_DEMO_VENUS: MenuItem[] = [
  ...["Telefoane", "Laptopuri", "Televizoare", "Electrocasnice mari", "Gaming"]
    .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume })),
];

export const DATE_DEMO_VENUS: SetDateDemo = {
  categorii: [
    { nume: "Telefoane", imagine: poza("categorii/telefoane"), copii: ["Smartphone-uri", "Ceasuri inteligente"] },
    { nume: "Laptopuri", imagine: poza("categorii/laptopuri"), copii: ["Laptopuri de uz general", "Tablete"] },
    { nume: "Televizoare", imagine: poza("categorii/televizoare"), copii: [] },
    { nume: "Electrocasnice mari", imagine: poza("categorii/electrocasnice-mari"), copii: [] },
    { nume: "Electrocasnice mici", imagine: poza("categorii/electrocasnice-mici"), copii: [] },
    { nume: "Audio", imagine: poza("categorii/audio"), copii: [] },
    { nume: "Gaming", imagine: poza("categorii/gaming"), copii: [] },
    { nume: "Climatizare", imagine: poza("categorii/climatizare"), copii: [] },
  ],
  produse: [
    { cheie: "smartphone-67", nume: "Smartphone 6,7\", 256 GB, 12 GB RAM, cameră triplă 50 MP, albastru", categorie: "Smartphone-uri", pret: 3499, pretVechi: 3999, imagine: poza("produse/smartphone-67"), recomandat: true, descriere: "Ecran AMOLED de 6,7 inci la 120 Hz, baterie de 5000 mAh și încărcare rapidă de 65 W." },
    { cheie: "smartphone-61", nume: "Smartphone 6,1\", 128 GB, 8 GB RAM, 5G, argintiu", categorie: "Smartphone-uri", pret: 1899, imagine: poza("produse/smartphone-61"), descriere: "Compact, ușor, cu 5G și cameră principală de 50 MP cu stabilizare optică." },
    { cheie: "laptop-156", nume: "Laptop 15,6\" Full HD, procesor 8 nuclee, 16 GB RAM, SSD 1 TB", categorie: "Laptopuri de uz general", pret: 3799, pretVechi: 4299, imagine: poza("produse/laptop-156"), recomandat: true, descriere: "Pentru birou și școală: ecran mat de 15,6 inci, tastatură numerică și autonomie de o zi." },
    { cheie: "ultrabook-14", nume: "Ultrabook 14\", 16 GB RAM, SSD 512 GB, 1,2 kg, argintiu", categorie: "Laptopuri de uz general", pret: 4599, imagine: poza("produse/ultrabook-14"), descriere: "Carcasă din aluminiu, 1,2 kg și până la 14 ore pe baterie." },
    { cheie: "tv-oled-65", nume: "Televizor OLED 65\" (164 cm), 4K, 120 Hz, Smart TV", categorie: "Televizoare", pret: 6999, pretVechi: 8499, imagine: poza("produse/tv-oled-65"), recomandat: true, descriere: "Negru perfect, culori vii și sunet Dolby Atmos. Ideal pentru filme și gaming." },
    { cheie: "tv-led-55", nume: "Televizor LED 55\" (139 cm), 4K UHD, Smart TV, HDR", categorie: "Televizoare", pret: 1999, pretVechi: 2399, imagine: poza("produse/tv-led-55"), descriere: "Imagine 4K cu HDR, aplicații de streaming incluse și telecomandă vocală." },
    { cheie: "combina-frigorifica", nume: "Combină frigorifică No Frost, 186 cm, 340 l, inox", categorie: "Electrocasnice mari", pret: 2699, pretVechi: 3099, imagine: poza("produse/combina-frigorifica"), descriere: "No Frost pe ambele compartimente, sertar pentru legume cu umiditate controlată." },
    { cheie: "masina-spalat-9kg", nume: "Mașină de spălat rufe, 9 kg, 1400 rpm, motor inverter", categorie: "Electrocasnice mari", pret: 1849, imagine: poza("produse/masina-spalat-9kg"), recomandat: true, descriere: "Motor inverter silențios, 15 programe și funcție cu abur pentru rufe fără cute." },
    { cheie: "aspirator-vertical", nume: "Aspirator vertical fără fir, 150 AW, autonomie 60 min", categorie: "Electrocasnice mici", pret: 1199, pretVechi: 1399, imagine: poza("produse/aspirator-vertical"), descriere: "Se transformă în aspirator de mână. Filtru HEPA și perie motorizată pentru covoare." },
    { cheie: "espressor-automat", nume: "Espressor automat cu râșniță, 15 bar, spumare lapte", categorie: "Electrocasnice mici", pret: 1599, imagine: poza("produse/espressor-automat"), descriere: "Râșniță ceramică integrată, 13 trepte de măcinare și duză de spumare." },
    { cheie: "casti-anc", nume: "Căști wireless over-ear cu anulare activă a zgomotului", categorie: "Audio", pret: 899, pretVechi: 1099, imagine: poza("produse/casti-anc"), recomandat: true, descriere: "Anulare activă a zgomotului, 30 de ore de autonomie și pliere compactă." },
    { cheie: "boxa-portabila", nume: "Boxă portabilă Bluetooth, rezistentă la apă IP67", categorie: "Audio", pret: 349, imagine: poza("produse/boxa-portabila"), descriere: "Sunet de 360°, rezistentă la apă și praf, 12 ore de muzică." },
    { cheie: "consola-jocuri", nume: "Consolă de jocuri 4K, 1 TB, cu controller", categorie: "Gaming", pret: 2799, imagine: poza("produse/consola-jocuri"), recomandat: true, descriere: "Jocuri în 4K la 120 de cadre, SSD rapid și controller inclus." },
    { cheie: "controller-wireless", nume: "Controller wireless cu vibrații, negru", categorie: "Gaming", pret: 299, imagine: poza("produse/controller-wireless"), descriere: "Vibrații fine, butoane programabile și baterie reîncărcabilă." },
    { cheie: "aer-conditionat-12000", nume: "Aer condiționat inverter 12000 BTU, clasa A++, Wi-Fi", categorie: "Climatizare", pret: 2299, pretVechi: 2599, imagine: poza("produse/aer-conditionat-12000"), descriere: "Răcire și încălzire, control din aplicație și funcționare silențioasă de 22 dB." },
    { cheie: "purificator-aer", nume: "Purificator de aer cu filtru HEPA, până la 40 mp", categorie: "Climatizare", pret: 649, imagine: poza("produse/purificator-aer"), descriere: "Filtru HEPA H13 și senzor de calitate a aerului, mod de noapte silențios." },
    { cheie: "tableta-11-grafit", nume: "Tabletă 11\", 128 GB, Wi-Fi, grafit", categorie: "Tablete", pret: 1399, imagine: poza("produse/tableta-11-grafit"), descriere: "Ecran de 11 inci la 90 Hz, patru difuzoare și baterie pentru o zi întreagă." },
    { cheie: "tableta-11-argintie", nume: "Tabletă 11\", 256 GB, Wi-Fi + 5G, argintiu", categorie: "Tablete", pret: 1999, pretVechi: 2299, imagine: poza("produse/tableta-11-argintie"), descriere: "Conectivitate 5G, ecran luminos și stocare de 256 GB pentru filme și documente." },
    { cheie: "smartwatch", nume: "Ceas inteligent cu GPS și monitorizare a somnului", categorie: "Ceasuri inteligente", pret: 799, imagine: poza("produse/smartwatch"), descriere: "GPS integrat, puls, oxigen în sânge și peste 100 de moduri de sport." },
  ],
  bannere: [
    { imagine: poza("bannere/reduceri-iarna"), categorie: "Televizoare" },
    { imagine: poza("bannere/electrocasnice"), categorie: "Electrocasnice mari" },
    { imagine: poza("bannere/gaming"), categorie: "Gaming" },
  ],
  carduri: [],
  placi: [
    { titlu: "Seri de film în familie", imagine: poza("placi/tv-familie"), categorie: "Televizoare" },
    { titlu: "Bucătăria visurilor", imagine: poza("placi/bucatarie"), categorie: "Electrocasnice mici" },
    { titlu: "Muzica ta, oriunde", imagine: poza("placi/casti-oras"), categorie: "Audio" },
    { titlu: "Universul gaming", imagine: poza("placi/gaming"), categorie: "Gaming" },
    { titlu: "Casă curată, fără efort", imagine: poza("placi/aspirator"), categorie: "Electrocasnice mici" },
  ],
  randuri: [
    { cheie: "top-oferte", titlu: "Top oferte", produse: ["tv-oled-65", "laptop-156", "combina-frigorifica", "aspirator-vertical", "casti-anc"] },
    { cheie: "noutati", titlu: "Noutăți", produse: ["smartphone-67", "consola-jocuri", "ultrabook-14", "masina-spalat-9kg", "smartwatch"] },
  ],
};
