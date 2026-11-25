# Google Ads: evidenta integrarii

Trecerea din 18.09.2026. Cererea proprietarului: *„si aici e foarte important sa avem absolut tot la
perfectie”*.

Documentatie citita ca text, cap la cap:

* Tag Platform: `gtag.js reference`, `Conversions and key events (web)`, `Remarketing`, `Dynamic
  remarketing`, `User privacy and consent mode` (consent mode v2, de baza si avansat);
* Google Ads Help: `About enhanced conversions`, `Set up enhanced conversions for web using the Google tag`
  (campurile, normalizarea si hash-ul), `Enhanced conversions for web` din Google Ads API.

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

* **UN SINGUR magazin** are tag Google: `caian-textile`, cu `G-76XBCVV0P2`, adica un ID de **Analytics**;
* **zero magazine cu `AW-`**, **zero etichete de conversie**, **zero comenzi cu `gclid`** in 90 de zile.

⚠ Deci integrarea n-a raportat niciodata nimic in Google Ads, si nici n-avea cum. Expunerea zero ridica
pragul: nu exista trafic real care sa scoata defectele la iveala, iar probele sunt singura plasa.

---

## Ce ofera Google si ce foloseam

| Ce | Inainte | Acum |
| --- | --- | --- |
| ID-ul conversiei | `send_to` compus din `google_tag_id`, care poate fi `G-` (GA4) | camp separat `google_ads_conversion_id`, numai `AW-` |
| Eticheta de conversie | se salva si fara ID de conversie | refuzata fara `AW-`: n-ar avea unde pleca |
| `transaction_id` | trimis | la fel (deduplicarea conversiei la reincarcarea paginii) |
| Enhanced conversions | **lipseau** | emailul si telefonul hash-uite pe server, in `gtag('set','user_data')`, inaintea conversiei |
| Consent mode v2 | semnalele existau, dar `analytics_storage` pleca mereu `granted` | fiecare semnal citeste categoria lui |
| Cand se incarca tagul | numai dupa acordul pentru ANALIZA | dupa analiza SAU marketing; din 25.11.2026 eticheta de reclame poate porni si inainte de acord, cu semnalele refuzate (vezi capatul documentului) |
| Remarketing dinamic | fara `id` si fara `google_business_vertical` | ambele, cu ID-ul ofertei din Merchant Center |
| `gclid` | fotografiat la checkout | la fel (pentru import de conversii offline, cand va fi cu putinta) |

---

## Defectele gasite si reparate

### 1. ⚠⚠ Conversia pleca la un ID care nu primeste conversii

`send_to` se compunea din `google_tag_id`, campul in care incape orice tag Google. Cu un `G-…` iesea
`G-76XBCVV0P2/eticheta`, iar Google Ads nu primea nimic. Cu datele din productie de azi, exact asta s-ar fi
intamplat la prima comanda.

Reparat: camp separat `google_ads_conversion_id`, validat ca `AW-…` (`lib/google-ads/conversie.ts`), iar
`conversieCumparare` intoarce `null` cand lipseste ID-ul sau eticheta, deci nu pleaca un eveniment orb.
Eticheta nu se mai poate salva singura: `saveMarketingConfig` o refuza cu un mesaj care spune de ce.

⚠ ID-ul de conversie primeste si `config` in tag: fara asta, `send_to` n-ar avea destinatia incarcata.

### 2. ⚠⚠ Fara enhanced conversions

Documentatia: emailul (preferat), telefonul si adresa, hash-uite SHA-256, urcate odata cu conversia, cresc
potrivirea. Nu trimiteam nimic.

Reparat: pagina de confirmare calculeaza pe SERVER `sha256_email_address` si `sha256_phone_number`, iar
`FbPurchaseEvent` le pune cu `gtag('set', 'user_data', …)` **inaintea** evenimentului de conversie.

⚠ Normalizarea e a LOR, si difera de Meta si TikTok: pe langa taierea spatiilor si literele mici,
*„Remove all periods (.) that precede the domain name in gmail.com and googlemail.com email addresses”*.
Telefonul merge in E.164 cu `+`. Hash-urile din probe sunt chiar exemplele din documentatie.

⚠ NU trimitem adresa: pentru ea ar trebui si codul postal si tara, iar acelea n-au pereche hash-uita in
lista lor de chei, deci ar fi plecat in clar in HTML-ul paginii de confirmare. Emailul singur e destul.

### 3. ⚠ Tagul Google statea numai sub acordul pentru ANALIZA

Cine accepta marketingul dar refuza analiza nu trimitea nicio conversie Google Ads si nu intra in nicio
lista de remarketing: tagul nici nu se incarca. In plus, `analytics_storage` pleca mereu `granted`, fiindca
se presupunea ca acordul de analiza exista.

Reparat: poarta primeste amandoua categoriile (ajunge oricare), iar semnalele consent mode v2 citesc fiecare
categoria lui: `analytics_storage` din analiza, `ad_storage`/`ad_user_data`/`ad_personalization` din
marketing.

### 4. ⚠ Remarketingul dinamic n-avea ce arata

Documentatia cere pe evenimentele de comert `items: [{ id, google_business_vertical: 'retail' }]`, cu `id`
CHIAR ID-ul ofertei din feedul Merchant Center. Noi trimiteam doar `item_id` (ID-ul produsului), forma GA4.

Reparat intr-un singur loc (`gtagEvent`): cand magazinul are ID de conversie Ads, fiecare articol primeste
`id` si `google_business_vertical`. ID-ul ofertei vine din aceeasi functie ca sincronizarea Merchant Center
(`offerIdVarianta`), mutata intr-un modul comun.

⚠ Produsul cu variante, inainte de alegere, NU primeste `id`: ID-ul lui e `item_group_id` in feed, nu o
oferta, iar un ID inexistent n-ar potrivi nimic.

---

## Probele

* `src/lib/google-ads/google-ads-conform-documentatiei.test.ts`: hash-urile **exact ca in exemplele lor**,
  regula punctelor din Gmail, telefonul E.164, refuzul unui ID GA4, forma `send_to`, ID-urile de oferta si
  cablarea din pagini (consimtamant, ordinea `user_data` inaintea conversiei).
* `src/lib/google-ads/google-ads-runtime.test.ts`: `gtagEvent` rulat chiar el, cu un `gtag` de proba:
  articolele primesc `id` si `google_business_vertical` numai cand magazinul are ID de conversie.
* `src/lib/actions/marketing-config-actiune.test.ts`: `saveMarketingConfig` rulat chiar el, cu PostgREST de
  proba: eticheta fara ID e refuzata si nu se scrie nimic.
* Bancul de mutanti: **45 de stricaciuni, toate prinse**. Prima rulare a lasat 4 sa scape, si toate au
  intarit probele: forma E.164, tara implicita, ID-urile de oferta de pe achizitie, si poarta de
  consimtamant, pe care am scos-o din componenta intr-o regula pura (`areAcordPentru`).

Suita intreaga (8957), `tsc`, poarta de lint (57 de erori, niciuna noua) si buildul: verzi.

---

## Verificat pe productie

* `f0a003ed`, desfasurarea `dpl_DNv5d62np83PsxiyncE8aKS94ewy`, gata la 07:44 UTC. Niciun avertisment sau
  eroare in jurnalul desfasurarii.
* ⚠ Pagina nu poate fi verificata din HTML: singurul magazin cu tag Google (`caian-textile`) are bannerul de
  cookie-uri PORNIT, deci tagul se randeaza abia dupa consimtamant, in browser. Verificarea s-a facut pe
  CODUL LIVRAT, in bucatile lui:
  * semnalele pe categorii: `ad_user_data: e.marketing ? "granted" : "denied"`, alaturi de `analyticsGranted`;
  * `window.__edinioGoogleAds`, pe pagina de magazin;
  * `google_business_vertical`, in runtime-ul evenimentelor;
  * pe pagina de confirmare: `gtagRaw("set","user_data", …)` INAINTEA conversiei, si
    `send_to: \`${c}/${p}\`` (ID de conversie + eticheta).
* Nicio schimbare de schema, deci nicio migratie: campul nou sta in `marketing_config`.
* ⚠ Nevazut: o conversie adevarata. Niciun magazin n-are inca ID `AW-…`, deci nici nu putea pleca vreuna.

## Ce tine de comercianti

1. **ID-ul de conversie (`AW-…`) si eticheta**, din Google Ads > Obiective > Conversii > actiunea de
   conversie > Tag setup. Fara ele nu se raporteaza nicio vanzare.
2. **Enhanced conversions se pornesc o data din Google Ads**, la actiunea de conversie, cu metoda „Google
   tag”. Noi trimitem deja datele hash-uite; pana nu e bifat acolo, Google le ignora.
3. **Remarketingul dinamic** cere un cont Merchant Center legat de Google Ads si feedul de produse: ID-urile
   pe care le trimitem sunt chiar ofertele din feed.

## Ce ramane

1. **Fara import de conversii offline (server-side).** Google Ads API cere un token de dezvoltator al
   platformei, cu aprobare separata, exact ca App Review la Meta. Deci conversiile pleaca din browser;
   `gclid` se pastreaza pe comanda, ca importul sa fie cu putinta cand tokenul va exista.
2. **Consent mode „de baza”, nu „avansat”**: tagul nu se incarca deloc pana la un acord. Asta inseamna ca nu
   exista modelarea conversiilor pentru vizitatorii care refuza. E o alegere de confidentialitate, nu o
   scapare. ⚠ SCHIMBAT pe 25.11.2026 pentru eticheta de reclame: cu ea blocata, Google Ads nu gasea eticheta
   pe site. Vezi sectiunea „25.11.2026”, la capat.
3. `id`-ul de oferta lipseste pe evenimentele din COS (`begin_checkout`, `add_payment_info`, `view_cart`):
   linia de cos tine titlul variantei, nu ID-ul ei. Pagina produsului, adaugarea in cos si achizitia trimit
   ID-ul exact.
4. **Nevazut pe trafic real**: niciun magazin n-are inca `AW-…`, deci nici conversii, nici remarketing.

---

## 25.11.2026: eticheta de reclame porneste inainte de acord

### Ce s-a intamplat

Primul magazin cu `AW-` adevarat (eSAFE) a vrut sa porneasca o campanie, iar Google Ads i-a spus ca eticheta
Google lipseste de pe site. ID-ul era salvat corect. Masurat pe pagina lui publica: ID-urile erau in datele
paginii, dar nicio cerere spre `googletagmanager.com` nu pleca, fiindca eticheta statea dupa poarta de
consimtamant (punctul 2 din „Ce ramane”, mai sus, scris ca alegere de confidentialitate).

### De ce nu o gasea Google

Google isi judeca starile (Tag Diagnostics, Tag coverage, starea actiunii de conversie) dupa semnalele primite
de la eticheta, din browsere adevarate:

* modul de baza: *„No data is sent before a user consents - not even the default consent status”*;
* modul avansat: *„Consent state pings are sent from each page the user visits where consent mode is enabled”*
  (amandoua: support.google.com/google-ads/answer/10000067);
* *„No recent data means that the Google tag has never been detected from your website.”*
  (support.google.com/google-ads/answer/14681508);
* ghidul pentru platforme le cere, pe langa `consent update` automat, starea implicita si etichete care nu
  sunt blocate de consimtamant (developers.google.com/tag-platform/devguides/gtag-integration).

⚠ Ce NU se stie: cum lucreaza butoanele „Scan” si „Test your website” din Google Ads (nu e documentat). Si:
starea de campanie „Eligible (Misconfigured): Your website is missing a Google tag” *„often means your campaign
hasn't recorded any biddable conversions in the last 28 days”* (aceeasi pagina). Deci eticheta gasita nu stinge
neaparat mesajul acela: mai trebuie o actiune de conversie cu eticheta ei si o conversie inregistrata.

### Ce face acum (`src/lib/eticheta-google/corp.ts`)

| Magazinul | Inainte de acord | Dupa acord |
| --- | --- | --- |
| are `AW-`, optiunea pornita (din oficiu) | pe o adresa curata, eticheta de reclame porneste cu cele patru semnale pe `denied`, `ads_data_redaction`, numai `config AW-` (la sosirea bibliotecii), Analytics oprit de tot | `consent update`, `config` si pentru Analytics, apoi evenimentele din coada |
| numai Analytics, sau optiunea oprita | nimic, ca inainte | eticheta porneste intreaga |
| bannerul oprit din panou | totul `granted`, ca inainte | la fel |

* Scriptul e scris de server in pagina (layoutul vitrinei), nu adaugat dupa hidratare; isi cere singur
  biblioteca. Nu porneste in previzualizarea din editor si nici in zona de cont.
* ⚠ Inainte de acord porneste NUMAI PE O ADRESA CURATA: nu pe pagina de confirmare si pe cea de retur, nu pe
  o adresa cu alti parametri decat cei de campanie (`utm_*`, identificatorii de clic ai Google, `gtm_debug`) si
  nu cand omul vine de pe o asemenea pagina sau din zona de cont a aceluiasi magazin. Semnalul duce adresa
  paginii si pe cea a paginii de provenienta. Cu acord porneste peste tot, ca inainte.
* Adresa se judeca de doua ori: la citirea paginii si din nou cand soseste biblioteca; `config`-ul de
  dinainte de acord pleaca abia atunci. Biblioteca incarcata fara `config` nu trimite nimic (masurat).
* `window.gtag` nu e la vedere pana la acord: un script strain (chatul cu integrarea lui de Analytics) nu are
  pe unde trimite pe langa coada. Biblioteca Google citeste `dataLayer`, deci eticheta se gaseste si fara el.
* Analytics e oprit de tot pana la acord prin `window['ga-disable-G-…']`, comutatorul din documentatia Google:
  si pentru comerciantul care si-a combinat etichetele in contul Google (atunci `config AW-` ar hrani si
  destinatia de Analytics). Se ridica la acord si se pune la loc la retragere. Masurat: un eveniment tras cu
  comutatorul pus nu pleaca, iar dupa ridicare pleaca.
* Evenimentele (`view_item`, `add_to_cart`, `purchase`, `conversion`) asteapta acordul in coada din
  `lib/marketing.ts`, ca inainte. Datele clientului (enhanced conversions) cer acordul de marketing.
* Optiunea comerciantului: Setari > Banner Cookies, „Eticheta Google Ads porneste inainte de acord”
  (`cookie_banner_config.google_ads_inainte_de_acord`, din oficiu pornita).
* Bannerul din vitrina trece Google Ads la „Marketing” si spune, acolo unde e cazul, ca eticheta se incarca si
  la refuz: in panoul cu categorii si in bara de la primul nivel, de unde se poate apasa direct „Refuza”.
* Cine a raspuns bannerului cand „Marketing” nu i se arata (magazin numai cu Google Ads, sau cu Analytics si
  Google Ads) e intrebat o data: un refuz e al omului numai pentru ce i s-a aratat. Raspunsul nou se scrie cu
  lista categoriilor aratate (`oferite`). Cine a refuzat o categorie care i s-a aratat nu e intrebat din nou.

### Ce pleaca inainte de acord (masurat in browser, pe magazinul de proba)

* o cerere dupa biblioteca: `www.googletagmanager.com/gtag/js?id=AW-…`;
* un semnal pe incarcare de pagina: `pagead2.googlesyndication.com/ccm/collect`, cu `en=page_view`,
  `gcs=G100` (totul refuzat), adresa paginii, cu identificatorul de clic sters (un `gclid` din adresa ajunge
  cu un singur caracter in loc de valoare);
* o cerere de diagnostic a bibliotecii, `www.googletagmanager.com/td`, tot cu adresa paginii. Pleaca numai
  dupa `config`: biblioteca incarcata fara el nu trimite nimic;
* `window.gtag` nedefinit, `window['ga-disable-G-…']` pus;
* pe `/confirm?orderId=…` si pe o adresa cu `?q=…`: nicio cerere spre Google;
* niciun cookie Google, nicio cerere Analytics, nicio cerere de remarketing, niciun pixel Meta sau TikTok.

Dupa acceptare: `consent update` (`gcs=G111`), `config` pentru Analytics (cu cererea lui `g/collect`),
evenimentele asteptate, cookie-urile; `window.gtag` apare, comutatorul de Analytics se ridica.
Dupa retragere: `consent update` cu tot refuzat, coada nu mai trimite, `window.gtag` dispare, Analytics e oprit.

### De ce atat de putin, desi modul avansat ar permite mai mult

Incarcarea unei etichete inainte de acord e recomandarea Google, dar in UE nu exista o hotarare de autoritate
despre ea, iar cadrul general ii e mai degraba potrivnic (ghidul EDPB 2/2023 pune sub art. 5(3) si cererile
pornite de un script; autoritatile germane cer ca scripturile tertilor sa nu se incarce inainte de acord).
De aceea: numai eticheta de reclame, fara Analytics, fara evenimente (o conversie trimisa fara acord ar purta
numarul si valoarea comenzii), cu identificatorii de clic stersi, spus in banner si cu optiune de oprire la
comerciant, care e operatorul datelor din magazinul lui. Hotararea de a o tine pornita din oficiu e a
proprietarului platformei: intrebat pe 25.11.2026, cu cele doua variante si cu riscul fiecareia (pornita la
toti, sau oprita si pornita de comerciant cu un clic), a ales „Pornită la toți”.

### Recenzia independenta din 25.11.2026 (inainte de publicare)

Cinci recenzenti, fiecare observatie verificata separat. Ce au gasit si s-a reparat:

1. ⚠⚠ Semnalul de dinainte de acord duce adresa paginii, iar `/confirm?orderId=…&name=…&total=…` purta
   numarul comenzii, numele clientului si totalul; `/retur?order=…`, numarul comenzii. De aici regula adresei
   curate. Tot atunci: cele cinci drumuri vechi spre pagina de confirmare (`OrderModal`, Netopia, iPay,
   Klarna, Revolut) nu mai pun numele si totalul in adresa; pagina le citea oricum din comanda.
2. ⚠⚠ Pagina de provenienta: o adresa din zona de cont (`/cont/comenzi/<id>`) trecea drept curata. Zona de
   cont e acum judecata si la provenienta, iar paginile ei trimit mai departe numai originea
   (`cont/layout.tsx`, `referrer: strict-origin`).
3. Pixelii si zona de cont in acelasi document: din ecranele contului se iesea in magazin fara reincarcare
   (`<Link>`), deci pixelii se montau in documentul incarcat in zona de cont si ramaneau vii la „Inapoi”.
   Legaturile de iesire sunt `<a>`, iar un document incarcat in zona de cont nu mai primeste pixeli deloc
   (`DoarInAfaraContului niciDupaIesire`). Problema era dinainte, pentru vizitatorii cu acord.
4. Bara de la primul nivel a bannerului nu spunea ca eticheta se incarca si la refuz. Acum spune.
5. `window.gtag` la vedere inainte de acord, etichetele combinate in contul Google, adresa citita de
   biblioteca mai tarziu decat o judecam, raspunsul vechi care nu mai era intrebat: vezi punctele de mai sus.
6. Probele: jumatatea din browser se proba numai pe text (11 din 13 stricaciuni incercate treceau). E acum o
   functie (`lib/eticheta-google/legatura.ts`) rulata in probe; scriptul si coada adevarata se intalnesc in
   `eticheta-si-coada.test.ts`; salvarea optiunii din Setari e rulata de-adevaratelea
   (`banner-cookie-actiune.test.ts`). 74 de stricaciuni puse dinadins, toate prinse.

### ID-urile `GTM-`

Din noiembrie 2026 ecranul de instalare din Google Ads arata din oficiu un ID `GTM-` (*„New installations use
a Google Tag Manager container ID (GTM-) by default”*, developers.google.com/tag-platform/devguides/existing).
Instalarile cu `gtag/js` plus `config AW-` raman valabile. Un `GTM-` nu se accepta in campurile noastre si nu
ajunge in script nici scris direct in baza: incarcat ca eticheta, e un container in care ruleaza orice script
(support.google.com/tagmanager/answer/17070049). Comerciantul primeste un mesaj care ii spune de unde ia
ID-ul `AW-`.

### Ce ramane

1. De vazut pe eSAFE, dupa publicare, cu bannerul neraspuns: semnalul `gcs=G100` pe pagina lui, NICIO cerere
   `g/collect` (Analytics) si starea din Google Ads (pana la 48 de ore). Daca mesajul de pe campanie ramane,
   cauza e conversia, nu eticheta. Pe magazinul de proba ID-urile sunt inventate, deci purtarea cu o eticheta
   COMBINATA in contul Google nu s-a putut masura: comutatorul `ga-disable` e verificat, eticheta combinata nu.
2. `gtag('config')` e trecut de Google la „deprecated” (noiembrie 2026), fara data de scoatere; instalarile
   de felul asta merg in continuare. De reverificat cand Google isi schimba ghidul de consimtamant.
3. Cookie-urile `_gcl_*` si `_ga*` scrise dupa un acord raman in browser la retragere (eticheta nu le mai
   citeste). Stergerea lor nu s-a facut: pe gazda comuna `edinio.com` ar atinge si cookie-urile altui magazin.
4. Un camp separat pentru containerul `GTM-` (pentru agentii) nu exista. Daca se cere: numai dupa acord, cu
   raspunderea continutului la comerciant.
5. Un „Google tag Developer ID” al platformei (Google il da platformelor care instaleaza eticheta pentru multi
   comercianti): necerut.
6. O destinatie pe care comerciantul n-a trecut-o in panou (o a doua proprietate Analytics pusa pe aceeasi
   eticheta, in contul lui Google) nu poate fi oprita din magazin: primeste semnale fara cookie-uri inainte de
   acord. E spus langa optiune si in ghid.
7. Pagina de confirmare isi trimite adresa (`/confirm?orderId=<id>`) drept pagina de provenienta paginii
   urmatoare, deci pixelii vizitatorului CU acord o primesc. Dinainte de schimbare. Politica stransa de
   provenienta nu s-a pus acolo: pe adresa cu slug, atribuirea vizitei recunoaste navigarea interna dupa
   CALEA de provenienta (`lib/storefront/attribution.ts`), iar numai cu originea ar socoti-o venita de pe
   site-ul platformei.
8. Cine a refuzat marketingul intr-un magazin care avea si Facebook sau TikTok nu e intrebat din nou (i s-a
   aratat categoria), deci nu vede in banner fraza despre eticheta Google Ads. Modelul de politica de
   confidentialitate al magazinelor nu spune inca nimic despre ea.
