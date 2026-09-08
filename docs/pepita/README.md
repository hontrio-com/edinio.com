# Documentația oficială Pepita, păstrată în repo

## De ce stă aici

Pe 08.09.2026 un audit extern a susținut că API-ul Pepita are `package_label` (eticheta PDF în
Base64), `gls_parcellocker` și `gls_xxl`, și că integrarea a ratat capabilități importante. Ca să
verificăm, a trebuit descărcată din nou documentația lor. Ea nu exista nicăieri în proiect, iar
copiile trăiau doar în directorul temporar al unei sesiuni, adică se ștergeau la prima curățenie
a `%TEMP%`.

**Niciuna dintre cele trei nu apare în documentație.** Căutarea dă zero potriviri pentru
`package_label`, `base64`, `parcellocker` și `gls_xxl`, în ambele versiuni oficiale.

Fișierele de aici sunt copia pe care se poate verifica afirmația următoare, fără să mai fie
nevoie de recuperat nimic din transcrieri.

## Ce e fiecare fișier

| Fișier | Ce e |
|---|---|
| `order-forwarding-2026-09-08.pdf` | Documentul lor despre împingerea comenzilor, versiunea engleză, așa cum a fost descărcat |
| `order-forwarding-2026-09-08.txt` | Textul extras din PDF-ul de mai sus, ca să se poată căuta cu `grep` |
| `xml-format-2026-09-08.txt` | Textul paginii lor despre formatul feedului XML (`Pepita.hu - XML ismertető`), în maghiară |

Data din nume e ziua în care au fost luate. Când se descarcă o versiune nouă, se adaugă cu data
ei, **nu se suprascrie** cea veche: diferența dintre două versiuni e chiar lucrul pe care vrem
să-l putem vedea.

## Ce spun, pe scurt, în punctele care ne-au costat

- **`delivery_mod`** are exact patru valori: `shipping`, `gls`, `gls_parcelshop`, `mpl`. Lista e
  a pieței ungare; pentru România rămâne întrebarea deschisă din `PEPITA-INTEGRARE.md`.
- **`shipping_county`**: „only for Romanian orders". De aceea județul se cere doar la comenzile
  românești, iar lipsa lui pe alte piețe nu e o abatere.
- **`sku`**: „stock-keeping unit code of the product (given by the partner)". Deci codul se
  întoarce așa cum l-am dat noi. Pe asta se sprijină potrivirea comenzii, și tot de aceea
  feedul ține minte în `pepita_articole` ce a trimis.
- **`<Variations>` este OPȚIONAL.** Aplatizarea (fiecare combinație = un `<Product>` cu `<Id>`
  propriu) e permisă de documentația lor.
- **⚠ Și, în același paragraf:** „Ha egy termék egyszer variációsként lett átadva, azon
  változtatni nem szabad" — dacă un produs a fost predat o dată ca variațional, nu are voie să
  fie schimbat. Adică trecerea de la aplatizat la `<Variations>` nu e o hotărâre care se poate
  lua de două ori. Vezi decizia scrisă în `PEPITA-INTEGRARE.md`.
- **Răspunsul așteptat de ei** are `isError`, `responseCode` și un mesaj. Nu descrie niciun
  protocol de reîncercare: „Resend order" e un buton apăsat de om în panoul lor.
