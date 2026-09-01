/**
 * Politica de Confidențialitate Edinio.
 *
 * ⚠ TEXTUL E AL CLIENTULUI, CUVÂNT CU CUVÂNT (2026-08-10), cu cererea explicită
 * „să nu omiți nimic". Vezi antetul din `legal.ts` pentru regulile comune:
 * nu se rescrie, iar transcrierea se verifică MECANIC, nu recitind-o.
 *
 * ═══ NUMEROTAREA E A CLIENTULUI, INCLUSIV ACOLO UNDE PARE CIUDATĂ ═══
 *
 * Articolul 7 are un singur subpunct, „7.1. Date de identificare", după care
 * documentul trece la articolul 8 de nivel întâi. Arată ca o scăpare, dar NU se
 * „repară": într-un document juridic numerele sunt adresa clauzei, iar o
 * renumerotare face ca orice trimitere dinafară să arate spre altceva.
 *
 * ═══ CE SE EVIDENȚIAZĂ ═══
 *
 * Doar termene și cifre din text (90 de zile, 14 luni, 5 ani, 72 de ore, o lună,
 * 15 zile) și propoziția prin care documentul se declară el însuși esențial
 * („Această distincție este esențială.", art. 4). Nimic pe baza a ce mi se pare
 * mie mai important.
 */

import type { Bloc, DocumentLegal, Sectiune } from "./legal";

const TITLU = "Politica de Confidențialitate Edinio";

const ACTUALIZARE = "10 august 2026";

const PREAMBUL: Bloc[] = [
  {
    tip: "paragraf",
    text: "Prezenta Politică de Confidențialitate descrie modul în care VOID SFT GAMES SRL, operatorul platformei Edinio, colectează, utilizează, stochează, transmite și protejează datele cu caracter personal în legătură cu website-ul edinio.com, Platforma Edinio și serviciile aferente.",
  },
  {
    tip: "paragraf",
    text: "Prelucrarea datelor se realizează în conformitate cu Regulamentul (UE) 2016/679 privind protecția datelor cu caracter personal („GDPR”), Legea nr. 190/2018 privind măsurile de punere în aplicare a GDPR, Legea nr. 506/2004 privind viața privată în sectorul comunicațiilor electronice și celelalte norme aplicabile.",
  },
  { tip: "paragraf", text: "Vă recomandăm să citiți prezenta Politică împreună cu:" },
  {
    tip: "lista",
    items: [
      "Termenii și Condițiile Edinio;",
      "Politica de Cookies Edinio;",
      "Acordul privind Prelucrarea Datelor / DPA Edinio, atunci când este aplicabil.",
    ],
  },
];

const SECTIUNI: Sectiune[] = [
  {
    id: "cine-opereaza-edinio",
    nr: 1,
    titlu: "Cine operează Edinio",
    blocuri: [
      { tip: "paragraf", text: "Platforma Edinio este operată de:" },
      {
        tip: "date",
        items: [
          { valoare: "VOID SFT GAMES SRL" },
          { eticheta: "CUI", valoare: "43474393" },
          { eticheta: "Nr. înmatriculare", valoare: "J18/1054/2020" },
          {
            eticheta: "Sediu social",
            valoare:
              "Strada Progresului, Nr. 2, Bloc A29, Sc. 2, Et. 2, Ap. 10\nMătăsari, Județ Gorj, România",
          },
          { eticheta: "Telefon", valoare: "0750 456 809", href: "tel:+40750456809" },
          { eticheta: "Email", valoare: "contact@edinio.com", href: "mailto:contact@edinio.com" },
        ],
      },
      {
        tip: "paragraf",
        text: "În cuprinsul prezentei Politici, „Edinio”, „noi”, „Furnizorul” sau „VOID SFT GAMES SRL” desemnează societatea de mai sus.",
      },
      {
        tip: "paragraf",
        text: "Pentru orice solicitare privind protecția datelor cu caracter personal ne puteți contacta la:",
      },
      { tip: "email", adresa: "contact@edinio.com" },
    ],
  },
  {
    id: "cui-se-aplica",
    nr: 2,
    titlu: "Cui se aplică prezenta Politică",
    blocuri: [
      {
        tip: "paragraf",
        text: "Prezenta Politică se aplică datelor cu caracter personal pe care le prelucrăm în legătură cu:",
      },
      {
        tip: "lista",
        items: [
          "vizitatorii website-ului edinio.com;",
          "persoanele care solicită informații despre Edinio;",
          "persoanele care completează formulare;",
          "persoanele care creează un Cont Edinio;",
          "persoanele care activează perioada gratuită de testare;",
          "administratorii, reprezentanții, angajații sau colaboratorii persoanelor juridice care utilizează Edinio;",
          "persoanele care achiziționează sau administrează un Abonament;",
          "persoanele care contactează serviciul de asistență;",
          "persoanele care primesc comunicări Edinio;",
          "reprezentanții furnizorilor, partenerilor sau colaboratorilor noștri;",
          "vizitatorii sau utilizatorii care interacționează cu instrumentele de analiză și marketing utilizate de Edinio;",
          "alte persoane fizice ale căror date sunt prelucrate legitim în legătură cu furnizarea serviciilor.",
        ],
      },
      {
        tip: "paragraf",
        text: "Edinio este destinat exclusiv persoanelor juridice, însă conturile sunt create și utilizate de persoane fizice care acționează în numele acestora. Datele acestor persoane fizice beneficiază în continuare de protecția prevăzută de GDPR.",
      },
    ],
  },
  {
    id: "definitii",
    nr: 3,
    titlu: "Definiții",
    blocuri: [
      { tip: "paragraf", text: "În sensul prezentei Politici:" },
      {
        tip: "definitii",
        items: [
          {
            termen: "Date cu caracter personal",
            text: "înseamnă orice informație privind o persoană fizică identificată sau identificabilă.",
          },
          {
            termen: "Persoană vizată",
            text: "înseamnă persoana fizică la care se referă datele.",
          },
          {
            termen: "Prelucrare",
            text: "înseamnă orice operațiune efectuată asupra datelor, inclusiv colectarea, înregistrarea, organizarea, stocarea, consultarea, utilizarea, transmiterea, restricționarea, ștergerea sau distrugerea.",
          },
          {
            termen: "Operator",
            text: "înseamnă entitatea care stabilește scopurile și mijloacele prelucrării.",
          },
          {
            termen: "Persoană Împuternicită",
            text: "înseamnă entitatea care prelucrează date în numele Operatorului.",
          },
          {
            termen: "Client Edinio",
            text: "înseamnă persoana juridică ce utilizează Platforma Edinio.",
          },
          {
            termen: "Magazin",
            text: "înseamnă magazinul online creat sau administrat prin Edinio.",
          },
          {
            termen: "Client Final",
            text: "înseamnă persoana care vizitează sau cumpără din Magazinul unui Client Edinio.",
          },
        ],
      },
    ],
  },
  {
    id: "cele-doua-roluri",
    nr: 4,
    titlu: "Edinio poate avea două roluri diferite",
    blocuri: [
      { tip: "accent", text: "Această distincție este esențială." },
      { tip: "subtitlu", nr: "4.1.", text: "Edinio în calitate de Operator" },
      {
        tip: "paragraf",
        text: "VOID SFT GAMES SRL este Operator atunci când stabilește de ce și cum sunt utilizate datele, de exemplu pentru:",
      },
      {
        tip: "lista",
        items: [
          "administrarea Conturilor Edinio;",
          "gestionarea relației comerciale cu Clienții;",
          "furnizarea perioadei de testare;",
          "administrarea Abonamentelor;",
          "facturarea serviciilor Edinio;",
          "gestionarea plăților;",
          "furnizarea asistenței;",
          "securizarea Platformei;",
          "prevenirea fraudelor și abuzurilor;",
          "analiza utilizării edinio.com;",
          "promovarea Edinio;",
          "măsurarea campaniilor publicitare;",
          "îndeplinirea obligațiilor legale.",
        ],
      },
      { tip: "subtitlu", nr: "4.2.", text: "Edinio în calitate de Persoană Împuternicită" },
      {
        tip: "paragraf",
        text: "Magazinele create prin Edinio sunt operate de persoane juridice independente.",
      },
      {
        tip: "paragraf",
        text: "Atunci când un cumpărător plasează o comandă într-un astfel de Magazin, comerciantul care operează Magazinul este, de regulă, Operatorul datelor cumpărătorului.",
      },
      {
        tip: "paragraf",
        text: "În această situație, VOID SFT GAMES SRL prelucrează datele prin infrastructura Edinio în numele comerciantului și acționează, de regulă, în calitate de Persoană Împuternicită de Operator.",
      },
      {
        tip: "paragraf",
        text: "Relația va fi reglementată suplimentar prin Acordul privind Prelucrarea Datelor / DPA Edinio, conform art. 28 GDPR.",
      },
    ],
  },
  {
    id: "edinio-nu-devine-operatorul-afacerii",
    nr: 5,
    titlu: "Edinio nu devine Operatorul afacerii Clientului",
    blocuri: [
      {
        tip: "paragraf",
        text: "Simplul fapt că datele unui cumpărător sunt stocate sau procesate tehnic prin infrastructura Edinio nu înseamnă că VOID SFT GAMES SRL devine comerciantul, vânzătorul sau Operatorul independent al activității magazinului respectiv.",
      },
      { tip: "paragraf", text: "Clientul Edinio stabilește, printre altele:" },
      {
        tip: "lista",
        items: [
          "ce produse sau servicii comercializează;",
          "ce date solicită cumpărătorilor;",
          "scopurile prelucrării;",
          "temeiurile juridice;",
          "durata necesară păstrării datelor;",
          "destinatarii datelor;",
          "integrările activate;",
          "comunicările trimise cumpărătorilor;",
          "propriile politici de confidențialitate și cookies.",
        ],
      },
      {
        tip: "paragraf",
        text: "Fiecare Client Edinio este responsabil să pună la dispoziția cumpărătorilor propriului Magazin propria Politică de Confidențialitate și să respecte legislația aplicabilă activității sale.",
      },
    ],
  },
  {
    id: "datele-clientilor-finali",
    nr: 6,
    titlu: "Datele Clienților Finali ai Magazinelor",
    blocuri: [
      {
        tip: "paragraf",
        text: "Prin Magazinele construite pe Edinio pot fi prelucrate, în funcție de configurația comerciantului, date precum:",
      },
      {
        tip: "lista",
        items: [
          "nume și prenume;",
          "email;",
          "telefon;",
          "adresă de facturare;",
          "adresă de livrare;",
          "companie;",
          "cod fiscal, dacă este cazul;",
          "produsele comandate;",
          "cantități;",
          "prețuri;",
          "valoarea comenzii;",
          "informații privind transportul;",
          "informații privind statusul plății;",
          "metoda de plată;",
          "informații necesare facturării;",
          "observațiile unei comenzi;",
          "istoricul comenzilor;",
          "statusul comenzilor;",
          "IP și date tehnice, dacă acestea sunt colectate;",
          "alte informații introduse de Clientul Final sau de comerciant.",
        ],
      },
      {
        tip: "paragraf",
        text: "Pentru aceste date, comerciantul este, de regulă, Operatorul, iar Edinio prelucrează informațiile conform instrucțiunilor acestuia.",
      },
      {
        tip: "paragraf",
        text: "Edinio nu utilizează baza de date cu cumpărătorii unui Magazin pentru propriile campanii de marketing Edinio, în lipsa unui temei juridic distinct și valabil.",
      },
    ],
  },
  {
    id: "date-colectate-direct",
    nr: 7,
    titlu: "Datele pe care le colectăm direct despre utilizatorii Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "În funcție de modul în care interacționați cu serviciile noastre, putem prelucra următoarele categorii de date.",
      },
      { tip: "subtitlu", nr: "7.1.", text: "Date de identificare" },
      { tip: "paragraf", text: "Pot include:" },
      {
        tip: "lista",
        items: [
          "nume;",
          "prenume;",
          "funcție;",
          "calitatea în cadrul societății;",
          "identificatori ai Contului.",
        ],
      },
    ],
  },
  {
    id: "date-de-contact",
    nr: 8,
    titlu: "Date de contact",
    blocuri: [
      { tip: "paragraf", text: "Putem prelucra:" },
      {
        tip: "lista",
        items: [
          "adresa de email;",
          "numărul de telefon;",
          "alte date de contact furnizate voluntar.",
        ],
      },
    ],
  },
  {
    id: "date-persoana-juridica",
    nr: 9,
    titlu: "Date privind persoana juridică",
    blocuri: [
      { tip: "paragraf", text: "Putem prelucra informații precum:" },
      {
        tip: "lista",
        items: [
          "denumirea societății;",
          "CUI;",
          "numărul de înregistrare;",
          "sediul social;",
          "adresa de facturare;",
          "datele reprezentantului;",
          "informațiile necesare facturării.",
        ],
      },
      {
        tip: "paragraf",
        text: "Informațiile care privesc exclusiv persoana juridică nu sunt în sine date cu caracter personal, dar pot deveni relevante din perspectiva GDPR dacă permit identificarea unei persoane fizice.",
      },
    ],
  },
  {
    id: "datele-contului",
    nr: 10,
    titlu: "Datele Contului Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru crearea și administrarea Contului putem prelucra:",
      },
      {
        tip: "lista",
        items: [
          "email-ul Contului;",
          "numele utilizatorului;",
          "telefonul;",
          "societatea asociată;",
          "identificatorul Contului;",
          "Magazinele asociate;",
          "planul activ;",
          "rolurile și permisiunile utilizatorilor;",
          "setările Contului;",
          "data creării Contului;",
          "ultima autentificare;",
          "statusul Contului;",
          "anumite acțiuni efectuate în Platformă.",
        ],
      },
    ],
  },
  {
    id: "date-trial",
    nr: 11,
    titlu: "Date privind trial-ul gratuit",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio oferă o perioadă gratuită de testare de 15 zile, fără introducerea obligatorie a unui card.",
        evidenta: ["15 zile"],
      },
      { tip: "paragraf", text: "Pentru aceasta putem prelucra:" },
      {
        tip: "lista",
        items: [
          "datele necesare Contului;",
          "datele societății;",
          "informații privind Magazinul creat;",
          "data începerii trial-ului;",
          "data expirării;",
          "activitatea relevantă în Platformă;",
          "informații necesare prevenirii folosirii abuzive a trial-ului.",
        ],
      },
      {
        tip: "paragraf",
        text: "Aceste date pot fi utilizate pentru furnizarea testării, asistență, securitate și prevenirea creării repetate abuzive de conturi gratuite.",
      },
    ],
  },
  {
    id: "date-abonamente",
    nr: 12,
    titlu: "Date privind Abonamentele",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru gestionarea Abonamentelor lunare sau anuale putem prelucra:",
      },
      {
        tip: "lista",
        items: [
          "planul selectat;",
          "perioada de facturare;",
          "prețul;",
          "moneda;",
          "data activării;",
          "statusul Abonamentului;",
          "data următoarei reînnoiri;",
          "anularea;",
          "plățile eșuate;",
          "informații privind perioada de grație;",
          "identificatori utilizați de procesatorul de plăți.",
        ],
      },
    ],
  },
  {
    id: "platile-si-stripe",
    nr: 13,
    titlu: "Plățile Edinio și Stripe",
    blocuri: [
      { tip: "paragraf", text: "Plățile Abonamentelor Edinio sunt procesate prin Stripe." },
      {
        tip: "paragraf",
        text: "Stripe gestionează procesarea instrumentului de plată și poate prelucra date necesare autentificării, procesării tranzacției, prevenirii fraudei și respectării propriilor obligații legale.",
      },
      { tip: "paragraf", text: "Edinio poate primi de la Stripe informații precum:" },
      {
        tip: "lista",
        items: [
          "identificatorul clientului Stripe;",
          "identificatorul Abonamentului;",
          "identificatorul tranzacției;",
          "valoarea tranzacției;",
          "moneda;",
          "statusul plății;",
          "data plății;",
          "tipul/metoda de plată;",
          "informații limitate despre card, precum marca și ultimele cifre, dacă sunt furnizate de Stripe.",
        ],
      },
      {
        tip: "paragraf",
        text: "VOID SFT GAMES SRL nu urmărește stocarea numărului complet al cardului și a codului CVC.",
        evidenta: ["nu urmărește stocarea numărului complet al cardului și a codului CVC"],
      },
      {
        tip: "paragraf",
        text: "Stripe are propriul DPA și mecanisme pentru transferuri internaționale, inclusiv Data Privacy Framework și Clauze Contractuale Standard, în situațiile aplicabile.",
      },
    ],
  },
  {
    id: "plati-recurente",
    nr: 14,
    titlu: "Plăți recurente",
    blocuri: [
      {
        tip: "paragraf",
        text: "Abonamentele Edinio se reînnoiesc automat prin Stripe până la anulare.",
        evidenta: ["se reînnoiesc automat"],
      },
      { tip: "paragraf", text: "În acest scop sunt prelucrate datele necesare:" },
      {
        tip: "lista",
        items: [
          "identificării Abonamentului;",
          "inițierii reînnoirii;",
          "procesării plății;",
          "evidenței tranzacției;",
          "gestionării plăților eșuate;",
          "notificării Clientului;",
          "anulării reînnoirii.",
        ],
      },
    ],
  },
  {
    id: "date-asistenta",
    nr: 15,
    titlu: "Datele transmise serviciului de asistență",
    blocuri: [
      { tip: "paragraf", text: "Atunci când contactați Edinio putem prelucra:" },
      {
        tip: "lista",
        items: [
          "numele;",
          "email-ul;",
          "telefonul;",
          "societatea;",
          "identificatorul Contului;",
          "Magazinul;",
          "conținutul conversației;",
          "capturi de ecran;",
          "fișiere;",
          "informații tehnice;",
          "erori;",
          "log-uri relevante;",
          "alte informații necesare soluționării solicitării.",
        ],
      },
      {
        tip: "paragraf",
        text: "Datele sunt utilizate pentru furnizarea asistenței, diagnosticarea problemelor, documentarea solicitărilor și protejarea Platformei.",
      },
      {
        tip: "paragraf",
        text: "Vă recomandăm să nu transmiteți prin suport date personale care nu sunt necesare soluționării problemei.",
      },
    ],
  },
  {
    id: "emailuri-si-resend",
    nr: 16,
    titlu: "Email-uri și Resend",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Resend, serviciu furnizat de Plus Five Five, Inc., pentru transmiterea anumitor email-uri.",
      },
      { tip: "paragraf", text: "Acestea pot include:" },
      {
        tip: "lista",
        items: [
          "confirmări de Cont;",
          "mesaje de autentificare;",
          "notificări de securitate;",
          "mesaje privind comenzile sau funcționarea Platformei;",
          "notificări privind Abonamentul;",
          "plăți;",
          "facturi;",
          "mesaje administrative;",
          "comunicări de suport;",
          "comunicări comerciale, dacă există un temei legal corespunzător.",
        ],
      },
      { tip: "paragraf", text: "Pentru transmiterea mesajelor pot fi procesate:" },
      {
        tip: "lista",
        items: [
          "email;",
          "nume;",
          "conținutul email-ului;",
          "metadatele mesajului;",
          "data transmiterii;",
          "statusul livrării;",
          "informații privind erorile de livrare.",
        ],
      },
      {
        tip: "paragraf",
        text: "Resend acționează, în funcție de tipul de date și serviciu, inclusiv ca persoană împuternicită și utilizează o listă proprie de subîmputerniciți. DPA-ul Resend include mecanisme privind transferurile internaționale.",
      },
      {
        tip: "paragraf",
        text: "Dacă funcționalități precum urmărirea deschiderii sau accesării linkurilor sunt activate, pot fi prelucrate și informații tehnice legate de interacțiunea cu mesajul.",
      },
    ],
  },
  {
    id: "achizitionarea-domeniilor",
    nr: 17,
    titlu: "Achiziționarea domeniilor",
    blocuri: [
      { tip: "paragraf", text: "Edinio permite:" },
      {
        tip: "lista",
        items: [
          "conectarea unui domeniu deținut deja de Client;",
          "cumpărarea unui domeniu direct prin Platformă.",
        ],
      },
      {
        tip: "paragraf",
        text: "Pentru domeniile cumpărate prin Edinio, VOID SFT GAMES SRL acționează ca intermediar, achiziția fiind realizată prin SiteBunker, operat de EXIM HOST SRL.",
      },
      { tip: "paragraf", text: "Putem transmite, după caz:" },
      {
        tip: "lista",
        items: [
          "numele titularului;",
          "datele societății;",
          "CUI;",
          "adresa;",
          "email;",
          "telefon;",
          "date de facturare;",
          "alte informații solicitate în mod obligatoriu pentru înregistrarea domeniului.",
        ],
      },
      {
        tip: "paragraf",
        text: "În funcție de extensia domeniului, anumite date pot ajunge și la registre sau registrari relevanți, precum ROTLD, EURid, ICANN sau partenerii acestora. SiteBunker descrie la rândul său transmiterea datelor către autoritățile/registrele relevante pentru înregistrarea domeniilor.",
      },
      {
        tip: "paragraf",
        text: "Aceste entități pot prelucra anumite date în baza propriilor obligații și politici.",
      },
    ],
  },
  {
    id: "date-tehnice-loguri-securitate",
    nr: 18,
    titlu: "Date tehnice, log-uri și securitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "Când edinio.com sau Platforma Edinio este accesată, pot fi generate automat informații precum:",
      },
      {
        tip: "lista",
        items: [
          "adresa IP;",
          "data și ora;",
          "URL-ul accesat;",
          "browser;",
          "sistem de operare;",
          "user-agent;",
          "tipul dispozitivului;",
          "rezoluția;",
          "identificatori tehnici;",
          "date privind sesiunea;",
          "solicitări HTTP;",
          "erori;",
          "evenimente tehnice;",
          "încercări de autentificare;",
          "activități relevante pentru securitate.",
        ],
      },
      { tip: "paragraf", text: "Aceste informații sunt folosite, după caz, pentru:" },
      {
        tip: "lista",
        items: [
          "funcționarea Platformei;",
          "securitate;",
          "prevenirea atacurilor;",
          "detectarea fraudelor;",
          "prevenirea abuzurilor;",
          "diagnosticarea problemelor;",
          "monitorizarea infrastructurii;",
          "apărarea drepturilor noastre.",
        ],
      },
    ],
  },
  {
    id: "vercel",
    nr: 19,
    titlu: "Vercel",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Vercel pentru găzduirea și furnizarea unor componente ale website-ului și aplicației.",
      },
      {
        tip: "paragraf",
        text: "Prin infrastructura Vercel pot fi procesate date tehnice și date transmise prin aplicație în măsura necesară funcționării serviciului.",
      },
      { tip: "paragraf", text: "Acestea pot include:" },
      {
        tip: "lista",
        items: [
          "IP;",
          "solicitări web;",
          "date tehnice;",
          "log-uri;",
          "informații privind browserul și dispozitivul;",
          "anumite date transmise către aplicație.",
        ],
      },
      {
        tip: "paragraf",
        text: "DPA-ul Vercel prevede, pentru serviciile și planurile cărora li se aplică, inclusiv situații în care Clientul acționează ca Operator sau Împuternicit, iar Vercel ca Persoană Împuternicită.",
      },
    ],
  },
  {
    id: "supabase",
    nr: 20,
    titlu: "Supabase",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Supabase pentru infrastructura de bază de date și alte componente tehnice.",
      },
      {
        tip: "paragraf",
        text: "În Supabase pot fi prelucrate, în funcție de funcționalitatea utilizată:",
      },
      {
        tip: "lista",
        items: [
          "Conturile;",
          "informații despre Magazine;",
          "produse;",
          "comenzi;",
          "clienți;",
          "configurări;",
          "identificatori;",
          "date tehnice;",
          "date necesare autentificării și administrării Platformei;",
          "alte informații introduse în Platformă.",
        ],
      },
      {
        tip: "paragraf",
        text: "Pentru informațiile cumpărătorilor magazinelor, Clientul Edinio este, de regulă, Operator, VOID SFT GAMES SRL este Persoană Împuternicită, iar furnizorii tehnici precum Supabase pot avea rol de subîmputerniciți.",
      },
      {
        tip: "paragraf",
        text: "DPA-ul Supabase reglementează atât situațiile în care clientul Supabase este Operator, cât și cele în care acesta este la rândul său Împuternicit al unui Operator terț.",
      },
    ],
  },
  {
    id: "cloudflare",
    nr: 21,
    titlu: "Cloudflare și edinio-cdn.com",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Cloudflare pentru servicii de CDN, performanță, securitate și livrarea resurselor, inclusiv prin infrastructura asociată domeniului:",
      },
      { tip: "paragraf", text: "edinio-cdn.com" },
      { tip: "paragraf", text: "Cloudflare poate prelucra informații tehnice precum:" },
      {
        tip: "lista",
        items: [
          "IP;",
          "request-uri;",
          "URL-uri/resurse solicitate;",
          "browser;",
          "user-agent;",
          "informații despre rețea;",
          "data și ora solicitărilor;",
          "log-uri de securitate;",
          "informații necesare combaterii atacurilor.",
        ],
      },
      { tip: "paragraf", text: "Cloudflare este utilizat în scopuri precum:" },
      {
        tip: "lista",
        items: [
          "distribuirea rapidă a conținutului;",
          "reducerea latenței;",
          "protecție împotriva traficului abuziv;",
          "securizarea Platformei;",
          "asigurarea disponibilității infrastructurii.",
        ],
      },
      {
        tip: "paragraf",
        text: "DPA-ul Cloudflare recunoaște inclusiv situațiile în care clientul este Operator sau Împuternicit, iar Cloudflare acționează ca Împuternicit sau subîmputernicit.",
      },
    ],
  },
  {
    id: "google-analytics-4",
    nr: 22,
    titlu: "Google Analytics 4",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Google Analytics 4, serviciu furnizat de Google, pentru a înțelege modul în care website-ul este utilizat și pentru a măsura performanța acestuia. Serviciul rulează pe edinio.com și pe paginile Platformei; nu rulează în magazinele create de comercianți, unde se aplică propriile lor configurări.",
      },
      {
        tip: "paragraf",
        text: "În funcție de consimțământ și configurare, Google Analytics poate prelucra informații precum:",
      },
      {
        tip: "lista",
        items: [
          "paginile accesate;",
          "momentul accesării;",
          "durata și tipul sesiunii;",
          "evenimente realizate pe website;",
          "sursa traficului;",
          "informații despre browser;",
          "dispozitiv;",
          "sistem de operare;",
          "rezoluție;",
          "informații tehnice și identificatori;",
          "informații aproximative privind zona geografică;",
          "interacțiunea cu anumite elemente ale website-ului.",
        ],
      },
      {
        tip: "paragraf",
        text: "Google oferă controale pentru dezactivarea colectării anumitor categorii de date, dezactivarea funcțiilor de advertising, eliminarea anumitor parametri și configurarea duratei de retenție.",
      },
      {
        tip: "paragraf",
        text: "Pentru Edinio vom configura perioada de păstrare a datelor la nivel de utilizator și eveniment din Google Analytics la 14 luni, în limitele setărilor disponibile ale serviciului. Google Analytics permite în prezent pentru proprietățile standard perioade de 2 sau 14 luni pentru datele la nivel de utilizator.",
        evidenta: ["14 luni"],
      },
    ],
  },
  {
    id: "google-tag-manager",
    nr: 23,
    titlu: "Google Tag Manager",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio NU utilizează Google Tag Manager. Scripturile și tehnologiile de măsurare sunt implementate direct în codul aplicației, versionate și trecute prin verificare înainte de publicare. Secțiunea este păstrată pentru că descrie o tehnologie frecvent întâlnită și pentru a fi limpede că nu este cazul nostru.",
      },
      {
        tip: "paragraf",
        text: "Acolo unde este folosit — nu la noi — Google Tag Manager gestionează instrumente precum:",
      },
      {
        tip: "lista",
        items: [
          "Google Analytics;",
          "instrumente de măsurare;",
          "Meta Pixel;",
          "alte tag-uri aprobate și documentate.",
        ],
      },
      {
        tip: "paragraf",
        text: "Într-o astfel de configurație, tipurile de date prelucrate depind de tag-ul activat prin manager.",
      },
      {
        tip: "paragraf",
        text: "Un manager de tag-uri nu înlătură obligația de a obține consimțământ atunci când tehnologia activată prin intermediul lui îl necesită. La noi, obligația se aplică direct tehnologiilor implementate în cod.",
      },
      {
        tip: "paragraf",
        text: "Vom configura tag-urile de analiză și marketing astfel încât opțiunile exprimate prin mecanismul de consimțământ să fie respectate.",
      },
      {
        tip: "paragraf",
        text: "Google Consent Mode oferă semnale distincte inclusiv pentru analytics_storage, ad_storage, ad_user_data și ad_personalization.",
      },
    ],
  },
  {
    id: "meta-pixel",
    nr: 24,
    titlu: "Meta Pixel",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Meta Pixel pentru măsurarea performanței campaniilor publicitare și, în funcție de consimțământ și de setările utilizate, pentru optimizarea și personalizarea campaniilor desfășurate prin serviciile Meta.",
      },
      { tip: "paragraf", text: "Prin intermediul Meta Pixel pot fi transmise informații precum:" },
      {
        tip: "lista",
        items: [
          "pagina accesată;",
          "acțiuni realizate pe website;",
          "evenimente;",
          "momentul accesării;",
          "browser;",
          "dispozitiv;",
          "identificatori tehnici;",
          "IP;",
          "informații privind sursa traficului;",
          "informații privind interacțiunea cu reclamele.",
        ],
      },
      {
        tip: "paragraf",
        text: "În Spațiul Economic European, pentru anumite operațiuni realizate prin instrumentele Meta, Meta Platforms Ireland Limited și utilizatorul instrumentului pot avea responsabilități specifice de operatori, inclusiv în baza aranjamentelor Meta aplicabile instrumentelor de advertising. Comisia Europeană face trimitere explicită la aranjamentul Meta privind operatorii pentru activități de publicitate targetată.",
      },
      {
        tip: "paragraf",
        text: "Datele pot fi utilizate de Meta în conformitate cu termenii și politica sa aplicabilă.",
      },
    ],
  },
  {
    id: "analytics-si-marketing-cu-consimtamant",
    nr: 25,
    titlu: "Analytics și marketing numai în condițiile consimțământului",
    blocuri: [
      {
        tip: "paragraf",
        text: "Tehnologiile care nu sunt strict necesare funcționării website-ului, inclusiv cele utilizate pentru analiză și marketing, vor fi utilizate în conformitate cu alegerile exprimate prin mecanismul de gestionare a consimțământului.",
      },
      { tip: "paragraf", text: "În special, Edinio va configura:" },
      {
        tip: "lista",
        items: [
          "Google Analytics;",
          "tag-urile Google de analiză/advertising, dacă vor fi utilizate;",
          "Meta Pixel;",
          "alte tehnologii similare de marketing;",
        ],
      },
      { tip: "paragraf", text: "astfel încât utilizarea lor să respecte preferințele utilizatorului." },
      {
        tip: "paragraf",
        text: "Legea nr. 506/2004 completează regulile GDPR pentru utilizarea tehnologiilor care stochează sau accesează informații pe dispozitivul utilizatorului.",
      },
      {
        tip: "paragraf",
        text: "Utilizatorul își poate modifica sau retrage ulterior opțiunea prin intermediul mecanismului de Setări Cookies / Preferințe Cookies disponibil pe website.",
      },
    ],
  },
  {
    id: "categoriile-de-cookieuri",
    nr: 26,
    titlu: "Categoriile de cookie-uri",
    blocuri: [
      { tip: "paragraf", text: "Edinio poate utiliza următoarele categorii:" },
      { tip: "subtitlu", text: "Cookie-uri strict necesare" },
      { tip: "paragraf", text: "Necesare pentru:" },
      {
        tip: "lista",
        items: [
          "funcționarea website-ului;",
          "autentificare;",
          "securitate;",
          "sesiuni;",
          "preferințele esențiale;",
          "procesarea unor funcționalități solicitate.",
        ],
      },
      { tip: "subtitlu", text: "Cookie-uri funcționale" },
      {
        tip: "paragraf",
        text: "Utilizate pentru memorarea anumitor preferințe sau îmbunătățirea experienței.",
      },
      { tip: "subtitlu", text: "Cookie-uri de analiză" },
      {
        tip: "paragraf",
        text: "Utilizate pentru măsurarea traficului și înțelegerea utilizării website-ului.",
      },
      { tip: "subtitlu", text: "Cookie-uri de marketing" },
      {
        tip: "paragraf",
        text: "Utilizate pentru măsurarea campaniilor, remarketing și personalizarea publicității.",
      },
      {
        tip: "paragraf",
        text: "Lista detaliată a cookie-urilor, furnizorilor, scopurilor și perioadelor va fi disponibilă în Politica de Cookies Edinio.",
      },
    ],
  },
  {
    id: "cum-obtinem-datele",
    nr: 27,
    titlu: "Cum obținem datele",
    blocuri: [
      { tip: "paragraf", text: "Putem primi date:" },
      { tip: "subtitlu", text: "Direct de la persoana vizată" },
      { tip: "paragraf", text: "De exemplu atunci când:" },
      {
        tip: "lista",
        items: [
          "creează Cont;",
          "completează un formular;",
          "ne contactează;",
          "solicită suport;",
          "activează trial-ul;",
          "administrează un Abonament;",
          "configurează Magazinul.",
        ],
      },
      { tip: "subtitlu", text: "Automat" },
      { tip: "paragraf", text: "Prin:" },
      {
        tip: "lista",
        items: [
          "browser;",
          "dispozitiv;",
          "log-uri;",
          "server;",
          "cookie-uri;",
          "tehnologii similare;",
          "mecanisme de securitate;",
          "Google Analytics;",
          "Meta Pixel.",
        ],
      },
      { tip: "subtitlu", text: "De la furnizori" },
      { tip: "paragraf", text: "De exemplu:" },
      {
        tip: "lista",
        items: ["Stripe;", "SiteBunker;", "Google;", "Meta;", "alte servicii conectate."],
      },
      { tip: "subtitlu", text: "De la Clientul Edinio" },
      {
        tip: "paragraf",
        text: "În cazul datelor Clienților Finali prelucrate prin Magazine.",
      },
    ],
  },
  {
    id: "scopurile-prelucrarii",
    nr: 28,
    titlu: "Scopurile prelucrării",
    blocuri: [
      { tip: "paragraf", text: "Putem prelucra datele în scopul:" },
      {
        tip: "lista",
        items: [
          "creării și administrării Contului;",
          "furnizării Platformei;",
          "furnizării trial-ului;",
          "administrării Abonamentului;",
          "procesării plăților;",
          "facturării;",
          "furnizării suportului;",
          "configurării Magazinului;",
          "gestionării domeniilor;",
          "realizării integrărilor;",
          "comunicării cu Clientul;",
          "îmbunătățirii Edinio;",
          "securizării Platformei;",
          "prevenirii fraudelor;",
          "detectării abuzurilor;",
          "diagnosticării erorilor;",
          "respectării obligațiilor legale;",
          "soluționării litigiilor;",
          "apărării drepturilor;",
          "analizei traficului;",
          "măsurării performanței;",
          "marketingului;",
          "măsurării și optimizării campaniilor publicitare.",
        ],
      },
    ],
  },
  {
    id: "temeiurile-juridice",
    nr: 29,
    titlu: "Temeiurile juridice",
    blocuri: [
      {
        tip: "paragraf",
        text: "Prelucrarea poate avea la bază unul sau mai multe dintre temeiurile prevăzute de art. 6 GDPR.",
      },
      { tip: "subtitlu", nr: "29.1.", text: "Interes legitim" },
      { tip: "paragraf", text: "În special pentru:" },
      {
        tip: "lista",
        items: [
          "administrarea relației B2B;",
          "gestionarea reprezentanților Clientului;",
          "administrarea Contului;",
          "furnizarea suportului;",
          "securitatea Platformei;",
          "prevenirea fraudelor;",
          "prevenirea abuzurilor;",
          "protejarea infrastructurii;",
          "apărarea drepturilor noastre;",
          "îmbunătățirea serviciilor pe baza informațiilor operaționale care nu necesită consimțământ.",
        ],
      },
      {
        tip: "paragraf",
        text: "Atunci când folosim interesul legitim, avem în vedere raportul dintre interesele noastre și drepturile persoanelor vizate.",
      },
      {
        tip: "subtitlu",
        nr: "29.2.",
        text: "Executarea unui contract sau demersuri precontractuale",
      },
      {
        tip: "paragraf",
        text: "Poate fi aplicabil atunci când persoana vizată este ea însăși parte la un raport contractual sau este necesară prelucrarea pentru demersuri solicitate de aceasta înainte de contractare.",
      },
      {
        tip: "paragraf",
        text: "Întrucât serviciile Edinio sunt oferite persoanelor juridice, pentru reprezentanții și angajații acestora prelucrarea necesară administrării relației comerciale se va baza frecvent pe interesul legitim.",
      },
      { tip: "subtitlu", nr: "29.3.", text: "Obligație legală" },
      {
        tip: "paragraf",
        text: "Datele pot fi prelucrate atunci când trebuie să respectăm obligații privind:",
      },
      {
        tip: "lista",
        items: [
          "contabilitatea;",
          "fiscalitatea;",
          "răspunsurile către autorități;",
          "protecția datelor;",
          "prevenirea sau raportarea anumitor activități;",
          "alte obligații prevăzute de lege.",
        ],
      },
      { tip: "subtitlu", nr: "29.4.", text: "Consimțământ" },
      {
        tip: "paragraf",
        text: "Folosim consimțământul atunci când acesta este temeiul corespunzător, în special pentru:",
      },
      {
        tip: "lista",
        items: [
          "cookie-uri de analiză;",
          "Google Analytics;",
          "cookie-uri și tehnologii de marketing;",
          "Meta Pixel;",
          "anumite comunicări comerciale;",
          "anumite funcții de personalizare sau tracking.",
        ],
      },
      { tip: "paragraf", text: "Consimțământul poate fi retras oricând." },
      {
        tip: "paragraf",
        text: "Retragerea nu afectează legalitatea prelucrării realizate anterior retragerii.",
      },
    ],
  },
  {
    id: "comunicari-administrative",
    nr: 30,
    titlu: "Comunicări administrative",
    blocuri: [
      {
        tip: "paragraf",
        text: "Putem transmite mesaje necesare administrării serviciului, precum:",
      },
      {
        tip: "lista",
        items: [
          "confirmarea Contului;",
          "autentificare;",
          "securitate;",
          "informații privind trial-ul;",
          "informații privind Abonamentul;",
          "confirmări de plată;",
          "plăți eșuate;",
          "facturi;",
          "suspendări;",
          "notificări tehnice;",
          "incidente;",
          "modificări contractuale;",
          "răspunsuri de suport.",
        ],
      },
      {
        tip: "paragraf",
        text: "Aceste comunicări sunt distincte de publicitatea comercială și pot fi necesare pentru furnizarea Serviciului.",
      },
    ],
  },
  {
    id: "marketing-direct",
    nr: 31,
    titlu: "Marketing direct",
    blocuri: [
      {
        tip: "paragraf",
        text: "Atunci când legislația permite acest lucru, putem transmite comunicări privind:",
      },
      {
        tip: "lista",
        items: [
          "Edinio;",
          "funcționalități noi;",
          "oferte;",
          "promoții;",
          "servicii;",
          "evenimente;",
          "materiale relevante pentru utilizatorii Platformei.",
        ],
      },
      {
        tip: "paragraf",
        text: "Atunci când este necesar, comunicarea se realizează în baza consimțământului.",
      },
      {
        tip: "paragraf",
        text: "Destinatarul poate solicita în orice moment încetarea mesajelor prin:",
      },
      {
        tip: "lista",
        items: ["link-ul de dezabonare;", "setările disponibile;", "email la contact@edinio.com."],
      },
      {
        tip: "paragraf",
        text: "Legea nr. 506/2004 reglementează separat comunicările comerciale electronice și condițiile în care acestea pot fi transmise.",
      },
    ],
  },
  {
    id: "integrarile-activate-de-client",
    nr: 32,
    titlu: "Integrările activate de Client",
    blocuri: [
      { tip: "paragraf", text: "Edinio permite Clientului să conecteze servicii externe precum:" },
      {
        tip: "lista",
        items: [
          "procesatori de plăți;",
          "curieri;",
          "servicii de facturare;",
          "servicii de marketing;",
          "marketplace-uri;",
          "alte aplicații.",
        ],
      },
      {
        tip: "paragraf",
        text: "În momentul activării unei integrări pot fi transmise către furnizorul respectiv date necesare funcționării acesteia.",
      },
      { tip: "paragraf", text: "De exemplu:" },
      {
        tip: "lista",
        items: [
          "numele și adresa destinatarului către curier;",
          "datele comenzii către serviciul de facturare;",
          "informații privind plata către procesator;",
          "informații specifice unei integrări activate de Client.",
        ],
      },
      {
        tip: "paragraf",
        text: "Clientul decide ce integrări activează și este responsabil pentru existența propriului contract/cont și a unui temei legal corespunzător.",
      },
    ],
  },
  {
    id: "cui-transmitem-datele",
    nr: 33,
    titlu: "Cui putem transmite datele",
    blocuri: [
      {
        tip: "paragraf",
        text: "În funcție de situație, datele pot fi accesibile următoarelor categorii de destinatari.",
      },
      { tip: "subtitlu", text: "Furnizori de infrastructură" },
      { tip: "paragraf", text: "Inclusiv:" },
      { tip: "lista", items: ["Vercel;", "Supabase;", "Cloudflare."] },
      { tip: "subtitlu", text: "Furnizori de email" },
      { tip: "lista", items: ["Resend / Plus Five Five, Inc."] },
      { tip: "subtitlu", text: "Procesatori de plăți" },
      { tip: "lista", items: ["Stripe."] },
      { tip: "subtitlu", text: "Servicii de domenii" },
      {
        tip: "lista",
        items: ["SiteBunker / EXIM HOST SRL;", "registrari;", "registre de domenii."],
      },
      { tip: "subtitlu", text: "Servicii de analiză și marketing" },
      { tip: "lista", items: ["Google;", "Meta Platforms."] },
      { tip: "subtitlu", text: "Furnizori selectați de Client" },
      { tip: "paragraf", text: "De exemplu:" },
      {
        tip: "lista",
        items: [
          "curieri;",
          "procesatori de plată;",
          "servicii de facturare;",
          "alte integrări.",
        ],
      },
      { tip: "subtitlu", text: "Furnizori profesionali" },
      { tip: "paragraf", text: "Pot include:" },
      {
        tip: "lista",
        items: [
          "contabilitate;",
          "avocați;",
          "consultanți;",
          "auditori;",
          "specialiști IT;",
          "furnizori de securitate.",
        ],
      },
      { tip: "subtitlu", text: "Autorități" },
      {
        tip: "paragraf",
        text: "Atunci când transmiterea este necesară în baza unei obligații legale sau a unei solicitări emise legal.",
      },
      {
        tip: "paragraf",
        text: "Furnizorii majori utilizați de infrastructura Edinio au propriile documente privind prelucrarea datelor și subîmputerniciții, inclusiv Supabase, Vercel, Cloudflare și Resend.",
      },
    ],
  },
  {
    id: "nu-vindem-bazele-de-date",
    nr: 34,
    titlu: "Nu vindem bazele de date ale utilizatorilor",
    blocuri: [
      {
        tip: "paragraf",
        text: "VOID SFT GAMES SRL nu comercializează bazele de date cu caracter personal ale utilizatorilor Edinio sau ale cumpărătorilor Magazinelor către terți în scopul revânzării acestora ca baze de date.",
        evidenta: ["nu comercializează bazele de date"],
      },
      {
        tip: "paragraf",
        text: "Transmiterea informațiilor către furnizori necesari funcționării Platformei, către integrările selectate sau către autorități în condițiile legii nu reprezintă o vânzare a bazei de date.",
      },
    ],
  },
  {
    id: "transferuri-internationale",
    nr: 35,
    titlu: "Transferuri internaționale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Unii dintre furnizorii utilizați de Edinio sunt societăți internaționale sau utilizează infrastructuri/subîmputerniciți aflați în afara Spațiului Economic European.",
      },
      {
        tip: "paragraf",
        text: "Atunci când datele sunt transferate într-o țară terță, transferul trebuie să se bazeze pe un mecanism recunoscut de GDPR, după caz:",
      },
      {
        tip: "lista",
        items: [
          "decizie de adecvare;",
          "EU-U.S. Data Privacy Framework;",
          "Clauze Contractuale Standard aprobate de Comisia Europeană;",
          "alte garanții conforme cu art. 44-49 GDPR.",
        ],
      },
      {
        tip: "paragraf",
        text: "GDPR reglementează în mod expres transferurile internaționale în Capitolul V.",
      },
      {
        tip: "paragraf",
        text: "De exemplu, Stripe documentează utilizarea Data Privacy Framework și SCC-urilor, iar DPA-urile Supabase și Resend conțin mecanisme contractuale pentru transferurile internaționale.",
      },
      {
        tip: "paragraf",
        text: "Google utilizează, în funcție de serviciu și rol, mecanisme de transfer prevăzute în termenii săi de protecție a datelor, inclusiv soluții precum Data Privacy Framework și SCC.",
      },
    ],
  },
  {
    id: "cat-timp-pastram-datele",
    nr: 36,
    titlu: "Cât timp păstrăm datele",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aplicăm principiul limitării stocării: datele nu trebuie păstrate într-o formă identificabilă mai mult decât este necesar scopului pentru care sunt prelucrate.",
      },
      { tip: "paragraf", text: "Perioada diferă în funcție de categorie." },
    ],
  },
  {
    id: "conturile-si-datele-operationale",
    nr: 37,
    titlu: "Conturile și datele operaționale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Datele Contului și Magazinului sunt păstrate pe durata utilizării serviciului.",
      },
      {
        tip: "paragraf",
        text: "După încetarea Serviciului, datele operaționale ale Magazinului sunt păstrate, în principiu, pentru 90 de zile.",
        evidenta: ["90 de zile"],
      },
      {
        tip: "paragraf",
        text: "În această perioadă Clientul poate, în funcție de funcționalitățile disponibile:",
      },
      {
        tip: "lista",
        items: ["reactiva serviciul;", "accesa informațiile permise;", "exporta datele."],
      },
      {
        tip: "paragraf",
        text: "După expirarea perioadei, datele pot fi șterse definitiv din sistemele active.",
      },
    ],
  },
  {
    id: "date-in-backup",
    nr: 38,
    titlu: "Date aflate în backup",
    blocuri: [
      {
        tip: "paragraf",
        text: "După ștergerea din sistemele active, anumite informații pot persista temporar în:",
      },
      { tip: "lista", items: ["backup-uri;", "copii de siguranță;", "log-uri de securitate."] },
      {
        tip: "paragraf",
        text: "Aceste copii nu sunt folosite ca baze operaționale obișnuite și sunt eliminate, suprascrise sau anonimizate conform ciclurilor tehnice aplicabile.",
      },
    ],
  },
  {
    id: "date-financiar-contabile",
    nr: 39,
    titlu: "Datele financiar-contabile",
    blocuri: [
      {
        tip: "paragraf",
        text: "Documentele pentru care există obligații legale de păstrare sunt conservate pe perioada prevăzută de legislație.",
      },
      {
        tip: "paragraf",
        text: "În prezent, Legea contabilității prevede pentru registrele obligatorii și documentele justificative o perioadă de 5 ani, calculată de la 1 iulie a anului următor celui încheierii exercițiului financiar în care au fost întocmite.",
        evidenta: ["5 ani"],
      },
    ],
  },
  {
    id: "retentie-google-analytics",
    nr: 40,
    titlu: "Google Analytics",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru datele la nivel de utilizator și eveniment pentru care setarea de retenție Google Analytics este aplicabilă, Edinio va utiliza o perioadă de 14 luni.",
        evidenta: ["14 luni"],
      },
      {
        tip: "paragraf",
        text: "Anumite rapoarte agregate Google Analytics nu sunt afectate în același mod de setarea de retenție a datelor individuale.",
      },
    ],
  },
  {
    id: "retentie-marketing",
    nr: 41,
    titlu: "Marketingul",
    blocuri: [
      {
        tip: "paragraf",
        text: "Datele utilizate în baza consimțământului pentru marketing sunt prelucrate până la:",
      },
      {
        tip: "lista",
        items: ["retragerea consimțământului;", "dezabonare;", "încetarea scopului."],
      },
      {
        tip: "paragraf",
        text: "Putem păstra ulterior o evidență minimă a dezabonării sau opoziției pentru a evita retransmiterea comunicărilor nedorite și pentru demonstrarea respectării obligațiilor legale.",
      },
    ],
  },
  {
    id: "retentie-suport",
    nr: 42,
    titlu: "Suport și comunicări",
    blocuri: [
      {
        tip: "paragraf",
        text: "Solicitările de suport și comunicările pot fi păstrate atât timp cât este necesar pentru:",
      },
      {
        tip: "lista",
        items: [
          "soluționarea solicitării;",
          "administrarea relației comerciale;",
          "documentarea serviciilor oferite;",
          "investigarea incidentelor;",
          "apărarea drepturilor;",
          "respectarea termenelor legale de prescripție.",
        ],
      },
    ],
  },
  {
    id: "retentie-loguri",
    nr: 43,
    titlu: "Log-uri și securitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "Datele tehnice și log-urile sunt păstrate pentru perioada rezonabil necesară:",
      },
      {
        tip: "lista",
        items: [
          "prevenirii incidentelor;",
          "investigării atacurilor;",
          "securizării Platformei;",
          "diagnosticării problemelor;",
          "apărării drepturilor;",
          "îndeplinirii unor obligații legale.",
        ],
      },
      {
        tip: "paragraf",
        text: "Perioadele pot diferi în funcție de natura log-ului, gravitatea riscului și infrastructura tehnică utilizată.",
      },
    ],
  },
  {
    id: "securitatea-datelor",
    nr: 44,
    titlu: "Securitatea datelor",
    blocuri: [
      {
        tip: "paragraf",
        text: "VOID SFT GAMES SRL aplică măsuri tehnice și organizatorice destinate protejării datelor împotriva:",
      },
      {
        tip: "lista",
        items: [
          "accesului neautorizat;",
          "divulgării;",
          "modificării;",
          "pierderii;",
          "distrugerii;",
          "utilizării neautorizate.",
        ],
      },
      { tip: "paragraf", text: "În funcție de componentă și risc, măsurile pot include:" },
      {
        tip: "lista",
        items: [
          "control al accesului;",
          "autentificare;",
          "roluri și permisiuni;",
          "protejarea comunicațiilor;",
          "log-uri;",
          "monitorizare;",
          "backup;",
          "măsuri împotriva atacurilor;",
          "CDN și infrastructură de securitate;",
          "actualizări;",
          "separarea accesului;",
          "proceduri interne.",
        ],
      },
      {
        tip: "paragraf",
        text: "Art. 32 GDPR impune aplicarea unor măsuri tehnice și organizatorice adecvate riscului.",
      },
    ],
  },
  {
    id: "securitatea-nu-e-absoluta",
    nr: 45,
    titlu: "Securitatea nu poate fi garantată absolut",
    blocuri: [
      {
        tip: "paragraf",
        text: "Niciun sistem conectat la internet nu poate elimina în mod absolut toate riscurile informatice.",
      },
      {
        tip: "paragraf",
        text: "Adoptarea măsurilor de securitate nu poate reprezenta o garanție că un incident nu poate avea loc niciodată.",
      },
      {
        tip: "paragraf",
        text: "Această prevedere nu limitează obligațiile pe care VOID SFT GAMES SRL le are potrivit legislației aplicabile.",
      },
    ],
  },
  {
    id: "incidente-de-securitate",
    nr: 46,
    titlu: "Incidente de securitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "În cazul identificării unei încălcări privind datele cu caracter personal, vom analiza, după caz:",
      },
      {
        tip: "lista",
        items: [
          "natura incidentului;",
          "datele afectate;",
          "numărul aproximativ de persoane;",
          "consecințele probabile;",
          "măsurile luate;",
          "nivelul de risc.",
        ],
      },
      {
        tip: "paragraf",
        text: "Atunci când Edinio este Operator, vom îndeplini obligațiile privind notificarea autorității și, atunci când este necesar, informarea persoanelor vizate.",
      },
      {
        tip: "paragraf",
        text: "GDPR prevede, în situațiile în care notificarea autorității este obligatorie, efectuarea acesteia fără întârzieri nejustificate și, dacă este posibil, în cel mult 72 de ore de la constatarea încălcării.",
        evidenta: ["72 de ore"],
      },
      {
        tip: "paragraf",
        text: "Atunci când Edinio acționează ca Persoană Împuternicită, vom informa Operatorul relevant în condițiile GDPR și DPA-ului aplicabil.",
      },
    ],
  },
  {
    id: "drepturile-persoanelor-vizate",
    nr: 47,
    titlu: "Drepturile persoanelor vizate",
    blocuri: [
      {
        tip: "paragraf",
        text: "În condițiile GDPR, puteți beneficia de următoarele drepturi.",
      },
      { tip: "subtitlu", text: "Dreptul de acces" },
      {
        tip: "paragraf",
        text: "Puteți solicita informații privind datele prelucrate și o copie a acestora.",
      },
      { tip: "subtitlu", text: "Dreptul la rectificare" },
      {
        tip: "paragraf",
        text: "Puteți solicita corectarea informațiilor incorecte și completarea datelor incomplete.",
      },
      { tip: "subtitlu", text: "Dreptul la ștergere" },
      { tip: "paragraf", text: "În situațiile prevăzute de lege, puteți solicita ștergerea datelor." },
      { tip: "paragraf", text: "Acest drept nu este absolut." },
      {
        tip: "paragraf",
        text: "Unele informații trebuie păstrate, de exemplu pentru respectarea unor obligații legale sau apărarea unor drepturi.",
      },
      { tip: "subtitlu", text: "Dreptul la restricționare" },
      {
        tip: "paragraf",
        text: "Puteți solicita restricționarea prelucrării în situațiile prevăzute de GDPR.",
      },
      { tip: "subtitlu", text: "Dreptul la portabilitate" },
      {
        tip: "paragraf",
        text: "Atunci când sunt îndeplinite condițiile legale, puteți primi datele într-un format structurat, utilizat în mod curent și care poate fi citit automat.",
      },
      { tip: "subtitlu", text: "Dreptul la opoziție" },
      {
        tip: "paragraf",
        text: "Vă puteți opune unei prelucrări bazate pe interes legitim, în condițiile GDPR.",
      },
      { tip: "paragraf", text: "Pentru marketing direct, vă puteți opune în orice moment." },
      { tip: "subtitlu", text: "Dreptul la retragerea consimțământului" },
      {
        tip: "paragraf",
        text: "Atunci când prelucrarea se bazează pe consimțământ, acesta poate fi retras în orice moment.",
      },
      { tip: "subtitlu", text: "Dreptul privind deciziile automatizate" },
      {
        tip: "paragraf",
        text: "Beneficiați de protecțiile prevăzute de GDPR privind anumite decizii bazate exclusiv pe prelucrare automatizată care produc efecte juridice sau vă afectează într-un mod similar semnificativ.",
      },
      {
        tip: "paragraf",
        text: "Aceste drepturi sunt prevăzute de GDPR și sunt recunoscute și de autoritatea română de supraveghere.",
      },
    ],
  },
  {
    id: "cum-va-exercitati-drepturile",
    nr: 48,
    titlu: "Cum vă exercitați drepturile",
    blocuri: [
      { tip: "paragraf", text: "Solicitările pot fi trimise la:" },
      { tip: "email", adresa: "contact@edinio.com" },
      { tip: "paragraf", text: "sau în scris la:" },
      {
        tip: "adresa",
        linii: [
          "VOID SFT GAMES SRL",
          "Strada Progresului, Nr. 2, Bloc A29, Sc. 2, Et. 2, Ap. 10",
          "Mătăsari, Județ Gorj",
          "România",
        ],
      },
      {
        tip: "paragraf",
        text: "Pentru prevenirea divulgării datelor către o persoană neautorizată, putem solicita informații rezonabile pentru verificarea identității solicitantului.",
      },
    ],
  },
  {
    id: "termenul-de-solutionare",
    nr: 49,
    titlu: "Termenul pentru soluționarea cererilor",
    blocuri: [
      {
        tip: "paragraf",
        text: "Vom răspunde fără întârzieri nejustificate și, în principiu, în cel mult o lună de la primirea solicitării.",
        evidenta: ["o lună"],
      },
      {
        tip: "paragraf",
        text: "În funcție de complexitatea și numărul cererilor, termenul poate fi prelungit cu până la încă două luni, persoana fiind informată despre prelungire conform GDPR.",
        evidenta: ["două luni"],
      },
    ],
  },
  {
    id: "clientul-unui-magazin",
    nr: 50,
    titlu: "Dacă sunteți clientul unui Magazin creat cu Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "Dacă ați cumpărat un produs dintr-un Magazin care utilizează Edinio și doriți:",
      },
      {
        tip: "lista",
        items: [
          "acces la date;",
          "modificarea datelor;",
          "ștergerea datelor;",
          "informații despre o comandă;",
          "exercitarea altui drept GDPR;",
        ],
      },
      {
        tip: "paragraf",
        text: "trebuie să contactați în primul rând comerciantul de la care ați cumpărat.",
      },
      { tip: "paragraf", text: "Acesta este, de regulă, Operatorul datelor respective." },
      { tip: "paragraf", text: "Dacă primim direct o asemenea solicitare, putem:" },
      {
        tip: "lista",
        items: [
          "identifica Magazinul relevant;",
          "direcționa solicitantul către Operator;",
          "transmite cererea Clientului Edinio;",
          "acorda Clientului asistență pentru soluționarea cererii.",
        ],
      },
      {
        tip: "paragraf",
        text: "Nu vom modifica sau șterge date prelucrate exclusiv în numele unui Client dacă această operațiune ar încălca instrucțiunile legitime ale Operatorului sau obligațiile legale aplicabile.",
      },
    ],
  },
  {
    id: "date-speciale",
    nr: 51,
    titlu: "Date speciale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio nu solicită în mod obișnuit utilizatorilor furnizarea categoriilor speciale de date prevăzute de art. 9 GDPR, precum date privind:",
      },
      {
        tip: "lista",
        items: [
          "sănătatea;",
          "originea rasială sau etnică;",
          "opiniile politice;",
          "convingerile religioase;",
          "apartenența sindicală;",
          "date genetice;",
          "anumite date biometrice;",
          "viața sexuală;",
          "orientarea sexuală.",
        ],
      },
      {
        tip: "paragraf",
        text: "Clienții Edinio nu trebuie să introducă astfel de informații în Platformă decât dacă acest lucru este legal, necesar și există un temei corespunzător.",
      },
      {
        tip: "paragraf",
        text: "Dacă un Client utilizează Edinio într-un sector în care asemenea date sunt în mod legitim necesare, Clientul este responsabil pentru analiza cerințelor legale suplimentare aplicabile.",
      },
    ],
  },
  {
    id: "minori",
    nr: 52,
    titlu: "Minori",
    blocuri: [
      {
        tip: "paragraf",
        text: "Platforma contractuală Edinio este destinată activităților comerciale ale persoanelor juridice și nu este destinată creării de Conturi profesionale de către minori.",
      },
      { tip: "paragraf", text: "Magazinele operate de Clienții Edinio sunt afaceri independente." },
      {
        tip: "paragraf",
        text: "Dacă un comerciant oferă în mod legal produse sau servicii minorilor și prelucrează datele acestora, comerciantul respectiv este responsabil pentru îndeplinirea cerințelor legale aplicabile.",
      },
    ],
  },
  {
    id: "decizii-automatizate",
    nr: 53,
    titlu: "Decizii automatizate și profilare",
    blocuri: [
      { tip: "paragraf", text: "Edinio poate utiliza procese automate pentru:" },
      {
        tip: "lista",
        items: [
          "securitate;",
          "detectarea fraudelor;",
          "monitorizarea erorilor;",
          "funcționarea tehnică;",
          "analiza utilizării;",
          "optimizarea campaniilor publicitare.",
        ],
      },
      {
        tip: "paragraf",
        text: "Aceste activități nu înseamnă automat existența unei decizii exclusiv automatizate în sensul art. 22 GDPR.",
      },
      {
        tip: "paragraf",
        text: "Dacă vom implementa o prelucrare exclusiv automatizată care produce efecte juridice sau afectează similar și semnificativ o persoană, vom asigura informările și garanțiile prevăzute de lege.",
      },
    ],
  },
  {
    id: "date-publice-introduse-de-client",
    nr: 54,
    titlu: "Date publice introduse de Client",
    blocuri: [
      {
        tip: "paragraf",
        text: "Clientul poate introduce în Magazin informații destinate afișării publice, precum:",
      },
      {
        tip: "lista",
        items: [
          "denumirea societății;",
          "datele firmei;",
          "email;",
          "telefon;",
          "adresă;",
          "informații despre personal sau reprezentanți.",
        ],
      },
      {
        tip: "paragraf",
        text: "Clientul este responsabil să se asigure că are dreptul de a publica respectivele date.",
      },
    ],
  },
  {
    id: "responsabilitatea-clientului-gdpr",
    nr: 55,
    titlu: "Responsabilitatea Clientului Edinio privind GDPR",
    blocuri: [
      {
        tip: "paragraf",
        text: "Fiecare Client Edinio este responsabil pentru propriile obligații privind protecția datelor, inclusiv:",
      },
      {
        tip: "lista",
        items: [
          "propria Politică de Confidențialitate;",
          "propria Politică de Cookies;",
          "stabilirea scopurilor;",
          "stabilirea temeiurilor juridice;",
          "informarea cumpărătorilor;",
          "consimțămintele necesare;",
          "cookie-urile proprii;",
          "comunicările de marketing;",
          "accesul angajaților;",
          "integrările activate;",
          "termenele de păstrare;",
          "soluționarea cererilor persoanelor vizate;",
          "legalitatea datelor colectate.",
        ],
      },
      {
        tip: "paragraf",
        text: "Faptul că Edinio asigură infrastructura tehnică nu transferă către VOID SFT GAMES SRL responsabilitatea Clientului pentru deciziile privind propria activitate comercială și propriile prelucrări.",
      },
    ],
  },
  {
    id: "cooperarea-cu-autoritatile",
    nr: 56,
    titlu: "Cooperarea cu autoritățile",
    blocuri: [
      {
        tip: "paragraf",
        text: "Putem transmite date unei autorități publice dacă suntem obligați să facem acest lucru prin:",
      },
      {
        tip: "lista",
        items: [
          "lege;",
          "hotărâre;",
          "mandat;",
          "solicitare obligatorie;",
          "ordin legal;",
          "altă procedură validă.",
        ],
      },
      {
        tip: "paragraf",
        text: "Vom urmări limitarea datelor comunicate la ceea ce este necesar pentru îndeplinirea obligației respective.",
      },
    ],
  },
  {
    id: "prevenirea-fraudei",
    nr: 57,
    titlu: "Prevenirea fraudei și abuzului",
    blocuri: [
      {
        tip: "paragraf",
        text: "Putem prelucra date tehnice și informații privind Contul pentru:",
      },
      {
        tip: "lista",
        items: [
          "prevenirea accesului neautorizat;",
          "detectarea atacurilor;",
          "combaterea fraudelor;",
          "identificarea conturilor abuzive;",
          "prevenirea utilizării repetate nelegitime a trial-ului;",
          "protejarea infrastructurii;",
          "investigarea incidentelor.",
        ],
      },
      {
        tip: "paragraf",
        text: "Temeiul poate fi interesul legitim al VOID SFT GAMES SRL și al celorlalți utilizatori de a beneficia de o Platformă sigură.",
      },
    ],
  },
  {
    id: "schimbarea-structurii-companiei",
    nr: 58,
    titlu: "Schimbarea structurii companiei",
    blocuri: [
      { tip: "paragraf", text: "În cazul unei:" },
      {
        tip: "lista",
        items: [
          "fuziuni;",
          "reorganizări;",
          "achiziții;",
          "cesiuni;",
          "divizări;",
          "vânzări a Platformei sau a unei părți relevante din activitate;",
        ],
      },
      {
        tip: "paragraf",
        text: "datele și contractele pot fi transferate succesorului sau entității dobânditoare, cu respectarea legislației aplicabile.",
      },
      { tip: "paragraf", text: "Atunci când este necesar, persoanele vizate vor fi informate." },
    ],
  },
  {
    id: "linkuri-catre-servicii-externe",
    nr: 59,
    titlu: "Link-uri către servicii externe",
    blocuri: [
      { tip: "paragraf", text: "Edinio poate conține link-uri către servicii operate de terți." },
      {
        tip: "paragraf",
        text: "Prezenta Politică nu reglementează modul în care operatorii independenți respectivi își prelucrează propriile date.",
      },
      {
        tip: "paragraf",
        text: "Recomandăm consultarea politicilor de confidențialitate ale respectivelor servicii.",
      },
    ],
  },
  {
    id: "modificarea-politicii",
    nr: 60,
    titlu: "Modificarea Politicii",
    blocuri: [
      { tip: "paragraf", text: "Putem actualiza prezenta Politică pentru a reflecta:" },
      {
        tip: "lista",
        items: [
          "modificări legislative;",
          "modificări ale Platformei;",
          "furnizori noi;",
          "funcționalități noi;",
          "noi operațiuni de prelucrare;",
          "modificări ale infrastructurii;",
          "cerințe ale autorităților;",
          "îmbunătățirea transparenței.",
        ],
      },
      {
        tip: "paragraf",
        text: "Data ultimei actualizări va fi indicată la începutul documentului.",
      },
      {
        tip: "paragraf",
        text: "În cazul modificărilor importante, putem informa utilizatorii prin:",
      },
      {
        tip: "lista",
        items: ["email;", "Platformă;", "notificare pe website;", "alte mijloace rezonabile."],
      },
    ],
  },
  {
    id: "dreptul-de-a-depune-plangere",
    nr: 61,
    titlu: "Dreptul de a depune o plângere",
    blocuri: [
      {
        tip: "paragraf",
        text: "Dacă apreciați că datele dumneavoastră sunt prelucrate cu încălcarea legislației, aveți dreptul de a vă adresa autorității de supraveghere.",
      },
      { tip: "paragraf", text: "În România:" },
      {
        tip: "adresa",
        linii: [
          "Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal – ANSPDCP",
          "Bd. G-ral Gheorghe Magheru nr. 28-30",
          "Sector 1",
          "010336 București",
          "România",
        ],
      },
      { tip: "paragraf", text: "Email: anspdcp@dataprotection.ro" },
      { tip: "paragraf", text: "Datele de contact sunt cele publicate în prezent de ANSPDCP." },
      {
        tip: "paragraf",
        text: "Vă încurajăm să ne contactați mai întâi la contact@edinio.com pentru a avea posibilitatea de a analiza situația.",
      },
      {
        tip: "paragraf",
        text: "Acest lucru nu limitează în niciun fel dreptul dumneavoastră de a depune o plângere la autoritatea competentă.",
      },
    ],
  },
  {
    id: "contact",
    nr: 62,
    titlu: "Contact",
    blocuri: [
      { tip: "paragraf", text: "Pentru orice solicitare privind:" },
      {
        tip: "lista",
        items: [
          "datele dumneavoastră;",
          "prezenta Politică;",
          "exercitarea drepturilor;",
          "securitatea datelor;",
          "o posibilă încălcare;",
          "modul în care folosim informațiile;",
        ],
      },
      { tip: "paragraf", text: "ne puteți contacta:" },
      {
        tip: "date",
        items: [
          { valoare: "VOID SFT GAMES SRL" },
          { eticheta: "CUI", valoare: "43474393" },
          { eticheta: "Nr. înmatriculare", valoare: "J18/1054/2020" },
          {
            eticheta: "Adresă",
            valoare:
              "Strada Progresului, Nr. 2, Bloc A29, Sc. 2, Et. 2, Ap. 10\nMătăsari, Județ Gorj, România",
          },
          { eticheta: "Telefon", valoare: "0750 456 809", href: "tel:+40750456809" },
          { eticheta: "Email", valoare: "contact@edinio.com", href: "mailto:contact@edinio.com" },
        ],
      },
    ],
  },
  {
    id: "dispozitii-finale",
    nr: 63,
    titlu: "Dispoziții finale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Prezenta Politică explică activitățile generale de prelucrare realizate în cadrul Edinio.",
      },
      {
        tip: "paragraf",
        text: "Pentru anumite funcționalități pot fi furnizate informări suplimentare atunci când natura prelucrării o impune.",
      },
      {
        tip: "paragraf",
        text: "În cazul în care Edinio prelucrează date în numele unui Client, relația dintre părți va fi guvernată suplimentar de Acordul privind Prelucrarea Datelor / DPA Edinio.",
      },
      {
        tip: "paragraf",
        text: "În cazul în care există diferențe între prezenta Politică și instrucțiunile documentate ale unui Client în privința datelor pentru care Clientul este Operator, prelucrarea efectuată de Edinio în calitate de Persoană Împuternicită se va realiza în conformitate cu DPA-ul, legislația aplicabilă și instrucțiunile legale ale Operatorului.",
      },
    ],
  },
];

export const CONFIDENTIALITATE: DocumentLegal = {
  titlu: TITLU,
  actualizare: ACTUALIZARE,
  preambul: PREAMBUL,
  sectiuni: SECTIUNI,
};
