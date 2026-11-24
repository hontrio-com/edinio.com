# Suport clienți: chat în magazin (Tidio, tawk.to, Intercom, Zendesk)

Plan scris pe 22.11.2026, la cererea proprietarului: „vreau să activăm toate integrările de la Suport Clienți ...
fă un plan complet ca să îți dau aprobare”. **Aprobat în aceeași zi** („Merge pe recomandările tale, fă totul complet pe
local”): etapele A și B au fost scrise și probate local, apoi **livrate pe 24.11.2026** („Push, toate patru”), cu
migrația aplicată în producție înaintea codului. Ce s-a construit, ce s-a măsurat și ce a ieșit altfel decât aici e în
`SUPORT-CLIENTI.md`; abaterile sunt și în secțiunea 11.

Surse citite: `developers.tidio.com` (`llms.txt` + paginile `.md`), `developers.intercom.com` (`llms.txt`, Messenger
pentru web, autentificare, API 2.18), `developer.zendesk.com` (`llms.txt`, widgetul de mesagerie, autentificare,
cererile anonime, OAuth global), `developer.tawk.to/jsapi` și `/webhooks`. Ce e „măsurat” e spus ca atare; restul vine
din documentație și se verifică la implementare, cu conturi de probă.

## 1. Pe scurt

- Comerciantul își leagă contul de chat (o cheie publică) și pornește chatul. În magazin apare un buton de chat.
- **Conversațiile se poartă în aplicația furnizorului** (Tidio, tawk.to, Intercom, Zendesk: pe web și pe telefon), nu
  în Edinio. Noi punem chatul în magazin și îi spunem operatorului cine e clientul și ce a comandat.
- **Un singur furnizor pornit o dată.** Două chaturi în aceeași pagină se calcă între ele.
- **Magazinele fără chat rămân neatinse**: nicio linie nouă în pagina lor.

## 2. Starea de azi (din cod, 22.11.2026)

- Cele patru sunt carduri „În curând”: în panou (`dashboard/features/page.tsx`, rubrica `suport`) și pe site
  (`lib/website/integrari-catalog.ts`, `stare: "in-curand"`). Nu există nicio coloană și niciun fișier al lor.
- Scripturile terților se montează în `app/(public)/[slug]/layout.tsx`, sub `ConsentGate`, cu două categorii de acord
  (`analytics`, `marketing`). Nu se montează în previzualizarea din editor (`DoarInMagazinReal`) și nici în zona de cont
  (`DoarInAfaraContului`).
- Magazinul are deja butoane plutitoare „Contact rapid” (WhatsApp, telefon), dar numai pe prima pagină și în catalog
  (`MiniStoreRenderer`), în colțul din dreapta jos. Pe telefon mai sunt bare lipite jos (coșul, pagina de produs).
- CSP-ul de azi lasă chaturile să meargă fără nicio schimbare (`script-src`, `connect-src`, `frame-src` au `https:`,
  iar `connect-src` are și `wss:`). ⚠ Etapa amânată „CSP strict” (28.9) va trebui să țină cont de ele.
- Conturile de client există numai pe domeniul propriu al magazinului, iar layoutul vitrinei nu citește sesiunea.

## 3. Ce vede comerciantul

1. **Integrări > Suport clienți**: patru carduri, ca la celelalte rubrici. Cel pornit poartă „Activ”.
2. **Pagina furnizorului** (aceeași formă ca la celelalte integrări, `PaginaIntegrare`):
   - **Pasul 1, „Leagă contul”**: un singur câmp de lipit (vezi tabelul din secțiunea 5). Poate lipi și tot codul de
     instalare primit de la furnizor: scoatem noi cheia din el. Butonul „Verifică” spune pe loc dacă cheia există.
   - **Pasul 2, „Cum apare în magazin”**: butonul (al magazinului sau al furnizorului), partea (dreapta / stânga),
     textul de lângă buton („Ai nevoie de ajutor?”), unde se ascunde (pe telefon, la pagina de comandă) și când se
     încarcă („la prima apăsare” sau „automat”).
   - **Pasul 3, „Ce știe operatorul despre client”**: trei comutatoare: numele și emailul clientului cu cont, pagina
     și produsul la care se uită, comanda abia plasată. La furnizorii care cer semnătură, aici se pune și cheia secretă.
   - **În dreapta**: lista de configurare (cheia, chatul pornit, acordul de cookie-uri, identitatea verificată), „Unde
     răspunzi” (legătură spre aplicația furnizorului), paragraful de pus în Politica de confidențialitate și ghidul din
     Ajutor.
   - **Comutatorul din antet** pornește și oprește chatul. Dacă alt furnizor e pornit, întreabă: „Înlocuiești Tidio cu
     tawk.to?”.
3. **În rest, în panou**:
   - Setări > Banner cookies arată singur categoria nouă, cu numele furnizorului.
   - „Datele magazinului” > butoanele de contact spun că WhatsApp și telefonul stau acum în același buton cu chatul.
   - Previzualizarea din editor arată butonul desenat, neapăsabil (acolo nu se încarcă scripturi).
   - Ajutor: un ghid general („Cum adaugi chat în magazin”) și câte unul pe furnizor.
4. **Unde răspunde**: în aplicația furnizorului. Acolo vede conversația, iar lângă ea numele clientului, pagina de pe
   care scrie și, după o comandă, numărul și valoarea ei.

## 4. Ce vede cumpărătorul

1. **Un buton rotund, în culoarea magazinului**, jos în dreapta, pe toate paginile: prima pagină, catalog, produs, coș,
   comandă, paginile proprii. Pe telefon stă deasupra barei de cumpărare, nu peste ea, și se ascunde cât e deschis coșul
   sau fereastra de comandă.
2. **Dacă magazinul are și WhatsApp sau telefon**: un singur buton „Contact”, care la apăsare se desface în „Chat”,
   „WhatsApp”, „Telefon”. Fără trei cercuri unul peste altul.
3. **Prima apăsare pe chat**:
   - dacă a acceptat deja cookie-urile funcționale (sau magazinul are bannerul oprit): se deschide fereastra de chat;
   - altfel apare un cartonaș mic: „Chatul este oferit de Tidio si foloseste cookie-uri.” cu „Deschide chatul” și „Nu
     acum”. „Deschide chatul” e acordul, și se ține minte.
4. **Fereastra de chat e a furnizorului**, în română unde furnizorul are limba: scrie, primește răspuns, iar dacă nu e
   nimeni online lasă mesajul și emailul.
5. **Clientul cu cont** (pe domeniul magazinului) nu mai completează nimic: operatorul îi știe numele și emailul, iar la
   furnizorii cu identitate verificată își regăsește conversațiile și de pe alt dispozitiv.
6. **După o comandă**, pe pagina de mulțumire: butonul spune „Ai o intrebare despre comanda?”, iar unde furnizorul
   permite, mesajul e precompletat („Am o intrebare despre comanda #1234”).
7. **Răspuns primit cu fereastra închisă**: o bulină pe buton și „Mesaj nou”.
8. **Unde nu apare**: în zona de cont (`/cont`), într-un magazin oprit, pentru roboți. (La scriere: într-un magazin
   nepublicat apare, ca proprietarul să-l poată proba înainte de lansare; vezi secțiunea 11.)

Textele din vitrină sunt fără diacritice, ca restul textelor platformei de acolo.

## 5. Cele patru, pe rând

| | Tidio | tawk.to | Intercom | Zendesk |
| --- | --- | --- | --- | --- |
| Ce lipește comerciantul | cheia publică | Property ID și Widget ID | Workspace ID și regiunea (US, EU, Australia) | cheia widgetului |
| Verificarea cheii, fără cont | da: `code.tidio.co/<cheie>.js` dă 404 la una inexistentă (măsurat) | da: `embed.tawk.to/<p>/<w>` dă 404 (măsurat) | da, dar nu prin script (dă 200 la orice ID): `api-iam.intercom.io/messenger/web/ping` dă 404 „App Not Found” la un ID inexistent și 403 la unul adevărat (măsurat; 403 nu înseamnă „oprit”, din browser aceeași cerere primește 200, vezi fișa) | da: `ekr.zdassets.com/compose/<cheie>` dă 404 (măsurat); de confirmat cu o cheie reală |
| Deschis, închis, ascuns | `open`, `close`, `hide`, `show` | `maximize`, `minimize`, `hideWidget`, `showWidget` | `show`, `hide`, `hide_default_launcher` | `open`, `close`, `show`, `hide` (după `hide`, întâi `show`) |
| Limba română | `document.tidioChatLang` | din panoul lor | `language_override` | `messenger:set locale` |
| Numele și emailul clientului | `tidioIdentify`, fără semnătură | „Secure Mode”: HMAC-SHA256 cu cheia API a proprietății | JWT semnat cu „Messenger API secret” | JWT (HS256) cu cheie de semnare (`kid` + secret) |
| Pagina, produsul, comanda | etichete, `track`, proprietăți (create dinainte la ei) | `setAttributes` (50 de chei), `addEvent`, `addTags` (10) | atribute proprii, `trackEvent` | `conversationTags`, `conversationMetadata` |
| Mesaj precompletat | nu (ar pleca direct) | `setChatInputMessage` | `showNewMessage` | nu (`preConversation.prompts` i-ar schimba comerciantului ecranul de început) |
| Mesaj nou cu fereastra închisă | `messageFromOperator` | `onChatMessageAgent` | `onUnreadCountChange` | `unreadMessages` |
| Ce se poate pe server | API doar pe planurile Plus și Premium: tichet din formular, contacte; catalog pentru asistentul Lyro pe planurile Lyro plătite | doar webhooks (chat început, încheiat, tichet), semnate | API-ul cere o aplicație Intercom cu OAuth, aprobată de ei | tichet din formular fără credențiale (cereri anonime); restul cere „global OAuth client” aprobat de ei |

Două lucruri care hotărăsc ce intră în prima livrare:

- ⚠ **Intercom și Zendesk interzic prin termeni** ca o platformă să ceară comerciantului tokenul lui de API. Intercom:
  „Asking your users for their Access Tokens rather than implementing OAuth is against our terms of service”. Zendesk:
  „the Zendesk Developer Terms prohibits Zendesk customers from sharing their API credentials with you”. Deci tot ce e
  API de server la ei
  (contacte, evenimente, tichete) cere o aplicație înregistrată și aprobată pe numele Edinio. Chatul din magazin și
  identitatea semnată NU țin de asta: cheia de semnare a mesageriei e făcută ca să stea pe serverul site-ului.
- **Zendesk are două widgeturi.** Planul e pentru cel de mesagerie (cel actual). Cel clasic, de pe conturile vechi,
  nu e susținut (la scriere s-a văzut că nu poate fi deosebit de celălalt în pagină; vezi secțiunea 11); pagina din
  panou o spune.

## 6. Cum e construit

### 6.1 Butonul comun

- O componentă mică, a noastră, montată în layoutul vitrinei doar la magazinele cu chat pornit. Fără librării; sigla
  desenată în pagină; adaptorul furnizorului se aduce abia la prima apăsare.
- Stă jos, în partea aleasă, la `1,25rem` de margine plus înălțimea barei de jos, pe care barele existente o anunță
  printr-o variabilă CSS (aceeași piesă care azi pune `scroll-padding-bottom`, `LocPesteBaraDeJos`). Stă sub ferestrele
  modale, ca butoanele de azi.
- La magazinele cu chat, stiva veche „Contact rapid” din `MiniStoreRenderer` nu se mai desenează: WhatsApp și telefonul
  trec în butonul comun, care e pe toate paginile.
- Stări: repaus, se încarcă, deschis, mesaj nou. Țintă de 48 px, etichetă pentru cititoarele de ecran, focus vizibil,
  fără animație la `prefers-reduced-motion`.
- **De ce butonul nostru și nu al furnizorului**: pe telefon, butonul lor stă cu z-index foarte mare în colțul unde e
  bara de cumpărare, iar poziția lui se reglează doar din panoul lor (la Intercom, deloc pe telefon). Al nostru știe de
  bare, de coș și de fereastra de comandă. Butonul furnizorului rămâne o opțiune, cu avertismentul ăsta scris lângă ea.

### 6.2 Adaptorul fiecărui furnizor

Aceeași formă pentru toți: `incarca`, `deschide`, `inchide`, `ascundeButonulLor`, `identifica`, `spuneContextul`,
`laMesajNou`. Butonul comun vorbește doar cu forma asta, deci un al cincilea furnizor înseamnă un fișier.

### 6.3 Când se încarcă

- **„La prima apăsare” (implicit)**: până la clic nu pleacă nicio cerere spre furnizor. Viteza paginii rămâne cea de
  azi. La apropierea de buton se deschide doar legătura (`preconnect`), ca fereastra să apară repede (la scriere: numai
  după acordul pentru cookie-uri, vezi secțiunea 11).
- **„Automat”**: după acord, la câteva secunde după încărcarea paginii sau la prima derulare, în timpul liber al
  browserului. E pentru comercianții care folosesc mesaje automate, roboți de întâmpinare sau lista de vizitatori în
  timp real. Costul în viteză se măsoară și se scrie lângă opțiune.
- Niciodată pentru roboți și niciodată în previzualizarea din editor.

### 6.4 Acordul pentru cookie-uri

- O a treia categorie, „Functionale”, lângă „Analiza” și „Marketing” (`lib/cookie-consent.ts`). Apare în banner doar la
  magazinele cu chat, cu numele furnizorului.
- Acordurile deja date rămân valabile și nimeni nu e întrebat din nou la banner: cine a răspuns înainte primește
  cartonașul scurt la prima apăsare pe chat. Retragerea se face din „Setari cookie-uri” din subsol, ca azi.
- Bannerul oprit de comerciant înseamnă chat fără întrebare, ca la pixeli.
- La Zendesk, nivelul de cookie-uri al widgetului urmează acordul (`functional` sau `all`).

### 6.5 Cine e clientul

- **Clientul cu cont**: la deschiderea chatului, butonul întreabă serverul. Serverul citește sesiunea, verifică
  magazinul și întoarce numele, emailul și semnătura cerută de furnizor (JWT de o oră sau HMAC). Pentru un anonim,
  răspunsul e gol.
- ⚠ **Numai pe domeniul propriu al magazinului**, ca la conturi: pe `www.edinio.com/<slug>` toate magazinele împart
  originea, deci o sesiune de client nu se poate apăra acolo.
- **Fără semnătură nu pleacă emailul** la tawk.to, Intercom și Zendesk: altfel oricine s-ar putea da drept alt client
  și i-ar vedea conversațiile. Tidio nu are semnătură; acolo datele sunt doar o completare a formularului.
- **Nimic personal în HTML**: datele vin la cerere, din browser, ca la theMarketer.
- Trimiterea numelui și a emailului e **oprită la început**: comerciantul o pornește știind că datele ajung la
  furnizorul lui, cu paragraful pentru Politica de confidențialitate alături.

### 6.6 Ce știe operatorul despre pagină și comandă

- Pe pagina de produs: numele, codul și prețul produsului. În coș: valoarea și numărul de produse. Fără date personale.
- După comandă: numărul, valoarea, plata. Pleacă drept eveniment și etichete, în forma fiecărui furnizor.

### 6.7 Date și secrete

- O coloană nouă, `suport_config`, cu chei plate: furnizorul pornit, cheile publice ale celor patru, setările butonului
  și comutatoarele. Chei plate fiindcă criptarea de azi lucrează pe câmpuri de la primul nivel.
- Secretele (cheia API tawk.to, secretul de mesagerie Intercom, secretul de semnare Zendesk, perechea OpenAPI Tidio) se
  înscriu în `privat.campuri_secrete`, se arată mascat și se citesc doar pe server, după verificarea proprietarului.
- ⚠ Regula învățată la theMarketer: vederea nu păzește secretele la scriere, deci fiecare salvare duce configurarea
  citită decriptat, iar ștergerea se face cu `null`.
- Vitrina primește doar câmpurile publice, prin căi JSON în citirea de antet de azi (ca `tm_*`). Nicio cerere nouă.
- Cheile publice trec printr-o verificare de formă înainte să ajungă într-o adresă de script.
- Se încarcă doar de pe gazdele fixe ale celor patru furnizori. Niciun câmp de „cod liber”.

## 7. Etape

**A. Fundația și cele patru chaturi.** După ea, cardurile nu mai sunt „În curând”.
- coloana și migrația (întâi pe demo), tipurile, schema din Git;
- butonul comun, cele patru adaptoare, cele două feluri de încărcare, categoria „Functionale”;
- cele patru pagini din panou, cu verificarea cheii, și regula „un singur furnizor”;
- cardurile din panou și de pe site trecute pe „activă”, cinci ghiduri în Ajutor;
- probe: forma configurării, adaptoarele pe obiecte false, acordul, „legat peste tot” (ca la theMarketer și tbi);
- dovada în browser, pe demo, cu câte un cont de probă la fiecare: apăsare, încărcare, deschidere, telefon cu bara de
  jos, cele trei drumuri de acord;
- viteza măsurată înainte și după, în ambele feluri de încărcare;
- înainte de push: magazinele reale, producție față de codul nou, trebuie să iasă identice.

**B. Clientul și comanda.**
- ruta de identitate, semnăturile (JWT, HMAC) probate pe exemplele din documentația lor;
- probe de securitate: anonim, sesiunea altui magazin, originea comună;
- contextul paginii și al comenzii, mesajul precompletat, bulina de mesaj nou;
- dovada cu conturile de probă: operatorul vede numele, emailul și comanda.

**C. În plus, după ce îl folosesc primele magazine.**
- formularul de contact al magazinului creează tichet (Zendesk: cereri anonime; Tidio: doar Plus și Premium);
- catalogul magazinului pentru asistenții AI (Tidio Lyro, Intercom Fin);
- legătură din pagina comenzii spre clientul din aplicația furnizorului, unde au adresă pentru asta.

A și B se pot livra împreună sau pe rând. Fiecare se încheie cu probele ei și cu acordul lui pentru push.

## 8. Ce nu intră, și de ce

- **O căsuță de mesaje în Edinio.** Furnizorii au aplicațiile lor, pe web și pe telefon; a le dubla înseamnă un produs
  întreg, nu o integrare.
- **API-ul de server Intercom și Zendesk** (contacte, evenimente, tichete cu credențiale). Cere aplicații aprobate de
  ei, pe numele Edinio. Se poate porni separat, dacă îl vrea.
- **Webhooks** (tawk.to gratuit; Tidio doar Plus și Premium). Nu avem ce face cu ele fără o căsuță de mesaje.
- **Chat în zona de cont.** Regula de acolo: niciun script ales de comerciant.
- **Două chaturi deodată.**

## 9. Ce am nevoie de la el

Hotărâri (recomandarea mea e prima):
1. Butonul: al magazinului, implicit, cu cel al furnizorului ca opțiune / doar al furnizorului.
2. Cu WhatsApp sau telefon alături: un singur buton „Contact” care se desface / butoane separate.
3. Încărcarea la început: la prima apăsare / automat.
4. Acordul: categorie nouă „Functionale” plus cartonașul de la prima apăsare / chatul socotit necesar, fără întrebare.
5. Livrarea: A și B împreună / A întâi.

Conturi de probă, făcute de el (eu nu creez conturi): Tidio (gratuit), tawk.to (gratuit), Intercom (spațiu de
dezvoltare sau perioada de probă), Zendesk (probă de 14 zile sau cont de dezvoltare). Cheile publice mi le poate scrie
în chat. Secretele le lipește el în panou, pe demo.

## 10. Riscuri

- **Furnizorul își schimbă scriptul.** Adaptoarele sunt mici și separate; proba de conexiune din panou arată prima.
- **Viteza, în felul „automat”.** Se măsoară și se spune comerciantului lângă opțiune; implicitul nu costă nimic.
- **Date personale la un terț.** Oprit la început, cu semnătură unde există, numai pe domeniul propriu.
- **Originea comună** (`www.edinio.com/<slug>`): chatul anonim merge acolo, ca pixelii; identitatea semnată, nu.
- **Chei greșite.** Verificare la salvare, la toți patru (vezi tabelul din secțiunea 5).
- **Widgetul clasic Zendesk.** Spus în pagină: nu e susținut.

## 11. Ce a ieșit altfel la scriere (22.11.2026)

Fiecare cu motivul lui; detaliile și măsurătorile sunt în `SUPORT-CLIENTI.md`.

1. **Magazinul nepublicat primește butonul.** Planul spunea că nu. Proprietarul trebuie să-și poată proba chatul
   înainte de lansare, iar layoutul nu știe cine privește pagina fără o cerere în plus la fiecare vizită. Ecranul „în
   curând” oferă oricum telefonul magazinului. Magazinul oprit (abonament expirat) rămâne fără chat.
2. **Widgetul clasic Zendesk nu e susținut.** Planul promitea „nivelul de bază”. Scriptul Zendesk lasă în pagină doar o
   coadă de comenzi până pornește widgetul, deci nu se poate afla din pagină care dintre cele două e, iar comenzile
   unuia nu au ce căuta la celălalt. Fără un cont cu widgetul clasic, nu s-ar fi putut proba. Un chat care nu pornește
   ajunge la cumpărător ca mesaj („Chatul nu s-a putut deschide”), nu ca buton mort.
3. **Zendesk: fără mesaj precompletat.** Singura cale îi schimbă comerciantului ecranul de început al conversației.
   Comanda ajunge la operator prin `conversationMetadata`.
4. **Legătura deschisă din timp (`preconnect`) numai după acord.** O legătură deschisă îi arată furnizorului adresa IP
   a vizitatorului, chiar dacă nu se cere nimic pe ea.
5. **În plus față de plan:** bara de cookie-uri și bara lipicioasă a coșului compact își anunță locul, ca butonul să
   nu ajungă sub ele; butonul e o listă obișnuită pentru tastatură, nu un meniu ARIA; codul lui e despărțit de restul
   layoutului, ca magazinele fără chat să nu-l descarce.
