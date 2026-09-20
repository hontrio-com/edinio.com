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
- [ ] **D2.** Prezentare: cardurile cerute, grafic abandonate vs. recuperate cu comparatie,
      palnie, tabel de produse cu rata de abandon si de recuperare.
- [ ] **D3.** Cosuri: tabel adevarat pe desktop, carduri pe telefon; filtre; un singur status
      principal in loc de doua etichete; sertar lateral cu tot ce e in cos.
- [ ] **D4.** Automatizari: trei porniri (Simpla / Recomandata / Personalizata), cronologie
      vizuala, previzualizare si mesaj de test, cele unsprezece capcane de configurare.

### Etapa E - restul

- [ ] **E1.** Ecranul de activare spune limpede: dupa cat timp devine un cos abandonat, ce date
      se pastreaza, cat, si ca **activarea NU trimite mesaje** - recuperarea ramane manuala pana
      se porneste o automatizare.
- [ ] **E2.** Terminologie: „Email" peste tot, „Automatizari" cu diacritice, „Rata de abandon la
      finalizare", „Venit recuperat" numai unde atribuirea e sigura.
- [ ] **E3.** P2 din lista lui: A/B, coduri individuale, WhatsApp, cost SMS vs. venit recuperat.
