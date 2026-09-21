# Clienti: auditul sectiunii (21.09.2026)

Cerut de proprietar dupa terminarea sectiunii: optimizare, securitate, performanta.
Tot ce urmeaza e **masurat**, nu citit.

---

## ⚠⚠ CE OPREA PUSH-UL — REZOLVAT

`main` **e** productia. Codul de Clienti cheama treisprezece functii si trei tabele, iar
productia avea `customers_aggregate` cu **5 argumente**, `customers_summary` cu **1**, si nimic
altceva. Impins asa, pagina ar fi cazut pentru toate cele 131 de magazine — exact ce s-a
intamplat dimineata cu Cosurile abandonate.

**Migratiile 17-29 au intrat in productie pe 21.09.2026, cu acordul lui**, inainte de push.
Cum si cu ce dovada, in `REGISTRU.md`. Pe scurt:

- aplicate ca **stare finala** in cinci pasi, nu ca treisprezece fisiere pe rand;
- dovada e o **comparatie de amprente** (`md5(pg_get_functiondef)`) intre demo si productie:
  toate cele **14 functii identice**, cate o singura versiune, fara semnaturi vechi ramase;
- **nicio tabela cu date nu e atinsa**: toate scrierile sunt in corpul unor functii, iar
  `alter table` numai pe cele trei tabele noi, goale;
- dupa aplicare: 538 de comenzi, 1.592 de randuri, 35.156,76 lei — **neschimbate**;
- probat ca un comerciant adevarat: 269 de clienti, sumar corect, zece segmente numarate,
  cronologie cu 8 evenimente; datele altui magazin: **zero**.

## Securitate

### Izolarea intre magazine: probata, nu presupusa

Pe demo, ca un comerciant autentificat al magazinului A, cerand datele magazinului B (care avea
29 de clienti si un segment cu un membru):

| Ce am incercat ca intrus | Am primit |
|---|---|
| membrii segmentului lui B | **0** |
| segmentele lui B | **0** |
| clientii lui B (`customers_aggregate`) | **0** |
| optiunile lui de filtru | **0** |
| numaratoarea pe segmente | **0** |
| importurile lui | **0** |
| **anonimizarea** clientilor lui | **0 randuri atinse** |
| **stergerea** unui contact al lui | **0** |
| **adaugarea** unui client la el | RLS a oprit scrierea cu eroare |
| (dupa aceea) clientii MEI | 358, normal |

Si comenzile lui B au ramas neatinse. RLS e granita, si tine.

### Functiile

Toate cele 13: `security invoker`, `search_path` fixat, `anon` **nu** le poate executa,
`authenticated` da.

⚠ **Una iesea din rand si a fost reparata**: `comanda_incasata` n-avea nici `security invoker`
scris, nici `search_path`. Urmarea era mica (e `invoker` prin implicit, si o cheama numai
functii cu `search_path` gol), dar o exceptie nescrisa se inmulteste.

⚠⚠ **Si repararea ei era sa mute banii.** Prima scriere „curata" pe drum si comparatia metodei
de plata, punand `lower(coalesce(...))`. Ar fi facut ca „COD" si „Ramburs" cu majuscule sa fie
deodata socotite incasate — o schimbare de cifre strecurata intr-o migratie care spune despre
ea ca doar fixeaza `search_path`. Corpul a ramas litera cu litera acelasi. (Masurat: **zero**
comenzi au metoda scrisa cu majuscule, deci n-ar fi schimbat nimic azi — dar asta se afla
masurand, nu presupunand.)

### Tabelele

RLS pornit pe toate trei cele noi, `anon` fara SELECT. Politicile cer `auth.uid()`, deci pentru
un nelogat multimea e goala.

⚠ **A doua incuietoare, pusa la audit**: `anon` mai avea INSERT/UPDATE/DELETE la nivel de
tabela pe cele trei (implicitul Supabase). RLS le oprea oricum, dar lectia `recovery_sends` de
azi-dimineata spune ca RLS s-a mai slabit o data pe platforma asta. Revocate.

⚠ **Ramase asa, nu de mine**: `customers`, `notice_sms_log`, `return_requests` si `sms_optout`
au mai departe SELECT pentru `anon` la nivel de tabela. Verificat politica cu politica: **nu se
scurge nimic**, fiindca toate cer `auth.uid()`. E a doua incuietoare care lipseste, nu prima.
De curatat intr-o trecere de securitate a lor, nu aici.

### Cheia de serviciu

Un singur fisier o foloseste (`customer-import.actions.ts`, 5 locuri), si acolo `businessId` se
naste **pe server** din `getOwnedBusinessId(user.id)` — niciodata din browser. Toate trei
actiunile lui trec prin `requireOwner()`. Celelalte opt actiuni ale sectiunii folosesc clientul
obisnuit, deci RLS.

### Injectie in CSV

⚠⚠ Gasita in cod **deja livrat** (exportul de cosuri abandonate) si inchisa pentru amandoua
exporturile: un cumparator care isi scrie la checkout numele `=HYPERLINK("http://rau","Factura")`
se EXECUTA cand comerciantul deschide fisierul. Ghilimelele nu apara — Excel le scoate la
parsare. Vezi `lib/csv.ts`.

---

## Performanta

Masurat pe demo (393 de comenzi → 358 de clienti):

| Apel | Timp | Pagini de buffer |
|---|---|---|
| `customers_aggregate` (lista, 50 de randuri) | **28 ms** | 1.504 |
| `customer_segment_counts` (toate zece) | **71 ms** | 1.330 |
| `customer_filter_options` (meniurile) | **17 ms** | 98 |

O deschidere a paginii = trei apeluri **in paralel**. Payload catre browser: ~20 KB pentru 50
de clienti.

Cheile straine sunt toate indexate pe cele trei tabele noi.

⚠ **Creste liniar**: ~3,8 pagini de buffer pe comanda. La 100.000 de comenzi ar insemna secunde,
nu milisecunde. Dar cel mai mare magazin are 271 de comenzi, si mutarea din etapa F a facut ca
toata pagina sa citeasca printr-o singura usa (`customers_merged`) — deci etapa H s-a ieftinit:
e „se schimba corpul unei functii", nu „se muta din temelie". Vezi `CLIENTI.md`.

---

## Un defect adevarat, gasit la audit

⚠⚠ **Fila „Segmente" numara membrii aducand randurile.**

```
supabase.from("customer_segment_members").select("segment_id").limit(10000)
```

Plafoanele ingaduie 50 de segmente x 500 de oameni = **25.000 de randuri**, iar interogarea taia
la 10.000. **Tacut.** Comerciantul ar fi vazut „312 clienți" la o lista care are 500, si n-ar fi
avut de unde sa banuiasca: cifra arata a cifra. Peste asta, PostgREST are plafonul LUI, pe care
platforma l-a mai lovit o data, la 1.000.

Reparat: `customer_segment_sizes` numara in baza, un rand pe segment. Niciun plafon de trecut,
si nici randuri carate degeaba prin retea.

---

## Ce ramane deschis

- ⚠⚠ **TRUNCATE pentru `anon` pe tabelele mai vechi.** Gasit la audit pe cele trei tabele noi
  si inchis acolo (`revoke all`), dar `customers`, `orders` si celelalte il au mai departe.
  E singurul drept pe care **RLS nu-l filtreaza**: nu se uita la randuri, goleste tabela. Azi
  nu e ajuns de nicaieri (PostgREST n-are verb de TRUNCATE), deci e o incuietoare descuiata,
  nu o usa deschisa — dar cere o trecere a lor.
- `customers`, `notice_sms_log`, `return_requests`, `sms_optout`: si SELECT pentru `anon` la
  nivel de tabela (nu curge nimic azi, politicile cer `auth.uid()`).
- Etapa H (profil persistent), G2 (arhivare), G5 (actiuni rapide), F3 (segmente → campanii):
  fiecare cu motivul ei scris in `CLIENTI.md`.
