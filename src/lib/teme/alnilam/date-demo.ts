import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Alnilam (piese si accesorii auto, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 7). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/alnilam.json`), in `public/teme/alnilam/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/alnilam/${cale}.webp`;

export const MENIU_DEMO_ALNILAM: MenuItem[] = ["Faruri și iluminat", "Accesorii interior", "Jante și anvelope", "Scule și echipamente", "Baterii", "Uleiuri"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ALNILAM: SetDateDemo = {
  categorii: [
    { nume: "Faruri și iluminat", imagine: poza("categorii/faruri"), copii: [] },
    { nume: "Accesorii interior", imagine: poza("categorii/interior"), copii: [] },
    { nume: "Jante și anvelope", imagine: poza("categorii/jante"), copii: [] },
    { nume: "Scule și echipamente", imagine: poza("categorii/scule"), copii: [] },
    { nume: "Siguranță auto", imagine: poza("categorii/siguranta"), copii: [] },
    { nume: "Baterii", imagine: poza("categorii/baterii"), copii: [] },
    { nume: "Uleiuri", imagine: poza("categorii/uleiuri"), copii: [] },
    { nume: "Frâne", imagine: poza("categorii/frane"), copii: [] },
  ],
  produse: [
    { cheie: "placute-frana", nume: "Set plăcuțe de frână față", categorie: "Frâne", pret: 189, pretVechi: 229, imagine: poza("produse/placute-frana"), recomandat: true, descriere: "Compus ceramic, zgomot redus, fără praf negru pe jante." },
    { cheie: "far-led", nume: "Far LED cu lupă, set de două", categorie: "Faruri și iluminat", pret: 899, pretVechi: 1099, imagine: poza("produse/far-led"), recomandat: true, descriere: "Lumină albă de 6000 K, montaj plug and play." },
    { cheie: "husa-volan", nume: "Husă de volan din piele, neagră", categorie: "Accesorii interior", pret: 79, imagine: poza("produse/husa-volan"), descriere: "Piele ecologică perforată, cusătură roșie." },
    { cheie: "janta-aliaj", nume: "Jantă din aliaj 17\", negru lucios", categorie: "Jante și anvelope", pret: 649, imagine: poza("produse/janta-aliaj"), recomandat: true, descriere: "Cinci spițe duble, compatibilă cu majoritatea berlinelor." },
    { cheie: "cheie-dinamometrica", nume: "Cheie dinamometrică, 40-200 Nm", categorie: "Scule și echipamente", pret: 249, pretVechi: 299, imagine: poza("produse/cheie-dinamometrica"), descriere: "Clichet reversibil, cutie de transport inclusă." },
    { cheie: "trusa-prim-ajutor", nume: "Trusă de prim ajutor auto omologată", categorie: "Siguranță auto", pret: 59, imagine: poza("produse/trusa-prim-ajutor"), descriere: "Conformă normelor în vigoare, cutie rigidă." },
    { cheie: "baterie-auto", nume: "Baterie auto 74 Ah, 680 A", categorie: "Baterii", pret: 499, pretVechi: 569, imagine: poza("produse/baterie-auto"), recomandat: true, descriere: "Tehnologie EFB, potrivită pentru start-stop." },
    { cheie: "ulei-motor", nume: "Ulei de motor sintetic 5W-30, 5 l", categorie: "Uleiuri", pret: 219, imagine: poza("produse/ulei-motor"), recomandat: true, descriere: "Pentru motoare pe benzină și diesel, cu filtru de particule." },
    { cheie: "camera-marsarier", nume: "Cameră de marșarier cu ecran 4,3\"", categorie: "Accesorii interior", pret: 289, imagine: poza("produse/camera-marsarier"), descriere: "Vedere nocturnă, linii de ghidaj." },
    { cheie: "redresor-baterie", nume: "Redresor inteligent pentru baterii, 12 V", categorie: "Baterii", pret: 179, pretVechi: 219, imagine: poza("produse/redresor-baterie"), descriere: "Încărcare în trei etape, protecție la scurtcircuit." },
  ],
  bannere: [{ imagine: poza("bannere/montaj"), categorie: "Jante și anvelope" }, { imagine: poza("bannere/lumini"), categorie: "Faruri și iluminat" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "recomandate", titlu: "Produse recomandate", produse: ["far-led", "janta-aliaj", "baterie-auto", "placute-frana", "ulei-motor"] },
    { cheie: "service", titlu: "Pentru service-ul de acasă", produse: ["cheie-dinamometrica", "redresor-baterie", "trusa-prim-ajutor", "husa-volan", "camera-marsarier"] },
  ],
};
