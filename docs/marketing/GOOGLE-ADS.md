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
| Cand se incarca tagul | numai dupa acordul pentru ANALIZA | dupa analiza SAU marketing |
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

(se completeaza dupa desfasurare)

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
   scapare.
3. `id`-ul de oferta lipseste pe evenimentele din COS (`begin_checkout`, `add_payment_info`, `view_cart`):
   linia de cos tine titlul variantei, nu ID-ul ei. Pagina produsului, adaugarea in cos si achizitia trimit
   ID-ul exact.
4. **Nevazut pe trafic real**: niciun magazin n-are inca `AW-…`, deci nici conversii, nici remarketing.
