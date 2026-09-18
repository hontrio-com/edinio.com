# VERDICT FINAL: esafe.ro fara zona DNS la Vercel

## 1. CAUZA RADACINA

### 1.1 Ipoteza din brief e INFIRMATA partial, dar concluzia practica e mai rea

`PATCH /v3/domains/{apex}` **EXISTA**, `op` e sir liber fara `enum` si neobligatoriu (deci `"update"` trece), iar `zone: boolean` **e acceptat** in varianta "update" a lui `oneOf`. Apelul din `src/lib/vercel.ts:212-215` este sintactic valid si nu cade pe "ruta inexistenta".

Ce e fals este **comentariul de deasupra lui**, `src/lib/vercel.ts:190-193`, care il prezinta drept "echivalentul API al butonului Enable Vercel DNS". Documentatia nu spune asta nicaieri, iar sintagma "Enable Vercel DNS" nu apare deloc in specificatia OpenAPI (10 MB, cautare literala, sursa A). Formularea difera deliberat intre cele doua rute:

| Ruta | Descrierea campului `zone` |
|---|---|
| `POST /v7/domains` | "Whether to **create** a DNS zone on Vercel. Set `true` if using Vercel nameservers." |
| `PATCH /v3/domains/{domain}` | "Specifies whether this **is** a DNS zone that **intends to use** Vercel's nameservers." |

Imperativ vs declarativ. **Ruta corecta si singura documentata ca fiind CREATOARE de zona este `POST /v7/domains` cu `{ name, zone: true }`** (sursa A, confirmat pe doua cai independente). In toata specificatia, `zone` in sens DNS apare in exact doua corpuri de cerere: cele doua de mai sus. Nu exista `POST /domains/{domain}/zone`, nu exista zone pe rutele de proiect.

**Consecinta structurala:** pentru un domeniu care e DEJA in cont (a treia stare), nu exista nicio ruta API documentata care sa creeze zona. `POST /v7` cade cu conflict, `PATCH /v3` e cel mult un steag de intentie. Calea de recuperare pe care se bazeaza tot codul nostru **nu are acoperire in documentatie**. Singurul punct de intrare documentat ramane butonul manual "Enable Vercel DNS" din panou (Domains > domeniu > Advanced Settings), pereche cu "Delete DNS Zone", ceea ce confirma ca zona e un obiect creat si sters explicit.

### 1.2 De ce zona nu s-a creat pentru esafe.ro

Lantul, cu apelurile si codurile:

1. `POST /v7/domains {name:"esafe.ro", method:"add", zone:true}` (`vercel.ts:205-209`) cade, foarte probabil **409** (documentat: "The domain is not allowed to be used"; mesajul observat in productie, "Cannot add X since it's already in use by one of your projects", **nu apare in specificatie**, deci e nedocumentat). Domeniul e deja in cont pentru ca e atasat la proiect.
2. `vercel.ts:211` intra pe ramura `!adaugat.ok` si trimite `PATCH /v3/domains/esafe.ro {op:"update", zone:true}` (`vercel.ts:212`). Nu ramifica pe cod: 409, 403, 402 si 429 duc identic la acelasi PATCH.
3. PATCH raspunde probabil **200**, dar nu provizioneaza zona (formularea declarativa de mai sus). `vercel.ts:217` verifica doar `patch.ok`, iar `patch.data` (care in varianta "update" **poate** contine un camp `zone` boolean) nu e citit niciodata.

Pana aici, produsul are inca o plasa: `zonaChiarExista(apex)` la `vercel.ts:228`. Ea ar fi trebuit sa raspunda `false` si sa produca mesajul corect. **Nu a facut-o.** Dovada e comportamentala si e solida:

- `addDomainToVercel` iese devreme la `vercel.ts:296-299` daca zona esueaza, **inainte** de `addOne(apex)` (301) si de geamanul www (308). Masuratoarea 3 arata ca **si esafe.ro si www.esafe.ro sunt atasate la proiect**. Daca reconectarea clientului a trecut prin codul de dupa 07.08, poarta de zona a raportat succes.
- `repairDomainOnVercel` foloseste acelasi lant; daca sonda ar fi raspuns `false`, clientul ar fi primit textul explicit de la `vercel.ts:229-236` sau `514-522` ("Activeaza Enable Vercel DNS"). A primit "fara efect".
- Cronul orar (`domains-reconcile/route.ts:145`) alarmeaza doar pe `status.zoneMissing`, care cere `zonaVerdict === false` (`vercel.ts:468-469`). Nu a alarmat; problema a venit prin reclamatia clientului.

Deci `zonaChiarExista` a intors `true` sau `null`. Codul nu poate spune care, si asta e in sine o parte din defect. Doua ramuri, ambele confirmate ca defecte reale in cod, **nedepartajabile fara token**:

- **(a) verdict `null`.** `vercel.ts:150-157` intoarce `false` DOAR pe 404; 400/401/403/410/429/5xx si `status:0` (token lipsa) devin toate `null`. Pe `null`, `declaraZonaLaVercel` intoarce `{success:true}` (`vercel.ts:241`), `zoneMissing` ramane `false` (`468`), cronul tace, "Repara" raporteaza succes. Comentariul de la `238-241` ("apelantul re-verifica oricum") e **circular**: apelantul e `repairDomainOnVercel`, care re-verifica prin exact aceeasi sonda oarba.
- **(b) verdict `true` fals.** `GET /v5/domains/{apex}/records` raspunde 200 pentru un domeniu din cont fara zona. Documentatia nu confirma nici echivalenta "404 == zona nu exista" (404 e listat **fara niciun mesaj**, nu exista nicaieri eroare "zone not found"), nici forma raspunsului 200, care in `oneOf` are ca **prima varianta un sir simplu**. Codul trateaza orice `ok` drept "zona exista" (`vercel.ts:150-154`), fara sa inspecteze forma. **Marcat ca ipoteza**, neverificabil fara token.

Al treilea suspect, independent si mai rar, dar posibil: `resolveTeamId()` (`vercel.ts:56-68`) codifica "nu stiu" si "cont personal" prin aceeasi valoare `null`, iar `vercelFetch` (`79-84`) trimite atunci cererea **nescopata**, deci pe contul personal al detinatorului tokenului. Masuratoarea REFUSED arata insa ca **nu exista zona in NICIUN cont Vercel**, deci scenariul nu produce starea observata pentru esafe.ro. Ramane defect real pentru domenii noi, nu cauza aici.

### 1.3 De ce simptomul a fost fatal si nu doar deranjant

`src/components/dashboard/DomainSection.tsx:93` are `VERCEL_NAMESERVERS = ["ns1.vercel-dns.com","ns2.vercel-dns.com"]` **hardcodat**, randat la `902-941` intr-o fila "Nameservere" afisata pentru **orice** domeniu conectat, fara nicio poarta pe `status.zone`, cu textul "Cea mai simpla metoda... Noi ne ocupam automat de tot restul configurarii DNS." Serverul are exact garda potrivita (`status/route.ts:30-31`, `s.zone && ns`), pusa deliberat dupa incidentul atelierullarisei.ro; **interfata o ocoleste complet**. Aceasta suprafata l-a trimis pe clientul eSafe sa mute nameserverele la un Vercel care nu avea zona, transformand "site-ul nu merge" in "domeniul e mort complet, si site si email".

**Rezumat cauza radacina:** zona nu s-a creat pentru ca ruta pe care ne bazam (`PATCH /v3`) nu e documentata ca provizionand zona si aproape sigur nu o provizioneaza, iar singura ruta care o creeaza (`POST /v7`) e inaccesibila odata ce domeniul e in cont. Nici "Repara", nici cronul nu au semnalat nimic pentru ca sonda de verificare (`zonaChiarExista`) colapseaza orice esec non-404 in `null`, iar `null` e raportat drept succes peste tot, iar `zoneUnknown` (calculat la `vercel.ts:443`) **nu e citit de nimeni** in tot repo-ul.

---

## 2. REPARATIA IMEDIATA PENTRU esafe.ro (azi, manual)

Fa asta **inainte** de orice modificare de cod. Magazinul e mort acum.

### Calea A, documentata si nedistructiva

1. Panoul Vercel, echipa `team_DTQw4EErmn0TfMg3cQDvA123`, sectiunea **Domains** (nivel de cont, nu de proiect), domeniul `esafe.ro`.
2. **Advanced Settings** > butonul **Enable Vercel DNS**. E punctul de intrare documentat pentru crearea zonei (pereche cu "Delete DNS Zone" din meniul `...`).
3. Verifica din exterior, nu din panou: `dig @ns1.vercel-dns.com esafe.ro NS`. Trebuie sa raspunda **NOERROR autoritativ**, nu REFUSED. Verifica si `ns2`.
4. Verifica prin API (token de productie): `GET https://api.vercel.com/v5/domains/esafe.ro/records?teamId=team_DTQw4EErmn0TfMg3cQDvA123`. Trebuie sa treaca din 404 in 200. Noteaza **codul si corpul brut de dinainte si de dupa**, e proba care departajeaza ramurile (a) si (b) din 1.2.
5. Zona porneste **goala**. Inregistrarile pentru apex si subdomeniile de nivel intai se creeaza automat cand nameserverele arata catre Vercel si domeniul e atasat la proiect (documentat), dar **MX-urile si TXT-urile de email ale clientului NU**. Cere-i clientului inregistrarile lui de email si readauga-le, altfel domeniul serveste site-ul dar emailul ramane mort.
6. `GET /v6/domains/esafe.ro/config?projectIdOrName=prj_sBZxhUFY1pqSewl3NskGTDwe966V&strict=true` trebuie sa treaca de la `configuredBy: null` la `A` sau `dns-01`, si `acceptedChallenges` sa nu mai fie gol. Certificatul se emite automat dupa propagare; nu exista ruta care sa-l forteze si nu exista interval publicat in afara de 24-48h pentru nameservere.

### Calea B, de rezerva, daca zona tot nu apare

Scoate dependenta de zona Vercel cu totul. Reda domeniul in cateva minute:

1. La registrar, **schimba nameserverele inapoi** catre furnizorul DNS anterior al clientului (sau orice DNS extern: registrarul lui, Cloudflare etc.).
2. In zona externa pune: `A @ -> <recommendedIPv4[0]>` si `CNAME www -> <recommendedCNAME[0]>`. **Citeste valorile din `GET /v6/domains/esafe.ro/config`**, nu le presupune; codul le expune deja la `vercel.ts:459-460`, iar interfata le arata la `DomainSection.tsx:963-964`.
3. Readauga MX-urile de email in zona externa.
4. `esafe.ro` si `www.esafe.ro` sunt deja atasate la proiect, deci nu e nimic de facut pe Vercel. `misconfigured` va trece pe `false` dupa propagare si certificatul se emite.

Aceasta cale nu depinde de Vercel sa repare nimic si e cea pe care o recomanda ghidul oficial pentru platforme multi-tenant, care **nu cheama niciodata `POST /v7/domains` si nu foloseste niciodata `zone`**.

### Calea C, ultima, distructiva pe hartie dar cu risc nul aici

Doar daca A si B nu sunt acceptabile. Pentru esafe.ro riscul e nul **pentru ca zona nu exista, deci nu sunt MX sau TXT de pierdut**. Ordinea conteaza, `DELETE /v6/domains/{domain}` scoate automat si aliasurile:

1. `DELETE /v9/projects/prj_.../domains/www.esafe.ro` si `.../esafe.ro`
2. `DELETE /v6/domains/esafe.ro?teamId=...`
3. `POST /v7/domains {name:"esafe.ro", method:"add", zone:true}` (singura ruta documentata creatoare de zona)
4. `POST /v10/projects/prj_.../domains {name:"esafe.ro"}` si `{name:"www.esafe.ro", redirect:"esafe.ro", redirectStatusCode:308}`
5. Readauga MX-urile.

**Regula pentru cod:** stergerea e interzisa cand zona EXISTA, nu neconditionat. Diferenta fata de atelierullarisei.ro e exact asta.

---

## 3. REPARATIA DE FOND IN COD (ordonata)

### P0, fara ele orice altceva e ghicit

**1. `src/lib/vercel.ts:148-158` — `zonaChiarExista` sa nu mai colapseze totul in `null`.**
Intoarce `{ verdict: Verdict; status: number; body: unknown }`. `404` si `410` => `false`. `401`/`403` => eroare de configurare a platformei, semnal DISTINCT, nu `null` tacut. `429`/`5xx`/`status:0` => `null`. Verifica si FORMA raspunsului pe 200 (obiect cu `records`, nu sir), pentru ca `oneOf`-ul documentat are un sir ca prima varianta. Incruciseaza cu `accountDomain`: daca `GET /v5/domains/{apex}` da 404, zona **nu poate** exista, deci `false`.

**2. `src/lib/vercel.ts:228-241` — `declaraZonaLaVercel` sa nu mai raporteze succes pe verdict necunoscut.**
Pe `null`: `{ success:false, error:"Nu am putut confirma ca zona a fost creata (HTTP X)" }`. Comentariul de la `238-241` trebuie sters, e circular. Corecteaza si comentariul de la `190-193`: PATCH **nu** e documentat ca echivalentul "Enable Vercel DNS".

**3. `src/lib/vercel.ts:217` — citeste `patch.data.zone`.**
Varianta "update" a raspunsului 200 poate contine `zone: boolean`. Trateaza `zone === false` drept **dovada de esec** cu mesaj propriu. NU face poarta pe `zone === true`: campul e optional si nedescris, iar un 200 gol e legitim; ar produce fals negativ pe butonul "Repara".

**4. `src/lib/vercel.ts:211-226` — ramifica pe codul HTTP.**
`409` sau `domain_already_in_use` => incearca PATCH. `401`/`403` => eroare de configurare a platformei, `logError` critical, opreste, nu incerca PATCH. `402` => mesaj propriu (metoda de plata). `429` => niciun verdict, reincercare cu asteptare. Azi toate patru duc la acelasi PATCH inutil.

**5. `src/lib/vercel.ts` (tot modulul) — logare.**
Singurul `console.error` din fisier e la `335`. Adauga `logError({action:"vercel.zone", severity:"critical", details:{apex, pas, status, corp}})` pe fiecare esec de scriere si pe fiecare verdict `null`. Fara asta, urmatorul incident va fi tot dedus din masuratori DNS externe. Acesta e motivul pentru care esafe.ro nu a lasat nicio urma din ~40 de cereri catre Vercel.

**6. Consuma `zoneUnknown`.** E date moarte: se scrie la `vercel.ts:360, 406, 443, 479` si nu il citeste **nimeni** (nici `diagnose()`, nici cronul, nici componenta). Adauga in `status/route.ts:43-103` o ramura pe `zoneUnknown` **inaintea** celei de `misconfigured`, si in `cron/domains-reconcile/route.ts:145` o ramura care raporteaza si `status.zoneUnknown` si `status.error` (azi cronul ignora ambele).

**7. `src/components/dashboard/DomainSection.tsx:902-941` — gateaza fila "Nameservere".**
Afiseaz-o doar cand `status.zone === true`. Cand zona lipseste, mutarea nameserverelor nu e o imbunatatire, omoara domeniul complet. Oglindeste garda existenta din `status/route.ts:30-31`. Aceasta e suprafata care a produs partea fatala a incidentului eSafe.

### P1, defecte care produc esecuri tacute

**8. `src/lib/vercel.ts:296-299` — esecul zonei sa nu mai anuleze atasarea la proiect.**
Ruleaza cei trei pasi independent si intoarce verdict compus: `{ success: proiectOk, error: zonaErr, warning: wwwErr }`. Zona lipsa devine **eroare** doar cand `delegated === true` (NS arata catre Vercel), altfel **avertisment**. Motiv concret: `removeDomainFromVercel` (`324-352`) lasa deliberat domeniul in cont, deci deconectare + reconectare aterizeaza in a treia stare, si azi apexul **nu mai poate fi atasat niciodata** (conectare, "Repara" si cron cheama toate aceeasi functie si esueaza identic).

**9. `src/lib/vercel.ts:514` — judeca pe citirea finala.** `if (dupa.zoneMissing)`. Conjunctul `inainte.zoneMissing &&` nu apara de nimic (`zoneMissing` e prin constructie un verdict dovedit) si poate doar sa inghita dovada finala.

**10. `src/lib/vercel.ts:525` + `244-246` — `projectHasDomain` sa intoarca `Verdict`.** `404` => `false`, restul => `null`. Adauga `inProjectUnknown` in `DomainStatus`. Azi un 429 produce mesajul fals "Domeniul este deja folosit de alt proiect Vercel" (`259-273`) si il trimite pe comerciant sa caute un proiect inexistent.

**11. `src/lib/vercel.ts:56-68` + `79-84` — `resolveTeamId` cu trei stari.** `"team_..." | "personal" | "necunoscut"`. Pe `necunoscut`, rutele de CONT (`/v5/domains`, `/v7/domains`, `/v3/domains`, `/v6/domains`, `/v2/domains/*/records`) trebuie **abandonate** cu `{ok:false, status:0}` + log, nu trimise nescopate. Rutele de proiect pot continua, id-ul de proiect e unic global. Memorarea `null` pentru cont personal la `66` e corecta, dar merita un log.

**12. `src/lib/vercel.ts:97-99` — `shouldPairWww` numara etichete.** `firma.com.ro`, `magazin.co.uk` sunt tratate ca subdomenii: fara zona, fara www, si `getDomainStatus` fabrica `zone:true` la `422` si `wwwInProject:true` la `456`. `edinio.com.ro` e listat ca domeniu valid chiar in `src/lib/platform-hosts.test.ts:35`. Minim: lista explicita de sufixe compuse (`.com.ro`, `.nom.ro`, `.info.ro`, `.tm.ro`, `.org.ro`, `.co.uk`, `.com.au`); ideal, Public Suffix List. Separat si obligatoriu: pentru non-apex verdictul de zona trebuie `null`, nu `true`.

**13. `src/lib/vercel.ts:31` + `420` — retea si timeout.** `fetch` nu e in try/catch (doar `res.json()` e), nu exista `AbortSignal.timeout`, si `Promise.all` face ca o singura respingere sa arunce toata citirea. Foloseste `{ok:false,status:0}` pe eroare de retea, `AbortSignal.timeout(10_000)`, `Promise.allSettled`.

**14. `src/lib/vercel.ts:459-460` — citeste `configuredBy` si `acceptedChallenges`.** `configuredBy` e enum `A|CNAME|http|dns-01|null` si separa exact starile pe care le confundam: `dns-01` = **zona exista la Vercel** dar lipseste inregistrarea A (a doua confirmare, independenta de `/records`), `null` = nimic nu ajunge la Vercel (starea esafe.ro). `acceptedChallenges` gol = certificat imposibil pe orice cale, adica "nu se va repara singur niciodata". Adauga-le in `DomainStatus` si in diagnostic.

### P2, corectitudine si igiena

**15. Aliniaza versiunile.** `GET`/`DELETE` pe domeniul individual de proiect sunt documentate pe **v9**, nu v10 (v10 exista doar ca POST pe colectie). Schimba `vercel.ts:245, 341, 345, 423, 429, 541`. Merg azi, dar `projectHasDomain` si tot `getDomainStatus` depind de acel `ok`.

**16. `src/lib/vercel.ts:490` — `healthy` prea permisiv.** Adauga `&& !zoneUnknown && !zoneMissing`. Si `misconfigured` (`454`) trateaza un 200 fara campul `misconfigured` drept "configurat corect" prin coercitie; lipsa campului = necunoscut.

**17. `src/lib/vercel.ts:220` — ramura moarta.** `ok && !row` nu poate fi adevarata: `accountDomain` intoarce `row:null` doar cand `!ok`, iar pe `ok` `data` e garantat obiect (`rawFetch:32` face fallback la `{}`). Expune `inAccount: Verdict` derivat din status (200 => true, 404 => false, altceva => null) si foloseste-l. Adauga `inAccount` in `DomainStatus`: azi faptul cel mai diagnostic, "domeniul nu e in contul Vercel", nu ajunge nicaieri.

**18. `src/lib/vercel.ts:102-111` + caile API.** `errMessage(status, data)` sa prefixeze `HTTP {status}` si sa includa `error.code`. `encodeURIComponent` pe fiecare segment de cale (`127, 149, 212, 245, 341, 345, 423, 427, 429, 541`), si `valideazaDomeniuClient` obligatoriu la intrarea in `addDomainToVercel`/`removeDomainFromVercel`/`getDomainStatus`, nu doar in ruta de connect: `src/app/api/admin/domain-orders/route.ts:111` ocoleste validarea.

**19. `src/lib/vercel.ts:267` — `addOne` inghite un www deja atasat cu ALTA configuratie.** Sonda intreaba doar "exista?", nu "are `redirect: apex, 308`?". Citeste randul si trimite `PATCH /v9/projects/{id}/domains/www.{apex}` cand nu corespunde.

**20. `src/app/api/domains/status/route.ts:88-96` — "Functioneaza, dar fara www" intoarce `ok:true`,** dar butonul "Repara" se randeaza doar pe `!diagnosis.ok` (`DomainSection.tsx:568`). Textul spune "Apasa Repara" pentru un buton care nu exista. Marcheaz-o `ok:false` sau randeaza butonul mereu.

**21. `src/app/api/domains/status/route.ts:151-160` — propaga `repair.warning`.** `repairDomainOnVercel` il intoarce (`vercel.ts:310, 529`), `connect/route.ts:118` il propaga si interfata il afiseaza, ruta de status il arunca. Acelasi esec e vizibil la conectare si invizibil la reparare.

**22. `src/app/api/domains/status/route.ts:68` — `diagnose` ignora `s.delegated`.** Unui domeniu cu NS deja mutate la Vercel i se recomanda inregistrari A/CNAME la un registrar care nu mai e autoritativ.

**23. `src/lib/vercel.test.ts` — testele codifica drept adevar exact ipoteza neverificata.** Simulatorul decreteaza ca `/records` da 404 fara zona (`111-116`) si ca PATCH da mereu 200 (`255`), iar `resolveTeamId` reuseste intotdeauna (`44-49`). Adauga: `/records` -> 403; PATCH 200 cu `{zone:false}` => `success:false`; `resolveTeamId` picat => apelurile de cont ABANDONATE; `inainte.zoneMissing=false` cu `dupa.zoneMissing=true` => `success:false`; apex cu 3 etichete (`firma.com.ro`) => trece prin ramura de apex.

**24. `src/app/api/domains/lookup/route.ts:123` — cache-ul WHOIS nu se scrie NICIODATA.** Nu exista `cacheWhois.set` in fisier; fiecare cerere e miss, deci fiecare tastare deschide doua socketuri pe portul 43 catre ROTLD si Verisign. Adauga `cacheWhois.set(...)` inainte de `return`. Compus cu `lookup/route.ts:69`, unde orice raspuns care nu contine tiparul "not found" e interpretat drept "domeniu ocupat": un banner de rate-limit de la ROTLD ii spune clientului ca un domeniu liber e luat si ii ascunde butonul Comanda.

### Strategic, de pus pe masa separat

Ghidul oficial Vercel pentru platforme multi-tenant (cazul nostru exact) **nu cheama niciodata `POST /v7/domains` si nu foloseste niciodata `zone`**; foloseste doar `POST /v10/projects/{id}/domains` si trimite clientul la un TXT sau la schimbarea nameserverelor. Singurul caz in care Vercel activeaza singur nameserverele e domeniul **wildcard**. Fluxul nostru "domeniul intra in contul nostru + zona la noi" e in afara traseului documentat, si a produs doua incidente in trei zile. Pentru apex fara wildcard, trecerea la A/CNAME ca metoda implicita (zona Vercel devenind optiune explicita, gatuita si avertizata) ar elimina complet clasa asta de defecte.

---

## 4. DEFECTE RAMASE, dupa severitate

| # | Fisier:linie | Impact intr-o propozitie |
|---|---|---|
| 1 | `src/lib/vercel.ts:148-158` | Orice esec non-404 pe sonda de zona devine `null`, iar `null` nu e raportat nicaieri: un domeniu complet mort e clasificat tacut drept "asteptam nameserverele". |
| 2 | `src/lib/vercel.ts:228-241` | `declaraZonaLaVercel` intoarce `{success:true}` pe verdict necunoscut, iar justificarea din comentariu ("apelantul re-verifica") e circulara: apelantul foloseste aceeasi sonda oarba. |
| 3 | `src/lib/vercel.ts:190-193` | Comentariul afirma ca fapt documentat ca PATCH /v3 e "Enable Vercel DNS"; sintagma nu exista in specificatie si urmatorul cititor va repeta greseala. |
| 4 | `src/components/dashboard/DomainSection.tsx:93, 902-941` | Fila "Nameservere" cu ns1/ns2 hardcodate se afiseaza neconditionat, ocolind garda de pe server, si trimite clientii sa isi omoare domeniul complet cand zona lipseste. |
| 5 | `src/lib/vercel.ts:296-299` | Esecul zonei anuleaza atasarea la proiect si geamanul www, deci un domeniu ajuns in a treia stare nu mai poate fi conectat NICIODATA, nici din buton, nici din cron. |
| 6 | `src/lib/vercel.ts:97-99, 422, 456` | Apexurile cu sufix compus (`firma.com.ro`, `magazin.co.uk`) nu primesc zona si nu primesc www, iar statusul raporteaza hardcodat `zone:true` si `wwwInProject:true` pentru doua lucruri nicicand verificate. |
| 7 | `src/lib/vercel.ts:56-68, 79-84` | La un esec HTTP pe citirea proiectului, scrierile de CONT pleaca fara `teamId`, deci un domeniu nou si zona lui aterizeaza in contul personal, invizibil din panoul echipei. |
| 8 | `src/lib/vercel.ts:360, 406, 443, 479` | `zoneUnknown` e calculat in patru locuri si citit de zero: semnalul "n-am putut afla" nu produce niciun semn vizibil pentru client sau admin. |
| 9 | `src/lib/vercel.ts:204-242` (tot modulul) | Zero logare pe scrieri: cele ~40 de cereri catre Vercel pentru esafe.ro nu au lasat nicio urma, deci diagnosticul a trebuit dedus din DNS extern. |
| 10 | `src/lib/vercel.ts:211-226` | 409, 403, 402 si 429 duc identic la acelasi PATCH care nu are cum sa ajute, si produc acelasi mesaj generic catre comerciant. |
| 11 | `src/lib/vercel.ts:514` | Cere ca zona sa lipseasca in AMBELE citiri, deci poate inghiti dovada finala si raporta `repaired:true`; latent, interfata ramifica oricum pe `diagnosis.ok`. |
| 12 | `src/lib/vercel.ts:244-246, 452, 456` | `projectHasDomain` trateaza 429 ca "nu e pe proiect", producand mesajul fals "e folosit de alt proiect Vercel" si reparatii pe domenii sanatoase. |
| 13 | `src/lib/vercel.ts:31, 420` | `fetch` fara try/catch, fara timeout, in `Promise.all`: o eroare de retea arunca toata citirea, ruta da 500 fara corp util, si o stare partiala nu lasa nicio urma. |
| 14 | `src/lib/vercel.ts:490, 454` | `healthy` ignora complet zona, iar un 200 fara campul `misconfigured` produce "configurat corect" prin coercitie. |
| 15 | `src/app/api/cron/domains-reconcile/route.ts:145` | Cronul citeste doar `zoneMissing` si ignora `zoneUnknown` si `status.error`, deci tace exact in cazurile in care nu a putut verifica nimic. |
| 16 | `src/app/api/domains/connect/route.ts:146-153` vs `91-97` | Deconectarea goleste `custom_domain` inainte de a atinge Vercel, iar o reconectare esuata lasa magazinul mort in lume si complet invizibil pentru cron, email si `/admin/logs`. |
| 17 | `src/lib/vercel.ts:267` | Un `www.` deja atasat cu alta configuratie e raportat ca reparat, dar redirectul 308 nu se aplica niciodata retroactiv. |
| 18 | `src/app/api/domains/status/route.ts:88-96` | "Functioneaza, dar fara www" intoarce `ok:true` si spune "Apasa Repara", dar butonul nu se randeaza pe `ok:true`. |
| 19 | `src/app/api/domains/status/route.ts:151-160` | `repair.warning` (www esuat) e aruncat: acelasi esec e vizibil la conectare si invizibil la reparare. |
| 20 | `src/app/api/domains/status/route.ts:68` | `diagnose` ignora `s.delegated` si recomanda A/CNAME la un registrar care nu mai e autoritativ. |
| 21 | `src/lib/vercel.ts:220` | Ramura `ok && !row` e imposibila, deci utilizatorul primeste intotdeauna eroarea de la PATCH, cea mai putin relevanta dintre cele doua. |
| 22 | `src/lib/vercel.ts:245, 341, 345, 423, 429, 541` | GET/DELETE pe domeniul individual de proiect folosesc `/v10`, versiune nedocumentata (documentat e `/v9`); daca dispare tacut, `inProject` devine fals peste tot. |
| 23 | `src/lib/vercel.ts:127, 149, 212, 245, ...` + `admin/domain-orders/route.ts:111` | Numele de domeniu se interpoleaza brut in caile API, iar calea de admin nu valideaza deloc inainte de a chema `addDomainToVercel`. |
| 24 | `src/lib/vercel.ts:102-111` | `errMessage` nu ataseaza niciodata codul HTTP: 403 (token fara drepturi pe echipa), 409 si 429 arata identic pentru comerciant si pentru admin. |
| 25 | `src/lib/vercel.test.ts:111-116, 44-49, 255` | Testele decreteaza drept adevar exact ipotezele nedovedite (404 fara zona, PATCH 200 = zona creata, `resolveTeamId` mereu reusit), motiv pentru care reparatia din 07.08 a trecut verde fara sa acopere esafe.ro. |
| 26 | `src/app/api/domains/lookup/route.ts:110-123` | `cacheWhois` e citit si golit, dar niciodata scris: fiecare tastare deschide doua conexiuni brute la registre si consuma limitatorul de 60/ora. |
| 27 | `src/app/api/domains/lookup/route.ts:69` | Orice raspuns WHOIS care nu contine tiparul "not found" e interpretat drept "domeniu ocupat", deci un rate-limit de la ROTLD ii ascunde clientului butonul Comanda pe un domeniu liber. |

### Nota despre constatarile respinse

Trei respingeri din lista (C) sunt corecte ca litera dar au ratat tinta, si punctele lor **nu trebuie considerate inchise**:

- Respingerea "declaraZonaLaVercel raporteaza succes pe verdict necunoscut" e o obiectie de severitate si framing, nu de substanta; substanta e confirmata in alta parte si e defectul #2 de mai sus.
- Respingerea "Panoul recomanda mutarea nameserverelor pe baza unei sonde slabe" a demonstrat corect ca ruta de status e gatuita, dar in acelasi timp a **descoperit suprafata negatuita** din `DomainSection.tsx:93, 902-941`. Aceea e defectul #4, si e mai grava decat cea acuzata initial.
- Respingerea "sonda nu poate raspunde la intrebarea pusa" se bazeaza pe faptul ca nu avem token pentru a masura. Corect ca nu putem afirma; dar nici nu putem infirma, si ramane ramura (b) din 1.2. **Ipoteza deschisa, nu constatare respinsa.**

---

## 5. CE NU AM PUTUT VERIFICA FARA `VERCEL_TOKEN`

| Necunoscut | Proba de rulat in productie |
|---|---|
| Ce raspunde de fapt `GET /v5/domains/esafe.ro/records` (200, 404 sau 403) | **Proba decisiva.** Un singur apel cu tokenul de productie si `teamId`, cu logarea **codului si a corpului brut**. Departajeaza ramurile (a) `null` si (b) `true` fals din 1.2. Fara ea, orice reparatie a sondei e ghicit. |
| Daca `GET /v5/domains/{apex}/records` da 200 pentru un domeniu din cont FARA zona | Pe un domeniu de test adaugat cu `POST /v7/domains {zone:false}` sau in a treia stare: cere `/records` si compara cu acelasi apel dupa "Enable Vercel DNS". Tranzitia 404 -> 200 (sau 200 -> 200) inchide intrebarea. |
| Daca `PATCH /v3/domains/{apex} {op:"update", zone:true}` provizioneaza zona | Pe acelasi domeniu de test in a treia stare: PATCH, apoi `/records` imediat, apoi la 60s. Logheaza statusul PATCH si corpul complet (inclusiv campul `zone`). Aceasta proba decide daca pastram sau eliminam calea PATCH. |
| Codul si mesajul exact al lui `POST /v7/domains` pentru un domeniu deja in cont | Acelasi test. Mesajul "Cannot add X since it's already in use by one of your projects" **nu exista in specificatie**; toata ramificarea de la `vercel.ts:211` se bazeaza pe el. |
| Daca esafe.ro e in contul ECHIPEI sau al celui personal | `GET /v5/domains/esafe.ro` cu `teamId` si fara. Un 404 cu teamId plus un 200 fara ar confirma degradarea din `resolveTeamId`. |
| `configuredBy` si `acceptedChallenges` pentru esafe.ro | `GET /v6/domains/esafe.ro/config?projectIdOrName=prj_...&strict=true`. Asteptat `configuredBy:null` si `acceptedChallenges:[]` (ipoteza dedusa din enum, marcata "probabil" in sursa A). Confirma ca nu se repara singur niciodata. |
| Daca `/v10` chiar functioneaza pentru GET/DELETE pe domeniul individual | `GET /v10/projects/prj_.../domains/esafe.ro` vs `GET /v9/...`. Daca v10 da 404, `projectHasDomain` e fals constant si tot diagnosticul e compromis. |
| Ce configuratie are `www.esafe.ro` pe proiect (are `redirect: esafe.ro, 308`?) | `GET /v9/projects/prj_.../domains/www.esafe.ro`, campurile `redirect` si `redirectStatusCode`. Codul nu poate verifica asta azi (`vercel.ts:267, 456`), deci "partea de rutare e in regula" e o concluzie pe care codul nu o poate sustine. |
| Daca `PUT /domains/{domain}/records` (nedocumentata, `replaceDomainsByDomainRecords`, echivalent `vercel dns import`) creeaza zona | Ultima solutie, doar daca A, B si C din sectiunea 2 esueaza. Nimic nu confirma ca ar crea zona; marcat ca ipoteza. |

**Recomandare de instrumentare:** o ruta de admin temporara, gatuita pe rol, care ruleaza cele sase citiri de mai sus pentru un domeniu dat si returneaza `status` + corp brut pentru fiecare. Cinci minute de scris, si transforma toate re-auditurile viitoare din deductie in masuratoare. Este exact ce a lipsit si pe 07.08, si pe 09.08.