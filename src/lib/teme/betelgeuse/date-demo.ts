import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Betelgeuse (parfumerie si cosmetice de lux, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 6). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/betelgeuse.json`), in `public/teme/betelgeuse/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/betelgeuse/${cale}.webp`;

export const MENIU_DEMO_BETELGEUSE: MenuItem[] = ["Parfumuri", "Machiaj", "Îngrijire", "Păr", "Bărbați", "Cadouri"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_BETELGEUSE: SetDateDemo = {
  categorii: [
    { nume: "Parfumuri", imagine: poza("categorii/parfumuri"), copii: [] },
    { nume: "Machiaj", imagine: poza("categorii/machiaj"), copii: [] },
    { nume: "Îngrijire", imagine: poza("categorii/ingrijire"), copii: [] },
    { nume: "Păr", imagine: poza("categorii/par"), copii: [] },
    { nume: "Bărbați", imagine: poza("categorii/barbati"), copii: [] },
    { nume: "Corp și baie", imagine: poza("categorii/corp"), copii: [] },
    { nume: "Lumânări", imagine: poza("categorii/lumanari"), copii: [] },
    { nume: "Cadouri", imagine: poza("categorii/cadouri"), copii: [] },
  ],
  produse: [
    { cheie: "parfum-cristal", nume: "Apă de parfum florală, 90 ml", categorie: "Parfumuri", pret: 549, pretVechi: 649, imagine: poza("produse/parfum-cristal"), recomandat: true, descriere: "Note de iasomie, pară și mosc. Flacon din sticlă fațetată." },
    { cheie: "parfum-ambra", nume: "Apă de parfum pentru bărbați, ambră și vanilie, 100 ml", categorie: "Bărbați", pret: 489, imagine: poza("produse/parfum-ambra"), recomandat: true, descriere: "Bergamotă, vanilie de Madagascar și lemn ars." },
    { cheie: "ser-noapte", nume: "Ser regenerant de noapte, 30 ml", categorie: "Îngrijire", pret: 349, imagine: poza("produse/ser-noapte"), recomandat: true, descriere: "Retinol încapsulat și peptide, pentru un ten odihnit." },
    { cheie: "ruj-satinat", nume: "Ruj satinat, nuanța trandafir", categorie: "Machiaj", pret: 159, pretVechi: 189, imagine: poza("produse/ruj-satinat"), descriere: "Pigment intens, hidratare 8 ore." },
    { cheie: "ulei-par", nume: "Ulei prețios pentru păr, 50 ml", categorie: "Păr", pret: 179, imagine: poza("produse/ulei-par"), descriere: "Strălucire fără greutate, protecție termică." },
    { cheie: "gel-dus-lux", nume: "Gel de duș parfumat, 200 ml", categorie: "Corp și baie", pret: 99, imagine: poza("produse/gel-dus-lux"), descriere: "Spumă fină, parfum de flori albe." },
    { cheie: "lumanare-parfumata", nume: "Lumânare parfumată în pahar de sticlă", categorie: "Lumânări", pret: 219, pretVechi: 259, imagine: poza("produse/lumanare-parfumata"), recomandat: true, descriere: "Ceară vegetală, 50 de ore de ardere, smochin și cedru." },
    { cheie: "set-cadou", nume: "Set cadou: parfum 50 ml și loțiune de corp", categorie: "Cadouri", pret: 459, pretVechi: 539, imagine: poza("produse/set-cadou"), recomandat: true, descriere: "Ambalat într-o cutie elegantă, cu panglică." },
    { cheie: "crema-ochi", nume: "Cremă pentru conturul ochilor, 15 ml", categorie: "Îngrijire", pret: 229, imagine: poza("produse/crema-ochi"), descriere: "Reduce cearcănele și liniile fine." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Parfumuri" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți în parfumerie", produse: ["parfum-cristal", "parfum-ambra", "set-cadou", "lumanare-parfumata", "ser-noapte"] },
    { cheie: "ingrijire", titlu: "Ritualuri de îngrijire", produse: ["crema-ochi", "ruj-satinat", "ulei-par", "gel-dus-lux", "parfum-cristal"] },
  ],
};
