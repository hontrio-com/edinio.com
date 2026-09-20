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
- [ ] **A4.** Stergerea cere confirmare; se adauga „Ignora" (pastreaza cifrele, nu mai
      contacteaza) langa stergerea definitiva.
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

- [ ] **B1.** Linkul de recuperare lasa urma: se inregistreaza mesajul, canalul, pasul, data
      accesarii si comanda rezultata, cu fereastra de atribuire de 7 zile.
- [ ] **B2.** Trei cifre in loc de una:
      **Recuperare atribuita** (comanda a venit prin link), **Recuperare asistata** (s-a trimis
      mesaj, atribuirea nu se poate dovedi), **Conversie organica** (fara accesarea mesajului).
- [ ] **B3.** „Rata de abandon" se redenumeste **„Rata de abandon la finalizare"**, cu tooltip
      care spune ce masoara: sesiunile de finalizare IDENTIFICATE (adica cele in care omul a
      lasat date de contact), nu toti vizitatorii si nici toate cosurile.

### Etapa C - aceeasi perioada peste tot

- [ ] **C1.** Selector global: 7 / 30 / 90 de zile, luna aceasta, personalizat. Toate cardurile,
      produsele si lista asculta de el. Ce ramane „de cand exista magazinul" se eticheteaza.
- [ ] **C2.** Paginare pe server, 25 sau 50 pe pagina, cu numarul adevarat. Acum interogarea
      citeste 1.000 de randuri si ecranul arata 100, iar antetul scrie „(100)" langa un card
      care spune 430.

### Etapa D - structura

- [ ] **D1.** Trei file: Prezentare / Cosuri / Automatizari. Titlul INAINTEA filelor.
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
