import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Antares (IT si electronice, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 4). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/antares.json`), in `public/teme/antares/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/antares/${cale}.webp`;

export const MENIU_DEMO_ANTARES: MenuItem[] = ["Laptopuri", "Telefoane", "Monitoare", "Componente PC", "Gaming", "Audio"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ANTARES: SetDateDemo = {
  categorii: [
    { nume: "Laptopuri", imagine: poza("categorii/laptopuri"), copii: [] },
    { nume: "Telefoane", imagine: poza("categorii/telefoane"), copii: [] },
    { nume: "Monitoare", imagine: poza("categorii/monitoare"), copii: [] },
    { nume: "Componente PC", imagine: poza("categorii/componente"), copii: [] },
    { nume: "Periferice", imagine: poza("categorii/periferice"), copii: [] },
    { nume: "Gaming", imagine: poza("categorii/gaming"), copii: [] },
    { nume: "Audio", imagine: poza("categorii/audio"), copii: [] },
    { nume: "Electrocasnice mici", imagine: poza("categorii/electrocasnice"), copii: [] },
  ],
  produse: [
    { cheie: "mouse-wireless", nume: "Mouse wireless ergonomic, 6 butoane", categorie: "Periferice", pret: 99, pretVechi: 129, imagine: poza("produse/mouse-wireless"), recomandat: true, descriere: "Senzor de 4000 DPI, conectare prin receptor sau Bluetooth, baterie de 70 de zile." },
    { cheie: "laptop-14", nume: "Laptop ultraportabil 14\", 16 GB RAM, 512 GB SSD", categorie: "Laptopuri", pret: 3499, pretVechi: 3899, imagine: poza("produse/laptop-14"), recomandat: true, descriere: "Carcasă din aluminiu sub 1,3 kg, ecran IPS mat, autonomie de până la 12 ore." },
    { cheie: "telefon-128", nume: "Telefon 6,5\", 128 GB, negru", categorie: "Telefoane", pret: 1299, imagine: poza("produse/telefon-128"), recomandat: true, descriere: "Ecran AMOLED de 120 Hz, cameră de 50 MP, încărcare rapidă de 45 W." },
    { cheie: "monitor-curbat", nume: "Monitor curbat 32\", 165 Hz", categorie: "Monitoare", pret: 1399, pretVechi: 1599, imagine: poza("produse/monitor-curbat"), recomandat: true, descriere: "Panou VA 2K, timp de răspuns de 1 ms, suport reglabil pe înălțime." },
    { cheie: "placa-video", nume: "Placă video 12 GB GDDR6", categorie: "Componente PC", pret: 2299, imagine: poza("produse/placa-video"), descriere: "Două ventilatoare silențioase, potrivită pentru jocuri în 1440p." },
    { cheie: "ssd-1tb", nume: "SSD NVMe 1 TB", categorie: "Componente PC", pret: 349, pretVechi: 399, imagine: poza("produse/ssd-1tb"), descriere: "Citire de până la 5000 MB/s, format M.2 2280." },
    { cheie: "tastatura-mecanica", nume: "Tastatură mecanică RGB, layout US", categorie: "Gaming", pret: 299, imagine: poza("produse/tastatura-mecanica"), recomandat: true, descriere: "Switch-uri liniare, iluminare pe fiecare tastă, cablu detașabil." },
    { cheie: "casti-gaming", nume: "Căști gaming cu microfon detașabil", categorie: "Gaming", pret: 249, pretVechi: 299, imagine: poza("produse/casti-gaming"), descriere: "Sunet surround virtual 7.1, pernuțe din spumă cu memorie." },
    { cheie: "boxa-portabila", nume: "Boxă portabilă Bluetooth, rezistentă la apă", categorie: "Audio", pret: 199, imagine: poza("produse/boxa-portabila"), descriere: "Sunet de 20 W, 15 ore de autonomie, certificare IP67." },
    { cheie: "aspirator-vertical", nume: "Aspirator vertical fără fir", categorie: "Electrocasnice mici", pret: 899, pretVechi: 999, imagine: poza("produse/aspirator-vertical"), descriere: "Motor digital, 40 de minute de autonomie, se transformă în aspirator de mână." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Laptopuri" }],
  carduri: [],
  placi: [{ titlu: "Laptopuri", imagine: poza("categorii/laptopuri"), categorie: "Laptopuri" }, { titlu: "Gaming", imagine: poza("categorii/gaming"), categorie: "Gaming" }, { titlu: "Audio", imagine: poza("categorii/audio"), categorie: "Audio" }, { titlu: "Monitoare", imagine: poza("categorii/monitoare"), categorie: "Monitoare" }],
  randuri: [
    { cheie: "oferte", titlu: "Ofertele săptămânii", produse: ["laptop-14", "monitor-curbat", "mouse-wireless", "casti-gaming", "ssd-1tb"] },
    { cheie: "recomandate", titlu: "Recomandate pentru tine", produse: ["telefon-128", "tastatura-mecanica", "placa-video", "boxa-portabila", "aspirator-vertical"] },
  ],
};
