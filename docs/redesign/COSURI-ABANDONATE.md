# Cosuri abandonate: ce se reface si in ce ordine

Analiza proprietarului, 21.09.2026. Fisierul asta e planul; se bifeaza pe masura ce se face,
ca `STATISTICI.md`.

---

## Ce am gasit pe productie inainte sa incep

Cifre citite pe 21.09.2026, ca sa se stie despre ce marime vorbim:

| | |
|---|---|
| Cosuri, tot istoricul | **393**, in 10 magazine |
| Deschise (adica „abandonate") | **86** |
| Convertite | **307** |
| Emailuri de recuperare trimise | **34** |
| SMS-uri de recuperare trimise | **21** |
| Dezabonari inregistrate | **0** |

⚠ **Functia trimite deja mesaje unor oameni adevarati.** 34 de emailuri si 21 de SMS-uri au
plecat catre clienti reali. Deci gaurile de siguranta de mai jos nu sunt teoretice, si de-aia
se repara INAINTEA celor de afisare.

⚠ **„Recuperate" se sprijina pe DOUA cosuri.** Din cele 307 convertite, doar **2** primisera
vreun mesaj. Iar despre acelea doua nu se poate arata ca mesajul a facut conversia: linkul de
recuperare e `?recover=<id>` si nu lasa nicio urma ca a fost deschis. Deci cifra nu e „mica",
ci **nedemonstrabila** - exact ce spune punctul 2 al analizei.

⚠ **Statusurile sunt `open` si `converted`**, nu `abandoned`. Cine scrie filtre pe „abandoned"
primeste zero randuri si crede ca nu sunt date.

---

## Gaurile de siguranta, verificate in cod

Astea trei s-au confirmat citind caile, nu presupunand:

1. **Trimiterea MANUALA nu verifica dezabonarea.** Cronul citeste `recovery_optout`
   (`api/cron/abandoned-recovery/route.ts:182`), dar `sendAbandonedCartEmail` si
   `sendAbandonedCartSms` din `abandoned-cart.actions.ts` nu-l ating deloc. Un client care
   s-a dezabonat poate primi mai departe mesaje, apasate de mana din panou.

2. **`recovery_optout` nu are telefon.** Are doar `email`. Dezabonarea de la SMS nu se poate
   nici macar exprima, deci cu atat mai putin respecta.

3. **Trimiterea manuala nu verifica daca cosul s-a convertit deja.** Cronul filtreaza
   `status = 'open'`; actiunea manuala nu. Se poate trimite „ai uitat ceva in cos" cuiva care
   tocmai a cumparat.

---

## Ordinea in care se face

⚠ **NU e ordinea din lista lui.** Lista incepe cu perioadele KPI-urilor, care sunt o problema
de INTELEGERE. Gaurile de mai sus sunt o problema de OAMENI: un mesaj trimis unui dezabonat nu
se poate lua inapoi, si nici al doilea SMS platit degeaba. Deci intai se inchid ele.

### Etapa A - ce nu se mai poate lua inapoi

- [x] **A1.** Dezabonarea se respecta si la trimiterea manuala, pe amandoua canalele.
      `recovery_optout` a capatat `phone` si `motiv`; emailul a devenit optional, fiindca
      exista acum randuri numai cu telefon.
      ⚠ Regula sta INTR-UN SINGUR LOC (`lib/abandoned/suprimare.ts`) si o cheama si cronul, si
      panoul. Doua cai de trimitere inseamna doua locuri unde se poate uita verificarea - si
      chiar asa era: cronul citea lista, panoul n-o atingea deloc.
      ⚠ Se opreste pe ORICARE dintre contacte: un cos cu emailul dezabonat si un telefon nou nu
      deschide o portita de SMS.
      ⚠ Telefonul se compara NORMALIZAT: „0722 184 305" si „+40722184305" sunt acelasi om.
      ⚠ Cand lista nu se poate citi, NU se trimite - aceeasi hotarare ca in cron.
- [x] **A2.** Un mesaj pleaca o singura data. Tabela noua `recovery_sends`, cu index unic pe
      `(cos, canal, cheie)`.
      ⚠ **Automatizarile erau deja aparate**, si altfel decat cere lista: cronul ia pasul cu un
      compare-and-swap pe `automation_step` INAINTE sa trimita, deci doua rulari suprapuse nu
      pot trimite acelasi pas. Nu s-a inlocuit; s-a adaugat randul de jurnal (`pas:<n>`), care
      prinde a doua incercare daca vreodata se pierde compare-and-swap-ul - si de care are
      nevoie oricum atribuirea de la B1.
      ⚠ Gaura adevarata era la trimiterea DE MANA: butonul e stins cat tine cererea, si atat.
      O reincarcare, a doua fila, doi oameni din aceeasi echipa sau o cerere picata pe retea
      DUPA ce serverul trimisese deja - toate duceau la un al doilea mesaj, platit la SMS.
      ⚠ Cheia nu e „cos + canal": aia ar fi insemnat un singur email pe cos, vreodata. E
      `cos + canal + cheia apasarii`, facuta cand se deschide fereastra. Aceeasi apasare
      retrimisa se opreste; o fereastra deschisa din nou e o intentie noua si trece.
      ⚠ Randul se scrie INAINTE de trimitere, ca revendicarea pasului din cron. Deci existenta
      lui nu dovedeste ca mesajul a plecat: `confirmat` se pune abia dupa. Comerciantului i se
      spun doua lucruri DIFERITE - „a plecat deja" si „s-a incercat si nu stim" - fiindca a
      doua oara el trebuie sa se uite in contul de email, nu sa creada ca s-a rezolvat.
      ⚠ Orice eroare care nu e dublura inseamna „nu stiu", si atunci NU se trimite: o baza
      cazuta tratata ca „liber" ar deschide exact usa pe care tabela o inchide.
      Verificat prin clientul Supabase adevarat pe baza demo, toate cele cinci cazuri: prima
      apasare trece, a doua cu aceeasi cheie e oprita (si inainte, si dupa confirmare), o
      apasare noua trece, si acelasi cos pe alt canal trece.
- [x] **A3.** Trimiterea manuala refuza cosurile deja convertite. A iesit din aceeasi poarta
      ca A1: cronul filtra `status = 'open'`, actiunea manuala nu, deci se putea trimite
      „ai uitat ceva in cos" cuiva care tocmai cumparase.
- [x] **A4.** Stergerea cere confirmare, si langa ea sta „Ignora". Coloana `ignorat_la` pe
      `abandoned_carts`.
      ⚠ Confirmarea nu e pusa fiindca „e bine sa intrebi", ci fiindca cele doua iesiri arata la
      fel pentru om si fac lucruri diferite: randul sters iese SI din cifre, deci rata de
      abandon si venitul potential se schimba in urma pentru o hotarare care n-avea nicio
      legatura cu ele. Fereastra spune chiar asta, nu „esti sigur?".
      ⚠ Promisiunea „nu mai contacteaza" are TREI drumuri pe care se poate rupe: emailul de
      mana, SMS-ul de mana si cronul. Primele doua trec prin poarta comuna; cronul isi alege
      singur cosurile, deci are filtrul lui (`ignorat_la is null`, cu index partial).
      ⚠ Coloana trebuie si CERUTA in interogare: o poarta care citeste `cart.ignorat_la` dintr-un
      rand care n-o contine primeste `undefined` si lasa totul sa treaca. Probele masoara
      amandoua interogarile, nu doar poarta.
      ⚠ Butoanele de trimis se sting pe randul ignorat: nu tine loc de poarta de pe server, dar
      un buton care arata activ si da eroare la apasare e o minciuna de ecran.
      Verificat pe baza demo cu chiar interogarile celor doua drumuri: cosul ignorat nu mai e
      printre cele luate de cron, si poarta de mana ii vede steagul.
      ⚠ Prinsa de o plasa mai veche: `ignora()` astepta actiunea fara `try`, iar o actiune care
      arunca dintr-un callback de tranzitie inlocuieste TOT panoul cu pagina de 500.
- [x] **A5.** Numararea SMS spune acum ce se plateste. Vechiul rand (`length` / 160) minte de
      trei ori deodata, si masurat pe un mesaj adevarat scris pentru VetDepo minte de TREI ORI:
      scria „1 SMS", pleaca 3.
      ⚠ 160 e limita GSM-7, iar diacriticele romanesti NU sunt in alfabetul ala: un singur „ă"
      muta tot mesajul pe Unicode, unde un segment are 70 de locuri, iar in lant 67.
      ⚠ Linkul statea in paranteza, nedeclarat - si are 78 de semne, adica singur cat jumatate
      dintr-un segment GSM-7 si peste un segment Unicode intreg.
      ⚠ `{nume}` si `{magazin}` se inlocuiesc la trimitere: se numara textul CARE PLEACA, prin
      chiar `interpolateRecoveryMessage` si `buildRecoverUrl` pe care le cheama si serverul.
      ⚠ Cand casuta e goala pleaca `defaultRecoverySms`, care poarta deja linkul in el, deci nu
      se mai adauga o data.
      ⚠ Se numara si semnele care costa dublu chiar in GSM-7 (`{` `}` din sabloane) si unitatile
      UTF-16 (un emoji = doua locuri, desi omul vede un semn).
      Regula sta in `lib/abandoned/sms-segmente.ts`, cu o proba care cade daca ecranul nu o mai
      cheama - altfel modulul ramane scris frumos si nechemat, cu `/160` mai departe pe ecran.

### Etapa B - cifre care se pot dovedi

- [x] **B1.** Linkul lasa urma. Doua coloane pe `recovery_sends`: `deschis_la` si `comanda_id`.
      ⚠ Linkul poarta acum si cheia mesajului (`&m=`), ca sa se stie CARE mesaj a adus omul
      inapoi - cand sunt trei intr-o secventa, aia e tocmai intrebarea. Cheia e OPTIONALA:
      linkurile plecate inainte de 21.09.2026 n-o au, si atunci deschiderea se trece pe cel mai
      recent mesaj netrimis-deschis al cosului, singurul care putea purta clickul.
      ⚠ Deschiderea se scrie O SINGURA DATA, la primul click (`is("deschis_la", null)`). Altfel
      ora ar urca la fiecare reincarcare, si fereastra de atribuire s-ar muta dupa ea: o comanda
      de acum trei saptamani ar redeveni „recuperata" fiindca omul a mai deschis o data emailul.
      ⚠ Insemnarea nu asteapta si nu poate strica recuperarea: daca pica, omul tot isi primeste
      cosul. O cifra lipsa e mai putin rau decat un cos nerecuperat.
      ⚠ La cron cheia se face INAINTE (`crypto.randomUUID()`) si se duce si in link, si in rand:
      acolo randul de jurnal se scrie abia dupa trimitere, fiindca apararea automatizarilor e
      compare-and-swap-ul, nu el.
      Verificat cap-coada pe baza demo: cheia intra in link, clickul lasa urma, al doilea click
      NU muta ora, si comanda se leaga de mesaj la conversie.
- [x] **B2.** Trei cifre in loc de una.
      ⚠ NU se aduna intr-un „recuperat" mai mare: suma lor e chiar cifra veche, adica exact cea
      care nu spunea nimic. De-aia „Recuperare atribuita" sta sus, pe randul cardurilor mari, si
      celelalte doua dedesubt, mai mici, fiecare cu explicatia ei.
      ⚠ Fereastra se masoara DE LA DESCHIDERE, nu de la trimitere: un mesaj citit a treia zi si
      urmat de comanda a patra zi e o recuperare. Masurata de la trimitere, fereastra ar fi
      expirat tocmai pentru omul care chiar a venit prin link.
      ⚠ O comanda plasata INAINTEA deschiderii e „asistata", nu „atribuita": un click de
      curiozitate de seara n-are voie sa ia meritul unei comenzi de dimineata.
      ⚠ Meritul merge la mesajul deschis CEL MAI RECENT. Pe primul, orice secventa ar fi aratat
      ca merge doar prima trimitere si ca urmatoarele sunt bani aruncati.
      ⚠ Cosurile de dinainte de jurnal cad inapoi pe `recovery_email_sent_at`: fara asta, tot
      istoricul ar fi trecut peste noapte la „organic", si comerciantul ar fi vazut munca lui de
      pana acum stearsa.
- [x] **B3.** „Rata abandon" a devenit **„Rata de abandon la finalizare"**, cu explicatie la
      semnul de intrebare (acelasi `ExplicatieCard` de la carduri, care se deschide si la deget,
      nu doar la maus). Spune ce e in numitor: numai finalizarile in care omul a apucat sa-si
      lase datele de contact, fiindca numai atunci se salveaza un cos. Cine pleaca mai devreme
      nu apare nicaieri.

### Etapa C - aceeasi perioada peste tot

- [x] **C1.** Selector global: 7 / 30 / 90 de zile, luna aceasta, de cand exista magazinul.
      Cardurile, bannerul, produsele si lista asculta toate de el.
      ⚠ Selectorul sta DEASUPRA cardurilor, nu langa unul dintre ele: langa un card, ar fi parut
      ca schimba doar cardul acela.
      ⚠ „Luna aceasta" se taie pe ceasul ROMANESC. Pe UTC, luna ar incepe cu trei ore mai
      tarziu, si un cos din noaptea de 1 ar cadea in luna trecuta - o cifra mai mica,
      plauzibila, si gresita.
      ⚠ Capatul de sus al ferestrei e MAINE, nu „acum": pe un ceas de baza care merge putin
      inainte, tocmai cosul cel mai nou ar fi lipsit din numaratoare.
      ⚠ **Defectul s-a intors de doua ori in aceeasi zi**, prin text scris de-a gata: bannerul
      zicea „luna aceasta" cu perioada pe 7 zile, iar cardul ratei avea subtitlul fix. Cifra
      corecta sub o eticheta gresita e mai rau decat o cifra gresita, fiindca nimic nu pare in
      neregula. Exista acum o proba care cade la orice perioada scrisa de mana pe ecran, si e
      verificat ca musca.
- [x] **C2.** Paginare pe server, 25 sau 50 pe pagina, cu numarul adevarat.
      ⚠ Antetul scria „(100)" - atatea randuri trimitea serverul - langa un card care spunea
      altceva: aceeasi pagina se contrazicea singura. Acum vine din `count: "exact"`.
      ⚠ Marginile sunt INCLUSIVE la amandoua capetele, ca la PostgREST. Scrise ca la `slice`,
      ultimul rand al unei pagini ar fi fost si primul celei urmatoare - fara nicio eroare.
      Verificat pe baza demo cu pagini de cate 5: niciun cos de doua ori, niciun gol, si
      aceeasi ordine ca lista intreaga.
      ⚠ Schimbarea perioadei sau a marimii paginii duce inapoi la pagina 1: altfel omul ar
      ramane pe „pagina 7" a unei liste care acum are trei.
      ⚠ **Cifrele nu se mai socotesc in TypeScript**, ci in baza (`cosuri_abandonate_sumar`).
      Citirea veche lua cel mult 1.000 de randuri - pragul PostgREST - si aduna in memorie. Azi
      cel mai mare magazin are 393 de cosuri in tot istoricul, deci nimeni nu lovea pragul; dar
      cand il va lovi, cifrele NU dau eroare: scad in tacere si arata ca merge mai bine.
      Functia e verificata fata de un control scris separat, pe datele demo: 29 abandonate,
      13 convertite, 29.730,80 lei - aceleasi cifre pe amandoua drumurile.
      ⚠ RAMAS: „Cele mai abandonate produse" citeste tot cel mult 1.000 de randuri, fiindca se
      strange in memorie din `items`. Nu e gresit azi, dar e acelasi prag; de mutat in baza
      cand se face fila Prezentare (D2).
      ⚠ Reincarcarea NU mai e `router.refresh()`: datele stau in stare, iar un refresh de server
      nu ajunge la ele. Dupa o stergere, lista ar fi parut ca se reincarca si ar fi ramas cea
      veche.

### Etapa D - structura

- [x] **D1.** Trei file: Prezentare / Coșuri / Automatizări, cu titlul INAINTEA lor.
      ⚠ Asezate deasupra titlului, filele pareau ale panoului intreg, nu ale paginii: omul nu
      stia ca „Automatizări" e tot despre cosuri abandonate.
      ⚠ Selectorul de perioada sta INAINTEA despartirii pe file, nu in fiecare: doua selectoare
      s-ar putea contrazice, si trecand de la Prezentare la Coșuri perioada s-ar pierde - omul
      ar alege „7 zile" sus si ar citi o lista de 30 dedesubt. Verificat in browser ca trece
      dintr-o fila in alta.
- [x] **D2.** Prezentare: carduri, grafic, palnie, produse cu rata lor. Trei functii noi in
      baza (`..._grafic`, `..._palnie`, `..._produse`), din acelasi motiv ca sumarul: stranse in
      memorie, ar depinde de cate randuri incap intr-o citire.
      ⚠ **Graficul e cu BARE ALATURATE, nu cu linii si nu suprapuse.** Suprapuse, ochiul le
      aduna - iar cele doua NU se aduna: un cos recuperat azi a fost abandonat saptamana
      trecuta, deci aceeasi zi numara lucruri venite din zile diferite. Scrie asta sub grafic.
      ⚠ Prima scriere folosea linii, si pe date adevarate (unu-doua cosuri pe zi, cu goluri
      intre ele) iesea o linie lipita de zero din care nu se vedea nimic. Vazut in browser, nu
      in cod. O curba intre doua zile goale mai si inventeaza o panta care n-a existat.
      ⚠ Ziua e cea ROMANEASCA: grupata pe UTC, o comanda de la 01:30 ar cadea in ziua
      precedenta - chiar defectul lui `orders_daily_revenue` de la panoul principal.
      ⚠ Recuperarile se trec in ziua COMENZII, abandonarile in ziua cosului. Grupate pe
      abandon, ziua de azi n-ar avea niciodata recuperari, fiindca ele vin mai tarziu.
      ⚠⚠ **Palnia: „a ramas neterminat" NU e „abandonat acum".** Prima scriere punea toate
      conversiile la abandonate si iesea „28 salvate → 28 abandonate": doua trepte egale, care
      nu spun nimic. Se poate spune ADEVARAT despre un cos convertit daca a stat parasit -
      `markCartConverted` nu atinge `last_activity_at`, deci distanta pana la comanda e chiar
      cat a stat uitat. Masurat pe demo: 12 din 13 conversii au stat parasite peste prag, si
      una are ceasurile pe dos (durata negativa, deci pica singura in afara).
      ⚠ Palnia asta NU e palnia magazinului: aia (vizitatori → cos → comanda) sta la Statistici.
      Asta incepe de la cosurile SALVATE, adica de la cine si-a lasat datele de contact.
      Amestecate, ar fi parut ca pagina stie cati vizitatori are magazinul.
      ⚠ Procentul fiecarei trepte e fata de cea DINAINTE, nu fata de prima: omul vrea sa afle
      UNDE pierde. Socoteala e scoasa din randare si probata, fiindca una scrisa in JSX nu se
      poate masura decat cu ochiul.
      ⚠ Produsele au acum NUMITOR: „3 din 3 cosuri · 100% abandon", nu doar suma. Un produs care
      apare in o suta de cosuri din care nouazeci se finalizeaza nu e o problema; unul care
      apare in zece si se abandoneaza in noua este, chiar daca in bani pare mai mic. Asezate
      dupa bani, lista arata produsele SCUMPE, nu pe cele care pierd vanzari.
      ⚠ Un produs se numara O SINGURA DATA pe cos, chiar daca apare pe doua linii (marimi
      diferite): altfel „in cate cosuri apare" ar fi putut depasi numarul cosurilor, si rata ar
      fi trecut de 100%. Verificat pe demo ca niciun produs nu trece.
      Palnia si sumarul verificate fata de controale scrise separat, pe datele demo.
- [x] **D3.** Tabel adevarat pe desktop, cartonase pe telefon, filtre, o singura stare, sertar.
      ⚠ **O singura stare in loc de doua etichete.** Randul purta „Mail trimis" si „SMS trimis"
      deodata (si de pe 21.09 si „Ignorat"), si niciuna nu spunea ce conteaza: ce s-a intamplat
      DUPA. Starile sunt o SCARA - ignorat > a deschis linkul > contactat > necontactat - si se
      citeste prima care se potriveste. Fara o ordine scrisa, eticheta unui cos cu toate cele
      patru semne ar fi depins de ordinea verificarilor din cod.
      ⚠ Canalele nu dispar: trec in sertar, unde e loc sa scrie si CAND, si daca linkul a fost
      deschis. Pe eticheta ramane raspunsul la „ce fac cu cosul asta".
      ⚠ Filtrele lucreaza pe starea CALCULATA, nu pe coloane: filtrate pe „are data de email",
      „Contactate" ar fi prins si cosurile deschise, si doua filtre ar fi aratat acelasi cos.
      Proba verifica tocmai asta: fiecare cos cade intr-un singur filtru.
      ⚠ Filtrul lucreaza pe pagina ADUSA, si scrie sub el „x din cele y de pe pagina asta":
      altfel cifra de langa filtru s-ar citi ca un total al magazinului.
      ⚠ Sertarul arata CE e in cos. Randul spunea „3 produse · 577 lei" si atat, deci
      comerciantul care voia sa scrie un mesaj cu sens - sau sa hotarasca daca merita un SMS
      platit - n-avea de unde afla. Tot acolo sta si cronologia mesajelor.
      ⚠ Sertarul spune ca valoarea e cea de la ABANDON: preturile se iau din catalog abia la
      trimitere, deci pe un produs scumpit intre timp cifra e mai mica decat ce ar plati omul.
      ⚠ **Prins pe ecran, nu in cod:** sertarul scria „În coș · 3 produse" peste o lista de
      DOUA randuri. `item_count` e suma cantitatilor, nu numarul de produse, si textul o citea
      gresit in trei locuri. Acum e o singura socoteala (`cateInCos`), cu proba.
- [x] **D4.** Trei porniri, cronologie, previzualizare, mesaj de proba si capcanele.
      ⚠ Un formular gol cu un buton „adauga pas" cere comerciantului sa stie DINAINTE cate
      mesaje se trimit si la ce ore - adica tocmai ce vrea sa afle de la noi.
      ⚠ **Nicio pornire nu aprinde automatizarea.** Alegerea unei secvente e o alegere de TEXT;
      hotararea de a incepe sa trimiti mesaje catre clienti adevarati se ia cu comutatorul, dupa
      ce omul a citit ce pleaca - si aia e ce nu se ia inapoi. Exista proba.
      ⚠ Cronologia spune distanta fata de mesajul DINAINTE, nu doar de la abandon: campurile
      spun „24" si „48", dar omul vrea sa stie ca al doilea vine la o zi dupa primul.
      ⚠ Previzualizarea arata CE PLEACA, nu ce scrie in camp: `{nume}` si `{magazin}` inlocuite,
      si linkul lipit la sfarsit. Linkul aratat e adevarat ca forma si ca LUNGIME - la SMS
      lungimea chiar conteaza, si un „..." scurt ar fi aratat un mesaj mai ieftin decat e.
      ⚠ Proba pleaca la COMERCIANT si destinatarul nu vine din cerere: altfel actiunea ar fi
      fost o portita de trimis mesaje oriunde, pe banii magazinului. Nu atinge niciun cos si nu
      intra in jurnal - un mesaj de proba numarat ar face ca „7 contactate" sa insemne
      „6 clienti si o data eu". Exista proba si pentru asta.
      ⚠⚠ **Prinsa de o plasa mai veche:** proba de SMS citea intai cheile cu clientul
      utilizatorului. Cheile sunt criptate in tabela si se decripteaza prin vedere numai pentru
      service role, deci ar fi plecat catre furnizor ca „enc.v1.…" si nimeni n-ar fi stiut de ce
      nu merge. Prinsa de `citire-secrete.test.ts`, nu de mine.
      ⚠ Capcanele (13, nu 11) sunt in `lib/abandoned/capcane-automatizare.ts`, fiecare cu proba
      ei. Toate se salveaza AZI fara nicio eroare, si urmarea se vede peste o saptamana:
      ordinea pasilor e cea din LISTA (nu a orelor), „0 ore" nu inseamna „acum", un pas dincolo
      de sase luni nu pleaca niciodata, ore de liniste cu acelasi inceput si sfarsit acopera
      toata ziua, un cod inactiv promite o reducere care nu se aplica, un SMS lung se plateste
      la fiecare client.
      ⚠ Doua trepte, nu una: „opreste" si „atentie". „Eroare" langa o alegere legitima il invata
      pe om sa nu mai citeasca avertismentele.
      ⚠ Avertismentele NU refuza salvarea: comerciantul are dreptul sa salveze o secventa pe
      jumatate scrisa. Ce n-are dreptul e sa creada ca trimite, cand nu trimite.
      ⚠ Prins pe ecran: campul de ore se intindea pe tot randul. `inputCls` avea `w-full`, iar
      `w-20` nu-l putea invinge - intre doua clase de aceeasi putere hotaraste ordinea din
      FOAIA DE STIL, nu cea din sirul de clase.
      Vazut in browser pe automatizarea adevarata a magazinului demo: capcana codului inactiv
      chiar a prins un cod care nu mai exista.

### Etapa E - restul

- [x] **E1.** Ecranul de activare spune si ce **NU** se intampla.
      ⚠ Cel vechi spunea doar ce castiga omul. Cine apasa un buton verde pe care scrie
      „ACTIVEAZĂ FUNCȚIA" se poate astepta la orice, inclusiv ca din clipa aceea pleaca mesaje
      catre clientii lui. Nu pleaca: activarea doar incepe sa SALVEZE cosurile, iar pornirea
      unei automatizari e alta apasare, in alta fila. Scrie asta primul.
      ⚠ Si ce date se pastreaza, cat timp: se salveaza datele de contact ale unor oameni care
      NU au terminat comanda, deci cine apasa ia o hotarare despre datele altora.
      ⚠ Cele doua praguri (60 de minute, 6 luni) se citesc din cod, nu sunt scrise de mana: un
      numar scris in text ramane in urma cand se schimba regula, si atunci ecranul minte fara
      sa cada nimic. Exista proba.
      Vazut in browser, stingand comutatorul pe magazinul demo si aprinzandu-l la loc.
- [x] **E2.** Terminologie: „Email" peste tot (nu „Mail"), „Automatizări" cu diacritice, „Rată
      de abandon la finalizare", iar „Recuperare atribuită" numai acolo unde se poate dovedi.
      ⚠ Proba se uita la TEXTUL aratat, nu la cod: `Mail` e si numele iconitei din lucide, si
      acela are voie sa ramana.
- [ ] **E3.** P2 din lista lui, **NEFACUTE dinadins**: A/B pe mesaje, coduri de reducere
      individuale, WhatsApp, si costul SMS pus fata in fata cu venitul recuperat.
      ⚠ Le-a pus el la P2, si asa raman. Trei dintre ele n-au azi pe ce sa se sprijine:
      **A/B** cere destule trimiteri ca sa insemne ceva, iar pe productie au plecat 34 de
      emailuri si 21 de SMS-uri in total - o impartire in doua ar da doua cifre fara nicio
      putere, care par masuratori. **Costul SMS fata in fata cu venitul recuperat** cere ca
      venitul recuperat sa fie demonstrabil; abia de azi incepe sa fie (B1), si inca nu exista
      nicio recuperare atribuita, deci raportul ar fi „cost / 0". **Codurile individuale** cer
      generare, expirare si curatare, adica o bucata de sistem, nu un camp.
      De reluat cand exista trafic pe drumul asta si cateva recuperari dovedite.
