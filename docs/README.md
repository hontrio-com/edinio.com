# Documentatia proiectului: unde sta fiecare lucru

Tot ce e scris despre Edinio, in afara codului, sta aici, pe domenii. Radacina depozitului tine doar ce
trebuie sa stea acolo (configurari, `README.md`, `AGENTS.md`, `CLAUDE.md`).

Ordonat pe 18.09.2026: documentele care stateau in radacina s-au mutat in folderele de mai jos, cu istoria
Git pastrata (`git mv`).

---

## Integrari (evidenta fiecarei treceri de audit: ce spune documentatia lor, ce s-a masurat, ce s-a reparat)

| Folder | Ce contine |
| --- | --- |
| `curieri/` | Cei 17 curieri, cate un fisier: CARGUS, COLETE-ONLINE, DHL, DPD, ECOLET, FAN, FEDEX, GLS, INNOSHIP, PACKETA, PALLEX, POSTA, SAMEDAY, SHIPO, SMARTSHIP, UPS, WOOT |
| `facturare/` | SmartBill, Oblio, fGO |
| `plati/` | Netopia, Stripe, Revolut, Klarna, iPay |
| `marketing/` | Integrarile de marketing ale COMERCIANTILOR: Facebook (Meta Pixel, CAPI, catalog), TikTok, Google Ads, Google Analytics, Google Merchant, email marketing (Mailchimp, Brevo, Klaviyo), SMS (notice.ro, SMSO) |
| `pepita/` | Integrarea Pepita (`PEPITA-INTEGRARE.md`) si documentatia lor oficiala pastrata local (PDF + text). `README.md` spune care versiune e cea buna |

## Marketingul platformei

| Fisier | Ce contine |
| --- | --- |
| `edinio-marketing/EDINIO_MARKETING_ANALYTICS_SETUP.md` | GA4 si reclamele ale lui Edinio insusi (nu ale magazinelor): evenimentele si conversiile de bifat in GA4. ⚠ Il citeste o proba (`src/lib/edinio-marketing/document-configurare.test.ts`): numarul de evenimente din el trebuie sa se potriveasca cu codul |

## Audituri mai vechi (rapoarte intregi)

| Fisier | Ce contine |
| --- | --- |
| `audituri/AUDIT-CURIERI-REGISTRU.md` | Registrul auditului de curieri. ⚠ A ramas in urma valului 3: citeste intai memoria `audit-curieri-2026-09-14` |
| `audituri/AUDIT-CURIERI-RASPUNS-2026-09-15.md` | Raspunsul la re-auditul curierilor (sectiunea 6 e pomenita din `curieri/WOOT.md`) |
| `audituri/AUDIT-DOMENII-2026-08-10.md` | Domeniile proprii pe Vercel: 27 de constatari |
| `audituri/PIXELS_TRACKING_AUDIT.md` | Pixelii si urmarirea, auditul din 07.2026 (Faza 0 + 1) |
| `audituri/PRODUCTION_AUDIT_REPORT.md` | Raportul de productie initial |

## Centrul de ajutor

| Fisier | Ce contine |
| --- | --- |
| `ajutor/CAPTURI-AJUTOR.md` | Cum se fac si se leaga capturile de ecran ale ghidurilor |
| `ajutor/CAPTURI-AJUTOR.csv`, `ajutor/CAPTURI-AJUTOR-LISTA.md` | Lista de lucru a capturilor inca lipsa. Le rescrie `npm run capturi -- --lista` (`scripts/leaga-capturi.mjs`) |

## Securitate

| Fisier | Ce contine |
| --- | --- |
| `securitate/security-hardening-2026-06-22.sql` | Scriptul de intarire din iunie 2026, aplicat atunci de mana. ⚠ Un comentariu din el („store_settings KEPT anon SELECT”) e INVECHIT. Istoric, nu migratie |

---

## In alta parte

* `../migrations/`: schema bazei. **`migrations/CITESTE-INTAI.md`** explica cum se aplica si cum se reface
  baza; `000-schema-baseline.sql` e schema intreaga, regenerata din productie.
* `../scripts/`: uneltele (poarta de lint, baseline-ul schemei, tipurile bazei, capturile).
* **In afara depozitului**, in `C:\Users\iorda\Desktop\EDINIOV2\arhiva\`: rapoartele de audit cu detalii de
  securitate si datele brute ale unor magazine, care NU au ce cauta in Git. Indexul lor:
  `arhiva/CITESTE-INTAI.md`.
