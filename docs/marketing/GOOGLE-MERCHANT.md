# Google Merchant Center: evidenta integrarii

Trecerea din 17.09.2026. Cererea proprietarului: *„verifica si aici absolut tot conform documentatiei ca sa
fie totul perfect pentru ca este o integrare super Importanta”*.

Documentatie citita ca text, cap la cap (nu rezumata de un model), pastrata in timpul lucrului:

* Merchant API v1, fisierele `.proto`: `products/v1` (`productinputs`, `products`, `products_common`),
  `datasources/v1`, `notifications/v1`, `accounts/v1` (`programs`, `accountissue`, `developerregistration`,
  `homepage`);
* ghidurile: prezentarea produselor, actualizarile frecvente, problemele produselor, sursele de date,
  notificarile (prezentare + „product status changes”), programele, problemele de cont, tratarea erorilor,
  cotele si limitele, apelurile directe (inregistrarea ca dezvoltator), prezentarea autorizarii;
* specificatia datelor de produs din Merchant Center: `link`, `item_group_id`, `unit_pricing_measure`,
  `unit_pricing_base_measure`, `product_type`, `google_product_category`;
* taxonomia oficiala `taxonomy-with-ids.en-US.txt`, versiunea 2021-09-21, pastrata in repo la
  `src/lib/google-merchant/date/` ca proba s-o poata citi fara retea.

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

* **7 magazine conectate**: `caian-textile`, `itp-blk`, `mokka`, `okxi`, `suporti-numar`, `teoshop`,
  `tonel-beauty`; **315 oferte** in `gmc_products`;
* ⚠⚠ **la 6 din 7 magazine, TOATE ofertele (276) stateau „In asteptare”** cu zero destinatii si zero
  probleme, desi Google le verificase (aveau `last_status_at`), unele de 7 zile;
* `mokka`: 38 de oferte aprobate, cu **228 de probleme stocate** = 38 × 6 suprafete. 31 de produse aveau
  „Missing unit pricing measure”, iar cele 7 mapate pe „Fragrances” aveau `google_category_unrecognized`;
* **0 din 7 magazine aveau abonare la notificari**;
* `GMC_WEBHOOK_SECRET` **nu exista in Vercel** (verificat dupa nume, fara decriptare).

---

## Ce ofera documentatia si ce foloseam

| Ce | Inainte | Acum |
| --- | --- | --- |
| `productInputs.insert` / `delete` | folosite | la fel; eroarea isi pastreaza codul HTTP si `REASON` |
| `products.get` (stare, destinatii, probleme) | folosit | la fel; problemele comasate pe suprafete |
| `notificationSubscriptions.create` | folosit **gresit** (fara `targetAccount`), eroarea inghitita | corect, cu refolosire si motiv scris |
| `notificationSubscriptions.list` / `patch` | nefolosite | folosite: nu se dubleaza abonarea, adresa veche se repara |
| `programs.list` | nefolosit | **folosit**: panoul arata unde pot aparea produsele |
| `programs.enable` | nefolosit | folosit doar pentru `free-listings`, doar din `ELIGIBLE`, din buton |
| `accounts.issues.list` | folosit | la fel; caderea se scrie in jurnal |
| `developerRegistration.registerGcp` | folosit la fiecare cont | neschimbat (vezi „Ce ramane”) |
| `details[].metadata.REASON` | ignorat, mesajul se parsa | citit si scris in jurnal |
| backoff exponential (`quota`, `internal_error`) | nu | 1, 2, 4, 8, apoi 15 minute |
| limita zilnica (`QUOTA_TOO_MANY_REQUESTS`) | tratata ca o pana de minute | asteapta resetarea de la 12:00 UTC, fara incercari arse |
| `unitPricingMeasure` / `unitPricingBaseMeasure` | lipseau | trimise, validate dupa specificatie |
| `productTypes` | lipsea | categoria magazinului |
| `googleProductCategory` | cale de text, 5 din 77 inexistente | ID oficial |
| `link` pe varianta | adresa produsului | adresa care preselecteaza varianta |

---

## Defectele gasite si reparate

### 1. ⚠⚠ Nicio abonare la notificari, pe niciun magazin

Cererea de creare n-avea `targetAccount`, pe care ghidul il cere pentru un cont standalone („use your own
account ID for both variables”), iar eroarea se inghitea in ambele drumuri (callback-ul OAuth si alegerea
contului). Si chiar reusita, abonarea ar fi fost moarta: fara `GMC_WEBHOOK_SECRET`, webhook-ul refuza tot.

Reparat in `src/lib/google-merchant/abonare.ts` (`asiguraAbonarea`): listeaza abonarile contului, o
refoloseste pe a NOASTRA (dupa adresa webhook-ului, nu fura abonarea altei aplicatii), ii repara adresa cu
`PATCH ?update_mask=callBackUri` cand secretul s-a schimbat, si abia apoi creeaza. Fara secret nu creeaza
nimic. Motivul unei caderi se scrie in `abonare_eroare`, cu momentul in `abonare_incercata_la`.

⚠ Pentru magazinele deja conectate, **cronul `gmc-sync` face abonarea singur** (3 magazine pe rulare, o
incercare cazuta se reia dupa 6 ore): comerciantii nu se reconecteaza ca sa ajunga reparatia la ei.

### 2. ⚠⚠ „In asteptare” la nesfarsit: produse fara nicio destinatie

Un produs fara `destinationStatuses` nu e in verificare: contul n-are pornit niciun program in care sa apara.
Panoul il arata „In asteptare” si comerciantul astepta o aprobare care nu vine.

Reparat: `getMerchantStatus` numara separat ofertele verificate cu `destinations = []`, iar panoul spune
de ce. `getMerchantPrograms` citeste `programs.list` (listari gratuite, reclame Shopping) cu cerintele
neindeplinite si linkurile lor; cand `free-listings` e `ELIGIBLE`, un buton il porneste
(`programs.enable`). Reclamele Shopping NU se pornesc de aici: cer cont Google Ads si buget.

### 3. ⚠ 5 din 77 de categorii nu existau in taxonomia Google

Lista era de cai scrise de mana. „Health & Beauty > Personal Care > Fragrances”, de pilda, nu exista
(corect: „... > Cosmetics > Perfume & Cologne”, ID 479). Reparat: `CATEGORII_GOOGLE` are perechi
`[ID, cale]` verificate de proba contra fisierului oficial; se trimite ID-ul. Caile vechi salvate in
`category_map` se traduc la trimitere (`CAI_VECHI_GRESITE`) si se afiseaza corect in selector.

### 4. ⚠ Lipsea pretul pe unitate, obligatoriu in UE

Specificatia: produsele vandute la greutate, volum, lungime sau suprafata „must be displayed with unit
price”. Reparat: doua campuri noi in formularul de produs (sectiunea Google Shopping), validate in
`pret-pe-unitate.ts` dupa regulile oficiale (unitatile acceptate, fara `sheet`/`item` care sunt doar NZ/AU;
numitorii 1, 2, 4, 8, 10, 100 si perechile 75cl, 750ml, 50kg, 1000kg; aceeasi dimensiune). Ce nu e valid
nu pleaca: un atribut invalid respinge produsul, unul lipsa doar avertizeaza.

⚠ La variante, valoarea optiunii („250g” / „500g”) devine cantitatea variantei, dar NUMAI daca produsul are
deja o cantitate neta de acelasi fel. O optiune „40cm” la o perna nu face perna vanduta la metru.

⚠ **Comerciantii trebuie sa completeze campul**: la `mokka`, 31 de produse.

### 5. ⚠ Ofertele pe varianta trimiteau la pagina produsului, fara varianta aleasa

Specificatia `link`: pentru variante, adresa trebuie sa deschida pagina pe varianta, cu pretul ei. Reparat:
`adresaCuVarianta` adauga `?varianta=<identitatea stabila a combinatiei>` (uid-ul, sau amprenta titlului
la combinatiile vechi), iar ambele machete ale paginii de produs (Classic, Detailed) preselecteaza
combinatia activa, numai peste o alegere goala. Datele structurate (`hasVariant[].offers.url`) poarta
aceeasi adresa.

⚠ Preselectarea se face in randare, cu `useSyncExternalStore` (instantaneul serverului e gol), nu intr-un
efect: poarta de lint nu permite erori noi de tip `set-state-in-effect`.

### 6. ⚠ Variante diferite primeau ACELASI `offerId`

Forma veche era `<uuid>-<id combinatie>` taiat la 50 (limita din specificatie). Uuid-ul ocupa 37, deci din
slugul combinatiei ramaneau 13: „180x200-cm-alb” si „180x200-cm-alb-mat” dadeau acelasi id, iar a doua
oferta o suprascria pe prima la Google, cu pretul ei. Masurat: 3.493 de combinatii active s-ar fi strans in
702 id-uri, la 3 magazine care inca n-au Google Merchant; la cele conectate, zero. Reparat
(`offerIdVarianta`): id-ul care incape ramane neschimbat (nicio oferta trimisa nu se muta); altfel
`<uuid fara cratime>-<identitatea combinatiei>`, 49 de caractere.

### 7. Panoul nu arata linkul „cum rezolv” si repeta fiecare problema de sase ori

Proto-ul v1 numeste campul `documentation` (la problemele de CONT e `documentationUri`, de acolo confuzia),
iar Google intoarce aceeasi problema o data pe suprafata. Reparat: `problemeDeAfisat` comaseaza dupa
`code` + `attribute`, pastreaza severitatea cea mai grava si linkul (citit din ambele campuri, pentru
problemele stocate inainte).

### 8. ⚠ O cadere a tokenului STERGEA coada magazinului

`loadBusinessContext` intorcea `null` si pentru „magazin deconectat”, si pentru „Google n-a dat tokenul”,
iar cronul stergea coada in ambele cazuri. Schimbarile de pret si stoc ajungeau la Google abia la
retrimiterea saptamanala. Reparat: trei raspunsuri; la token cazut coada asteapta (5 minute la o pana,
o ora la revocat sau fara dreptul Shopping), fara sa creasca `attempts`.

### 9. Reincercari fara asteptare, si 400 reincercat degeaba

Ghidul erorilor cere backoff exponential. Reparat: `asteptareaUrmatoare` (1, 2, 4, 8, 15 minute) prin
`next_retry_at`; un 400 (`INVALID_ARGUMENT`) se opreste pe loc si se arata ca eroare, fiindca va fi la
fel si peste un minut.

### 10. Cronul scria configurarea veche peste alegerile comerciantului

`patchConfig` scria inapoi obiectul citit la inceputul rularii. Reparat: recitire chiar inainte de scriere,
si nimic scris pe un magazin deconectat intre timp.

### 11. Webhook-ul: un singur magazin pe cont, tot catalogul reverificat la o stergere

Doua magazine legate de acelasi cont Merchant: notificarile ajungeau doar la primul (`.limit(1)`). Iar la
un produs sters („If newValue is omitted, the product was deleted”), `getProduct` da 404 si ruta golea
`last_status_at` pe TOT catalogul. Reparat: magazinul se alege dupa oferta, si se reverifica doar ea.

### 12. Limita ZILNICA de apeluri tratata ca o pana de cateva minute

Ghidul cotelor da doua erori 429 aproape identice: pe minut (`QUOTA_REQUEST_RATE_TOO_HIGH`) si pe zi
(`QUOTA_TOO_MANY_REQUESTS`), care se reseteaza abia la 12:00 UTC. A doua ardea cele 5 incercari in jumatate
de ora si lasa produsul „Eroare”, desi nu era nimic gresit la el. Reparat (`limitaZilnicaAtinsa`,
`dupaResetareaZilnica`): lucrarea asteapta resetarea fara sa consume incercari, iar restul lucrarilor
magazinului nu mai lovesc degeaba in Google in rularea aceea.

### 13. Platforma nu vedea programele conturilor

Cauza celor 276 de oferte fara destinatie se putea afla doar cu tokenul comerciantului, adica numai cand
omul deschidea panoul. Acum cronul fotografiaza `programs.list` in configurare (`programe`,
`programe_citite_la`, `programe_eroare`), cate 3 conturi pe rulare, o data la 12 ore. O citire din baza
spune ce magazine au listarile gratuite oprite.

### Mai mici

* webhook-ul foloseste acelasi `obtineTokenul` ca restul: un token cazut reverifica doar oferta anuntata;
* mesajele de token spun motivul (revocat / fara dreptul Shopping / Google n-a raspuns), nu „sesiunea a
  expirat” la orice;
* la schimbarea contului, sursa de date a contului vechi nu se mai refoloseste, iar abonarea lui se sterge;
* un raspuns non-JSON de la Google nu mai iese drept „eroare de retea”.

---

## Probele

* `merchant-conform-documentatiei.test.ts`: taxonomia fata de fisierul oficial, abonarea, erorile, pretul pe
  unitate, maparea, adresa variantei (pagina si JSON-LD), problemele din panou.
* `cron-si-webhook-ruta.test.ts`: **ruleaza chiar `GET` din cron si `POST` din webhook**, cu o baza PostgREST
  de proba care aplica filtrele (si `coloana->>cheie`) si un Google de proba cu raspunsurile din ghiduri:
  token revocat si pana trecatoare, 500, 400, limita zilnica si cea pe minut, configurarea schimbata in
  timpul rularii, abonarile si programele magazinelor conectate, doua magazine pe acelasi cont.
* Bancul de mutanti: **72 de stricaciuni, toate prinse**. Doua au scapat pe drum si au intarit probele:
  `abonare_eroare` cautat ca subsir (actiunile il si citesc), si pragul de 12 ore al programelor, pe care
  proba nu-l atingea (contul proaspat cadea oricum sub plafonul de 3).

Suita intreaga, `tsc`, poarta de lint (57 de erori, niciuna noua) si buildul: verzi.

---

## Verificat pe productie

* 17.09.2026, 13:47 UTC: `GMC_WEBHOOK_SECRET` adaugat in Vercel (Production). ⚠ O variabila intra doar in
  desfasurarile NOI: cronul a raportat `abonari=0` pana la redeploy (`dpl_DyUXDpGka7C4X8Amhny1o6v5s3xx`).
* 13:53-13:55 UTC, dupa redeploy: **toate cele 7 magazine abonate**, in trei rulari (3 + 3 + 1), fara nicio
  eroare scrisa in `abonare_eroare`.

## Ce ramane

1. ⚠ **Programele se pornesc de comercianti.** 276 de oferte nu apar nicaieri pana nu e pornit un program.
   Panoul le spune acum de ce si, unde Google permite, le da butonul.
2. **`registerGcp` ramane apelat pe contul fiecarui comerciant.** Ghidul il descrie ca pas facut o data, pe
   contul principal al dezvoltatorului. Dar la depanarea live din 02.07.2026, fara inregistrare pe contul
   comerciantului chiar si `accounts.list` raspundea „not registered”, deci pasul ramane. Neschimbat.
3. **Nevazut pe trafic real**: `programs.enable` (il apasa comerciantul) si prima notificare ajunsa pe
   webhook (vine doar cand Google schimba starea unei oferte).
4. Pretul pe unitate cere completare de mana, produs cu produs.
5. `itp-blk` n-are domeniu propriu: Google nu aproba produse pe `edinio.com/itp-blk`.
