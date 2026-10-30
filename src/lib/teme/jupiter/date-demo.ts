import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  DATELE DEMO ALE TEMEI JUPITER (etapele 16.1 si 20 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Setul LUI (etapa 20, raspunsul „Doar ale tale”): bannerele, pozele celor 12 raioane, sigla si cele 10 produse cu
  numele lor i le-a dat el (29.10.2026). Ordinea raioanelor e numerotarea lui. Preturile, descrierile, subcategoriile,
  randurile, cardurile si placile sunt scrise aici, din materialul lui: n-a dat preturi si nici texte.

  Pozele stau in `public/teme/jupiter/`, facute din ale lui de `scripts/teme/imagini-jupiter.mjs` (redenumite si
  micsorate cat cere locul lor). Adresele sunt RELATIVE: fisierele statice nu trec prin proxy (`EXTENSII_STATICE`), deci
  se vad pe orice gazda (platforma, subdomeniul demo, domeniul propriu al comerciantului care importa datele).

  Le folosesc magazinul demo de pe subdomeniu (`tema-jupiter`) si „Importă datele demo” (etapa 18). Cheile (`cheie`)
  sunt stabile: din ele se face `external_id`, deci un import repetat nu dubleaza nimic.
*/

/** O poza a temei, din `public/teme/jupiter/`. */
function poza(cale: string): string {
  return `/teme/jupiter/${cale}.webp`;
}

/**
 * Meniul magazinului demo (`Tema.setariDemo`): raioanele cu produse, ca bara de navigare sa nu ramana doar cu „Acasa”
 * (etapa 21). `target` = numele categoriei, ca la linkurile bannerelor. Importul nu atinge meniul comerciantului.
 */
export const MENIU_DEMO_JUPITER: MenuItem[] = [
  { id: "demo_toate", type: "home", label: "Toate produsele" },
  ...["Scule și unelte", "Materiale de construcții", "Termice și climatizare", "Sanitare", "Iluminat", "Electrocasnice"]
    .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume })),
];

export const DATE_DEMO_JUPITER: SetDateDemo = {
  categorii: [
    { nume: "Scule și unelte", imagine: poza("categorii/scule-si-unelte"), copii: ["Scule electrice", "Scări", "Depozitare scule"] },
    { nume: "Mobilă", imagine: poza("categorii/mobila"), copii: [] },
    { nume: "Grădină", imagine: poza("categorii/gradina"), copii: [] },
    { nume: "Vopsele și tencuieli", imagine: poza("categorii/vopsele-si-tencuieli"), copii: [] },
    { nume: "Materiale de construcții", imagine: poza("categorii/materiale-de-constructii"), copii: ["Profile pentru gips-carton"] },
    { nume: "Uși și ferestre", imagine: poza("categorii/usi-si-ferestre"), copii: [] },
    { nume: "Gresie și faianță", imagine: poza("categorii/gresie-si-faianta"), copii: [] },
    { nume: "Parchet și covoare", imagine: poza("categorii/parchet-si-covoare"), copii: [] },
    { nume: "Termice și climatizare", imagine: poza("categorii/termice-si-climatizare"), copii: ["Sobe și încălzitoare"] },
    { nume: "Sanitare", imagine: poza("categorii/sanitare"), copii: ["Cabine de duș"] },
    { nume: "Iluminat", imagine: poza("categorii/iluminat"), copii: ["Becuri"] },
    { nume: "Electrocasnice", imagine: poza("categorii/electrocasnice"), copii: ["Aspiratoare și curățenie"] },
  ],

  produse: [
    {
      cheie: "masina-gaurit-erbauer-18v", nume: "Masina de gaurit si insurubat ERBAUER ERI1092COM, 4Ah, 18V",
      categorie: "Scule electrice", pret: 599, pretVechi: 699, imagine: poza("produse/masina-gaurit-erbauer-18v"), recomandat: true,
      descriere: "Mașină de găurit și înșurubat cu acumulator de 18 V și 4 Ah, pentru montaj și reparații în casă și în atelier.",
    },
    {
      cheie: "scara-pliabila-mac-allister", nume: "Scara pliabila MAC ALLISTER, 2.4 m inaltime lucru, 1x3 trepte 38 x 26 cm, albastru-negru",
      categorie: "Scări", pret: 139, pretVechi: 159, imagine: poza("produse/scara-pliabila-mac-allister"),
      descriere: "Scară pliabilă cu trei trepte late, de 38 x 26 cm, și înălțime de lucru de 2,4 m. Se strânge ușor și ocupă puțin loc.",
    },
    {
      cheie: "raft-atelier-goodhome-rivet", nume: "Raft atelier GOODHOME Rivet, metal, 67.5 x 40 x 180 cm, 150 kg/polita, negru",
      categorie: "Depozitare scule", pret: 279, imagine: poza("produse/raft-atelier-goodhome-rivet"),
      descriere: "Raft metalic negru pentru atelier, garaj sau debara, cu polițe care țin până la 150 kg fiecare. Dimensiuni: 67,5 x 40 x 180 cm.",
    },
    {
      cheie: "profil-ud-3m", nume: "Profil UD, 27 x 28 x 27 x 0.60 mm, 3 m",
      categorie: "Profile pentru gips-carton", pret: 9.9, imagine: poza("produse/profil-ud-3m"),
      descriere: "Profil de ghidaj din oțel zincat de 0,60 mm, pentru pereți și plafoane din gips-carton. Prețul e pe bucata de 3 m.",
    },
    {
      cheie: "soba-gaz-reecomer-4kw", nume: "Soba mobila pe gaz GPL pliabila Reecomer ST-G-F, 4kW, 42 x 36 x 73 cm, negru",
      categorie: "Sobe și încălzitoare", pret: 449, imagine: poza("produse/soba-gaz-reecomer-4kw"), recomandat: true,
      descriere: "Sobă pe gaz GPL de 4 kW, pe roți, care se mută ușor dintr-o cameră în alta. Dimensiuni: 42 x 36 x 73 cm.",
    },
    {
      cheie: "cabina-dus-hidromasaj-bamboo", nume: "Cabina dus cu hidromasaj BAMBOO, dreptunghiulara, profil metalic, sticla securizata, 120 x 80 x 225 cm, negru/maro",
      categorie: "Cabine de duș", pret: 3799, pretVechi: 4299, imagine: poza("produse/cabina-dus-hidromasaj-bamboo"), recomandat: true,
      descriere: "Cabină dreptunghiulară cu hidromasaj, sticlă securizată și profil metalic negru, cu accente de lemn. Dimensiuni: 120 x 80 x 225 cm.",
    },
    {
      cheie: "cabina-dus-hidromasaj-2300bis", nume: "Cabina dus hidromasaj 2300BIS, pentagonala, profil aluminiu, sticla securizata, 85 x 85 x 225 cm, crom",
      categorie: "Cabine de duș", pret: 2299, imagine: poza("produse/cabina-dus-hidromasaj-2300bis"),
      descriere: "Cabină pentagonală pentru colțul băii, cu panou de hidromasaj, profil din aluminiu cromat și sticlă securizată. Dimensiuni: 85 x 85 x 225 cm.",
    },
    {
      cheie: "kit-becuri-philips-hue", nume: "Kit 2 becuri LED PHILIPS Hue 8719514291492, 9W (75W), E27, Lumina RGB + Bridge",
      categorie: "Becuri", pret: 549, imagine: poza("produse/kit-becuri-philips-hue"), recomandat: true,
      descriere: "Două becuri LED E27 cu lumină colorată RGB, de 9 W (echivalentul a 75 W), și Bridge-ul care le leagă de telefon.",
    },
    {
      cheie: "aspirator-umed-uscat-mac-allister-20l", nume: "Aspirator umed/uscat MAC ALLISTER MWDV-20 L-A, 20l, 1400W, 78dB, gri-negru",
      categorie: "Aspiratoare și curățenie", pret: 299, pretVechi: 349, imagine: poza("produse/aspirator-umed-uscat-mac-allister-20l"),
      descriere: "Aspiră praful și lichidele, în atelier, în garaj sau după o renovare. Cuvă de 20 l și motor de 1400 W, la 78 dB.",
    },
    {
      cheie: "set-mop-vileda-turbo", nume: "Set galeata cu storcator + mop + maner VILEDA Turbo, rosu-negru",
      categorie: "Aspiratoare și curățenie", pret: 179, pretVechi: 219, imagine: poza("produse/set-mop-vileda-turbo"), recomandat: true,
      descriere: "Găleată cu storcător acționat din pedală, mop din microfibră și mâner, pentru toate tipurile de pardoseală.",
    },
  ],

  bannere: [
    { imagine: poza("bannere/cabine-de-dus"), categorie: "Cabine de duș" },
    { imagine: poza("bannere/scule-si-unelte"), categorie: "Scule și unelte" },
    { imagine: poza("bannere/curatenie"), categorie: "Aspiratoare și curățenie" },
  ],

  carduri: [
    { titlu: "Pregătit de iarnă", text: "Sobe pe gaz și încălzitoare, cu prețuri de sezon.", imagine: poza("carduri/termice-si-climatizare"), categorie: "Termice și climatizare" },
    { titlu: "Construiești sau renovezi?", text: "Profile pentru gips-carton și tot ce trebuie pe șantier.", imagine: poza("carduri/materiale-de-constructii"), categorie: "Materiale de construcții" },
  ],

  randuri: [
    {
      cheie: "oferte", titlu: "Oferte de sezon",
      produse: ["masina-gaurit-erbauer-18v", "cabina-dus-hidromasaj-bamboo", "set-mop-vileda-turbo", "aspirator-umed-uscat-mac-allister-20l", "scara-pliabila-mac-allister"],
    },
    {
      cheie: "populare", titlu: "Alegeri populare",
      produse: ["soba-gaz-reecomer-4kw", "kit-becuri-philips-hue", "cabina-dus-hidromasaj-2300bis", "raft-atelier-goodhome-rivet", "profil-ud-3m"],
    },
  ],

  placi: [
    { titlu: "Scule și unelte", imagine: poza("placi/scule-si-unelte"), categorie: "Scule și unelte" },
    { titlu: "Sanitare", imagine: poza("placi/sanitare"), categorie: "Sanitare" },
    { titlu: "Iluminat", imagine: poza("placi/iluminat"), categorie: "Iluminat" },
    { titlu: "Electrocasnice", imagine: poza("placi/electrocasnice"), categorie: "Electrocasnice" },
  ],
};
