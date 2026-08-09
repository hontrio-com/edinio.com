/**
 * Politica de Cookies Edinio.
 *
 * ⚠ TEXTUL E AL CLIENTULUI, CUVÂNT CU CUVÂNT (2026-08-10), cu cererea explicită
 * „să nu omiți nimic". Vezi antetul din `legal.ts` pentru regulile comune:
 * nu se rescrie, iar transcrierea se verifică MECANIC, nu recitind-o.
 *
 * ═══ SINGURUL DOCUMENT CU TABELE ═══
 *
 * Patru tabele: cookie-urile Cloudflare, cele Google Analytics, cele Meta și
 * tabelul rezumat cu cinci coloane. Sub `lg` fiecare rând devine o fișă — vezi
 * `TabelLegal` din `BlocuriLegal.tsx` pentru de ce nu se derulează lateral.
 *
 * ═══ ATENȚIE LA CE DESCRIE DOCUMENTUL ═══
 *
 * ⚠ Politica descrie un banner de cookie-uri cu trei butoane („Acceptă toate",
 * „Respinge opționale", „Personalizează"), categorii NEPRESELECTATE, un link
 * permanent „Setări Cookies" și blocarea tag-urilor înainte de consimțământ.
 * Sunt afirmații despre cum FUNCȚIONEAZĂ site-ul, nu doar despre intenții.
 * Dacă implementarea de pe edinio.com nu se potrivește cu ele, documentul devine
 * o declarație inexactă către utilizatori și autoritate.
 *
 * ═══ CE SE EVIDENȚIAZĂ ═══
 *
 * Doar durate și cifre din text (12 luni, 14 luni, 2 ani, 30 de minute,
 * 90 de zile). Nimic pe baza a ce mi se pare mie mai important.
 */

import type { Bloc, DocumentLegal, Sectiune } from "./legal";

const TITLU = "Politica de Cookies Edinio";

const ACTUALIZARE = "10 august 2026";

const PREAMBUL: Bloc[] = [
  {
    tip: "paragraf",
    text: "Prezenta Politică de Cookies explică modul în care VOID SFT GAMES SRL, operatorul platformei Edinio, utilizează cookie-uri și tehnologii similare în legătură cu website-ul edinio.com, Platforma Edinio și serviciile aferente.",
  },
  { tip: "paragraf", text: "Politica trebuie citită împreună cu:" },
  {
    tip: "lista",
    items: [
      "Termenii și Condițiile Edinio;",
      "Politica de Confidențialitate Edinio;",
      "setările privind cookie-urile disponibile pe website.",
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
        text: "În prezenta Politică, „Edinio”, „noi” sau „VOID SFT GAMES SRL” desemnează societatea de mai sus.",
      },
    ],
  },
  {
    id: "ce-sunt-cookieurile",
    nr: 2,
    titlu: "Ce sunt cookie-urile",
    blocuri: [
      {
        tip: "paragraf",
        text: "Cookie-urile sunt fișiere de mici dimensiuni care pot fi stocate pe computerul, telefonul, tableta sau alt dispozitiv utilizat pentru accesarea unui website.",
      },
      {
        tip: "paragraf",
        text: "Cookie-urile permit unui website sau unui furnizor terț să recunoască browserul și să păstreze anumite informații între accesări.",
      },
      { tip: "paragraf", text: "Cookie-urile pot fi utilizate, printre altele, pentru:" },
      {
        tip: "lista",
        items: [
          "menținerea unei sesiuni;",
          "autentificarea utilizatorului;",
          "securitate;",
          "memorarea preferințelor;",
          "memorarea opțiunilor privind confidențialitatea;",
          "analiza traficului;",
          "măsurarea performanței;",
          "măsurarea campaniilor publicitare;",
          "personalizarea anumitor experiențe.",
        ],
      },
      {
        tip: "paragraf",
        text: "ANSPDCP descrie cookie-ul ca pe un fișier de mici dimensiuni stocat pe terminalul utilizatorului și arată că durata acestuia este determinată în funcție de configurația sa.",
      },
    ],
  },
  {
    id: "tehnologii-similare",
    nr: 3,
    titlu: "Ce înțelegem prin „tehnologii similare”",
    blocuri: [
      {
        tip: "paragraf",
        text: "În prezenta Politică, termenul „cookie-uri” poate include, atunci când contextul o permite, și alte tehnologii cu funcții similare, precum:",
      },
      {
        tip: "lista",
        items: [
          "local storage;",
          "session storage;",
          "pixeli de tracking;",
          "tag-uri;",
          "identificatori online;",
          "token-uri de sesiune;",
          "SDK-uri;",
          "tehnologii utilizate pentru măsurarea conversiilor;",
          "alte mecanisme de stocare sau acces la informații de pe dispozitiv.",
        ],
      },
      {
        tip: "paragraf",
        text: "Google confirmă, de exemplu, că tehnologii precum identificatorii unici, pixel tags și local storage pot îndeplini funcții similare cookie-urilor.",
      },
    ],
  },
  {
    id: "de-ce-folosim-cookieuri",
    nr: 4,
    titlu: "De ce folosim cookie-uri",
    blocuri: [
      {
        tip: "paragraf",
        text: "În funcție de tipul și de preferințele exprimate de utilizator, cookie-urile pot fi utilizate pentru:",
      },
      { tip: "subtitlu", text: "Funcționarea Platformei" },
      {
        tip: "paragraf",
        text: "Pentru autentificare, sesiuni, securitate și furnizarea funcțiilor solicitate.",
      },
      { tip: "subtitlu", text: "Memorarea preferințelor" },
      {
        tip: "paragraf",
        text: "De exemplu, pentru a reține opțiunile utilizatorului privind cookie-urile.",
      },
      { tip: "subtitlu", text: "Securitate" },
      {
        tip: "paragraf",
        text: "Pentru identificarea traficului suspect, protejarea infrastructurii și prevenirea fraudelor sau atacurilor informatice.",
      },
      { tip: "subtitlu", text: "Analiză" },
      {
        tip: "paragraf",
        text: "Pentru a înțelege modul în care este utilizat website-ul și pentru a măsura performanța acestuia.",
      },
      { tip: "subtitlu", text: "Marketing" },
      {
        tip: "paragraf",
        text: "Pentru măsurarea campaniilor publicitare, atribuirea conversiilor și, atunci când utilizatorul permite acest lucru, optimizarea sau personalizarea publicității.",
      },
    ],
  },
  {
    id: "tipuri-dupa-durata",
    nr: 5,
    titlu: "Tipuri de cookie-uri în funcție de durată",
    blocuri: [
      { tip: "paragraf", text: "Cookie-urile pot fi:" },
      { tip: "subtitlu", text: "Cookie-uri de sesiune" },
      {
        tip: "paragraf",
        text: "Acestea sunt utilizate pentru durata unei sesiuni de navigare și, în mod obișnuit, expiră la încheierea sesiunii sau conform parametrilor tehnici ai serviciului respectiv.",
      },
      { tip: "subtitlu", text: "Cookie-uri persistente" },
      {
        tip: "paragraf",
        text: "Rămân stocate pentru o perioadă determinată sau până când sunt eliminate manual de utilizator.",
      },
      { tip: "paragraf", text: "Durata diferă în funcție de scop și de furnizor." },
    ],
  },
  {
    id: "cookieuri-proprii-si-ale-tertilor",
    nr: 6,
    titlu: "Cookie-uri proprii și cookie-uri ale terților",
    blocuri: [
      { tip: "subtitlu", text: "Cookie-uri proprii" },
      {
        tip: "paragraf",
        text: "Sunt cookie-uri plasate în legătură directă cu domeniul Edinio și utilizate pentru funcționarea sau administrarea serviciilor noastre.",
      },
      { tip: "subtitlu", text: "Cookie-uri ale terților" },
      {
        tip: "paragraf",
        text: "Anumite funcționalități sunt furnizate cu ajutorul unor servicii externe precum Google, Meta, Stripe sau Cloudflare.",
      },
      {
        tip: "paragraf",
        text: "Acești furnizori pot utiliza cookie-uri sau tehnologii similare în condițiile serviciilor lor și ale preferințelor utilizatorului.",
      },
    ],
  },
  {
    id: "categoriile-utilizate",
    nr: 7,
    titlu: "Categoriile de cookie-uri utilizate de Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio grupează cookie-urile și tehnologiile similare în următoarele categorii:",
      },
      {
        tip: "lista",
        items: ["Strict necesare", "Funcționale", "Analiză și performanță", "Marketing și publicitate"],
      },
    ],
  },
  {
    id: "cookieuri-strict-necesare",
    nr: 8,
    titlu: "Cookie-uri strict necesare",
    blocuri: [
      {
        tip: "paragraf",
        text: "Aceste cookie-uri sunt necesare funcționării website-ului sau furnizării unei funcționalități solicitate în mod expres de utilizator.",
      },
      { tip: "paragraf", text: "Pot fi utilizate pentru:" },
      {
        tip: "lista",
        items: [
          "autentificare;",
          "menținerea sesiunii;",
          "securitate;",
          "prevenirea fraudelor;",
          "memorarea preferințelor privind cookie-urile;",
          "protejarea infrastructurii;",
          "procesarea funcțiilor esențiale;",
          "gestionarea plăților în condiții de securitate.",
        ],
      },
      {
        tip: "paragraf",
        text: "Aceste cookie-uri nu pot fi dezactivate prin bannerul Edinio dacă sunt indispensabile furnizării serviciului solicitat.",
      },
      {
        tip: "paragraf",
        text: "Legea nr. 506/2004 prevede excepția de la consimțământ pentru operațiunile strict necesare transmiterii unei comunicații sau furnizării unui serviciu solicitat expres de utilizator.",
      },
    ],
  },
  {
    id: "cookieul-de-preferinte",
    nr: 9,
    titlu: "Cookie-ul pentru preferințele de confidențialitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează un mecanism tehnic pentru a memora opțiunile utilizatorului privind cookie-urile.",
      },
      { tip: "paragraf", text: "Acesta poate reține, de exemplu:" },
      {
        tip: "lista",
        items: [
          "dacă utilizatorul a răspuns bannerului;",
          "acceptarea sau refuzarea categoriei de analiză;",
          "acceptarea sau refuzarea categoriei de marketing;",
          "versiunea mecanismului de consimțământ;",
          "data sau momentul alegerii, dacă este necesar pentru evidență.",
        ],
      },
      {
        tip: "paragraf",
        text: "Acest mecanism este strict necesar, deoarece fără el website-ul nu ar putea respecta și memora preferințele utilizatorului.",
      },
      {
        tip: "paragraf",
        text: "Pentru implementarea Edinio recomand ca preferința să fie păstrată pentru 12 luni, după care utilizatorului să îi fie solicitată din nou opțiunea, dacă între timp nu intervine o modificare relevantă care justifică solicitarea mai devreme.",
        evidenta: ["12 luni"],
      },
    ],
  },
  {
    id: "autentificarea-si-sesiunea",
    nr: 10,
    titlu: "Autentificarea și sesiunea Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru utilizatorii autentificați, Platforma poate utiliza cookie-uri, token-uri sau alte mecanisme de stocare necesare:",
      },
      {
        tip: "lista",
        items: [
          "autentificării;",
          "menținerii sesiunii;",
          "identificării Contului;",
          "protejării sesiunii;",
          "gestionării permisiunilor;",
          "reînnoirii sigure a sesiunii.",
        ],
      },
      {
        tip: "paragraf",
        text: "O parte a infrastructurii de autentificare și baze de date Edinio este furnizată prin Supabase.",
      },
      {
        tip: "paragraf",
        text: "Denumirile tehnice și structura token-urilor sau cookie-urilor pot varia în funcție de configurația Platformei și de actualizările infrastructurii.",
      },
      {
        tip: "paragraf",
        text: "Aceste mecanisme sunt considerate strict necesare atunci când sunt indispensabile autentificării sau menținerii sesiunii solicitate de utilizator.",
      },
    ],
  },
  {
    id: "cloudflare",
    nr: 11,
    titlu: "Cloudflare și cookie-urile de securitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Cloudflare, inclusiv pentru infrastructura asociată domeniului edinio-cdn.com, pentru:",
      },
      {
        tip: "lista",
        items: [
          "distribuirea conținutului;",
          "securitate;",
          "protejarea împotriva traficului abuziv;",
          "reducerea riscului de atac;",
          "performanță și disponibilitate.",
        ],
      },
      {
        tip: "paragraf",
        text: "În funcție de serviciile Cloudflare active și de situația tehnică, Cloudflare poate utiliza cookie-uri strict necesare.",
      },
      { tip: "paragraf", text: "Exemple pot include:" },
      {
        tip: "tabel",
        antet: ["Cookie", "Scop", "Durată"],
        randuri: [
          [
            "__cf_bm",
            "Detectarea și gestionarea traficului automatizat, dacă funcțiile Cloudflare Bot sunt active",
            "30 minute de inactivitate",
          ],
          [
            "cf_clearance",
            "Păstrarea dovezii că un challenge de securitate Cloudflare a fost trecut",
            "Depinde de configurația de securitate",
          ],
          [
            "__cflb",
            "Menținerea afinității față de un server atunci când funcția Load Balancer este utilizată",
            "De la câteva secunde până la 24 ore",
          ],
        ],
      },
      {
        tip: "paragraf",
        text: "Cloudflare documentează că __cf_bm expiră după 30 de minute de inactivitate, iar alte cookie-uri sunt setate numai dacă funcționalitățile Cloudflare aferente sunt active.",
        evidenta: ["30 de minute"],
      },
      {
        tip: "paragraf",
        text: "Nu toate cookie-urile de mai sus vor exista în orice moment pe dispozitivul fiecărui utilizator.",
      },
    ],
  },
  {
    id: "stripe",
    nr: 12,
    titlu: "Stripe și cookie-urile pentru plăți",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Stripe pentru procesarea plăților aferente Abonamentelor Edinio.",
      },
      {
        tip: "paragraf",
        text: "Stripe poate utiliza cookie-uri și tehnologii similare necesare:",
      },
      {
        tip: "lista",
        items: [
          "procesării plăților;",
          "autentificării;",
          "securității;",
          "detectării fraudelor;",
          "prevenirii tranzacțiilor abuzive;",
          "funcționării componentelor sale de plată.",
        ],
      },
      {
        tip: "paragraf",
        text: "Stripe arată expres că utilizează cookie-uri și tehnologii similare pentru prevenirea fraudei și securizarea tranzacțiilor.",
      },
      {
        tip: "paragraf",
        text: "Cookie-urile Stripe strict necesare procesării și securizării unei plăți pot funcționa fără consimțământ separat în măsura în care sunt indispensabile operațiunii solicitate de utilizator.",
      },
      { tip: "paragraf", text: "Denumirile și duratele exacte pot varia în funcție de:" },
      {
        tip: "lista",
        items: [
          "serviciul Stripe utilizat;",
          "browser;",
          "metoda de plată;",
          "cerințele antifraudă;",
          "modificările efectuate de Stripe.",
        ],
      },
    ],
  },
  {
    id: "cookieuri-functionale",
    nr: 13,
    titlu: "Cookie-uri funcționale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Cookie-urile funcționale pot fi utilizate pentru îmbunătățirea experienței, de exemplu pentru:",
      },
      {
        tip: "lista",
        items: [
          "memorarea unor preferințe;",
          "păstrarea anumitor setări;",
          "personalizarea interfeței;",
          "memorarea alegerilor care nu sunt strict necesare.",
        ],
      },
      {
        tip: "paragraf",
        text: "În cazul în care un cookie funcțional nu este strict necesar serviciului solicitat, utilizarea acestuia va fi supusă opțiunilor utilizatorului, după caz.",
      },
    ],
  },
  {
    id: "google-analytics-4",
    nr: 14,
    titlu: "Google Analytics 4",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Google Analytics 4 pentru a înțelege modul în care este utilizat website-ul și pentru a analiza performanța acestuia.",
      },
      {
        tip: "paragraf",
        text: "Google Analytics poate permite măsurarea unor informații precum:",
      },
      {
        tip: "lista",
        items: [
          "paginile accesate;",
          "sursa traficului;",
          "durata sesiunii;",
          "evenimente și interacțiuni;",
          "tipul dispozitivului;",
          "browserul;",
          "sistemul de operare;",
          "informații tehnice;",
          "informații aproximative privind locația.",
        ],
      },
      {
        tip: "paragraf",
        text: "Google documentează că GA4 utilizează cookie-uri first-party pentru distingerea utilizatorilor și persistența stării sesiunii.",
      },
    ],
  },
  {
    id: "cookieurile-google-analytics",
    nr: 15,
    titlu: "Cookie-urile Google Analytics",
    blocuri: [
      {
        tip: "paragraf",
        text: "În configurația standard Google Analytics 4 pot fi utilizate, printre altele:",
      },
      {
        tip: "tabel",
        antet: ["Cookie", "Furnizor", "Scop", "Durată implicită"],
        randuri: [
          ["_ga", "Google Analytics", "Distinge utilizatorii", "2 ani"],
          ["_ga_<measurement-id>", "Google Analytics", "Păstrează starea sesiunii", "2 ani"],
        ],
      },
      {
        tip: "paragraf",
        text: "Aceste durate sunt duratele implicite documentate de Google și pot fi modificate prin configurarea tag-ului.",
      },
      {
        tip: "paragraf",
        text: "Durata cookie-ului trebuie diferențiată de durata de păstrare a datelor în Google Analytics. Pentru Edinio, retenția datelor la nivel de utilizator și eveniment va fi configurată la 14 luni, conform Politicii de Confidențialitate.",
        evidenta: ["14 luni"],
      },
    ],
  },
  {
    id: "google-analytics-optional",
    nr: 16,
    titlu: "Google Analytics este opțional",
    blocuri: [
      {
        tip: "paragraf",
        text: "Cookie-urile Google Analytics nu sunt necesare funcționării Edinio.",
      },
      {
        tip: "paragraf",
        text: "Prin urmare, Edinio le va utiliza numai în condițiile opțiunii exprimate de utilizator pentru categoria:",
      },
      { tip: "subtitlu", text: "Analiză și performanță" },
      {
        tip: "paragraf",
        text: "Dacă această categorie este refuzată, Edinio nu va scrie sau citi cookie-uri Google Analytics pentru respectiva categorie.",
      },
      {
        tip: "paragraf",
        text: "Google Consent Mode permite setarea analytics_storage în funcție de acordul utilizatorului.",
      },
      {
        tip: "paragraf",
        text: "Pentru implementarea Edinio recomand însă Basic Consent Mode / blocarea tag-urilor înainte de consimțământ, astfel încât GA4 să nu fie executat pentru utilizatorii care nu au acceptat categoria de analiză, în loc să ne bazăm pe transmiterea de „cookieless pings”.",
      },
    ],
  },
  {
    id: "google-tag-manager",
    nr: 17,
    titlu: "Google Tag Manager",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio utilizează Google Tag Manager pentru administrarea centralizată a anumitor scripturi și tag-uri.",
      },
      { tip: "paragraf", text: "Google Tag Manager poate gestiona, de exemplu:" },
      {
        tip: "lista",
        items: [
          "Google Analytics;",
          "Meta Pixel;",
          "tag-uri de măsurare;",
          "alte servicii integrate ulterior.",
        ],
      },
      {
        tip: "paragraf",
        text: "Google Tag Manager trebuie privit în principal ca un mecanism de administrare a tag-urilor. Cookie-urile și datele rezultate depind de serviciile care sunt executate prin intermediul său.",
      },
      {
        tip: "paragraf",
        text: "Edinio va configura Google Tag Manager astfel încât tag-urile de analiză și marketing să respecte opțiunile utilizatorului.",
      },
      { tip: "paragraf", text: "Google oferă în acest scop semnale distincte precum:" },
      {
        tip: "lista",
        items: ["analytics_storage;", "ad_storage;", "ad_user_data;", "ad_personalization."],
      },
    ],
  },
  {
    id: "meta-pixel",
    nr: 18,
    titlu: "Meta Pixel",
    blocuri: [
      { tip: "paragraf", text: "Edinio utilizează Meta Pixel, furnizat de Meta, pentru:" },
      {
        tip: "lista",
        items: [
          "măsurarea campaniilor publicitare;",
          "atribuirea conversiilor;",
          "măsurarea acțiunilor generate de reclame;",
          "optimizarea campaniilor;",
          "crearea sau utilizarea audiențelor, dacă utilizatorul și configurația permit acest lucru.",
        ],
      },
      {
        tip: "paragraf",
        text: "Meta explică faptul că Pixelul se bazează pe cookie-uri Meta și poate urmări, în mod implicit, URL-urile, domeniile și dispozitivele utilizatorilor.",
      },
    ],
  },
  {
    id: "cookieuri-meta-pixel",
    nr: 19,
    titlu: "Cookie-uri Meta Pixel",
    blocuri: [
      {
        tip: "paragraf",
        text: "În funcție de configurația Meta Pixel și de modul în care un utilizator ajunge pe Edinio, pot fi utilizate identificatoare precum:",
      },
      {
        tip: "tabel",
        antet: ["Cookie / identificator", "Scop"],
        randuri: [
          [
            "_fbp",
            "Identificator de browser utilizat în ecosistemul Meta pentru măsurare și atribuirea evenimentelor",
          ],
          [
            "_fbc",
            "Identificator asociat click-urilor provenite din publicitatea Meta, atunci când este aplicabil",
          ],
        ],
      },
      {
        tip: "paragraf",
        text: "Meta documentează utilizarea valorilor _fbp și _fbc pentru identificarea browserului și a click-ului în cadrul sistemelor sale de măsurare și Conversions API.",
      },
      {
        tip: "paragraf",
        text: "Acestea sunt tehnologii de marketing și nu sunt necesare funcționării Edinio.",
      },
    ],
  },
  {
    id: "meta-pixel-doar-dupa-consimtamant",
    nr: 20,
    titlu: "Meta Pixel este activat numai după consimțământ",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru utilizatorii cărora li se aplică cerințele europene privind cookie-urile, Meta precizează că business-urile care utilizează Meta Business Tools trebuie să implementeze propriul mecanism de consimțământ și că cookie-urile neesențiale nu trebuie setate/citite fără acordul corespunzător.",
      },
      { tip: "paragraf", text: "Prin urmare, pe Edinio:" },
      {
        tip: "paragraf",
        text: "Meta Pixel nu trebuie să fie executat înainte ca utilizatorul să accepte categoria „Marketing și publicitate”.",
      },
      {
        tip: "paragraf",
        text: "Refuzarea acestei categorii nu împiedică utilizarea funcționalităților esențiale Edinio.",
      },
    ],
  },
  {
    id: "google-ads",
    nr: 21,
    titlu: "Google Ads și alte servicii Google de publicitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "La momentul activării unor servicii Google suplimentare, precum:",
      },
      {
        tip: "lista",
        items: [
          "Google Ads Conversion Tracking;",
          "Google Ads Remarketing;",
          "alte funcționalități publicitare Google,",
        ],
      },
      {
        tip: "paragraf",
        text: "aceste tehnologii vor fi încadrate în categoria Marketing și publicitate și vor respecta opțiunea utilizatorului.",
      },
      {
        tip: "paragraf",
        text: "Google utilizează, în funcție de serviciu, cookie-uri precum cele care încep cu _gcl_ pentru măsurarea interacțiunilor și conversiilor asociate reclamelor. Google indică pentru _gcl_ o durată de 90 de zile.",
        evidenta: ["90 de zile"],
      },
      {
        tip: "paragraf",
        text: "Dacă astfel de servicii nu sunt active, cookie-urile corespunzătoare nu vor fi plasate de Edinio.",
      },
    ],
  },
  {
    id: "tabel-rezumat",
    nr: 22,
    titlu: "Tabel rezumat",
    blocuri: [
      {
        tip: "paragraf",
        text: "În configurația Edinio, principalele cookie-uri și tehnologii pot include:",
      },
      {
        tip: "tabel",
        antet: ["Nume / categorie", "Furnizor", "Categorie", "Scop", "Durată"],
        randuri: [
          [
            "Preferințe cookies Edinio",
            "Edinio",
            "Strict necesar",
            "Memorarea opțiunilor privind cookie-urile",
            "aprox. 12 luni",
          ],
          [
            "Token/sesiune autentificare",
            "Edinio / Supabase",
            "Strict necesar",
            "Autentificare și menținerea sesiunii",
            "În funcție de sesiune/configurare",
          ],
          [
            "__cf_bm*",
            "Cloudflare",
            "Strict necesar",
            "Protecție anti-bot",
            "30 min. de inactivitate",
          ],
          [
            "cf_clearance*",
            "Cloudflare",
            "Strict necesar",
            "Memorarea validării unui challenge",
            "Conform configurării Cloudflare",
          ],
          ["_ga", "Google", "Analiză", "Distinge utilizatorii", "implicit 2 ani"],
          ["_ga_<id>", "Google", "Analiză", "Păstrează starea sesiunii", "implicit 2 ani"],
          [
            "_fbp",
            "Meta",
            "Marketing",
            "Identificator browser / măsurarea publicității",
            "Persistent, conform configurației Meta",
          ],
          [
            "_fbc*",
            "Meta",
            "Marketing",
            "Atribuirea click-urilor Meta",
            "Persistent, conform configurației Meta",
          ],
          ["_gcl_**", "Google", "Marketing", "Măsurarea conversiilor Google Ads", "90 zile"],
          [
            "Cookie-uri Stripe*",
            "Stripe",
            "Strict necesar",
            "Procesarea sigură a plăților și antifraudă",
            "Variabil",
          ],
        ],
        nota: "* Cookie-ul este setat doar atunci când funcționalitatea relevantă este utilizată sau activă.",
      },
      {
        tip: "paragraf",
        text: "Lista poate evolua odată cu actualizările tehnice ale Edinio și ale furnizorilor.",
      },
    ],
  },
  {
    id: "denumirile-se-pot-schimba",
    nr: 23,
    titlu: "De ce nu putem garanta că denumirile nu se vor schimba",
    blocuri: [
      { tip: "paragraf", text: "Unele cookie-uri sunt administrate de servicii terțe." },
      {
        tip: "paragraf",
        text: "Google, Meta, Stripe, Cloudflare sau alți furnizori pot:",
      },
      {
        tip: "lista",
        items: [
          "modifica numele cookie-urilor;",
          "modifica durata;",
          "introduce tehnologii noi;",
          "elimina cookie-uri;",
          "modifica mecanismul tehnic de funcționare.",
        ],
      },
      {
        tip: "paragraf",
        text: "Edinio va actualiza această Politică atunci când o modificare este relevantă pentru transparența față de utilizatori.",
      },
    ],
  },
  {
    id: "consimtamantul-pentru-optionale",
    nr: 24,
    titlu: "Consimțământul pentru cookie-urile opționale",
    blocuri: [
      {
        tip: "paragraf",
        text: "La prima accesare, utilizatorului îi este prezentat un mecanism prin care poate alege modul în care dorește să fie utilizate cookie-urile opționale.",
      },
      { tip: "paragraf", text: "Edinio nu consideră următoarele comportamente drept consimțământ:" },
      {
        tip: "lista",
        items: [
          "simpla navigare;",
          "scroll-ul paginii;",
          "închiderea bannerului;",
          "lipsa unei acțiuni;",
          "existența unor căsuțe bifate în prealabil.",
        ],
      },
      {
        tip: "paragraf",
        text: "GDPR prevede că tăcerea, inacțiunea și căsuțele preselectate nu reprezintă consimțământ valid.",
      },
    ],
  },
  {
    id: "optiunile-din-banner",
    nr: 25,
    titlu: "Opțiunile disponibile în banner",
    blocuri: [
      { tip: "paragraf", text: "Bannerul Edinio trebuie să permită utilizatorului cel puțin:" },
      { tip: "subtitlu", text: "Acceptă toate" },
      { tip: "paragraf", text: "Activează toate categoriile opționale." },
      { tip: "subtitlu", text: "Respinge opționale" },
      { tip: "paragraf", text: "Păstrează numai tehnologiile strict necesare." },
      { tip: "subtitlu", text: "Personalizează" },
      { tip: "paragraf", text: "Permite selectarea individuală a categoriilor opționale." },
      {
        tip: "paragraf",
        text: "EDPB a constatat că lipsa unei posibilități reale de refuz în banner este, în opinia majorității autorităților participante la taskforce, incompatibilă cu cerințele privind consimțământul valid.",
      },
    ],
  },
  {
    id: "categoriile-nu-sunt-preselectate",
    nr: 26,
    titlu: "Categoriile nu vor fi preselectate",
    blocuri: [
      { tip: "paragraf", text: "În meniul de personalizare:" },
      { tip: "subtitlu", text: "Strict necesare" },
      {
        tip: "paragraf",
        text: "Activ permanent, deoarece sunt necesare funcționării serviciului.",
      },
      { tip: "subtitlu", text: "Funcționale" },
      { tip: "paragraf", text: "Dezactivate implicit dacă necesită consimțământ." },
      { tip: "subtitlu", text: "Analiză și performanță" },
      { tip: "paragraf", text: "Dezactivate implicit." },
      { tip: "subtitlu", text: "Marketing și publicitate" },
      { tip: "paragraf", text: "Dezactivate implicit." },
      {
        tip: "paragraf",
        text: "Utilizatorul trebuie să efectueze o acțiune pozitivă pentru activarea categoriilor opționale.",
      },
    ],
  },
  {
    id: "refuzarea-cookieurilor-optionale",
    nr: 27,
    titlu: "Refuzarea cookie-urilor opționale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Refuzarea cookie-urilor opționale nu împiedică accesarea funcțiilor de bază ale website-ului și nu condiționează utilizarea serviciilor Edinio care nu depind de tehnologia respectivă.",
      },
      { tip: "paragraf", text: "De exemplu, un utilizator trebuie să poată:" },
      {
        tip: "lista",
        items: [
          "accesa website-ul;",
          "consulta prețurile;",
          "crea un Cont;",
          "utiliza Platforma;",
          "contracta un Abonament;",
        ],
      },
      {
        tip: "paragraf",
        text: "fără a fi obligat să accepte Google Analytics sau Meta Pixel.",
      },
    ],
  },
  {
    id: "retragerea-consimtamantului",
    nr: 28,
    titlu: "Retragerea consimțământului",
    blocuri: [
      { tip: "paragraf", text: "Utilizatorul își poate modifica opțiunile în orice moment." },
      {
        tip: "paragraf",
        text: "Edinio va pune la dispoziție un link sau buton permanent, de exemplu:",
      },
      { tip: "subtitlu", text: "Setări Cookies" },
      { tip: "paragraf", text: "Prin acesta utilizatorul va putea:" },
      {
        tip: "lista",
        items: [
          "verifica opțiunile;",
          "activa o categorie;",
          "dezactiva o categorie;",
          "retrage integral consimțământul pentru tehnologiile opționale.",
        ],
      },
      {
        tip: "paragraf",
        text: "GDPR prevede că retragerea consimțământului trebuie să fie posibilă, iar retragerea nu afectează legalitatea prelucrării efectuate anterior acesteia.",
      },
    ],
  },
  {
    id: "ce-se-intampla-dupa-retragere",
    nr: 29,
    titlu: "Ce se întâmplă după retragere",
    blocuri: [
      { tip: "paragraf", text: "După retragerea consimțământului:" },
      {
        tip: "lista",
        items: [
          "tag-urile respective nu vor mai fi executate pentru accesările viitoare;",
          "nu vor mai fi create cookie-uri noi pentru categoria respectivă;",
          "Edinio poate elimina cookie-urile proprii relevante atunci când este posibil din punct de vedere tehnic.",
        ],
      },
      {
        tip: "paragraf",
        text: "În cazul cookie-urilor plasate de terți, utilizatorul poate fi nevoit să le elimine și prin:",
      },
      {
        tip: "lista",
        items: [
          "mecanismul furnizorului;",
          "setările browserului;",
          "ștergerea datelor de navigare.",
        ],
      },
      {
        tip: "paragraf",
        text: "Retragerea nu determină automat ștergerea datelor deja transmise unui terț înainte de retragere, acestea fiind gestionate conform legislației și politicilor aplicabile furnizorului.",
      },
    ],
  },
  {
    id: "setarile-browserului",
    nr: 30,
    titlu: "Setările browserului",
    blocuri: [
      { tip: "paragraf", text: "Majoritatea browserelor permit:" },
      {
        tip: "lista",
        items: [
          "vizualizarea cookie-urilor;",
          "ștergerea acestora;",
          "blocarea tuturor cookie-urilor;",
          "blocarea cookie-urilor terților;",
          "ștergerea automată la închiderea browserului.",
        ],
      },
      {
        tip: "paragraf",
        text: "Modificarea setărilor browserului este separată de mecanismul de consimțământ Edinio.",
      },
      {
        tip: "paragraf",
        text: "Blocarea tuturor cookie-urilor, inclusiv a celor strict necesare, poate face anumite funcții indisponibile sau poate împiedica autentificarea.",
      },
    ],
  },
  {
    id: "do-not-track",
    nr: 31,
    titlu: "Do Not Track și alte semnale ale browserului",
    blocuri: [
      {
        tip: "paragraf",
        text: "Anumite browsere sau dispozitive pot transmite semnale privind preferințele de tracking.",
      },
      {
        tip: "paragraf",
        text: "Modul în care asemenea semnale sunt recunoscute poate varia în funcție de:",
      },
      {
        tip: "lista",
        items: [
          "browser;",
          "standardul respectiv;",
          "serviciul extern utilizat;",
          "suportul tehnic al furnizorului.",
        ],
      },
      {
        tip: "paragraf",
        text: "Mecanismul principal de administrare a consimțământului pe Edinio rămâne sistemul Setări Cookies.",
      },
    ],
  },
  {
    id: "transferuri-internationale",
    nr: 32,
    titlu: "Transferuri internaționale",
    blocuri: [
      {
        tip: "paragraf",
        text: "Google, Meta, Stripe, Cloudflare și alți furnizori utilizați de Edinio pot face parte din grupuri internaționale și pot utiliza infrastructură sau subfurnizori din afara Spațiului Economic European.",
      },
      {
        tip: "paragraf",
        text: "Detaliile privind transferurile internaționale, mecanismele juridice utilizate și destinatarii sunt explicate mai amplu în Politica de Confidențialitate Edinio.",
      },
    ],
  },
  {
    id: "magazinele-create-prin-edinio",
    nr: 33,
    titlu: "Magazinele create prin Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "Această Politică reglementează în primul rând cookie-urile și tehnologiile utilizate de VOID SFT GAMES SRL pentru edinio.com și Platforma Edinio.",
      },
      {
        tip: "paragraf",
        text: "Magazinele create de Clienții Edinio sunt operate de persoane juridice independente.",
      },
      { tip: "paragraf", text: "Comerciantul care operează un Magazin este responsabil pentru:" },
      {
        tip: "lista",
        items: [
          "propriile cookie-uri;",
          "propriul Meta Pixel;",
          "propriul Google Analytics;",
          "propriile tag-uri de marketing;",
          "integrările instalate;",
          "obținerea consimțământului;",
          "propria Politică de Cookies;",
          "informarea cumpărătorilor.",
        ],
      },
      {
        tip: "paragraf",
        text: "Faptul că magazinul funcționează tehnic pe infrastructura Edinio nu transferă automat către VOID SFT GAMES SRL responsabilitatea comerciantului pentru tehnologiile de tracking pe care acesta le activează pentru propria afacere.",
      },
    ],
  },
  {
    id: "cookieurile-tehnice-ale-magazinelor",
    nr: 34,
    titlu: "Cookie-urile tehnice ale magazinelor Edinio",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio poate furniza anumite mecanisme tehnice comune magazinelor, precum:",
      },
      {
        tip: "lista",
        items: [
          "sesiunea;",
          "securitatea;",
          "coșul;",
          "preferințele strict necesare;",
          "infrastructura CDN;",
          "protecția anti-abuz.",
        ],
      },
      {
        tip: "paragraf",
        text: "În măsura în care Edinio furnizează aceste componente exclusiv ca parte a infrastructurii tehnice, rolurile privind prelucrarea datelor vor fi stabilite conform:",
      },
      {
        tip: "lista",
        items: [
          "Termenilor și Condițiilor;",
          "DPA-ului Edinio;",
          "GDPR;",
          "legislației aplicabile comunicațiilor electronice.",
        ],
      },
      {
        tip: "paragraf",
        text: "Clientul rămâne responsabil pentru configurarea propriului magazin și pentru tehnologiile suplimentare activate de acesta.",
      },
    ],
  },
  {
    id: "actualizarea-listei",
    nr: 35,
    titlu: "Actualizarea listei de cookie-uri",
    blocuri: [
      {
        tip: "paragraf",
        text: "Datorită evoluției Platformei și serviciilor externe, lista cookie-urilor poate fi actualizată periodic.",
      },
      { tip: "paragraf", text: "Putem modifica această Politică atunci când:" },
      {
        tip: "lista",
        items: [
          "introducem un furnizor;",
          "eliminăm un furnizor;",
          "activăm o funcționalitate;",
          "se modifică scopul unei tehnologii;",
          "un furnizor modifică cookie-urile;",
          "se modifică legislația;",
          "actualizăm mecanismul de consimțământ.",
        ],
      },
      {
        tip: "paragraf",
        text: "În cazul modificărilor care afectează semnificativ scopurile pentru care a fost acordat consimțământul, putem solicita din nou alegerea utilizatorului.",
      },
    ],
  },
  {
    id: "verificarea-periodica",
    nr: 36,
    titlu: "Verificarea periodică a cookie-urilor",
    blocuri: [
      {
        tip: "paragraf",
        text: "Edinio poate efectua verificări tehnice periodice pentru a identifica:",
      },
      {
        tip: "lista",
        items: [
          "cookie-uri noi;",
          "tag-uri noi;",
          "modificări ale furnizorilor;",
          "tehnologii care nu mai sunt utilizate;",
          "discrepanțe dintre implementarea tehnică și această Politică.",
        ],
      },
      {
        tip: "paragraf",
        text: "Politica trebuie să reflecte în permanență, într-o manieră rezonabilă și transparentă, tehnologiile utilizate efectiv.",
      },
    ],
  },
  {
    id: "securitate",
    nr: 37,
    titlu: "Securitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "Cookie-urile nu sunt programe executabile și nu reprezintă în sine programe software sau viruși. ANSPDCP explică faptul că un cookie este un fișier pasiv și nu poate accesa în mod direct informațiile de pe hard disk-ul utilizatorului.",
      },
      {
        tip: "paragraf",
        text: "Totuși, identificatorii și datele asociate cookie-urilor trebuie protejate corespunzător.",
      },
      { tip: "paragraf", text: "Edinio poate utiliza, după caz, măsuri precum:" },
      {
        tip: "lista",
        items: [
          "HTTPS;",
          "Secure cookies;",
          "HttpOnly;",
          "SameSite;",
          "expirare limitată;",
          "protecție CSRF;",
          "control al accesului;",
          "mecanisme de securitate Cloudflare.",
        ],
      },
    ],
  },
  {
    id: "relatia-cu-politica-de-confidentialitate",
    nr: 38,
    titlu: "Relația cu Politica de Confidențialitate",
    blocuri: [
      {
        tip: "paragraf",
        text: "Atunci când datele colectate prin cookie-uri sau tehnologii similare constituie date cu caracter personal, prelucrarea acestora este reglementată și de Politica de Confidențialitate Edinio.",
      },
      { tip: "paragraf", text: "Aceasta explică, printre altele:" },
      {
        tip: "lista",
        items: [
          "operatorul;",
          "categoriile de date;",
          "temeiurile juridice;",
          "destinatarii;",
          "furnizorii tehnici;",
          "transferurile internaționale;",
          "perioadele de păstrare;",
          "drepturile persoanelor vizate.",
        ],
      },
    ],
  },
  {
    id: "drepturile-privind-datele",
    nr: 39,
    titlu: "Drepturile privind datele cu caracter personal",
    blocuri: [
      {
        tip: "paragraf",
        text: "Dacă informațiile rezultate din utilizarea cookie-urilor constituie date personale, utilizatorul poate beneficia, în condițiile GDPR, de drepturi precum:",
      },
      {
        tip: "lista",
        items: [
          "acces;",
          "rectificare;",
          "ștergere;",
          "restricționare;",
          "opoziție;",
          "portabilitate, atunci când este aplicabilă;",
          "retragerea consimțământului.",
        ],
      },
      { tip: "paragraf", text: "Solicitările pot fi transmise la:" },
      { tip: "email", adresa: "contact@edinio.com" },
    ],
  },
  {
    id: "plangeri",
    nr: 40,
    titlu: "Plângeri",
    blocuri: [
      {
        tip: "paragraf",
        text: "Dacă apreciați că datele dumneavoastră au fost prelucrate cu încălcarea legislației, aveți dreptul să sesizați autoritatea competentă.",
      },
      { tip: "paragraf", text: "În România:" },
      {
        tip: "adresa",
        linii: [
          "Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal – ANSPDCP",
          "Bd. G-ral Gheorghe Magheru nr. 28-30",
          "Sector 1, București",
          "România",
        ],
      },
    ],
  },
  {
    id: "modificarea-politicii",
    nr: 41,
    titlu: "Modificarea Politicii",
    blocuri: [
      { tip: "paragraf", text: "Putem modifica această Politică pentru a reflecta:" },
      {
        tip: "lista",
        items: [
          "schimbări tehnologice;",
          "furnizori noi;",
          "funcționalități noi;",
          "modificări ale cookie-urilor;",
          "schimbări legislative;",
          "modificări privind modul în care folosim datele.",
        ],
      },
      {
        tip: "paragraf",
        text: "Data ultimei actualizări va fi afișată la începutul documentului.",
      },
    ],
  },
  {
    id: "contact",
    nr: 42,
    titlu: "Contact",
    blocuri: [
      {
        tip: "paragraf",
        text: "Pentru întrebări privind cookie-urile sau preferințele dumneavoastră ne puteți contacta:",
      },
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
];

export const COOKIES: DocumentLegal = {
  titlu: TITLU,
  actualizare: ACTUALIZARE,
  preambul: PREAMBUL,
  sectiuni: SECTIUNI,
};
