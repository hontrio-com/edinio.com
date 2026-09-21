/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE CÂTE ORI POATE FOLOSI UN OM ACELAȘI COD                    (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ „ACELAȘI OM” E O GHICITOARE, ȘI COMERCIANTUL TREBUIE SĂ ȘTIE CUM O
 * dezlegăm. Un cumpărător nu are cont: tot ce lăsăm în urmă e un telefon și,
 * uneori, un email. Deci „același om” înseamnă, în ordinea asta:
 *
 *   1. **telefonul**, curățat de spații, de prefixul de țară și de zerourile din
 *      față — `0722 334 455`, `+40722334455` și `0040722334455` sunt unul și
 *      același om;
 *   2. dacă n-a lăsat telefon, **emailul**, scris cu litere mici;
 *   3. dacă n-a lăsat niciunul, nu se poate ști — și atunci codul cu limită
 *      **se refuză**, fiindcă altfel s-ar lua de oricâte ori dintr-un singur
 *      browser.
 *
 * ⚠ Regula stă în SQL (`discount_customer_key`), nu aici: în TypeScript există
 * două funcții `normalizePhone` care dau răspunsuri deosebite, iar cheia trebuie
 * să fie aceeași cu cea de la pagina Clienți. Fișierul ăsta ține doar ce se
 * arată pe ecran și ce se verifică în formular.
 */

/** Ce poate scrie comerciantul în câmp. `null` = fără limită. */
export function limitaValida(v: unknown): { limita: number | null } | { error: string } {
  if (v === null || v === undefined || v === "") return { limita: null };

  const n = Number(v);
  if (!Number.isFinite(n)) return { error: "Numărul de utilizări per client nu e un număr." };
  if (!Number.isInteger(n)) return { error: "Numărul de utilizări per client trebuie să fie întreg." };
  if (n < 1) return { error: "Un client trebuie să poată folosi codul măcar o dată. Lasă gol pentru „fără limită”." };

  return { limita: n };
}

/**
 * Ce scrie sub câmp, ca să nu fie nevoie să deschidă nimeni documentația.
 *
 * ⚠ SE SPUNE ȘI CE SE ÎNTÂMPLĂ LA ANULARE. E prima întrebare pe care o pune
 * orice comerciant care înțelege ce citește, și răspunsul nu e evident: o
 * comandă anulată îi dă omului dreptul înapoi, la fel cum îl dă campaniei.
 */
export function despreLimita(limita: number | null): string {
  if (limita === null) {
    return "Oricine îl poate folosi de câte ori vrea. Pune un număr dacă vrei ca fiecare client să-l poată folosi doar de un număr de ori.";
  }
  const deCateOri = limita === 1 ? "o singură dată" : `de ${limita} ori`;
  return `Fiecare client îl poate folosi ${deCateOri}. „Același client” înseamnă același telefon `
    + "(sau același email, dacă n-a lăsat telefon). Dacă o comandă se anulează, utilizarea i se dă înapoi.";
}

/**
 * ⚠⚠ O LIMITĂ PUSĂ PE UN COD DEJA FOLOSIT NUMĂRĂ DOAR DE ACUM ÎNCOLO.
 *
 * Socoteala pe om stă într-un registru propriu (`discount_customer_uses`), iar
 * el s-a născut azi: comenzile de până acum nu au rânduri în el. Deci un client
 * care a folosit codul de trei ori săptămâna trecută îl mai poate folosi o dată.
 *
 * Și e alegerea bună, nu o scăpare. Umplut din comenzile vechi, un comerciant
 * care pune limita pe o campanie veche ar fi blocat dintr-odată toți clienții
 * care o folosiseră deja — fără să fi cerut asta, și fără ca ei să poată afla
 * de ce. „De acum încolo” e ce înțelege oricine când bifează o limită.
 *
 * Se scrie pe ecran, fiindcă altfel comerciantul ar crede că a închis o poartă
 * pe care abia o deschide.
 */
export const LIMITA_NUMARA_DE_ACUM =
  "Se numără doar folosirile de acum încolo. Comenzile de până acum nu se iau în seamă, "
  + "deci un client care a folosit deja codul îl mai poate folosi.";

/**
 * ⚠⚠ CE NU POATE FACE REGULA ASTA, spus comerciantului pe față.
 *
 * Cumpărătorul își scrie singur telefonul. Cine vrea neapărat să ia codul de
 * două ori poate lăsa alt număr — iar noi n-avem cum să știm. Limita oprește
 * folosirea din nebăgare de seamă și pe cea comodă, nu pe cineva hotărât.
 *
 * Se scrie pe ecran fiindcă altfel comerciantul crede că a cumpărat o garanție,
 * și află abia din raport că n-a fost una.
 */
export const CE_NU_OPRESTE_LIMITA =
  "Cumpărătorul își scrie singur telefonul, deci cineva hotărât poate lăsa alt număr. "
  + "Limita oprește folosirea repetată din obișnuință, nu pe cineva care vrea neapărat să treacă de ea.";

/**
 * De ce nu i se spune cumpărătorului, la apăsarea pe „Aplică”, că și-a folosit
 * deja codul.
 *
 * ⚠⚠ NU E O SCĂPARE, E O HOTĂRÂRE. `validateDiscount` e un capăt public: oricine
 * îl poate chema cu un cod anunțat pe pagina magazinului și cu telefoane pe
 * rând. Dacă răspunsul ar ține seama de cine e omul, atunci „valid” ar însemna
 * „numărul ăsta n-a cumpărat niciodată de aici”, iar „nu e valid” ar însemna
 * „a cumpărat”. Oracolul nu e în TEXT, e în bitul valid/nevalid — mesajul unic
 * nu-l poate închide.
 *
 * Pe o farmacie, pe un magazin veterinar sau pe unul de produse intime, asta
 * înseamnă: „numărul 07xx a cumpărat de acolo”.
 *
 * De-aia limita se judecă abia la apăsarea pe „Trimite comanda”, unde omul a
 * scris deja o adresă întreagă. Iar atunci cuponul se scoate singur din coș, ca
 * să poată trimite comanda mai departe — vezi `checkout-core.ts`.
 */
export const DE_CE_SE_AFLA_ABIA_LA_TRIMITERE =
  "Verificarea se face la trimiterea comenzii, nu la aplicarea codului: altfel oricine ar putea afla, "
  + "cerând codul cu telefoane pe rând, care numere au cumpărat din magazinul tău.";
