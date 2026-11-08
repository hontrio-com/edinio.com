import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Maia (electronice, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 7). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/maia.json`), in `public/teme/maia/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/maia/${cale}.webp`;

export const MENIU_DEMO_MAIA: MenuItem[] = ["Laptopuri", "Telefoane", "Foto și video", "Imprimante", "Audio", "Smartwatch"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_MAIA: SetDateDemo = {
  categorii: [
    { nume: "Laptopuri", imagine: poza("categorii/laptopuri"), copii: [] },
    { nume: "Telefoane", imagine: poza("categorii/telefoane"), copii: [] },
    { nume: "Foto și video", imagine: poza("categorii/foto"), copii: [] },
    { nume: "Imprimante", imagine: poza("categorii/imprimante"), copii: [] },
    { nume: "Audio", imagine: poza("categorii/audio"), copii: [] },
    { nume: "Smartwatch", imagine: poza("categorii/smartwatch"), copii: [] },
    { nume: "Console", imagine: poza("categorii/console"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "incarcator-wireless", nume: "Încărcător wireless rapid, 15 W", categorie: "Accesorii", pret: 99, pretVechi: 129, imagine: poza("produse/incarcator-wireless"), descriere: "Compatibil cu toate telefoanele cu încărcare Qi." },
    { cheie: "laptop-gaming", nume: "Laptop 15,6\", 16 GB RAM, 1 TB SSD", categorie: "Laptopuri", pret: 4299, pretVechi: 4799, imagine: poza("produse/laptop-gaming"), recomandat: true, descriere: "Ecran de 165 Hz, placă video dedicată, tastatură RGB." },
    { cheie: "telefon-pliabil", nume: "Telefon pliabil, 256 GB, negru", categorie: "Telefoane", pret: 5499, imagine: poza("produse/telefon-pliabil"), recomandat: true, descriere: "Ecran interior de 7,6\", balama fără spațiu." },
    { cheie: "camera-mirrorless", nume: "Cameră foto mirrorless cu obiectiv 18-55 mm", categorie: "Foto și video", pret: 3299, pretVechi: 3699, imagine: poza("produse/camera-mirrorless"), recomandat: true, descriere: "Senzor de 24 MP, filmare 4K, stabilizare." },
    { cheie: "imprimanta-laser", nume: "Imprimantă laser color multifuncțională", categorie: "Imprimante", pret: 1199, imagine: poza("produse/imprimanta-laser"), descriere: "Wi-Fi, imprimare față-verso automată." },
    { cheie: "casti-studio", nume: "Căști de studio over-ear", categorie: "Audio", pret: 549, imagine: poza("produse/casti-studio"), descriere: "Sunet echilibrat, cablu spiralat detașabil." },
    { cheie: "smartwatch-sport", nume: "Smartwatch sport cu GPS", categorie: "Smartwatch", pret: 899, pretVechi: 1049, imagine: poza("produse/smartwatch-sport"), recomandat: true, descriere: "Puls, SpO2, 14 zile de autonomie." },
    { cheie: "consola-portabila", nume: "Consolă de jocuri portabilă", categorie: "Console", pret: 1899, imagine: poza("produse/consola-portabila"), recomandat: true, descriere: "Ecran OLED de 7\", 512 GB." },
    { cheie: "mouse-gaming", nume: "Mouse gaming wireless, 26.000 DPI", categorie: "Accesorii", pret: 349, imagine: poza("produse/mouse-gaming"), descriere: "Senzor optic, șapte butoane programabile." },
    { cheie: "boxa-smart", nume: "Boxă inteligentă cu asistent vocal", categorie: "Audio", pret: 449, pretVechi: 499, imagine: poza("produse/boxa-smart"), descriere: "Sunet 360°, control pentru casa inteligentă." },
  ],
  bannere: [{ imagine: poza("bannere/oferta"), categorie: "Laptopuri" }],
  carduri: [{ titlu: "Camere foto", text: "Până la 30% reducere la mirrorless.", imagine: poza("produse/camera-mirrorless"), categorie: "Foto și video" }, { titlu: "Smartwatch", text: "Modele noi pentru sport și oraș.", imagine: poza("produse/smartwatch-sport"), categorie: "Smartwatch" }],
  placi: [],
  randuri: [
    { cheie: "recomandate", titlu: "Recomandate", produse: ["laptop-gaming", "telefon-pliabil", "camera-mirrorless", "smartwatch-sport", "consola-portabila"] },
    { cheie: "accesorii", titlu: "Audio și accesorii", produse: ["casti-studio", "boxa-smart", "mouse-gaming", "incarcator-wireless", "imprimanta-laser"] },
  ],
};
