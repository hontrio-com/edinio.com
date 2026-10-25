# Conectorul Hontrio

Hontrio (hontrio.com) conduce campanii Google Ads pentru magazine online. Pentru un magazin Edinio,
Hontrio **citește** trei lucruri: datele magazinului, catalogul (cu ofertele exact cum pleacă la
Merchant Center) și comenzile cu sursa lor. **Nu scrie nimic în Edinio** și **nu primește date
personale ale cumpărătorilor**.

Ramura: `conector-hontrio`. Migrația: `migrations/2027-01-30-conector-hontrio.sql`.

---

## 1. Conectarea: OAuth 2.0 cu cod de autorizare și PKCE

Edinio e serverul de autorizare (RFC 6749 + RFC 7636), iar Hontrio e singurul client.

```
Hontrio                         Browserul comerciantului                    Edinio
   │  1. redirect ─────────────────────▶ GET /api/hontrio/v1/autorizare?...
   │                                       │  verifică cererea, o ține minte în cookie (10 min)
   │                                       ▼
   │                             /dashboard/features/hontrio/autorizare
   │                             (logare + codul din email, dacă e nevoie)
   │                             „Permite accesul"  ──▶  scrie un COD (10 min, o singură folosire)
   │  2. ◀──────────────── redirect_uri?code=...&state=...
   │  3. POST /api/hontrio/v1/token (server la server, cu secretul și code_verifier)
   │  ◀──────────────── { access_token: "hnt_...", magazin: {...} }
   │  4. GET /api/hontrio/v1/{magazin,produse,comenzi}  cu  Authorization: Bearer hnt_...
```

**De ce cookie.** Logarea în Edinio se termină mereu în `/dashboard`, fără adresă de întoarcere.
Cookie-ul `edinio_hontrio_cerere` trece prin logare și prin codul din email, iar `/dashboard` îl vede
și trimite omul la ecranul de aprobare (`cerereInAsteptare`). Cookie-ul se validează din nou la
fiecare citire: adresa de întoarcere din el se crede numai dacă e încă pe listă.

**O singură legătură pe magazin.** O conectare nouă (alt cont Hontrio sau același, cu jetonul
pierdut) o înlocuiește pe cea veche; jetonul vechi moare (`motiv_revocare = 'inlocuita'`).

**Revocarea** se poate face din ambele părți:
- din Edinio: Integrări → Hontrio → „Deconectează” (`motiv_revocare = 'comerciant'`);
- din Hontrio: `POST /api/hontrio/v1/revocare` cu jetonul (`motiv_revocare = 'hontrio'`).

### 1.1 Cererea de autorizare

`GET /api/hontrio/v1/autorizare`

| Parametru | Valoare |
|---|---|
| `client_id` | `hontrio` |
| `redirect_uri` | exact una din `HONTRIO_REDIRECT_URIS` |
| `response_type` | `code` |
| `state` | șirul lui Hontrio (1–512 caractere ASCII tipăribile), obligatoriu |
| `code_challenge` | `BASE64URL(SHA256(code_verifier))`, 43 de caractere |
| `code_challenge_method` | `S256` (singurul acceptat) |

- Client sau adresă de întoarcere necunoscute: **ecran de eroare la Edinio, nicio redirectare** (RFC 6749, 4.1.2.1).
- Celelalte greșeli se întorc la Hontrio: `redirect_uri?error=invalid_request|unsupported_response_type&state=...`.
- Refuzul comerciantului („Anulează”): `redirect_uri?error=access_denied&state=...`.
- Aprobarea: `redirect_uri?code=<43 de caractere>&state=...`.

### 1.2 Schimbul codului

`POST /api/hontrio/v1/token`, `Content-Type: application/x-www-form-urlencoded`

Clientul se autentifică **fie** cu `Authorization: Basic base64(hontrio:<secret>)`, **fie** cu
`client_id` + `client_secret` în corp. Nu amândouă.

| Câmp | Valoare |
|---|---|
| `grant_type` | `authorization_code` |
| `code` | codul primit |
| `redirect_uri` | aceeași adresă ca la autorizare, caracter cu caracter |
| `code_verifier` | verificatorul PKCE (43–128 de caractere) |

Răspuns `200`:

```json
{ "access_token": "hnt_…", "token_type": "Bearer", "magazin": { …MagazinHontrio… } }
```

Jetonul **nu expiră**: trăiește până la revocare. `magazin` poate fi `null` dacă citirea lui a
căzut chiar atunci (jetonul pleacă oricum; datele se citesc separat).

Erori (forma RFC: `{ "error", "error_description" }`): `invalid_request` (400),
`invalid_client` (401), `unsupported_grant_type` (400), `invalid_grant` (400: cod necunoscut,
folosit, expirat, altă adresă, alt verificator; toate arată la fel dinadins),
`temporarily_unavailable` (503).

⚠ **Codul folosit a doua oară revocă jetonul dat pe el** (RFC 6749, 10.5). Dacă Hontrio nu primește
răspunsul la schimb și reîncearcă cu același cod, legătura nou creată se stinge, iar comerciantul
trebuie să reconecteze. E intenționat.

### 1.3 Revocarea din Hontrio

`POST /api/hontrio/v1/revocare` cu `Authorization: Bearer hnt_…` → `200 { "revocat": true }`.
Răspunde `200` și pentru un jeton necunoscut sau deja revocat (RFC 7009, 2.2); `503` doar dacă baza
nu poate fi scrisă.

---

## 2. Rutele de citire

Toate cer `Authorization: Bearer hnt_…`. Răspunsurile au `Cache-Control: no-store, private`.

Erori comune (`{ "eroare": "<cod>", "mesaj": "…" }`):

| Status | `eroare` | Ce face Hontrio |
|---|---|---|
| 401 | `jeton_invalid` | legătura e moartă: cere reconectarea |
| 400 | `parametri_invalizi` | greșeală în cerere |
| 404 | `magazin_inexistent` | magazinul a fost șters |
| 429 | `prea_multe_cereri` | așteaptă `Retry-After` |
| 503 | `indisponibil` | reîncearcă (pană de bază sau legătura oprită din mediu) |

⚠ **503 nu înseamnă „deconectat”.** Doar 401 înseamnă asta.

### 2.1 `GET /api/hontrio/v1/magazin`

```json
{
  "id": "uuid", "nume": "Magazin Test", "url": "https://magazin.ro", "publicat": true,
  "moneda": "RON", "tara": "RO", "limba": "ro", "fus_orar": "Europe/Bucharest", "preturi_cu_tva": true,
  "google_merchant": { "conectat": true, "cont_id": "123", "nume_cont": "…", "tara": "RO", "limba": "ro", "eticheta_feed": "RO" },
  "google_ads": { "tag_id": "G-…", "conversie_id": "AW-…", "conversie_eticheta": "…" },
  "google_analytics": { "masurare_id": "G-…" }
}
```

- Blocurile Google sunt `null` când nu există nimic legat.
- `google_ads.conversie_id` e conversia de cumpărare trimisă **acum** din vitrină (aceeași alegere ca
  `FbPurchaseEvent`). Hontrio o folosește ca să **nu dubleze** conversia primară.
- Edinio n-are fus orar pe magazin: totul e în ora României.
- Secretele din configurări (`refresh_token`, `api_secret`) și emailurile **nu pleacă niciodată**:
  răspunsul se scrie dintr-o listă albă.

### 2.2 `GET /api/hontrio/v1/produse`

Parametri: `actualizate_dupa` (ISO 8601, opțional), `dupa` (id-ul ultimului produs primit),
`limita` (1–100, implicit 50). Ordinea e după `id`.

```json
{
  "produse": [{
    "id": "uuid", "nume": "Geacă", "activ": true, "categorie": "Geci", "pachet": false,
    "creat_la": "…", "actualizat_la": "…", "fara_oferte": null,
    "oferte": [{
      "id": "<offerId din Merchant Center>", "grup_id": "<id produs> | null", "varianta": "M | null",
      "titlu": "…", "url": "https://…?varianta=…", "imagine": "https://…",
      "pret": 100, "pret_vechi": 120, "disponibil": true, "stoc": 5,
      "sku": "…", "gtin": "…", "mpn": null, "brand": "…",
      "etichete": { "custom_label_0": "…" }, "stare_google": "active | pending | disapproved | exclus | expirat | null"
    }]
  }],
  "urmatorul": "<id> | null"
}
```

- ⚠ **Ofertele sunt cele din `expandProductOffers`**, aceeași funcție care trimite la Merchant Center:
  `id` e identic cu `offerId` și cu `segments.product_item_id` din rapoartele Google Ads.
- Produsul stins: `activ: false`, `oferte: []`.
- Produsul activ al cărui preț din catalog nu e cel plătit (personalizare cu preț):
  `oferte: []`, `fara_oferte: "pret_neconfirmat"`. Nu pleacă nici la Google.
- `stoc`: bucățile declarate; `null` = stoc neurmărit (nelimitat). La variantă, câmpul gol înseamnă
  stocul produsului. La pachet, câte pachete întregi ies din componente.
- Pagina se taie și la **~1000 de oferte**, ca răspunsul să rămână sub limita Vercel de 4,5 MB.
  Un produs nu se rupe între pagini.

### 2.3 `GET /api/hontrio/v1/comenzi`

Parametri: `actualizate_dupa`, `dupa`, `limita` (1–200, implicit 100).

```json
{
  "comenzi": [{
    "id": "uuid", "numar": "EDN-1001", "creata_la": "…", "actualizata_la": "…",
    "stare": "pending|confirmed|processing|shipped|delivered|cancelled|refunded",
    "stare_plata": "unpaid|paid|refunded", "metoda_plata": "cod",
    "canal": "magazin | emag | pepita | …", "moneda": "RON",
    "subtotal": 264.9, "transport": 15, "reducere_cupon": 10, "reducere_oferte": 0,
    "reducere_card": 0, "reducere_ramburs": 0, "taxa_ramburs": 4.99, "tva": 45.67, "total": 274.89,
    "cod_reducere": "VARA10", "tara": "RO",
    "sursa": { "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "…", "gclid": "…",
               "landing": "/…", "captured_at": "…", "consimtamant_marketing": "da" },
    "linii": [{ "produs_id": "uuid|null", "oferta_id": "…|null", "nume": "GEACA (XS)", "varianta": "XS",
                "cantitate": 1, "pret": 199.9, "extra": false }]
  }],
  "urmatorul": "<id> | null"
}
```

- **Fără date personale**: niciun nume, telefon, email, adresă (în afară de țară), firmă, notă,
  IP, agent de browser sau cookie de măsurare. `sursa` e o listă albă din `order_source`.
- `total` e și valoarea conversiei de cumpărare trimise din vitrină la Google Ads.
- `oferta_id` se rezolvă ca pe pagina de confirmare: `variant_title` sau titlul din coada numelui
  („GEACA (XS)”). Când combinația nu se mai găsește sau produsul a fost șters: `null`, iar vânzarea
  se leagă doar de `produs_id` (care e `itemGroupId`).
- Comenzile de marketplace au `canal` = marketplace-ul și pot fi în altă monedă (Pepita, HUF).

### 2.4 Cum sincronizează Hontrio (recomandat)

1. La conectare: import complet (fără `actualizate_dupa`), pagină cu pagină până `urmatorul = null`.
2. Apoi, la fiecare ~15 minute: `actualizate_dupa = începutul trecerii anterioare − 5 minute`.
   Un rând schimbat în timpul citirii poate scăpa din trecerea curentă, dar îl aduce sigur
   următoarea; suprapunerea acoperă tranzacțiile care se încheie târziu. Hontrio deduplică după `id`.
3. **O dată pe zi, import complet**: rândurile șterse (comenzi șterse, produse șterse) nu apar în
   citirea incrementală.

---

## 3. Baza

Două tabele, amândouă cu RLS **fără politici** (numai cheia de serviciu le vede):

- `hontrio_conexiuni`: amprenta SHA-256 a jetonului, cine a aprobat, `revocat_la` + `motiv_revocare`,
  `ultima_folosire` (scrisă cel mult o dată la 5 minute);
- `hontrio_coduri`: amprenta codului, `redirect_uri`, `code_challenge`, expirarea, `folosit_la`,
  `conexiune_id` (pentru revocarea la refolosire). Codurile mai vechi de o zi se șterg la fiecare cod nou.

Nici codul, nici jetonul nu stau în clar nicăieri, nici criptate.

**Aplicarea migrației**: întâi pe DEMO (`krycmubsiojipwslxrka`), apoi pe producție înaintea codului,
numai cu acordul proprietarului, urmată de `bash scripts/schema-baseline.sh`.

| Migrația | DEMO | PRODUCȚIE |
|---|---|---|
| `2027-01-30-conector-hontrio.sql` | **DA, 25.10.2026** (verificat: RLS pornit, 0 politici, indexurile) | NU |

---

## 4. Variabile de mediu

Edinio:

| Variabilă | |
|---|---|
| `HONTRIO_CLIENT_SECRET` | ≥ 32 de caractere; aceeași valoare ca `EDINIO_CLIENT_SECRET` în Hontrio |
| `HONTRIO_REDIRECT_URIS` | adresele exacte de întoarcere, despărțite prin virgulă |

Fără amândouă, legătura e oprită de tot (ecran „indisponibil”, 503 pe rute).

În producție, adresa de întoarcere e `https://app.hontrio.com/api/integrations/edinio/callback`:
platforma Hontrio stă pe `app.hontrio.com`, iar `hontrio.com` e doar site-ul de prezentare. Local:
`http://localhost:3002/api/integrations/edinio/callback`.

Hontrio, pe partea lui: `EDINIO_BASE_URL` (`https://www.edinio.com`, local `http://localhost:3003`) și
`EDINIO_CLIENT_SECRET` (aceeași valoare ca `HONTRIO_CLIENT_SECRET`).

Intrerupătorul de lansare `HONTRIO_LIVE` (în `src/lib/hontrio/config.ts`) arată cardul din
Integrări tuturor. Stins, îl văd doar magazinele conectate. Autorizarea nu depinde de el.

---

## 5. Probe

- `src/lib/hontrio/*.test.ts`: forma jetoanelor și PKCE (exemplul din RFC 7636), cererea de
  autorizare și cookie-ul, schimbul codului (o singură folosire, refolosirea care revocă, expirarea,
  adresa și verificatorul greșite, reconectarea), ofertele identice cu Merchant Center, comenzile
  fără date personale, datele magazinului fără secrete, paginarea și poarta jetonului.
- Pe DEMO, cap la cap (25.10.2026, 30 din 30): Edinio din acest worktree pe `localhost:3003`
  (3000 e Edinio principal, 3001 alt proiect, 3002 Hontrio), cu
  `HONTRIO_REDIRECT_URIS=http://localhost:3002/api/integrations/edinio/callback`. Un script care face
  pe Hontrio a parcurs autorizarea (cererile bune și cele greșite), schimbul (secret greșit, cod
  refolosit care revocă jetonul, verificator și adresă greșite), citirile și revocarea, pe magazinul
  DEMO cu cele mai multe comenzi (69 de produse, 394 de comenzi):
  - toate cele 90 de oferte trimise vreodată la Merchant Center apar la Hontrio cu același `id`;
  - nicio dată personală din comenzi (nume, email, telefon, adresă) nu apare în răspuns;
  - 595 din 627 de linii de comandă au oferta exactă, 19 sunt extraopțiuni, 11 doar produsul;
  - paginarea aduce tot, fără dubluri; rândurile probei se șterg la final.
- **Neverificat încă vizual**: ecranul de aprobare din panou. Contul de probă logat în browser n-avea
  abonament activ, deci panoul trimitea la „Reactivează”.

## 6. Ce rămâne

- **`gbraid` / `wbraid`** (clicurile Google Ads din aplicațiile iOS) nu se captează în vitrină;
  `gad_source` / `gad_campaignid` nici atât. Ar trebui adăugate în `CHEI_ATRIBUIRE` și în captare.
- **Webhook-uri semnate** către Hontrio (stoc epuizat, comandă nouă), ca reclamele să se oprească
  fără să aștepte următoarea trecere.
- Cardul din Integrări rămâne ascuns (`HONTRIO_LIVE = false`) până la lansarea Hontrio.
