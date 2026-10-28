import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  DATELE DEMO ALE TEMEI JUPITER (etapa 16.1 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Un magazin de bricolaj, casa si gradina, ca pe dedeman.ro, dar cu continut PROPRIU: numele, textele, preturile si
  brandurile sunt scrise aici, iar pozele sunt de pe Unsplash (licenta libera, legate ca in baza demo). Nimic nu e luat
  de la Dedeman (decizia 6 din plan).

  Le folosesc magazinul demo de pe subdomeniu (`tema-jupiter`) si „Importă datele demo” (etapa 18). Cheile (`cheie`)
  sunt stabile: din ele se face `external_id`, deci un import repetat nu dubleaza nimic.
*/

/** O poza Unsplash, la latimea ceruta. */
function poza(id: string, latime = 800): string {
  return `https://images.unsplash.com/${id}?w=${latime}&q=80&auto=format&fit=crop`;
}

export const DATE_DEMO_JUPITER: SetDateDemo = {
  categorii: [
    {
      nume: "Scule și unelte", imagine: poza("photo-1426927308491-6380b6a9936f", 400),
      copii: ["Scule electrice", "Scule de mână", "Depozitare scule"],
    },
    {
      nume: "Vopsele și tencuieli", imagine: poza("photo-1525909002-1b05e0c869d8", 400),
      copii: ["Vopsele", "Pensule și role"],
    },
    {
      nume: "Mobilă", imagine: poza("photo-1634497885778-152eb6fd543d", 400),
      copii: ["Canapele și fotolii", "Mese și scaune", "Dulapuri"],
    },
    {
      nume: "Grădină", imagine: poza("photo-1601654253194-260e0b6984f9", 400),
      copii: ["Mobilier de grădină", "Unelte de grădină", "Ghivece și plante"],
    },
    {
      nume: "Construcții", imagine: poza("photo-1520758594221-872948699332", 400),
      copii: ["Zidărie", "Scări"],
    },
    {
      nume: "Uși și ferestre", imagine: poza("photo-1542354642-233af003db87", 400),
      copii: ["Uși de interior", "Clanțe și accesorii"],
    },
    {
      nume: "Parchet și covoare", imagine: poza("photo-1611072337226-1140ab367200", 400),
      copii: ["Parchet laminat", "Covoare"],
    },
    {
      nume: "Gresie și faianță", imagine: poza("photo-1580398562556-d33329a0f29b", 400),
      copii: ["Gresie", "Faianță"],
    },
    {
      nume: "Termice și climatizare", imagine: poza("photo-1518276779712-dfdcb9daa7a1", 400),
      copii: ["Calorifere", "Aer condiționat"],
    },
    {
      nume: "Sanitare", imagine: poza("photo-1629079447777-1e605162dc8d", 400),
      copii: ["Baterii", "Lavoare"],
    },
    {
      nume: "Electrocasnice", imagine: poza("photo-1626806787461-102c1bfaaea1", 400),
      copii: ["Electrocasnice mari", "Electrocasnice mici"],
    },
    {
      nume: "Iluminat", imagine: poza("photo-1565814329452-e1efa11c5b89", 400),
      copii: ["Lustre și pendule", "Becuri"],
    },
  ],

  produse: [
    // Scule și unelte
    { cheie: "masina-gaurit-18v", nume: "Mașină de găurit și înșurubat cu acumulator, 18 V, 2 acumulatori", categorie: "Scule electrice", pret: 449.9, pretVechi: 529, imagine: poza("photo-1622044939413-0b829c342434"), recomandat: true, descriere: "Două viteze, cuplu de 45 Nm și mandrină rapidă de 13 mm. Vine cu doi acumulatori de 2 Ah, încărcător și valiză." },
    { cheie: "polizor-125", nume: "Polizor unghiular 125 mm, 900 W", categorie: "Scule electrice", pret: 219.9, pretVechi: 259.9, imagine: poza("photo-1564182872950-978e194a05cd"), descriere: "Pentru tăiat și șlefuit metal, piatră și ceramică. Mâner lateral în două poziții și apărătoare reglabilă." },
    { cheie: "masina-gaurit-percutie", nume: "Mașină de găurit cu percuție, 750 W", categorie: "Scule electrice", pret: 189, imagine: poza("photo-1504148455328-c376907d081c"), descriere: "Găurește în lemn, metal și beton. Turație reglabilă și opritor de adâncime." },
    { cheie: "set-burghie-35", nume: "Set de burghie și biți, 35 de piese", categorie: "Scule electrice", pret: 79.9, imagine: poza("photo-1606676539940-12768ce0e762"), descriere: "Burghie pentru lemn, metal și zidărie, plus biți de înșurubat, într-o cutie cu compartimente." },
    { cheie: "ciocan-tamplarie", nume: "Ciocan de tâmplărie 500 g, coadă din fibră", categorie: "Scule de mână", pret: 39.9, imagine: poza("photo-1586864387789-628af9feed72"), descriere: "Cap din oțel forjat și coadă din fibră de sticlă care absoarbe vibrațiile." },
    { cheie: "set-surubelnite-12", nume: "Set de șurubelnițe, 12 piese", categorie: "Scule de mână", pret: 54.9, pretVechi: 69.9, imagine: poza("photo-1581166397057-235af2b3c6dd"), recomandat: true, descriere: "Vârfuri plate, în cruce și Torx, cu mânere ergonomice și suport de perete." },
    { cheie: "ciocan-gheara", nume: "Ciocan cu gheară, mâner din lemn", categorie: "Scule de mână", pret: 29.9, imagine: poza("photo-1575908393823-8e6ee16403d8"), descriere: "Clasic, pentru bătut și scos cuie. Mâner din lemn de frasin." },
    { cheie: "trusa-scule-108", nume: "Trusă de scule cu 108 piese, în valiză", categorie: "Depozitare scule", pret: 249, pretVechi: 299, imagine: poza("photo-1558906050-d6d6aa390fd3"), recomandat: true, descriere: "Chei tubulare, clești, șurubelnițe și ruletă, așezate în valiză rigidă cu închidere metalică." },
    { cheie: "panou-perforat", nume: "Panou perforat pentru scule, 120 x 60 cm", categorie: "Depozitare scule", pret: 119.9, imagine: poza("photo-1731694411560-050e5b91e943"), descriere: "Se prinde pe perete și ține sculele la vedere, cu 20 de cârlige incluse." },
    { cheie: "cutie-scule-metal", nume: "Cutie de scule metalică, cu 3 sertare", categorie: "Depozitare scule", pret: 159, imagine: poza("photo-1773425350177-af4d2249d641"), descriere: "Oțel vopsit în câmp electrostatic, sertare pe ghidaje și loc pentru lacăt." },

    // Vopsele și tencuieli
    { cheie: "lavabila-alba-15l", nume: "Vopsea lavabilă albă pentru interior, 15 L", categorie: "Vopsele", pret: 189.9, pretVechi: 219.9, imagine: poza("photo-1585676737728-432f58d5fdba"), recomandat: true, descriere: "Acoperire foarte bună din două straturi, se spală ușor și nu are miros puternic. Randament de 12 mp/L." },
    { cheie: "set-vopsele-acrilice", nume: "Set de vopsele acrilice colorate, 4 x 2,5 L", categorie: "Vopsele", pret: 229, imagine: poza("photo-1535673774336-ef95d2851cf3"), descriere: "Patru nuanțe care se pot amesteca între ele, pentru pereți și lemn." },
    { cheie: "vopsea-exterior-rosie", nume: "Vopsea roșie pentru exterior, 2,5 L", categorie: "Vopsele", pret: 89.9, imagine: poza("photo-1776083760472-58f78647572a"), descriere: "Rezistă la ploaie și la soare, pentru garduri, porți și fațade." },
    { cheie: "set-role-4", nume: "Set de role pentru zugrăvit, 4 bucăți", categorie: "Pensule și role", pret: 49.9, imagine: poza("photo-1525909002-1b05e0c869d8"), descriere: "Role de 18 cm cu fir mediu, pentru suprafețe netede și ușor texturate." },
    { cheie: "set-pensule-5", nume: "Set de pensule profesionale, 5 bucăți", categorie: "Pensule și role", pret: 34.9, imagine: poza("photo-1513364776144-60967b0f800f"), descriere: "Fir sintetic care nu lasă urme, de la 20 la 80 mm." },
    { cheie: "trafalet-telescopic", nume: "Trafalet cu mâner telescopic, 25 cm", categorie: "Pensule și role", pret: 39.9, imagine: poza("photo-1516962080544-eac695c93791"), descriere: "Mâner care se lungește până la 2 m, pentru tavane fără scară." },

    // Mobilă
    { cheie: "canapea-3-locuri", nume: "Canapea extensibilă cu 3 locuri, gri", categorie: "Canapele și fotolii", pret: 1899, pretVechi: 2199, imagine: poza("photo-1698936061086-2bf99c7b9fc5"), recomandat: true, descriere: "Se face pat în câteva secunde și are ladă de depozitare. Stofă rezistentă la frecare." },
    { cheie: "fotoliu-galben", nume: "Fotoliu tapițat cu picioare din lemn, galben", categorie: "Canapele și fotolii", pret: 649, imagine: poza("photo-1586023492125-27b2c045efd7"), descriere: "Linii simple, șezut ferm și picioare din fag masiv." },
    { cheie: "fotoliu-piele-alb", nume: "Fotoliu din piele ecologică, alb", categorie: "Canapele și fotolii", pret: 899, pretVechi: 999, imagine: poza("photo-1567538096630-e0c55bd6374c"), descriere: "Capitonaj clasic și spătar înalt, ușor de curățat." },
    { cheie: "set-dining-6", nume: "Set masă de dining cu 6 scaune, lemn", categorie: "Mese și scaune", pret: 2499, imagine: poza("photo-1758977404039-6e834be8eca8"), descriere: "Masă de 180 cm din lemn și șase scaune tapițate." },
    { cheie: "masa-extensibila", nume: "Masă extensibilă din lemn masiv", categorie: "Mese și scaune", pret: 1290, pretVechi: 1490, imagine: poza("photo-1604578762246-41134e37f9cc"), descriere: "Se lungește de la 140 la 200 cm, pentru mesele cu musafiri." },
    { cheie: "dulap-2-usi", nume: "Dulap cu 2 uși, stejar", categorie: "Dulapuri", pret: 989, imagine: poza("photo-1558997519-83ea9252edf8"), descriere: "Bară de haine, două rafturi și balamale cu închidere lentă." },

    // Grădină
    { cheie: "set-gradina-lemn", nume: "Set mobilier de grădină din lemn, masă și 4 scaune", categorie: "Mobilier de grădină", pret: 1599, pretVechi: 1899, imagine: poza("photo-1621506821957-1b50ab7787a4"), recomandat: true, descriere: "Lemn de acacia tratat pentru exterior, cu scaune pliabile." },
    { cheie: "set-terasa-umbrela", nume: "Set de terasă cu umbrelă, 6 persoane", categorie: "Mobilier de grădină", pret: 2190, imagine: poza("photo-1769502963760-ea942f2d1fe7"), descriere: "Masă rotundă, șase scaune și umbrelă de 3 m cu manivelă." },
    { cheie: "masina-tuns-iarba", nume: "Mașină de tuns iarba electrică, 1800 W", categorie: "Unelte de grădină", pret: 899, pretVechi: 1049, imagine: poza("photo-1458245201577-fc8a130b8829"), recomandat: true, descriere: "Lățime de tăiere de 42 cm, cinci înălțimi și sac de 50 L." },
    { cheie: "foarfeca-gradina", nume: "Foarfecă de grădină cu mănuși", categorie: "Unelte de grădină", pret: 59.9, imagine: poza("photo-1523301551780-cd17359a95d0"), descriere: "Lame din oțel călit pentru crengi de până la 20 mm, plus o pereche de mănuși." },
    { cheie: "furtun-25m", nume: "Furtun de grădină 25 m, cu pistol de stropit", categorie: "Unelte de grădină", pret: 89.9, imagine: poza("photo-1588501985911-6932ea666801"), descriere: "Furtun cu inserție textilă care nu se îndoaie, cu pistol cu 7 jeturi." },
    { cheie: "roaba-85l", nume: "Roabă de grădină, 85 L", categorie: "Unelte de grădină", pret: 249, imagine: poza("photo-1621272156568-7306716648df"), descriere: "Cuvă din oțel galvanizat și roată pneumatică." },
    { cheie: "ghiveci-ceramica-flori", nume: "Ghiveci din ceramică cu flori de sezon", categorie: "Ghivece și plante", pret: 69.9, imagine: poza("photo-1585533337541-1549f1274711"), descriere: "Flori de sezon într-un ghiveci de lut ars, gata de pus pe terasă." },
    { cheie: "ghiveci-suculenta", nume: "Ghiveci decorativ turcoaz, cu plantă suculentă", categorie: "Ghivece și plante", pret: 49.9, imagine: poza("photo-1485955900006-10f4d324d411"), descriere: "Plantă suculentă care cere puțină apă, într-un ghiveci glazurat." },

    // Construcții
    { cheie: "caramida-plina", nume: "Cărămidă plină, 240 x 115 x 63 mm", categorie: "Zidărie", pret: 2.49, imagine: poza("photo-1520758594221-872948699332"), descriere: "Pentru ziduri portante, fundații și sobe. Prețul e pe bucată." },
    { cheie: "bloc-ceramic", nume: "Bloc ceramic pentru zidărie, 25 cm", categorie: "Zidărie", pret: 7.9, imagine: poza("photo-1495578942200-c5f5d2137def"), descriere: "Izolează termic și fonic, se zidește rapid. Prețul e pe bucată." },
    { cheie: "scara-aluminiu", nume: "Scară din aluminiu cu 3 tronsoane, 3 x 9 trepte", categorie: "Scări", pret: 549, pretVechi: 629, imagine: poza("photo-1635082627989-dcd12a107364"), recomandat: true, descriere: "Se folosește ca scară dublă, simplă sau culisantă, până la 5,9 m." },
    { cheie: "scara-lemn", nume: "Scară din lemn, 7 trepte", categorie: "Scări", pret: 189, imagine: poza("photo-1556009756-5a06dce4729d"), descriere: "Scară dublă din lemn de brad, pentru casă și atelier." },

    // Uși și ferestre
    { cheie: "usa-lemn-80", nume: "Ușă de interior din lemn, 80 cm", categorie: "Uși de interior", pret: 699, pretVechi: 799, imagine: poza("photo-1542354642-233af003db87"), descriere: "Foaie de ușă din lemn stratificat, gata de montat, cu balamale incluse." },
    { cheie: "usa-alba-toc", nume: "Ușă albă de interior, cu toc reglabil", categorie: "Uși de interior", pret: 549, imagine: poza("photo-1677457836930-3af51eb6e9a5"), descriere: "Toc reglabil pentru pereți de 10 până la 14 cm și garnitură de cauciuc." },
    { cheie: "clanta-inox", nume: "Clanță cu rozetă, inox satinat", categorie: "Clanțe și accesorii", pret: 79.9, imagine: poza("photo-1583691028182-e8f01e74bfa2"), descriere: "Mecanism cu arc de revenire și rozete pentru cheie și buton." },
    { cheie: "clanta-aurie", nume: "Clanță aurie pentru ușă de interior", categorie: "Clanțe și accesorii", pret: 99.9, imagine: poza("photo-1607710533910-d7cdffd9e593"), descriere: "Finisaj auriu periat, potrivită pentru uși din lemn." },

    // Parchet și covoare
    { cheie: "parchet-stejar", nume: "Parchet laminat stejar deschis, 8 mm, 2,22 mp", categorie: "Parchet laminat", pret: 89.9, pretVechi: 104.9, imagine: poza("photo-1611072337226-1140ab367200"), recomandat: true, descriere: "Clasa de trafic 32, montaj cu click, fără adeziv. Prețul e pe pachet." },
    { cheie: "covor-persan", nume: "Covor persan cu model geometric, 160 x 230 cm", categorie: "Covoare", pret: 449, imagine: poza("photo-1660394585016-508f949df960"), descriere: "Model tradițional, fir des și margini cusute." },
    { cheie: "covor-dungi", nume: "Covor cu dungi, 120 x 170 cm", categorie: "Covoare", pret: 199, imagine: poza("photo-1762356317094-5826049a3641"), descriere: "Fir scurt, ușor de aspirat, pentru living și dormitor." },

    // Gresie și faianță
    { cheie: "gresie-gri-60", nume: "Gresie porțelanată gri, 60 x 60 cm", categorie: "Gresie", pret: 59.9, imagine: poza("photo-1580398562556-d33329a0f29b"), descriere: "Rezistentă la îngheț și la uzură, pentru interior și terasă. Prețul e pe mp." },
    { cheie: "faianta-salvie", nume: "Faianță decorativă verde salvie, 20 x 20 cm", categorie: "Faianță", pret: 74.9, imagine: poza("photo-1523350165414-082d792c4bcc"), descriere: "Glazură mată pentru baie și bucătărie. Prețul e pe mp." },
    { cheie: "faianta-florala", nume: "Faianță cu model floral albastru", categorie: "Faianță", pret: 89.9, imagine: poza("photo-1771843471340-7387d7d903ce"), descriere: "Model pictat, de pus în benzi decorative sau pe un perete întreg. Prețul e pe mp." },

    // Termice și climatizare
    { cheie: "calorifer-otel", nume: "Calorifer din oțel, 600 x 1000 mm", categorie: "Calorifere", pret: 289, pretVechi: 329, imagine: poza("photo-1518276779712-dfdcb9daa7a1"), recomandat: true, descriere: "Putere termică de 1600 W, cu dopuri și console de prindere incluse." },
    { cheie: "calorifer-aluminiu", nume: "Calorifer din aluminiu, 10 elemente", categorie: "Calorifere", pret: 399, imagine: poza("photo-1669725341213-7379ff6c90d5"), descriere: "Se încălzește repede și se poate lungi cu elemente în plus." },
    { cheie: "aer-conditionat-12000", nume: "Aparat de aer condiționat 12000 BTU, inverter", categorie: "Aer condiționat", pret: 1899, pretVechi: 2149, imagine: poza("photo-1718203862467-c33159fdc504"), descriere: "Răcește și încălzește, cu Wi-Fi și filtru antibacterian. Clasa A++." },

    // Sanitare
    { cheie: "baterie-bucatarie", nume: "Baterie de bucătărie cu duș extractibil", categorie: "Baterii", pret: 249, pretVechi: 289, imagine: poza("photo-1629078692818-c5a0443f4ae3"), descriere: "Cartuș ceramic, două jeturi și furtun extractibil de 1,5 m." },
    { cheie: "lavoar-oglinda", nume: "Lavoar din ceramică cu oglindă", categorie: "Lavoare", pret: 459, imagine: poza("photo-1629079447777-1e605162dc8d"), descriere: "Lavoar de 60 cm cu oglindă asortată, gata de montat." },
    { cheie: "baterie-lavoar-aurie", nume: "Baterie lavoar din alamă, finisaj auriu", categorie: "Baterii", pret: 329, imagine: poza("photo-1771681744660-d3ff70bc24a2"), descriere: "Alamă masivă cu finisaj auriu periat și ventil de scurgere inclus." },

    // Electrocasnice
    { cheie: "masina-spalat-8kg", nume: "Mașină de spălat rufe 8 kg, clasa A", categorie: "Electrocasnice mari", pret: 1599, pretVechi: 1899, imagine: poza("photo-1626806787461-102c1bfaaea1"), recomandat: true, descriere: "1400 de rotații pe minut, 15 programe și motor silențios." },
    { cheie: "frigider-3-usi", nume: "Frigider cu 3 uși, inox", categorie: "Electrocasnice mari", pret: 3299, imagine: poza("photo-1484154218962-a197022b5858"), descriere: "Total No Frost, 520 L și dozator de apă rece." },
    { cheie: "espressor-automat", nume: "Espressor automat cu râșniță", categorie: "Electrocasnice mici", pret: 1299, pretVechi: 1499, imagine: poza("photo-1620807773206-49c1f2957417"), descriere: "Macină boabele pentru fiecare ceașcă, cu spumare automată a laptelui." },
    { cheie: "aspirator-vertical", nume: "Aspirator vertical fără sac", categorie: "Electrocasnice mici", pret: 549, imagine: poza("photo-1722710070534-e31f0290d8de"), descriere: "Fără fir, 45 de minute de autonomie și perie pentru parchet." },

    // Iluminat
    { cheie: "pendul-alb", nume: "Pendul cu abajur alb, Ø 30 cm", categorie: "Lustre și pendule", pret: 149, imagine: poza("photo-1513506003901-1e6a229e2d15"), descriere: "Abajur metalic vopsit mat, cablu textil reglabil." },
    { cheie: "set-pendule-negre", nume: "Set de 3 pendule negre pentru bucătărie", categorie: "Lustre și pendule", pret: 389, pretVechi: 449, imagine: poza("photo-1592622515232-6e3e2a0d3d9a"), descriere: "Trei corpuri pe o singură bară, pentru insula de bucătărie." },
    { cheie: "bec-filament", nume: "Bec LED cu filament, E27, 6 W", categorie: "Becuri", pret: 19.9, imagine: poza("photo-1573621622238-f7ac6ac0429a"), descriere: "Lumină caldă de 2700 K, echivalentul unui bec clasic de 60 W." },
    { cheie: "lustra-industriala", nume: "Lustră cu 3 brațe, stil industrial", categorie: "Lustre și pendule", pret: 279, imagine: poza("photo-1540932239986-30128078f3c5"), descriere: "Metal negru și becuri aparente, pentru living și sufragerie." },
  ],

  bannere: [
    { imagine: poza("photo-1618221195710-dd6b41faaea6", 1600), categorie: "Mobilă" },
    { imagine: poza("photo-1426927308491-6380b6a9936f", 1600), categorie: "Scule și unelte" },
    { imagine: poza("photo-1719324923613-ff0884b031ed", 1600), categorie: "Grădină" },
    { imagine: poza("photo-1584622650111-993a426fbf0a", 1600), categorie: "Sanitare" },
  ],

  carduri: [
    { titlu: "Renovezi casa?", text: "Tot ce-ți trebuie pentru renovare, de la vopsea la scule, într-un singur loc.", imagine: poza("photo-1768839725085-829e6ac7ac26", 500), categorie: "Vopsele și tencuieli" },
    { titlu: "Pregătit de iarnă", text: "Calorifere și aparate de aer condiționat cu prețuri de sezon.", imagine: poza("photo-1518276779712-dfdcb9daa7a1", 500), categorie: "Termice și climatizare" },
  ],

  randuri: [
    {
      cheie: "oferte", titlu: "Oferte de sezon",
      produse: ["calorifer-otel", "aer-conditionat-12000", "masina-gaurit-18v", "lavabila-alba-15l", "canapea-3-locuri", "masina-tuns-iarba", "scara-aluminiu", "masina-spalat-8kg", "parchet-stejar", "set-gradina-lemn", "espressor-automat", "baterie-bucatarie"],
    },
    {
      cheie: "populare", titlu: "Alegeri populare",
      produse: ["ciocan-tamplarie", "set-role-4", "ghiveci-ceramica-flori", "furtun-25m", "bec-filament", "clanta-inox", "covor-dungi", "gresie-gri-60", "pendul-alb", "aspirator-vertical", "lavoar-oglinda", "cutie-scule-metal"],
    },
  ],

  placi: [
    { titlu: "Calorifere", imagine: poza("photo-1669725341213-7379ff6c90d5", 600), categorie: "Calorifere" },
    { titlu: "Unelte de grădină", imagine: poza("photo-1621272156568-7306716648df", 600), categorie: "Unelte de grădină" },
    { titlu: "Scule electrice", imagine: poza("photo-1622044939413-0b829c342434", 600), categorie: "Scule electrice" },
    { titlu: "Iluminat", imagine: poza("photo-1565814329452-e1efa11c5b89", 600), categorie: "Iluminat" },
  ],
};
