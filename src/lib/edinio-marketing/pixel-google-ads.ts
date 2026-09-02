/*
  ═══════════════════════════════════════════════════════════════════════════════
  GOOGLE ADS — ID-UL SI ETICHETELE DE CONVERSIE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ NU E UN SECRET, ca si ceilalti doi pixeli: id-ul si etichetele se vad in
  pagina la orice vizitator. Sunt scrise in cod din acelasi motiv — o variabila
  uitata ar stinge masuratoarea in productie fara ca nimic sa strige.

  ═══ ⚠ CE E O „ETICHETA", SI DE CE NU SE POATE GHICI ═══

  Google Ads nu numara evenimente dupa nume, cum fac GA4, Meta si TikTok. Fiecare
  ACTIUNE DE CONVERSIE creata in contul lor primeste un sir propriu, iar noi
  trimitem `send_to: 'AW-XXXX/eticheta'`. Nu exista nume standard si nu exista
  nimic de dedus: eticheta se ia din interfata lor, la crearea actiunii.

  ⚠ DECI O ETICHETA LIPSA NU E O EROARE, e o conversie pe care n-am fost rugati
  s-o numaram. Adaptorul o sare tacut — vezi `adaptor-google-ads.ts`.
*/

const ID_IMPLICIT = "AW-18425945129";

export const ID_GOOGLE_ADS: string =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || ID_IMPLICIT;

/**
 * Etichetele, pe evenimentul nostru.
 *
 * ⚠ CHEILE SUNT NUMELE DIN TAXONOMIA NOASTRA, nu numele actiunilor din Google.
 * Asa, cand cineva citeste `adaptor-google-ads.ts`, vede aceleasi cuvinte ca in
 * `evenimente.ts` si nu trebuie sa tina minte doua vocabulare.
 *
 * ⚠ SE ADAUGA PE MASURA CE SE CREEAZA ACTIUNILE in contul Google Ads. Ce nu e
 * aici nu se trimite — si asta e o alegere, nu o scapare: o conversie trimisa
 * catre o eticheta inventata nu cade cu eroare, se pierde tacut.
 */
export const ETICHETE_CONVERSIE: Readonly<Record<string, string>> = {
  sign_up: "kQNJCM-Z8OwcEKm4ltJE",
  trial_start: "LgD4CNzA_OwcEKm4ltJE",
  /*
    ⚠ SINGURA CU VALOARE ADEVARATA. Actiunea ei e creata in Google Ads cu „valori
    deosebite pentru fiecare conversie", prin Event snippet — deci suma o trimitem
    NOI, cat s-a incasat cu adevarat la Stripe (cu reduceri si proratii), nu un
    pret citit dintr-un tabel.

    ⚠ Celelalte doua sunt create cu „Don't use a value", dinadins: o inscriere nu
    aduce bani, aduce un om. O suma inventata acolo ar fi aparut ca venit in
    rapoarte, si ROAS-ul s-ar fi cladit pe ea.
  */
  purchase: "gaJaCO_i-uwcEKm4ltJE",
};

/** Adresa completa pentru o conversie, sau `null` daca n-avem eticheta ei. */
export function trimiteCatre(numeEveniment: string): string | null {
  const eticheta = ETICHETE_CONVERSIE[numeEveniment];
  return eticheta ? `${ID_GOOGLE_ADS}/${eticheta}` : null;
}
