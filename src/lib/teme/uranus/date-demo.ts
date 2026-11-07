import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Uranus (piese auto, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 2). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/uranus.json`), in `public/teme/uranus/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/uranus/${cale}.webp`;

export const MENIU_DEMO_URANUS: MenuItem[] = ["Piese motor", "Uleiuri", "Baterii", "Frânare", "Filtre", "Scule"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_URANUS: SetDateDemo = {
  categorii: [
    { nume: "Piese motor", imagine: poza("categorii/piese-motor"), copii: [] },
    { nume: "Uleiuri", imagine: poza("categorii/uleiuri"), copii: [] },
    { nume: "Baterii", imagine: poza("categorii/baterii"), copii: [] },
    { nume: "Frânare", imagine: poza("categorii/franare"), copii: [] },
    { nume: "Filtre", imagine: poza("categorii/filtre"), copii: [] },
    { nume: "Ștergătoare", imagine: poza("categorii/stergatoare"), copii: [] },
    { nume: "Iluminat auto", imagine: poza("categorii/iluminat-auto"), copii: [] },
    { nume: "Scule", imagine: poza("categorii/scule"), copii: [] },
  ],
  produse: [
    { cheie: "cric-hidraulic", nume: "Cric hidraulic tip crocodil, 2 tone", categorie: "Scule", pret: 329, pretVechi: 389, imagine: poza("produse/cric-hidraulic"), recomandat: true, descriere: "Ridicare rapidă, roți mari și supapă de siguranță." },
    { cheie: "bujie-iridium", nume: "Bujie cu electrod de iridiu", categorie: "Piese motor", pret: 59, pretVechi: 69, imagine: poza("produse/bujie-iridium"), recomandat: true, descriere: "Pornire sigură pe frig și o durată de viață de până la 100.000 km." },
    { cheie: "ulei-5l", nume: "Ulei de motor 5W-30, sintetic, 5 l", categorie: "Uleiuri", pret: 219, pretVechi: 259, imagine: poza("produse/ulei-5l"), recomandat: true, descriere: "Pentru motoare pe benzină și diesel, cu protecție la pornirea la rece." },
    { cheie: "baterie-74ah", nume: "Baterie auto 12 V, 74 Ah, 680 A", categorie: "Baterii", pret: 449, imagine: poza("produse/baterie-74ah"), recomandat: true, descriere: "Fără întreținere, potrivită pentru majoritatea autoturismelor compacte și medii." },
    { cheie: "placute-frana", nume: "Set plăcuțe de frână, punte față", categorie: "Frânare", pret: 149, pretVechi: 179, imagine: poza("produse/placute-frana"), descriere: "Frânare silențioasă și uzură redusă a discurilor." },
    { cheie: "filtru-ulei", nume: "Filtru de ulei", categorie: "Filtre", pret: 39, imagine: poza("produse/filtru-ulei"), descriere: "Reține impuritățile și protejează motorul între schimburi." },
    { cheie: "filtru-polen", nume: "Filtru de polen cu cărbune activ", categorie: "Filtre", pret: 69, imagine: poza("produse/filtru-polen"), descriere: "Aer curat în habitaclu, fără mirosuri și praf." },
    { cheie: "redresor", nume: "Redresor auto inteligent 12 V", categorie: "Scule", pret: 259, imagine: poza("produse/redresor"), recomandat: true, descriere: "Încarcă și întreține bateria, cu protecție la inversarea polarității." },
    { cheie: "manometru", nume: "Manometru digital pentru presiunea în pneuri", categorie: "Scule", pret: 79, imagine: poza("produse/manometru"), descriere: "Citire precisă, ecran luminat, oprire automată." },
    { cheie: "antigel", nume: "Antigel concentrat, roz, 1,5 l", categorie: "Uleiuri", pret: 45, imagine: poza("produse/antigel"), descriere: "Protecție la îngheț și la coroziune pentru tot sistemul de răcire." },
  ],
  bannere: [{ imagine: poza("bannere/piese"), categorie: "Piese motor" }, { imagine: poza("bannere/revizie"), categorie: "Uleiuri" }],
  carduri: [{ titlu: "Revizia de toamnă", text: "Ulei, filtre și antigel cu până la 20% reducere.", imagine: poza("produse/ulei-5l"), categorie: "Uleiuri" }, { titlu: "Baterii pentru iarnă", text: "Porniri sigure pe ger, cu montaj gratuit.", imagine: poza("produse/baterie-74ah"), categorie: "Baterii" }],
  placi: [{ titlu: "Frânare", imagine: poza("categorii/franare"), categorie: "Frânare" }, { titlu: "Filtre", imagine: poza("categorii/filtre"), categorie: "Filtre" }, { titlu: "Iluminat auto", imagine: poza("categorii/iluminat-auto"), categorie: "Iluminat auto" }, { titlu: "Scule", imagine: poza("categorii/scule"), categorie: "Scule" }],
  randuri: [
    { cheie: "oferte", titlu: "Oferte de sezon", produse: ["ulei-5l", "bujie-iridium", "placute-frana", "cric-hidraulic", "baterie-74ah"] },
    { cheie: "populare", titlu: "Cele mai căutate", produse: ["filtru-ulei", "redresor", "manometru", "antigel", "filtru-polen"] },
  ],
};
