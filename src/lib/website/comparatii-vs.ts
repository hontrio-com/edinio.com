/**
 * Tabelele de comparație de pe paginile „Edinio vs …".
 *
 * ═══ TEXTELE SUNT ALE CLIENTULUI, EXTRASE MECANIC ═══
 *
 * ⚠ Toate cele 65 de rânduri vin dintr-un PDF trimis de el (14.08) și au fost
 * SCOASE CU UN PROGRAM din fișier, nu transcrise de mână. Aceeași măsură ca la
 * textele juridice, și din același motiv: la o transcriere de mână, un cuvânt
 * schimbat într-un tabel comparativ nu se vede la citit, dar schimbă o afirmație
 * despre o firmă străină.
 *
 * Nu se rescriu, nu se scurtează, nu se reordonează.
 *
 * ═══ E PUBLICITATE COMPARATIVĂ ═══
 *
 * Un tabel care ne pune lângă concurenți NUMIȚI intră sub reguli: fiecare
 * afirmație trebuie să fie verificabilă și să compare ACEEAȘI caracteristică la
 * amândouă platformele. De aceea rândurile nu spun cine e mai bun, ci ce include
 * fiecare — iar acolo unde răspunsul nu e „da" sau „nu", valoarea e descriptivă
 * („În dezvoltare", „Mai controlate", „Limitată de platformă").
 *
 * ⚠ ȘI DE ACEEA RÂNDURILE ÎN CARE NOI STĂM MAI PROST AU RĂMAS ÎN TABEL: controlul
 * asupra codului sursă, ecosistemul de extensii, customizarea foarte avansată. Un
 * tabel din care lipsesc n-ar mai fi o comparație, ar fi o reclamă — și ar cădea
 * la prima verificare. Sunt în PDF-ul clientului; nu se scot.
 *
 * ⚠ OpenCart și Magento sunt comparate cu ediția OPEN SOURCE, spus limpede în
 * rândul de deschidere al fiecăruia. Fără precizarea aia, aceleași rânduri ar fi
 * fost neadevărate despre edițiile lor comerciale.
 *
 * ⚠ NOTA DIN PDF — „pentru publicare, este recomandată reverificarea periodică a
 * disponibilității funcțiilor" — e o instrucțiune pentru noi, nu text de pagină.
 * Pe pagină rămâne doar partea care privește cititorul: că funcțiile platformelor
 * terțe se pot schimba în timp.
 */

import type { VersusKey } from "./versus-culori";

/**
 * Ce scrie într-o celulă.
 *
 * `true` și `false` sunt bifa și semnul de „nu"; un șir e răspunsul care nu
 * încape în niciunul dintre ele. Trei stări, nu două, fiindcă PDF-ul are chiar
 * trei — „15 zile" față de „7 zile" nu e nici da, nici nu.
 */
export type ValoareVs = boolean | string;

export interface RandVs {
  criteriu: string;
  edinio: ValoareVs;
  rival: ValoareVs;
}

export interface TabelVs {
  /** Rândul de deschidere, cuvânt cu cuvânt din PDF. */
  intro: string;
  /** Capul coloanei din dreapta. ⚠ NU e întotdeauna numele scurt: la OpenCart și
      Magento scrie „Open Source", fiindcă aia e ediția comparată. */
  coloanaRival: string;
  randuri: RandVs[];
}

/** Ce înseamnă bifa și semnul de „nu", scris pe pagină sub tabel. */
export const LEGENDA_VS = {
  da: "inclus / disponibil direct în platformă",
  nu: "nu este inclus direct sau poate necesita aplicații, extensii, hosting separat ori configurări suplimentare, în funcție de platformă",
} as const;

/** Rândul de sub tabel. Partea din nota PDF-ului care privește cititorul. */
export const AVERTISMENT_VS =
  "Funcționalitățile platformelor terțe se pot modifica în timp.";

export const TABELE_VS: Record<VersusKey, TabelVs> = {
  shopify: {
    intro:
      "Punctul principal: integrarea cu piața și fluxurile locale din România.",
    coloanaRival: "Shopify",
    randuri: [
      { criteriu: "Construit special pentru piața din România", edinio: true, rival: false },
      { criteriu: "Hosting și infrastructură incluse", edinio: true, rival: true },
      { criteriu: "Mentenanța platformei gestionată automat", edinio: true, rival: true },
      { criteriu: "Curieri românești integrați direct", edinio: true, rival: false },
      { criteriu: "SmartBill / Oblio / FGO și fluxuri locale", edinio: true, rival: false },
      { criteriu: "Flux local AWB + factură + comandă", edinio: true, rival: false },
      { criteriu: "Necesită aplicații suplimentare pentru anumite fluxuri românești", edinio: false, rival: true },
      { criteriu: "Plăți online pentru România", edinio: true, rival: true },
      { criteriu: "Ecosistem global foarte mare de aplicații", edinio: "În dezvoltare", rival: true },
      { criteriu: "Platformă și suport construite în jurul comerciantului român", edinio: true, rival: false },
    ],
  },
  cartum: {
    intro:
      "Punctul principal: experiență și integrări construite în jurul comerciantului român.",
    coloanaRival: "Cartum",
    randuri: [
      { criteriu: "Construit special pentru România", edinio: true, rival: false },
      { criteriu: "Hosting inclus", edinio: true, rival: true },
      { criteriu: "Actualizări ale platformei incluse", edinio: true, rival: true },
      { criteriu: "Asistență pentru utilizarea platformei", edinio: true, rival: true },
      { criteriu: "Curieri românești conectați direct în platformă", edinio: true, rival: false },
      { criteriu: "Facturare românească integrată în ecosistem", edinio: true, rival: false },
      { criteriu: "Fluxuri construite în jurul pieței românești", edinio: true, rival: false },
      { criteriu: "Trial gratuit", edinio: "15 zile", rival: "7 zile" },
      { criteriu: "Integrări și configurări locale într-un singur panou", edinio: true, rival: false },
      { criteriu: "Platformă dezvoltată pornind de la nevoile comercianților români", edinio: true, rival: false },
    ],
  },
  wix: {
    intro:
      "Punctul principal: Edinio este eCommerce-first și construit pentru piața românească.",
    coloanaRival: "Wix",
    randuri: [
      { criteriu: "Platformă concentrată în primul rând pe eCommerce", edinio: true, rival: false },
      { criteriu: "Construită special pentru România", edinio: true, rival: false },
      { criteriu: "Hosting inclus", edinio: true, rival: true },
      { criteriu: "Mentenanța infrastructurii inclusă", edinio: true, rival: true },
      { criteriu: "Curieri românești integrați direct", edinio: true, rival: false },
      { criteriu: "SmartBill / Oblio / FGO", edinio: true, rival: false },
      { criteriu: "Flux AWB + factură + comandă pentru România", edinio: true, rival: false },
      { criteriu: "Procesatori de plată disponibili în România", edinio: true, rival: true },
      { criteriu: "Website-uri generale, portofolii, servicii etc.", edinio: "Focus eCommerce", rival: true },
      { criteriu: "Administrare construită în jurul produselor și comenzilor", edinio: true, rival: true },
      { criteriu: "Integrări locale fără căutarea unor soluții externe", edinio: true, rival: false },
    ],
  },
  woocommerce: {
    intro:
      "Punctul principal: fără WordPress, pluginuri, hosting și mentenanță administrate separat.",
    coloanaRival: "WooCommerce",
    randuri: [
      { criteriu: "Hosting inclus în platformă", edinio: true, rival: false },
      { criteriu: "Nu trebuie să administrezi WordPress", edinio: true, rival: false },
      { criteriu: "Update-urile platformei gestionate pentru tine", edinio: true, rival: false },
      { criteriu: "Mentenanță tehnică inclusă", edinio: true, rival: false },
      { criteriu: "Fără dependență de pluginuri pentru funcțiile principale Edinio", edinio: true, rival: false },
      { criteriu: "Curieri și facturare pentru România", edinio: true, rival: false },
      { criteriu: "Nu trebuie să verifici compatibilitatea dintre pluginuri", edinio: true, rival: false },
      { criteriu: "Asistență pentru configurarea platformei", edinio: true, rival: false },
      { criteriu: "Control complet asupra codului sursă", edinio: false, rival: true },
      { criteriu: "Posibilități de custom development", edinio: "Mai controlate", rival: true },
      { criteriu: "Infrastructură administrată central", edinio: true, rival: false },
    ],
  },
  opencart: {
    intro:
      "Comparație cu OpenCart Open Source. Punctul principal: mai puțină infrastructură și intervenție tehnică de administrat.",
    coloanaRival: "OpenCart Open Source",
    randuri: [
      { criteriu: "Hosting inclus", edinio: true, rival: false },
      { criteriu: "Mentenanță gestionată de platformă", edinio: true, rival: false },
      { criteriu: "Actualizări fără intervenția comerciantului", edinio: true, rival: false },
      { criteriu: "Construit special pentru România", edinio: true, rival: false },
      { criteriu: "Curieri și facturare românească direct integrate", edinio: true, rival: false },
      { criteriu: "Fără instalarea extensiilor pentru funcțiile principale", edinio: true, rival: false },
      { criteriu: "Administrarea infrastructurii tehnice", edinio: "Edinio", rival: "Comerciant / developer" },
      { criteriu: "Necesitatea unui developer pentru modificări avansate", edinio: "Redusă", rival: "Mai probabilă" },
      { criteriu: "Acces și control asupra codului sursă", edinio: false, rival: true },
      { criteriu: "Ecosistem mare de extensii", edinio: "În dezvoltare", rival: true },
      { criteriu: "Lansare fără configurarea unui server", edinio: true, rival: false },
    ],
  },
  magento: {
    intro:
      "Comparație cu Magento Open Source. Punctul principal: lansare și administrare mai simple pentru magazinele care nu au nevoie de complexitate enterprise.",
    coloanaRival: "Magento Open Source",
    randuri: [
      { criteriu: "Hosting inclus", edinio: true, rival: false },
      { criteriu: "Lansare fără configurarea infrastructurii", edinio: true, rival: false },
      { criteriu: "Mentenanță gestionată de furnizor", edinio: true, rival: false },
      { criteriu: "Actualizări gestionate automat pentru magazin", edinio: true, rival: false },
      { criteriu: "Construit special pentru piața românească", edinio: true, rival: false },
      { criteriu: "Curieri și facturare locală integrate", edinio: true, rival: false },
      { criteriu: "Necesită cunoștințe tehnice pentru administrare avansată", edinio: "Redus", rival: true },
      { criteriu: "Extensii / module pentru funcționalități suplimentare", edinio: "Mai puțin necesare", rival: true },
      { criteriu: "Control asupra codului sursă", edinio: false, rival: true },
      { criteriu: "Customizare tehnică foarte avansată", edinio: "Limitată de platformă", rival: true },
      { criteriu: "Potrivit pentru lansarea rapidă a unui magazin mic/mediu", edinio: true, rival: "Mai complex" },
      { criteriu: "Potrivit pentru proiecte foarte complexe / custom", edinio: "Depinde", rival: true },
    ],
  },
};
