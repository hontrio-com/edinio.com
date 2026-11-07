import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Polaris (incaltaminte si accesorii, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 3). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/polaris.json`), in `public/teme/polaris/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/polaris/${cale}.webp`;

export const MENIU_DEMO_POLARIS: MenuItem[] = ["Ghete", "Sneakers", "Mocasini", "Pantofi cu toc", "Botine", "Sandale"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_POLARIS: SetDateDemo = {
  categorii: [
    { nume: "Ghete", imagine: poza("categorii/ghete"), copii: [] },
    { nume: "Sneakers", imagine: poza("categorii/sneakers"), copii: [] },
    { nume: "Mocasini", imagine: poza("categorii/mocasini"), copii: [] },
    { nume: "Pantofi cu toc", imagine: poza("categorii/pantofi-toc"), copii: [] },
    { nume: "Botine", imagine: poza("categorii/botine"), copii: [] },
    { nume: "Sandale", imagine: poza("categorii/sandale"), copii: [] },
    { nume: "Bocanci", imagine: poza("categorii/bocanci"), copii: [] },
    { nume: "Pantofi sport", imagine: poza("categorii/pantofi-sport"), copii: [] },
  ],
  produse: [
    { cheie: "geanta-tote", nume: "Geantă tote din piele, coniac", categorie: "Botine", pret: 549, pretVechi: 649, imagine: poza("produse/geanta-tote"), recomandat: true, descriere: "Piele naturală, încape un laptop de 14 inci." },
    { cheie: "pantofi-derby", nume: "Pantofi derby din piele, maro închis", categorie: "Mocasini", pret: 449, imagine: poza("produse/pantofi-derby"), recomandat: true, descriere: "Piele netedă, talpă de cauciuc cusută, branț moale." },
    { cheie: "sneakers-piele-intoarsa", nume: "Sneakers din piele întoarsă, bej", categorie: "Sneakers", pret: 389, pretVechi: 459, imagine: poza("produse/sneakers-piele-intoarsa"), descriere: "Piele întoarsă, talpă albă, șireturi plate." },
    { cheie: "mocasini-catifea", nume: "Mocasini din catifea, bordo", categorie: "Mocasini", pret: 329, imagine: poza("produse/mocasini-catifea"), descriere: "Catifea, căptușeală din piele, toc de 1 cm." },
    { cheie: "stiletto-lac", nume: "Pantofi stiletto din lac, negri", categorie: "Pantofi cu toc", pret: 359, imagine: poza("produse/stiletto-lac"), recomandat: true, descriere: "Toc de 10 cm, vârf ascuțit, branț capitonat." },
    { cheie: "cizme-inalte", nume: "Cizme înalte până la genunchi, negre", categorie: "Botine", pret: 649, pretVechi: 749, imagine: poza("produse/cizme-inalte"), recomandat: true, descriere: "Piele naturală, fermoar interior, toc de 4 cm." },
    { cheie: "sandale-platforma", nume: "Sandale cu platformă, albe", categorie: "Sandale", pret: 249, imagine: poza("produse/sandale-platforma"), descriere: "Platformă ușoară, barete reglabile." },
    { cheie: "bocanci-drumetie", nume: "Bocanci de drumeție impermeabili, oliv", categorie: "Bocanci", pret: 499, imagine: poza("produse/bocanci-drumetie"), recomandat: true, descriere: "Membrană impermeabilă, talpă cu aderență mare." },
    { cheie: "curea-piele", nume: "Curea din piele, maro", categorie: "Mocasini", pret: 129, imagine: poza("produse/curea-piele"), descriere: "Piele groasă, cataramă din alamă." },
    { cheie: "geanta-crossbody", nume: "Geantă crossbody din piele, neagră", categorie: "Botine", pret: 299, imagine: poza("produse/geanta-crossbody"), descriere: "Mică, cu baretă reglabilă și buzunar interior." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Ghete" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți de toamnă", produse: ["cizme-inalte", "pantofi-derby", "bocanci-drumetie", "stiletto-lac", "geanta-tote"] },
    { cheie: "favorite", titlu: "Favoritele clienților", produse: ["sneakers-piele-intoarsa", "mocasini-catifea", "sandale-platforma", "curea-piele", "geanta-crossbody"] },
  ],
};
