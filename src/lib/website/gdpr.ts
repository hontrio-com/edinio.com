/**
 * Drepturile GDPR.
 *
 * ═══ DE CE E AL PATRULEA DOCUMENT ABIA ACUM ═══
 *
 * Pagina `/gdpr` era singura dintre cele patru juridice rămasă scrisă de mână,
 * cu textul în JSX. Auditul de design din 23.08 a numărat pe ea 21 de clase din
 * scara Tailwind și zero valori în pixeli, adică sistemul vechi al site-ului —
 * `text-3xl`, `text-muted-foreground`, `bg-muted/50`, `rounded-xl`, niciuna
 * folosită altundeva pe site. Nu avea cuprins, nu avea ancore pe articole și
 * avea titlul de 36px, când surorile ei au 44.
 *
 * ═══ ⚠ TEXTUL NU S-A ATINS ═══
 *
 * Nici un cuvânt, nici o virgulă. Migrarea e strict de desen. Textul vechi a
 * fost scos din pagina randată într-un fișier și comparat rând cu rând cu ce
 * iese acum din `liniiDocument`, cu `scripts/tests/verifica-document-legal.mjs`
 * — aceeași disciplină ca la celelalte trei, și din același motiv: un rând
 * pierdut dintr-un document juridic nu crapă nimic, doar spune altceva.
 *
 * ═══ CE S-A SCHIMBAT, ȘI SUNT TREI LUCRURI ═══
 *
 * 1. ⚠ OPT LOCURI ÎN CARE TEXTUL ERA LIPIT. Pe pagina veche scria
 *    „Cum procedați:Multe date pot fi corectate” și „Legalitate, echitate și
 *    transparență– datele sunt prelucrate”: spațiul de după `</strong>` cădea la
 *    randare, fiindcă în JSX un spațiu de la capătul rândului nu supraviețuiește.
 *    Se vedea pe ecran, în șapte puncte din articolul 13 și unul din articolul 2.
 *    Aici îngroșarea se face tăind textul cu `segmenteEvidentiate`, deci
 *    problema nu mai poate apărea.
 *
 * 2. Secțiunea „Contact pentru protecția datelor” a primit numărul 15. N-avea
 *    niciunul, deși toate celelalte erau numerotate, iar structura comună cere
 *    numerotare fără goluri — pe ea se sprijină ancorele și cuprinsul.
 *
 * 3. Cele două linkuri din articolul 14 sunt acum o listă, nu cuvinte în frază.
 *    Vezi cărămida `trimiteri` din `legal.ts`.
 *
 * ⚠ CE NU S-A SCHIMBAT: adresarea. Documentul e scris cu „dumneavoastră”, nu cu
 * „tu” ca restul site-ului, exact ca celelalte trei documente juridice. Nu e o
 * scăpare: e limba în care se scrie un document care poate ajunge în fața
 * ANSPDCP.
 *
 * ⚠ NICI GHILIMELELE. În text sunt drepte (`"GDPR"`), nu românești („GDPR”), ca
 * pe pagina veche. Le-am lăsat așa dinadins, ca probă mecanică să iasă la zero
 * diferențe: o migrare de desen n-are voie să schimbe și textul, altfel nu se
 * mai poate spune care dintre cele două a stricat ceva.
 */

import type { Bloc, DocumentLegal, Sectiune } from "./legal";

const TITLU = "Drepturile dumneavoastră GDPR";

const ACTUALIZARE = "30 mai 2026";

const PREAMBUL: Bloc[] = [
  {
    tip: "paragraf",
    text: 'Regulamentul General privind Protecția Datelor (Regulamentul (UE) 2016/679, denumit "GDPR") vă conferă o serie de drepturi cu privire la datele dumneavoastră personale. Această pagină descrie fiecare drept în detaliu și modul în care îl puteți exercita.',
  },
];

const SECTIUNI: Sectiune[] = [
  {
    id: "dreptul-de-acces",
    nr: 1,
    titlu: "Dreptul de acces (Art. 15 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a obține de la Edinio o confirmare că datele dumneavoastră personale sunt sau nu prelucrate și, în caz afirmativ, acces la datele respective și la următoarele informații:",
      },
      {
        tip: "lista",
        items: [
          "Scopurile prelucrării",
          "Categoriile de date personale vizate",
          "Destinatarii sau categoriile de destinatari cărora le-au fost sau le vor fi comunicate datele",
          "Durata prevăzută de stocare sau criteriile utilizate pentru determinarea acesteia",
          "Existența dreptului de a solicita rectificarea, ștergerea sau restricționarea prelucrării",
          "Dreptul de a depune o plângere la ANSPDCP",
          "Sursa datelor (dacă nu au fost colectate direct de la dumneavoastră)",
          "Existența unui proces decizional automatizat, inclusiv profilare",
        ],
      },
      {
        tip: "paragraf",
        text: "Vă vom furniza o copie a datelor personale prelucrate, în format electronic, în mod gratuit. Pentru copii suplimentare, putem percepe un cost rezonabil bazat pe costurile administrative.",
      },
    ],
  },
  {
    id: "dreptul-la-rectificare",
    nr: 2,
    titlu: "Dreptul la rectificare (Art. 16 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a obține, fără întârziere, rectificarea datelor personale inexacte care vă privesc. De asemenea, aveți dreptul de a obține completarea datelor personale incomplete.",
      },
      {
        tip: "paragraf",
        text: "Cum procedați: Multe date pot fi corectate direct din contul dumneavoastră (Setări → Profil / Setări → Magazin). Pentru datele care nu pot fi modificate din interfață, trimiteți o solicitare la contact@edinio.com.",
        evidenta: ["Cum procedați:"],
      },
    ],
  },
  {
    id: "dreptul-la-stergere",
    nr: 3,
    titlu: 'Dreptul la ștergere – "Dreptul de a fi uitat" (Art. 17 GDPR)',
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a solicita ștergerea datelor personale care vă privesc, fără întârziere nejustificată, în următoarele situații:",
      },
      {
        tip: "lista",
        items: [
          "Datele nu mai sunt necesare în raport cu scopurile pentru care au fost colectate",
          "Vă retrageți consimțământul și nu există alt temei legal pentru prelucrare",
          "Vă opuneți prelucrării și nu există motive legitime prevalente",
          "Datele au fost prelucrate ilegal",
          "Datele trebuie șterse pentru respectarea unei obligații legale",
        ],
      },
      {
        tip: "paragraf",
        text: "Ce se întâmplă la ștergerea contului:",
        evidenta: ["Ce se întâmplă la ștergerea contului:"],
      },
      {
        tip: "lista",
        items: [
          "Magazinul dumneavoastră va fi dezactivat imediat și nu va mai fi accesibil public",
          "Datele de profil, afacere, produse și configurări vor fi șterse în termen de 30 de zile",
          "Datele de autentificare vor fi șterse permanent",
        ],
      },
      {
        tip: "paragraf",
        text: "Excepții: Anumite date nu pot fi șterse înainte de expirarea termenelor legale de păstrare:",
        evidenta: ["Excepții:"],
      },
      {
        tip: "lista",
        items: [
          "Datele fiscale și facturile: 10 ani (conform Codului Fiscal român)",
          "Datele necesare pentru constatarea, exercitarea sau apărarea unui drept în instanță",
        ],
      },
      {
        tip: "paragraf",
        text: "Ștergerea contului se poate realiza din Setări → Cont → Ștergere cont sau prin solicitare la contact@edinio.com.",
      },
    ],
  },
  {
    id: "dreptul-la-restrictionare",
    nr: 4,
    titlu: "Dreptul la restricționarea prelucrării (Art. 18 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a solicita restricționarea prelucrării datelor dumneavoastră personale în următoarele cazuri:",
      },
      {
        tip: "lista",
        items: [
          "Contestați exactitatea datelor – pe durata verificării de către noi",
          "Prelucrarea este ilegală, dar preferați restricționarea în locul ștergerii",
          "Nu mai avem nevoie de date, dar dumneavoastră le solicitați pentru constatarea, exercitarea sau apărarea unui drept în instanță",
          "V-ați opus prelucrării – pe durata verificării dacă interesele noastre legitime prevalează",
        ],
      },
      {
        tip: "paragraf",
        text: "În perioada de restricționare, datele vor fi stocate dar nu vor fi prelucrate (cu excepția stocării), fără consimțământul dumneavoastră.",
      },
    ],
  },
  {
    id: "dreptul-la-portabilitate",
    nr: 5,
    titlu: "Dreptul la portabilitatea datelor (Art. 20 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a primi datele personale pe care ni le-ați furnizat într-un format structurat, utilizat în mod curent și care poate fi citit automat (de ex. JSON, CSV). De asemenea, aveți dreptul de a transmite aceste date altui operator.",
      },
      {
        tip: "paragraf",
        text: "Acest drept se aplică datelor prelucrate pe baza consimțământului sau a executării contractului și care sunt prelucrate prin mijloace automatizate.",
      },
      {
        tip: "paragraf",
        text: "Ce date puteți exporta:",
        evidenta: ["Ce date puteți exporta:"],
      },
      {
        tip: "lista",
        items: [
          "Datele de profil (nume, email, telefon)",
          "Datele afacerii (nume, adresă, configurări)",
          "Lista de produse (nume, descrieri, prețuri, imagini)",
          "Istoricul comenzilor (detalii comenzi, clienți, sume)",
          "Datele analitice (statistici trafic și vânzări)",
        ],
      },
      {
        tip: "paragraf",
        text: "Solicitările de export se trimit la contact@edinio.com. Vom furniza datele în termen de 30 de zile.",
      },
    ],
  },
  {
    id: "dreptul-la-opozitie",
    nr: 6,
    titlu: "Dreptul la opoziție (Art. 21 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a vă opune, în orice moment, prelucrării datelor personale care vă privesc, atunci când prelucrarea se bazează pe interesul nostru legitim (Art. 6 alin. 1 lit. f din GDPR).",
      },
      {
        tip: "paragraf",
        text: "În cazul exercitării dreptului la opoziție, vom înceta prelucrarea datelor, cu excepția cazului în care demonstrăm motive legitime și imperioase care prevalează asupra intereselor, drepturilor și libertăților dumneavoastră sau dacă prelucrarea este necesară pentru constatarea, exercitarea sau apărarea unui drept în instanță.",
      },
      {
        tip: "paragraf",
        text: "Opoziția la marketing direct: Aveți dreptul de a vă opune în orice moment prelucrării datelor în scopuri de marketing direct, inclusiv profilarea în măsura în care aceasta este legată de marketingul direct. În caz de opoziție, datele nu vor mai fi prelucrate în acest scop.",
        evidenta: ["Opoziția la marketing direct:"],
      },
    ],
  },
  {
    id: "dreptul-decizii-automate",
    nr: 7,
    titlu: "Dreptul de a nu fi supus deciziilor automate (Art. 22 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aveți dreptul de a nu fi supus unei decizii bazate exclusiv pe prelucrare automatizată, inclusiv profilare, care produce efecte juridice care vă privesc sau vă afectează în mod similar semnificativ.",
      },
      {
        tip: "paragraf",
        text: "Situația curentă: Edinio nu utilizează procese decizionale automatizate care produc efecte juridice sau similare asupra Utilizatorilor. Platforma nu ia decizii automate privind aprobarea sau respingerea conturilor, comenzilor sau altor servicii pe baza exclusivă a procesării automate a datelor personale.",
        evidenta: ["Situația curentă:"],
      },
    ],
  },
  {
    id: "retragerea-consimtamantului",
    nr: 8,
    titlu: "Dreptul de retragere a consimțământului (Art. 7 GDPR)",
    blocuri: [
      {
        tip: "paragraf",
        text: "În cazul în care prelucrarea datelor se bazează pe consimțământul dumneavoastră, aveți dreptul de a retrage consimțământul în orice moment, fără a afecta legalitatea prelucrării efectuate pe baza consimțământului înainte de retragerea acestuia.",
      },
      {
        tip: "paragraf",
        text: "Retragerea consimțământului este la fel de simplă ca și acordarea lui. Puteți retrage consimțământul prin:",
      },
      {
        tip: "lista",
        items: [
          "Modificarea preferințelor de cookie-uri (prin bannerul de cookie-uri)",
          "Dezabonarea de la comunicările de marketing (link-ul din email)",
          "Trimiterea unui email la contact@edinio.com",
        ],
      },
    ],
  },
  {
    id: "cum-exercitati-drepturile",
    nr: 9,
    titlu: "Cum exercitați drepturile",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru a exercita oricare dintre drepturile descrise mai sus, puteți trimite o solicitare prin următoarele canale:",
      },
      {
        tip: "date",
        items: [
          {
            eticheta: "Email",
            valoare: 'contact@edinio.com (cu subiectul "Solicitare GDPR")',
            href: "mailto:contact@edinio.com",
          },
          {
            eticheta: "Poștă",
            valoare:
              "SC VOID SFT GAMES SRL, Str. Progresului, Nr. 2, Mătăsari, Jud. Gorj, România",
          },
          { eticheta: "Telefon", valoare: "0750 456 809", href: "tel:+40750456809" },
        ],
      },
      { tip: "subtitlu", nr: "9.1.", text: "Ce trebuie să includă solicitarea" },
      {
        tip: "lista",
        items: [
          "Numele dumneavoastră complet",
          "Adresa de email asociată contului Edinio",
          "Dreptul pe care doriți să îl exercitați",
          "Orice detalii suplimentare relevante pentru solicitare",
        ],
      },
      { tip: "subtitlu", nr: "9.2.", text: "Verificarea identității" },
      {
        tip: "paragraf",
        text: "Pentru protecția datelor dumneavoastră, este posibil să vă solicităm să vă confirmați identitatea înainte de a procesa cererea. Acest lucru se poate face prin confirmarea adresei de email asociată contului sau prin furnizarea de informații suplimentare.",
      },
    ],
  },
  {
    id: "termenul-de-raspuns",
    nr: 10,
    titlu: "Termenul de răspuns",
    blocuri: [
      {
        tip: "paragraf",
        text: "Vom răspunde solicitărilor dumneavoastră în termen de 30 de zile calendaristice de la primirea cererii, în conformitate cu Art. 12 alin. 3 din GDPR.",
        evidenta: ["30 de zile calendaristice"],
      },
      {
        tip: "paragraf",
        text: "În cazul cererilor complexe sau al unui număr mare de solicitări, termenul poate fi prelungit cu încă 60 de zile calendaristice. În această situație, vă vom informa despre prelungire și motivele acesteia în termen de 30 de zile de la primirea cererii inițiale.",
        evidenta: ["60 de zile calendaristice"],
      },
      {
        tip: "paragraf",
        text: "Exercitarea drepturilor este gratuită. În cazul cererilor vădit nefondate sau excesive (în special din cauza caracterului repetitiv), putem fie percepe un cost rezonabil, fie refuza să dăm curs cererii, cu motivarea deciziei.",
        evidenta: ["gratuită"],
      },
    ],
  },
  {
    id: "plangere-anspdcp",
    nr: 11,
    titlu: "Depunerea unei plângeri la ANSPDCP",
    blocuri: [
      {
        tip: "paragraf",
        text: "Dacă considerați că prelucrarea datelor dumneavoastră personale încalcă prevederile GDPR sau ale Legii 190/2018, aveți dreptul de a depune o plângere la autoritatea de supraveghere din România:",
      },
      {
        tip: "date",
        items: [
          {
            valoare:
              "Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)",
          },
          {
            eticheta: "Adresă",
            valoare:
              "B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, cod poștal 010336, București, România",
          },
          { eticheta: "Telefon", valoare: "+40.318.059.211 / +40.318.059.212" },
          {
            eticheta: "Email",
            valoare: "anspdcp@dataprotection.ro",
            href: "mailto:anspdcp@dataprotection.ro",
          },
          {
            eticheta: "Website",
            valoare: "www.dataprotection.ro",
            href: "https://www.dataprotection.ro",
          },
          { eticheta: "Program registratură", valoare: "Luni-Vineri, 09:00-13:00" },
        ],
      },
      {
        tip: "paragraf",
        text: "Înainte de a depune o plângere la ANSPDCP, vă încurajăm să ne contactați pentru a încerca rezolvarea situației pe cale amiabilă.",
      },
    ],
  },
  {
    id: "notificarea-incidentelor",
    nr: 12,
    titlu: "Notificarea incidentelor de securitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "În conformitate cu Art. 33 și 34 din GDPR, în cazul unei încălcări a securității datelor cu caracter personal, Edinio:",
      },
      {
        tip: "lista",
        items: [
          "Va notifica ANSPDCP în termen de 72 de ore de la data la care a luat cunoștință de incident, cu excepția cazului în care este improbabil ca încălcarea să genereze un risc pentru drepturile și libertățile persoanelor vizate",
          "Va notifica persoanele vizate afectate fără întârziere nejustificată dacă încălcarea este susceptibilă să genereze un risc ridicat pentru drepturile și libertățile acestora",
        ],
      },
      { tip: "paragraf", text: "Notificarea către persoanele vizate va include:" },
      {
        tip: "lista",
        items: [
          "Natura încălcării securității datelor",
          "Consecințele probabile ale încălcării",
          "Măsurile luate sau propuse pentru remedierea încălcării",
          "Datele de contact pentru obținerea de informații suplimentare",
        ],
      },
    ],
  },
  {
    id: "principiile-prelucrarii",
    nr: 13,
    titlu: "Principiile prelucrării datelor",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio prelucrează datele personale cu respectarea principiilor stabilite la Art. 5 din GDPR:",
      },
      {
        /*
          ⚠ `definitii`, nu `lista`: fiecare rând e un principiu urmat de
          explicația lui. Pe pagina veche erau elemente de listă cu `<strong>` la
          început, iar spațiul de după el cădea la randare — se citea
          „Limitarea scopului– datele sunt colectate”. Șapte rânduri, toate
          lipite. Aici termenul și textul sunt lucruri separate, deci nu mai au
          cum să se lipească.
        */
        tip: "definitii",
        items: [
          {
            termen: "Legalitate, echitate și transparență –",
            text: "datele sunt prelucrate în mod legal, echitabil și transparent față de persoana vizată",
          },
          {
            termen: "Limitarea scopului –",
            text: "datele sunt colectate în scopuri determinate, explicite și legitime și nu sunt prelucrate ulterior într-un mod incompatibil cu aceste scopuri",
          },
          {
            termen: "Reducerea la minimum a datelor –",
            text: "datele colectate sunt adecvate, relevante și limitate la ceea ce este necesar în raport cu scopurile prelucrării",
          },
          {
            termen: "Exactitate –",
            text: "datele sunt exacte și, dacă este necesar, actualizate",
          },
          {
            termen: "Limitarea stocării –",
            text: "datele sunt păstrate într-o formă care permite identificarea persoanelor vizate pe o perioadă care nu depășește perioada necesară scopurilor prelucrării",
          },
          {
            termen: "Integritate și confidențialitate –",
            text: "datele sunt prelucrate într-un mod care asigură securitatea adecvată, inclusiv protecția împotriva prelucrării neautorizate sau ilegale",
          },
          {
            termen: "Responsabilitate –",
            text: "operatorul este responsabil de respectarea principiilor și trebuie să poată demonstra conformitatea",
          },
        ],
      },
    ],
  },
  {
    id: "informatii-suplimentare",
    nr: 14,
    titlu: "Informații suplimentare",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru informații detaliate despre datele colectate, scopurile prelucrării și duratele de stocare, consultați Politica de confidențialitate. Pentru informații despre cookie-uri, consultați Politica cookies.",
      },
      {
        tip: "trimiteri",
        items: [
          { text: "Politica de confidențialitate", href: "/confidentialitate" },
          { text: "Politica cookies", href: "/cookies" },
        ],
      },
    ],
  },
  {
    id: "contact-protectia-datelor",
    nr: 15,
    titlu: "Contact pentru protecția datelor",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru orice solicitare legată de datele dumneavoastră personale:",
      },
      {
        tip: "date",
        items: [
          {
            eticheta: "Email",
            valoare: "contact@edinio.com",
            href: "mailto:contact@edinio.com",
          },
          { eticheta: "Telefon", valoare: "0750 456 809", href: "tel:+40750456809" },
          {
            eticheta: "Adresă",
            valoare:
              "SC VOID SFT GAMES SRL, Str. Progresului, Nr. 2, Mătăsari, Jud. Gorj, România",
          },
        ],
      },
    ],
  },
];

export const GDPR: DocumentLegal = {
  titlu: TITLU,
  actualizare: ACTUALIZARE,
  preambul: PREAMBUL,
  sectiuni: SECTIUNI,
};
