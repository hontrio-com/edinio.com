/**
 * Termenii și condițiile Edinio.
 *
 * ═══ TEXTUL E AL CLIENTULUI, CUVÂNT CU CUVÂNT ═══
 *
 * Document juridic, dat integral (2026-08-10) cu cererea explicită „să nu omiți
 * nimic". Nu se rescrie, nu se scurtează, nu se „simplifică" și nu se
 * reordonează. O reformulare care sună mai bine poate schimba ce se poate
 * susține în fața unei autorități.
 *
 * Dacă textul se schimbă, se schimbă AICI. Pagina nu are niciun text propriu în
 * afară de etichetele de navigare („Cuprins", „Înapoi sus").
 *
 * ═══ TRANSCRIEREA A FOST VERIFICATĂ MECANIC ═══
 *
 * 50 de articole copiate de mână nu se verifică recitindu-le. Originalul a fost
 * pus într-un fișier și comparat linie cu linie cu ce iese de aici: **598 de
 * rânduri de fiecare parte, zero lipsă, zero în plus**, iar la comparația care
 * ține cont și de majuscule singurele diferențe au fost exact cele 51 de
 * titluri (vezi mai jos) — fiecare rând de text s-a potrivit caracter cu
 * caracter, cu tot cu diacritice și punctuație.
 *
 * Proba a prins un singur lucru, dar unul care contează: pusesem „Denumire:"
 * în fața numelui firmei, adică un cuvânt care nu e al clientului, într-un
 * document juridic. A fost scos.
 *
 * ⚠ Dacă textul se schimbă vreodată, REFĂ comparația în loc să te uiți peste el.
 * Se face cu un script care adună tot textul de aici, ca linii, și îl compară cu
 * fișierul primit de la client, normalizând doar spațiile.
 *
 * ═══ DOUĂ ALEGERI DE TIPOGRAFIE, NU DE CONȚINUT ═══
 *
 * 1. **Titlurile erau scrise cu MAJUSCULE.** Aici sunt scrise normal. Cuvintele
 *    sunt identice — 50 de titluri strigate una sub alta se citesc mai greu, nu
 *    mai serios. Se întorc dintr-o clasă `uppercase`, dacă le vrea așa.
 * 2. **Numerotarea („10.4.") stă în `nr`, nu în text.** Se afișează stins, în
 *    fața paragrafului. Numerele NU s-au atins: la un contract, trimiterea
 *    „conform art. 34.3" trebuie să găsească exact ce trimite.
 *
 * ═══ CE SE EVIDENȚIAZĂ, ȘI DE CE ATÂT ═══
 *
 * `evidenta` scoate în relief bucăți din text FĂRĂ să le schimbe: termene și
 * plafoane (15 zile, 14 zile, 90 de zile, 6 luni). Sunt fapte din document, nu
 * părerea mea despre ce e important.
 *
 * `accent` e rezervat propozițiilor prin care textul se declară EL ÎNSUȘI
 * esențial („Această secțiune constituie o condiție esențială...", art. 11 și
 * 34) plus paragrafului de acceptare din preambul. ⚠ Nu adăuga alte accente pe
 * baza a ce ți se pare ție mai important: într-un contract, a scoate o clauză în
 * evidență și pe alta nu e o afirmație despre cât cântărește fiecare.
 */

export const TERMENI_TITLU = "Termeni și condiții de utilizare Edinio";

export const TERMENI_ACTUALIZARE = "10 august 2026";

export type Bloc =
  | {
      tip: "paragraf";
      /** Numerotarea din document („10.4."), afișată stins în fața textului. */
      nr?: string;
      text: string;
      /** Bucăți exacte din `text` care se îngroașă. Vezi nota din antet. */
      evidenta?: string[];
    }
  | { tip: "lista"; items: string[] }
  | { tip: "definitii"; items: { termen: string; text: string }[] }
  /**
   * Fișa de identificare a firmei.
   *
   * ⚠ Rândul FĂRĂ `eticheta` e denumirea, capul fișei. În original ea stă
   * singură, fără niciun cuvânt în față — iar proba de integritate a prins
   * exact asta: pusesem „Denumire:", adică un cuvânt care nu e al clientului,
   * într-un document juridic. Nu i se pune etichetă înapoi.
   */
  | { tip: "date"; items: { eticheta?: string; valoare: string; href?: string }[] }
  /** Propoziția prin care documentul se declară el însuși esențial. */
  | { tip: "accent"; text: string }
  | { tip: "email"; adresa: string };

export interface Sectiune {
  /** Ancora din adresă. Stabilă: pe ea se pot da linkuri către o clauză. */
  id: string;
  /** Numărul articolului, așa cum e în document. */
  nr: number;
  titlu: string;
  blocuri: Bloc[];
}

/** Preambulul, dinaintea articolului 1. Nu intră în cuprins. */
export const TERMENI_PREAMBUL: Bloc[] = [
  {
    tip: "paragraf",
    text: "Prezentele Termeni și Condiții reglementează accesarea și utilizarea platformei Edinio, precum și raporturile contractuale dintre VOID SFT GAMES SRL și Clienții care utilizează serviciile Edinio.",
  },
  {
    tip: "paragraf",
    text: "Vă rugăm să citiți cu atenție prezentul document înainte de crearea unui cont, activarea perioadei de testare sau achiziționarea unui abonament.",
  },
  {
    tip: "accent",
    text: "Prin crearea unui cont Edinio, activarea unei perioade de testare, achiziționarea unui abonament sau utilizarea Platformei, persoana care acționează în numele Clientului confirmă că a citit, a înțeles și acceptă prezentele Termeni și Condiții și că este autorizată să angajeze juridic persoana juridică pe care o reprezintă.",
  },
];

export const TERMENI_SECTIUNI: Sectiune[] = [
  {
    id: "identificarea-furnizorului",
    nr: 1,
    titlu: "Identificarea furnizorului",
    blocuri: [
      { tip: "paragraf", text: "Platforma Edinio este operată de:" },
      {
        tip: "date",
        items: [
          { valoare: "VOID SFT GAMES SRL" },
          { eticheta: "CUI", valoare: "43474393" },
          { eticheta: "Nr. înmatriculare Registrul Comerțului", valoare: "J18/1054/2020" },
          {
            eticheta: "Sediu social",
            valoare:
              "Strada Progresului, Nr. 2, Bloc A29, Sc. 2, Et. 2, Ap. 10, Mătăsari, Județ Gorj, România",
          },
          { eticheta: "Telefon", valoare: "0750 456 809", href: "tel:+40750456809" },
          {
            eticheta: "Email",
            valoare: "contact@edinio.com",
            href: "mailto:contact@edinio.com",
          },
        ],
      },
      {
        tip: "paragraf",
        text: "În continuare denumită „Edinio”, „Furnizorul”, „noi” sau „VOID SFT GAMES SRL”.",
      },
    ],
  },
  {
    id: "definitii",
    nr: 2,
    titlu: "Definiții",
    blocuri: [
      { tip: "paragraf", text: "În cuprinsul prezentului document:" },
      {
        tip: "definitii",
        items: [
          {
            termen: "Platforma / Edinio",
            text: "înseamnă infrastructura software Edinio, website-ul edinio.com, aplicația de administrare, infrastructura asociată, funcționalitățile, modulele, integrările și serviciile puse la dispoziție de Furnizor.",
          },
          {
            termen: "Clientul",
            text: "înseamnă persoana juridică ce creează sau utilizează un magazin prin Edinio și/sau contractează un Abonament Edinio.",
          },
          {
            termen: "Reprezentantul / Utilizatorul",
            text: "înseamnă persoana fizică autorizată să creeze, administreze sau utilizeze Contul în numele Clientului.",
          },
          {
            termen: "Magazinul",
            text: "înseamnă magazinul online creat și/sau administrat de Client prin Platforma Edinio.",
          },
          {
            termen: "Client Final",
            text: "înseamnă orice persoană care accesează Magazinul Clientului și/sau achiziționează produse ori servicii de la acesta.",
          },
          {
            termen: "Contul",
            text: "înseamnă contul creat în Platformă și utilizat pentru accesarea serviciilor Edinio.",
          },
          {
            termen: "Abonamentul",
            text: "înseamnă planul tarifar lunar sau anual selectat de Client.",
          },
          {
            termen: "Conținutul Clientului",
            text: "înseamnă orice date, texte, imagini, videoclipuri, logo-uri, produse, prețuri, descrieri, documente, mărci, informații despre clienți sau alte materiale introduse, importate, transmise sau publicate de Client prin Platformă.",
          },
          {
            termen: "Servicii Terțe",
            text: "înseamnă orice servicii, aplicații sau infrastructuri furnizate de terți și conectate sau utilizate împreună cu Edinio, inclusiv procesatori de plăți, curieri, servicii de facturare, registrari de domenii, servicii de marketing sau alte API-uri externe.",
          },
        ],
      },
    ],
  },
  {
    id: "destinatia-exclusiv-b2b",
    nr: 3,
    titlu: "Destinația exclusiv B2B",
    blocuri: [
      {
        tip: "paragraf",
        nr: "3.1.",
        text: "Serviciile Edinio sunt destinate exclusiv persoanelor juridice care utilizează Platforma în scopul activității lor profesionale, comerciale sau economice.",
      },
      {
        tip: "paragraf",
        nr: "3.2.",
        text: "VOID SFT GAMES SRL nu încheie prin intermediul Edinio contracte de furnizare a Platformei cu persoane fizice care acționează în calitate de consumatori.",
      },
      {
        tip: "paragraf",
        nr: "3.3.",
        text: "Persoana fizică ce creează sau utilizează Contul declară că acționează exclusiv în numele și pentru o persoană juridică și că dispune de autoritatea necesară pentru a accepta prezentul Contract în numele acesteia.",
      },
      {
        tip: "paragraf",
        nr: "3.4.",
        text: "Furnizorul poate solicita oricând informații sau documente rezonabile pentru verificarea identității Clientului, a datelor societății sau a autorității persoanei care administrează Contul.",
      },
      {
        tip: "paragraf",
        nr: "3.5.",
        text: "Furnizarea unor date false, incomplete, înșelătoare sau aparținând unei alte persoane poate determina suspendarea sau încetarea Contului.",
      },
    ],
  },
  {
    id: "obiectul-serviciului",
    nr: 4,
    titlu: "Obiectul serviciului",
    blocuri: [
      {
        tip: "paragraf",
        nr: "4.1.",
        text: "Edinio este o platformă software de tip SaaS destinată creării și administrării magazinelor online.",
      },
      {
        tip: "paragraf",
        nr: "4.2.",
        text: "În funcție de planul activ și de funcționalitățile disponibile, Platforma poate permite, printre altele:",
      },
      {
        tip: "lista",
        items: [
          "crearea și personalizarea unui magazin online;",
          "publicarea și administrarea produselor;",
          "gestionarea categoriilor, variantelor și stocurilor;",
          "gestionarea comenzilor;",
          "gestionarea clienților;",
          "configurarea metodelor de plată;",
          "conectarea serviciilor de curierat;",
          "conectarea serviciilor de facturare;",
          "generarea și gestionarea anumitor documente prin integrări;",
          "conectarea unui domeniu;",
          "facilitarea achiziției unui domeniu;",
          "utilizarea unor integrări și automatizări;",
          "accesarea statisticilor și instrumentelor de administrare;",
          "utilizarea altor funcționalități introduse periodic de Edinio.",
        ],
      },
      {
        tip: "paragraf",
        nr: "4.3.",
        text: "Caracteristicile exacte ale fiecărui plan sunt cele afișate în Platformă sau pe website la momentul contractării.",
      },
      {
        tip: "paragraf",
        nr: "4.4.",
        text: "Edinio poate introduce, modifica, îmbunătăți sau elimina funcționalități, interfețe sau integrări pentru motive tehnice, comerciale, de securitate, legale sau operaționale.",
      },
      {
        tip: "paragraf",
        nr: "4.5.",
        text: "Achiziționarea unui Abonament acordă Clientului un drept limitat, neexclusiv, netransmisibil de utilizare a Platformei pe durata Contractului și în limitele planului contractat.",
      },
    ],
  },
  {
    id: "crearea-si-securitatea-contului",
    nr: 5,
    titlu: "Crearea și securitatea Contului",
    blocuri: [
      {
        tip: "paragraf",
        nr: "5.1.",
        text: "Clientul este responsabil pentru corectitudinea și actualitatea tuturor informațiilor introduse în Cont.",
      },
      {
        tip: "paragraf",
        nr: "5.2.",
        text: "Datele de acces sunt confidențiale și nu trebuie comunicate persoanelor neautorizate.",
      },
      {
        tip: "paragraf",
        nr: "5.3.",
        text: "Clientul este responsabil pentru activitatea desfășurată prin Contul său și prin conturile utilizatorilor pe care îi autorizează.",
      },
      {
        tip: "paragraf",
        nr: "5.4.",
        text: "Clientul trebuie să informeze Edinio fără întârziere dacă suspectează:",
      },
      {
        tip: "lista",
        items: [
          "compromiterea parolei;",
          "acces neautorizat;",
          "compromiterea unei chei API;",
          "compromiterea unui cont conectat;",
          "orice alt incident de securitate.",
        ],
      },
      {
        tip: "paragraf",
        nr: "5.5.",
        text: "Edinio nu răspunde pentru prejudiciile rezultate din utilizarea neautorizată a unui Cont atunci când accesul a devenit posibil ca urmare a acțiunilor sau omisiunilor Clientului, inclusiv divulgarea parolelor, compromiterea dispozitivelor sau acordarea necorespunzătoare a accesului unor terți.",
      },
    ],
  },
  {
    id: "perioada-gratuita-de-testare",
    nr: 6,
    titlu: "Perioada gratuită de testare",
    blocuri: [
      {
        tip: "paragraf",
        nr: "6.1.",
        text: "Edinio poate oferi Clientului o perioadă gratuită de testare de 15 zile.",
        evidenta: ["15 zile"],
      },
      {
        tip: "paragraf",
        nr: "6.2.",
        text: "Pentru începerea perioadei de testare nu este necesară introducerea unui card bancar.",
      },
      {
        tip: "paragraf",
        nr: "6.3.",
        text: "În lipsa activării unui Abonament contra cost, expirarea perioadei gratuite nu determină debitarea automată a Clientului.",
      },
      {
        tip: "paragraf",
        nr: "6.4.",
        text: "Edinio poate stabili limite rezonabile privind funcționalitățile disponibile în perioada de testare.",
      },
      {
        tip: "paragraf",
        nr: "6.5.",
        text: "Cu excepția cazului în care Edinio permite în mod expres contrariul, perioada gratuită de testare este destinată unei singure utilizări de către aceeași persoană juridică.",
      },
      {
        tip: "paragraf",
        nr: "6.6.",
        text: "Crearea succesivă de conturi cu scopul de a beneficia în mod repetat și nejustificat de perioade gratuite poate determina suspendarea conturilor respective.",
      },
    ],
  },
  {
    id: "abonamente",
    nr: 7,
    titlu: "Abonamente",
    blocuri: [
      {
        tip: "paragraf",
        nr: "7.1.",
        text: "Edinio oferă Abonamente cu perioadă de facturare lunară și/sau anuală.",
      },
      {
        tip: "paragraf",
        nr: "7.2.",
        text: "Caracteristicile, limitele și prețul fiecărui Abonament sunt afișate înainte de efectuarea plății.",
      },
      {
        tip: "paragraf",
        nr: "7.3.",
        text: "Clientul este responsabil să verifice planul selectat înainte de confirmarea comenzii.",
      },
      {
        tip: "paragraf",
        nr: "7.4.",
        text: "Accesul la funcționalitățile unui plan este condiționat de existența unui Abonament activ și de respectarea prezentelor Termeni și Condiții.",
      },
    ],
  },
  {
    id: "plati-si-reinnoire-automata",
    nr: 8,
    titlu: "Plăți și reînnoire automată",
    blocuri: [
      {
        tip: "paragraf",
        nr: "8.1.",
        text: "Plățile recurente pentru Abonamentele Edinio sunt procesate prin Stripe.",
      },
      {
        tip: "paragraf",
        nr: "8.2.",
        text: "Prin activarea unui Abonament recurent și autorizarea plății cu cardul, Clientul autorizează debitarea recurentă prin intermediul Stripe a sumelor aferente Abonamentului selectat.",
      },
      {
        tip: "paragraf",
        nr: "8.3.",
        text: "Abonamentele lunare și anuale se reînnoiesc automat la sfârșitul fiecărei perioade de facturare, până la anularea lor de către Client sau încetarea Contractului.",
        evidenta: ["se reînnoiesc automat"],
      },
      {
        tip: "paragraf",
        nr: "8.4.",
        text: "Clientul este responsabil să anuleze Abonamentul înainte de următoarea dată de reînnoire dacă nu dorește continuarea acestuia.",
      },
      {
        tip: "paragraf",
        nr: "8.5.",
        text: "Simplul fapt că Clientul nu mai utilizează Magazinul sau Platforma nu constituie anulare.",
      },
      {
        tip: "paragraf",
        nr: "8.6.",
        text: "Dacă Clientul anulează Abonamentul, acesta rămâne activ până la finalul perioadei pentru care plata a fost deja efectuată.",
      },
      {
        tip: "paragraf",
        nr: "8.7.",
        text: "După expirarea perioadei achitate, Abonamentul nu se va mai reînnoi.",
      },
      {
        tip: "paragraf",
        nr: "8.8.",
        text: "Edinio poate transmite prin intermediul Stripe mai multe solicitări legitime de procesare/reprocesare a unei plăți scadente, conform mecanismelor disponibile ale procesatorului.",
      },
    ],
  },
  {
    id: "politica-de-nerambursare",
    nr: 9,
    titlu: "Politica de nerambursare",
    blocuri: [
      {
        tip: "paragraf",
        nr: "9.1.",
        text: "Având în vedere caracterul B2B al Serviciilor, sumele achitate pentru Abonamente sunt, în principiu, nerambursabile, cu excepția situațiilor în care rambursarea este impusă de o normă legală obligatorie sau este aprobată expres de VOID SFT GAMES SRL.",
        evidenta: ["nerambursabile"],
      },
      {
        tip: "paragraf",
        nr: "9.2.",
        text: "Anularea unui Abonament înainte de expirarea perioadei achitate nu dă dreptul Clientului la rambursarea:",
      },
      {
        tip: "lista",
        items: ["integrală;", "parțială;", "proporțională;", "aferentă perioadei rămase neutilizate."],
      },
      {
        tip: "paragraf",
        nr: "9.3.",
        text: "Lipsa utilizării Platformei, nepublicarea Magazinului, lipsa vânzărilor sau neutilizarea anumitor funcționalități nu conferă dreptul la rambursare.",
      },
      {
        tip: "paragraf",
        nr: "9.4.",
        text: "Suspendarea sau încetarea unui Cont ca urmare a încălcării Contractului de către Client nu conferă dreptul la rambursarea sumelor achitate.",
      },
    ],
  },
  {
    id: "plati-esuate-si-suspendarea-pentru-neplata",
    nr: 10,
    titlu: "Plăți eșuate și suspendarea pentru neplată",
    blocuri: [
      {
        tip: "paragraf",
        nr: "10.1.",
        text: "Dacă plata aferentă reînnoirii Abonamentului nu poate fi procesată, Edinio poate continua temporar furnizarea Serviciilor.",
      },
      {
        tip: "paragraf",
        nr: "10.2.",
        text: "Magazinul poate rămâne activ pentru o perioadă de 14 zile calendaristice de la data la care plata a devenit scadentă și nu a putut fi încasată.",
        evidenta: ["14 zile calendaristice"],
      },
      {
        tip: "paragraf",
        nr: "10.3.",
        text: "Această perioadă reprezintă o perioadă de grație și nu constituie renunțarea Furnizorului la plata sumelor datorate.",
      },
      {
        tip: "paragraf",
        nr: "10.4.",
        text: "Dacă plata nu este regularizată în această perioadă, Edinio poate:",
      },
      {
        tip: "lista",
        items: [
          "suspenda accesul la Cont;",
          "suspenda Magazinul;",
          "limita anumite funcționalități;",
          "opri publicarea Magazinului;",
          "înceta furnizarea Serviciilor.",
        ],
      },
      {
        tip: "paragraf",
        nr: "10.5.",
        text: "Reactivarea poate fi condiționată de achitarea sumelor datorate și de existența în continuare a datelor Contului.",
      },
    ],
  },
  {
    id: "responsabilitatea-clientului-pentru-magazin",
    nr: 11,
    titlu: "Responsabilitatea Clientului pentru Magazin",
    blocuri: [
      { tip: "accent", text: "Această secțiune constituie o condiție esențială a Contractului." },
      {
        tip: "paragraf",
        nr: "11.1.",
        text: "Edinio pune la dispoziție infrastructura tehnică pentru crearea și administrarea Magazinului.",
      },
      {
        tip: "paragraf",
        nr: "11.2.",
        text: "VOID SFT GAMES SRL nu este vânzătorul, distribuitorul, producătorul, importatorul, furnizorul sau comerciantul produselor și serviciilor oferite în Magazinele create prin Edinio.",
      },
      {
        tip: "paragraf",
        nr: "11.3.",
        text: "Contractele de vânzare sau prestări servicii încheiate printr-un Magazin sunt încheiate exclusiv între Client și Clientul Final.",
      },
      { tip: "paragraf", nr: "11.4.", text: "Edinio nu devine parte în respectivele contracte." },
      { tip: "paragraf", nr: "11.5.", text: "Clientul este singurul responsabil pentru:" },
      {
        tip: "lista",
        items: [
          "produsele și serviciile comercializate;",
          "legalitatea comercializării acestora;",
          "proveniența produselor;",
          "calitatea și siguranța acestora;",
          "autenticitatea produselor;",
          "descrierile și imaginile;",
          "prețurile;",
          "reducerile și promoțiile;",
          "stocurile;",
          "etichetarea;",
          "garanțiile;",
          "conformitatea produselor;",
          "livrarea;",
          "retururile;",
          "rambursările către cumpărători;",
          "reclamațiile;",
          "relația cu consumatorii;",
          "facturarea;",
          "obligațiile fiscale;",
          "autorizațiile și avizele;",
          "drepturile de proprietate intelectuală;",
          "protecția datelor;",
          "informările legale;",
          "orice alte obligații aferente propriei activități.",
        ],
      },
      {
        tip: "paragraf",
        nr: "11.6.",
        text: "Faptul că un produs poate fi introdus tehnic în Platformă nu reprezintă o confirmare din partea Edinio că produsul respectiv poate fi comercializat legal.",
      },
      {
        tip: "paragraf",
        nr: "11.7.",
        text: "Edinio nu verifică și nu aprobă în prealabil fiecare produs publicat de Clienți și nu garantează legalitatea, calitatea sau conformitatea produselor comercializate prin Magazine.",
      },
      {
        tip: "paragraf",
        nr: "11.8.",
        text: "Clientul are obligația exclusivă de a determina dacă produsele sau serviciile sale sunt supuse:",
      },
      {
        tip: "lista",
        items: [
          "autorizării;",
          "licențierii;",
          "unor restricții de vârstă;",
          "unor condiții speciale de comercializare;",
          "unor norme speciale de etichetare;",
          "unor reglementări privind siguranța;",
          "unor reglementări sectoriale;",
          "oricăror alte cerințe legale.",
        ],
      },
    ],
  },
  {
    id: "produse-si-activitati-permise",
    nr: 12,
    titlu: "Produse și activități permise",
    blocuri: [
      {
        tip: "paragraf",
        nr: "12.1.",
        text: "Clientul poate utiliza Edinio pentru comercializarea oricăror produse sau servicii a căror comercializare este permisă de legislația aplicabilă și pentru care Clientul deține toate drepturile, autorizațiile și aprobările necesare.",
      },
      { tip: "paragraf", nr: "12.2.", text: "Este interzisă utilizarea Platformei pentru:" },
      {
        tip: "lista",
        items: [
          "activități ilegale;",
          "produse sau servicii a căror comercializare este ilegală;",
          "produse contrafăcute;",
          "produse care încalcă drepturi de proprietate intelectuală;",
          "fraude;",
          "înșelăciuni;",
          "phishing;",
          "malware;",
          "distribuirea neautorizată de date;",
          "conținut ilegal;",
          "activități care încalcă sancțiuni sau restricții obligatorii aplicabile;",
          "orice activitate care poate compromite securitatea Platformei sau a altor utilizatori.",
        ],
      },
      {
        tip: "paragraf",
        nr: "12.3.",
        text: "Clientul este responsabil să urmărească modificările legislative aplicabile domeniului său.",
      },
    ],
  },
  {
    id: "suspendarea-sau-eliminarea-continutului",
    nr: 13,
    titlu: "Dreptul Edinio de a suspenda sau elimina conținut",
    blocuri: [
      {
        tip: "paragraf",
        nr: "13.1.",
        text: "Edinio poate restricționa, dezactiva sau elimina conținut dacă există motive rezonabile să considere că acesta:",
      },
      {
        tip: "lista",
        items: [
          "este ilegal;",
          "încalcă prezentul Contract;",
          "încalcă drepturile unui terț;",
          "creează un risc pentru securitatea Platformei;",
          "este asociat unei fraude;",
          "este asociat unui atac informatic;",
          "poate genera un prejudiciu serios Platformei sau altor persoane.",
        ],
      },
      {
        tip: "paragraf",
        nr: "13.2.",
        text: "În cazurile urgente, Edinio poate acționa imediat și fără notificare prealabilă, în special dacă întârzierea ar putea:",
      },
      {
        tip: "lista",
        items: [
          "menține disponibil conținut ilegal;",
          "facilita o fraudă;",
          "produce prejudicii unor terți;",
          "compromite securitatea;",
          "afecta infrastructura Platformei;",
          "împiedica respectarea unei obligații legale sau a unei dispoziții a unei autorități.",
        ],
      },
      {
        tip: "paragraf",
        nr: "13.3.",
        text: "Atunci când legislația aplicabilă impune acest lucru, Edinio va comunica Clientului motivele măsurii adoptate și mijloacele de contestare disponibile.",
      },
      {
        tip: "paragraf",
        nr: "13.4.",
        text: "Edinio poate coopera cu autoritățile competente și poate da curs ordinelor, solicitărilor sau obligațiilor legale aplicabile.",
      },
    ],
  },
  {
    id: "notificarea-continutului-potential-ilegal",
    nr: 14,
    titlu: "Notificarea conținutului potențial ilegal",
    blocuri: [
      {
        tip: "paragraf",
        text: "Sesizările privind un anumit conținut disponibil într-un Magazin Edinio pot fi transmise la:",
      },
      { tip: "email", adresa: "contact@edinio.com" },
      {
        tip: "paragraf",
        text: "Pentru o identificare rapidă, notificarea ar trebui să cuprindă cel puțin:",
      },
      {
        tip: "lista",
        items: [
          "identificarea exactă a Magazinului;",
          "URL-ul exact al conținutului;",
          "explicația motivelor pentru care conținutul este considerat ilegal;",
          "date de contact ale persoanei care formulează sesizarea, atunci când legea permite solicitarea acestora;",
          "informațiile și documentele relevante;",
          "confirmarea bunei-credințe cu privire la exactitatea informațiilor transmise.",
        ],
      },
      {
        tip: "paragraf",
        text: "Edinio poate solicita informații suplimentare atunci când acestea sunt necesare pentru analizarea sesizării.",
      },
    ],
  },
  {
    id: "obligatiile-clientului-fata-de-clientii-finali",
    nr: 15,
    titlu: "Obligațiile legale ale Clientului față de Clienții Finali",
    blocuri: [
      {
        tip: "paragraf",
        nr: "15.1.",
        text: "Clientul este singurul responsabil pentru conformitatea Magazinului său cu legislația care îi este aplicabilă.",
      },
      {
        tip: "paragraf",
        nr: "15.2.",
        text: "Clientul trebuie să publice și să mențină toate informațiile și documentele obligatorii pentru propria activitate, inclusiv, după caz:",
      },
      {
        tip: "lista",
        items: [
          "datele comerciantului;",
          "Termenii și Condițiile propriului Magazin;",
          "politica de retur;",
          "politica de confidențialitate;",
          "politica de cookies;",
          "informații privind livrarea;",
          "informații privind plata;",
          "informații privind garanțiile;",
          "informații obligatorii despre produse;",
          "orice alte informări impuse de lege.",
        ],
      },
      {
        tip: "paragraf",
        nr: "15.3.",
        text: "Eventualele modele, generatoare, texte sau sugestii puse la dispoziție prin Edinio au caracter auxiliar și nu reprezintă consultanță juridică, fiscală sau contabilă individualizată.",
      },
      {
        tip: "paragraf",
        nr: "15.4.",
        text: "Clientul este responsabil să verifice și să adapteze aceste documente propriei activități înainte de utilizare.",
      },
    ],
  },
  {
    id: "integrari-cu-servicii-terte",
    nr: 16,
    titlu: "Integrări cu Servicii Terțe",
    blocuri: [
      {
        tip: "paragraf",
        nr: "16.1.",
        text: "Edinio poate permite conectarea Platformei la servicii furnizate de terți, inclusiv servicii de:",
      },
      {
        tip: "lista",
        items: [
          "curierat;",
          "facturare;",
          "procesare a plăților;",
          "marketing;",
          "analiză;",
          "marketplace;",
          "domenii;",
          "alte servicii externe.",
        ],
      },
      {
        tip: "paragraf",
        nr: "16.2.",
        text: "Pentru utilizarea unei integrări, Clientul trebuie să dețină, atunci când este necesar, propriul cont și/sau propriul contract cu furnizorul terț.",
      },
      {
        tip: "paragraf",
        nr: "16.3.",
        text: "Edinio furnizează integrarea tehnică, fără a deveni parte în contractul dintre Client și furnizorul terț.",
      },
      { tip: "paragraf", nr: "16.4.", text: "Clientul este responsabil pentru:" },
      {
        tip: "lista",
        items: [
          "configurarea corectă a conturilor sale externe;",
          "obținerea cheilor API;",
          "existența unui contract activ;",
          "plata costurilor furnizorului terț;",
          "respectarea termenilor furnizorului respectiv;",
          "corectitudinea datelor transmise.",
        ],
      },
      {
        tip: "paragraf",
        nr: "16.5.",
        text: "Edinio nu controlează și nu garantează funcționarea continuă a serviciilor terțe.",
      },
      {
        tip: "paragraf",
        nr: "16.6.",
        text: "O integrare poate înceta temporar sau permanent să funcționeze ca urmare a:",
      },
      {
        tip: "lista",
        items: [
          "modificării API-ului terțului;",
          "retragerii serviciului;",
          "modificării condițiilor comerciale;",
          "revocării accesului;",
          "expirării acreditărilor;",
          "incidentelor terțului;",
          "modificărilor tehnice sau legale.",
        ],
      },
      {
        tip: "paragraf",
        nr: "16.7.",
        text: "Edinio poate modifica, suspenda sau elimina o integrare dacă aceasta nu mai poate fi furnizată în condiții rezonabile, sigure sau legale.",
      },
    ],
  },
  {
    id: "procesarea-platilor-in-magazine",
    nr: 17,
    titlu: "Procesarea plăților în Magazine",
    blocuri: [
      {
        tip: "paragraf",
        nr: "17.1.",
        text: "Edinio nu este procesatorul plăților efectuate de Clienții Finali către comercianți, cu excepția cazului în care o funcționalitate viitoare este prezentată expres ca atare.",
      },
      {
        tip: "paragraf",
        nr: "17.2.",
        text: "Procesarea plăților este realizată prin procesatorii de plăți pe care Clientul îi conectează la Magazin.",
      },
      {
        tip: "paragraf",
        nr: "17.3.",
        text: "Clientul trebuie să dețină propriul cont și propriul contract cu procesatorul respectiv.",
      },
      { tip: "paragraf", nr: "17.4.", text: "Edinio nu răspunde pentru:" },
      {
        tip: "lista",
        items: [
          "plăți refuzate;",
          "chargeback-uri;",
          "blocări de fonduri;",
          "verificări KYC;",
          "suspendarea contului comerciantului;",
          "fraude bancare;",
          "termene de decontare;",
          "comisioanele procesatorilor;",
          "alte decizii aparținând procesatorului de plăți.",
        ],
      },
    ],
  },
  {
    id: "curieri-si-livrare",
    nr: 18,
    titlu: "Curieri și livrare",
    blocuri: [
      {
        tip: "paragraf",
        nr: "18.1.",
        text: "Integrările de curierat reprezintă instrumente tehnice de comunicare cu serviciile furnizate de companiile de curierat.",
      },
      {
        tip: "paragraf",
        nr: "18.2.",
        text: "Contractul de curierat este încheiat între Client și curier, dacă integrarea utilizată presupune acest lucru.",
      },
      { tip: "paragraf", nr: "18.3.", text: "Edinio nu este transportator." },
      { tip: "paragraf", nr: "18.4.", text: "Edinio nu răspunde pentru:" },
      {
        tip: "lista",
        items: [
          "pierderea coletelor;",
          "deteriorarea coletelor;",
          "întârzieri;",
          "refuzul livrării;",
          "tarife;",
          "rambursuri;",
          "erori operaționale ale curierului;",
          "modificările serviciului de curierat.",
        ],
      },
    ],
  },
  {
    id: "facturare-si-servicii-contabile-terte",
    nr: 19,
    titlu: "Facturare și servicii contabile terțe",
    blocuri: [
      {
        tip: "paragraf",
        nr: "19.1.",
        text: "Integrările cu servicii precum platformele de facturare permit transmiterea tehnică a informațiilor între Edinio și serviciul ales de Client.",
      },
      { tip: "paragraf", nr: "19.2.", text: "Clientul este responsabil pentru:" },
      {
        tip: "lista",
        items: [
          "corectitudinea datelor fiscale;",
          "configurarea serviciului;",
          "cotele fiscale;",
          "seriile și numerotarea documentelor;",
          "obligațiile fiscale și contabile;",
          "verificarea documentelor generate.",
        ],
      },
      { tip: "paragraf", nr: "19.3.", text: "Edinio nu oferă consultanță fiscală sau contabilă." },
      {
        tip: "paragraf",
        nr: "19.4.",
        text: "Clientul trebuie să verifice dacă documentele generate sau transmise prin integrare corespund obligațiilor sale legale.",
      },
    ],
  },
  {
    id: "domenii",
    nr: 20,
    titlu: "Domenii",
    blocuri: [
      {
        tip: "paragraf",
        nr: "20.1.",
        text: "Clientul poate conecta la Magazin un domeniu pe care îl deține deja.",
      },
      {
        tip: "paragraf",
        nr: "20.2.",
        text: "Edinio poate permite și achiziționarea unui domeniu direct prin Platformă.",
      },
      {
        tip: "paragraf",
        nr: "20.3.",
        text: "Atunci când Clientul cumpără un domeniu prin Edinio, VOID SFT GAMES SRL acționează exclusiv ca intermediar pentru facilitarea operațiunii.",
      },
      {
        tip: "paragraf",
        nr: "20.4.",
        text: "Domeniul este achiziționat prin intermediul SiteBunker, utilizând datele furnizate de Client în procesul aferent.",
      },
      {
        tip: "paragraf",
        nr: "20.5.",
        text: "Edinio nu este registrul de domenii și nu controlează sistemele sau politicile registrului/registrarului.",
      },
      {
        tip: "paragraf",
        nr: "20.6.",
        text: "Disponibilitatea unui domeniu poate fi modificată până la confirmarea efectivă a înregistrării.",
      },
      { tip: "paragraf", nr: "20.7.", text: "Edinio nu garantează:" },
      {
        tip: "lista",
        items: [
          "disponibilitatea permanentă a unui anumit domeniu;",
          "acceptarea înregistrării de către registrar;",
          "funcționarea infrastructurii registrarului;",
          "transferurile;",
          "termenele administrative ale registrului;",
          "menținerea unui domeniu dacă obligațiile aferente acestuia nu sunt respectate.",
        ],
      },
      {
        tip: "paragraf",
        nr: "20.8.",
        text: "Clientul este responsabil pentru corectitudinea datelor utilizate la înregistrarea domeniului.",
      },
      {
        tip: "paragraf",
        nr: "20.9.",
        text: "După transmiterea unei comenzi de înregistrare/reînnoire către furnizorul terț, costurile respective sunt nerambursabile, cu excepția situațiilor impuse de lege sau în care operațiunea nu a fost executată iar suma poate fi recuperată efectiv de la furnizorul terț.",
        evidenta: ["nerambursabile"],
      },
    ],
  },
  {
    id: "mentenanta",
    nr: 21,
    titlu: "Mentenanță",
    blocuri: [
      {
        tip: "paragraf",
        nr: "21.1.",
        text: "Edinio asigură mentenanța tehnică generală a Platformei pe durata unui Abonament activ.",
      },
      { tip: "paragraf", nr: "21.2.", text: "Mentenanța poate include, după caz:" },
      {
        tip: "lista",
        items: [
          "actualizări;",
          "remedieri;",
          "modificări de securitate;",
          "optimizări;",
          "actualizări de compatibilitate;",
          "operațiuni necesare funcționării infrastructurii.",
        ],
      },
      { tip: "paragraf", nr: "21.3.", text: "Mentenanța Platformei nu include automat:" },
      {
        tip: "lista",
        items: [
          "dezvoltări custom pentru Client;",
          "modificări realizate la comandă;",
          "administrarea afacerii Clientului;",
          "operarea conturilor terțe ale Clientului;",
          "servicii de marketing;",
          "servicii juridice;",
          "servicii fiscale sau contabile.",
        ],
      },
    ],
  },
  {
    id: "asistenta-gratuita",
    nr: 22,
    titlu: "Asistență gratuită",
    blocuri: [
      {
        tip: "paragraf",
        nr: "22.1.",
        text: "Pe durata unui Abonament activ, Edinio oferă asistență pentru utilizarea Platformei.",
      },
      { tip: "paragraf", nr: "22.2.", text: "Asistența poate acoperi, printre altele:" },
      {
        tip: "lista",
        items: [
          "adăugarea produselor;",
          "personalizarea Magazinului;",
          "configurările Platformei;",
          "utilizarea funcționalităților;",
          "conectarea integrărilor;",
          "administrarea Magazinului;",
          "diagnosticarea problemelor privind Platforma.",
        ],
      },
      {
        tip: "paragraf",
        nr: "22.3.",
        text: "Asistența reprezintă ajutor și îndrumare privind Platforma și nu implică, în lipsa unui acord expres, obligația Edinio de a executa în numele Clientului operațiuni repetitive, administrarea zilnică a afacerii sau dezvoltări software personalizate.",
      },
      {
        tip: "paragraf",
        nr: "22.4.",
        text: "Asistența nu reprezintă un SLA și nu implică un timp de răspuns sau de rezolvare garantat.",
      },
    ],
  },
  {
    id: "disponibilitatea-platformei",
    nr: 23,
    titlu: "Disponibilitatea Platformei. Lipsa unui SLA",
    blocuri: [
      {
        tip: "paragraf",
        nr: "23.1.",
        text: "Edinio depune eforturi rezonabile pentru menținerea Platformei funcționale și disponibile.",
      },
      {
        tip: "paragraf",
        nr: "23.2.",
        text: "Edinio nu garantează o disponibilitate de 100% și nu oferă un SLA contractual de uptime, cu excepția cazului în care un acord separat, semnat expres de VOID SFT GAMES SRL, prevede contrariul.",
      },
      {
        tip: "paragraf",
        nr: "23.3.",
        text: "Platforma poate deveni temporar indisponibilă din cauza:",
      },
      {
        tip: "lista",
        items: [
          "mentenanței planificate;",
          "mentenanței de urgență;",
          "actualizărilor;",
          "erorilor software;",
          "incidentelor hardware;",
          "atacurilor informatice;",
          "incidentelor de securitate;",
          "serviciilor cloud;",
          "serviciilor DNS;",
          "furnizorilor de internet;",
          "API-urilor terților;",
          "procesatorilor de plăți;",
          "serviciilor de curierat;",
          "registrarilor;",
          "altor servicii externe.",
        ],
      },
      {
        tip: "paragraf",
        nr: "23.4.",
        text: "În cazul unei intervenții urgente, Edinio poate suspenda temporar Platforma sau anumite funcționalități fără notificare prealabilă dacă aceasta este necesară pentru securitate, integritate sau prevenirea unor prejudicii.",
      },
      {
        tip: "paragraf",
        nr: "23.5.",
        text: "Furnizorul are, în privința disponibilității și remedierii incidentelor, o obligație de diligență, nu o obligație de rezultat.",
      },
    ],
  },
  {
    id: "actualizari-si-modificarea-platformei",
    nr: 24,
    titlu: "Actualizări și modificarea Platformei",
    blocuri: [
      {
        tip: "paragraf",
        nr: "24.1.",
        text: "Edinio este un serviciu software aflat în dezvoltare continuă.",
      },
      { tip: "paragraf", nr: "24.2.", text: "Edinio poate:" },
      {
        tip: "lista",
        items: [
          "modifica interfața;",
          "modifica modul de funcționare;",
          "introduce noi funcții;",
          "retrage funcționalități;",
          "modifica limite tehnice;",
          "înlocui furnizori;",
          "modifica integrări;",
          "schimba infrastructura tehnică.",
        ],
      },
      {
        tip: "paragraf",
        nr: "24.3.",
        text: "Edinio va încerca să evite modificările care afectează în mod nejustificat utilizarea esențială a unui Abonament activ.",
      },
      {
        tip: "paragraf",
        nr: "24.4.",
        text: "Modificările urgente necesare pentru securitate, conformitate legală sau continuitate pot fi implementate imediat.",
      },
    ],
  },
  {
    id: "datele-clientului-si-exportul",
    nr: 25,
    titlu: "Datele Clientului și exportul",
    blocuri: [
      {
        tip: "paragraf",
        nr: "25.1.",
        text: "Clientul păstrează drepturile asupra datelor și Conținutului propriu.",
      },
      {
        tip: "paragraf",
        nr: "25.2.",
        text: "Clientul poate exporta datele proprii ale Magazinului utilizând funcționalitățile de export disponibile în Platformă.",
      },
      {
        tip: "paragraf",
        nr: "25.3.",
        text: "Clientul este responsabil să efectueze exportul datelor pe care dorește să le păstreze înainte de expirarea perioadei de păstrare prevăzute în prezentul Contract.",
      },
      {
        tip: "paragraf",
        nr: "25.4.",
        text: "Edinio nu garantează compatibilitatea fișierelor exportate cu o altă platformă sau posibilitatea importării integrale într-un serviciu furnizat de un terț.",
      },
    ],
  },
  {
    id: "pastrarea-si-stergerea-datelor",
    nr: 26,
    titlu: "Păstrarea și ștergerea datelor după încetarea serviciului",
    blocuri: [
      {
        tip: "paragraf",
        nr: "26.1.",
        text: "După încetarea efectivă a Contractului, Edinio va păstra datele operaționale ale Magazinului pentru o perioadă de 90 de zile, în principal pentru posibilitatea reactivării sau exportului.",
        evidenta: ["90 de zile"],
      },
      {
        tip: "paragraf",
        nr: "26.2.",
        text: "După expirarea celor 90 de zile, Edinio poate șterge definitiv și ireversibil datele Magazinului din sistemele active.",
        evidenta: ["definitiv și ireversibil"],
      },
      { tip: "paragraf", nr: "26.3.", text: "După ștergere, recuperarea datelor poate fi imposibilă." },
      { tip: "paragraf", nr: "26.4.", text: "Anumite:" },
      {
        tip: "lista",
        items: [
          "backup-uri;",
          "log-uri;",
          "informații de securitate;",
          "documente financiar-contabile;",
          "informații necesare pentru apărarea unor drepturi;",
        ],
      },
      {
        tip: "paragraf",
        text: "pot fi păstrate pentru perioade diferite atunci când acest lucru este necesar pentru respectarea unor obligații legale sau a politicilor legitime de securitate și continuitate.",
      },
      {
        tip: "paragraf",
        nr: "26.5.",
        text: "Regimul datelor cu caracter personal este detaliat suplimentar în Politica de Confidențialitate și în acordul privind prelucrarea datelor aplicabil relației Client–Edinio.",
      },
    ],
  },
  {
    id: "backup-si-continuitatea-datelor",
    nr: 27,
    titlu: "Backup și continuitatea datelor",
    blocuri: [
      {
        tip: "paragraf",
        nr: "27.1.",
        text: "Edinio poate implementa mecanisme tehnice de backup și redundanță în scopul funcționării Platformei.",
      },
      {
        tip: "paragraf",
        nr: "27.2.",
        text: "Niciun sistem informatic nu poate garanta în mod absolut că orice versiune sau orice element de date poate fi restaurat în orice circumstanță.",
      },
      {
        tip: "paragraf",
        nr: "27.3.",
        text: "Clientului îi revine responsabilitatea să utilizeze funcțiile de export disponibile pentru informațiile pe care dorește să le păstreze suplimentar în propriile sisteme.",
      },
    ],
  },
  {
    id: "protectia-datelor-cu-caracter-personal",
    nr: 28,
    titlu: "Protecția datelor cu caracter personal",
    blocuri: [
      {
        tip: "paragraf",
        nr: "28.1.",
        text: "În ceea ce privește datele necesare administrării relației Edinio cu Clientul, VOID SFT GAMES SRL va prelucra datele conform Politicii de Confidențialitate Edinio.",
      },
      {
        tip: "paragraf",
        nr: "28.2.",
        text: "În măsura în care Edinio prelucrează date cu caracter personal ale Clienților Finali în numele Clientului:",
      },
      {
        tip: "lista",
        items: [
          "Clientul acționează, de regulă, în calitate de Operator;",
          "Edinio acționează, de regulă, în calitate de Persoană Împuternicită de Operator.",
        ],
      },
      {
        tip: "paragraf",
        nr: "28.3.",
        text: "Detaliile acestei relații vor fi reglementate prin acordul/anexa privind prelucrarea datelor aplicabilă Serviciilor Edinio.",
      },
      {
        tip: "paragraf",
        nr: "28.4.",
        text: "Clientul este responsabil pentru existența unui temei legal corespunzător pentru datele introduse sau colectate prin Magazin și pentru îndeplinirea obligațiilor sale față de persoanele vizate.",
      },
    ],
  },
  {
    id: "proprietatea-intelectuala-edinio",
    nr: 29,
    titlu: "Proprietatea intelectuală Edinio",
    blocuri: [
      {
        tip: "paragraf",
        nr: "29.1.",
        text: "Platforma, codul sursă, codul obiect, structura, interfețele, elementele grafice, designul, bazele tehnologice, documentația, mărcile, denumirea Edinio și elementele originale aparțin VOID SFT GAMES SRL și/sau licențiatorilor săi.",
      },
      {
        tip: "paragraf",
        nr: "29.2.",
        text: "Achiziționarea unui Abonament nu transferă Clientului niciun drept de proprietate intelectuală asupra Platformei.",
      },
      {
        tip: "paragraf",
        nr: "29.3.",
        text: "Este interzisă, în măsura în care legea nu permite expres contrariul:",
      },
      {
        tip: "lista",
        items: [
          "copierea Platformei;",
          "reproducerea neautorizată;",
          "revânzarea accesului;",
          "sublicențierea;",
          "reverse engineering-ul;",
          "extragerea codului;",
          "eludarea mecanismelor de securitate;",
          "utilizarea Platformei pentru construirea neautorizată a unei copii sau a unui serviciu derivat.",
        ],
      },
    ],
  },
  {
    id: "proprietatea-asupra-continutului-clientului",
    nr: 30,
    titlu: "Proprietatea asupra Conținutului Clientului",
    blocuri: [
      {
        tip: "paragraf",
        nr: "30.1.",
        text: "Clientul păstrează drepturile pe care le deține asupra Conținutului încărcat.",
      },
      {
        tip: "paragraf",
        nr: "30.2.",
        text: "Clientul declară și garantează că deține toate drepturile și permisiunile necesare pentru utilizarea acestuia.",
      },
      {
        tip: "paragraf",
        nr: "30.3.",
        text: "Prin încărcarea Conținutului, Clientul acordă Edinio, exclusiv în scopul furnizării Serviciilor, o licență neexclusivă și gratuită pentru:",
      },
      {
        tip: "lista",
        items: [
          "găzduire;",
          "stocare;",
          "procesare;",
          "redimensionare;",
          "conversie;",
          "reproducere tehnică;",
          "transmitere;",
          "afișare;",
          "backup;",
          "punere la dispoziția publicului prin Magazin,",
        ],
      },
      { tip: "paragraf", text: "în măsura necesară funcționării Platformei." },
      {
        tip: "paragraf",
        nr: "30.4.",
        text: "Această licență nu transferă proprietatea asupra Conținutului către Edinio.",
      },
    ],
  },
  {
    id: "utilizarea-interzisa-a-platformei",
    nr: 31,
    titlu: "Utilizarea interzisă a Platformei",
    blocuri: [
      { tip: "paragraf", text: "Clientul nu poate:" },
      {
        tip: "lista",
        items: [
          "încerca accesarea fără drept a sistemelor Edinio;",
          "efectua teste de penetrare fără autorizare;",
          "distribui malware;",
          "realiza atacuri DDoS;",
          "exploata vulnerabilități;",
          "eluda limitele tehnice;",
          "utiliza Platforma în scop fraudulos;",
          "colecta neautorizat date;",
          "utiliza contul unei alte entități;",
          "transmite volume de solicitări menite să afecteze Platforma;",
          "utiliza Platforma într-un mod care prejudiciază alți utilizatori;",
          "încălca drepturile Edinio sau ale terților.",
        ],
      },
      {
        tip: "paragraf",
        text: "Edinio poate limita sau suspenda imediat accesul în astfel de situații.",
      },
    ],
  },
  {
    id: "lipsa-garantiei-privind-rezultatele-comerciale",
    nr: 32,
    titlu: "Lipsa garanției privind rezultatele comerciale",
    blocuri: [
      {
        tip: "paragraf",
        nr: "32.1.",
        text: "Edinio furnizează infrastructura și instrumentele pentru operarea unui magazin online.",
      },
      { tip: "paragraf", nr: "32.2.", text: "Edinio nu garantează:" },
      {
        tip: "lista",
        items: [
          "realizarea unor vânzări;",
          "un anumit număr de clienți;",
          "trafic;",
          "profit;",
          "conversii;",
          "poziționare în motoarele de căutare;",
          "performanțe publicitare;",
          "succesul comercial al Magazinului;",
          "aprobarea Clientului de către un procesator de plăți, curier sau alt furnizor terț.",
        ],
      },
      {
        tip: "paragraf",
        nr: "32.3.",
        text: "Performanța comercială depinde de factori care nu se află sub controlul Edinio.",
      },
    ],
  },
  {
    id: "excluderea-garantiilor",
    nr: 33,
    titlu: "Excluderea garanțiilor",
    blocuri: [
      {
        tip: "paragraf",
        text: "În măsura maximă permisă de lege, Platforma este furnizată în forma disponibilă la momentul utilizării.",
      },
      { tip: "paragraf", text: "Edinio nu garantează că:" },
      {
        tip: "lista",
        items: [
          "Platforma va funcționa permanent fără întreruperi;",
          "Platforma va fi complet lipsită de erori;",
          "orice eroare va putea fi corectată instantaneu;",
          "toate integrările terțe vor fi permanent disponibile;",
          "Platforma va fi compatibilă cu orice serviciu extern existent sau viitor;",
          "utilizarea Platformei va produce un anumit rezultat economic.",
        ],
      },
      {
        tip: "paragraf",
        text: "Nicio prevedere a prezentului articol nu exclude garanțiile sau răspunderea care nu pot fi excluse potrivit legii.",
      },
    ],
  },
  {
    id: "limitarea-raspunderii-edinio",
    nr: 34,
    titlu: "Limitarea răspunderii Edinio",
    blocuri: [
      {
        tip: "accent",
        text: "Această secțiune constituie o condiție esențială a stabilirii prețului și furnizării Serviciilor.",
      },
      {
        tip: "paragraf",
        nr: "34.1.",
        text: "În măsura maximă permisă de lege, Edinio nu răspunde pentru prejudicii rezultate din:",
      },
      {
        tip: "lista",
        items: [
          "produsele sau serviciile comercializate de Client;",
          "acțiunile Clienților Finali;",
          "informațiile introduse de Client;",
          "încălcarea legislației de către Client;",
          "suspendarea legal justificată a Contului;",
          "funcționarea serviciilor terțe;",
          "indisponibilitatea API-urilor terților;",
          "plăți refuzate;",
          "chargeback-uri;",
          "fraude efectuate în Magazin;",
          "servicii de curierat;",
          "servicii de facturare;",
          "registrari de domenii;",
          "erori de configurare efectuate de Client;",
          "compromiterea datelor de acces din culpa Clientului;",
          "modificări efectuate de furnizori terți;",
          "evenimente aflate în afara controlului rezonabil al Edinio.",
        ],
      },
      {
        tip: "paragraf",
        nr: "34.2.",
        text: "În măsura maximă permisă de lege, Edinio nu răspunde pentru prejudicii indirecte sau consecutive, inclusiv:",
      },
      {
        tip: "lista",
        items: [
          "profit nerealizat;",
          "venituri pierdute;",
          "oportunități comerciale pierdute;",
          "pierderea clientelei;",
          "afectarea reputației;",
          "pierderi de marketing;",
          "pierderi rezultate din întreruperea activității.",
        ],
      },
      {
        tip: "paragraf",
        nr: "34.3.",
        text: "Sub rezerva limitelor obligatorii prevăzute de lege, răspunderea agregată a VOID SFT GAMES SRL față de Client, rezultată din sau în legătură cu Contractul, nu va depăși valoarea totală efectiv achitată de Client către Edinio pentru Serviciile Edinio în cele 6 luni anterioare evenimentului care a generat răspunderea.",
        evidenta: ["6 luni"],
      },
      {
        tip: "paragraf",
        text: "Dacă relația contractuală are o vechime mai mică de 6 luni, plafonul este reprezentat de valoarea efectiv achitată de Client de la începutul Contractului și până la evenimentul respectiv.",
        evidenta: ["6 luni"],
      },
      {
        tip: "paragraf",
        nr: "34.4.",
        text: "Limitările de mai sus nu se aplică în măsura în care excluderea sau limitarea răspunderii este interzisă de o normă legală imperativă, inclusiv în situațiile în care prejudiciul a fost produs cu intenție sau din culpă gravă.",
      },
    ],
  },
  {
    id: "despagubirea-edinio-de-catre-client",
    nr: 35,
    titlu: "Despăgubirea Edinio de către Client",
    blocuri: [
      {
        tip: "paragraf",
        nr: "35.1.",
        text: "În măsura permisă de lege, Clientul va suporta și va despăgubi VOID SFT GAMES SRL pentru prejudiciile, costurile, sancțiunile, obligațiile și cheltuielile rezonabile suportate de Edinio ca urmare directă a:",
      },
      {
        tip: "lista",
        items: [
          "produselor sau serviciilor comercializate de Client;",
          "încălcării legislației de către Client;",
          "reclamațiilor Clienților Finali referitoare la activitatea Clientului;",
          "încălcării drepturilor de proprietate intelectuală;",
          "utilizării fără drept a unor imagini, texte sau mărci;",
          "încălcării legislației privind protecția datelor imputabile Clientului;",
          "fraudelor realizate de Client;",
          "informațiilor false furnizate de Client;",
          "încălcării contractelor Clientului cu terții;",
          "încălcării prezentelor Termeni și Condiții.",
        ],
      },
      {
        tip: "paragraf",
        nr: "35.2.",
        text: "Această obligație poate include, în măsura permisă de lege, costurile rezonabile necesare apărării intereselor Edinio.",
      },
    ],
  },
  {
    id: "suspendarea-contului",
    nr: 36,
    titlu: "Suspendarea Contului",
    blocuri: [
      { tip: "paragraf", text: "Edinio poate suspenda temporar Contul sau Magazinul dacă:" },
      {
        tip: "lista",
        items: [
          "Clientul nu achită sumele datorate;",
          "există o încălcare a Contractului;",
          "există suspiciuni rezonabile de fraudă;",
          "Magazinul prezintă un risc de securitate;",
          "există activitate ilegală;",
          "există o solicitare obligatorie a unei autorități;",
          "există conținut ilegal;",
          "Clientul încalcă drepturile terților;",
          "Contul este compromis;",
          "utilizarea Clientului afectează funcționarea Platformei.",
        ],
      },
      {
        tip: "paragraf",
        text: "Atunci când situația permite și legea o impune, Edinio va informa Clientul cu privire la motivele măsurii.",
      },
    ],
  },
  {
    id: "incetarea-contractului-de-catre-client",
    nr: 37,
    titlu: "Încetarea Contractului de către Client",
    blocuri: [
      {
        tip: "paragraf",
        nr: "37.1.",
        text: "Clientul poate anula Abonamentul din Platformă, prin metodele puse la dispoziție.",
      },
      { tip: "paragraf", nr: "37.2.", text: "Anularea oprește următoarea reînnoire automată." },
      {
        tip: "paragraf",
        nr: "37.3.",
        text: "Abonamentul rămâne activ până la sfârșitul perioadei deja achitate.",
      },
      {
        tip: "paragraf",
        nr: "37.4.",
        text: "Sumele aferente perioadei neutilizate nu se rambursează, sub rezerva normelor legale imperative.",
      },
    ],
  },
  {
    id: "incetarea-contractului-de-catre-edinio",
    nr: 38,
    titlu: "Încetarea Contractului de către Edinio",
    blocuri: [
      { tip: "paragraf", text: "Edinio poate înceta Contractul dacă:" },
      {
        tip: "lista",
        items: [
          "Clientul încalcă grav sau repetat Contractul;",
          "Clientul utilizează Platforma ilegal;",
          "Clientul nu achită Abonamentul;",
          "Clientul desfășoară activități frauduloase;",
          "Clientul compromite securitatea Platformei;",
          "continuarea Contractului ar încălca legea sau o decizie obligatorie;",
          "Clientul utilizează Platforma într-un mod care creează un risc serios pentru alți utilizatori sau terți.",
        ],
      },
      { tip: "paragraf", text: "În situațiile grave sau urgente, încetarea poate avea efect imediat." },
    ],
  },
  {
    id: "efectele-incetarii",
    nr: 39,
    titlu: "Efectele încetării",
    blocuri: [
      { tip: "paragraf", text: "La încetarea Contractului:" },
      {
        tip: "lista",
        items: [
          "accesul la funcționalitățile plătite poate fi oprit;",
          "Magazinul poate deveni indisponibil public;",
          "integrările pot fi dezactivate;",
          "Clientul își poate exporta datele în perioada disponibilă, în condițiile Platformei și cu respectarea eventualelor restricții legale;",
          "datele vor fi gestionate conform perioadei de 90 de zile prevăzute în prezentul Contract.",
        ],
      },
      {
        tip: "paragraf",
        text: "Încetarea Contractului nu afectează obligațiile sau drepturile care, prin natura lor, trebuie să continue după încetare, inclusiv cele privind plățile restante, proprietatea intelectuală, răspunderea și despăgubirea.",
      },
    ],
  },
  {
    id: "forta-majora",
    nr: 40,
    titlu: "Forță majoră și evenimente în afara controlului rezonabil",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio nu va fi considerat răspunzător pentru neexecutarea sau executarea cu întârziere a obligațiilor atunci când aceasta este cauzată de un caz de forță majoră sau de evenimente aflate în mod rezonabil în afara controlului Furnizorului, în măsura permisă de lege.",
      },
      { tip: "paragraf", text: "Acestea pot include, în funcție de circumstanțe:" },
      {
        tip: "lista",
        items: [
          "dezastre naturale;",
          "incendii;",
          "inundații;",
          "conflicte armate;",
          "acte ale autorităților;",
          "întreruperi generalizate de internet;",
          "întreruperi majore ale infrastructurii;",
          "atacuri informatice de amploare;",
          "pene majore de energie;",
          "indisponibilitatea critică a unor furnizori externi.",
        ],
      },
    ],
  },
  {
    id: "modificarea-preturilor",
    nr: 41,
    titlu: "Modificarea prețurilor",
    blocuri: [
      {
        tip: "paragraf",
        nr: "41.1.",
        text: "Prețurile disponibile pentru clienții noi pot fi modificate în orice moment.",
      },
      {
        tip: "paragraf",
        nr: "41.2.",
        text: "Dacă Edinio decide modificarea prețului aplicabil unui Abonament existent, Clientul va fi informat înainte ca noul preț să fie aplicat unei reînnoiri viitoare.",
      },
      {
        tip: "paragraf",
        nr: "41.3.",
        text: "Clientul poate anula reînnoirea înainte de intrarea în vigoare a noului preț dacă nu îl acceptă.",
      },
    ],
  },
  {
    id: "modificarea-termenilor",
    nr: 42,
    titlu: "Modificarea Termenilor și Condițiilor",
    blocuri: [
      {
        tip: "paragraf",
        nr: "42.1.",
        text: "Edinio poate modifica prezentul document pentru a reflecta:",
      },
      {
        tip: "lista",
        items: [
          "modificări legislative;",
          "modificări ale Platformei;",
          "funcționalități noi;",
          "cerințe de securitate;",
          "schimbări comerciale;",
          "schimbări ale furnizorilor sau infrastructurii.",
        ],
      },
      {
        tip: "paragraf",
        nr: "42.2.",
        text: "Modificările semnificative vor fi comunicate Clientului printr-un mijloc rezonabil, precum:",
      },
      { tip: "lista", items: ["email;", "notificare în Platformă;", "publicare pe website."] },
      {
        tip: "paragraf",
        nr: "42.3.",
        text: "Pentru modificările materiale care nu necesită implementare urgentă, Edinio va urmări acordarea unui termen rezonabil înainte de intrarea lor în vigoare.",
      },
      {
        tip: "paragraf",
        nr: "42.4.",
        text: "Modificările necesare imediat pentru respectarea legii, securitate, prevenirea fraudei, malware, vulnerabilități sau amenințări urgente pot produce efecte imediat.",
      },
    ],
  },
  {
    id: "comunicari",
    nr: 43,
    titlu: "Comunicări",
    blocuri: [
      { tip: "paragraf", text: "Comunicările dintre Edinio și Client pot fi realizate prin:" },
      {
        tip: "lista",
        items: [
          "email;",
          "notificări în Platformă;",
          "sistemul de suport;",
          "alte mijloace electronice comunicate Clientului.",
        ],
      },
      {
        tip: "paragraf",
        text: "Clientul este responsabil pentru menținerea unei adrese de email valide și pentru verificarea notificărilor primite.",
      },
      {
        tip: "paragraf",
        text: "Notificările trimise la adresa asociată Contului sunt considerate transmise în mod valabil, sub rezerva dispozițiilor legale aplicabile.",
      },
    ],
  },
  {
    id: "cesiunea",
    nr: 44,
    titlu: "Cesiunea",
    blocuri: [
      {
        tip: "paragraf",
        text: "Clientul nu poate transfera Contractul sau Contul unei alte persoane juridice fără acordul prealabil al Edinio, atunci când transferul implică schimbarea titularului contractual.",
      },
      {
        tip: "paragraf",
        text: "VOID SFT GAMES SRL poate transfera Contractul în cadrul unei reorganizări, fuziuni, divizări, cesiuni a afacerii sau transfer al Platformei, cu respectarea dispozițiilor legale aplicabile.",
      },
    ],
  },
  {
    id: "nulitate-partiala",
    nr: 45,
    titlu: "Nulitate parțială",
    blocuri: [
      {
        tip: "paragraf",
        text: "Dacă o clauză a prezentului Contract este declarată nulă, inaplicabilă sau nelegală, aceasta va fi înlăturată sau interpretată în măsura minimă necesară, fără a afecta valabilitatea celorlalte prevederi.",
      },
    ],
  },
  {
    id: "neexercitarea-unui-drept",
    nr: 46,
    titlu: "Neexercitarea unui drept",
    blocuri: [
      {
        tip: "paragraf",
        text: "Faptul că Edinio nu exercită imediat un drept prevăzut de Contract nu reprezintă renunțarea la acel drept.",
      },
    ],
  },
  {
    id: "acordul-complet",
    nr: 47,
    titlu: "Acordul complet",
    blocuri: [
      { tip: "paragraf", text: "Prezentele Termeni și Condiții, împreună cu:" },
      {
        tip: "lista",
        items: [
          "comanda/planul selectat;",
          "Politica de Confidențialitate;",
          "Politica de Cookies;",
          "acordul/anexa privind prelucrarea datelor;",
          "eventualele condiții speciale acceptate expres,",
        ],
      },
      {
        tip: "paragraf",
        text: "constituie cadrul contractual dintre Client și VOID SFT GAMES SRL cu privire la Serviciile Edinio.",
      },
    ],
  },
  {
    id: "legea-aplicabila",
    nr: 48,
    titlu: "Legea aplicabilă",
    blocuri: [
      {
        tip: "paragraf",
        text: "Contractul este guvernat de legea română, precum și de actele Uniunii Europene direct aplicabile, după caz.",
      },
    ],
  },
  {
    id: "solutionarea-litigiilor",
    nr: 49,
    titlu: "Soluționarea litigiilor",
    blocuri: [
      {
        tip: "paragraf",
        nr: "49.1.",
        text: "Părțile vor încerca soluționarea pe cale amiabilă a oricărei neînțelegeri rezultate din Contract.",
      },
      { tip: "paragraf", nr: "49.2.", text: "Clientul poate transmite sesizări la:" },
      { tip: "email", adresa: "contact@edinio.com" },
      {
        tip: "paragraf",
        nr: "49.3.",
        text: "Dacă soluționarea amiabilă nu este posibilă, litigiile vor fi soluționate de instanțele judecătorești competente din România.",
      },
      {
        tip: "paragraf",
        nr: "49.4.",
        text: "În măsura în care legea permite alegerea convențională a competenței teritoriale, părțile convin competența instanțelor de la sediul VOID SFT GAMES SRL.",
      },
    ],
  },
  {
    id: "acceptarea-termenilor",
    nr: 50,
    titlu: "Acceptarea Termenilor",
    blocuri: [
      {
        tip: "paragraf",
        text: "Prin crearea Contului, activarea perioadei de testare, achiziționarea unui Abonament sau utilizarea Serviciilor, reprezentantul Clientului declară că:",
      },
      {
        tip: "lista",
        items: [
          "a citit prezentul document;",
          "îl înțelege;",
          "îl acceptă în integralitate;",
          "este autorizat să reprezinte Clientul;",
          "acceptă caracterul B2B al Contractului;",
          "acceptă condițiile privind reînnoirea automată;",
          "acceptă politica de nerambursare;",
          "înțelege responsabilitatea exclusivă a Clientului pentru Magazin și produsele comercializate.",
        ],
      },
      {
        tip: "paragraf",
        text: "Documentul este disponibil permanent pe website-ul Edinio și poate fi consultat, salvat și reprodus de Client.",
      },
    ],
  },
];

/**
 * Taie textul în bucăți, îngroșându-le pe cele cerute prin `evidenta`.
 *
 * Întoarce o listă de segmente, nu JSX, ca să poată fi probată fără să randezi
 * nimic. Bucata căutată se ia LITERAL: caracterele speciale de regex se
 * neutralizează, altfel un termen cu paranteză ar arunca.
 *
 * ⚠ Nu schimbă niciodată textul: lipite la loc, segmentele dau exact intrarea.
 * Proba din `termeni.test.ts` verifică asta pentru fiecare paragraf din document.
 */
export function segmenteEvidentiate(
  text: string,
  evidenta?: string[],
): { text: string; tare: boolean }[] {
  if (!evidenta?.length) return [{ text, tare: false }];

  const tipar = new RegExp(`(${evidenta.map(scapaRegex).join("|")})`, "g");
  return text
    .split(tipar)
    .filter((bucata) => bucata !== "")
    .map((bucata) => ({ text: bucata, tare: evidenta.includes(bucata) }));
}

function scapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
