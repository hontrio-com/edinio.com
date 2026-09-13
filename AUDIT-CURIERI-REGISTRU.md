# Registru de verificare: sistemul de livrare si cele 17 integrari de curierat

**IN LUCRU.** Deschis pe 13.09.2026. Aduna cele doua audituri externe (Astra 09.09, Codex
13.09) si verificarea mea proprie pe codul de azi.

## Cum se citeste

Un audit facut de alt model nu e adevar, e o **ipoteza de verificat**. Fiecare rand de mai
jos are un verdict pronuntat pe codul si pe datele de ACUM, nu pe snapshotul din care a fost
scris raportul.

| verdict | ce inseamna |
|---|---|
| CONFIRMAT | reprodus pe codul curent, cu ancora in sursa |
| CONFIRMAT, CU CORECTIE | defectul exista, dar descrierea din audit e imprecisa |
| LARGIT | clasa e mai intinsa decat spune auditul; fisierele in plus sunt numite |
| COBORAT | corect arhitectural, dar fara suprafata exploatabila azi, masurat in baza |
| INFIRMAT | nu se reproduce pe codul curent |

⚠ **Nicio constatare nu se inchide pe baza unui comentariu din cod, a lui `tsc` sau a unei
probe care doar cauta siruri.** Fiecare reparatie are proba care apara REGULA si mutanti pusi
pe APELANT, aratati ca pica proba si ca se pun la loc.

## Ce a schimbat masuratoarea

Ambele audituri distribuie riscul peste 17 integrari. Productia spune altceva:

| curier | AWB-uri emise vreodata |
|---|---|
| **Woot** | **211** (un magazin, `suporti-numar`, 186 cu ramburs, 7 in 24h) |
| DPD | 5 |
| ceilalti 15 | **0** |

Alte masuratori care schimba gravitatea unor constatari:

- **0 din 129** de magazine au reguli sau clase de transport.
- **0 din 129** au `default_shipping_cost` NULL sau zero.
- **218 din 435** de comenzi poarta un AWB.
- **0** AWB-uri GLS, Pall-Ex sau eColet.

## Constatari verificate

### Inchise, cu proba si mutanti

| ID (Astra / Codex) | verdict | ce era | commit |
|---|---|---|---|
| WO-P1-01 | CONFIRMAT | `cancelWootAwb` primea identificatorul expedierii de la browser si il trimitea neatins la `DELETE /orders/{id}` | `4c97f325` |
| WO-P1-02 | CONFIRMAT | `cancelWootOrder` nu arunca la `{success:false}`, iar actiunea ii arunca rezultatul; comanda se golea si omul citea „AWB anulat" | `4c97f325` |
| WO-P1-03 | CONFIRMAT | `createOrder` promitea `order_id: number` fara nicio validare; lipsa lui devenea sirul „undefined" | `4c97f325` |
| PLAT-P1-02 / SYS-P1-07 (partial) | CONFIRMAT | anularea nu era compare-and-set pe AWB; inchis pentru Woot, FAN il avea deja (2 din 17) | `4c97f325` |
| CARGUS-01, DPD-01 | **LARGIT** | `.buffer as ArrayBuffer` trimitea blocul din spate. Auditurile numesc 2 rute; erau **4**: plus **Sameday** si **FAN Courier** | `a3558c42` |
| (niciun ID) | **NOU** | cinci rute serveau eticheta fara `Cache-Control: private, no-store`, desi poarta datele cumparatorului | `a3558c42` |
| UPS-P1-01 / SYS-P1-11 | CONFIRMAT | `BUGET_MS` iesea exact 0, deci cronul sarea fiecare colet si raporta `ok: true` | `9003b35a` |
| PALLEX-08 | **LARGIT** | eticheta se depozita in R2 cu implicitul `public, max-age=31536000`. Astra numeste doar Pall-Ex; **eColet** facea la fel si nu e numit de nimeni | `56796201` |

### Confirmate, inca deschise

| ID | verdict | nota |
|---|---|---|
| SYS-P1-05 | CONFIRMAT, CU INSTANTA MASURATA | plafonul de 25s semneaza optiuni la tariful zonei pentru curierii care n-au raspuns. ⚠ **E codul meu, scris pe 13.09**, dar tiparul exista dinainte in **27 de situri**: fiecare dintre cei noua curieri are propriul `flat()`, chemat pe trei drumuri. Eu am adaugat al patrulea declansator. ⚠ **Raul concret, masurat:** `okxi` (VetDepo, 142 comenzi, activa azi) are zona Sameday pe tarif VIU cu `price: 0`, deci pleca semnat un „Sameday, 0,00 lei" pe care `verificaCotatia` il gasea valid. Celelalte doua magazine cad pe tarife reale (17, 18, 20), adica pe degradarea aleasa de comerciant |
| SYS-P1-01 | CONFIRMAT | tokenul de cotare nu leaga serviciul, contractul/BYOC, punctul sau reteaua. Recunoscut si in comentariile fisierului |
| SYS-P1-03 | CONFIRMAT | rambursul e semnat ca BOOLEAN, nu ca suma; `quote-token.ts:118-131` o spune pe fata |
| SYS-P1-02 | CONFIRMAT, CU CORECTIE | fail-open-ul real e la `order.actions.ts:282` (tarif implicit NULL), nu peste tot. `esteGratuit` se decide server-side |
| SYS-P1-06 | CONFIRMAT | cheia registrului include furnizorul, deci doi curieri pot rezerva aceeasi comanda |
| SYS-P1-09 / PLAT-P1-04 | CONFIRMAT | `deleteOrder` citeste o singura coloana de AWB din 17 si curata din R2 doar cheile GLS |
| PLAT-P2-12 (a doua jumatate) | CONFIRMAT | „n-am putut afla" arata ca „niciun refuz", pe TREI drumuri: citirea cazuta din baza (`registru.ts:601-604`), lipsa dreptului pe magazin (`operatii.actions.ts:51`) si `.catch(() => {})` din interfata (`OperatiiAtarnate.tsx:71`). Aceeasi clasa cu [[zero-randuri-nu-e-succes]], traind in produs |

### Coborate de masuratoare

| ID | de ce |
|---|---|
| SYS-P1-04 | regulile de transport nu sunt legate de cotatie, dar **0 din 129** de magazine au vreo regula sau clasa |
| SYS-P1-02 (ramura NULL) | **0 din 129** au `default_shipping_cost` NULL sau zero |
| PLAT-P2-12 (prima jumatate) | gruparea doar dupa `fel` ar ascunde refuzul unui curier cand altul a reusit. Masurat: 172 de operatii AWB, 164 reusite, 8 esuate, si **ZERO** comenzi cu refuz ascuns de ALT furnizor. Cele 6 potriviri gasite sunt pe ACELASI furnizor, adica exact cazul tratat dinadins: reusita stinge alarma dupa ce problema s-a reparat |

### Infirmate pe codul curent

| ce | de ce |
|---|---|
| SSRF la Woot | `WOOT_BASE` e hardcodat (`woot.ts:6`) |
| „Woot n-are termene" (jumatate din WO-P2-07) | `ASTEPTARE_MS = 20_000` pe fiecare cerere |
| nota din ruta FAN: „Posta si Packeta pun deja `no-store`" | Posta **nu are eticheta deloc**; Packeta o trimite printr-o actiune, ca base64 in browser. Corectat in `33c955e1` |

## ⚠ Corectii la propriile mele afirmatii

Se scriu aici, nu se sterg, fiindca o masuratoare gresita folosita ca argument e mai
periculoasa decat lipsa ei.

1. **„Magazinul `okxi` a fost sters pe 11.09, de aceea niciun magazin nu mai are tarif zero."
   FALS.** `okxi` exista: business `635bc524`, **142 de comenzi, ultima chiar azi**, livrare
   pornita. E acelasi business cu VetDepo (confirmat si de `oblio-gestiune.test.ts:16`). Ce
   s-a sters pe 11.09 a fost magazinul `okxishop` si legatura Trendyol, nu acesta. Am folosit
   deductia asta ca sa explic o masuratoare; explicatia era inventata.

2. **„Doar trei perechi magazin-curier coteaza live." SUBNUMARAT.** Prima interogare a numarat
   doar `auto_price = 'true'`, dar codul spune `zone.auto_price !== false`, cu implicitul
   **true** (`shipping.actions.ts:750`). Cu semantica reala sunt **zece** perechi activate cu
   tarif viu, dintre care **cinci** cheama efectiv un API de tarif (celelalte sunt `own`,
   `pickup` si `gls`, aflate in `FARA_API_DE_TARIF`). Cele cinci stau pe trei magazine:
   `okxi`, `tonel-beauty`, `yulmis-sound`.

## Constatari noi, pe care nu le are niciun audit

| ce | dovada |
|---|---|
| `shipping_zones` tine DOUA forme JSON: obiect la 19 magazine, **array gol la 110** | `jsonb_typeof` peste `store_settings`. Nu e rupt azi (un array gol da zero curieri), dar e simptomul validarii slabe pe care ambele audituri o semnaleaza la salvare |
| comentariu ramas in urma la `order.actions.ts:294-297` | sustine ca `okxi` are `default_shipping_cost` 0,00; azi e **18,00**. Pretul zonei Sameday chiar e 0, deci jumatate din afirmatie e inca adevarata |
| eColet depoziteaza eticheta cu antet public | reparat in `56796201`; Astra semnaleaza cazul doar la Pall-Ex |
| Sameday si FAN trimiteau blocul din spate al PDF-ului | reparat in `a3558c42`; auditurile numesc doar Cargus si DPD |

## Hotarari care nu-mi apartin

1. **Oprirea stergerii unei comenzi cu expediere activa.** Ar atinge **218 din 435** de
   comenzi. E o hotarare de produs, nu o reparatie de defect.
2. **`SHIPPING_QUOTE_SECRET` lipseste din `.env.local`**, deci cotatiile se semneaza cu cheia
   de service role. Nu e secret gol, dar o rotire a cheii Supabase invalideaza instantaneu
   toate cotatiile in circulatie.
3. **Dezlegarea unui AWB Woot refuzat la anulare.** Azi nu se dezleaga nimic la refuz dovedit,
   dinadins: `woot_order_id` e singura cheie de anulare si de eticheta.

## Ce nu s-a putut verifica

Niciun apel cu acreditari reale catre cei 17 furnizori, nicio expediere creata sau anulata in
sandbox, niciun test cu cititor de ecran. Constatarile marcate ca inchise sunt dovedite pe
cod, pe date de productie si pe probe; nu pe raspunsurile vii ale curierilor.
