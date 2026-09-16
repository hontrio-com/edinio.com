# SMSO: evidenta integrarii

Trecerea din 17.09.2026. Documentatie oficiala: `api-docs.smso.ro`.

Intrebarea pusa de proprietar a fost exact asta: *„fa audit complet ca sa vedem daca chiar folosim
toate functiile pe care ni le ofera api-ul"*. Raspunsul masurat, inainte de orice reparatie, a fost
**nu**.

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

* **3 magazine** cu SMSO pornit (`smso_config.enabled`), toate 3 cu configuratie completa;
* **2 campanii**, `55` de SMS-uri trimise, `0` esuate declarate;
* **399 de randuri** in `notice_sms_log`, **toate 399 de la notice.ro**, celalalt furnizor;
* **0 randuri de la SMSO**;
* **0 dezabonati** tinuti minte, fiindca tabelul nu exista.

⚠ Cifra care spune tot: **399 la 0**. Platforma avea deja un jurnal de SMS-uri, cu `provider_id` si
cu webhook de raport de livrare, folosit cu sarg de celalalt furnizor. SMSO nu scria nimic, nicaieri.

---

## Ce ofera API-ul lor si ce foloseam

| Ce | Inainte | Acum |
| --- | --- | --- |
| `GET /senders` | folosit | folosit |
| `POST /send` | folosit | folosit, **cu 4 campuri in plus** |
| `GET /credit-check` | scris, dar **nechemat de campanie** | chemat inainte de primul mesaj |
| `GET\|POST /status` | **nefolosit** | cron orar de reconciliere |
| webhook raport livrare | **nefolosit** | ruta proprie, adresa semnata |
| webhook raspunsuri | **nefolosit** | aceeasi ruta, STOP tinut minte |
| `source_app` | nefolosit | `Edinio/1.0` la fiecare mesaj |
| `webhook_status` / `webhook_responses` | nefolosite | **trimise cu fiecare mesaj** |
| `generate_unsubscribe_link` | nefolosit | cerut la marketing |

Deci: 3 capete din 4, 0 webhook-uri din 2, si 3 campuri optionale din 4 lasate pe masa.

---

## ⚠⚠ Defectul de fond: „trimis" nu insemna „a ajuns"

`sendSms` primea inapoi `responseToken` si il **arunca in toate cele sase cai reale de trimitere**.
Se folosea intr-un singur loc: ruta de test, ca sa fie afisat pe ecranul de configurare.

`responseToken` e cheia LOR pentru mesaj. Fara ea nu se poate interoga `/status` si nu se poate
potrivi niciun raport de livrare. Aruncand-o, raportam „trimis" fiindca **API-ul acceptase** mesajul,
niciodata fiindca **ajunsese la telefon**.

⚠ Si nu fiindca era greu. Infrastructura exista deja, intreaga, pentru notice.ro, la zece fisiere
distanta: acelasi tabel, acelasi camp `provider_id`, acelasi tipar de webhook.

---

## ⚠⚠ Al doilea defect: codul `405` se uita

SMSO intoarce `405` cand numarul e dezabonat. `sendSms` traducea codul intr-un mesaj pentru om
(`"Numar dezabonat."`) si **arunca cifra**. Apelantul primea un `success: false` de nedeosebit de o
pana de retea, il numara intr-un `failedCount`, si uita.

Consecinta: **aceeasi persoana primea si campania urmatoare, si pe urmatoarea.** Nu e o chestiune de
eleganta, e una de conformitate.

Reparat pe trei niveluri:

1. `SmsoSendResult` poarta acum `status` ca **cifra**;
2. `405` scrie un rand in `sms_optout` (tabel nou, cu RLS pe proprietar);
3. garda de dezabonare sta **langa trimitere**, in `trimiteSiLasaUrma`, nu la un apelant din trei.

⚠ **Garda se aplica DOAR marketingului.** Starea unei comenzi pe care omul a platit-o nu e reclama,
iar el are dreptul s-o afle chiar daca nu mai vrea campanii.

⚠ **O citire picata a listei OPRESTE trimiterea.** Citita pe dos, garda ar fi sunat exact oamenii
care au cerut sa nu mai fie sunati, si tocmai cand baza are o problema.

---

## ⚠⚠ Al treilea defect, gasit abia la a doua citire a documentatiei

Prima varianta a webhook-ului cerea comerciantului sa intre in contul lui SMSO si sa lipeasca o
adresa. Recitind specificatia pentru parametrii lui `/send`, a iesit propozitia care schimba totul:

> webhooks can be set up either in your team's account or per message sent

`webhook_status` si `webhook_responses` se trimit **cu fiecare mesaj**. Deci:

* fiecare magazin are adresa LUI, cu secretul lui in ea;
* rapoartele merg **de la primul SMS**, fara ca cineva sa configureze ceva;
* adresa din panou ramane, dar ca optiune, nu ca obligatie.

⚠ Fara asta, rapoartele de livrare ar fi functionat pentru comerciantii care intra la SMSO si lipesc
o adresa. Adica, realist, pentru niciunul.

---

## Adresa webhook-ului: EA e singura paza

Documentatia lor o spune pe fata: *„No authentifications is required"*. Niciun antet de semnatura,
niciun secret comun, nicio lista de adrese.

⚠⚠ **Ce ar fi putut face cineva cu o adresa ghicibila**: nu doar sa strice statistica, ci sa trimita
un raspuns falsificat cu textul „STOP" pentru fiecare numar al unui magazin si **sa-i dezaboneze
toata lista de clienti**.

Trei garzi, nu una:

1. **adresa e semnata** cu `semnaturaCheii`, acelasi ajutor ca la etichetele de curier: derivata din
   secretul serverului, deci nereconstruibila din id-ul magazinului. ⚠ `semnaturaCheii` **arunca**
   daca secretul lipseste, deci nu exista drum in care garda sa devina tacut inofensiva;
2. **raportul se potriveste pe `(magazin, furnizor, id-ul lor)`**, deci un `uuid` inventat nu atinge
   niciun rand;
3. **o dezabonare cere ca numarul sa fi primit CHIAR un mesaj de la magazinul acela.** Altfel cineva
   care ar afla adresa ar putea insira numere straine si le-ar bloca pe toate.

Si `ceruOprirea` se uita doar la **primul cuvant**: „nu ma opri din cumparat" nu dezaboneaza pe
nimeni.

---

## Al patrulea capat: `/status`

Webhook-ul lor e „trimite si uita": o incercare, iar daca cererea se pierde (o redesfasurare la
mijloc, o pana de retea, un 500 de-al nostru) mesajul ramane `sent` pe veci.

`/api/cron/smso-livrari`, orar la minutul 38, ia randurile ramase `sent` mai vechi de o ora si mai
noi de 7 zile si intreaba `/status`.

⚠ **Nu cere nicio credentiala.** Capatul lor de stare nu vrea cheie API, deci cronul nu decripteaza
nimic din `store_settings`. Tot de aceea `responseToken` nu trebuie sa ajunga niciodata in browser:
cine il are, afla numarul de telefon al cumparatorului din raspunsul lor.

⚠ **Verdictul trece prin ACEEASI regula ca raportul de pe webhook** (`stareaLivrarii`, in
`smso-urma.ts`). Scrisa de doua ori, ar fi ajuns intr-o zi sa spuna doua lucruri, iar `expired` ar fi
fost esec pe un drum si necunoscut pe celalalt. Acelasi tipar ca `netopia-aplica-statusul`.

⚠ **`dispatched` si `sent` NU sunt livrare.** Inseamna „a plecat catre retea", adica exact ce stiam
cand am scris randul.

---

## Ce s-a schimbat, pe fisiere

| Fisier | Ce |
| --- | --- |
| `migrations/2027-01-22-smso-lasa-urma-si-tine-minte-dezabonatii.sql` | `notice_sms_log.provider`, index de livrare, tabelul `sms_optout` cu RLS |
| `src/lib/smso.ts` | `status` ca cifra, `SMSO_DEZABONAT/FARA_CREDIT/CHEIE_INVALIDA`, `smsoOpresteTot`, `stareaSmsului`, 4 campuri noi la `/send` |
| `src/lib/smso-urma.ts` (nou) | `trimiteSiLasaUrma`, `numarNormalizat`, `dezabonatii`, `tineMinteDezabonarea`, `adresaWebhookSmso`, `stareaLivrarii` |
| `src/app/api/smso/webhook/route.ts` (nou) | rapoarte de livrare + raspunsuri STOP |
| `src/app/api/cron/smso-livrari/route.ts` (nou) | reconcilierea prin `/status` |
| `src/lib/actions/sms.actions.ts` | campania: lista de opriti, credit verificat inainte, oprire pe coduri fatale |
| `src/app/api/sms/test/route.ts` | si SMS-ul de test lasa urma, pe un magazin dovedit al omului |
| `src/components/dashboard/SmsoConfigClient.tsx` | adresa de raportare si lista de dezabonati, vizibile |
| 4 cai de trimitere | rewired prin `trimiteSiLasaUrma` |

---

## Cum s-a probat

`src/lib/smso-urma-si-dezabonare.test.ts`: **33 de probe**.

**Banc de mutanti: 47 din 47 prinsi.** Trei au scapat la prima trecere si au fost reparate, toate trei
pentru acelasi viciu: proba masura **prezenta** unui nume in fisier, nu **fapta**.

* `trimiteSiLasaUrma(` ramanea scris in fisier cand ramura nu se mai alegea niciodata;
* „intai verifica, apoi atribuie" trecea si cand `if`-ul disparuse cu totul;
* `.eq("delivery_status", "sent")` se potrivea pe **interogarea de citire**, nu pe garda de scriere,
  fiindca amandoua au exact aceeasi forma.

⚠ Si o proba isi pune singura secretul de semnare in mediu: incarcatorul de teste nu aduce niciun
`.env`, deci `adresaWebhookSmso` ar fi intors `null` si proba ar fi trecut verde **masurand tacerea**.

Un defect a fost gasit de proba, nu de citit codul: `numarNormalizat("0040722334455")` intorcea
`040722334455`, fiindca taia un singur zero. Acelasi om ar fi fost doua randuri in lista de
dezabonati si ar fi primit mesajul oricum.

---

## Nota

**9,5 din 10.**

Toate cele 4 capete si amandoua webhook-urile sunt folosite, urma se scrie pe toate cele 6 cai de
trimitere, dezabonarile se tin minte si se respecta, iar comerciantul vede si adresa si lista.

⚠ **Ce lipseste pentru 10**: nimic din asta n-a fost inca vazut mergand **pe productie cu trafic
real**. La Netopia si la Stripe fisele poarta masuratori de pe fluxuri adevarate; aici totul e probat
pe mutanti si pe baza falsa. Prima campanie trimisa dupa desfasurare va scrie primele randuri cu
`provider: "smso"`, si abia atunci se va putea spune ca merge, nu doar ca e scris.

De verificat atunci, in ordine:

1. apar randuri cu `provider = 'smso'` in `notice_sms_log`, cu `provider_id` completat;
2. `delivery_status` trece din `sent` in `delivered` fara ca nimeni sa configureze nimic la SMSO;
3. cronul `smso-livrari` raporteaza `intrebate > 0` macar o data.

---

## ⚠ Constatare colaterala, NEATINSA

Din cele **399 de randuri notice.ro, 393 sunt `sent` si ZERO sunt `delivered`.** Webhook-ul de
livrare al celuilalt furnizor exista in cod de mult si n-a confirmat niciodata nicio livrare.

Nu s-a investigat, fiindca e in afara acestei treceri. Poate fi la fel de banal ca o adresa
neconfigurata in contul lor. ⚠ Dar daca e asa, atunci notice.ro are **exact aceeasi gaura** pe care
SMSO tocmai a inchis-o prin `webhook_status` pe mesaj, si merita o trecere a lui.
