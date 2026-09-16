# Pall-Ex: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al zecelea, dupa `WOOT.md`, `DPD.md`,
> `SAMEDAY.md`, `CARGUS.md`, `COLETE-ONLINE.md`, `ECOLET.md`, `PACKETA.md`, `SMARTSHIP.md` si
> `GLS.md`.

**Ce sunt ei:** al saptelea curier si **singura retea de PALETI** din platforma. Nu e un curier de
colete cu o optiune de marfa grea: e alt fel de transport, cu alt flux si cu alte campuri.

**API-ul real:** `https://clientplus.pallex.ro/api/v1`, autentificare HTTP Basic. Nu exista mediu de
test (doar un mock pe SwaggerHub) si nu exista v2.

**Referinta autoritara:** `https://clientplus.pallex.ro/api/v1.yaml`, OpenAPI 3.0.2, **versiunea
1.0.5**, 718 randuri, adusa si citita integral pe 16.09.2026. ⚠ Titlul spune „[DEPRECATED]" si
trimite inapoi la aceeasi adresa: ce s-a inchis e copia de pe SwaggerHub, nu API-ul. **Versiunea e
aceeasi cu cea de la scrierea integrarii**, deci nu exista deriva de specificatie.

**Cod:** `src/lib/pallex/` (`client.ts`, `expediere.ts`, `statusuri.ts`, `documente.ts`,
`sfatul-pentru-marfa-oprita.ts`), `src/lib/actions/pallex.actions.ts`,
`src/app/api/pallex/document/route.ts`, cronul `src/app/api/cron/pallex-tracking`, ferestrele
`PallexAwbModal.tsx` si `PallexConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu Pall-Ex configurat | **ZERO** (din 129) |
| Partide emise vreodata (`pallex_awb_number`) | **ZERO** |
| Partide cu ID ClientPlus (`pallex_consignment_id`) | **ZERO** |
| Comenzi in baza, total | 468 |

⚠ **Zero curat**, ca la SmartShip, Packeta si eColet. Nimeni n-a deschis vreodata pagina de
configurare, deci nu exista niciun semnal de productie. Singura masura ramane conformitatea cu
specificatia si compatibilitatea cu platforma.

---

## Ce face Pall-Ex altfel decat toti ceilalti

Trei lucruri, si toate trei sunt deja tratate in cod:

1. ⚠ **NU exista ramburs.** Nici pe partida, nici pe palet: 32 de campuri si treisprezece servicii
   optionale, si niciunul nu e incasare. De aici bifa de confirmare in formular, refuzul in lot, si
   scoaterea rambursului din metodele de plata cand curierul ales e Pall-Ex.
2. ⚠ **Marfa NU pleaca la emitere.** Partida intra intr-un BORDEROU, iar borderoul trebuie validat
   (`POST /bordereaux/{id}/validated`). Validarea e ireversibila SI acopera si partidele altor
   comenzi din acelasi borderou, de aceea `valideaza_automat` e implicit OPRIT si butonul spune
   intai cate partide porneste.
3. ⚠ **Statusurile NU sunt publicate.** `/consignment_status_types` intoarce perechi `{id, name}`
   proprii instalarii; specificatia da un singur exemplu („In hub"). Numerele n-au inteles fix, deci
   clasificarea se face dupa NUME, iar pagina de configurare cere lista reala si arata ce facem cu
   fiecare.

---

## 1. ⚠⚠ Avertismentul care trimitea omul sa valideze ce validase deja

Fiindca marfa nu pleaca singura, cronul are un avertisment pe care niciun alt curier nu-l are: „a
trecut o zi si partida tot nu e in retea". Fara el, comerciantul afla de la client, dupa o
saptamana, ca marfa e tot in depozitul lui.

Mesajul spunea **intotdeauna** acelasi lucru: „cel mai des inseamna ca borderoul nu a fost validat,
deschide comanda si valideaza-l". Dar fluxul lor are TREI stari, scrise chiar in clasa `Bordereau`:

```
0  nevalidat                  marfa sta, si comerciantul chiar o poate porni
1  validat de CLIENT          si-a facut partea; asteapta transportatorul
2  validat de TRANSPORTATOR   ar trebui sa fie pe drum
```

Deci comerciantul care si-a validat borderoul acum doua zile si asteapta masina era trimis sa apese
un buton stins. Merge in ClientPlus, nu gaseste nimic de facut, si a doua oara nu mai crede
avertismentul.

⚠ **Si nu e o teama inventata: chiar cronul avea scris in el de ce conteaza.** Cand lista de
statusuri a magazinului nu se putea citi, toate partidele primeau „valideaza borderoul", iar
comentariul de acolo numeste exact urmarea de mai sus. Paza fusese pusa pentru o singura cauza a
mesajului fals; cealalta, mai deasa, ramasese deschisa.

**Leacul:** `sfatPentruMarfaOprita()`, pur si probat, plus o citire a borderoului chiar inainte de
avertisment. ⚠ **O singura citire in plus**, si numai pentru partida care CHIAR primeste
avertismentul: semnul din memoria cronului il da o singura data, deci nu se repeta la fiecare
rulare. E o citire pura, deci o cadere nu strica nimic.

⚠ **Iar cand nu stim, nu ghicim.** Citirea picata, comanda fara borderou, sau o stare pe care ei ar
adauga-o maine: toate cad pe un mesaj care cere sa se UITE, nu pe un indemn inventat. Un indemn
gresit costa mai mult decat unul care nu spune nimic, fiindca il invata pe om sa nu se mai uite la
avertismente.

---

## 2. ⚠ Cele doua adrese treceau prin reguli diferite

`consignee_locality` se plia prin ajutorul comun al platformei („Sector 3" devine „Bucuresti"), iar
`consignor_locality` nu. Asimetria n-avea niciun motiv scris, si conteaza: comerciantul isi scrie
orasul **de mana** in setari, deci un depozit bucurestean putea pleca cu localitatea „Sector 3", pe
care reteaua lor de hub-uri n-o cunoaste ca oras.

In afara Bucurestiului ajutorul nu schimba decat diacriticele, la fel ca pe partea destinatarului.

---

## Ce am verificat rand cu rand fata de specificatie, si era deja bine

| ce cere specificatia | ce e in cod |
| --- | --- |
| `POST /consignments` intoarce in exemplu un **TABLOU**, nu un obiect | `primul<T>()` accepta si tabloul, si obiectul. Acelasi ajutor la `GET /consignments/{id}` si `/bordereaux/{id}`, unde schema e tot `type: array` |
| 422 raspunde `{status, meta:[...]}`, cu numele campurilor | `meta` se traduce in nume de campuri romanesti si ajunge la comerciant |
| 19 campuri obligatorii pe `Consignment` | toate trimise; `lipsuriAdresa` opreste local inainte de apel |
| `pallet_weight` e `integer` | `Math.ceil`, rotunjit in SUS, ca declaratia sa nu fie mai mica decat marfa |
| `Pallet` cere toate patru dimensiunile | paletii pe bucata se trimit doar completi, altfel deloc |
| `has_insurance` + `insurance` | asigurarea pleaca doar cu valoare strict pozitiva: `has_insurance` cu zero ar insemna „asigura pentru zero lei", cu comisionul de rigoare |
| 13 servicii optionale | toate treisprezece acoperite |
| `DELETE /consignments/{id}` merge doar inainte de validare | tratat, cu statusul pastrat PE eroare (nu cautat in textul ei) |
| judetul e cod ISO auto („SB", „B") | `codAutoAlJudetului` |
| cod postal OBLIGATORIU la ambele adrese | verificat local |

---

## Ce ramane deschis, si de ce

1. **Nedovedit live (D-5).** Zero magazine, zero partide. Cel mai probabil sa cada la prima partida
   reala: lungimile campurilor (nedeclarate in specificatie, deci nu taiem nimic si lasam 422 sa se
   vada), formatul orelor, si vocabularul de statusuri al instalarii lor.
2. **Datele de acces.** Pall-Ex recomanda in chiar specificatie un utilizator separat pentru
   integrari, cerut la `it@pallex.ro`.
3. **Ridicarea programata si anularea in lot nu exista in API.** Nu e o lipsa a integrarii.
4. ⚠ **`insurance` e `type: number` cu `format: int32`**, adica specificatia se contrazice singura.
   Trimitem cu doi zecimali (forma `number`). Daca la prima partida reala cade, raspunsul e
   rotunjirea la intreg.

---

## Nota, cinstit

**9,5/10.**

Integrarea era scrisa bine de la inceput, si se vede in locurile unde conteaza: raspunsul care poate
fi tablou sau obiect e citit prin acelasi ajutor peste tot, un 201 fara ID iese `necunoscut` (nu
esec, ca sa nu se creeze a doua partida), `bordereau_id` lipsa nu invalideaza crearea, iar
clasificatorul de statusuri poarta in el, scrise, doua runde de audit pe potrivirea de radacini.

Ce s-a inchis azi sunt doua lucruri care nu se vedeau din cod fara specificatia alaturi:

1. avertismentul cel mai important al integrarii afirma o cauza pe care n-o verificase, si trimitea
   omul sa apese un buton stins;
2. cele doua adrese ale aceleiasi partide treceau prin reguli diferite de localitate.

⚠ **Ce lipseste, si de ce nu e 10:** nimic din integrare n-a atins vreodata API-ul lor. Aici asta
cantareste mai mult decat la un curier de colete, fiindca doua dintre cele trei particularitati
(vocabularul de statusuri si comportarea borderoului) se pot verifica DOAR pe un cont adevarat.

**Probe:** 9 noi. Banc de mutanti **10 din 10**, cu mutantul pe APELANT la amandoua reparatiile
(cronul pentru sfat, constructorul de partida pentru localitate). `tsc` curat, **8.203 de probe
verzi**, build OK, fara migratie.
